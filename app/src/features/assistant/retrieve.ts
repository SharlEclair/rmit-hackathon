/**
 * Grounding retrieval: Postgres full-text search over the assignment's source chunks, then a
 * stable-order fill (`04-TECH-ARCHITECTURE.md` section 6, D38).
 *
 * **Two properties this module exists to hold.**
 *
 * 1. **Published only, and structurally so.** The function takes a `VisibleScope`, which can only be
 *    produced by `findVisibleAssignmentScope` (gate rule G1). There is deliberately no
 *    `retrieveGroundingChunks(assignmentId)`: a caller that could retrieve by assignment id could
 *    retrieve before the gate ran, which is trap T3's shape. T2 and T3 content is read through the
 *    published-only readers of `student-visibility.ts` and handed to `context.ts`; nothing here
 *    relaxes a `publication_status` filter, and nothing here can return an unpublished artifact
 *    because it never selects one.
 * 2. **"No keyword match" is not "no grounding".** `plainto_tsquery` on a stop-word-only turn
 *    yields an empty query and therefore zero rows. Falling back to the stable T1 order means the
 *    model still sees the brief and the rubric, and `POST_UNSOURCED` still has a retrieved set to
 *    check a citation against. A retrieval miss that emptied the grounding block would turn an
 *    ordinary phrasing into an unsourced answer.
 *
 * The order of the returned chunks is the authority order `listT1Chunks` defines (brief, rubric,
 * policy, then the rest, then chunk index), and it is also the citation numbering (`context.ts`).
 */

import type { Executor } from '@/lib/db/queries/courses';
import type { VisibleScope } from '@/lib/db/queries/student-visibility';
import { listT1Chunks } from '@/lib/db/queries/assignments';
import { searchSourceChunks } from '@/lib/db/queries/assistant';

import type { GroundingChunkInput } from './context';

/** How many T1 chunks one turn's block C may carry. */
export const ASSISTANT_RETRIEVAL_LIMIT = 12;

export interface RetrievalResult {
  readonly chunks: GroundingChunkInput[];
  /** The ids the post-check's `POST_UNSOURCED` compares a citation against. */
  readonly chunkIds: string[];
  /**
   * `full_text` when the turn matched at least one chunk, `stable_order` when the query matched
   * nothing and the block was filled from the stable T1 order instead.
   */
  readonly mode: 'full_text' | 'stable_order';
}

export async function retrieveGroundingChunks(
  ex: Executor,
  scope: VisibleScope,
  query: string,
  limit: number = ASSISTANT_RETRIEVAL_LIMIT,
): Promise<RetrievalResult> {
  const matches = await searchSourceChunks(ex, {
    assignmentId: scope.assignmentId,
    query,
    limit,
  });

  const chunks: GroundingChunkInput[] = matches.map((chunk) => ({
    id: chunk.id,
    sourceKind: chunk.sourceKind,
    text: chunk.text,
    pageFrom: chunk.pageFrom,
    pageTo: chunk.pageTo,
    sectionLabel: chunk.sectionLabel,
  }));

  if (chunks.length >= limit) {
    return { chunks, chunkIds: chunks.map((chunk) => chunk.id), mode: 'full_text' };
  }

  // Fill from the stable order. `listT1Chunks` is the same read the Analyst's grounding uses, so
  // block C stays cache-stable for a turn whose query matched nothing.
  const present = new Set(chunks.map((chunk) => chunk.id));
  const stable = await listT1Chunks(ex, scope.assignmentId);
  for (const chunk of stable) {
    if (chunks.length >= limit) break;
    if (present.has(chunk.id)) continue;
    present.add(chunk.id);
    chunks.push({
      id: chunk.id,
      sourceKind: chunk.sourceKind,
      text: chunk.text,
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo,
      sectionLabel: chunk.sectionLabel,
    });
  }

  return {
    chunks,
    chunkIds: chunks.map((chunk) => chunk.id),
    mode: matches.length > 0 ? 'full_text' : 'stable_order',
  };
}
