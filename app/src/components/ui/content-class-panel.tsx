import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Badge, type ContentClassTone } from './badge';
import { BADGE, MARKER } from './fixed-strings';

export type { ContentClassTone };

/**
 * The border, surface and left rule of each class, exactly as `07` S2.2 and `17` S5.2 state
 * them. These are the L3 component tokens of `17` S6.1 rule 3: declared beside the component,
 * not exported, and read from no other file.
 *
 * `border-l-4` gives the 4px left rule in the frame's own border token; the border STYLE is
 * inherited by that left edge, which is what makes the T5 rule 4px DASHED rather than solid.
 * Surface values come from Tailwind theme keys wired to the L2 tokens, never a hex literal.
 */
const FRAME: Record<ContentClassTone, string> = {
  official: 'border-solid border-border-official border-l-4 bg-official',
  approved: 'border-solid border-border-approved border-l-4 bg-approved',
  structure: 'border-solid border-border-approved bg-approved',
  peer: 'border-dotted border-border-peer bg-peer',
  interpretation: 'border-dashed border-border-interpretation border-l-4 bg-interpretation',
};

/**
 * A content-class frame is flat (`17` S3.5 rule 1): 2px `sheet` radius, 1px border, no shadow.
 * No `shadow-*` class is emitted here, and none may be added.
 */
const PANEL_BASE = 'rounded-sheet border p-4';

type PanelCommonProps = {
  /** Defaults to the class's own fixed header string where `07` S2.5 gives one. */
  title?: string;
  /** A control that belongs to the panel header, right-aligned at every breakpoint. */
  headerAside?: ReactNode;
  /** Passed to the badge for the scrolled-Map case (`07` S2.2 rule 2). */
  stickyBadge?: boolean;
  className?: string;
  /** A panel may be header-only, e.g. a Map panel whose body is not published yet. */
  children?: ReactNode;
};

/**
 * The marker is required data, not an optional string, so a caller cannot render a content
 * class without the lexical marker `07` S2.2 requires for it.
 */
export type ContentClassPanelProps = PanelCommonProps &
  (
    | {
        contentClass: 'official';
        /** `07` S2.5 gives the brief and rubric headers different fixed strings. */
        officialKind: 'brief' | 'rubric';
        sourceFile: string;
        sourcePage: number;
      }
    | { contentClass: 'approved'; publishedOn: string }
    | { contentClass: 'structure' }
    | { contentClass: 'peer' }
    | {
        contentClass: 'interpretation';
        /**
         * `07` S2.2 gives T5 two strings: the pre-approval badge for every tutor-facing
         * artifact state, and the student-facing Map badge. Default is student-facing.
         */
        approvalState?: 'pre-approval' | 'student-facing';
      }
  );

interface PanelParts {
  primary: ReactNode;
  marker: ReactNode;
}

function renderParts(props: ContentClassPanelProps): PanelParts {
  switch (props.contentClass) {
    case 'official': {
      const heading =
        props.title ?? (props.officialKind === 'rubric' ? BADGE.officialRubric : BADGE.officialBrief);
      return {
        primary: (
          <div className="flex flex-col gap-1">
            <h2 className="heading-2 text-ink">{heading}</h2>
            <p className="mono text-muted">
              {MARKER.officialSource(props.sourceFile, props.sourcePage)}
            </p>
          </div>
        ),
        // The source line above IS the T1 marker; a second one would be a duplicate.
        marker: null,
      };
    }
    case 'approved':
      return {
        primary: (
          <div className="flex flex-col items-start gap-2">
            <Badge variant="approved" tone="approved" sticky={props.stickyBadge} />
            {props.title ? <h3 className="heading-3 text-ink">{props.title}</h3> : null}
          </div>
        ),
        marker: <p className="tight text-muted">{MARKER.publishedOn(props.publishedOn)}</p>,
      };
    case 'structure':
      return {
        primary: (
          <div className="flex flex-col items-start gap-2">
            <Badge variant="structure" tone="structure" sticky={props.stickyBadge} />
            {props.title ? <h3 className="heading-3 text-ink">{props.title}</h3> : null}
          </div>
        ),
        marker: <p className="tight text-muted">{MARKER.approvedByTutor}</p>,
      };
    case 'peer':
      return {
        primary: (
          <div className="flex flex-col items-start gap-2">
            <Badge variant="peer" tone="peer" sticky={props.stickyBadge} />
            {props.title ? <h3 className="heading-3 text-ink">{props.title}</h3> : null}
          </div>
        ),
        marker: <p className="tight text-muted">{MARKER.peerDiscussion}</p>,
      };
    case 'interpretation': {
      const preApproval = props.approvalState === 'pre-approval';
      return {
        primary: (
          <div className="flex flex-col items-start gap-2">
            <Badge
              variant={preApproval ? 'interpretation-pre-approval' : 'interpretation'}
              tone="interpretation"
              sticky={props.stickyBadge}
              fullWidth
            />
            {props.title ? <h3 className="heading-3 text-ink">{props.title}</h3> : null}
          </div>
        ),
        marker: preApproval ? null : <p className="body text-muted">{MARKER.mapDisclaimer}</p>,
      };
    }
  }
}

/**
 * Owns the surface, border, left rule, badge and required lexical marker of one of the five
 * content classes (`07` S2.6). Screens never re-implement the treatment.
 *
 * It always sets `data-content-class` to exactly one of
 * `official | approved | structure | peer | interpretation`. The paper-grain selector of
 * `17` S3.4 and the containment gates key off that attribute, so the value is the class name
 * and nothing else.
 */
export function ContentClassPanel(props: ContentClassPanelProps): ReactElement {
  const parts = renderParts(props);

  return (
    <section
      data-content-class={props.contentClass}
      className={cn(PANEL_BASE, FRAME[props.contentClass], props.className)}
    >
      <header className="flex flex-col gap-2">
        <div className="flex w-full flex-wrap items-start justify-between gap-2">
          {parts.primary}
          {props.headerAside ? <div>{props.headerAside}</div> : null}
        </div>
        {parts.marker}
      </header>
      {props.children ? <div className="mt-3">{props.children}</div> : null}
    </section>
  );
}