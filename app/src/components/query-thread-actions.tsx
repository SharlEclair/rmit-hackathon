'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type { QueryStatusApi } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * The two student actions on their own Query thread: a follow-up message and `Flag Resolved`
 * (`07` UI-UX-SPEC sections 4.4, 5.1 and 5.4).
 *
 * **`Flag Resolved` is the asker's control, and it appears only once a tutor has answered.** `06`
 * section 5.4 puts `resolve` on the student's path because only they know whether the answer worked,
 * and the service refuses the transition from any status but `answered` -- so the button is rendered in
 * the one state where the action is legal rather than offered and then refused.
 *
 * **A correction is a new message, never an edit.** Section 4.4: "A message is not editable after
 * sending". This composer therefore appends; it has no edit affordance, and the API it calls has none
 * either.
 *
 * **A closed thread is read-only**, and the panel says so in place of the composer instead of failing a
 * send that a student had already typed.
 */
export interface QueryThreadActionsProps {
  readonly queryId: string;
  readonly status: QueryStatusApi;
}

export function QueryThreadActions(props: QueryThreadActionsProps): React.ReactElement {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/student/queries/${props.queryId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        setError('We could not send your question. Nothing was sent.');
        return;
      }
      setBody('');
      setNotice('Sent.');
      router.refresh();
    } catch {
      setError('We could not send your question. Nothing was sent.');
    } finally {
      setPending(false);
    }
  }

  async function onResolve(): Promise<void> {
    setResolving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/student/queries/${props.queryId}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setError('We could not mark this resolved. Nothing was changed.');
        return;
      }
      setNotice('Marked resolved.');
      router.refresh();
    } catch {
      setError('We could not mark this resolved. Nothing was changed.');
    } finally {
      setResolving(false);
    }
  }

  if (props.status === 'closed') {
    return (
      <p className="rounded-card border border-solid border-default bg-card p-4 body text-muted">
        This question is closed. Ask a new one instead.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSend}
      className="flex flex-col gap-4 rounded-card border border-solid border-default bg-card p-4"
    >
      <div className="flex flex-col gap-2">
        <label className="ui-sm text-muted" htmlFor="query-message">
          Reply to your tutor
        </label>
        <textarea
          id="query-message"
          required
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          placeholder="Add anything that helps, or say what is still unclear."
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

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className={cn(
            'rounded-control border border-solid border-default bg-ink px-4 py-2 tight text-inverse',
            pending ? 'opacity-60' : null,
          )}
        >
          {pending ? 'Sending...' : 'Send message'}
        </button>

        {/*
          Section 4.4: "Flag Resolved appears only when at least one tutor reply exists." A tutor reply
          is what moved the thread to `answered`, so the status is the condition rather than a second
          count that could disagree with it.
        */}
        {props.status === 'answered' ? (
          <button
            type="button"
            onClick={() => {
              void onResolve();
            }}
            disabled={resolving}
            className={cn(
              'rounded-control border border-solid border-default bg-card px-4 py-2 tight text-ink',
              resolving ? 'opacity-60' : null,
            )}
          >
            {resolving ? 'Marking resolved...' : 'Flag Resolved'}
          </button>
        ) : null}
      </div>
    </form>
  );
}
