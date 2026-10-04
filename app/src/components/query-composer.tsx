'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * The composer that opens a private Query (`07` UI-UX-SPEC section 4.4).
 *
 * **The attribution difference from a Discussion post is stated, not implied.** Section 4.4 requires
 * the line "Your tutor sees your name on a private question.", because a Query is never anonymous (D24,
 * D50) while the discussion next door defaults to a pseudonym. The two tabs sit beside each other, so a
 * student who is not told the difference will reasonably assume the same rule applies to both.
 *
 * **The subject is optional and the question is not.** `06` section 5.5.12 types the subject as
 * `string | null`; a blank subject is sent as `null` rather than as an empty string, so the stored row
 * has one representation of "no subject" rather than two.
 */
export interface QueryComposerProps {
  readonly assignmentId: string;
}

export function QueryComposer(props: QueryComposerProps): React.ReactElement {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/student/assignments/${props.assignmentId}/queries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          subject: subject.trim() === '' ? null : subject.trim(),
          body,
          milestoneId: null,
        }),
      });
      if (!response.ok) {
        setError('We could not send your question. Nothing was sent.');
        return;
      }
      setSubject('');
      setBody('');
      setNotice('Your question is with your tutor. Only you and your tutors can see it.');
      router.refresh();
    } catch {
      setError('We could not send your question. Nothing was sent.');
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
        <label className="ui-sm text-muted" htmlFor="query-subject">
          Subject (optional)
        </label>
        <input
          id="query-subject"
          maxLength={200}
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
          }}
          placeholder="A short label for your question"
          className="rounded-control border border-solid border-default bg-card px-3 py-2 body text-ink"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="ui-sm text-muted" htmlFor="query-body">
          Your question
        </label>
        <textarea
          id="query-body"
          required
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          placeholder="What do you need from your tutor?"
          className="rounded-control border border-solid border-default bg-card px-3 py-2 body text-ink"
        />
      </div>

      <p className="tight text-muted">Your tutor sees your name on a private question.</p>

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
          {pending ? 'Sending...' : 'Send privately'}
        </button>
      </div>
    </form>
  );
}
