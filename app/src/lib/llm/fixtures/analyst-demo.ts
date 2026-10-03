/**
 * The mock provider's committed fixtures.
 *
 * **What these are, stated plainly.** Each template is a deterministic, dependency-free synthesiser
 * that builds a schema-valid proposal **from the grounding chunks the request actually carried**.
 * They are not model output and they never claim to be: the mock reports provider `mock` and a
 * `mock-*` model id, so provenance records exactly what happened (`AGENTS.md` C3: AI output is
 * marked, and this is not even AI output).
 *
 * Why templates rather than captured responses. `04` section 5.8 rule 3 asks for fixtures keyed by a
 * hash of `(capability, systemPrefixId, canonicalised request body)`. That works for the seeded rows
 * a capture was taken against and fails for everything else: the moment a tutor uploads a document,
 * the chunk ids in the canonical body are new and every key misses. A template keyed by
 * `systemPrefixId` (which is `<capability>-v<n>`, so it only matches the prompt version it was
 * written for) keeps `LLM_PROVIDER=mock` "whole loop walkable" for any uploaded document
 * (`04` section 5.8 rule 4). The hash lookup is still implemented and still consulted first, so a
 * test or the Phase 3 golden set can register an exact response for an exact request. Recorded as
 * **D84**.
 *
 * The grounding rule that makes these safe: every quoted span is a **slice of the chunk text that
 * was sent**, so the pipeline's verbatim substring validator (I-2, `06` section 7.2.5) passes for
 * the right reason rather than by luck, and a template can never invent a requirement.
 */

import type { ParsedGroundingChunk } from '../prompt';

/** A grounded requirement candidate, built from a chunk's own leading text. */
function requirementFrom(chunk: ParsedGroundingChunk): unknown {
  const firstBlock = firstMeaningfulLine(chunk.text);
  return {
    title: truncate(firstBlock, 120),
    verbatimText: truncate(chunk.text.trim(), 1200),
    sourceChunkRef: chunk.ref,
    sourcePage: chunk.pageFrom,
    sourceSectionLabel: chunk.sectionLabel,
    mapSummary: `Map node built from the document at ${describe(chunk)}.`,
  };
}

/** Structure, requirements and rubric sections -- pass (a). */
export function buildStructurePass(chunks: readonly ParsedGroundingChunk[]): unknown {
  const requirements = pickRequirements(chunks).slice(0, 12).map(requirementFrom);
  const rubricSections = chunks
    .filter((chunk) => /criterion/i.test(chunk.sectionLabel ?? '') || /%/.test(chunk.text))
    .slice(0, 12)
    .map((chunk) => ({
      sectionLabel: truncate(chunk.sectionLabel ?? firstMeaningfulLine(chunk.text), 200),
      criteriaText: truncate(chunk.text.trim(), 2000),
      weightPercent: firstPercent(chunk.text),
      sourceChunkRef: chunk.ref,
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo,
      mapInterpretation: `Rubric section located at ${describe(chunk)}.`,
    }));
  return { requirements, rubricSections };
}

/**
 * Milestones and checklist items -- pass (b).
 *
 * `requirementRefs` covers the requirement list the pipeline rendered ahead of this request, so
 * every milestone clears the `MILESTONE_WITHOUT_REQUIREMENT` publish blocker (`06` section 7.2.8)
 * for a real reason: it names a requirement that exists.
 */
export function buildMilestonesPass(
  chunks: readonly ParsedGroundingChunk[],
  requirementCount: number,
): unknown {
  const titles = pickRequirements(chunks)
    .slice(0, 6)
    .map((chunk) => truncate(firstMeaningfulLine(chunk.text), 140));
  const fallback = titles.length > 0 ? titles : ['the assignment documents'];
  const count = Math.max(1, Math.min(6, fallback.length));
  const milestones = Array.from({ length: count }, (_, index) => {
    const title = fallback[index] ?? fallback[0] ?? 'the assignment';
    const refs = requirementCount === 0 ? [] : [index % requirementCount];
    return {
      title: truncate(title, 160),
      summary: `A stage of work the documents describe: ${truncate(title, 120)}.`,
      requirementRefs: refs,
      checklistItems: [
        { title: `Understand ${truncate(title, 140)}`, planningLevel: 'understand', description: null },
        { title: `Identify the material for ${truncate(title, 130)}`, planningLevel: 'identify', description: null },
        { title: `Plan the work for ${truncate(title, 135)}`, planningLevel: 'plan', description: null },
      ],
    };
  });
  return { milestones };
}

/** FAQ candidates -- pass (c). A tutor still has to publish them (D24). */
export function buildFaqPass(chunks: readonly ParsedGroundingChunk[]): unknown {
  const withQuestion = chunks.filter((chunk) => /\?/.test(chunk.text)).slice(0, 5);
  const source = withQuestion.length > 0 ? withQuestion : chunks.slice(0, 3);
  const faqEntries = source.map((chunk, index) => ({
    question: truncate(questionFrom(chunk.text, index), 500),
    answer: truncate(
      `The assignment documents say: ${firstMeaningfulLine(chunk.text)}`,
      4000,
    ),
    sourceChunkRefs: [chunk.ref],
  }));
  return { faqEntries };
}

/**
 * AI Usage Policy draft -- pass (d).
 *
 * The rules are deliberately generic and each is scoped: an `ALLOW` rule for locating requirements,
 * a `PROHIBIT` rule against producing the work, and an `ESCALATE_TO_TUTOR` rule. The draft is a
 * candidate set for a tutor to edit and approve; the guardrail reads only PUBLISHED rules
 * (`06` section 7.2.11), so nothing here is in force until a tutor publishes it.
 */
export function buildPolicyPass(chunks: readonly ParsedGroundingChunk[]): unknown {
  const grounded = chunks[0];
  return {
    rules: [
      {
        ruleCode: 'locate_requirements',
        ruleText:
          'The assistant may help you find and re-read the requirements in the official documents.',
        effect: 'ALLOW',
        appliesTo: 'assistant',
        sourceChunkRef: grounded === undefined ? null : grounded.ref,
      },
      {
        ruleCode: 'no_work_produced',
        ruleText:
          'The assistant must not write, debug or complete any part of the assessed work for you.',
        effect: 'PROHIBIT',
        appliesTo: 'all',
        sourceChunkRef: null,
      },
      {
        ruleCode: 'ask_the_tutor',
        ruleText:
          'If the documents do not answer a question about the assessment, ask the tutor privately.',
        effect: 'ESCALATE_TO_TUTOR',
        appliesTo: 'assistant',
        sourceChunkRef: null,
      },
    ],
  };
}

/**
 * Ambiguity findings -- pass (e).
 *
 * Detects and locates only. There is no field for a proposed clarification, and the schema is
 * `.strict()`, so a clarification cannot be smuggled through even by a template (D23, C2).
 */
export function buildAmbiguityPass(chunks: readonly ParsedGroundingChunk[]): unknown {
  const chunk = chunks[0];
  if (chunk === undefined) return { findings: [] };
  const excerpt = truncate(firstMeaningfulLine(chunk.text), 400);
  return {
    findings: [
      {
        kind: 'ambiguity',
        severity: 'medium',
        title: 'Requirement wording does not state a measurable outcome',
        description: `The document states the following without saying how it will be judged: ${excerpt}`,
        locatedPage: chunk.pageFrom,
        locatedSectionLabel: chunk.sectionLabel,
        excerptA: excerpt,
        excerptB: null,
        sourceChunkRefs: [chunk.ref],
      },
    ],
  };
}

/**
 * Attachment extraction -- `attachment_extraction` (D68).
 *
 * The mock cannot read an image or a PDF, so it labels what it was given. Calling this an
 * "extraction" is the one place the mock must not pretend: the text is visibly a fixture, the
 * provenance records the `mock-extraction-v1` model id, and the upload still follows the normal
 * `extractionStatus` / `guardrailScanStatus` path.
 */
export function buildAttachmentExtraction(input: {
  readonly partType: string;
  readonly mimeType: string;
  readonly byteLength: number;
}): unknown {
  return {
    text: `[mock extraction] ${input.partType} ${input.mimeType} (${String(input.byteLength)} bytes)`,
  };
}

/** Templates keyed by `systemPrefixId` (`<capability>-v<n>`), so only a matching version matches. */
export const MOCK_TEMPLATES: Record<string, (chunks: readonly ParsedGroundingChunk[]) => unknown> = {
  'assignment_analyst-structure-v1': buildStructurePass,
  'assignment_analyst-faq-v1': buildFaqPass,
  'assignment_analyst-policy-v1': buildPolicyPass,
  'assignment_analyst-ambiguity-v1': buildAmbiguityPass,
};

/**
 * Milestones needs a second input (how many requirements pass (a) produced), because its refs are
 * positions in that list. It is registered separately so `MOCK_TEMPLATES` keeps the simple shape.
 */
export const MILESTONES_TEMPLATE_ID = 'assignment_analyst-milestones-v1';

/** Which chunks look like a requirement: a numbered clause, or the longest leading paragraphs. */
function pickRequirements(chunks: readonly ParsedGroundingChunk[]): ParsedGroundingChunk[] {
  const numbered = chunks.filter((chunk) => /^\s*(\d+[.)]\s|[A-Z][a-z]+ \d)/m.test(chunk.text));
  if (numbered.length > 0) return numbered;
  return [...chunks].sort((a, b) => b.text.length - a.text.length).slice(0, 6);
}

/** The first line of a chunk with real content, falling back to its opening characters. */
function firstMeaningfulLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length >= 8) return trimmed;
  }
  return text.trim().slice(0, 120);
}

/** A question sentence if the chunk has one, otherwise a stable question about its subject. */
function questionFrom(text: string, index: number): string {
  const match = /([^\n.?]{8,200}\?)/.exec(text);
  if (match !== null) return match[1] ?? `What does the assignment require here (${String(index)})?`;
  return `What do the assignment documents require here (${String(index)})?`;
}

/** The first percentage in the text, so a weight is never claimed unless the source states it. */
function firstPercent(text: string): number | null {
  const match = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(text);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : collapsed.slice(0, max).trimEnd();
}

function describe(chunk: ParsedGroundingChunk): string {
  if (chunk.pageFrom === null) return 'no page anchor';
  if (chunk.pageTo === null || chunk.pageTo === chunk.pageFrom) return `page ${String(chunk.pageFrom)}`;
  return `pages ${String(chunk.pageFrom)}-${String(chunk.pageTo)}`;
}
