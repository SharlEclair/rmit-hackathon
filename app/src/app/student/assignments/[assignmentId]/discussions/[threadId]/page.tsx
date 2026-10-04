import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DiscussionReplyComposer } from '@/components/discussion-reply-composer';
import { Badge } from '@/components/ui/badge';
import { viewerFor } from '@/features/discussion/routes';
import { buildThreadDetail } from '@/features/discussion/service';
import { formatDateTime } from '@/features/workspace/presentation';
import { findThread } from '@/lib/db/queries/discussions';
import { withTransaction } from '@/lib/db/transaction';
import { loadWorkspace, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * One Discussion thread (`07` UI-UX-SPEC section 6.2).
 *
 * **This closes the gap `01-STATE.md` section 5 records.** `buildThreadDetail`, `listPosts` and
 * `createPost` were all built and routed; what was missing was the screen, so a student could see a
 * thread's title and first post in the list and had no way to open it or reply. This is the missing
 * front end rather than new capability.
 *
 * **Order: find the thread, check it belongs to this assignment, then read.** The path addresses the
 * thread, so trusting the assignment id from the URL -- or ignoring it -- would let this page render a
 * thread from another assignment under a URL that claims otherwise. The same order the API route uses is
 * repeated here deliberately: a page that skipped it would be a second, weaker path to the same read.
 *
 * **The anonymity rules are applied by the builder, not by this page.** `body` is already `null` for a
 * hidden post the viewer may not read and for a removed post, and the author object carries only
 * `isAnonymised` and `displayLabel` (A-ID-5). So the page renders what it is given and never decides
 * who may see what.
 */
export default async function DiscussionThreadPage(props: {
  readonly params: Promise<{ assignmentId: string; threadId: string }>;
}) {
  const { assignmentId, threadId } = await props.params;
  const base = `/student/assignments/${assignmentId}/discussions`;
  const session = await requireStudentPage(`${base}/${threadId}`);
  const { scope } = await loadWorkspace(session, assignmentId);

  const viewer = viewerFor({ session, scope }, 'student');
  if (viewer === null) notFound();

  const thread = await withTransaction(async (tx) => {
    const located = await findThread(tx, threadId);
    if (located === null || located.assignmentId !== assignmentId) return null;
    return buildThreadDetail(tx, threadId, viewer);
  });
  if (thread === null) notFound();

  /**
   * Section 6.2 rule 1: "Replies to replies render flat, in time order, with the parent quoted in one
   * line." A direct reply to the thread's opening post is already one level deep, so only a post whose
   * parent is itself a reply carries the quotation -- rendering it on every reply would put a line of
   * noise under each one and make the deeper case indistinguishable from the shallow one.
   */
  const quotedParentLabel = (parentPostId: string | null): string | null => {
    if (parentPostId === null) return null;
    const parent = thread.posts.find((candidate) => candidate.id === parentPostId);
    if (parent === undefined || parent.parentPostId === null) return null;
    return parent.author.displayLabel;
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href={base} className="tight text-muted no-underline">
        Back to Discussions
      </Link>

      <header className="flex flex-col gap-2">
        <h2 className="heading-2 text-ink">{thread.title}</h2>
        <p className="ui-sm text-muted">
          {thread.author.displayLabel}
          {thread.isOwnThread ? ' (you)' : ''}
          {formatDateTime(thread.createdAt) === null
            ? ''
            : ` - ${String(formatDateTime(thread.createdAt))}`}
        </p>
        {thread.status === 'locked' ? (
          <p className="tight text-muted">This discussion is locked.</p>
        ) : null}
        {thread.status === 'removed' ? (
          <p className="tight text-muted">This discussion was removed by a tutor.</p>
        ) : null}
      </header>

      <ul className="flex flex-col gap-4">
        {thread.posts.map((post) => {
          const removed = post.status === 'removed';
          const quotedParent = quotedParentLabel(post.parentPostId);
          return (
            <li
              key={post.id}
              className="flex flex-col gap-2 rounded-card border border-solid border-default bg-card p-4"
            >
              {/*
                Section 6.2 rule 3: an accepted peer answer "keeps the peer-content badge and adds
                `Accepted response - approved by your tutor`. It is never rendered with the T2
                treatment, because it is still T4."
              */}
              {post.acceptedAnswerStatus === 'approved' ? <Badge variant="peer" /> : null}

              <p className="ui-sm text-muted">
                {post.author.displayLabel}
                {post.isOwnPost ? ' (you)' : ''}
                {formatDateTime(post.createdAt) === null
                  ? ''
                  : ` - ${String(formatDateTime(post.createdAt))}`}
              </p>

              {quotedParent === null ? null : (
                <p className="tight text-muted">{`In reply to ${quotedParent}`}</p>
              )}

              {/*
                Rule 6 (removed) and the hidden state of section 6.4 both arrive here as a `null` body.
                The distinction is the status, and each has its own fixed sentence: a tombstone and a
                review note are different facts, so neither is rendered as the other.
              */}
              {post.body === null ? (
                <p className="body text-muted">
                  {removed ? 'This post was removed by a tutor.' : 'Hidden pending tutor review.'}
                </p>
              ) : (
                <p className="body text-ink">{post.body}</p>
              )}

              {post.editedAt === null ? null : (
                <p className="tight text-muted">
                  {`Edited ${String(formatDateTime(post.editedAt) ?? '')}`}
                </p>
              )}

              {post.status === 'hidden_pending_review' && post.body !== null ? (
                <p className="tight text-muted">
                  Only you and your tutors can see this while it is reviewed.
                </p>
              ) : null}

              {post.acceptedAnswerStatus === 'approved' ? (
                <p className="tight text-muted">Accepted response - approved by your tutor</p>
              ) : null}

              {post.isOwnPost && post.author.isAnonymised ? (
                <p className="tight text-muted">You posted this anonymously.</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Anonymity is the thread's, so the reply composer has no toggle (section 6.1 rule 4). */}
      <DiscussionReplyComposer threadId={threadId} closed={thread.status !== 'open'} />
    </div>
  );
}
