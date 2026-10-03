import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /**
   * One sentence naming what would appear here and what creates it, in the `07` S2.1 pattern
   * `<Thing> will appear here once <actor> <action>.` The caller passes the fixed string from
   * `07` S2.5 where one exists.
   */
  message: ReactNode;
  /** At most one action. The panel is a bordered section, never a blank region. */
  action?: ReactNode;
  className?: string;
}

/**
 * `07` S2.1 forbids the word "No data" and requires a sentence plus one action, so this is a
 * content contract and not a styled div. No illustration, no mascot, no emoji, no icon: an
 * empty-state graphic is anti-pattern 19 of `17` S13.
 *
 * No shadow: elevation means "not part of the page" (`17` S3.5 rule 2) and this panel is in
 * the document flow.
 */
export function EmptyState(props: EmptyStateProps): ReactElement {
  return (
    <section
      className={cn('rounded-card border border-solid border-default bg-card p-4', props.className)}
    >
      <p className="body text-ink">{props.message}</p>
      {props.action ? <div className="mt-3">{props.action}</div> : null}
    </section>
  );
}
