import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { EmptyState } from './empty-state';
import { BADGE, STATE_COPY } from './fixed-strings';

export type SkeletonShape = 'text' | 'rows' | 'cards' | 'page' | 'tree';

/** `17` S2.6 `ContentClassPanel` is never used here: a state is not a truth tier. */
const NEUTRAL_PANEL = 'rounded-card border border-solid border-default bg-card p-4';
const LOADING_PANEL = NEUTRAL_PANEL;
/** The error treatment: `--state-error` on both the border and the message (`07` S2.1). */
const ERROR_PANEL = 'rounded-card border border-solid border-error bg-card p-4';
/**
 * The boundary treatment (`07` S2.1 refused-request row, S4.7.3, `17` S12 I4).
 * Dashed, not solid; no `--state-error`; no "Something went wrong". A refusal is a designed
 * behaviour, so it must not read as a system fault (trap T13). It carries no
 * `data-content-class`: a refusal is neither T1 content nor a T5 AI interpretation, and
 * setting the attribute would put it inside the grain and tier gates.
 */
const REFUSAL_PANEL =
  'rounded-sheet border border-dashed border-border-interpretation border-l-4 bg-card p-4';

const SKELETON_BLOCK: Record<SkeletonShape, string> = {
  text: 'h-3',
  rows: 'h-3 w-full',
  cards: 'h-12 w-full',
  page: 'aspect-[3/4] w-full',
  tree: 'h-3',
};

const TREE_INDENT = ['ml-0', 'ml-3', 'ml-6', 'ml-3'] as const;

/**
 * A skeleton matching the final layout's shape, never a spinner on an empty page (`07` S2.1).
 * It is `aria-hidden`, because the meaning is carried by the `Loading <noun>...` text: that
 * is what makes the zero-millisecond reduced-motion path safe (`17` S10.5 rule 2).
 * `data-skeleton` is the hook the reduced-motion block of `17` S10.5 switches off.
 */
function Skeleton({ shape, rows }: { shape: SkeletonShape; rows: number }): ReactElement {
  const count = rows > 0 ? rows : 1;

  return (
    <div aria-hidden="true" className="mt-3 space-y-2">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          data-skeleton="true"
          aria-hidden="true"
          className={cn(
            'rounded-control bg-default',
            SKELETON_BLOCK[shape],
            shape === 'text' && index === count - 1 ? 'w-2/3' : null,
            shape === 'tree' ? TREE_INDENT[index % TREE_INDENT.length] : null,
          )}
        />
      ))}
    </div>
  );
}

interface CommonProps {
  className?: string;
}

/**
 * One component, five variants, so the five state kinds of `07` S2.1 cannot drift
 * (`07` S2.6, `17` S8 inventory row `StatePanel`).
 */
export type StatePanelProps = CommonProps &
  (
    | {
        kind: 'loading';
        /** Names the thing in flight, for the `Loading <noun>...` pattern. */
        noun: string;
        skeletonShape?: SkeletonShape;
        skeletonRows?: number;
        /** The 8-second line (`07` S2.1, `17` S11.3). */
        stillWorking?: boolean;
        stillWorkingNote?: string;
      }
    | { kind: 'empty'; message: ReactNode; action?: ReactNode }
    | { kind: 'error'; message: ReactNode; requestId?: string; action?: ReactNode }
    | { kind: 'insufficient-data' }
    | {
        kind: 'refused';
        /** `07` S4.7.3 rule 1: `I cannot <action>...`, or the `POL_ABSENT` string (D47). */
        opener: string;
        /** True for the `POL_ABSENT` variant: no policy has been approved, so no help exists. */
        unavailable?: boolean;
        /** A published AI Usage Policy rule, quoted verbatim. Never summarised (C2). */
        policyQuote?: { text: string; attribution?: string };
        /** 2 to 4 items drawn from the approved policy (`07` S4.7.3 rule 3). */
        canHelpWith?: readonly string[];
        /** The escalation control. `Ask your tutor privately` (`07` S2.5). */
        action?: ReactNode;
      }
  );

export function StatePanel(props: StatePanelProps): ReactElement {
  switch (props.kind) {
    case 'loading': {
      const shape = props.skeletonShape ?? 'rows';
      const rows = props.skeletonRows ?? 3;

      return (
        <section className={cn(LOADING_PANEL, props.className)}>
          <p role="status" aria-live="polite" className="body text-ink">
            {STATE_COPY.loading(props.noun)}
          </p>
          <Skeleton shape={shape} rows={rows} />
          {props.stillWorking ? (
            <p className="tight text-muted mt-2">
              {STATE_COPY.stillWorking} {props.stillWorkingNote ?? STATE_COPY.stillWorkingNote}
            </p>
          ) : null}
        </section>
      );
    }
    case 'empty':
      // One implementation of the empty state, so `StatePanel` and `EmptyState` cannot drift.
      return <EmptyState message={props.message} action={props.action} className={props.className} />;
    case 'error':
      return (
        <section className={cn(ERROR_PANEL, props.className)}>
          <div role="alert" aria-live="assertive" aria-atomic="true">
            <p className="body text-error">{props.message}</p>
            {props.requestId ? (
              <p className="mono-sm text-muted mt-2">
                {STATE_COPY.requestIdLabel} {props.requestId}
              </p>
            ) : null}
          </div>
          {props.action ? <div className="mt-3">{props.action}</div> : null}
        </section>
      );
    case 'insufficient-data':
      // Static content at first paint: not an event, so not a live region (`17` S11.3).
      // The fixed string is rendered whole; a number, a count or an estimate never appears.
      return (
        <section className={cn(NEUTRAL_PANEL, props.className)}>
          <p className="body text-ink">{STATE_COPY.insufficientData}</p>
        </section>
      );
    case 'refused':
      return (
        <section
          data-refusal-variant={props.unavailable ? 'unavailable' : 'refusal'}
          className={cn(REFUSAL_PANEL, props.className)}
        >
          {/*
            Only the opener is announced, assertively, because it answers a direct student
            action; the rest of the panel is normal DOM content so it stays re-readable by
            navigation and is not repeated (`17` S11.3).
          */}
          <p role="alert" aria-live="assertive" className="body text-ink">
            {props.opener}
          </p>
          {props.policyQuote ? (
            <p className="tight text-muted mt-2">
              {STATE_COPY.refusalPolicyLabel}: &quot;{props.policyQuote.text}&quot; (
              {props.policyQuote.attribution ?? BADGE.publishedByTutor})
            </p>
          ) : null}
          {props.canHelpWith && props.canHelpWith.length > 0 ? (
            <div className="mt-3">
              <p className="tight text-ink">{STATE_COPY.refusalCanHelpWithLabel}:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {props.canHelpWith.map((item) => (
                  <li key={item} className="tight text-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {props.action ? <div className="mt-3">{props.action}</div> : null}
        </section>
      );
  }
}
