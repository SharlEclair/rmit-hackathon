'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * The Discussion thread composer (`07` UI-UX-SPEC section 4.5).
 *
 * **This closes a real gap: the API existed and the interface did not.** The Discussions tab rendered
 * `No discussion threads yet. Ask the first question.` with nothing to ask it in, so the empty state
 * promised an action the product did not offer. Both halves of the backend were already built and
 * routed -- `POST /api/student/assignments/{id}/discussion-threads` calls `createThread`, which runs the
 * Discussion Moderator over the opening post through `moderatorHookFor` -- so this component is the
 * missing front end rather than new capability.
 *
 * **Anonymous by default, and the control says so before the student types.** C4 makes the tutor unable
 * to see the identity behind a thread, and `06` section 4.2 derives a per-assignment pseudonym rather
 * than storing a flag, so "anonymous" is the honest default. The checkbox lets a student *opt out* for
 * a question they want attributed. The copy states the consequence rather than labelling the control
 * "Anonymous", because the thing a student needs to know is who can see what.
 *
 * **No optimistic thread.** The moderator runs over the opening post, so a thread may come back as
 * `NEEDS_REVIEW` rather than published, and the server decides. The composer reports what the server
 * said instead of rendering a thread that may not exist, which is also what keeps C3 intact: nothing
 * student-facing is shown before the decision.
 */
export interface DiscussionComposerProps {
  readonly assignmentId: string;
}

interface ThreadCreated {
  readonly id: string;
  readonly status: string;
}

export function DiscussionComposer(props: DiscussionComposerProps): React.ReactElement {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/student/assignments/${props.assignmentId}/discussion-threads`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ title, body, anonymous, milestoneId: null }),
        },
      );
      if (!response.ok) {
        // The house envelope carries a code; the message is host-fixed (`06` section 5.3), so it is
        // never rendered from the response body.
        setError(
          response.status === 400
            ? 'Check the title and the question, then try again.'
            : 'That question could not be posted. Nothing was changed.',
        );
        return;
      }
      const created = (await response.json()) as ThreadCreated;
      setTitle('');
      setBody('');
      // The thread exists but may be awaiting review. Saying which is the honest report, and for a
      // reviewable post it is also the answer to "where did my question go".
      setNotice(
        created.status === 'PUBLISHED'
          ? 'Your question is posted.'
          : 'Your question was submitted and is waiting for your tutor to review it.',
      );
      router.refresh();
    } catch {
      setError('We could not reach the server. Nothing was changed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-card border border-solid border-default bg-card p-4 md:p-6"
    >
      <div className="flex flex-col gap-2">
        <label className="ui-sm text-muted" htmlFor="discussion-title">
          Question
        </label>
        <input
          id="discussion-title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          placeholder="What do you want to ask?"
          className="rounded-control border border-solid border-default bg-card px-3 py-2 body text-ink"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="ui-sm text-muted" htmlFor="discussion-body">
          Details (optional)
        </label>
        <textarea
          id="discussion-body"
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          placeholder="Anything that helps someone answer."
          className="rounded-control border border-solid border-default bg-card px-3 py-2 body text-ink"
        />
      </div>

      <div className="flex items-start gap-2">
        <input
          id="discussion-anonymous"
          type="checkbox"
          checked={anonymous}
          onChange={(event) => {
            setAnonymous(event.target.checked);
          }}
          className="mt-1"
        />
        <label className="tight text-muted" htmlFor="discussion-anonymous">
          Post anonymously. Your tutor sees the question but not who asked it. Uncheck this if you want
          your name shown.
        </label>
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
          {pending ? 'Posting...' : 'Post question'}
        </button>
      </div>
    </form>
  );
}
