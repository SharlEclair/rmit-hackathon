/**
 * The publish decision (`06` sections 3.4, 5.5.8; transition 7).
 *
 * **Why the blockers are recomputed here rather than trusted from the client.** `07` section 7.4 has
 * the publish dialog list the blockers before the action, but the dialog is a convenience: the same
 * gate has to hold when the request arrives on its own. So this reads the same inputs the review
 * bundle reads and applies the same `computeGates` -- one implementation, two callers.
 *
 * **What a blocked publish answers.** `06` section 5.4 gives this route `INVALID_STATE_TRANSITION`
 * and nothing else, so a refusal names the blockers (or the one non-blocker reason) in the error's
 * `details`, where the UI can show them (`07` section 7.4's blocked state: "the dialog lists the
 * blockers with links to fix each").
 */

import type { PublishBlocker } from '@/lib/api/types';
import type { Executor } from '@/lib/db/queries/courses';
import { listReviewArtifacts, readGateInputs } from '@/lib/db/queries/review';
import { computeGates } from './gates';
import { inferReviewArtifact } from './mappers';

/** Why publish was refused, when no `publishBlockers` entry describes it. */
export type PublishRefusalReason = 'ASSIGNMENT_NOT_IN_REVIEW' | 'NOTHING_APPROVED' | 'NO_STRUCTURE';

export interface PublishDecision {
  readonly ok: true;
  readonly structureId: string;
}

export interface PublishRefusal {
  readonly ok: false;
  readonly blockers: PublishBlocker[];
  readonly reason: PublishRefusalReason | null;
}

export async function computePublishOutcome(
  ex: Executor,
  assignmentId: string,
  header: {
    readonly status: 'draft' | 'ingesting' | 'in_review' | 'published' | 'archived';
    readonly currentStructureId: string | null;
  },
): Promise<PublishDecision | PublishRefusal> {
  const structureId = header.currentStructureId;
  if (structureId === null) {
    // A run that never produced a structure cannot have produced a milestone either, so the honest
    // report is both facts: no structure, and therefore `NO_MILESTONE` as well.
    return { ok: false, blockers: ['NO_MILESTONE'], reason: 'NO_STRUCTURE' };
  }

  const gateInputs = await readGateInputs(ex, assignmentId, structureId);
  const artifacts = (await listReviewArtifacts(ex, assignmentId, structureId)).map(
    inferReviewArtifact,
  );
  const gates = computeGates(header.status, gateInputs, artifacts);

  if (gates.canPublish) return { ok: true, structureId };

  if (gates.publishBlockers.length > 0) {
    return { ok: false, blockers: [...gates.publishBlockers], reason: null };
  }

  // `canPublish` is false with no blockers for exactly two reasons, and calling either of them a
  // validation blocker would send the tutor to fix something that is not wrong.
  if (header.status !== 'in_review') {
    return { ok: false, blockers: [], reason: 'ASSIGNMENT_NOT_IN_REVIEW' };
  }
  return { ok: false, blockers: [], reason: 'NOTHING_APPROVED' };
}
