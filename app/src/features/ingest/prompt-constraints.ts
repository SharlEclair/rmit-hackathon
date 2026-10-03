/**
 * Deterministic constraints on Analyst output.
 *
 * Every check here runs **without a model call**, which is the point: `AGENTS.md` section 6 rule 2
 * requires the policy layer to be enforceable when the model is unavailable or wrong, and D16 makes
 * a schema-valid but illegitimate artifact a rejection rather than something to retry.
 *
 * What is checked, and why each one is a rejection rather than a warning:
 *
 * | Check | Warning code | `06` reference |
 * |---|---|---|
 * | A checklist item's first word is one of the six planning verbs | `CHECKLIST_VERB_MISMATCH` | 7.2.10 rule 2, O1 |
 * | A checklist item names an implementation action | `CHECKLIST_IMPERATIVE` | 7.2.10 rule 2, D20 |
 * | `verbatim_text` is not a span of the cited chunk | `VERBATIM_MISMATCH` | 7.2.5, I-2 |
 * | A rubric weight is not present in the cited chunk | `WEIGHT_NOT_FOUND` | 7.2.6 |
 * | Two requirement nodes quote the same sentence | `OVERLAPPING_REQUIREMENT` | 06 section 5.5.8 |
 * | An artifact cites no chunk | `UNGROUNDED_ARTIFACT` | 06 section 5.5.8 |
 *
 * `VERBATIM_MISMATCH` is the one that "cannot be acknowledged" (`06` section 5.5.8): a tutor can
 * accept a weight that was not found, but cannot accept text presented as the requirement when the
 * requirement says something else (C2). The pipeline therefore treats it as a drop, and the others
 * are carried to the review screen.
 *
 * The verbatim comparison is **whitespace-insensitive**. An exact byte comparison would reject a
 * correct quote because the PDF extractor emitted a line break where the document has a space; the
 * check exists to catch re-wording, and collapsing whitespace on both sides catches exactly that
 * while remaining a substring test.
 */

import { PLANNING_LEVELS } from '@/lib/llm/schema';

/** `06` section 7.2.10 rule 2: the six allowed opening verbs. The schema's enum is the source. */
export const PLANNING_VERBS = PLANNING_LEVELS;

/**
 * `06` section 7.2.10 rule 2's implementation-action list.
 *
 * A superset of the document's examples is deliberately avoided: adding a verb here changes what
 * the product refuses, which is a decision, not a comment. This is the list the spec names.
 */
export const IMPLEMENTATION_VERBS = [
  'implement',
  'build',
  'write',
  'code',
  'design',
  'deploy',
  'fix',
  'debug',
  'solve',
] as const;

/** The warning codes of `06` section 5.5.8's `ValidationWarning`. */
export type ValidationWarningCode =
  | 'VERBATIM_MISMATCH'
  | 'WEIGHT_NOT_FOUND'
  | 'CHECKLIST_VERB_MISMATCH'
  | 'CHECKLIST_IMPERATIVE'
  | 'UNGROUNDED_ARTIFACT'
  | 'OVERLAPPING_REQUIREMENT';

export interface IngestWarning {
  readonly code: ValidationWarningCode;
  readonly message: string;
}

export interface ChecklistConstraintResult {
  /** The planning level the item's own wording implies, or null when the first word is not one. */
  readonly planningLevel: (typeof PLANNING_LEVELS)[number] | null;
  readonly warnings: readonly IngestWarning[];
}

/**
 * Apply the two checklist constraints.
 *
 * The planning level is **derived from the item's wording**, not trusted from the model: the model
 * declaring `planningLevel: 'understand'` on an item that starts with "Implement" is exactly the
 * case these rules exist for. A derived level that disagrees with the declared one is not a
 * separate warning -- the declared value is simply replaced downstream, because the wording is what
 * a student reads.
 */
export function checkChecklistItem(title: string): ChecklistConstraintResult {
  const warnings: IngestWarning[] = [];
  const firstWord = firstWordOf(title).toLowerCase();
  const matched = PLANNING_VERBS.find((verb) => verb === firstWord) ?? null;

  if (matched === null) {
    warnings.push({
      code: 'CHECKLIST_VERB_MISMATCH',
      message: `the item does not open with one of: ${PLANNING_VERBS.join(', ')}`,
    });
  }

  const implementation = findImplementationVerb(title);
  if (implementation !== null) {
    warnings.push({
      code: 'CHECKLIST_IMPERATIVE',
      message: `the item names an implementation action ("${implementation}"), which is above the planning level`,
    });
  }

  return { planningLevel: matched, warnings };
}

/** The first implementation-action verb the title contains, or null. Word-boundary matched. */
export function findImplementationVerb(title: string): string | null {
  const words = title.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const word of words) {
    const match = IMPLEMENTATION_VERBS.find((verb) => verb === word);
    if (match !== undefined) return match;
  }
  return null;
}

/**
 * Is `verbatim` a span of `source`?
 *
 * Whitespace-insensitive (see the file header). Compared on a lower-cased, whitespace-collapsed
 * form so a difference in capitalisation or line breaking cannot masquerade as a re-wording; a
 * changed word still fails, which is the behaviour I-2 and C2 require.
 */
export function isVerbatimSubstring(verbatim: string, source: string): boolean {
  const needle = collapse(verbatim);
  if (needle === '') return false;
  return collapse(source).includes(needle);
}

/**
 * Does the cited chunk state this weight?
 *
 * `06` section 7.2.6: "when present the number must appear in the cited chunk text". Matched as a
 * number rather than as a substring, so a criterion weighted 25 is not considered grounded by the
 * text "1250 words" or by a page number.
 */
export function weightAppearsInText(weightPercent: number, source: string): boolean {
  const wanted = normaliseNumber(weightPercent);
  const tokens = source.match(/\d+(?:\.\d+)?/g) ?? [];
  return tokens.some((token) => normaliseNumber(Number(token)) === wanted);
}

/** Requirement nodes whose quoted text repeats a node already seen. */
export function findOverlappingRequirements(
  nodes: ReadonlyArray<{ readonly id: string; readonly verbatimText: string }>,
): Map<string, IngestWarning> {
  const seen = new Map<string, string>();
  const warnings = new Map<string, IngestWarning>();
  for (const node of nodes) {
    const key = collapse(node.verbatimText);
    const first = seen.get(key);
    if (first !== undefined) {
      warnings.set(node.id, {
        code: 'OVERLAPPING_REQUIREMENT',
        message: `quotes the same passage as requirement ${first}`,
      });
      continue;
    }
    seen.set(key, node.id);
  }
  return warnings;
}

/** The warning for an artifact that cites no chunk at all (`06` section 5.5.8). */
export const UNGROUNDED_ARTIFACT: IngestWarning = {
  code: 'UNGROUNDED_ARTIFACT',
  message: 'the artifact cites no source chunk, so it cannot be traced to the assignment documents',
};

function firstWordOf(title: string): string {
  return title.trim().split(/\s+/)[0] ?? '';
}

/** Lower-case, collapse runs of whitespace, trim. Never used to rewrite stored text. */
export function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normaliseNumber(value: number): number {
  return Math.round(value * 100) / 100;
}
