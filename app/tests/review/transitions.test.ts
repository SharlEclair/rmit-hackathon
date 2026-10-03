/**
 * The approval state machine (`06` section 3.2; D22, D53, D98).
 *
 * **Why this suite exists, and what it would catch.** C3 and invariant **I2** are the constraints the
 * product is judged on: nothing AI-generated is student-visible until a tutor approves it, and a
 * published artifact that is edited leaves student-visible reads immediately. The ways an
 * implementation gets that wrong are all *working-looking*:
 *
 *   - it lets `AI_GENERATED` go straight to `APPROVED`, so the review queue is decorative;
 *   - it lets something reach `PUBLISHED` without `APPROVED`, so G1's predicate is satisfied by an
 *     artifact no tutor signed off on;
 *   - it leaves `approved_at` set on a row that moved back to `EDITED`, which the schema's
 *     `ck_*_approved_at` CHECK then rejects at write time -- a 500 rather than a clean save;
 *   - it leaves `published_at` set on an `EDITED` row, so the row's own columns claim it is published
 *     while G1 says it is not;
 *   - it introduces a **second** visibility threshold (`APPROVED`), which is exactly the tension
 *     handoff issue I-21 left for this phase to resolve.
 *
 * The suite is offline and pure: no database, no session, no provider (12 section 3.7 / `pnpm test`).
 */

import { describe, expect, it } from 'vitest';

import {
  APPROVABLE_STATUSES,
  isStudentVisible,
  permittedTransitions,
  PUBLISHABLE_STATUS,
  resolveTransition,
  type ReviewAction,
} from '@/features/review/transitions';
import type { PublicationStatus } from '@/lib/db/queries/structure';

const ALL_STATUSES: readonly PublicationStatus[] = [
  'AI_GENERATED',
  'NEEDS_REVIEW',
  'EDITED',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
];

const ALL_ACTIONS: readonly ReviewAction[] = ['save', 'approve', 'reject', 'publish'];

describe('the permitted transitions mirror 06 section 3.2 exactly', () => {
  it('permits every row the table lists, with the right target and transition number', () => {
    const expected: ReadonlyArray<[PublicationStatus, ReviewAction, PublicationStatus, number]> = [
      ['NEEDS_REVIEW', 'save', 'EDITED', 3],
      // A second save in the same editing session stays EDITED (reading 1 in the module header).
      ['EDITED', 'save', 'EDITED', 3],
      ['NEEDS_REVIEW', 'approve', 'APPROVED', 4],
      ['EDITED', 'approve', 'APPROVED', 5],
      ['APPROVED', 'save', 'EDITED', 6],
      ['APPROVED', 'publish', 'PUBLISHED', 7],
      ['PUBLISHED', 'save', 'EDITED', 8],
      ['AI_GENERATED', 'reject', 'REJECTED', 9],
      ['NEEDS_REVIEW', 'reject', 'REJECTED', 9],
      ['EDITED', 'reject', 'REJECTED', 9],
      ['APPROVED', 'reject', 'REJECTED', 9],
    ];
    for (const [from, action, to, transition] of expected) {
      const result = resolveTransition(from, action);
      expect(result.ok, `${from} --${action}--> should be permitted`).toBe(true);
      if (!result.ok) continue;
      expect(result.to, `${from} --${action}-->`).toBe(to);
      expect(result.transition, `${from} --${action}--> cites traversal number`).toBe(transition);
    }
  });

  it('expresses every permitted transition as one row of the exported table', () => {
    // Ten rows: nine from the specification's tutor rows (3, 4, 5, 6, 8, and four reject rows) plus
    // the repeat-save row of reading 1. Transition 7 (publish) is decided separately, because its
    // "from" is a set that applies to many rows at once rather than one artifact. The count is
    // asserted so a silently deleted row fails here rather than in production.
    const rows = permittedTransitions();
    expect(rows).toHaveLength(10);
    const identities = rows.map((row) => `${row.from}->${row.to}#${row.transition}`);
    expect(new Set(identities).size).toBe(identities.length);
    // The ten rows plus publish are the twelve `from`/`to` pairs of 06 section 3.2 that a tutor can
    // perform; the specification has ten numbered transitions, of which 1 and 2 are the pipeline's.
    const published = resolveTransition('APPROVED', 'publish');
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(`${published.from}->${published.to}#${published.transition}`).toBe('APPROVED->PUBLISHED#7');
  });

  it('never permits AI_GENERATED -> APPROVED (06 section 3.2, named refusal)', () => {
    const result = resolveTransition('AI_GENERATED', 'approve');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_STATE_TRANSITION');
    expect(result.message).toContain('AI_GENERATED');
    expect(result.message).toContain('approve');
    expect(result.message).toMatch(/review queue/);
  });

  it('never permits anything but APPROVED -> PUBLISHED (transition 7)', () => {
    for (const status of ALL_STATUSES) {
      const result = resolveTransition(status, 'publish');
      if (status === 'APPROVED') {
        expect(result.ok).toBe(true);
        continue;
      }
      expect(result.ok, `${status} must not be publishable`).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('INVALID_STATE_TRANSITION');
      expect(result.message).toContain('publish');
    }
  });

  it('treats REJECTED as terminal (transition 10 re-adds as a new row)', () => {
    for (const action of ALL_ACTIONS) {
      const result = resolveTransition('REJECTED', action);
      expect(result.ok, `REJECTED must not move on ${action}`).toBe(false);
    }
  });

  it('refuses to reject a published artifact, and says what to do instead', () => {
    const result = resolveTransition('PUBLISHED', 'reject');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/published artifact cannot be rejected/);
    expect(result.message).toMatch(/Edit it/);
  });

  it('decides every (status, action) pair -- the function is total', () => {
    for (const status of ALL_STATUSES) {
      for (const action of ALL_ACTIONS) {
        const result = resolveTransition(status, action);
        expect(typeof result.ok, `${status} x ${action}`).toBe('boolean');
        if (!result.ok) {
          // A refusal always names the attempted transition, which is `11` WP-06's acceptance
          // criterion for the 409 body.
          expect(result.message).toContain(status);
          expect(result.message).toContain(action);
        }
      }
    }
  });
});

describe('the stamp effects are what the schema demands', () => {
  it('sets the approval stamps on 4 and 5 and leaves published_at alone', () => {
    for (const from of ['NEEDS_REVIEW', 'EDITED'] as const) {
      const result = resolveTransition(from, 'approve');
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.effects.setApproval).toBe(true);
      expect(result.effects.clearApproval).toBe(false);
      expect(result.effects.setPublished).toBe(false);
      expect(result.effects.clearPublished).toBe(false);
    }
  });

  it('clears the approval stamp on APPROVED -> EDITED, as ck_*_approved_at requires', () => {
    const result = resolveTransition('APPROVED', 'save');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effects.clearApproval).toBe(true);
    expect(result.effects.setApproval).toBe(false);
    // `approved_at is null or publication_status in ('APPROVED','PUBLISHED')` -- keeping the stamp
    // while moving to EDITED is a CHECK violation, not a cosmetic slip.
    expect(result.effects.clearPublished).toBe(false);
  });

  it('clears both stamps on PUBLISHED -> EDITED (transition 8 hides the item immediately)', () => {
    const result = resolveTransition('PUBLISHED', 'save');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effects.clearApproval).toBe(true);
    expect(result.effects.clearPublished).toBe(true);
  });

  it('keeps the approval stamp and sets published_at on transition 7', () => {
    const result = resolveTransition('APPROVED', 'publish');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effects.setPublished).toBe(true);
    expect(result.effects.clearApproval).toBe(false);
    expect(result.effects.setApproval).toBe(false);
    expect(result.effects.clearPublished).toBe(false);
  });

  it('clears the approval stamp when an APPROVED artifact is rejected (transition 9)', () => {
    const result = resolveTransition('APPROVED', 'reject');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effects.clearApproval).toBe(true);
  });

  it('never sets and clears the same column in one transition', () => {
    for (const status of ALL_STATUSES) {
      for (const action of ALL_ACTIONS) {
        const result = resolveTransition(status, action);
        if (!result.ok) continue;
        expect(result.effects.setApproval && result.effects.clearApproval).toBe(false);
        expect(result.effects.setPublished && result.effects.clearPublished).toBe(false);
      }
    }
  });
});

describe('there is exactly one student-visibility threshold (D99, I-21)', () => {
  it('is PUBLISHED and nothing else', () => {
    for (const status of ALL_STATUSES) {
      expect(isStudentVisible(status), status).toBe(status === 'PUBLISHED');
    }
  });

  it('keeps APPROVED student-invisible, which is the rule an earlier gate text got wrong', () => {
    expect(isStudentVisible('APPROVED')).toBe(false);
  });

  it('exports the statuses each bulk action acts on', () => {
    expect([...APPROVABLE_STATUSES]).toEqual(['NEEDS_REVIEW', 'EDITED']);
    expect(PUBLISHABLE_STATUS).toBe('APPROVED');
  });
});
