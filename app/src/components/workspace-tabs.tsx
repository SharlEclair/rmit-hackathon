'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * The workspace's tab strip (`07` UI-UX-SPEC section 4.1).
 *
 * **The order is fixed and it is the product's priority statement:** "Assignment/Info, My Queries,
 * Discussions, Checklist" -- "the official document first, then private tutor contact, then the cohort,
 * then progress". It is not configurable and not sorted.
 *
 * **Tabs are never hidden** (section 4.1 rule 3): "A tab with nothing published yet is still present
 * and shows its empty state. Tabs are never hidden, because a missing tab reads as a missing
 * feature." Every tab is therefore always rendered, including the two whose screens Phase 6 owns;
 * those two render their own empty state rather than being absent.
 *
 * **The active tab is marked with an underline plus `aria-selected`, never by colour alone**
 * (section 4.1 rule 1). This is why the markup is a `role="tablist"` of `role="tab"` links rather than
 * a `nav` of plain links: `aria-selected` is only valid on a role that supports it, and putting it on a
 * plain link would be an ARIA violation that a screen reader ignores -- the opposite of the rule.
 *
 * **Counts** (section 4.1 rule 2): My Queries shows the number of threads with a new tutor reply, the
 * Checklist shows `n/m`, and Discussions shows **no count** -- "a count is never used for moderation
 * activity". No count is rendered for a zero, so a tab is not decorated with `0`.
 */
export interface WorkspaceTabCounts {
  /** Threads with a tutor reply, for the My Queries tab. `0` renders no count. */
  readonly queriesWithReply: number;
  readonly checklistCompleted: number;
  readonly checklistTotal: number;
}

interface Tab {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly count?: string;
}

export function WorkspaceTabs(props: {
  readonly assignmentId: string;
  readonly counts: WorkspaceTabCounts;
}): ReactElement {
  // The active tab comes from the path, not from a prop. A layout cannot read the request path in the
  // App Router, and threading an `active` flag from each page would be four places to forget one --
  // and a forgotten one renders the wrong tab as selected, which is a navigation lie rather than a
  // cosmetic bug. `usePathname` is the one source that cannot disagree with the URL.
  const pathname = usePathname();
  const base = `/student/assignments/${props.assignmentId}`;

  const tabs: Tab[] = [
    { key: 'assignment', label: 'Assignment', href: base },
    {
      key: 'queries',
      label: 'My Queries',
      href: `${base}/queries`,
      ...(props.counts.queriesWithReply > 0
        ? { count: String(props.counts.queriesWithReply) }
        : {}),
    },
    // No count for Discussions, by section 4.1 rule 2.
    { key: 'discussions', label: 'Discussions', href: `${base}/discussions` },
    {
      key: 'checklist',
      label: 'Checklist',
      href: `${base}/checklist`,
      count: `${String(props.counts.checklistCompleted)}/${String(props.counts.checklistTotal)}`,
    },
  ];

  /** The longest matching tab wins, so `/checklist` does not select the `/` (Assignment) tab. */
  const activeKey =
    tabs
      .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.key ?? 'assignment';

  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-solid border-default"
      role="tablist"
      aria-label="Assignment workspace"
    >
      {tabs.map((tab) => {
        const selected = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={selected}
            className={cn(
              'whitespace-nowrap px-3 py-2 tight no-underline',
              // The underline is the primary cue and the colour is the second, never the only one
              // (`07` section 2.1 rule 1). A selected tab also carries weight, so the greyscale
              // rendering keeps the distinction.
              'border-b-2 border-solid',
              selected
                ? 'border-b-ink font-semibold text-ink'
                : 'border-b-transparent text-muted',
            )}
          >
            {tab.label}
            {tab.count === undefined ? null : (
              <span className="ml-1 mono-sm text-muted">{tab.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
