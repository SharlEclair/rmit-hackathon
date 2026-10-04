import Link from 'next/link';
import { notFound } from 'next/navigation';

import { QueryThreadActions } from '@/components/query-thread-actions';
import { buildQueryThread, ownsQuery } from '@/features/queries/service';
import { queryViewerFor } from '@/features/queries/routes';
import {
  formatDateTime,
  queryStatusWord,
  queryTitle,
} from '@/features/workspace/presentation';
import { findQueryScope } from '@/lib/db/queries/query-threads';
import { withTransaction } from '@/lib/db/transaction';
import { loadWorkspace, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * One private Query thread, as the asking student sees it (`07` UI-UX-SPEC sections 4.4 and 5.1).
 *
 * **A thread that is not this student's is `NOT_FOUND`, not a refusal, and this page is the third place
 * that rule has to hold.** The route checks it with `ownsQuery`; the page checks it again because a
 * page is a second, independent entry point. Confirming the thread exists would tell one student that
 * another student's question id is real (`06` section 9.2's T-12).
 *
 * **The assignment in the URL is checked against the thread's own assignment.** Otherwise a student
 * who can see assignment A could open one of their own threads from assignment B under A's URL.
 *
 * **A Query is always attributed** (D24, D50): every message renders its author's display name, and
 * there is no anonymity machinery anywhere on this path. That contrast with the Discussion thread next
 * door is the product decision, not an inconsistency.
 */
export default async function QueryThreadPage(props: {
  readonly params: Promise<{ assignmentId: string; queryId: string }>;
}) {
  const { assignmentId, queryId } = await props.params;
  const base = `/student/assignments/${assignmentId}/queries`;
  const session = await requireStudentPage(`${base}/${queryId}`);
  // The gate runs before anything is read, so an unpublished assignment is a `404` even though the
  // thread id is addressable (trap T3).
  await loadWorkspace(session, assignmentId);

  const viewer = queryViewerFor(session);
  if (viewer === null) notFound();

  const thread = await withTransaction(async (tx) => {
    const scope = await findQueryScope(tx, queryId);
    if (scope === null || scope.assignmentId !== assignmentId) return null;
    if (!(await ownsQuery(tx, queryId, viewer))) return null;
    return buildQueryThread(tx, queryId);
  });
  if (thread === null) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href={base} className="tight text-muted no-underline">
        Back to My Queries
      </Link>

      <header className="flex flex-col gap-2">
        <h2 className="heading-2 text-ink">{queryTitle(thread.subject)}</h2>
        <p className="ui-sm text-muted">
          {queryStatusWord(thread.status)}
          {formatDateTime(thread.createdAt) === null
            ? ''
            : ` - you asked ${String(formatDateTime(thread.createdAt))}`}
        </p>
        {/* Section 5.4 rule 4: the thread states its visibility once. */}
        <p className="tight text-muted">Private between you and the tutors of this course.</p>
      </header>

      <ul className="flex flex-col gap-4">
        {thread.messages.map((message) => (
          <li
            key={message.id}
            className="flex flex-col gap-2 rounded-card border border-solid border-default bg-card p-4"
          >
            <p className="ui-sm text-muted">
              {message.authorRole === 'student' ? 'You' : message.authorDisplayName}
              {formatDateTime(message.createdAt) === null
                ? ''
                : ` - ${String(formatDateTime(message.createdAt))}`}
            </p>
            <p className="body text-ink">{message.body}</p>
            {message.publishedAsFaqEntryId === null ? null : (
              <p className="tight text-muted">Published by your tutor in the official FAQ</p>
            )}
          </li>
        ))}
      </ul>

      <QueryThreadActions queryId={thread.id} status={thread.status} />
    </div>
  );
}
