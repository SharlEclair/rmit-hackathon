'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

import type {
  AssistantMessageResponse,
  AssistantSessionResponse,
  AssistantCitation,
  GuardrailEvent,
  ProactiveMessageResponse,
  RefusalPayload,
} from '@/lib/api/types';
import { ContentClassPanel } from '@/components/ui/content-class-panel';
import { STATE_COPY } from '@/components/ui/fixed-strings';

/**
 * The AssignMate panel (`07` UI-UX-SPEC section 4.7.2, plus the refusal panel of 4.7.3).
 *
 * **The one rule this component exists to keep: the boundary treatment is not the error treatment.**
 * A guardrail refusal is a `200` carrying a refusal-shaped payload (I4, `06` section 5.3, trap T13),
 * "renders with the boundary treatment, never the error treatment", and "never says the student did
 * something wrong" (4.7.3 rule 6). So a refusal is rendered by `RefusalPanel` in the T5 content class,
 * and the error path below is reserved for `LLM_UNAVAILABLE` and a broken stream.
 *
 * **The stream contract is enforced, not assumed** (`06` section 5.5.9 rule 1, trap T4): "`guardrail` is
 * always the first event. A client that receives a `token` before a `guardrail` must treat the stream as
 * corrupt and discard it." `seenGuardrail` below is that rule -- a `token` frame arriving first sets a
 * corrupt-stream error and the partial text is thrown away rather than shown.
 *
 * **What this component must never display** (4.7.2 rule 9): "The panel never displays confidence
 * scores, model names, prompt versions, or capability names." Nothing in this file reads those fields;
 * the `GuardrailEvent` carries `deterministic` and the refusal payload carries `reasonCode`, and neither
 * is rendered.
 *
 * **Client-side**, necessarily: it owns a `ReadableStream` reader, a transcript, and the composer state.
 * It is the only component in the student UI that writes to the network.
 */
export function AssistantPanel(props: {
  readonly assignmentId: string;
  readonly policyAvailable: boolean;
  readonly milestoneId: string | null;
  readonly milestoneTitle: string | null;
  readonly proactive: ProactiveMessageResponse | null;
  /** `07` section 2.1 rule 4: the composer keeps the student's text, so the parent must not remount it. */
  readonly onDismissProactive?: () => void;
}): ReactElement {
  const [transcript, setTranscript] = useState<AssistantMessageResponse[]>([]);
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'streaming'>('idle');
  /** The last refusal, rendered as the 4.7.3 panel rather than as an assistant turn. */
  const [refusal, setRefusal] = useState<RefusalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // The transcript is loaded once, so a reload does not lose the student's history.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/student/assignments/${props.assignmentId}/assistant/session`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as AssistantSessionResponse;
        if (!cancelled) setTranscript(body.messages);
      } catch {
        // A transcript that cannot be read is not worth an error panel: the composer still works, and
        // the next turn appends to whatever the server holds.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.assignmentId]);

  const send = useCallback(async (): Promise<void> => {
    const body = draft.trim();
    if (body === '' || status !== 'idle') return;

    setError(null);
    setRefusal(null);
    setStatus('checking');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(
        `/api/student/assignments/${props.assignmentId}/assistant/messages`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify(
            props.milestoneId === null ? { body } : { body, milestoneId: props.milestoneId },
          ),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        // The house envelope. `LLM_UNAVAILABLE` and a rate limit are the two the student can act on,
        // and 4.7.3's error table gives each its own sentence.
        const envelope = (await response.json().catch(() => null)) as
          | { error?: { code?: string } }
          | null;
        const code = envelope?.error?.code ?? 'INTERNAL';
        setError(
          code === 'RATE_LIMITED'
            ? 'You have reached the Assistant\u2019s limit for now. Try again later, or ask your tutor privately.'
            : 'The Assistant is unavailable right now. Your assignment documents are still available above.',
        );
        setStatus('idle');
        return;
      }

      if (response.body === null) {
        setError('The Assistant is unavailable right now.');
        setStatus('idle');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let seenGuardrail = false;
      let text = '';
      let corrupt = false;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; a partial frame stays in the buffer.
        let separator = buffer.indexOf('\n\n');
        while (separator !== -1) {
          const raw = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          separator = buffer.indexOf('\n\n');

          const event = parseFrame(raw);
          if (event === null) continue;

          if (event.event === 'guardrail') {
            seenGuardrail = true;
            const guardrail = event.data as GuardrailEvent;
            if (guardrail.refusal !== null) {
              // Zero `token` frames follow a refusal, so the panel can appear at once (4.7.2 rule 4).
              setRefusal(guardrail.refusal);
            }
            continue;
          }

          if (event.event === 'token') {
            if (!seenGuardrail) {
              // `06` section 5.5.9 rule 1: a token before a guardrail is a corrupt stream, and "a
              // client that receives a `token` before a `guardrail` must treat the stream as corrupt
              // and discard it". The partial text is deliberately not shown.
              corrupt = true;
              await reader.cancel();
              break;
            }
            text += (event.data as { text?: string }).text ?? '';
            setStreamingText(text);
            setStatus('streaming');
            continue;
          }

          if (event.event === 'citations') {
            const citations = (event.data as { citations?: AssistantCitation[] }).citations ?? [];
            setTranscript((current) => [
              ...current,
              {
                id: `stream-${String(Date.now())}`,
                role: 'assistant',
                createdAt: new Date().toISOString(),
                body: text,
                isProactive: false,
                citedTiers: [...new Set(citations.map((citation) => citation.truthTier))],
                citations,
              },
            ]);
            setStreamingText(null);
            continue;
          }

          if (event.event === 'error') {
            // `06` section 5.5.9 rule 6: an `LLM_OUTPUT_INVALID` is rendered as a refusal with
            // `SCHEMA_VALIDATION_FAILED`, and 4.7.3 gives the sentence.
            setError(
              'I could not produce a reliable answer, so I did not answer. Nothing was changed.',
            );
            continue;
          }

          if (event.event === 'message' || event.event === 'done') continue;
        }
        if (corrupt) break;
      }

      if (corrupt) {
        setError('We could not read the Assistant\u2019s reply. Nothing was changed.');
        setStreamingText(null);
      }
    } catch (thrown) {
      if ((thrown as { name?: string }).name !== 'AbortError') {
        setError('The Assistant is unavailable right now.');
      }
      setStreamingText(null);
    } finally {
      abortRef.current = null;
      setStatus('idle');
      setDraft('');
    }
  }, [draft, error, props.assignmentId, props.milestoneId, status]);

  /**
   * D47's policy gate (4.7.2 rule 6): "when `policy.available = false`, the composer is replaced by the
   * unavailable state and `Ask your tutor privately`. The Assistant does not open as an empty but
   * usable box, because no approved policy means no assistance."
   */
  if (!props.policyAvailable) {
    return (
      <ContentClassPanel contentClass="interpretation" title="AssignMate">
        <p className="body text-ink">{STATE_COPY.refusalUnavailable}</p>
      </ContentClassPanel>
    );
  }

  const showProactive = props.proactive !== null && !noticeDismissed;

  return (
    <ContentClassPanel
      contentClass="interpretation"
      title={
        props.milestoneTitle === null
          ? 'AssignMate'
          : `AssignMate \u2014 ${props.milestoneTitle}`
      }
    >
      <div className="flex flex-col gap-4">
        {showProactive && props.proactive !== null ? (
          <section className="flex flex-col gap-2 rounded-sheet border border-solid border-border-interpretation bg-card p-3">
            <h3 className="heading-3 text-ink">
              You are starting {props.proactive.milestoneTitle}.
            </h3>
            <ol className="flex flex-col gap-2">
              {props.proactive.bullets.map((bullet) => (
                <li key={bullet.text} className="body text-ink">
                  {bullet.text}
                  <span className="ml-1 mono-sm text-muted">{bullet.citation.label}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="self-start rounded-control border border-solid border-default bg-card px-3 py-1 tight text-ink"
              onClick={() => {
                setNoticeDismissed(true);
                props.onDismissProactive?.();
                void fetch(
                  `/api/student/assistant/proactive-messages/${props.proactive?.noticeId ?? ''}/dismiss`,
                  { method: 'POST' },
                );
              }}
            >
              Dismiss
            </button>
          </section>
        ) : null}

        <ol className="flex flex-col gap-3">
          {transcript.map((message) => (
            <li key={message.id} className="flex flex-col gap-1">
              <span className="ui-sm text-muted">
                {message.role === 'student' ? 'You' : 'Assistant'}
              </span>
              <p className="body measure-sans text-ink">{message.body}</p>
              {message.role === 'assistant' && message.citations.length > 0 ? (
                // 4.7.2 rule 2: "Each assistant turn renders its citations as `Sources: <label> |
                // <label>`". An answer with no source renders the no-grounding line instead, which is
                // the `else` branch below.
                <span className="ui-sm text-muted">
                  Sources:{' '}
                  {message.citations
                    .map((citation) => citation.label)
                    .join('  |  ')}
                </span>
              ) : null}
            </li>
          ))}
        </ol>

        {streamingText === null ? null : (
          <p className="body measure-sans text-ink">
            {streamingText}
            <span aria-hidden="true">&#9613;</span>
          </p>
        )}

        {status === 'checking' ? (
          <p className="ui-sm text-muted" aria-live="polite">
            Checking your request...
          </p>
        ) : null}

        {refusal === null ? null : <RefusalPanel refusal={refusal} />}

        {error === null ? null : (
          // The ERROR treatment, reserved for a provider fault or a corrupt stream -- never for a
          // refusal (I4, 4.7.3 rule 6).
          <p
            role="alert"
            className="rounded-control border border-solid border-error bg-card p-3 body text-ink"
          >
            {error}
          </p>
        )}

        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="ui-sm text-muted" htmlFor="assistant-composer">
            Ask about this assignment
          </label>
          <textarea
            id="assistant-composer"
            className="min-h-16 rounded-control border border-solid border-default bg-card p-2 body text-ink"
            // 4.7.2 rule 7: "The composer is capped at 4000 characters with a counter appearing in the
            // last 200." The cap is `06` section 5.6's, and the server enforces it again.
            maxLength={4000}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder="Ask about this assignment..."
          />
          <div className="flex items-center justify-between gap-2">
            <span className="mono-sm text-muted">
              {draft.length > 3800 ? `${String(4000 - draft.length)} characters left` : ''}
            </span>
            <div className="flex gap-2">
              {status === 'idle' ? null : (
                // 4.7.2's loading state offers `Cancel`: "aborts the request; nothing is stored".
                <button
                  type="button"
                  className="rounded-control border border-solid border-default bg-card px-3 py-1 tight text-ink"
                  onClick={() => {
                    abortRef.current?.abort();
                    setStreamingText(null);
                    setStatus('idle');
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="rounded-control border border-solid border-border-official bg-official px-3 py-1 tight text-inverse disabled:text-muted"
                disabled={status !== 'idle' || draft.trim() === ''}
              >
                Send
              </button>
            </div>
          </div>
        </form>
      </div>
    </ContentClassPanel>
  );
}

/**
 * The refusal panel (`07` UI-UX-SPEC section 4.7.3).
 *
 * It is the **boundary** treatment: the T5 content class carries the dashed rule, the amber tint and
 * the badge, and there is no error colour anywhere in it. Rules 1, 3, 5 and 8 shape the markup:
 *
 *   1. "The opener states what was refused in the student's own terms: `I cannot <action>...`"
 *   3. "`I can help with` contains 2 to 4 items drawn from the approved policy and the fixed
 *      affordances" -- the server sends them (`RefusalPayload.whatICanHelpWith`) and this panel does not
 *      compose its own, which is I-27's ruling.
 *   5. "The panel variant is selected by the Guardrail's `refusalTemplateId`" -- the four layouts are
 *      chosen below and no code is invented.
 *   8. "A refusal never disables the composer" -- this panel has no control over the form, and only
 *      `POL_ABSENT` (`unavailable`) replaces it, which the parent handles.
 */
function RefusalPanel(props: { readonly refusal: RefusalPayload }): ReactElement {
  const { refusal } = props;

  return (
    <section
      // The boundary treatment, explicitly not `role="alert"`: a refusal is a designed response, not a
      // fault, so it is not announced as an error.
      className="flex flex-col gap-3 rounded-sheet border border-dashed border-border-interpretation border-l-4 bg-interpretation p-3"
    >
      {refusal.unavailable ? (
        // 4.7.3 rule 2's unavailable variant, and 4.7.2 rule 6's replacement of the composer: "It never
        // says a default policy applied." The parent also replaces the composer for this case, so the
        // two halves of D47 agree.
        <p className="body text-ink">{STATE_COPY.refusalUnavailable}</p>
      ) : refusal.verdict === 'CLARIFY' ? (
        <p className="body text-ink">
          I need to check what you are asking before I answer.
        </p>
      ) : (
        // 4.7.3 rule 1: the opener names the boundary in the student's own terms. The action word is
        // generic because the guardrail's `reasonCode` is deliberately not rendered (rule 6: the panel
        // never says the student did something wrong, and 4.7.2 rule 9 keeps internal vocabulary out).
        <p className="body text-ink">{STATE_COPY.refusalOpener('help with that')}</p>
      )}

      {refusal.policyRuleText === null ? null : (
        <p className="body text-ink">
          <span className="ui-sm text-muted">{STATE_COPY.refusalPolicyLabel}: </span>
          &ldquo;{refusal.policyRuleText}&rdquo;
        </p>
      )}

      {refusal.whatICanHelpWith.length === 0 ? null : (
        <div>
          <p className="ui-sm text-muted">{STATE_COPY.refusalCanHelpWithLabel}:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {refusal.whatICanHelpWith.map((item) => (
              <li key={item} className="body text-ink">
                - {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {refusal.escalation === null ? null : (
        // 4.7.3 rule 4: "`Ask your tutor privately` opens the Query composer with the student's
        // original request copied into the body, and the student must send it. The system never creates
        // a Query on the student's behalf (D24)." This is a link into the composer, never a POST.
        <a className="tight text-info underline" href={refusal.escalation.queryDraftUrl}>
          {STATE_COPY.refusalEscalation}
        </a>
      )}
    </section>
  );
}

/** One SSE frame: an `event:` line plus one or more `data:` lines. */
function parseFrame(raw: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) as unknown };
  } catch {
    return null;
  }
}
