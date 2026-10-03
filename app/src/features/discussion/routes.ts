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
import type { Executor } from '@/lib/db/queries/courses';
import { getLlmClient } from '@/lib/llm';
import type { DiscussionViewer } from '@/features/discussion/service';
import { moderatePost, type ModerationHook } from '@/features/discussion/moderation';

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

/**
 * The moderation hook a discussion route passes to `createPost` or `createThread`.
 *
 * **It never throws, and that is the point.** `moderatePost` already converts a provider error, a schema
 * failure, a `content_filter` refusal and a timeout into `05` section 9.4 binding rule 5's severity-2
 * outcome. This wrapper handles the one thing left: a fault *outside* that conversion -- a database error
 * while writing the flags, say -- and it must not fail the student's post for it. So a throw is caught and
 * turned into `mark` (flagged, visible), the same action the in-service failure path uses, because the
 * alternative would be either losing the post or publishing it unexamined. Binding rule 5 forbids both.
 *
 * **The `sessionId` is the assignment id**, so `llm/budget.ts`'s `moderation_batch` scope accumulates per
 * assignment rather than per post. `04` section 9.2 step 12 counts a moderation pass as a batch, and one
 * budget per post would make the ceiling meaningless.
 *
 * **A client that cannot be constructed is also caught.** `getLlmClient()` throws when the configuration is
 * unusable, which on a moderation path must degrade to "flagged and visible" rather than to a `500` on a
 * student's post.
 */
export function moderatorHookFor(input: {
  readonly assignmentId: string;
  readonly assignmentTitle: string;
  readonly grounding: string;
}): ModerationHook {
  return async (postId: string, postBody: string, ex: Executor) => {
    try {
      const result = await moderatePost(ex, getLlmClient(), {
        postId,
        assignmentId: input.assignmentId,
        assignmentTitle: input.assignmentTitle,
        grounding: input.grounding,
        postBody,
        modelId: getConfig().llmModelReasoning ?? getConfig().llmProvider,
        sessionId: input.assignmentId,
      });
      return { action: result.action };
    } catch {
      return { action: 'mark' as const };
    }
  };
}

/**
 * The assignment's title, for the moderator's prompt, or `null`.
 *
 * The moderator is asked whether a post is **off-topic**, which needs something to be off from; without a
 * title the category cannot be judged and every post looks plausibly related. `null` is passed through
 * rather than substituted, because the prompt's `Assignment:` line should say nothing rather than say
 * something false -- a fabricated title would make an off-topic judgement unfalsifiable.
 */
export async function readAssignmentTitle(
  ex: Executor,
  assignmentId: string,
): Promise<string | null> {
  const rows = await ex<{ title: string }[]>`
    select title from assignments where id = ${assignmentId}::uuid limit 1
  `;
  return rows[0]?.title ?? null;
}
