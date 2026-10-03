/**
 * The Assignment Analyst: five passes, each independently callable, validated and grounded.
 *
 * `04` section 7 stage S6 specifies five separate passes rather than one mega-prompt, and this module
 * is that specification in code. Each pass:
 *
 * 1. selects its grounding chunks from the same ordered list (so two passes cannot disagree about
 *    what `[#3]` means);
 * 2. assembles blocks A-D through `src/lib/llm/prompt.ts`, so the cache-stable prefix is built in
 *    one place;
 * 3. calls the provider through the adapter -- never a vendor SDK (C8, D39);
 * 4. validates with `parseStructured`, where **a schema failure is a refusal, not a retry** (D16);
 * 5. resolves every `sourceChunkRef` index back to the `source_chunks.id` it actually sent, and
 *    refuses to persist an artifact whose citation does not resolve.
 *
 * The one thing that is deliberately *not* here: persistence. Stage S7/S8 belong to `pipeline.ts`,
 * because a pass that persisted its own output could leave half a structure behind when the next
 * pass fails. `runAnalyst` returns a proposal; `persistProposal` writes it in one transaction.
 *
 * Grounding resolution is the load-bearing step. `verbatimText`, `criteriaText` and the ambiguity
 * excerpts are re-checked against the chunk they cite with `isVerbatimSubstring` (I-2, C2). A failed
 * check does not silently drop the artifact -- the tutor must see what the model tried to claim --
 * but the warning travels with it and blocks approval (`06` section 5.5.8).
 */

import { toResponseFormat, parseStructured, type AmbiguityFindingCandidate, type AttachmentExtraction, type ChecklistItemCandidate, type FaqCandidate, type MilestoneCandidate, type PolicyRuleCandidate, type RequirementCandidate, type RubricSectionCandidate } from '@/lib/llm/schema';
import {
  STRUCTURED_SCHEMAS,
  ambiguityPassSchema,
  attachmentExtractionSchema,
  faqPassSchema,
  milestonesPassSchema,
  policyPassSchema,
  structurePassSchema,
} from '@/lib/llm/schema';
import { assembleMessages, renderGroundingChunks, type GroundingChunk } from '@/lib/llm/prompt';
import { LlmError, type LlmCallLog, type LlmProvider, type LlmRequest } from '@/lib/llm/types';

import type { T1Chunk } from '@/lib/db/queries/assignments';

import {
  ANALYST_CAPABILITY,
  ANALYST_PROMPT_VERSION,
  PASS_PREFIX_IDS,
  PASS_SCHEMA_NAMES,
  STATIC_PLATFORM_BLOCK,
  passInstruction,
  policyBlock,
  type AnalystPass,
  type ApprovedContext,
} from './prompts/analyst.v1';
import {
  UNGROUNDED_ARTIFACT,
  checkChecklistItem,
  findOverlappingRequirements,
  isVerbatimSubstring,
  weightAppearsInText,
  type IngestWarning,
} from './prompt-constraints';

/**
 * How many chunks one pass may be given, and how many characters.
 *
 * Both caps are recorded in the run's notes rather than applied silently: a structure proposed from
 * a truncated document is a structure proposed from an incomplete document, and the tutor has to be
 * able to see that. The character cap is far below the model's window on purpose (`04` section 5.3:
 * "A 1M window is not a licence to send everything").
 */
export const MAX_GROUNDING_CHUNKS = 40;
export const MAX_GROUNDING_CHARS = 60_000;

/** One grounded artifact: the candidate plus the chunk it resolved to. */
export interface Grounded<T> {
  readonly candidate: T;
  readonly chunk: T1Chunk | null;
  readonly warnings: readonly IngestWarning[];
}

export interface ResolvedChecklistItem {
  readonly candidate: ChecklistItemCandidate;
  /** The level implied by the item's own wording; overrides the model's declared value. */
  readonly planningLevel: string;
  readonly warnings: readonly IngestWarning[];
}

export interface ResolvedMilestone {
  readonly candidate: MilestoneCandidate;
  /** Indices into `AnalystProposal.requirements` (the kept ones). */
  readonly requirementIndexes: readonly number[];
  readonly groundingChunkIds: readonly string[];
  readonly items: readonly ResolvedChecklistItem[];
  readonly warnings: readonly IngestWarning[];
}

export interface PassFailure {
  readonly pass: AnalystPass;
  readonly issues: readonly string[];
}

export interface AnalystProposal {
  readonly assignmentId: string;
  readonly promptVersion: string;
  readonly modelId: string;
  readonly generatedAt: string;
  readonly requirements: readonly Grounded<RequirementCandidate>[];
  readonly rubricSections: readonly Grounded<RubricSectionCandidate>[];
  readonly milestones: readonly ResolvedMilestone[];
  readonly faqEntries: readonly Grounded<FaqCandidate>[];
  readonly policyRules: readonly Grounded<PolicyRuleCandidate>[];
  readonly findings: ReadonlyArray<Grounded<AmbiguityFindingCandidate> & { readonly sourceChunkIds: readonly string[] }>;
  /** Passes whose schema validation failed. A failure is a refusal, and the run reports it. */
  readonly failures: readonly PassFailure[];
  readonly callLogs: readonly LlmCallLog[];
  /** Facts the tutor should know about this run: truncation, dropped citations, rejected items. */
  readonly notes: readonly string[];
}

export interface AnalystInput {
  readonly assignmentId: string;
  readonly chunks: readonly T1Chunk[];
  readonly approved: ApprovedContext;
  readonly modelId: string;
  /** The budget unit for every pass: one ingestion run (`04` section 5.2). */
  readonly sessionId: string;
  readonly client: LlmProvider;
  readonly now?: () => Date;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
  /**
   * The requirement titles the milestone pass may link to, rendered as `R0. ...` lines.
   *
   * Optional because only four of the five passes need it; when it is absent the milestone pass is
   * told there are none, which is what makes an unlinked milestone a reportable publish blocker
   * rather than an invention.
   */
  readonly requirementTitles?: readonly string[];
  /**
   * Milliseconds to wait between passes.
   *
   * Zero by default. Non-zero exists for one measured reason: the Gemini free tier allows a small
   * number of requests per minute, and five passes issued back to back are refused with `429` even
   * with the one allowed retry (`04` section 5.7). Pacing is a caller's decision, so it is an option
   * here rather than a hidden sleep in the adapter -- an unexplained delay in a production path is a
   * worse defect than a rate limit.
   */
  readonly paceMs?: number;
  /** Injectable so a test can drive one pass, or all five, without a provider. */
  readonly onCall?: (log: LlmCallLog) => void;
}

/** A pass's request, exposed so a test (and the mock-capture script) can inspect it without calling. */
export function buildAnalystRequest(input: {
  assignmentId: string;
  pass: AnalystPass;
  chunks: readonly T1Chunk[];
  approved: ApprovedContext;
  modelId: string;
  sessionId: string;
  requirementTitles?: readonly string[];
  maxOutputTokens?: number;
  timeoutMs?: number;
}): LlmRequest {
  const selected = selectGrounding(input.chunks);
  const grounding = renderGroundingChunks(selected.map(toGroundingChunk));
  const variable = passInstruction(input.pass, {
    requirementTitles: input.requirementTitles,
  });
  return {
    capability: ANALYST_CAPABILITY,
    modelId: input.modelId,
    systemPrefixId: PASS_PREFIX_IDS[input.pass],
    messages: assembleMessages({
      systemPrefixId: PASS_PREFIX_IDS[input.pass],
      staticPlatform: STATIC_PLATFORM_BLOCK,
      staticPolicy: policyBlock(input.approved),
      grounding,
      variable,
    }),
    responseFormat: toResponseFormat(schemaNameFor(input.pass), schemaFor(input.pass)),
    // Every classifying capability runs at temperature 0 (`04` section 5.2).
    temperature: 0,
    maxOutputTokens: input.maxOutputTokens ?? ANALYST_DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: input.timeoutMs ?? 120_000,
    sessionId: input.sessionId,
  };
}

/**
 * The output ceiling for one Analyst pass.
 *
 * **Why it is 65536 and not 8192.** The previous default was 8192, and on the real demo fixture that
 * truncated the response: **thinking tokens are billed as output** (D73, D89), so at
 * `LLM_THINKING_ANALYST=high` (D62) the thinking alone consumed the ceiling and the JSON body was cut
 * mid-string. The adapter then reported `LLM_OUTPUT_INVALID` with the note "the model did not return a
 * usable structure", which reads like a schema or prompt defect and is not one.
 *
 * Measured live on 2026-10-04 against the demo fixture (24 chunks, 17,484 grounding characters), one
 * structure pass each time:
 *
 * | `maxOutputTokens` | thinking | `finishReason` | output tokens | JSON parsed | zod passed |
 * |---|---|---|---|---|---|
 * | 8,192 | high | `content_filter` (cut) | 8,178 | no (truncated) | n/a |
 * | 32,768 | high | `content_filter` (cut) | 32,754 | no (truncated) | n/a |
 * | 65,536 | high | `stop` | 41,555 / 43,258 | **yes** | **yes** |
 * | 32,768 | low | `stop` | 2,378 | **yes** | yes |
 *
 * So the pass needs a ceiling that fits thinking *and* body, which only the model's own output limit
 * (65,536 tokens, D62) reliably does at `high`. The alternative -- lowering
 * `LLM_THINKING_ANALYST` -- works and costs roughly 17x fewer output tokens, but it is D62's
 * decision to make, not this module's, so the ceiling is raised here and the trade is recorded.
 *
 * A ceiling is a maximum, not a charge: the 8,192 default produced *nothing* for 8,178 tokens, while
 * the same pass at 65,536 produces a proposal for about 43,000. At the demo model's price that is
 * roughly 0.03 AUD per pass and therefore roughly 0.15 AUD per five-pass ingestion run, which the
 * 5 AUD monthly provider cap (I-36) bounds hard.
 */
export const ANALYST_DEFAULT_MAX_OUTPUT_TOKENS = 65_536;

/**
 * Run all five passes and resolve their output.
 *
 * A missing document is not an exception: it is an empty grounding set, which the provider is told
 * about explicitly, and which the mock answers honestly. What must not happen is a pass quietly
 * answering from general knowledge (`04` section 6.4) -- the prompt says the documents are empty, and
 * a schema-valid answer is still checked against the chunks it cites, so an ungrounded claim fails
 * the substring test rather than reaching a student.
 */
export async function runAnalyst(input: AnalystInput): Promise<AnalystProposal> {
  const now = input.now ?? ((): Date => new Date());
  const callLogs: LlmCallLog[] = [];
  const notes: string[] = [];
  const failures: PassFailure[] = [];

  const selected = selectGrounding(input.chunks);
  if (selected.length < input.chunks.length) {
    notes.push(
      `grounding was truncated: ${String(selected.length)} of ${String(input.chunks.length)} chunks were sent to the Analyst`,
    );
  }

  const client = wrapClient(input.client, callLogs, input.onCall);
  const pace = input.paceMs ?? 0;
  const betweenPasses = async (): Promise<void> => {
    if (pace > 0) await new Promise((resolve) => setTimeout(resolve, pace));
  };

  const structure = await runPass(client, {
    pass: 'structure',
    schema: structurePassSchema,
    input,
    failures,
  });
  const requirements = resolveRequirements(structure, selected, notes);
  const rubricSections = resolveRubricSections(structure, selected, notes);

  await betweenPasses();
  const milestonePass = await runPass(client, {
    pass: 'milestones',
    schema: milestonesPassSchema,
    input: {
      ...input,
      // Rendered as `R0. ...` and counted by the mock's template (`llm/fixtures/analyst-demo.ts`).
      requirementTitles: structure?.requirements.map((candidate) => candidate.title),
    },
    failures,
  });
  const keptRequirements = requirements.filter((entry) => entry.chunk !== null);
  const milestones = resolveMilestones(milestonePass, keptRequirements, notes);

  await betweenPasses();
  const faq = await runPass(client, { pass: 'faq', schema: faqPassSchema, input, failures });
  await betweenPasses();
  const policy = await runPass(client, { pass: 'policy', schema: policyPassSchema, input, failures });
  await betweenPasses();
  const ambiguity = await runPass(client, { pass: 'ambiguity', schema: ambiguityPassSchema, input, failures });

  return {
    assignmentId: input.assignmentId,
    promptVersion: ANALYST_PROMPT_VERSION,
    modelId: input.modelId,
    generatedAt: now().toISOString(),
    requirements,
    rubricSections,
    milestones,
    faqEntries: resolveFaq(faq, selected, notes),
    policyRules: resolvePolicy(policy, selected, notes),
    findings: resolveFindings(ambiguity, selected, notes),
    failures,
    callLogs,
    notes,
  };
}

/**
 * `attachment_extraction` (D68, trap T6): the one structured call that is not a pipeline pass.
 *
 * It takes the file bytes as a content part and returns the extracted text. The guardrail's L0-L3
 * decision runs *after* this, on the extracted text, because the upload is student content the
 * guard must see (C6, I-6) -- which is why this call is classified as reconstruction/understanding
 * rather than generation, and why it has its own budget counter.
 */
export async function extractAttachment(input: {
  readonly client: LlmProvider;
  readonly modelId: string;
  readonly systemPrefixId: string;
  readonly mimeType: string;
  readonly dataBase64: string;
  readonly partType: 'image' | 'pdf';
  readonly scopeKey: string;
  readonly timeoutMs?: number;
  readonly onCall?: (log: LlmCallLog) => void;
}): Promise<AttachmentExtraction | null> {
  const logs: LlmCallLog[] = [];
  const client = wrapClient(input.client, logs, input.onCall);
  const request: LlmRequest = {
    capability: 'attachment_extraction',
    modelId: input.modelId,
    systemPrefixId: input.systemPrefixId,
    messages: assembleMessages({
      systemPrefixId: input.systemPrefixId,
      staticPlatform: STATIC_PLATFORM_BLOCK,
      staticPolicy: 'ATTACHMENT EXTRACTION. Transcribe the attachment. Do not explain it.',
      grounding: '',
      variable:
        'Return JSON with a single field `text` holding the readable text of the attachment. If the attachment contains no readable text, return an empty string.',
    }),
    responseFormat: toResponseFormat('attachment_extraction_v1', attachmentExtractionSchema),
    temperature: 0,
    maxOutputTokens: 8192,
    timeoutMs: input.timeoutMs ?? 120_000,
    sessionId: input.scopeKey,
  };
  attachPart(request, input);

  const response = await client.complete(request);
  const parsed = parseStructured(attachmentExtractionSchema, response.json);
  return parsed.ok ? parsed.value : null;
}

function attachPart(request: LlmRequest, input: { partType: 'image' | 'pdf'; mimeType: string; dataBase64: string }): void {
  const user = request.messages[request.messages.length - 1];
  if (user === undefined || user.role !== 'user') return;
  user.content.push(
    input.partType === 'image'
      ? { type: 'image', mimeType: input.mimeType, dataBase64: input.dataBase64 }
      : { type: 'document', mimeType: input.mimeType, dataBase64: input.dataBase64, name: 'attachment' },
  );
}

// ---------------------------------------------------------------------------------------------
// Pass execution
// ---------------------------------------------------------------------------------------------

async function runPass<T>(
  client: LlmProvider,
  args: {
    readonly pass: AnalystPass;
    readonly schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } };
    readonly input: AnalystInput;
    readonly failures: PassFailure[];
  },
): Promise<T | null> {
  const request = buildAnalystRequest({
    assignmentId: args.input.assignmentId,
    pass: args.pass,
    chunks: args.input.chunks,
    approved: args.input.approved,
    modelId: args.input.modelId,
    sessionId: args.input.sessionId,
    requirementTitles: args.input.requirementTitles,
    maxOutputTokens: args.input.maxOutputTokens,
    timeoutMs: args.input.timeoutMs,
  });
  let response;
  try {
    response = await client.complete(request);
  } catch (error) {
    const code = error instanceof LlmError ? error.code : 'PROVIDER_UNAVAILABLE';
    // A hard stop aborts the run: the budget is spent or the provider/config is unusable, so the
    // remaining passes would only burn calls to fail the same way.
    if (code === 'BUDGET_EXCEEDED' || code === 'CONFIG_INVALID' || code === 'MODEL_UNKNOWN' || code === 'AUTH_FAILED') {
      throw error;
    }
    // A transient failure (rate limit, timeout, an outage on one call) is recorded and the run
    // continues: four good passes are worth more to a tutor than none, and the run's own gate decides
    // whether the result is usable at all.
    args.failures.push({ pass: args.pass, issues: [`the provider call failed with ${code}`] });
    return null;
  }
  const parsed = parseStructured(args.schema as never, response.json);
  if (!parsed.ok) {
    // D16: a schema failure is terminal for the request. No retry, no partial persist.
    args.failures.push({
      pass: args.pass,
      issues: parsed.issues as readonly string[],
    });
    return null;
  }
  return parsed.value as T;
}

/** Record a call log into the run's log list, and hand it to the caller's observer if there is one. */
function wrapClient(
  client: LlmProvider,
  logs: LlmCallLog[],
  onCall?: (log: LlmCallLog) => void,
): LlmProvider {
  return {
    id: client.id,
    capabilities: client.capabilities,
    validateConfiguration: () => client.validateConfiguration(),
    async complete(request: LlmRequest) {
      const startedAt = new Date().toISOString();
      try {
        const response = await client.complete(request);
        const log: LlmCallLog = {
          capability: request.capability,
          provider: response.provider,
          modelId: response.modelId === '' ? request.modelId : response.modelId,
          systemPrefixId: request.systemPrefixId,
          sessionId: request.sessionId,
          startedAt,
          latencyMs: response.latencyMs,
          usage: response.usage,
          ok: true,
          errorCode: null,
          providerRequestId: response.providerRequestId,
        };
        logs.push(log);
        onCall?.(log);
        return response;
      } catch (error) {
        const log: LlmCallLog = {
          capability: request.capability,
          provider: client.id,
          modelId: request.modelId,
          systemPrefixId: request.systemPrefixId,
          sessionId: request.sessionId,
          startedAt,
          latencyMs: 0,
          usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
          ok: false,
          errorCode: null,
          providerRequestId: null,
        };
        logs.push(log);
        onCall?.(log);
        throw error;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Grounding selection and resolution
// ---------------------------------------------------------------------------------------------

/**
 * The chunks a pass is allowed to cite: the first N within the character budget, in the order
 * `listT1Chunks` produced (brief, rubric, policy, then the rest).
 *
 * Ordering is fixed rather than relevance-ranked because the Analyst is building a whole structure,
 * not answering one question: it must see the brief and the rubric, and a relevance rank would
 * depend on a query the Analyst does not have.
 */
export function selectGrounding(chunks: readonly T1Chunk[]): T1Chunk[] {
  const selected: T1Chunk[] = [];
  let characters = 0;
  for (const chunk of chunks) {
    if (selected.length >= MAX_GROUNDING_CHUNKS) break;
    if (characters + chunk.text.length > MAX_GROUNDING_CHARS && selected.length > 0) break;
    selected.push(chunk);
    characters += chunk.text.length;
  }
  return selected;
}

function toGroundingChunk(chunk: T1Chunk): GroundingChunk {
  return {
    id: chunk.id,
    pageFrom: chunk.pageFrom,
    pageTo: chunk.pageTo,
    sectionLabel: chunk.sectionLabel,
    text: chunk.text,
  };
}

function schemaFor(pass: AnalystPass) {
  switch (pass) {
    case 'structure':
      return STRUCTURED_SCHEMAS.analyst_structure_v1;
    case 'milestones':
      return STRUCTURED_SCHEMAS.analyst_milestones_v1;
    case 'faq':
      return STRUCTURED_SCHEMAS.analyst_faq_v1;
    case 'policy':
      return STRUCTURED_SCHEMAS.analyst_policy_v1;
    case 'ambiguity':
      return STRUCTURED_SCHEMAS.analyst_ambiguity_v1;
  }
}

function schemaNameFor(pass: AnalystPass): keyof typeof STRUCTURED_SCHEMAS {
  const name = PASS_SCHEMA_NAMES[pass];
  return name as keyof typeof STRUCTURED_SCHEMAS;
}

function resolveRequirements(
  pass: { requirements: readonly RequirementCandidate[] } | null,
  selected: readonly T1Chunk[],
  notes: string[],
): Grounded<RequirementCandidate>[] {
  if (pass === null) return [];
  const resolved = pass.requirements.map((candidate) => {
    const chunk = selected[candidate.sourceChunkRef] ?? null;
    if (chunk === null) {
      notes.push(`a requirement cited chunk #${String(candidate.sourceChunkRef)}, which was not sent`);
      return { candidate, chunk: null, warnings: [UNGROUNDED_ARTIFACT] } as Grounded<RequirementCandidate>;
    }
    const warnings: IngestWarning[] = [];
    if (!isVerbatimSubstring(candidate.verbatimText, chunk.text)) {
      warnings.push({
        code: 'VERBATIM_MISMATCH',
        message: 'the quoted text is not a span of the cited chunk, so it cannot be shown as the requirement',
      });
    }
    return { candidate, chunk, warnings } as Grounded<RequirementCandidate>;
  });

  // Overlap is detected across the whole set, so the second node carries the warning rather than the
  // first. Only resolved nodes can overlap; an ungrounded node is dropped anyway.
  const resolvable = resolved.filter((entry) => entry.chunk !== null);
  const overlaps = findOverlappingRequirements(
    resolvable.map((entry, index) => ({ id: String(index), verbatimText: entry.candidate.verbatimText })),
  );
  return resolved.map((entry) => {
    if (entry.chunk === null) return entry;
    const index = resolvable.indexOf(entry);
    const overlap = overlaps.get(String(index));
    return overlap === undefined ? entry : { ...entry, warnings: [...entry.warnings, overlap] };
  });
}

function resolveRubricSections(
  pass: { rubricSections: readonly RubricSectionCandidate[] } | null,
  selected: readonly T1Chunk[],
  notes: string[],
): Grounded<RubricSectionCandidate>[] {
  if (pass === null) return [];
  return pass.rubricSections.map((candidate) => {
    const chunk = selected[candidate.sourceChunkRef] ?? null;
    if (chunk === null) {
      notes.push(`a rubric section cited chunk #${String(candidate.sourceChunkRef)}, which was not sent`);
      return { candidate, chunk: null, warnings: [UNGROUNDED_ARTIFACT] };
    }
    const warnings: IngestWarning[] = [];
    if (!isVerbatimSubstring(candidate.criteriaText, chunk.text)) {
      warnings.push({
        code: 'VERBATIM_MISMATCH',
        message: 'the criterion text is not a span of the cited chunk',
      });
    }
    if (candidate.weightPercent !== null && !weightAppearsInText(candidate.weightPercent, chunk.text)) {
      warnings.push({
        code: 'WEIGHT_NOT_FOUND',
        message: `the cited chunk does not state a weight of ${String(candidate.weightPercent)}`,
      });
    }
    return { candidate, chunk, warnings };
  });
}

function resolveMilestones(
  pass: { milestones: readonly MilestoneCandidate[] } | null,
  keptRequirements: readonly Grounded<RequirementCandidate>[],
  notes: string[],
): ResolvedMilestone[] {
  if (pass === null) return [];
  return pass.milestones.map((candidate) => {
    const requirementIndexes = candidate.requirementRefs.filter(
      (index) => index >= 0 && index < keptRequirements.length,
    );
    if (requirementIndexes.length !== candidate.requirementRefs.length) {
      notes.push(
        `a milestone referenced ${String(candidate.requirementRefs.length)} requirements, of which ${String(requirementIndexes.length)} resolved`,
      );
    }
    const groundingChunkIds = [
      ...new Set(
        requirementIndexes.flatMap((index) => {
          const chunk = keptRequirements[index]?.chunk;
          return chunk === null || chunk === undefined ? [] : [chunk.id];
        }),
      ),
    ];
    const warnings: IngestWarning[] = [];
    if (requirementIndexes.length === 0) {
      // `06` section 7.2.8: a milestone with no requirement link is a publish blocker, not a
      // schema failure. It is reported rather than filled in.
      warnings.push({
        code: 'UNGROUNDED_ARTIFACT',
        message: 'the milestone links to no requirement, which blocks publish until a tutor adds one',
      });
    }
    const items: ResolvedChecklistItem[] = candidate.checklistItems.map((item) => {
      const constraint = checkChecklistItem(item.title);
      return {
        candidate: item,
        // The wording wins over the model's declaration: the wording is what a student reads.
        planningLevel: constraint.planningLevel ?? item.planningLevel,
        warnings: constraint.warnings,
      };
    });
    return { candidate, requirementIndexes, groundingChunkIds, items, warnings };
  });
}

function resolveFaq(
  pass: { faqEntries: readonly FaqCandidate[] } | null,
  selected: readonly T1Chunk[],
  notes: string[],
): Grounded<FaqCandidate>[] {
  if (pass === null) return [];
  const resolved: Grounded<FaqCandidate>[] = [];
  for (const candidate of pass.faqEntries) {
    const chunks = candidate.sourceChunkRefs
      .map((ref) => selected[ref])
      .filter((chunk): chunk is T1Chunk => chunk !== undefined);
    if (chunks.length === 0) {
      notes.push('an FAQ candidate cited no chunk that was sent, and was discarded');
      continue;
    }
    resolved.push({ candidate, chunk: chunks[0] ?? null, warnings: [] });
  }
  return resolved;
}

function resolvePolicy(
  pass: { rules: readonly PolicyRuleCandidate[] } | null,
  selected: readonly T1Chunk[],
  notes: string[],
): Grounded<PolicyRuleCandidate>[] {
  if (pass === null) return [];
  return pass.rules.map((candidate) => {
    if (candidate.sourceChunkRef === null) {
      // A platform-baseline rule: allowed to be ungrounded because it is not a clause of any
      // document, and `06` section 7.2.11 makes `source_chunk_id` nullable for exactly this.
      return { candidate, chunk: null, warnings: [] };
    }
    const chunk = selected[candidate.sourceChunkRef] ?? null;
    if (chunk === null) {
      notes.push(`a policy rule cited chunk #${String(candidate.sourceChunkRef)}, which was not sent; the citation was dropped`);
      return { candidate: { ...candidate, sourceChunkRef: null }, chunk: null, warnings: [UNGROUNDED_ARTIFACT] };
    }
    return { candidate, chunk, warnings: [] };
  });
}

function resolveFindings(
  pass: { findings: readonly AmbiguityFindingCandidate[] } | null,
  selected: readonly T1Chunk[],
  notes: string[],
): Array<Grounded<AmbiguityFindingCandidate> & { sourceChunkIds: readonly string[] }> {
  if (pass === null) return [];
  const resolved: Array<Grounded<AmbiguityFindingCandidate> & { sourceChunkIds: readonly string[] }> = [];
  for (const candidate of pass.findings) {
    const chunks = candidate.sourceChunkRefs
      .map((ref) => selected[ref])
      .filter((chunk): chunk is T1Chunk => chunk !== undefined);
    if (chunks.length === 0) {
      notes.push('an ambiguity finding cited no chunk that was sent, and was discarded');
      continue;
    }
    const warnings: IngestWarning[] = [];
    const cited = chunks.map((chunk) => chunk.text).join('\n\n');
    if (!isVerbatimSubstring(candidate.excerptA, cited)) {
      warnings.push({ code: 'VERBATIM_MISMATCH', message: 'excerpt A is not a span of the cited chunks' });
    }
    if (candidate.excerptB !== null && !isVerbatimSubstring(candidate.excerptB, cited)) {
      warnings.push({ code: 'VERBATIM_MISMATCH', message: 'excerpt B is not a span of the cited chunks' });
    }
    resolved.push({
      candidate,
      chunk: chunks[0] ?? null,
      warnings,
      sourceChunkIds: chunks.map((chunk) => chunk.id),
    });
  }
  return resolved;
}
