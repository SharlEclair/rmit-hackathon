/**
 * L0 NORMALISE (`05-AI-GUARDRAILS.md` section 3.2).
 *
 * **The one rule that governs this file: never mutate the stored student text.** L0 builds a
 * *matching* string. It returns `raw` untouched because `raw` is what the message store keeps and
 * what the model is shown; `match` exists only so that a zero-width space or a Cyrillic homoglyph
 * cannot hide a prohibited request from L1. Logging `match` where `raw` belongs would silently
 * rewrite student content, and using `raw` for matching would silently miss launderings (`DE9`).
 *
 * **Why the cap exists.** `05` section 3.4 makes text that is empty, whitespace, or above the
 * input cap `AMB5 -> CLARIFY`, then `REFUSE` if repeated. The cap value is not stated in any doc;
 * `GUARDRAIL_INPUT_CAP_CHARS` is the working assumption and is recorded in
 * `docs/handoff/05-ISSUES.md` as **I-28** rather than left implicit.
 *
 * **Determinism.** No clock, no randomness, no I/O. The only dependency is `node:crypto` for the
 * turn hash, which `05` section 8.2 requires as the substitute for logging content at all.
 */

import { createHash } from 'node:crypto';

/** Working assumption; see the header. Above this, L0 reports `oversize` and the caller refuses. */
export const GUARDRAIL_INPUT_CAP_CHARS = 4000;

/** Zero-width and bidirectional control characters. Stripped before matching, never from `raw`. */
const INVISIBLE_CONTROLS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD]/g;

/** Fenced code blocks, ``` or ~~~. Extracted so a code block cannot be indexed as prose. */
const FENCED_CODE = /(```|~~~)[\s\S]*?\1/g;

/**
 * Words that carry no retrieval signal. The list is deliberately short: it removes question and
 * article scaffolding only, because dropping a topical word here turns a grounded question into a
 * false "the documents are silent" escalation (`ESC4`).
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'before',
  'between', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'done', 'during', 'each',
  'for', 'from', 'get', 'give', 'had', 'has', 'have', 'having', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'just', 'like', 'me', 'more', 'most', 'must', 'my', 'need', 'no', 'not', 'of',
  'on', 'or', 'our', 'out', 'over', 'own', 'please', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'to', 'up', 'us', 'use',
  'used', 'using', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'whose', 'why', 'will', 'with', 'would', 'you', 'your', 'yours', 'tell', 'want', 'know', 'here',
  'help', 'thanks', 'thank', 'hi', 'hello', 'assignment', 'assignments', 'brief', 'rubric', 'course',
  'unit', 'part', 'report', 'section', 'requirement', 'requirements', 'question', 'questions',
]);

export interface NormalisedTurn {
  /** The student's turn, byte for byte as it arrived. Never logged. */
  raw: string;
  /** Casefolded, control-stripped, whitespace-collapsed, code blocks replaced by a marker. */
  match: string;
  /** `match` split on sentence and clause boundaries. Used for same-clause co-occurrence rules. */
  clauses: string[];
  /** Whitespace-delimited tokens of `match`. */
  tokens: string[];
  /** Fenced code blocks, in order. Student content: never logged, never persisted here. */
  codeBlocks: string[];
  hasCodeBlock: boolean;
  /** Multi-line or clearly syntactic code outside a fence. Feeds H1 and `POST_CODE`. */
  codeShaped: boolean;
  /** `DE9` decoded forms (leetspeak, base64) that L1 re-evaluates. Excludes `match` itself. */
  variants: string[];
  /** Stemmed topical words, for the grounding check that separates `A4` from `ESC4`. */
  contentWords: string[];
  /** sha-256 of `raw`, hex. The only content-derived value that may be logged (`05` section 8.2). */
  hash: string;
  empty: boolean;
  oversize: boolean;
}

const LEET_MAP: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'l',
  '+': 't',
};

/**
 * Light stemming, so "references" and "reference" ground the same requirement.
 *
 * Deliberately only a trailing `s`: stripping `es` turns "references" into "referenc" and
 * "deliverables" into "deliverabl", and the grounding check compares stems on both sides, so an
 * over-eager stem shows up as a false "the documents are silent" escalation (`ESC4`).
 * Exported because `rules.ts` stems the source text with the same function: two stemmers would be
 * two answers to "is this grounded".
 */
export function stemWord(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function contentWordsOf(match: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of match.split(/[^a-z0-9]+/)) {
    if (token.length < 4) continue;
    if (STOPWORDS.has(token)) continue;
    const stemmed = stemWord(token);
    if (stemmed.length < 4) continue;
    if (seen.has(stemmed)) continue;
    seen.add(stemmed);
    out.push(stemmed);
  }
  return out;
}

function looksCodeShaped(text: string): boolean {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const codeLines = lines.filter((line) =>
    /(^\s{4,}\S)|(=>)|(\bfunction\s*\()|(\bdef\s+\w+\s*\()|(\bconst\s+\w+\s*=)|(\blet\s+\w+\s*=)|(\bSELECT\b[\s\S]*\bFROM\b)|(;)|\{[\s\S]*\}|(\breturn\b)|(\bclass\s+\w+)/i.test(
      line,
    ),
  );
  if (codeLines.length >= 2) return true;
  return /\b(traceback|typeerror|syntaxerror|nullpointerexception|stack trace)\b/i.test(text);
}

/**
 * `DE9` decoding. Returns at most one leetspeak form and every base64 form that decodes to
 * something text-like. `base` preserves case (base64 is case-sensitive) while `match` is the
 * casefolded string the leetspeak substitution works on. Decoded text is only ever re-evaluated by
 * L1; it is never logged and never returned to a student.
 */
function decodedVariants(base: string, match: string): string[] {
  const variants: string[] = [];

  if (/[0134578@$!|+]/.test(match)) {
    const leet = match.replace(/[0134578@$!|+]/g, (ch) => LEET_MAP[ch] ?? ch);
    if (leet !== match) variants.push(leet);
  }

  const candidates = base.match(/[A-Za-z0-9+/]{16,}={0,2}/g) ?? [];
  for (const candidate of candidates) {
    try {
      const decoded = Buffer.from(candidate, 'base64').toString('utf8');
      if (decoded.length < 8) continue;
      const printable = decoded.replace(/[^\x20-\x7E\n]/g, '');
      if (printable.length / decoded.length < 0.9) continue;
      if (!/[a-z]{3}/i.test(printable)) continue;
      const lowered = printable.toLowerCase();
      if (lowered !== match) variants.push(lowered);
    } catch {
      // A candidate that is not valid base64 is not an encoded request. Nothing to record.
    }
  }

  return [...new Set(variants)];
}

/**
 * L0. Pure, deterministic, and cheap: `05` section 3.2 budgets it under 1 ms.
 */
export function normaliseTurn(raw: string): NormalisedTurn {
  const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
  const empty = raw.trim().length === 0;
  const oversize = raw.length > GUARDRAIL_INPUT_CAP_CHARS;

  const codeBlocks: string[] = [];
  const withoutFences = raw.replace(FENCED_CODE, (block) => {
    codeBlocks.push(block);
    return ' [code block] ';
  });

  // `base` keeps the original case, because base64 is case-sensitive; `match` is casefolded for
  // matching only (`05` section 3.2 L0). Decoding the already-lowercased string would silently
  // turn every mixed-case encoding into garbage, which is the hole `DE9` exists to close.
  const base = withoutFences
    .normalize('NFKC')
    .replace(INVISIBLE_CONTROLS, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = base.toLowerCase();

  const clauses = match
    .split(/[.!?;:\n]+|\s+-\s+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);

  return {
    raw,
    match,
    clauses: clauses.length > 0 ? clauses : [match],
    tokens: match.split(/\s+/).filter((token) => token.length > 0),
    codeBlocks,
    hasCodeBlock: codeBlocks.length > 0,
    codeShaped: codeBlocks.length > 0 || looksCodeShaped(withoutFences),
    variants: decodedVariants(base, match),
    contentWords: contentWordsOf(match),
    hash,
    empty,
    oversize,
  };
}
