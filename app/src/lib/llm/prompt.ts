/**
 * Prompt assembly: one module owns the order, so every capability gets the same cache-stable prefix.
 *
 * The rule this file exists to enforce (`04` section 5.5): **stable content first, variable content
 * last, and nothing that changes per turn above the variable boundary.**
 *
 * ```text
 * [ A. STATIC PLATFORM BLOCK ]    identical for every request, forever
 * [ B. STATIC ASSIGNMENT POLICY ] identical for every request in one assignment
 * [ C. SEMI-STATIC GROUNDING ]    changes only when sources or approvals change
 * [ D. VARIABLE BLOCK ]           changes every turn, must be last
 * ```
 *
 * Two consequences are deliberate and are the reason this is not left to each call site:
 *
 * 1. **A and B are byte-identical across requests in the same scope**, because they are rendered
 *    from an ordered list and never from an object spread or a `JSON.stringify` of a set. Object
 *    key order is not something a later refactor can be trusted to preserve, and a prefix that
 *    drifts by one byte is a cache miss on every call -- a cost and latency change that no test
 *    would notice (section 5.5 rules 1-2).
 * 2. **Nothing derived from student input can appear in A or B.** They are arguments to this
 *    function, not fields of one request object, so a caller cannot accidentally splice a student
 *    turn into the static prefix. That is both the cache rule and a control.
 *
 * `systemPrefixId` is `<capability>-v<n>` (section 5.5 rule 3). Changing a block A or B string
 * means bumping `n`, and a prefix change requires re-running the guardrail golden set
 * (`05` section 11).
 */

import type { AiCapability, LlmMessage } from './types';

/** One retrieved T1-T3 fragment, in the shape the grounding block renders. */
export interface GroundingChunk {
  readonly id: string;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly sectionLabel: string | null;
  readonly text: string;
}

export interface PromptAssembly {
  readonly systemPrefixId: string;
  readonly staticPlatform: string;
  readonly staticPolicy: string;
  readonly grounding: string;
  readonly variable: string;
}

/** `<capability>-v<n>` (`04` section 5.5 rule 3). */
export function systemPrefixId(capability: AiCapability, version: number): string {
  return `${capability}-v${version}`;
}

/**
 * Assemble the two messages.
 *
 * A and B go in the `system` role and C and D in the `user` role, in that order, because a
 * provider's cache is a prefix of the whole request: the later the first variable byte, the larger
 * the cacheable prefix.
 */
export function assembleMessages(assembly: PromptAssembly): LlmMessage[] {
  return [
    {
      role: 'system',
      content: [{ type: 'text', text: `${assembly.staticPlatform}\n\n${assembly.staticPolicy}` }],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: `${assembly.grounding}\n\n${assembly.variable}` }],
    },
  ];
}

/**
 * Render an ordered list of `[key, value]` pairs as JSON, preserving **insertion order**.
 *
 * `JSON.stringify` over an object literal preserves insertion order for string keys today, but it
 * is not a documented guarantee for integer-like keys, and a policy rendered from a database row
 * may well have numeric-looking rule codes. Taking an explicit ordered list removes the question.
 */
export function renderStableJson(entries: ReadonlyArray<readonly [string, string]>): string {
  const body = entries
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n  ');
  return `{\n  ${body}\n}`;
}

/**
 * Render the grounding block with **positional** references.
 *
 * The numbering here is the contract the model is given and the pipeline honours: `[#0]` in a
 * response means "the chunk at index 0 of the list I sent you", which the pipeline resolves back to
 * a real `source_chunks.id`. See the header of `schema.ts` for why an index is safer than asking a
 * model to echo a UUID.
 */
export function renderGroundingChunks(chunks: readonly GroundingChunk[]): string {
  if (chunks.length === 0) {
    return 'GROUNDING CHUNKS: none. The assignment documents contained no retrievable text.';
  }
  const lines = chunks.map((chunk, index) => {
    const page = describePage(chunk.pageFrom, chunk.pageTo);
    const section = chunk.sectionLabel === null ? '' : `, "${chunk.sectionLabel}"`;
    return `[#${index}] (${page}${section})\n${chunk.text}`;
  });
  return `GROUNDING CHUNKS (verbatim T1 extracts):\n\n${lines.join('\n\n')}`;
}

function describePage(from: number | null, to: number | null): string {
  if (from === null) return 'no page anchor';
  if (to === null || to === from) return `page ${from}`;
  return `pages ${from}-${to}`;
}

/** What `parseGroundingChunks` can recover: everything but the chunk id, which the caller holds. */
export interface ParsedGroundingChunk {
  /** The `[#N]` index -- the value a model echoes as `sourceChunkRef`. */
  readonly ref: number;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly sectionLabel: string | null;
  readonly text: string;
}

/**
 * The inverse of `renderGroundingChunks`, for the mock provider (`mock.ts`).
 *
 * This exists so the offline path can synthesise a proposal that is **grounded in the chunks the
 * request actually carried**, instead of a canned answer whose quoted text matches nothing. Without
 * it, `LLM_PROVIDER=mock` could only ever return fixtures keyed to one database's chunk ids, and the
 * "whole loop walkable offline" requirement (`04` section 5.8 rule 4) would hold only for the
 * seeded rows it was captured against.
 *
 * A chunk id is deliberately not recoverable: `[#N]` is a position in the request, and the pipeline
 * is the only thing that knows which `source_chunks.id` it sent at position N. That is the same
 * rule the model is held to (see `schema.ts`).
 */
export function parseGroundingChunks(text: string): ParsedGroundingChunk[] {
  const headerIndex = text.indexOf('GROUNDING CHUNKS');
  if (headerIndex < 0) return [];
  const body = text.slice(headerIndex);
  const parts = body.split(/\n\n(?=\[#\d+\] \()/);
  const chunks: ParsedGroundingChunk[] = [];
  for (const part of parts) {
    const match = /^\[#(\d+)\] \(([^)]*)\)\n([\s\S]*)$/.exec(part.trimStart());
    if (match === null) continue;
    const ref = Number(match[1]);
    const descriptor = match[2] ?? '';
    const chunkText = match[3] ?? '';
    if (!Number.isSafeInteger(ref) || chunkText.trim() === '') continue;
    const pages = /^(?:page (\d+)|pages (\d+)-(\d+))/.exec(descriptor);
    const label = /, "([^"]*)"\)?$/.exec(descriptor);
    chunks.push({
      ref,
      pageFrom: pages === null ? null : Number(pages[1] ?? pages[2]),
      pageTo: pages === null ? null : Number(pages[2] === undefined ? pages[1] : pages[3]),
      sectionLabel: label === null ? null : (label[1] ?? null),
      text: chunkText.trimEnd(),
    });
  }
  return chunks;
}
