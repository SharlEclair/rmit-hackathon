/**
 * The auth module's database repository.
 *
 * **Every SQL statement the auth module issues lives here and nowhere else.** `04` S4 property 2
 * is explicit that nothing writes to Postgres except `src/lib/db/`; this module is the auth
 * module's single door into it, which is what makes the fallback below a one-file concern.
 *
 * **Query layer: Drizzle over `@/lib/db/schema`** (`04` S2.1). WP-03 permits a fallback --
 * `sql` from `postgres` via `@/lib/db/client` -- only "if it is not present yet". The schema has
 * since landed (`app/src/lib/db/schema.ts`, tables `users`, `courses`, `enrollments`), so the
 * typed query layer is what is implemented and the raw-SQL fallback was not needed.
 *
 * **C7.** `password_hash` is read by exactly two functions in this file, both of which exist only
 * for authentication. No function here returns a hash to a caller that serialises JSON:
 * `AuthUser.passwordHash` is read by the login route for the comparison and by nothing else, and
 * `SessionResponse` (`06` S5.5.1) has no field that could carry it.
 */

import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import { courses, enrollments, users } from '@/lib/db/schema';

export type Role = 'student' | 'tutor';

/** The `users` row as `06` S7.1.1 defines it. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly isActive: boolean;
  readonly lastLoginAt: Date | null;
}

/** The subset of `users` that may leave the repository for a session payload. No hash. */
export interface AuthUserProfile {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly isActive: boolean;
}

/** One `enrollments` row joined to its `courses` row (`06` S5.5.1 `courses[]`). */
export interface CourseMembership {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly term: string;
  readonly roleInCourse: Role;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): string {
  // A malformed id would make Postgres raise `invalid input syntax for type uuid`, whose message
  // is a SQL detail. Refusing here keeps the failure a clean miss at the call site and keeps
  // driver text out of any response (`06` S5.3).
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} is not a UUID`);
  }
  return value;
}

function isRole(value: string): value is Role {
  return value === 'student' || value === 'tutor';
}

/**
 * `users.role` has a CHECK constraint, so a value outside the union is unreachable unless the
 * schema changed underneath us. Fail closed rather than inventing a role.
 */
function requireRole(value: string, column: string): Role {
  if (!isRole(value)) {
    throw new Error(`${column} holds a value outside the permitted set`);
  }
  return value;
}

/**
 * Look up an account by email for sign-in.
 *
 * The `users` table stores `email = lower(email)` with `UNIQUE (lower(email))` (`06` S7.1.1), and
 * the address is lower-cased here as well as by the route's schema so an indexed equality match is
 * possible regardless of what the caller typed.
 *
 * Returns `null` for an unknown address; the caller must not distinguish that from a wrong
 * password in the response (`07` S3.1: "the same message is used for an unknown email and a wrong
 * password").
 */
export async function findUserByEmail(
  databaseUrl: string | null,
  email: string,
): Promise<AuthUser | null> {
  const db = getDb(databaseUrl);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    role: requireRole(row.role, 'users.role'),
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
  };
}

/**
 * Re-read an account by id, **without** the hash.
 *
 * This is the function that makes the token's role claim a convenience rather than an
 * authorisation: `roles.ts` calls it on every request, so a deactivated account or a changed role
 * takes effect on the next request even though the cookie still carries the old claim
 * (`04` S9.1).
 */
export async function findUserProfileById(
  databaseUrl: string | null,
  userId: string,
): Promise<AuthUserProfile | null> {
  const db = getDb(databaseUrl);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, assertUuid(userId, 'userId')))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: requireRole(row.role, 'users.role'),
    isActive: row.isActive,
  };
}

/**
 * The courses a user is enrolled in, with their role on each (`06` S7.1.3).
 *
 * Sorted by course code so `SessionResponse.courses` is stable across requests; `06` S5.1 says
 * "default sort is documented per endpoint", and a stable order is the conservative choice where
 * none is specified.
 */
export async function listCourseMemberships(
  databaseUrl: string | null,
  userId: string,
): Promise<CourseMembership[]> {
  const db = getDb(databaseUrl);
  const rows = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      term: courses.term,
      roleInCourse: enrollments.roleInCourse,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(eq(enrollments.userId, assertUuid(userId, 'userId')))
    .orderBy(asc(courses.code));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    term: row.term,
    roleInCourse: requireRole(row.roleInCourse, 'enrollments.role_in_course'),
  }));
}

/**
 * Record a successful sign-in. Best effort: a failure here must not fail the sign-in, because the
 * column is informational and a student locked out of a demo by a metadata write is a worse
 * outcome than a stale `last_login_at`.
 */
export async function touchLastLoginAt(
  databaseUrl: string | null,
  userId: string,
  at: Date,
): Promise<void> {
  try {
    const db = getDb(databaseUrl);
    await db
      .update(users)
      .set({ lastLoginAt: at, updatedAt: at })
      .where(and(eq(users.id, assertUuid(userId, 'userId'))));
  } catch {
    // Deliberately swallowed: see the function comment. Nothing is logged, so no row value can
    // reach a log line (C7).
  }
}
