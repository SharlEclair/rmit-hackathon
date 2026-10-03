/**
 * The anonymous identity service: `06-DATA-MODEL.md` section 4.2 and A-ID-1..A-ID-8 (C4, D26, D27, D55).
 *
 * **This is the only module that may read or write `anon_identities`** (A-ID-2). No other module may
 * import it, and `tests/discussion/imports.test.ts` asserts that, because the two tables it stands
 * between -- `users` and a discourse row -- are the only pair in the schema whose join would name the
 * author of an anonymous post (A-ID-1).
 *
 * **The display number is derived, then persisted, then read back -- never recomputed.** Trap **T14**:
 * "`ANON_ID_SECRET` rotation does **not** re-label existing posts. The label is computed at read time
 * from a persisted `display_number` via the single approved view." So rotation changes which number a
 * *new* identity receives and never which number an existing one shows. `06` section 4.2's operational
 * note says the same: "Treat `ANON_ID_SECRET` as permanent for the lifetime of an assignment."
 *
 * **Why the derivation is not the lookup key.** `06` section 4.2 fact 6: "The identity row is looked up
 * by `(student_id, assignment_id)`, not by HMAC. `pseudonym_hmac` is stored for audit and
 * reproducibility." A lookup by HMAC would work only while the secret is unchanged, which is precisely
 * the rotation case T14 exists for.
 *
 * **Domain separation.** The analytics pseudonym uses the prefix `aa:ana:v1|` (`analytics.ts`) and this
 * one uses `aa:anon:v1|`. `06` section 4.2 fact 4: "The two values are different by construction and
 * must never be treated as interchangeable." They are not: only this one is persisted beside a student
 * id, and only that one may appear in an identity-free table.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Executor } from '@/lib/db/queries/courses';

/** `06` section 4.2's message prefix. Distinct from the analytics prefix by design (fact 4). */
const ANON_DOMAIN_PREFIX = 'aa:anon:v1|';

/** `06` section 4.2: the display number is an integer in `1..900`. */
export const DISPLAY_NUMBER_MIN = 1;
export const DISPLAY_NUMBER_MAX = 900;

/** The number of collisions the probe loop will try before giving up. */
const MAX_PROBES = 900;

/** A resolved anonymous identity, with the label the UI renders. */
export interface AnonymousIdentity {
  readonly id: string;
  /**
   * The persisted display number. `Anonymous Student #<n>`, one space, capital `S`, no leading zero
   * (`06` section 4.1).
   */
  readonly displayNumber: number;
  readonly displayLabel: string;
}

/** `06` section 4.1's display contract, in one place. */
export function displayLabelFor(displayNumber: number): string {
  return `Anonymous Student #${String(displayNumber)}`;
}

/**
 * The HMAC of `06` section 4.2, as bytes.
 *
 * `msg = "aa:anon:v1|" + lower(student_id) + "|" + lower(assignment_id)`. Both ids are lower-cased
 * because UUIDs reach this code in either case and the derivation must be deterministic for one pair
 * regardless of how it was spelled.
 */
function pseudonymHmac(secret: string, studentId: string, assignmentId: string): Buffer {
  const message = `${ANON_DOMAIN_PREFIX}${studentId.toLowerCase()}|${assignmentId.toLowerCase()}`;
  return createHmac('sha256', secret).update(message).digest();
}

/**
 * `n = 1 + (uint32_be(h[0:4]) mod 900)`.
 *
 * Read as `06` section 4.2 states it: the first four bytes of the digest, big-endian, modulo 900. The
 * `analytics.ts` header records the same class of reading for its own slice -- the doc's `[0:16]` is
 * bytes, not hex characters -- and this is the neighbouring case.
 */
function candidateFrom(digest: Buffer): number {
  const value = digest.readUInt32BE(0);
  return DISPLAY_NUMBER_MIN + (value % DISPLAY_NUMBER_MAX);
}

/** The deterministic probe order of `06` section 4.2: `h_k = HMAC(key, msg + "|n" + str(k))`. */
function probeDigest(secret: string, studentId: string, assignmentId: string, k: number): Buffer {
  const message =
    `${ANON_DOMAIN_PREFIX}${studentId.toLowerCase()}|${assignmentId.toLowerCase()}|n${String(k)}`;
  return createHmac('sha256', secret).update(message).digest();
}

/**
 * The candidate numbers this pair will try, in order. Exported so a test can assert the sequence
 * without a database, which is the only way to test a derivation that is defined by its order.
 */
export function candidateNumbers(
  secret: string,
  studentId: string,
  assignmentId: string,
  count: number,
): number[] {
  const numbers: number[] = [
    candidateFrom(pseudonymHmac(secret, studentId, assignmentId)),
  ];
  for (let k = 1; k <= Math.min(count, MAX_PROBES); k += 1) {
    numbers.push(candidateFrom(probeDigest(secret, studentId, assignmentId, k)));
  }
  return numbers;
}

/**
 * The identity row for `(student, assignment)`, created on first use.
 *
 * **Created lazily and never deleted** (`06` section 4.3): "The first time the student posts
 * anonymously, opens a thread anonymously, or flags a post. It is never created for a student who only
 * reads." Deleting a row "would free its `display_number` and allow a later post by the same student to
 * appear as a different person mid-discussion".
 *
 * **The collision loop is bounded and the insert is the arbiter.** `UNIQUE (assignment_id,
 * display_number)` is the enforcement (`06` section 4.2 fact 2) and the probe loop is only how a value
 * is chosen, so the candidate is re-derived against the numbers that are actually taken rather than
 * against a count. Two concurrent first-posts for the same assignment can therefore both pick the same
 * number; the loser's insert conflicts, re-reads, and probes again -- `on conflict do nothing` plus a
 * loop, never an assumption that the row it wants is free.
 */
export async function identityFor(
  ex: Executor,
  input: { readonly anonIdSecret: string; readonly studentId: string; readonly assignmentId: string },
): Promise<AnonymousIdentity> {
  const existing = await findIdentity(ex, input.studentId, input.assignmentId);
  if (existing !== null) return existing;

  const hmac = pseudonymHmac(input.anonIdSecret, input.studentId, input.assignmentId);
  const candidates = candidateNumbers(input.anonIdSecret, input.studentId, input.assignmentId, MAX_PROBES);

  for (const displayNumber of candidates) {
    const rows = await ex<{ id: string; display_number: number }[]>`
      insert into anon_identities (student_id, assignment_id, pseudonym_hmac, display_number)
      values (
        ${input.studentId}::uuid,
        ${input.assignmentId}::uuid,
        ${hmac},
        ${displayNumber}
      )
      on conflict do nothing
      returning id, display_number
    `;
    const inserted = rows[0];
    if (inserted !== undefined) {
      return {
        id: inserted.id,
        displayNumber: inserted.display_number,
        displayLabel: displayLabelFor(inserted.display_number),
      };
    }

    // The conflict may have been this pair's own row (a concurrent call won) or another pair's number.
    // Re-reading first settles the common case without consuming a probe.
    const raced = await findIdentity(ex, input.studentId, input.assignmentId);
    if (raced !== null) return raced;
  }

  // 900 candidates and every one taken means the assignment has more than 900 anonymous authors, which
  // `06` section 4.2's `1..900` range cannot represent. Refusing is the only honest answer: the
  // alternative is a second pass that reuses a number and makes two students look like one person.
  throw new Error('anonymous identity space exhausted for this assignment');
}

/** The persisted identity for a pair, or `null`. Looked up by ids, never by HMAC (fact 6). */
async function findIdentity(
  ex: Executor,
  studentId: string,
  assignmentId: string,
): Promise<AnonymousIdentity | null> {
  const rows = await ex<{ id: string; display_number: number }[]>`
    select id, display_number
      from anon_identities
     where student_id = ${studentId}::uuid
       and assignment_id = ${assignmentId}::uuid
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        displayNumber: row.display_number,
        displayLabel: displayLabelFor(row.display_number),
      };
}

/**
 * The identity for a pair, or `null` when none exists -- **without creating one**.
 *
 * This is what own-post operations use (A-ID-7): "Student own-post operations (edit, delete) resolve
 * ownership by comparing `author_anon_identity_id` with the caller's identity row for that assignment.
 * A missing identity row means 'no anonymous posts', not 'no permission to check'." It must therefore
 * be callable without side effects: creating an identity row to answer "may I edit this?" would create
 * one for a student who has never posted anonymously, which `06` section 4.3 forbids.
 */
export async function findIdentityFor(
  ex: Executor,
  studentId: string,
  assignmentId: string,
): Promise<AnonymousIdentity | null> {
  return findIdentity(ex, studentId, assignmentId);
}

/**
 * A constant-time comparison of two identity ids, for the ownership check.
 *
 * The ids are not secrets, so this is not load-bearing for confidentiality -- but the ownership check
 * is the one place where a timing difference would distinguish "this post is yours" from "this post is
 * someone else's" for an attacker who has a candidate post id, so comparing with `timingSafeEqual` is
 * free and removes the question.
 */
export function identityMatches(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
