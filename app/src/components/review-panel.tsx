'use client';

import { useState, type ReactElement } from 'react';

import type {
  AssignmentResponse,
  PublishBlocker,
  ReviewArtifactPayload,
  ReviewArtifactResponse,
  ReviewBundleResponse,
  ReviewCountsResponse,
} from '@/lib/api/types';
import { ArtifactProvenanceBadge, ArtifactProvenanceLine } from '@/components/ai-provenance-badge';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

/**
 * The tutor review surface (`07` UI-UX-SPEC sections 7.3 and 7.4; `11` WP-06).
 *
 * **Why Phase 4 did not build this, and why it is Phase 5's.** Phase 4 delivered WP-06's boundary, its
 * contract and its six routes, and deliberately not the page, because `app/src/styles/tokens.css`
 * declared no token and every Tailwind colour key resolved to an undefined custom property
 * (**I-44**). The token layer landed at the start of this phase, so the page can now be built against
 * values that exist rather than guessed.
 *
 * **The two rules the surface exists to make visible.**
 *
 *   1. **Approving is not publishing** (**D99**, `06` section 3.1). `APPROVED` is student-invisible;
 *      only `PUBLISHED` is. The two controls are therefore separate, separately enabled, and separately
 *      labelled, and the page never offers a single "approve and publish" action -- which would erase
 *      the boundary C3 is entirely about.
 *   2. **An AI artifact is marked until a tutor sanctions it** (C3). The badge is rendered per row by
 *      `ArtifactProvenanceBadge`, which decides from `origin` and `publicationStatus` rather than
 *      trusting this page to choose a label.
 *
 * **Optimistic concurrency is surfaced, not hidden.** Every write sends the row's `revision`, so a
 * `409 STALE_REVISION` means another tutor saved first; the page then tells the tutor to reload rather
 * than silently discarding their edit. Refusals are reported with the server's own code, because the
 * four codes mean four different things (`IMMUTABLE_FIELD` is a C2 refusal, not a validation error).
 *
 * **Client-side**, necessarily: approve, publish and edit are all mutations against the Phase 4 routes.
 */
export function ReviewPanel(props: { readonly bundle: ReviewBundleResponse }): ReactElement {
  const [bundle, setBundle] = useState(props.bundle);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const reviewable = bundle.artifacts.filter(
    (artifact) =>
      artifact.publicationStatus === 'NEEDS_REVIEW' || artifact.publicationStatus === 'EDITED',
  );
  const publishable = bundle.artifacts.filter(
    (artifact) => artifact.publicationStatus === 'APPROVED',
  );

  async function reload(): Promise<void> {
    const response = await fetch(`/api/tutor/assignments/${bundle.assignment.id}/review`);
    if (!response.ok) {
      setMessage({ tone: 'error', text: 'We could not reload the review queue.' });
      return;
    }
    setBundle((await response.json()) as ReviewBundleResponse);
  }

  async function one(
    artifact: ReviewArtifactResponse,
    action: 'approve' | 'reject' | 'save',
    payload?: ReviewArtifactPayload,
  ): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/tutor/structure-artifacts/${artifact.id}`, {
        method: action === 'reject' ? 'DELETE' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        ...(action === 'reject'
          ? {}
          : {
              body: JSON.stringify({
                action,
                expectedRevision: artifact.revision,
                ...(payload === undefined ? {} : { payload }),
                // A warning-bearing approval must acknowledge what it is accepting (`06` section
                // 5.5.8). A `VERBATIM_MISMATCH` cannot be acknowledged at all (C2), so it is never
                // listed here -- the server would refuse it, and offering it would be a lie.
                ...(action === 'approve'
                  ? {
                      acknowledgeWarnings: artifact.validation.warnings
                        .map((warning) => warning.code)
                        .filter((code) => code !== 'VERBATIM_MISMATCH'),
                    }
                  : {}),
              }),
            }),
      });

      if (!response.ok) {
        const envelope = (await response.json().catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null;
        const code = envelope?.error?.code ?? 'INTERNAL';
        setMessage({
          tone: 'error',
          text:
            code === 'STALE_REVISION'
              ? 'Another tutor changed this first. Reload the queue and try again.'
              : code === 'IMMUTABLE_FIELD'
                ? 'That field cannot be changed: it is quoted from the original document.'
                : code === 'INVALID_STATE_TRANSITION'
                  ? 'This artifact is in a state that does not allow that action.'
                  : (envelope?.error?.message ?? 'We could not save that.'),
        });
        return;
      }

      setMessage({ tone: 'ok', text: 'Saved.' });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function approveAll(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/tutor/assignments/${bundle.assignment.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Only warning-free artifacts can be approved in bulk: an artifact with a validation warning
        // needs a tutor to read it and acknowledge the specific warning, which a bulk action cannot do.
        body: JSON.stringify({
          artifactIds: reviewable
            .filter((artifact) => artifact.validation.warnings.length === 0)
            .map((artifact) => artifact.id),
        }),
      });
      if (!response.ok) {
        setMessage({ tone: 'error', text: 'We could not approve the queue.' });
        return;
      }
      const counts = (await response.json()) as ReviewCountsResponse;
      setMessage({
        tone: 'ok',
        text: `Approved ${String(counts.approved)} of ${String(counts.approved + counts.skipped)} artifacts. Approving is not publishing.`,
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function publish(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/tutor/assignments/${bundle.assignment.id}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) {
        const envelope = (await response.json().catch(() => null)) as
          | { error?: { details?: { blockers?: PublishBlocker[] } } }
          | null;
        const blockers = envelope?.error?.details?.blockers ?? [];
        setMessage({
          tone: 'error',
          text:
            blockers.length === 0
              ? 'This assignment cannot be published yet.'
              : `Cannot publish yet: ${blockers.map(blockerWord).join(', ')}.`,
        });
        return;
      }
      const assignment = (await response.json()) as AssignmentResponse;
      setMessage({
        tone: 'ok',
        text: `Published. The assignment is now student-visible (status ${assignment.status}).`,
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="heading-1 text-ink">{bundle.assignment.title}</h1>
        <p className="tight text-muted">
          Assignment status: {bundle.assignment.status}. Approving makes an artifact tutor-sanctioned;
          only publishing makes it student-visible.
        </p>
        <ul className="flex flex-wrap gap-2">
          {Object.entries(bundle.counts).map(([status, count]) =>
            count === 0 ? null : (
              <li key={status}>
                <Badge variant="status" label={`${status}: ${String(count)}`} />
              </li>
            ),
          )}
        </ul>
      </header>

      {message === null ? null : (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-control border border-solid p-3 tight text-ink',
            message.tone === 'error'
              ? 'border-border-interpretation bg-interpretation'
              : 'border-border-approved bg-approved',
          )}
        >
          {message.text}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="heading-2 text-ink">
            Review queue ({reviewable.length})
          </h2>
          <button
            type="button"
            className="rounded-control border border-solid border-border-approved bg-approved px-3 py-1 tight text-ink disabled:text-muted"
            disabled={busy || reviewable.every((artifact) => artifact.validation.warnings.length > 0)}
            onClick={() => {
              void approveAll();
            }}
          >
            Approve all without warnings
          </button>
        </div>

        {reviewable.length === 0 ? (
          <EmptyState message="Nothing is waiting for review. Artifacts will appear here once an analysis run finishes." />
        ) : (
          <ul className="flex flex-col gap-3">
            {reviewable.map((artifact) => (
              <li key={artifact.id}>
                <ArtifactCard
                  artifact={artifact}
                  busy={busy}
                  onApprove={() => {
                    void one(artifact, 'approve');
                  }}
                  onReject={() => {
                    void one(artifact, 'reject');
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="heading-2 text-ink">Approved, not published ({publishable.length})</h2>
        {publishable.length === 0 ? (
          <p className="tight text-muted">
            Nothing is approved yet. Approve artifacts above, then publish them.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {publishable.map((artifact) => (
              <li
                key={artifact.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sheet border border-solid border-default bg-approved p-3"
              >
                <span className="tight text-ink">{artifactTitle(artifact)}</span>
                <ArtifactProvenanceBadge
                  origin={artifact.origin}
                  publicationStatus={artifact.publicationStatus}
                  truthTier={artifact.truthTier}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="self-start rounded-control border border-solid border-border-official bg-official px-4 py-2 tight text-inverse disabled:text-muted"
            disabled={busy || !bundle.gates.canPublish}
            onClick={() => {
              void publish();
            }}
          >
            Publish to students
          </button>
          {bundle.gates.canPublish || bundle.gates.publishBlockers.length === 0 ? null : (
            <p className="tight text-muted">
              Blocked by: {bundle.gates.publishBlockers.map(blockerWord).join(', ')}.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/** One reviewable artifact: its provenance, its verbatim text, its warnings, and its controls. */
function ArtifactCard(props: {
  readonly artifact: ReviewArtifactResponse;
  readonly busy: boolean;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}): ReactElement {
  const { artifact } = props;
  const verbatim = verbatimTextOf(artifact.payload);

  return (
    <article className="flex flex-col gap-2 rounded-sheet border border-solid border-default bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="heading-3 text-ink">{artifactTitle(artifact)}</h3>
          <ArtifactProvenanceLine provenance={artifact.provenance} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="status" label={artifact.kind.replaceAll('_', ' ')} />
          <ArtifactProvenanceBadge
            origin={artifact.origin}
            publicationStatus={artifact.publicationStatus}
            truthTier={artifact.truthTier}
          />
        </div>
      </div>

      {verbatim === null ? null : (
        // The T1 text the artifact quotes, shown as a quote rather than as prose. C2 makes this the
        // thing a tutor must be able to check against the document, and `06` section 7.2.6 makes it
        // immutable: the page offers no editor for it.
        <blockquote className="border-l-4 border-solid border-l-ink bg-document-mat px-3 py-2 doc-body text-ink">
          {verbatim}
        </blockquote>
      )}

      {artifact.validation.warnings.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {artifact.validation.warnings.map((warning) => (
            <li
              key={warning.code}
              className="rounded-control border border-solid border-border-interpretation bg-interpretation p-2 ui-sm text-ink"
            >
              <span className="font-semibold">{warning.code.replaceAll('_', ' ')}</span> -{' '}
              {warning.message}
              {warning.code === 'VERBATIM_MISMATCH' ? (
                // C2: the text is not a substring of the chunk it cites. There is no path to approval
                // for this row other than correcting the source or rejecting it, and the server
                // refuses to acknowledge it (`06` section 5.5.8).
                <span className="ml-1">
                  This cannot be approved. Reject it, or correct the source document.
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-control border border-solid border-border-approved bg-approved px-3 py-1 tight text-ink disabled:text-muted"
          disabled={props.busy || artifact.validation.warnings.some((w) => w.code === 'VERBATIM_MISMATCH')}
          onClick={props.onApprove}
        >
          Approve
        </button>
        <button
          type="button"
          className="rounded-control border border-solid border-default bg-card px-3 py-1 tight text-ink disabled:text-muted"
          disabled={props.busy}
          onClick={props.onReject}
        >
          Reject
        </button>
      </div>
    </article>
  );
}

/** The heading of an artifact is its own title/question field, per kind (`06` section 5.5.8). */
function artifactTitle(artifact: ReviewArtifactResponse): string {
  const payload = artifact.payload as unknown as Record<string, unknown>;
  const title = payload['title'] ?? payload['question'] ?? payload['sectionLabel'] ?? payload['ruleCode'];
  if (typeof title === 'string' && title !== '') return title;
  return artifact.kind.replaceAll('_', ' ');
}

/** The immutable quoted text a payload may carry. Never edited from this page (C2, I-2). */
function verbatimTextOf(payload: ReviewArtifactPayload): string | null {
  const record = payload as unknown as Record<string, unknown>;
  for (const key of ['verbatimText', 'criteriaText']) {
    const value = record[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

/** `06` section 5.5.8's blocker union, in the words a tutor needs. */
function blockerWord(blocker: PublishBlocker): string {
  switch (blocker) {
    case 'NO_POLICY_RULE_APPROVED':
      return 'no AI usage policy rule is approved';
    case 'NO_MILESTONE':
      return 'no milestone exists';
    case 'MILESTONE_WITHOUT_REQUIREMENT':
      return 'a milestone has no linked requirement';
    default:
      return 'an artifact still has an unresolved validation warning';
  }
}
