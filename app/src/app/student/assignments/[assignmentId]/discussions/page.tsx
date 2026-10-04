import Link from 'next/link';

import { DiscussionComposer } from '@/components/discussion-composer';
import { ContentClassPanel } from '@/components/ui/content-class-panel';
import { EmptyState } from '@/components/ui/empty-state';
import { EMPTY_STATE } from '@/components/ui/fixed-strings';
import { StatePanel } from '@/components/ui/state-panel';
import { viewerFor } from '@/features/discussion/routes';
import { buildStudentDiscussion } from '@/features/discussion/service';
import {
  formatDate,
  formatDateTime,
  postCountLabel,
} from '@/features/workspace/presentation';
import { withTransaction } from '@/lib/db/transaction';
import { loadWorkspace, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The Discussions tab (`07` UI-UX-SPEC sections 4.5 and 6.1).
 *
 * **The Official FAQ section is rendered separately and first**, because section 4.5's wireframe puts it
 * above the student discussion and it is a different authority class: T2 published answers versus T4
 * peer prose.
 *
 * **The FAQ now renders the answers, not a count of them.** An earlier revision printed "5 official
 * answers have been published" -- a statement about the list instead of the list -- although
 * `buildStudentDiscussion` already returned every entry with its question and answer. A student could
 * see that answers existed and not one of them, which is the opposite of what an FAQ is for. Each entry
 * is now rendered with the T2 treatment and its own mark of when the tutor published it.
 *
 * **The list is read through the API's own builder rather than the workspace bundle.** `loadWorkspace`
 * is the student workspace bootstrap and does not carry threads; `buildStudentDiscussion` is what
 * `GET .../discussions` calls, so the page and the route cannot disagree. The response is already gated:
 * the builder applies the published/reviewed rule, so a thread awaiting moderation is not in this list
 * and the page cannot leak one.
 */
export default async function DiscussionsTabPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireStudentPage(`/student/assignments/${assignmentId}/discussions`);
  const { scope } = await loadWorkspace(session, assignmentId);

  /**
   * The viewer is the union of the guard scopes the routes use, so a student sees their own threads
   * marked as their own and everyone else's as anonymous. A missing `ANON_ID_SECRET` is a configuration
   * fault rather than an empty list, and it is reported as one: an empty Discussions tab would be a
   * statement about the cohort's activity instead.
   */
  const viewer = viewerFor({ session, scope }, 'student');
  if (viewer === null) {
    return <StatePanel kind="error" message="We could not load the discussions." />;
  }
  const discussion = await withTransaction((tx) => buildStudentDiscussion(tx, scope, viewer));
  const base = `/student/assignments/${assignmentId}/discussions`;

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h2 className="heading-2 text-ink">Official FAQ</h2>
        {discussion.officialFaq.length === 0 ? (
          <EmptyState message="No official FAQ entries yet." />
        ) : (
          <ul className="flex flex-col gap-4">
            {discussion.officialFaq.map((entry) => (
              <li key={entry.id}>
                {/*
                  The T2 treatment, from the one component that owns it. The date is read from the
                  entry's own `publishedAt`; `an earlier date` is the fallback `policy-card.tsx` uses
                  for the same reason -- a marker line is never rendered with a blank date.
                */}
                <ContentClassPanel
                  contentClass="approved"
                  title={entry.question}
                  publishedOn={formatDate(entry.publishedAt) ?? 'an earlier date'}
                >
                  <p className="body text-ink">{entry.answer}</p>
                </ContentClassPanel>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="heading-2 text-ink">Student discussion</h2>
        <p className="tight text-muted">
          Ask your cohort. Threads are anonymous by default, and your tutor cannot see who asked.
        </p>
        <DiscussionComposer assignmentId={assignmentId} />

        {discussion.threads.length === 0 ? (
          <EmptyState message={EMPTY_STATE.discussions} />
        ) : (
          <ul className="flex flex-col gap-4">
            {discussion.threads.map((thread) => (
              <li key={thread.id}>
                {/*
                  Section 6.1: a thread row shows the title, the opening post's author label, the reply
                  count, and the last reply time. The body itself lives in the thread view, which is
                  what this row now opens -- an earlier revision rendered the first post inline and gave
                  the student no way to reach the rest of the thread or reply to it.
                */}
                <Link
                  href={`${base}/${thread.id}`}
                  className="flex flex-col gap-2 rounded-card border border-solid border-default bg-card p-4 no-underline transition-colors duration-fast ease-out hover:border-ink"
                >
                  <span className="heading-3 text-ink">{thread.title}</span>
                  <span className="ui-sm text-muted">
                    {thread.author.displayLabel}
                    {thread.isOwnThread ? ' (you)' : ''} - {postCountLabel(thread.postCount)}
                    {thread.lastPostAt === null
                      ? ''
                      : ` - last reply ${formatDateTime(thread.lastPostAt) ?? ''}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
