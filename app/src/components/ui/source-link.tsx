import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

import { MARKER } from './fixed-strings';

export type SourceLinkSource = 'brief' | 'rubric';

export type SourceLinkProps = {
  /** `17` S8 gives the component an inline and a block form. */
  block?: boolean;
  className?: string;
} & (
  | {
      unresolved?: false;
      /** Defaults to `brief`: the brief is the authoritative source of a requirement. */
      source?: SourceLinkSource;
      page: number;
      /** Overrides the `#page=<n>` deep link. The default is the anchor `07` S4.2 rule 4 uses. */
      href?: string;
    }
  | { unresolved: true; source?: never; page?: never; href?: never }
);

/**
 * The only way the workspace references a requirement (`07` S2.6, S2.4 item 7). It renders
 * `Brief, page <n>` or `Official rubric, page <n>` plus the `#page=<n>` deep link, in the
 * `mono` type role because a page reference is a record reference (`17` S2.4).
 *
 * The page-anchor variant exists because a node with no located source must say so and must
 * not state a requirement (`07` S4.3 rule 3): it renders `No page location found` and no link.
 */
export function SourceLink(props: SourceLinkProps): ReactElement {
  if (props.unresolved) {
    return (
      <span className={cn('mono text-muted', props.block ? 'block' : null, props.className)}>
        {MARKER.sourceLinkUnresolved}
      </span>
    );
  }

  const label =
    (props.source ?? 'brief') === 'rubric'
      ? MARKER.sourceLinkRubric(props.page)
      : MARKER.sourceLinkBrief(props.page);

  return (
    <a
      className={cn(
        'mono text-ink underline hover:text-muted',
        props.block ? 'block' : null,
        props.className,
      )}
      href={props.href ?? `#page=${props.page}`}
    >
      {label}
    </a>
  );
}
