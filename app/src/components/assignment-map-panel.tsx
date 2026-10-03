'use client';

import { useState, type ReactElement } from 'react';

import type { AssignmentMapResponse } from '@/lib/api/types';
import { ContentClassPanel } from '@/components/ui/content-class-panel';
import { MARKER } from '@/components/ui/fixed-strings';
import { cn } from '@/lib/utils';

/**
 * The Assignment Map (`07` UI-UX-SPEC section 4.3).
 *
 * **The Map is interpretation, and it says so before it says anything else.** `06` section 5.5.5 makes
 * `label` a fixed string the UI "must render", and `07` section 2.4 item 4 forbids the word "official"
 * on a T5 element. The label is the panel's own `interpretation` badge, so it is present before the
 * first node is read, and the badge is sticky so it "never scrolls out of view" (section 4.3 rule 1).
 *
 * **What a node may show.** Rule 2: a Requirement node shows "its AI label, the verbatim excerpt when
 * one exists, and a `From the brief, page <n>` link", and that excerpt is T1 text quoted inside the T5
 * panel. Rule 3: a node with no located source shows `No page location found` and "never states a
 * requirement". So a `verbatimText` is rendered only inside an `AuthorityQuote`-style block with its
 * page, and a `mapSummary` is rendered as interpretation beside it -- never merged into one paragraph,
 * which is the C2 failure the separation exists to prevent.
 *
 * **What the detail panel may offer** (rule 6): "structure and navigation only: related Checklist
 * items, related Rubric sections, the source page, and related published FAQ entries. It never offers a
 * next action, a suggested approach, or a plan." There is no action button in the detail panel below.
 *
 * **Client-side**, because rule 6 needs a selected node and rules 7's filters toggle. The filters
 * change which nodes are shown and never their content (rule 7).
 */
export function AssignmentMapPanel(props: {
  readonly structure: AssignmentMapResponse;
}): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRubric, setShowRubric] = useState(true);
  const [showPosition, setShowPosition] = useState(true);

  const byId = new Map(props.structure.nodes.map((node) => [node.id, node]));
  const selected = selectedId === null ? null : (byId.get(selectedId) ?? null);

  // Requirement-first grouping. `06` section 5.5.5 gives no parent link, so this is a flat,
  // indented presentation grouped by kind (section 4.3 rule 8's narrow-width shape applied at every
  // width): the alternative would be to invent a hierarchy the payload does not carry.
  const groups: Array<{ title: string; nodes: AssignmentMapResponse['nodes'] }> = [
    {
      title: 'Requirements',
      nodes: props.structure.nodes.filter((node) => node.kind === 'requirement'),
    },
    {
      title: 'Rubric links',
      nodes: showRubric
        ? props.structure.nodes.filter((node) => node.kind === 'rubric_section')
        : [],
    },
    {
      title: 'Milestones',
      nodes: props.structure.nodes.filter((node) => node.kind === 'milestone'),
    },
    {
      title: 'Checklist items',
      nodes: props.structure.nodes.filter((node) => node.kind === 'checklist_item'),
    },
  ];

  return (
    <ContentClassPanel
      contentClass="interpretation"
      stickyBadge
      headerAside={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={showRubric}
            className={cn(
              'rounded-control border border-solid border-default px-2 py-1 ui-sm',
              showRubric ? 'bg-card text-ink' : 'bg-interpretation text-muted',
            )}
            onClick={() => {
              setShowRubric((value) => !value);
            }}
          >
            Show rubric links
          </button>
          <button
            type="button"
            aria-pressed={showPosition}
            className={cn(
              'rounded-control border border-solid border-default px-2 py-1 ui-sm',
              showPosition ? 'bg-card text-ink' : 'bg-interpretation text-muted',
            )}
            onClick={() => {
              setShowPosition((value) => !value);
            }}
          >
            Show my position
          </button>
        </div>
      }
    >
      {props.structure.nodes.length === 0 ? (
        <p className="body text-ink">The Assignment Map has no published nodes yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) =>
            group.nodes.length === 0 ? null : (
              <section key={group.title} className="flex flex-col gap-2">
                <h3 className="heading-3 text-ink">{group.title}</h3>
                <ul className="flex flex-col gap-2">
                  {group.nodes.map((node) => {
                    const sourceRef = node.sourceRef;
                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          className={cn(
                            'w-full rounded-sheet border border-solid border-default bg-card p-3 text-left',
                            node.id === selectedId ? 'border-l-4 border-l-ink' : null,
                          )}
                          onClick={() => {
                            setSelectedId(node.id === selectedId ? null : node.id);
                          }}
                        >
                          <span className="block tight font-semibold text-ink">{node.title}</span>

                          {node.verbatimText === null ? null : (
                            // A T1 excerpt inside the T5 panel, quoted and marked as quoted (rule 2).
                            // It never becomes the requirement statement on its own: the source line
                            // below carries the page that makes it checkable.
                            <span className="mt-1 block border-l-4 border-solid border-l-ink bg-document-mat px-2 py-1 doc-body text-ink">
                              &ldquo;{node.verbatimText}&rdquo;
                            </span>
                          )}

                          {node.mapSummary === null ? null : (
                            <span className="mt-1 block body text-muted">{node.mapSummary}</span>
                          )}

                          <span className="mt-1 block mono-sm text-muted">
                            {sourceRef === null
                              ? // Rule 3: a node with no located source says so and states no
                                // requirement. It stays selectable.
                                MARKER.sourceLinkUnresolved
                              : MARKER.authorityQuoteLabel(
                                  sourceRef.sectionLabel === 'rubric' ? 'rubric' : 'brief',
                                  sourceRef.pageFrom,
                                )}
                          </span>

                          {showPosition && node.progress !== undefined ? (
                            <span className="mt-1 block ui-sm text-muted">
                              {progressLabel(node.progress.state)}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ),
          )}
        </div>
      )}

      {selected === null ? null : (
        <aside className="mt-4 rounded-sheet border border-solid border-border-interpretation bg-card p-3">
          <h3 className="heading-3 text-ink">{selected.title}</h3>
          {selected.verbatimText === null ? null : (
            <p className="mt-1 doc-body text-ink">&ldquo;{selected.verbatimText}&rdquo;</p>
          )}
          {selected.sourceRef === null ? (
            <p className="mt-1 ui-sm text-muted">{MARKER.sourceLinkUnresolved}</p>
          ) : (
            // Rule 2 and rule 6: a source page is navigation. There is no "open the brief" control,
            // because the viewer has no per-page URL contract yet (D107) -- the citation itself is the
            // page reference, which is the mechanism C2 relies on.
            <p className="mt-1 ui-sm text-muted">
              {MARKER.authorityQuoteLabel(
                selected.sourceRef.sectionLabel === 'rubric' ? 'rubric' : 'brief',
                selected.sourceRef.pageFrom,
              )}
            </p>
          )}
          {/*
            Rule 6's boundary, stated so a later session does not add one: this panel offers structure
            and navigation only. It never offers a next action, a suggested approach, or a plan.
          */}
        </aside>
      )}
    </ContentClassPanel>
  );
}

/** `07` section 4.3 rule 5's progress marks, in words rather than colour alone. */
function progressLabel(state: 'not_started' | 'in_progress' | 'completed'): string {
  switch (state) {
    case 'completed':
      return 'complete';
    case 'in_progress':
      return 'you are here';
    default:
      return 'not started';
  }
}
