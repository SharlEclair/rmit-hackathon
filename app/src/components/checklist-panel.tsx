'use client';

import { useState, type ReactElement } from 'react';

import type { ChecklistItemResponse, ChecklistResponse } from '@/lib/api/types';
import { ChecklistItemRow, type PlanningLevel } from '@/components/ui/checklist-item-row';
import { STATE_COPY } from '@/components/ui/fixed-strings';
import { uiStateOf } from '@/features/workspace/ui-state';
/**
 * The Checklist tab (`07` UI-UX-SPEC section 4.6, D19, D20, D33, D48).
 *
 * **The four rules this component exists to honour.**
 *
 *   1. "Elapsed time is always labelled `Elapsed time`, never `Time worked` or `Time on task`" (rule 5,
 *      D33). The label and its one-sentence tooltip come from `fixed-strings.ts`, so the forbidden
 *      spellings cannot appear here.
 *   2. "Reopened items (D48): an item that has been reopened shows the **first** start-to-complete
 *      elapsed time and the note `Reopened <n> time(s)`" (rule 6). That needs a *fourth* state, which
 *      the API's three-value `state` cannot express, so `uiStateOf` derives `reopened` from
 *      `reopenCount` (**D108**). The row component's own prop type forces the distinction: a row cannot
 *      be `reopened` without carrying both its interval and its count.
 *   3. "Starting and completing are optimistic: the mark changes immediately and reverts with a toast
 *      if the server refuses" (rule 4). The optimistic update is why this is a client component.
 *   4. "A Milestone with no published items does not render as an empty accordion: it renders `No
 *      Checklist items are published for this Milestone yet.` inside the panel" (rule 8). A milestone
 *      with no items is therefore rendered with that sentence rather than skipped.
 *
 * **Progress marks come from the same data as the Map** (rule 9): both read `items[].state` from the
 * one workspace bundle, so they cannot disagree.
 */
export function ChecklistPanel(props: {
  readonly assignmentId: string;
  readonly checklist: ChecklistResponse;
}): ReactElement {
  const [items, setItems] = useState<readonly ChecklistItemResponse[]>(
    flatten(props.checklist),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const completed = items.filter((item) => item.state === 'completed').length;
  const total = items.length;
  const rate = total === 0 ? 0 : completed / total;

  /**
   * Apply one transition, then adopt the server's response for that item.
   *
   * The write goes through the same route the API contract names, and the response is the server's own
   * `ChecklistProgressResponse` -- not a locally incremented number. That matters for D48: the first
   * `elapsedSeconds` is computed inside Postgres, so a client that invented one could show a duration
   * the row does not have.
   */
  async function transition(
    item: ChecklistItemResponse,
    action: 'start' | 'complete' | 'reopen',
  ): Promise<void> {
    setError(null);
    setPending(item.id);
    try {
      const response = await fetch(`/api/student/checklist-items/${item.id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // `expectedReopenCount` is the optimistic-concurrency token: two tabs reopening one item must
        // not produce `reopenCount = 2`. The server refuses a stale count with 409.
        body: action === 'reopen' ? JSON.stringify({ expectedReopenCount: item.reopenCount }) : '{}',
      });
      if (!response.ok) {
        // `07` section 4.6's error row: "The row reverts, and a toast reads `We could not save that.
        // Your Checklist is unchanged.`" The row is not mutated before the response, so there is
        // nothing to revert -- the optimistic half is deliberately skipped for a refused write.
        setError('We could not save that. Your Checklist is unchanged.');
        return;
      }
      const updated = (await response.json()) as {
        state: ChecklistItemResponse['state'];
        startedAt: string | null;
        completedAt: string | null;
        elapsedSeconds: number | null;
        reopenCount: number;
      };
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                state: updated.state,
                startedAt: updated.startedAt,
                completedAt: updated.completedAt,
                elapsedSeconds: updated.elapsedSeconds,
                reopenCount: updated.reopenCount,
              }
            : entry,
        ),
      );
    } catch {
      setError('We could not save that. Your Checklist is unchanged.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="heading-2 text-ink">
          {completed} of {total} complete
        </p>
        <p className="tight text-muted">
          {String(Math.round(rate * 100))}% Resolution rate
        </p>
      </header>

      {error === null ? null : (
        <p role="alert" className="rounded-control border border-solid border-border-interpretation bg-interpretation p-3 tight text-ink">
          {error}
        </p>
      )}

      {total === 0 ? (
        <p className="rounded-card border border-solid border-default bg-card p-4 body text-ink">
          Your Checklist will appear here once your tutor publishes it.
        </p>
      ) : (
        props.checklist.milestones.map((milestone) => (
          <section
            key={milestone.id}
            className="flex flex-col gap-2 rounded-card border border-solid border-default bg-card p-4"
          >
            <h3 className="heading-3 text-ink">{milestone.title}</h3>
            {milestone.summary === null ? null : (
              <p className="tight text-muted">{milestone.summary}</p>
            )}
            <p className="ui-sm text-muted">{milestoneStateLabel(milestone.completionState)}</p>

            {milestone.items.length === 0 ? (
              // Section 4.6 rule 8's sentence, verbatim.
              <p className="body text-muted">
                No Checklist items are published for this Milestone yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {milestone.items.map((item) => {
                  const live = items.find((entry) => entry.id === item.id) ?? item;
                  // The row's props are a discriminated union whose `reopened` and `complete` members
                  // each REQUIRE an interval, so they are built per state rather than spread
                  // conditionally: that requirement is what makes D48 a compile-time rule instead of a
                  // convention, and a spread would defeat it.
                  const common = {
                    title: live.title,
                    planningLevel: planningLevelWord(live.planningLevel),
                    busy: pending === live.id,
                    onStart: () => {
                      void transition(live, 'start');
                    },
                    onComplete: () => {
                      void transition(live, 'complete');
                    },
                    onReopen: () => {
                      void transition(live, 'reopen');
                    },
                  };
                  const uiState = uiStateOf(live);
                  const elapsedLabel = formatElapsed(live.elapsedSeconds ?? 0);

                  return (
                    <li key={item.id}>
                      {uiState === 'not-started' ? <ChecklistItemRow {...common} state="not-started" /> : null}
                      {uiState === 'in-progress' ? <ChecklistItemRow {...common} state="in-progress" /> : null}
                      {uiState === 'complete' ? (
                        <ChecklistItemRow {...common} state="complete" elapsed={elapsedLabel} />
                      ) : null}
                      {uiState === 'reopened' ? (
                        <ChecklistItemRow
                          {...common}
                          state="reopened"
                          elapsed={elapsedLabel}
                          reopenedCount={live.reopenCount}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}

      <p className="ui-sm text-muted" title={STATE_COPY.elapsedTimeTooltip}>
        {STATE_COPY.elapsedTime}: {STATE_COPY.elapsedTimeTooltip}
      </p>
    </div>
  );
}

/**
 * Every item of every milestone, as one list, for the local progress state.
 *
 * The panel keeps one flat list rather than a nested copy, so a transition updates exactly one entry
 * and the per-milestone rendering reads from it by id. A nested copy would be the second place the same
 * item's state lives.
 */
function flatten(checklist: ChecklistResponse): readonly ChecklistItemResponse[] {
  return checklist.milestones.flatMap((milestone) => milestone.items);
}

/** `07` section 4.6's milestone states, in words rather than colour alone. */
function milestoneStateLabel(state: ChecklistResponse['milestones'][number]['completionState']): string {
  switch (state) {
    case 'completed':
      return 'complete';
    case 'in_progress':
      return 'in progress - you are here';
    default:
      return 'not started';
  }
}

/**
 * The API's planning level as the display word the row expects.
 *
 * `06` section 5.5.6 stores the level lower-case (`understand`), and `07` section 4.6 rule 3 lists the
 * six words capitalised (`Understand`). The row component types its prop as exactly those words, so
 * this is the one place the two spellings meet: passing the raw value would be a type error, which is
 * the intent -- a seventh level cannot be rendered by accident.
 */
function planningLevelWord(level: ChecklistItemResponse['planningLevel']): PlanningLevel {
  switch (level) {
    case 'identify':
      return 'Identify';
    case 'plan':
      return 'Plan';
    case 'verify':
      return 'Verify';
    case 'review':
      return 'Review';
    case 'note':
      return 'Note';
    default:
      return 'Understand';
  }
}

/** Minutes are how `08` section 3.5 rounds elapsed time; this is the same unit in the student's row. */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  return `${String(Math.round(seconds / 60))}m`;
}
