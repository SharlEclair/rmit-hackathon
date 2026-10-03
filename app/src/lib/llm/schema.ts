/**
 * The structured-output contract for every Phase 2 capability.
 *
 * **This file is FROZEN at Phase 2** (`docs/handoff/04-INTERFACES.md` section 1). Phase 3's
 * guardrail owns the `guardrail_decision` schema and must not edit this file to add it: it defines
 * its own schema under `src/lib/guardrail/` and, if it needs a shape from here, raises it in
 * `docs/handoff/05-ISSUES.md` first.
 *
 * Two rules from `AGENTS.md` section 6 shape everything below:
 *
 * 1. **Structured output only, and a schema failure is a refusal** (D16). `parseStructured` returns
 *    a result, not a throw and not a retry. `04` section 5.7: "Retrying until the model complies is
 *    forbidden." The caller decides what a refusal means for its own stage -- for ingestion it is
 *    `REJECTED` with the schema error recorded, never a partial persist (`04` section 7, stage S7).
 * 2. **Grounding is referenced by position, not by identifier.** The Analyst is given numbered
 *    chunks (`[#0]`) and returns `sourceChunkRef: number`; the pipeline resolves an index to the
 *    `source_chunks.id` it actually supplied and rejects an out-of-range ref. Asking a model to
 *    transcribe a UUID is a transcription task it fails at, and a hallucinated id would look like
 *    provenance. This is an addition to `04` section 5.2's contract, not a change to it.
 *
 * What is deliberately absent: any field that would let the Analyst author a clarification
 * (`06` section 7.2.12 has no `proposed_clarification` column, and D23 forbids one), any
 * requirement *rewording* (C2: the Analyst locates and quotes, it does not paraphrase), and any
 * implementation-action field on a checklist item (D20, O1).
 */

import { z } from 'zod';

import type { JsonSchema, LlmResponseFormat } from './types';

/** `06` section 7.2.10: the six planning-level verbs (O1, D20). */
export const PLANNING_LEVELS = [
  'understand',
  'identify',
  'plan',
  'verify',
  'review',
  'note',
] as const;

/** `06` section 7.2.11: the four policy effects. */
export const POLICY_EFFECTS = ['PROHIBIT', 'ALLOW', 'ESCALATE_TO_TUTOR', 'CLARIFY'] as const;

/** `06` section 7.2.11: the four policy scopes. */
export const POLICY_APPLIES_TO = ['assistant', 'uploads', 'discussion', 'all'] as const;

/** `06` section 7.2.12: a finding is an ambiguity or a contradiction, and nothing else. */
export const AMBIGUITY_KINDS = ['ambiguity', 'contradiction'] as const;

/** `06` section 7.2.12: three severities. */
export const AMBIGUITY_SEVERITIES = ['low', 'medium', 'high'] as const;

/**
 * A reference to one of the numbered grounding chunks the request supplied.
 *
 * Bounded at 999 rather than left open: an index far outside the supplied set is a model artefact,
 * and a bound lets the schema reject it here instead of leaving the pipeline to reject it later.
 */
const chunkRef = z.number().int().min(0).max(999);

const pageNumber = z.number().int().min(1).max(5000);

const sectionLabel = z.string().min(1).max(200);

/** Pass (a): structure, requirements, rubric sections. */
export const requirementCandidateSchema = z
  .object({
    title: z.string().min(1).max(200),
    /** A verbatim span of the cited chunk. The pipeline proves the substring before persisting (I-2). */
    verbatimText: z.string().min(1).max(2000),
    sourceChunkRef: chunkRef,
    sourcePage: pageNumber.nullable(),
    sourceSectionLabel: sectionLabel.nullable(),
    /** T5 interpretation, rendered only in the Map surface (`06` section 7.2.5). */
    mapSummary: z.string().max(600).nullable(),
  })
  .strict();

export const rubricSectionCandidateSchema = z
  .object({
    sectionLabel,
    /** Verbatim criterion text; immutable after insert (`06` section 7.2.6). */
    criteriaText: z.string().min(1).max(4000),
    weightPercent: z.number().min(0).max(100).nullable(),
    sourceChunkRef: chunkRef,
    pageFrom: pageNumber.nullable(),
    pageTo: pageNumber.nullable(),
    mapInterpretation: z.string().max(600).nullable(),
  })
  .strict();

export const structurePassSchema = z
  .object({
    requirements: z.array(requirementCandidateSchema).min(1).max(40),
    rubricSections: z.array(rubricSectionCandidateSchema).max(40),
  })
  .strict();

/** Pass (b): milestones with their checklist items. */
export const checklistItemCandidateSchema = z
  .object({
    title: z.string().min(3).max(160),
    /** The verb the item opens with; `planning_level` is derived from it and validated (O1). */
    planningLevel: z.enum(PLANNING_LEVELS),
    description: z.string().max(600).nullable(),
  })
  .strict();

export const milestoneCandidateSchema = z
  .object({
    title: z.string().min(1).max(160),
    summary: z.string().max(600).nullable(),
    /**
     * Positions in the requirement list pass (a) produced.
     *
     * An empty list is schema-valid and a **publish blocker**, not a schema failure: `06` section
     * 7.2.8 makes `MILESTONE_WITHOUT_REQUIREMENT` a warning plus a publish blocker, so the tutor
     * sees it rather than the whole proposal being discarded.
     */
    requirementRefs: z.array(z.number().int().min(0).max(999)).max(40),
    checklistItems: z.array(checklistItemCandidateSchema).max(12),
  })
  .strict();

export const milestonesPassSchema = z
  .object({
    milestones: z.array(milestoneCandidateSchema).min(1).max(12),
  })
  .strict();

/** Pass (c): FAQ candidates. Published only by a tutor (D24). */
export const faqCandidateSchema = z
  .object({
    question: z.string().min(5).max(500),
    answer: z.string().min(5).max(4000),
    sourceChunkRefs: z.array(chunkRef).min(1).max(8),
  })
  .strict();

export const faqPassSchema = z
  .object({
    faqEntries: z.array(faqCandidateSchema).max(20),
  })
  .strict();

/** Pass (d): the per-assignment AI Usage Policy draft (D9). */
export const policyRuleCandidateSchema = z
  .object({
    ruleCode: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    ruleText: z.string().min(10).max(600),
    effect: z.enum(POLICY_EFFECTS),
    appliesTo: z.enum(POLICY_APPLIES_TO),
    sourceChunkRef: chunkRef.nullable(),
  })
  .strict();

export const policyPassSchema = z
  .object({
    rules: z.array(policyRuleCandidateSchema).max(30),
  })
  .strict();

/**
 * Pass (e): ambiguity and contradiction findings.
 *
 * There is no field for a proposed clarification and there must never be one (D23, C2, `06` section
 * 7.2.12). `.strict()` is load-bearing here: a model that volunteers a `suggestedClarification` key
 * fails validation rather than having the extra key silently dropped and the text remembered.
 */
export const ambiguityFindingCandidateSchema = z
  .object({
    kind: z.enum(AMBIGUITY_KINDS),
    severity: z.enum(AMBIGUITY_SEVERITIES),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    locatedPage: pageNumber.nullable(),
    locatedSectionLabel: sectionLabel.nullable(),
    /** Verbatim excerpt of the first location. */
    excerptA: z.string().min(1).max(500),
    /** Verbatim excerpt of the conflicting location; required for a contradiction. */
    excerptB: z.string().min(1).max(500).nullable(),
    sourceChunkRefs: z.array(chunkRef).min(1).max(8),
  })
  .strict()
  .refine(
    (finding) => finding.kind !== 'contradiction' || finding.excerptB !== null,
    { message: 'a contradiction finding must quote both conflicting locations (excerptB)' },
  );

export const ambiguityPassSchema = z
  .object({
    findings: z.array(ambiguityFindingCandidateSchema).max(20),
  })
  .strict();

/**
 * `attachment_extraction` (D68, trap T6).
 *
 * The output is the extracted content itself, and nothing else. There is no field for an opinion, a
 * summary or an answer: an upload is input to *understanding*, never a request to perform work
 * (C6, D10). An empty `text` is schema-valid -- "no readable text in this image" is a real outcome
 * the pipeline maps to `extraction_status = 'failed'` and tutor attention, not a retry.
 */
export const attachmentExtractionSchema = z
  .object({
    text: z.string().max(200_000),
  })
  .strict();

export type RequirementCandidate = z.infer<typeof requirementCandidateSchema>;
export type RubricSectionCandidate = z.infer<typeof rubricSectionCandidateSchema>;
export type StructurePass = z.infer<typeof structurePassSchema>;
export type ChecklistItemCandidate = z.infer<typeof checklistItemCandidateSchema>;
export type MilestoneCandidate = z.infer<typeof milestoneCandidateSchema>;
export type MilestonesPass = z.infer<typeof milestonesPassSchema>;
export type FaqCandidate = z.infer<typeof faqCandidateSchema>;
export type FaqPass = z.infer<typeof faqPassSchema>;
export type PolicyRuleCandidate = z.infer<typeof policyRuleCandidateSchema>;
export type PolicyPass = z.infer<typeof policyPassSchema>;
export type AmbiguityFindingCandidate = z.infer<typeof ambiguityFindingCandidateSchema>;
export type AmbiguityPass = z.infer<typeof ambiguityPassSchema>;
export type AttachmentExtraction = z.infer<typeof attachmentExtractionSchema>;

/** Which pass a schema belongs to, for the pipeline's provenance and error reporting. */
export type AnalystPassId =
  | 'structure'
  | 'milestones'
  | 'faq'
  | 'policy'
  | 'ambiguity';

/** Every structured schema in this module, keyed by the stable name used in the audit log. */
export const STRUCTURED_SCHEMAS = {
  analyst_structure_v1: structurePassSchema,
  analyst_milestones_v1: milestonesPassSchema,
  analyst_faq_v1: faqPassSchema,
  analyst_policy_v1: policyPassSchema,
  analyst_ambiguity_v1: ambiguityPassSchema,
  attachment_extraction_v1: attachmentExtractionSchema,
} as const;

export type StructuredSchemaName = keyof typeof STRUCTURED_SCHEMAS;

export type StructuredResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Validate a parsed model payload. **Never throws and never retries** (D16).
 *
 * `issues` carries zod's own path-and-message strings, which describe the *shape* the model failed
 * to produce. They never contain a value from the payload, because a payload is model output over
 * student or assignment content: reporting `expected number at milestons[0].requirementRefs` is
 * safe, reporting the offending text is not.
 */
export function parseStructured<T>(schema: z.ZodType<T>, raw: unknown): StructuredResult<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.slice(0, 20).map((issue) => {
      const path = issue.path.length === 0 ? '<root>' : issue.path.join('.');
      return `${path}: ${issue.message}`;
    }),
  };
}

/**
 * A zod object -> the provider's `response_format`.
 *
 * **The provider schema is a hint; the zod schema is the contract.** `parseStructured` validates
 * every payload against the zod schema, so a keyword that is dropped here cannot make the
 * application accept something it should not. This matters because the provider's JSON Schema
 * support is a subset and its refusal is an opaque `400 invalid_request` with no field named
 * (`probe: structure-schema/probe: ambiguity-schema` returned exactly that on 2026-10-04).
 *
 * The transforms, each with its reason:
 *
 * 1. The top-level `$schema` key is dropped. The provider wants the schema, not a draft URI.
 * 2. `{"anyOf": [X, {"type": "null"}]}` -- what draft 2020-12 emits for `.nullable()` -- becomes `X`
 *    plus `"nullable": true`. A live probe confirmed `nullable: true` is accepted (HTTP 200).
 * 3. `minLength`, `maxLength`, `minItems`, `maxItems`, `minimum`, `maximum` are dropped. They are
 *    **validation**, not shape, and none of them changes what the model should produce: the zod
 *    schema still enforces every one of them, and a payload that violates one is refused (D16).
 *    Keeping them costs a whole-pass `400` the moment any single bound is outside the supported
 *    subset, which is what happened live.
 * 4. `additionalProperties: false` is kept: a live probe accepted it (HTTP 200), and it is what stops
 *    a model volunteering a key such as `suggestedClarification`, which `.strict()` would otherwise
 *    have to refuse after the fact (D23).
 */
export function toResponseFormat(name: StructuredSchemaName, schema: z.ZodType): LlmResponseFormat {
  const generated = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  delete generated['$schema'];
  return {
    type: 'json_schema',
    name,
    schema: toProviderSchema(generated) as JsonSchema,
    strict: true,
  };
}

/** Keywords the provider is asked to honour. Everything else is the application's business. */
const PROVIDER_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'nullable',
  'additionalProperties',
  'description',
  'title',
]);

/** Recursively rewrite for the provider: collapse null-unions, drop bounds. Pure. */
function toProviderSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map((entry) => toProviderSchema(entry));
  if (typeof node !== 'object' || node === null) return node;

  const record = node as Record<string, unknown>;

  const anyOf = record['anyOf'];
  if (Array.isArray(anyOf)) {
    const rest = anyOf.filter((entry) => !isNullSchema(entry));
    if (rest.length === 1 && rest.length !== anyOf.length) {
      const base = toProviderSchema(rest[0]) as Record<string, unknown>;
      return { ...base, nullable: true };
    }
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!PROVIDER_KEYWORDS.has(key)) continue;
    if (key === 'properties') {
      // The children of a `properties` map are property NAMES, not schema keywords: filtering them
      // would delete every field except one literally called `type` or `items`.
      const properties: Record<string, unknown> = {};
      if (typeof value === 'object' && value !== null) {
        for (const [propertyName, propertySchema] of Object.entries(value as Record<string, unknown>)) {
          properties[propertyName] = toProviderSchema(propertySchema);
        }
      }
      result[key] = properties;
      continue;
    }
    result[key] = toProviderSchema(value);
  }
  return result;
}

function isNullSchema(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false;
  const record = node as Record<string, unknown>;
  return record['type'] === 'null';
}
