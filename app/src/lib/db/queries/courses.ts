/**
 * Identity and access repositories: `users`, `courses`, `enrollments`
 * (`06` section 7.1; migration `0002_identity.sql`).
 *
 * This module is one of the six places SQL is allowed to live (`11` WP-02: `src/lib/db/queries/**`
 * is the only place SQL lives). Features call these functions; they never import the driver.
 *
 * **Idempotency shape, and why it is targetless.** Every insert below is
 * `on conflict do nothing` with **no conflict target**. A targeted `on conflict (id) do nothing`
 * only absorbs a collision on the named index; a collision on any *other* unique index on the
 * same table still raises. A re-run collides on both the primary key and the natural key
 * (`uq_users_email` is a unique index on `lower(email)`, `uq_courses_code`, `uq_enrollments_course_user`),
 * and which index Postgres reports first is not part of the contract. The targetless form absorbs
 * all of them, so a second `pnpm db:seed` is a true no-op rather than a race with the planner.
 *
 * `Executor` is a transaction handle. Callers group a write with the state it must not be
 * separated from inside one `sql.begin(...)`, which is what trap T7 requires of the analytics
 * emitter.
 */

import type { TransactionSql } from 'postgres';

/** The pool and a transaction handle are both accepted by every function in this package. */
export type Executor = TransactionSql;

/** `users.role` (`06` section 7.1.1). */
export type UserRole = 'student' | 'tutor';

/** `enrollments.role_in_course` (`06` section 7.1.3). Must equal the same user's `role`. */
export type RoleInCourse = 'student' | 'tutor';

export interface NewUser {
  readonly id: string;
  /** Stored lower-cased: `ck_users_email_lower` requires `email = lower(email)`. */
  readonly email: string;
  readonly displayName: string;
  /** Produced by `src/lib/auth/password.ts`. Never logged, never returned, never inspected here. */
  readonly passwordHash: string;
  readonly role: UserRole;
}

export interface NewCourse {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly term: string;
  readonly createdByUserId: string;
}

export interface NewEnrollment {
  readonly id: string;
  readonly courseId: string;
  readonly userId: string;
  /** Caller must pass the user's own `role` (`06` section 7.1.3). */
  readonly roleInCourse: RoleInCourse;
  readonly isOwner: boolean;
}

/** The `users.id` for an address, or `null` when no row matches. Never selects the hash. */
export async function findUserIdByEmail(ex: Executor, email: string): Promise<string | null> {
  const rows = await ex<{ id: string }[]>`
    select id from users where email = ${email} limit 1
  `;
  const first = rows[0];
  return first === undefined ? null : first.id;
}

/**
 * Insert a user unless the address or the id is already present.
 *
 * Returns `true` when this call inserted the row, so the caller can skip the argon2 hashing
 * work on a re-run and can report what it actually wrote. `users.password_hash` is argon2id with
 * a fresh random salt, so two fresh databases hold two different hashes for the same password;
 * the row is never rewritten once it exists, which is what keeps a re-run from changing it.
 */
export async function insertUserIfAbsent(ex: Executor, user: NewUser): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into users (id, email, display_name, password_hash, role)
    values (
      ${user.id}::uuid,
      ${user.email},
      ${user.displayName},
      ${user.passwordHash},
      ${user.role}
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertCourseIfAbsent(ex: Executor, course: NewCourse): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into courses (id, code, title, term, created_by_user_id)
    values (
      ${course.id}::uuid,
      ${course.code},
      ${course.title},
      ${course.term},
      ${course.createdByUserId}::uuid
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertEnrollmentIfAbsent(
  ex: Executor,
  enrollment: NewEnrollment,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into enrollments (id, course_id, user_id, role_in_course, is_owner)
    values (
      ${enrollment.id}::uuid,
      ${enrollment.courseId}::uuid,
      ${enrollment.userId}::uuid,
      ${enrollment.roleInCourse},
      ${enrollment.isOwner}
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

/** Enrolled students of a course, counted through `enrollments` rather than `users`. */
export async function countEnrolledStudents(ex: Executor, courseId: string): Promise<number> {
  const rows = await ex<{ total: number }[]>`
    select count(*)::int as total
    from enrollments
    where course_id = ${courseId}::uuid and role_in_course = 'student'
  `;
  const first = rows[0];
  return first === undefined ? 0 : first.total;
}
