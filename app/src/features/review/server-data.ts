/**
 * Server-side loading for the tutor pages.
 *
 * **The gate is the enrolment, and its order is the same one the routes use.** `06` section 5.2 rule 2
 * makes an unenrolled assignment indistinguishable from an absent one: both are `NOT_FOUND`, never
 * `FORBIDDEN_ROLE`, so a tutor on course A cannot learn that course B's assignment exists by reading a
 * different status code. `guardTutorAssignment` in `src/lib/auth/guards.ts` implements that order for
 * route handlers; this module implements the same order for a page, because a page cannot call a
 * function that takes a `NextRequest`.
 *
 * **The role check is `session.role`, read from the `users` row on this request** by
 * `getServerSession`, never from the cookie's claim (`04` section 9.1).
 */

import { notFound, redirect } from 'next/navigation';

import type { CourseListResponse, ReviewBundleResponse } from '@/lib/api/types';
import { LOGIN_PATH, TUTOR_LANDING_PATH } from '@/lib/auth/_shared';
import type { SessionContext } from '@/lib/auth/roles';
import { getServerSession } from '@/lib/auth/server-session';
import { withTransaction } from '@/lib/db/transaction';
import { findAssignmentScope } from '@/lib/db/queries/assignments';
import { findEnrolmentRole, type Executor } from '@/lib/db/queries/courses';
import { listCoursesForUser } from '@/lib/db/queries/student-workspace';
import { buildReviewBundle } from '@/features/review/bundle';

/** The signed-in tutor, or a redirect. Never returns for an unauthenticated or non-tutor request. */
export async function requireTutorPage(path: string): Promise<SessionContext> {
  const session = await getServerSession();
  if (session === null) redirect(`${LOGIN_PATH}?next=${encodeURIComponent(path)}`);
  if (session.role !== 'tutor') {
    // A student who reaches a tutor path is sent to their own landing page rather than shown a tutor
    // screen. The route handlers answer `FORBIDDEN_ROLE` (`06` section 5.2 rule 3); a page cannot
    // render an error envelope, and a redirect is the equivalent the browser can act on.
    redirect(TUTOR_LANDING_PATH.replace('/tutor', '/student'));
  }
  return session;
}

/** The tutor dashboard: the courses they teach, with a count of assignments they can review. */
export async function loadTutorCourses(session: SessionContext): Promise<CourseListResponse> {
  const courses = await withTransaction((tx) => listCoursesForUser(tx, session.userId));
  return {
    items: courses
      // A tutor's dashboard lists the courses they tutor. `listCoursesForUser` returns every
      // enrolment, and a user who both studies and teaches has both roles in the same list.
      .filter((course) => course.roleInCourse === 'tutor')
      .map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        term: course.term,
        roleInCourse: 'tutor' as const,
        assignmentCount: course.assignmentCount,
      })),
  };
}

/**
 * The review bundle for one assignment, through the tutor gate.
 *
 * `notFound()` for a missing assignment, a missing tutor enrolment, and a `null` bundle -- all three are
 * the same `404` a route would return. A page that rendered an empty review queue instead would
 * confirm the assignment exists.
 */
export async function loadReviewBundle(
  session: SessionContext,
  assignmentId: string,
): Promise<ReviewBundleResponse> {
  const scope = await withTransaction((tx) => findAssignmentScope(tx, assignmentId));
  if (scope === null) notFound();

  const role = await withTransaction((tx) =>
    findEnrolmentRole(tx, session.userId, scope.courseId),
  );
  if (role !== 'tutor') notFound();

  const bundle = await withTransaction((tx) => buildReviewBundle(tx, assignmentId));
  if (bundle === null) notFound();
  return bundle;
}

/** The assignments of one course, for the tutor's course page. */
export async function loadTutorCourseAssignments(
  session: SessionContext,
  courseId: string,
): Promise<{ courseId: string; items: ReviewBundleResponse['assignment'][] }> {
  const role = await withTransaction((tx) => findEnrolmentRole(tx, session.userId, courseId));
  if (role !== 'tutor') notFound();

  // Read through the scoped query rather than the student card list: a tutor's cards carry review
  // counts, and `listAssignmentCardsForStudent` deliberately does not produce them (the student view
  // must not show them).
  const rows = await withTransaction((tx) => listCourseAssignmentsForTutor(tx, courseId));
  return { courseId, items: rows };
}

/** `assignments` for one course, with no student-derived field (`08` section 2.1). */
async function listCourseAssignmentsForTutor(
  tx: Executor,
  courseId: string,
): Promise<ReviewBundleResponse['assignment'][]> {
  const rows = await tx<
    { id: string; title: string; status: string; due_at: Date | string | null; current_structure_id: string | null }[]
  >`
    select id, title, status, due_at, current_structure_id
      from assignments
     where course_id = ${courseId}::uuid
     order by due_at asc nulls last, created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status as ReviewBundleResponse['assignment']['status'],
    dueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
    currentStructureId: row.current_structure_id,
  }));
}
