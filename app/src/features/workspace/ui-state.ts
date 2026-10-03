/**
 * The checklist item's **UI** state, which is not the state the API or the column stores.
 *
 * **Why this is its own module, and why it has no server imports.** Both a client component (the
 * Checklist panel and the row it renders) and a server module (the workspace bundle) need this
 * mapping. Placing it in `bundle.ts` would drag the whole query layer into the browser bundle, so it
 * lives alone with one type-only import. It is the only place the two vocabularies meet.
 *
 * **The problem it solves** (**D108**). The API contract and the `student_checklist_progress.state`
 * column both have three values (`06` section 5.5.6), but `07` section 4.6 rule 6 describes a fourth:
 * "an item that has been reopened shows the **first** start-to-complete elapsed time and the note
 * `Reopened <n> time(s)`". `reopen_count` is the fact that distinguishes it, and after Phase 5's fix
 * `reopenChecklistItem` sets `state = 'in_progress'` on reopen (`06` section 7.3.2) so the student can
 * complete it again -- which means the stored state alone cannot tell "in progress for the first time"
 * from "in progress after a reopen".
 *
 * Deriving the fourth value rather than adding it to the payload is the recorded reading: the payload
 * is typed from the stored column, and the distinction is presentational. It is forced where it
 * matters by the row component's own prop type --
 * `{ state: 'reopened'; elapsed: string; reopenedCount: number }` -- so a UI that collapsed `reopened`
 * into `in-progress` fails to compile rather than silently losing the first interval, which is exactly
 * what D48 exists to preserve.
 */

import type { ChecklistItemResponse } from '@/lib/api/types';

export type ChecklistItemUiState = 'not-started' | 'in-progress' | 'complete' | 'reopened';

/**
 * The UI state of one item.
 *
 * A `completed` row with any reopen is `reopened`; without one it is `complete`. An `in_progress` row
 * is `in-progress` whether or not it has been reopened, because the row's control is `Complete` in both
 * cases and the difference D48 cares about is the *elapsed time*, which the row shows either way.
 */
export function uiStateOf(item: ChecklistItemResponse): ChecklistItemUiState {
  if (item.state === 'not_started') return 'not-started';
  if (item.state === 'in_progress') return 'in-progress';
  return item.reopenCount > 0 ? 'reopened' : 'complete';
}
