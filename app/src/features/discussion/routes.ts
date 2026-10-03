/**
 * The two things every discussion route needs before it can call the feature: the caller as the feature
 * sees them, and the anonymisation secret.
 *
 * **Why this is not exported from a route file.** A Next route module should export its handlers and its
 * config and nothing else -- the same reason `features/assistant/stream.ts` exists instead of the frames
 * being built inside the SSE route. A helper exported from a route is also a helper that a second route
 * imports from a *different* route's module, which makes the import graph say a route depends on another
 * route rather than on a feature.
 */

import type { SessionContext } from '@/lib/auth/roles';
import { getConfig } from '@/lib/config';
import type { DiscussionViewer } from '@/features/discussion/service';

/**
 * The guarded pair a discussion route holds after its guard succeeded.
 *
 * `assignmentId` is the **only** scope field this needs, and typing it structurally rather than as
 * `VisibleScope` is deliberate: `guardTutorAssignment` returns an `AssignmentScope` and
 * `guardStudentVisibleAssignment` a `VisibleScope`, and the two are different shapes with different
 * meanings. Requiring either one would force the other route group to fabricate the missing fields.
 */
export interface DiscussionGuardValue {
  readonly session: SessionContext;
  readonly scope: { readonly assignmentId: string };
}

/**
 * A missing `ANON_ID_SECRET` is a configuration fault. The value itself is never reported (C7), and
 * `null` is what a route turns into `INTERNAL`.
 */
export function readAnonIdSecret(): string | null {
  try {
    return getConfig().anonIdSecret;
  } catch {
    return null;
  }
}

/**
 * The viewer the feature needs, or `null` when the secret is missing.
 *
 * **`scope` is the union of the two guard shapes, and the union is the point.** `06` section 5.2 makes
 * the role per **course** (`enrollments.role_in_course`): a user who tutors one course and studies
 * another has both, and the global role would be wrong for one of them. So every route group passes the
 * answer its own guard implies rather than the session's role.
 *
 * `assignmentId` is read from whichever field the guard produced: `VisibleScope` names it
 * `assignmentId`, and `AssignmentScope` names it `id` because a tutor's scope carries the whole
 * assignment record. One `??` is cheaper and clearer than forcing one guard to reshape the other's
 * output.
 */
export function viewerFor(
  value: {
    readonly session: { readonly userId: string };
    readonly scope: { readonly assignmentId?: string; readonly id?: string };
  },
  role: 'student' | 'tutor',
): DiscussionViewer | null {
  const anonIdSecret = readAnonIdSecret();
  if (anonIdSecret === null) return null;
  const assignmentId = value.scope.assignmentId ?? value.scope.id;
  if (assignmentId === undefined) return null;
  return {
    userId: value.session.userId,
    assignmentId,
    anonIdSecret,
    isTutor: role === 'tutor',
  };
}
