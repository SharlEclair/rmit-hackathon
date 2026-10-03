import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

import { BADGE } from './fixed-strings';

/** The five content classes of `07` S2.2, plus the neutral tone for a workflow status. */
export type ContentClassTone = 'official' | 'approved' | 'structure' | 'peer' | 'interpretation';
export type BadgeTone = ContentClassTone | 'status';

export type BadgeVariant =
  | 'official-brief'
  | 'official-rubric'
  | 'approved'
  | 'structure'
  | 'peer'
  | 'interpretation'
  | 'interpretation-pre-approval'
  | 'status';

/**
 * The one owner of every fixed badge string. `status` is the free-text member, because a
 * workflow status word (`Draft`, `In review`, `Published`) is not a content class and must
 * not borrow a content-class string.
 */
const FIXED_TEXT: Record<Exclude<BadgeVariant, 'status'>, string> = {
  'official-brief': BADGE.officialBrief,
  'official-rubric': BADGE.officialRubric,
  approved: BADGE.publishedByTutor,
  structure: BADGE.approvedStructure,
  peer: BADGE.peerDiscussion,
  interpretation: BADGE.interpretationStudentFacing,
  'interpretation-pre-approval': BADGE.interpretationPreApproval,
};

const DEFAULT_TONE: Record<BadgeVariant, BadgeTone> = {
  'official-brief': 'official',
  'official-rubric': 'official',
  approved: 'approved',
  structure: 'structure',
  peer: 'peer',
  interpretation: 'interpretation',
  'interpretation-pre-approval': 'interpretation',
  status: 'status',
};

/**
 * Border STYLE repeats the truth tier as a non-colour cue (`07` S2.2 rule 6 greyscale test):
 * solid for T1/T2/T3, dotted for T4, dashed for T5. Colour is the fourth cue, never the first.
 */
const TONE_BORDER: Record<BadgeTone, string> = {
  official: 'border-solid border-border-official',
  approved: 'border-solid border-border-approved',
  structure: 'border-solid border-border-approved',
  peer: 'border-dotted border-border-peer',
  interpretation: 'border-dashed border-border-interpretation',
  status: 'border-solid border-default',
};

interface BadgeBaseProps {
  /** Overrides the tone implied by `variant`. It changes the border token only. */
  tone?: BadgeTone;
  /** Sticks the badge to the top of a scrolling container (`07` S2.2 rule 2, S4.3 rule 1). */
  sticky?: boolean;
  /** Spans the panel width, which is how the T5 badge is drawn in `17` S5.2. */
  fullWidth?: boolean;
  className?: string;
}

export type BadgeProps = BadgeBaseProps &
  ({ variant: 'status'; label: string } | { variant: Exclude<BadgeVariant, 'status'> });

/**
 * The badge is never truncated, collapsed or shortened at any breakpoint (`07` S2.2 rule 1,
 * S2.4 item 6; `17` S2.4 rule 7). Nothing here emits `truncate`, `text-ellipsis`, `line-clamp`
 * or `whitespace-nowrap`; the text is free to wrap to a second line.
 *
 * Text colour is `--text-primary` on `--surface-card`: both are surfaces measured in
 * `17` S3.6, and no `--accent-*` token is exposed as a Tailwind colour key, so the tier hue
 * is carried by the border and the panel frame rather than by the badge text.
 */
export function Badge(props: BadgeProps): ReactElement {
  const tone = props.tone ?? DEFAULT_TONE[props.variant];
  const text = props.variant === 'status' ? props.label : FIXED_TEXT[props.variant];

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-control border bg-card px-2 py-1 badge text-ink',
        TONE_BORDER[tone],
        props.sticky ? 'sticky top-0 z-10' : null,
        props.fullWidth ? 'w-full' : null,
        props.className,
      )}
    >
      {text}
    </span>
  );
}
