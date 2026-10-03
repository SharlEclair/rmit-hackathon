/**
 * The checklist transitions: `POST /api/student/checklist-items/{itemId}/{start|complete|reopen}`
 * (`06-DATA-MODEL.md` section 5.4, section 5.1.1's three verb paths).
 *
 * **Why one module rather than three route bodies.** The three operations share five steps in an order
 * that matters: resolve the item through gate rule G1, resolve the student's rollup row, write, read
 * back, return. Three copies of that sequence is three places for the gate to be forgotten -- and a
 * forgotten gate on a checklist write is the empty-shell bug with a write attached (trap T3).
 *
 * **Idempotency** (`06` section 5.1: "The three checklist transitions (start, complete, reopen) are
 * idempotent: repeating them returns the current state with 200"). Each query is written so a repeat
 * is a no-op rather than an error:
 *
 * | Call | Repeating it |
 * |---|---|
 * | `start` | `on conflict do nothing` -- returns the standing row, writes nothing, emits no second event |
 * | `complete` | guarded by `completed_at is null` -- D48: a later completion leaves the first interval |
 * | `reopen` | guarded by `reopen_count = <expected>` -- a repeat with the stale count is refused, not double-counted |
 *
 * **`reopen` takes an expected count and reports a conflict.** That guard is what stops two tabs from
 * incrementing `reopen_count` twice for one reopen. The caller sends the count it saw; a mismatch is
 * `INVALID_STATE_TRANSITION` rather than a silent second increment, which is the same optimistic-
 * concurrency shape Phase 4 uses for artifacts (`STALE_REVISION`).
 */

import { randomUUID } from 'node:crypto';

import type { ChecklistProgressResponse } from '@/lib/api/types';
import type { ErrorCode } from '@/lib/api/errors';
import type { SessionContext } from '@/lib/auth/roles';
import type { VisibleScope } from '@/lib/db/queries/student-visibility';
import { findOrCreateStudentAssignment } from '@/lib/db/queries/assistant';
import {
  completeChecklistItem,
  reopenChecklistItem,
  startChecklistItem,
} from '@/lib/db/queries/students';
import { withTransaction } from '@/lib/db/transaction';
import {
  findOwnChecklistProgress,
  findVisibleChecklistItem,
} from '@/lib/db/queries/student-workspace';

import { buildChecklistProgressResponse } from './bundle';

export type ChecklistTransition = 'start' | 'complete' | 'reopen';

export type TransitionOutcome =
  | { readonly ok: true; readonly body: ChecklistProgressResponse }
  | { readonly ok: false; readonly code: ErrorCode; readonly message: string };

/**
 * Apply one transition and return the standing state.
 *
 * `anonIdSecret` is required rather than read from config here: every transition emits its analytics
 * event in the same transaction as the write (trap T7), and `emitAnalyticsEvent` derives the
 * `subject_ref` from that secret. A transition that wrote the row without its event would leave a
 * permanently under-counting Assignment Health view, and there is no backfill (T7).
 */
export async function applyChecklistTransition(input: {
  readonly transition: ChecklistTransition;
  readonly scope: VisibleScope;
  readonly session: SessionContext;
  readonly itemId: string;
  readonly anonIdSecret: string;
  readonly now: Date;
  /** `reopen` only: the `reopen_count` the caller last saw. */
  readonly expectedReopenCount?: number;
}): Promise<TransitionOutcome> {
  const { scope, session, itemId, transition } = input;
  const studentId = session.userId;

  // (1) The item, through gate rule G1. A `null` covers "does not exist", "not published" and "not
  //     this student's assignment" with one answer, because all three are `NOT_FOUND`.
  const item = await withTransaction((tx) => findVisibleChecklistItem(tx, scope, itemId));
  if (item === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That Checklist item could not be found.' };
  }

  // (2) The student's rollup row, so the progress row has a parent. `student_assignments` is created
  //     on first open (`06` section 7.3.1), and a first `start` is a first open.
  const studentAssignmentId = await withTransaction((tx) =>
    findOrCreateStudentAssignment(tx, {
      id: randomUUID(),
      studentId,
      assignmentId: scope.assignmentId,
    }),
  );

  const common = {
    studentAssignmentId,
    studentId,
    assignmentId: scope.assignmentId,
    milestoneId: item.milestoneId,
    checklistItemId: item.itemId,
    anonIdSecret: input.anonIdSecret,
  } as const;

  switch (transition) {
    case 'start': {
      // A repeat is `on conflict do nothing`: `06` section 5.1 makes start idempotent, so a second
      // call is not an error and must not reset `started_at` (`08` section 4.2).
      await withTransaction((tx) =>
        startChecklistItem(tx, { ...common, id: randomUUID(), startedAt: input.now }),
      );
      break;
    }
    case 'complete': {
      const own = await withTransaction((tx) => findOwnChecklistProgress(tx, studentId, itemId));
      if (own === null || own.startedAt === null) {
        // Completing an item that was never started would ask Postgres to close an interval with no
        // beginning, which the schema refuses. It is a state error, not a validation error.
        return {
          ok: false,
          code: 'INVALID_STATE_TRANSITION',
          message: 'Start this item before completing it.',
        };
      }
      // A repeat is a no-op inside `completeChecklistItem` (the `completed_at is null` guard), so the
      // result is not inspected: the contract says a repeat returns the current state with 200.
      await withTransaction((tx) =>
        completeChecklistItem(tx, { ...common, completedAt: input.now }),
      );
      break;
    }
    case 'reopen': {
      const own = await withTransaction((tx) => findOwnChecklistProgress(tx, studentId, itemId));
      if (own === null || own.completedAt === null) {
        return {
          ok: false,
          code: 'INVALID_STATE_TRANSITION',
          message: 'Only a completed item can be reopened.',
        };
      }
      const expected = input.expectedReopenCount ?? own.reopenCount;
      if (expected !== own.reopenCount) {
        return {
          ok: false,
          code: 'INVALID_STATE_TRANSITION',
          message: 'This item was reopened somewhere else. Reload the Checklist and try again.',
        };
      }
      const reopened = await withTransaction((tx) =>
        reopenChecklistItem(tx, {
          ...common,
          reopenedAt: input.now,
          expectedReopenCount: expected,
        }),
      );
      if (!reopened) {
        return {
          ok: false,
          code: 'INVALID_STATE_TRANSITION',
          message: 'This item was reopened somewhere else. Reload the Checklist and try again.',
        };
      }
      break;
    }
  }

  // (3) Read the standing row back. The three writes compute `elapsed_seconds` inside Postgres, so
  //     the row is the only honest source for it.
  const body = await withTransaction((tx) =>
    buildChecklistProgressResponse(tx, scope, studentId, itemId),
  );
  if (body === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That Checklist item could not be found.' };
  }
  return { ok: true, body };
}
