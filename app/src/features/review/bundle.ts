/**
 * The review bundle (`06` section 5.5.8), assembled from the query layer.
 *
 * **Why this is a feature module and not the route body.** Two callers need the same shape: the
 * review screen's `GET /api/tutor/assignments/{assignmentId}/review`, and the PATCH route, which
 * returns `ReviewArtifactResponse` and must shape it identically. The interesting work --
 * recomputing validation, computing the tier, deciding the gates -- is pure and belongs where a test
 * can call it without a request. The route's job is authorisation, status codes and serialisation.
 *
 * **`ingestion: null` is a real state, not a placeholder.** `06` section 5.5.8: "`null` at the bundle
 * level means no run has ever been requested". Handoff **I-39** records that the `GET .../ingest`
 * route cannot express that state in its own response type, which is why that route answers `404`
 * and this one answers `null`: the bundle has somewhere to put it, the polling shape does not.
 *
 * **Sequential queries, deliberately.** These reads share one transaction handle, and postgres.js
 * serialises statements on it; issuing them with `Promise.all` would interleave them on one
 * connection for no gain. The bundle is one screen, not a hot path.
 */

import type { AssignmentSourceResponse, ReviewBundleResponse } from '@/lib/api/types';
import type { AssignmentSourceSummary } from '@/lib/db/queries/assignments';
import { listSources } from '@/lib/db/queries/assignments';
import type { Executor } from '@/lib/db/queries/courses';
import { findLatestJob, toIngestionStatusResponse } from '@/lib/db/queries/ingestions';
import {
  listAmbiguityFindings,
  listReviewArtifacts,
  readAssignmentHeader,
  readGateInputs,
  readPublicationCounts,
} from '@/lib/db/queries/review';
import { computeGates } from './gates';
import { inferReviewArtifact } from './mappers';

/**
 * The whole review bundle, or `null` when the assignment does not exist.
 *
 * `null` is deliberately distinct from an empty bundle: a route that returned an empty bundle for a
 * missing assignment would answer `200` for a resource that is not there (`06` section 5.2 makes
 * `NOT_FOUND` the answer for anything the caller may not see).
 */
export async function buildReviewBundle(
  ex: Executor,
  assignmentId: string,
): Promise<ReviewBundleResponse | null> {
  const header = await readAssignmentHeader(ex, assignmentId);
  if (header === null) return null;

  const structureId = header.currentStructureId;
  const sources = await listSources(ex, assignmentId);
  const counts = await readPublicationCounts(ex, assignmentId, structureId);
  const artifactRows = await listReviewArtifacts(ex, assignmentId, structureId);
  const findings = await listAmbiguityFindings(ex, assignmentId);
  const job = await findLatestJob(ex, assignmentId);
  const gateInputs = await readGateInputs(ex, assignmentId, structureId);

  const artifacts = artifactRows.map(inferReviewArtifact);

  return {
    assignment: {
      id: header.id,
      title: header.title,
      status: header.status,
      dueAt: header.dueAt,
      currentStructureId: structureId,
    },
    ingestion: job === null ? null : toIngestionStatusResponse(job),
    sources: sources.map(toSourceResponse),
    counts,
    artifacts,
    ambiguityFindings: findings,
    gates: computeGates(header.status, gateInputs, artifacts),
  };
}

/** `06` section 5.4's `AssignmentSourceResponse`. `storageKey` is absent by contract (I-7). */
export function toSourceResponse(source: AssignmentSourceSummary): AssignmentSourceResponse {
  return {
    id: source.id,
    kind: source.kind,
    originalFilename: source.originalFilename,
    mimeType: source.mimeType,
    byteSize: source.byteSize,
    pageCount: source.pageCount,
    extractionStatus: source.extractionStatus,
    extractionError: source.extractionError,
    createdAt: source.createdAt,
  };
}
