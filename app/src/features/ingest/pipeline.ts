/**
 * The ingestion pipeline: stages S0-S8 of `04` section 7, executed as a Postgres-backed job (D60).
 *
 * The shape of a run, and the reason for each boundary:
 *
 * ```text
 *   S0 accept          the upload route already stored the bytes; nothing to do here
 *   S1 validate        at least one source; unsupported formats were refused at upload
 *   S2 store original  done at upload (storage_key, content_hash)
 *   S3 extract         per source, only when the source has no chunks yet
 *   S4 normalise       NFC, whitespace, de-hyphenation -- never a re-wording
 *   S5 chunk + index   page-anchored, deterministic, idempotent on (source_id, chunk_index)
 *   S6 analyst         five model calls, outside any transaction
 *   S7 schema validate a failed pass is a refusal, and is reported rather than retried (D16)
 *   S8 persist         one transaction: artifacts + the job's terminal state + the audit row
 * ```
 *
 * **Why the model calls are outside the transaction.** S6 makes up to five provider calls, each with
 * a multi-second timeout. Holding a Postgres transaction open across them would pin a connection for
 * the duration of the slowest document and make a retry of a *stage* indistinguishable from a
 * rollback of the whole run. The durable state between the two is the `source_chunks` rows: they are
 * written by S5, they are immutable, and a re-run reads them back instead of re-extracting.
 *
 * **What "failed" means.** A run fails when it cannot produce anything usable: no sources, an
 * unreadable document set, or both the structure and the milestone passes refusing. A single pass
 * that fails is recorded -- on the job and in the audit row -- and the run continues, because four
 * good passes are worth more to a tutor than none, and the failures are visible rather than implied.
 *
 * Nothing here writes to `analytics_events`: analytics are written at the point of the event by the
 * feature that owns it (trap T7), and an ingestion run is not a student event.
 */

import { randomUUID } from 'node:crypto';

import { extractDocument } from '@/lib/extract';
import type { LlmCallLog, LlmProvider } from '@/lib/llm/types';
import type { AppConfig } from '@/lib/config';
import type { StorageDriver } from '@/lib/storage';
import type { Executor } from '@/lib/db/queries/courses';
import {
  countChunksForSource,
  countSources,
  listSources,
  listT1Chunks,
  markAssignmentDraft,
  markAssignmentInReview,
  markAssignmentIngesting,
  insertSourceChunkIfAbsent,
  readStructureState,
  setCurrentStructure,
  updateSourceExtraction,
  type AssignmentSourceSummary,
  type T1Chunk,
} from '@/lib/db/queries/assignments';
import { insertAuditLog } from '@/lib/db/queries/audit';
import {
  advanceJob,
  failJob,
  startJob,
  succeedJob,
  type IngestionStage,
} from '@/lib/db/queries/ingestions';
import {
  insertAiPolicyRuleIfAbsent,
  insertAmbiguityFindingIfAbsent,
  insertChecklistItemIfAbsent,
  insertMilestoneIfAbsent,
  insertMilestoneRequirementLinkIfAbsent,
  insertRequirementNodeIfAbsent,
  insertRubricSectionIfAbsent,
  insertStructureIfAbsent,
  listApprovedMilestones,
  listApprovedPolicyRules,
  promoteStructureToNeedsReview,
} from '@/lib/db/queries/structure';
import { insertFaqEntryIfAbsent } from '@/lib/db/queries/questions';
import { withTransaction } from '@/lib/db/transaction';

import { runAnalyst, extractAttachment, type AnalystProposal } from './analyst';
import { chunkPages, normalisePageText, type NormalisedPage } from './chunk';

/** Text-like source MIME types, mirroring `src/lib/extract`'s supported set. */
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown']);

/** The warning text for a PDF with no text layer (`04` section 13 item 2). */
const NO_TEXT_LAYER_MESSAGE =
  'This PDF has no text layer. It needs the tutor to replace it with a text-based PDF, because a scan cannot be quoted verbatim.';

export interface IngestionRunInput {
  readonly assignmentId: string;
  readonly jobId: string;
  readonly requestedByUserId: string;
  readonly client: LlmProvider;
  readonly storage: StorageDriver;
  readonly config: AppConfig;
  /** The `x-request-id` of the request that enqueued the run, for the audit row. */
  readonly requestId: string | null;
  /**
   * Milliseconds between Analyst passes. Zero by default; a caller sets it when the provider's rate
   * limit is low enough that five back-to-back calls are refused (see `AnalystInput.paceMs`).
   */
  readonly paceMs?: number;
  readonly now?: () => Date;
  readonly onCall?: (log: LlmCallLog) => void;
}

/**
 * The artifact counts a run produced.
 *
 * Mutable during `persistProposal`, then frozen into `IngestionRunResult` -- the pipeline's counters
 * are written from inside a transaction body, so a `readonly` shape here would be a type error rather
 * than a safety property.
 */
export interface IngestionCounts {
  sources: number;
  chunks: number;
  requirements: number;
  rubricSections: number;
  milestones: number;
  checklistItems: number;
  faqEntries: number;
  policyRules: number;
  findings: number;
}

export interface IngestionRunResult {
  readonly ok: boolean;
  readonly jobId: string;
  readonly structureId: string | null;
  readonly errorCode: string | null;
  readonly counts: IngestionCounts;
  readonly notes: readonly string[];
}

/**
 * Run one ingestion job to completion.
 *
 * Never throws for a pipeline-level failure: it records the failure on the job and returns
 * `ok: false`. It throws only when the *caller* is wrong (an assignment id with no sources is a
 * reported failure, but a database that refuses the connection is not something the job row can
 * describe). The route treats a thrown error as an unhandled failure and the polling screen shows
 * the job as failed only if `failJob` succeeded.
 */
export async function runIngestion(input: IngestionRunInput): Promise<IngestionRunResult> {
  const counts = {
    sources: 0,
    chunks: 0,
    requirements: 0,
    rubricSections: 0,
    milestones: 0,
    checklistItems: 0,
    faqEntries: 0,
    policyRules: 0,
    findings: 0,
  };
  const notes: string[] = [];

  await withTransaction(async (tx) => {
    await startJob(tx, input.jobId, 'S0');
    await markAssignmentIngesting(tx, input.assignmentId);
  });

  try {
    // ---- S0/S1: accept and validate -----------------------------------------------------------
    const sources = await withTransaction((tx) => listSources(tx, input.assignmentId));
    if (sources.length === 0) {
      return await fail(input, 'NO_SOURCES', 'This assignment has no source documents yet.', counts, notes);
    }
    counts.sources = sources.length;
    await withTransaction((tx) => advanceJob(tx, input.jobId, { completedStage: 'S1', nextStage: 'S2' }));

    // ---- S2/S3/S4/S5: store (done), extract, normalise, chunk ---------------------------------
    for (const source of sources) {
      try {
        const chunked = await ensureChunks(input, source, notes);
        counts.chunks += chunked;
      } catch (error) {
        const message = safeExtractionMessage(error);
        await withTransaction(async (tx) => {
          await updateSourceExtraction(tx, {
            sourceId: source.id,
            status: 'failed',
            pageCount: source.pageCount,
            extractionError: message.slice(0, 500),
          });
        });
        notes.push(`source ${source.kind} could not be read: ${message}`);
      }
    }
    await withTransaction((tx) => advanceJob(tx, input.jobId, { completedStage: 'S5', nextStage: 'S6' }));

    // ---- S6: the Analyst, five passes, outside any transaction --------------------------------
    const chunks = await withTransaction((tx) => listT1Chunks(tx, input.assignmentId));
    if (chunks.length === 0) {
      return await fail(
        input,
        'NO_CHUNKS',
        'None of the source documents produced any readable text, so there is nothing to analyse.',
        counts,
        notes,
      );
    }
    const approved = await withTransaction(async (tx) => ({
      policyRules: await listApprovedPolicyRules(tx, input.assignmentId),
      milestones: await listApprovedMilestones(tx, input.assignmentId),
    }));
    const proposal = await runAnalyst({
      assignmentId: input.assignmentId,
      chunks,
      approved: {
        policyRules: approved.policyRules.map((rule) => ({
          ruleCode: rule.ruleCode,
          ruleText: rule.ruleText,
        })),
        milestoneTitles: approved.milestones.map((milestone) => milestone.title),
      },
      modelId: resolveAnalystModelId(input.config),
      sessionId: input.jobId,
      client: input.client,
      paceMs: input.paceMs,
      onCall: input.onCall,
    });
    notes.push(...proposal.notes);

    // ---- S7: does the run have anything usable? -----------------------------------------------
    const failedPasses = new Set(proposal.failures.map((failure) => failure.pass));
    if (failedPasses.has('structure') && failedPasses.has('milestones')) {
      return await fail(
        input,
        'LLM_OUTPUT_INVALID',
        'The model did not return a usable structure for these documents. No artifact was saved.',
        counts,
        notes,
      );
    }
    for (const failure of proposal.failures) {
      notes.push(`the ${failure.pass} pass returned output that failed validation and was discarded`);
    }
    // S7 is the last stage `06` section 5.5.8's enum carries; persistence is the transition to
    // `succeeded`, not a ninth stage.
    await withTransaction((tx) => advanceJob(tx, input.jobId, { completedStage: 'S7', nextStage: null }));

    // ---- S8: persist, promote and close out in one transaction --------------------------------
    const structureId = await withTransaction((tx) =>
      persistProposal(tx, proposal, {
        assignmentId: input.assignmentId,
        requestId: input.requestId,
        counts,
      }),
    );

    await withTransaction(async (tx) => {
      await succeedJob(tx, input.jobId);
      await markAssignmentInReview(tx, input.assignmentId);
      await insertAuditLog(tx, {
        id: randomUUID(),
        actorUserId: input.requestedByUserId,
        actorRole: 'tutor',
        action: 'ingestion.completed',
        targetTable: 'assignments',
        targetId: input.assignmentId,
        before: null,
        // Counts, stage names and notes only. No document text, no student content (06 section 7.6.5).
        after: { jobId: input.jobId, structureId, counts, notes },
        requestId: input.requestId,
      });
    });

    return { ok: true, jobId: input.jobId, structureId, errorCode: null, counts, notes };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'the ingestion run failed';
    return await fail(input, 'INGESTION_FAILED', message, counts, notes);
  }
}

/** Record the failure and hand back a result. Never throws for a pipeline problem. */
async function fail(
  input: IngestionRunInput,
  errorCode: string,
  errorMessage: string,
  counts: IngestionRunResult['counts'],
  notes: readonly string[],
): Promise<IngestionRunResult> {
  await withTransaction(async (tx) => {
    await failJob(tx, input.jobId, { errorCode, errorMessage });
  });
  await withTransaction((tx) => markAssignmentDraft(tx, input.assignmentId));
  return { ok: false, jobId: input.jobId, structureId: null, errorCode, counts, notes: [...notes, errorMessage] };
}

/**
 * S3-S5 for one source: extract, normalise, chunk. Returns how many chunks this call added.
 *
 * The skip condition is "this source already has chunks", not "extraction_status says extracted".
 * The two differ after a crash between extraction and chunking, and only the chunk count is evidence
 * that the work is done.
 */
async function ensureChunks(
  input: IngestionRunInput,
  source: AssignmentSourceSummary,
  notes: string[],
): Promise<number> {
  const existing = await withTransaction((tx) => countChunksForSource(tx, source.id));
  if (existing > 0) return 0;

  await withTransaction(async (tx) => {
    await updateSourceExtraction(tx, {
      sourceId: source.id,
      status: 'extracting',
      pageCount: source.pageCount,
      extractionError: null,
    });
  });

  const { bytes } = await input.storage.get(source.storageKey);

  if (IMAGE_MIME_TYPES.has(source.mimeType)) {
    // An image has no text layer to quote, so the only route is the multimodal adapter call. Its
    // capability is `attachment_extraction`, whose output is transcription and never generation
    // (D68); the call is billed against its own budget scope, never the run's.
    const extracted = await extractAttachment({
      client: input.client,
      modelId: resolveMultimodalModelId(input.config),
      systemPrefixId: 'attachment_extraction-v1',
      mimeType: source.mimeType,
      dataBase64: Buffer.from(bytes).toString('base64'),
      partType: 'image',
      scopeKey: `source:${source.id}`,
      onCall: input.onCall,
    });
    const text = extracted === null ? '' : extracted.text;
    if (text.trim() === '') {
      await withTransaction(async (tx) => {
        await updateSourceExtraction(tx, {
          sourceId: source.id,
          status: 'failed',
          pageCount: null,
          extractionError: 'No readable text was found in this image.',
        });
      });
      notes.push('an image source produced no readable text');
      return 0;
    }
    return await writeChunks(input, source, [{ page: 1, text }], false, notes);
  }

  if (TEXT_MIME_TYPES.has(source.mimeType)) {
    const result = await extractDocument({ bytes, mimeType: source.mimeType });
    return await writeChunks(
      input,
      source,
      [{ page: 1, text: result.text }],
      false,
      notes,
    );
  }

  // `Uint8Array.from` copies, and the copy is load-bearing: `pdfjs` transfers (detaches) the buffer
  // it is handed, so a retry that re-used the same array would fail with a detached-ArrayBuffer
  // error that looks like a corrupt PDF. Recorded as trap T22.
  const result = await extractDocument({ bytes: Uint8Array.from(bytes), mimeType: source.mimeType });
  if (!result.hasTextLayer) {
    await withTransaction(async (tx) => {
      await updateSourceExtraction(tx, {
        sourceId: source.id,
        status: 'failed',
        pageCount: result.pageCount,
        extractionError: NO_TEXT_LAYER_MESSAGE,
      });
    });
    notes.push(`source ${source.kind} has no text layer and was flagged for the tutor`);
    return 0;
  }
  return await writeChunks(input, source, result.pages, result.pageCount !== null, notes);
}

/** S4 then S5, then persist the chunks. Returns the number of rows actually inserted. */
async function writeChunks(
  input: IngestionRunInput,
  source: AssignmentSourceSummary,
  pages: ReadonlyArray<{ readonly page: number; readonly text: string }>,
  pageAnchors: boolean,
  notes: string[],
): Promise<number> {
  const normalised: NormalisedPage[] = pages
    .map((page) => ({ page: page.page, text: normalisePageText(page.text) }))
    .filter((page) => page.text !== '');
  if (normalised.length === 0) {
    await withTransaction(async (tx) => {
      await updateSourceExtraction(tx, {
        sourceId: source.id,
        status: 'failed',
        pageCount: source.pageCount,
        extractionError: 'The document contained no readable text after normalisation.',
      });
    });
    return 0;
  }

  const candidates = chunkPages(normalised, { pageAnchors });
  let inserted = 0;
  await withTransaction(async (tx) => {
    for (const candidate of candidates) {
      const created = await insertSourceChunkIfAbsent(tx, {
        id: randomUUID(),
        assignmentId: input.assignmentId,
        sourceId: source.id,
        chunkIndex: candidate.chunkIndex,
        text: candidate.text,
        pageFrom: candidate.pageFrom,
        pageTo: candidate.pageTo,
        sectionLabel: candidate.sectionLabel,
        charCount: candidate.charCount,
      });
      if (created) inserted += 1;
    }
    await updateSourceExtraction(tx, {
      sourceId: source.id,
      status: 'extracted',
      pageCount: pageAnchors ? (pages.length === 0 ? null : normalised.length) : null,
      extractionError: null,
    });
  });
  notes.push(`${String(inserted)} chunks written for the ${source.kind} source`);
  return inserted;
}

/**
 * S7/S8: write the proposal, promote it to `NEEDS_REVIEW` and make the structure current.
 *
 * Every artifact is inserted with `publication_status = 'AI_GENERATED'` and a provenance object, then
 * promoted in the same transaction (transition 1, `06` section 3.2). Nothing is student-visible: only
 * `APPROVED -> PUBLISHED` is (D21).
 *
 * Ungrounded candidates are skipped here rather than written with a null citation: `source_chunk_id`
 * is NOT NULL on `requirement_nodes` and `rubric_sections`, so a candidate whose citation did not
 * resolve has no valid row to be written into. The count of skipped candidates is in the run's notes.
 */
async function persistProposal(
  tx: Executor,
  proposal: AnalystProposal,
  context: {
    readonly assignmentId: string;
    readonly requestId: string | null;
    counts: IngestionRunResult['counts'];
  },
): Promise<string> {
  const { assignmentId } = context;
  const state = await readStructureState(tx, assignmentId);
  const structureId = randomUUID();
  const groundingChunkIds = collectGrounding(proposal);

  await insertStructureIfAbsent(tx, {
    id: structureId,
    assignmentId,
    version: state.maxVersion + 1,
    isCurrent: true,
    origin: 'ai',
    provenance: provenanceOf(proposal, groundingChunkIds),
    groundingChunkIds,
    stamp: aiGeneratedStamp(),
  });

  // Requirements first: the milestone links point at the ids this produces.
  const requirementIds: string[] = [];
  let order = 0;
  for (const entry of proposal.requirements) {
    if (entry.chunk === null) continue;
    const id = randomUUID();
    const created = await insertRequirementNodeIfAbsent(tx, {
      id,
      assignmentId,
      structureId,
      origin: 'ai',
      provenance: provenanceOf(proposal, [entry.chunk.id]),
      groundingChunkIds: [entry.chunk.id],
      stamp: aiGeneratedStamp(),
      parentRequirementNodeId: null,
      title: entry.candidate.title,
      verbatimText: entry.candidate.verbatimText,
      sourceChunkId: entry.chunk.id,
      sourcePage: entry.candidate.sourcePage ?? entry.chunk.pageFrom,
      sourceSectionLabel: entry.candidate.sourceSectionLabel ?? entry.chunk.sectionLabel,
      mapSummary: entry.candidate.mapSummary,
      displayOrder: order,
    });
    order += 1;
    if (created) {
      requirementIds.push(id);
      context.counts.requirements += 1;
    }
  }

  order = 0;
  for (const entry of proposal.rubricSections) {
    if (entry.chunk === null) continue;
    const created = await insertRubricSectionIfAbsent(tx, {
      id: randomUUID(),
      assignmentId,
      structureId,
      origin: 'ai',
      provenance: provenanceOf(proposal, [entry.chunk.id]),
      groundingChunkIds: [entry.chunk.id],
      stamp: aiGeneratedStamp(),
      sourceChunkId: entry.chunk.id,
      sectionLabel: entry.candidate.sectionLabel,
      criteriaText: entry.candidate.criteriaText,
      weightPercent: entry.candidate.weightPercent,
      pageFrom: entry.candidate.pageFrom ?? entry.chunk.pageFrom,
      pageTo: entry.candidate.pageTo ?? entry.chunk.pageTo,
      mapInterpretation: entry.candidate.mapInterpretation,
      displayOrder: order,
    });
    order += 1;
    if (created) context.counts.rubricSections += 1;
  }

  order = 0;
  for (const milestone of proposal.milestones) {
    const milestoneId = randomUUID();
    const created = await insertMilestoneIfAbsent(tx, {
      id: milestoneId,
      assignmentId,
      structureId,
      origin: 'ai',
      provenance: provenanceOf(proposal, milestone.groundingChunkIds),
      groundingChunkIds: milestone.groundingChunkIds,
      stamp: aiGeneratedStamp(),
      title: milestone.candidate.title,
      summary: milestone.candidate.summary,
      displayOrder: order,
    });
    order += 1;
    if (!created) continue;
    context.counts.milestones += 1;

    for (const index of milestone.requirementIndexes) {
      const requirementId = requirementIds[index];
      if (requirementId === undefined) continue;
      await insertMilestoneRequirementLinkIfAbsent(tx, {
        id: randomUUID(),
        assignmentId,
        requirementNodeId: requirementId,
        milestoneId,
        // null means AI-proposed (06 section 7.2.8). A tutor link is Phase 4's action.
        createdByUserId: null,
      });
    }

    let itemOrder = 0;
    for (const item of milestone.items) {
      const itemCreated = await insertChecklistItemIfAbsent(tx, {
        id: randomUUID(),
        assignmentId,
        structureId,
        origin: 'ai',
        provenance: provenanceOf(proposal, milestone.groundingChunkIds),
        groundingChunkIds: milestone.groundingChunkIds,
        stamp: aiGeneratedStamp(),
        milestoneId,
        title: item.candidate.title,
        planningLevel: item.planningLevel as 'understand' | 'identify' | 'plan' | 'verify' | 'review' | 'note',
        description: item.candidate.description,
        displayOrder: itemOrder,
      });
      itemOrder += 1;
      if (itemCreated) context.counts.checklistItems += 1;
    }
  }

  const faqEntryIds: string[] = [];
  let faqOrder = 0;
  for (const entry of proposal.faqEntries) {
    const id = randomUUID();
    const created = await insertFaqEntryIfAbsent(tx, {
      id,
      assignmentId,
      milestoneId: null,
      question: entry.candidate.question,
      answer: entry.candidate.answer,
      // `06` section 7.4.4: this is an AI candidate, published only by a tutor (D24).
      sourceKind: 'ai_candidate',
      sourceQueryId: null,
      sourceQueryMessageId: null,
      publishedByUserId: null,
      displayOrder: faqOrder,
      publicationStatus: 'AI_GENERATED',
      origin: 'ai',
      provenance: provenanceOf(proposal, entry.chunk === null ? [] : [entry.chunk.id]),
      groundingChunkIds: entry.chunk === null ? [] : [entry.chunk.id],
      approvedByUserId: null,
      approvedAt: null,
      publishedAt: null,
    });
    faqOrder += 1;
    if (created) {
      faqEntryIds.push(id);
      context.counts.faqEntries += 1;
    }
  }

  order = 0;
  for (const entry of proposal.policyRules) {
    const created = await insertAiPolicyRuleIfAbsent(tx, {
      id: randomUUID(),
      assignmentId,
      structureId,
      origin: 'ai',
      provenance: provenanceOf(proposal, entry.chunk === null ? [] : [entry.chunk.id]),
      groundingChunkIds: entry.chunk === null ? [] : [entry.chunk.id],
      stamp: aiGeneratedStamp(),
      ruleCode: entry.candidate.ruleCode,
      ruleText: entry.candidate.ruleText,
      effect: entry.candidate.effect,
      appliesTo: entry.candidate.appliesTo,
      sourceChunkId: entry.chunk === null ? null : entry.chunk.id,
      displayOrder: order,
    });
    order += 1;
    if (created) context.counts.policyRules += 1;
  }

  for (const finding of proposal.findings) {
    const created = await insertAmbiguityFindingIfAbsent(tx, {
      id: randomUUID(),
      assignmentId,
      structureId,
      sourceId: finding.chunk === null ? null : finding.chunk.sourceId,
      kind: finding.candidate.kind,
      severity: finding.candidate.severity,
      title: finding.candidate.title,
      description: finding.candidate.description,
      locatedPage: finding.candidate.locatedPage ?? finding.chunk?.pageFrom ?? null,
      locatedSectionLabel: finding.candidate.locatedSectionLabel ?? finding.chunk?.sectionLabel ?? null,
      excerptA: finding.candidate.excerptA,
      excerptB: finding.candidate.excerptB,
      sourceChunkIds: finding.sourceChunkIds,
      status: 'open',
      origin: 'ai',
      provenance: provenanceOf(proposal, finding.sourceChunkIds),
    });
    if (created) context.counts.findings += 1;
  }

  await promoteStructureToNeedsReview(tx, { structureId, faqEntryIds });
  await setCurrentStructure(tx, assignmentId, structureId);
  return structureId;
}

function aiGeneratedStamp() {
  return {
    publicationStatus: 'AI_GENERATED' as const,
    approvedByUserId: null,
    approvedAt: null,
    publishedAt: null,
  };
}

function provenanceOf(proposal: AnalystProposal, groundingChunkIds: readonly string[]) {
  return {
    modelId: proposal.modelId,
    promptVersion: proposal.promptVersion,
    generatedAt: proposal.generatedAt,
    groundingChunkIds: [...groundingChunkIds],
  };
}

function collectGrounding(proposal: AnalystProposal): string[] {
  const ids = new Set<string>();
  for (const entry of proposal.requirements) if (entry.chunk !== null) ids.add(entry.chunk.id);
  for (const entry of proposal.rubricSections) if (entry.chunk !== null) ids.add(entry.chunk.id);
  for (const entry of proposal.faqEntries) if (entry.chunk !== null) ids.add(entry.chunk.id);
  for (const entry of proposal.policyRules) if (entry.chunk !== null) ids.add(entry.chunk.id);
  for (const entry of proposal.findings) for (const id of entry.sourceChunkIds) ids.add(id);
  return [...ids];
}

/**
 * The model id a capability that reasons over text uses.
 *
 * `04` section 5.3: "Model ids are never invented or composed ... the id string comes from
 * `LLM_MODEL_REASONING` (or `LLM_MODEL_MULTIMODAL` when set) and is passed through unchanged."
 */
export function resolveAnalystModelId(config: AppConfig): string {
  return config.llmModelMultimodal ?? config.llmModelReasoning ?? 'mock';
}

/** The id the attachment rule resolves for an image (`04` section 5.3). */
export function resolveMultimodalModelId(config: AppConfig): string {
  return config.llmModelMultimodal ?? config.llmModelReasoning ?? 'mock';
}

/**
 * A tutor-safe sentence for a failed extraction.
 *
 * Never a stack trace and never the driver's own words: `assignment_sources.extraction_error` is
 * rendered to a tutor (`06` section 7.2.2), and an unrecognised error could otherwise carry a file
 * path or a fragment of the document.
 */
function safeExtractionMessage(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'UNSUPPORTED_FORMAT') return 'This file type is not supported.';
    if (code === 'CORRUPT_DOCUMENT') return 'This document could not be read; it may be damaged.';
    if (code === 'EMPTY_DOCUMENT') return 'This document contains no readable text.';
  }
  if (error instanceof Error && error.name === 'LlmError') {
    return 'The document could not be read by the model service.';
  }
  return 'This document could not be read.';
}

/** The stage names, in order, for a caller that wants to log progress. */
export const INGESTION_STAGES: readonly IngestionStage[] = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];

/** How many active sources the assignment has, for the route's pre-flight. */
export async function countActiveSources(input: {
  readonly assignmentId: string;
}): Promise<number> {
  return withTransaction((tx) => countSources(tx, input.assignmentId));
}

/** The T1 chunks of an assignment, exposed for the offline capture script and for tests. */
export async function readT1Chunks(assignmentId: string): Promise<T1Chunk[]> {
  return withTransaction((tx) => listT1Chunks(tx, assignmentId));
}
