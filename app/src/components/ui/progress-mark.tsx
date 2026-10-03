import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

export type ProgressMarkState = 'not-started' | 'in-progress' | 'complete';

/**
 * The state mark is icon plus text plus colour, never colour alone (`07` S2.1 rule 1, S2.6).
 *
 * Dependency note, recorded rather than faked: `lucide-react` is not in `app/package.json`
 * (`17` S9 names Lucide as the one icon set) and no dependency may be added for this task, so
 * the icon slot renders the `[ ]` / `[~]` / `[x]` notation that `07` S4.6 uses in its own
 * Checklist wireframe. It is `aria-hidden`, because the state word beside it carries the
 * meaning: an icon never carries meaning alone either (`17` S9 rule 2). Adding Lucide later
 * replaces this one span per state with a 16px, stroke 1.5 glyph and changes no other line.
 */
const GLYPH: Record<ProgressMarkState, string> = {
  'not-started': '[ ]',
  'in-progress': '[~]',
  complete: '[x]',
};

const LABEL: Record<ProgressMarkState, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
};

/** The tone is the fourth cue. It is never the only one. */
const TONE: Record<ProgressMarkState, string> = {
  'not-started': 'text-muted',
  'in-progress': 'text-info',
  complete: 'text-success',
};

export interface ProgressMarkProps {
  state: ProgressMarkState;
  className?: string;
}

export function ProgressMark(props: ProgressMarkProps): ReactElement {
  return (
    <span className={cn('inline-flex items-center gap-2', TONE[props.state], props.className)}>
      <span aria-hidden="true" className="mono">
        {GLYPH[props.state]}
      </span>
      <span className="tight">{LABEL[props.state]}</span>
    </span>
  );
}
