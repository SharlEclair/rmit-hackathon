import { DiscussionComposer } from '@/components/discussion-composer';
import { EmptyState } from '@/components/ui/empty-state';
import { viewerFor } from '@/features/discussion/routes';
import { buildStudentDiscussion } from '@/features/discussion/service';
import { withTransaction } from '@/lib/db/transaction';
import { loadWorkspace, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The Discussions tab (`07` UI-UX-SPEC section 4.5).
 *
 * **The Official FAQ section is rendered separately and first**, because section 4.5's wireframe puts it
 * above the student discussion and it is a different authority class: T2 published answers versus T4
 * peer prose.
 *
 * **The page now reads and writes.** An earlier revision was a Phase 5 placeholder that rendered
 * `No discussion threads yet. Ask the first question.` with no way to ask it -- the API and the service
 * were both built and routed (WP-10), so the empty state was promising an action the product did not
 * offer. It now lists the threads the server returns and carries the composer that creates them.
 *
 * **The list is read from the API rather than the workspace bundle.** `loadWorkspace` is the student
 * workspace bootstrap and does not carry threads; `GET .../discussions` is the contract for them, and
 * this page calls the same builder the route does through the shared query layer. The response is
 * already gated: `buildStudentDiscussion` applies the published/reviewed rule, so a thread awaiting
 * moderation is not in this list and the page cannot leak one.
 */
export default async function DiscussionsTabPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireStudentPage(`/student/assignments/${assignmentId}/discussions`);
  const { workspace, scope } = await loadWorkspace(session, assignmentId);

  /**
   * The threads, read through the same builder the route uses.
   *
   * `buildStudentDiscussion` applies the visibility rule itself, so a thread still awaiting moderation
   * cannot reach this page by being passed in -- the page does not filter, it receives an already-gated
   * list. The viewer is resolved by `viewerFor`, which is the union of the guard scopes the routes use,
   * so a student sees their own threads marked as their own and everyone else's as anonymous.
   */
  const viewer = viewerFor({ session, scope }, 'student');
  const discussion =
    viewer === null
      ? { officialFaq: [], threads: [] }
      : await withTransaction((tx) => buildStudentDiscussion(tx, scope, viewer));

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h2 className="heading-2 text-ink">Official FAQ</h2>
        {workspace.officialFaqCount === 0 ? (
          <EmptyState message="No official FAQ entries yet." />
        ) : (
          <p className="rounded-card border border-solid border-default bg-card p-4 body text-ink">
            {workspace.officialFaqCount} official{' '}
            {workspace.officialFaqCount === 1 ? 'answer has' : 'answers have'} been published by your
            tutor.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="heading-2 text-ink">Student discussion</h2>
        <p className="tight text-muted">
          Ask your cohort. Threads are anonymous by default, and your tutor cannot see who asked.
        </p>
        <DiscussionComposer assignmentId={assignmentId} />

        {discussion.threads.length === 0 ? (
          <EmptyState message="No discussion threads yet. Ask the first question above." />
        ) : (
          <ul className="flex flex-col gap-4">
            {discussion.threads.map((thread) => (
              <li key={thread.id}>
                <div className="flex flex-col gap-2 rounded-card border border-solid border-default bg-card p-4">
                  <p className="heading-3 text-ink">{thread.title}</p>
                  <p className="ui-sm text-muted">
                    {thread.author.displayLabel}
                    {thread.isOwnThread ? ' (you)' : ''} - {thread.postCount}{' '}
                    {thread.postCount === 1 ? 'post' : 'posts'}
                  </p>
                  {thread.posts.length === 0 ? null : (
                    <p className="body text-ink">{thread.posts[0]?.body}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
