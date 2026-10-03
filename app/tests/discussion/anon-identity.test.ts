import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  DISPLAY_NUMBER_MAX,
  DISPLAY_NUMBER_MIN,
  candidateNumbers,
  displayLabelFor,
  identityMatches,
} from '@/features/discussion/anon-identity';

/**
 * The anonymous-identity derivation of `06-DATA-MODEL.md` section 4.2.
 *
 * **Why this is tested against an independent implementation of the formula.** The function under test
 * has one arithmetic literal that matters -- `1 + (uint32_be(h[0:4]) mod 900)` -- and a transcription
 * error in it (`mod 899`, `readUInt32LE`, a slice from byte 1) produces a perfectly plausible number
 * that is simply not the spec's. Comparing the implementation to itself would pass; so the test below
 * recomputes the number from the doc's own words, in the test, with its own `createHmac` call, and
 * requires the two to agree.
 *
 * What this cannot cover is persistence: the `UNIQUE (assignment_id, display_number)` arbitration, the
 * lazy creation and the rotation rule are behaviours of `identityFor` against a database, and
 * `pnpm test` must pass with no database (`12` section 3.7). Those live in `scripts/verify-discussion.ts`
 * with the rest of Phase 6's route-level checks.
 */

const SECRET = 'a-test-secret-that-is-not-the-real-one';
const STUDENT = 'd00e0b8c-bf1a-4fc6-b26b-4534555bd081';
const ASSIGNMENT = '9bcc22f0-61ba-49e0-870b-f85b57a86bfd';

/** `06` section 4.2, transcribed from the doc rather than from the module under test. */
function specDisplayNumber(secret: string, studentId: string, assignmentId: string): number {
  const message = `aa:anon:v1|${studentId.toLowerCase()}|${assignmentId.toLowerCase()}`;
  const digest = createHmac('sha256', secret).update(message).digest();
  return 1 + (digest.readUInt32BE(0) % 900);
}

/** `06` section 4.2's probe: `h_k = HMAC(key, msg + "|n" + str(k))`. */
function specProbeNumber(
  secret: string,
  studentId: string,
  assignmentId: string,
  k: number,
): number {
  const message = `aa:anon:v1|${studentId.toLowerCase()}|${assignmentId.toLowerCase()}|n${String(k)}`;
  const digest = createHmac('sha256', secret).update(message).digest();
  return 1 + (digest.readUInt32BE(0) % 900);
}

describe('the display number is the one 06 section 4.2 specifies', () => {
  it('agrees with an independent transcription of the formula', () => {
    expect(candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 1)[0]).toBe(
      specDisplayNumber(SECRET, STUDENT, ASSIGNMENT),
    );
  });

  it('agrees with the probe order for the first four probes', () => {
    const produced = candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 4);
    // The first candidate is the un-probed one; the rest are k = 1..4.
    expect(produced.slice(1)).toEqual([
      specProbeNumber(SECRET, STUDENT, ASSIGNMENT, 1),
      specProbeNumber(SECRET, STUDENT, ASSIGNMENT, 2),
      specProbeNumber(SECRET, STUDENT, ASSIGNMENT, 3),
      specProbeNumber(SECRET, STUDENT, ASSIGNMENT, 4),
    ]);
  });

  it('stays inside 1..900', () => {
    for (const value of candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 40)) {
      expect(value).toBeGreaterThanOrEqual(DISPLAY_NUMBER_MIN);
      expect(value).toBeLessThanOrEqual(DISPLAY_NUMBER_MAX);
    }
  });

  it('is deterministic: the same pair always derives the same first candidate', () => {
    expect(candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 1)[0]).toBe(
      candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 1)[0],
    );
  });
});

describe('the derivation separates assignments and secret generations (06 section 4.2 facts 1, 3, 4)', () => {
  it('gives a different candidate for the same student in a different assignment', () => {
    // Fact 3: the message includes `assignment_id`, so the same student is unlinkable across
    // assignments. The assertion is on the whole sequence, because a collision in the first candidate
    // is possible (900 buckets) while a collision across five candidates is not a real risk -- and if
    // one ever occurred this test would be the thing that noticed.
    const other = 'a121e5e0-0000-4000-8000-000000000000';
    expect(candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 5)).not.toEqual(
      candidateNumbers(SECRET, STUDENT, other, 5),
    );
  });

  it('does not use the analytics domain prefix', () => {
    // Fact 4: `aa:ana:v1|` is the analytics pseudonym and `aa:anon:v1|` is this one. A derivation that
    // used the wrong prefix would still be deterministic and still land in 1..900, so the only way to
    // catch it is to pin the value the correct prefix produces.
    expect(candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 1)[0]).toBe(
      specDisplayNumber(SECRET, STUDENT, ASSIGNMENT),
    );
    const analyticsStyle = createHmac('sha256', SECRET)
      .update(`aa:ana:v1|${STUDENT}|${ASSIGNMENT}`)
      .digest();
    const analyticsNumber = 1 + (analyticsStyle.readUInt32BE(0) % 900);
    // Not an assertion that they differ -- two independent draws collide 1 in 900 of the time -- but
    // that the value the module produces is the `anon` one even when the `ana` one is computable.
    expect(candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 1)[0]).toBe(
      specDisplayNumber(SECRET, STUDENT, ASSIGNMENT),
    );
    // Recorded rather than asserted, so a collision in the fixed fixtures is visible in the output.
    if (analyticsNumber === specDisplayNumber(SECRET, STUDENT, ASSIGNMENT)) {
      expect.fail('the fixed fixture collides across domains; choose another secret');
    }
  });

  it('changes when the secret changes, which is what rotation does', () => {
    // Fact 1 makes the value a function of the secret, so rotation gives a *new* identity a different
    // number. That is exactly why T14 exists: an existing row must keep the number it already has,
    // which is why the row is looked up by ids and not re-derived (fact 6).
    expect(candidateNumbers(SECRET, STUDENT, ASSIGNMENT, 1)[0]).not.toBe(
      candidateNumbers(`${SECRET}-rotated`, STUDENT, ASSIGNMENT, 1)[0],
    );
  });
});

describe('the label is the fixed shape of 06 section 4.1', () => {
  it('renders one space, a capital S, a hash and no leading zero', () => {
    expect(displayLabelFor(1)).toBe('Anonymous Student #1');
    expect(displayLabelFor(482)).toBe('Anonymous Student #482');
    expect(displayLabelFor(900)).toBe('Anonymous Student #900');
    expect(displayLabelFor(7)).not.toBe('Anonymous Student #07');
  });
});

describe('identityMatches is the ownership comparison (A-ID-7)', () => {
  it('is true only for two non-null equal ids', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(identityMatches(id, id)).toBe(true);
    expect(identityMatches(id, null)).toBe(false);
    expect(identityMatches(null, id)).toBe(false);
    expect(identityMatches(null, null)).toBe(false);
    expect(identityMatches(id, '22222222-2222-4222-8222-222222222222')).toBe(false);
  });

  it('does not throw on ids of different lengths', () => {
    // `timingSafeEqual` throws on a length mismatch, so the guard is load-bearing for a caller that
    // compares a stored id against a client-influenced one.
    expect(() => identityMatches('short', 'a-much-longer-id')).not.toThrow();
    expect(identityMatches('short', 'a-much-longer-id')).toBe(false);
  });
});
