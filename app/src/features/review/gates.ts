/**
 * The review screen's gates (`06` section 5.5.8's `gates`; `07` section 7.3 rule 10, section 7.4).
 *
 * The gates are what stops the two failure modes the approval boundary exists to prevent:
 *
 *   1. **Publishing nothing, or publishing an assignment no tutor sanctioned.** A published
 *      assignment with no milestone renders a broken student workspace, and a published assignment
 *      with no approved AI Usage Policy makes the Assistant unavailable for every student (D47) --
 *      so the refusal beat of the demo cannot happen. Both are publish blockers, so publish is
 *      refused rather than silently producing an unusable assignment.
 *   2. **Publishing a milestone with no requirement link.** `06` section 7.2.8 makes every milestone
 *      link to at least one requirement before publish; a milestone with none is a structure that
 *      claims to be a plan with nothing behind it.
 *
 * The SQL half of the input is `readGateInputs` in `src/lib/db/queries/review.ts`; the validation half
 * comes from the artifacts the route already built. Keeping the decision here -- pure, no database --
 * is what makes it testable without one, and lets the review screen explain a blocker instead of
 * only disabling a button.
 */

import type {
  PublishBlocker,
  PublicationStatusApi,
  ReviewArtifactResponse,
  ReviewBundleResponse,
} from '@/lib/api/types';
import type { GateInputs } from '@/lib/db/queries/review';

/** The assignment statuses a further ingestion run makes sense from. */
const INGESTABLE_STATUSES = ['draft', 'in_review'] as const;

export function computeGates(
  assignmentStatus: ReviewBundleResponse['assignment']['status'],
  inputs: GateInputs,
  artifacts: readonly ReviewArtifactResponse[],
): ReviewBundleResponse['gates'] {
  const publishBlockers: PublishBlocker[] = [];

  if (inputs.approvedPolicyRuleCount === 0) {
    // `06` section 3.2 transition 7's guard, and D47's reason: without an approved policy rule the
    // Assistant is unavailable, so publishing would ship an assignment whose coach refuses
    // everything.
    publishBlockers.push('NO_POLICY_RULE_APPROVED');
  }
  if (inputs.milestoneCount === 0) {
    // `06` section 5.5.8's `NO_MILESTONE`. A published assignment with no milestone has an empty
    // Checklist and an empty Map (`07` section 4.6's empty state is for a structure that has not
    // been published, not for one that was published empty).
    publishBlockers.push('NO_MILESTONE');
  }
  if (inputs.milestonesWithoutRequirement > 0) {
    // `06` section 7.2.8 / D71's added code.
    publishBlockers.push('MILESTONE_WITHOUT_REQUIREMENT');
  }
  if (hasUnresolvedValidation(artifacts)) {
    // `06` section 3.2 transition 4 requires warnings to be "absent or acknowledged" before
    // approval, so this can only be true for an artifact that was approved and then somehow carries
    // a warning -- which is exactly what a read-time validation recomputation can reveal and a
    // stored flag would hide.
    publishBlockers.push('PENDING_VALIDATION_WARNINGS');
  }

  const hasReviewable = artifacts.some(
    (artifact) =>
      artifact.publicationStatus === 'NEEDS_REVIEW' || artifact.publicationStatus === 'EDITED',
  );

  return {
    canIngest:
      inputs.sourceCount > 0 &&
      inputs.activeJobCount === 0 &&
      INGESTABLE_STATUSES.some((status) => status === assignmentStatus),
    canApprove: hasReviewable,
    canPublish:
      assignmentStatus === 'in_review' &&
      publishBlockers.length === 0 &&
      inputs.approvedArtifactCount > 0,
    publishBlockers,
  };
}

/**
 * Does any artifact that is already approved or published carry a warning?
 *
 * `REJECTED` rows are excluded -- they are retained as evidence (`06` section 3.7) and cannot be
 * published, so their warnings are history rather than a blocker.
 */
function hasUnresolvedValidation(artifacts: readonly ReviewArtifactResponse[]): boolean {
  return artifacts.some(
    (artifact) =>
      isApprovedOrPublished(artifact.publicationStatus) && !artifact.validation.ok,
  );
}

function isApprovedOrPublished(status: PublicationStatusApi): boolean {
  return status === 'APPROVED' || status === 'PUBLISHED';
}
