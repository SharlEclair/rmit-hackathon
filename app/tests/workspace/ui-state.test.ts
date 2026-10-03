import { describe, expect, it } from 'vitest';

import type { ChecklistItemResponse } from '@/lib/api/types';

import { uiStateOf } from '@/features/workspace/bundle';

/**
 * The UI state derivation, and the one place the API's three-value `state` and the row component's
 * four-value `state` are reconciled.
 *
 * **Why this is tested at all.** `07` section 4.6 rule 6 is a rule about a state the database column
 * cannot express: after a reopen the row is `completed` by schema (the CHECK permits no other value
 * with `completed_at` set) while the student must see an unfinished item carrying its FIRST interval
 * and a `Reopened <n> time(s)` note. D48 is the reason: the interval must survive, so the state cannot
 * be the only signal. `uiStateOf` derives `reopened` from `reopenCount`, and if that derivation were
 * lost the row would render as `complete` and the student would lose both the count and the ability to
 * complete it again.
 */
function item(overrides: Partial<ChecklistItemResponse>): ChecklistItemResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Understand the submission format',
    description: null,
    planningLevel: 'understand',
    displayOrder: 0,
    state: 'not_started',
    startedAt: null,
    completedAt: null,
    elapsedSeconds: null,
    reopenCount: 0,
    ...overrides,
  };
}

describe('uiStateOf', () => {
  it('maps a stored state with no reopen to the matching UI state', () => {
    expect(uiStateOf(item({ state: 'not_started' }))).toBe('not-started');
    expect(uiStateOf(item({ state: 'in_progress' }))).toBe('in-progress');
    expect(
      uiStateOf(
        item({
          state: 'completed',
          startedAt: '2026-10-03T04:00:00.000Z',
          completedAt: '2026-10-03T04:12:00.000Z',
          elapsedSeconds: 720,
        }),
      ),
    ).toBe('complete');
  });

  it('reports a completed item that was reopened as `reopened`, not `complete` (D48)', () => {
    // The shape `reopenChecklistItem` leaves behind: still `completed` in the column, because the
    // first interval must survive, but carrying a reopen count.
    const reopened = item({
      state: 'completed',
      startedAt: '2026-10-03T04:00:00.000Z',
      completedAt: '2026-10-03T04:12:00.000Z',
      elapsedSeconds: 720,
      reopenCount: 2,
    });

    expect(uiStateOf(reopened)).toBe('reopened');
    // The property the distinction exists for: the FIRST interval is still reported, unchanged.
    expect(reopened.elapsedSeconds).toBe(720);
    expect(reopened.reopenCount).toBe(2);
  });
});
