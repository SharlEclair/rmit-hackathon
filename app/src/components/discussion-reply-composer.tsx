'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * The reply composer on a Discussion thread (`07` UI-UX-SPEC section 6.2).
 *
 * **There is no anonymity toggle here, and that is the rule rather than an omission.** `07` section 6.1
 * puts one anonymous toggle on the composer that *starts* a thread; a reply adopts the thread's own
 * anonymity, because a later named reply would unmask every post before it. The choice is therefore
 * made where the thread is created and displayed here, not re-decided per reply.
 *
 * **Copy.** A failed post reports "Your post was not sent. Nothing was posted." (section 4.5's error
 * row), which is what makes "nothing changed" a statement rather than a reassurance.
 */
export interface DiscussionReplyComposerProps {
  readonly threadId: string;
  /** A locked or removed thread accepts no new posts (`07` section 6.2 rule 4). */
  readonly closed?: boolean;
}

export function DiscussionReplyComposer(props: DiscussionReplyComposerProps): React.ReactElement {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (props.closed === true) {
    return (
      <p className="rounded-card border border-solid border-default bg-card p-4 body text-muted">
        This discussion is closed to new posts.
      </p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/student/discussion-threads/${props.threadId}/posts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ body, parentPostId: null }),
      });
      if (!response.ok) {
        setError('Your post was not sent. Nothing was posted.');
        return;
      }
      setBody('');
      // A high-severity moderation flag hides the post pending review, so the honest report is the
      // one the server decided rather than an optimistic "posted".
      const created = (await response.json()) as { status?: string };
      setNotice(
        created.status === 'hidden_pending_review'
          ? 'Your reply was submitted and is waiting for your tutor to review it.'
          : 'Your reply is posted.',
      );
      router.refresh();
    } catch {
      setError('Your post was not sent. Nothing was posted.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-card border border-solid border-default bg-card p-4"
    >
      <div className="flex flex-col gap-2">
        <label className="ui-sm text-muted" htmlFor="discussion-reply">
          Reply
        </label>
        <textarea
          id="discussion-reply"
          required
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          placeholder="Add what you found, or answer someone else."
          className="rounded-control border border-solid border-default bg-card px-3 py-2 body text-ink"
        />
      </div>

      {error === null ? null : (
        <p role="alert" className="tight text-error">
          {error}
        </p>
      )}
      {notice === null ? null : (
        <p role="status" className="tight text-info">
          {notice}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className={cn(
            'rounded-control border border-solid border-default bg-ink px-4 py-2 tight text-inverse',
            pending ? 'opacity-60' : null,
          )}
        >
          {pending ? 'Posting...' : 'Post reply'}
        </button>
      </div>
    </form>
  );
}
