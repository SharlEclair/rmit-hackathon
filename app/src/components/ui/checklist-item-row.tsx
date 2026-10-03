'use client';

import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

import { STATE_COPY, reopenedCountLabel } from './fixed-strings';
import { ProgressMark, type ProgressMarkState } from './progress-mark';

/** The planning-level vocabulary of `07` S4.6 rule 3. No other word belongs here. */
export type PlanningLevel = 'Understand' | 'Identify' | 'Plan' | 'Verify' | 'Review' | 'Note';

type RowCommonProps = {
  title: string;
  /** Shown where it is useful (`07` S4.6 rule 3); the title often already begins with it. */
  planningLevel?: PlanningLevel;
  /** The only per-item affordance beyond progress (`07` S4.6 rule 6). */
  relatedFaqHref?: string;
  className?: string;
  onStart?: () => void;
  onComplete?: () => void;
  onReopen?: () => void;
};

/**
 * D48 is encoded in the props rather than in a comment: a `reopened` row MUST carry the first
 * interval and a reopen count, a `complete` row MUST carry the interval, and no state accepts a
 * total or a second duration. There is therefore no prop through which an accumulated duration
 * could be rendered, which is the whole of the D48 rule (`07` S4.6 rule 6).
 */
export type ChecklistItemRowProps = RowCommonProps &
  (
    | { state: 'not-started' }
    | { state: 'in-progress' }
    | { state: 'complete'; elapsed: string }
    | { state: 'reopened'; elapsed: string; reopenedCount: number }
  );

const PROGRESS_STATE: Record<ChecklistItemRowProps['state'], ProgressMarkState> = {
  'not-started': 'not-started',
  'in-progress': 'in-progress',
  complete: 'complete',
  // A reopened item is currently in progress (`07` S4.6 rule 6), so its mark says so.
  reopened: 'in-progress',
};

interface Control {
  label: string;
  onClick?: () => void;
}

function controlFor(props: ChecklistItemRowProps): Control {
  switch (props.state) {
    case 'not-started':
      return { label: 'Start', onClick: props.onStart };
    case 'in-progress':
      return { label: 'Complete', onClick: props.onComplete };
    case 'complete':
      return { label: 'Reopen', onClick: props.onReopen };
    case 'reopened':
      return { label: 'Complete', onClick: props.onComplete };
  }
}

/**
 * Presentational only. `07` S4.6 rule 4 makes start and complete optimistic and the page owns
 * that mutation, so this row never fetches and never writes: every control is a prop callback.
 *
 * It is a client component because a control needs an event handler. It holds no state.
 *
 * The root is an `<li>`: the Checklist renders these inside a `<ul>` (or an ordered list of
 * Milestone groups), and a row outside a list would be invalid HTML.
 */
export function ChecklistItemRow(props: ChecklistItemRowProps): ReactElement {
  const control = controlFor(props);
  const elapsed = props.state === 'complete' || props.state === 'reopened' ? props.elapsed : null;
  const reopenedCount = props.state === 'reopened' ? props.reopenedCount : null;

  return (
    <li className={cn('flex flex-wrap items-center justify-between gap-2 py-2', props.className)}>
      <div className="flex flex-wrap items-center gap-2">
        <ProgressMark state={PROGRESS_STATE[props.state]} />
        {props.planningLevel ? <span className="ui-sm text-muted">{props.planningLevel}</span> : null}
        <span className="body text-ink">{props.title}</span>
        {props.relatedFaqHref ? (
          <a className="tight text-ink underline hover:text-muted" href={props.relatedFaqHref}>
            Related FAQ entries
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {elapsed ? (
          // D33: the label is `Elapsed time`, never "Time worked" or "Time on task".
          <span className="mono-sm text-muted" title={STATE_COPY.elapsedTimeTooltip}>
            {STATE_COPY.elapsedTime} {elapsed}
          </span>
        ) : null}
        {reopenedCount === null ? null : (
          <span className="mono-sm text-muted">{reopenedCountLabel(reopenedCount)}</span>
        )}
        <button
          className="min-h-6 rounded-control border border-solid border-default bg-card px-3 py-1 tight text-ink hover:bg-page disabled:text-muted sm:min-h-12"
          disabled={control.onClick === undefined}
          onClick={control.onClick}
          type="button"
        >
          {control.label}
        </button>
      </div>
    </li>
  );
}
