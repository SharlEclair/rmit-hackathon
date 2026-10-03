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
import type { VisibleScope } from '@/lib/db/queries/student-visibility';
import { getConfig } from '@/lib/config';
import type { DiscussionViewer } from '@/features/discussion/service';

/** The guarded pair a discussion route holds after its guard succeeded. */
export interface DiscussionGuardValue {
  readonly session: SessionContext;
  readonly scope: VisibleScope;
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
 * `isTutor` is passed in rather than read from `session.role`, because `06` section 5.2 makes the role
 * per **course** (`enrollments.role_in_course`): a user who tutors one course and studies another has
 * both, and the global role would be wrong for one of them. Each route group knows which guard it ran,
 * so each passes the answer that guard implies.
 */
export function viewerFor(
  value: DiscussionGuardValue,
  role: 'student' | 'tutor',
): DiscussionViewer | null {
  const anonIdSecret = readAnonIdSecret();
  if (anonIdSecret === null) return null;
  return {
    userId: value.session.userId,
    assignmentId: value.scope.assignmentId,
    anonIdSecret,
    isTutor: role === 'tutor',
  };
}
