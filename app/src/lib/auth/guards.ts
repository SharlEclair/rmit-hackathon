/**
 * Assignment-scoped route guards.
 *
 * **Why a shared module.** Phase 2's four routes each carried their own `authorise()` helper, which
 * was fine for four. Phase 4 adds seven more, and the check has an order that matters: role first,
 * then the resource, then enrolment -- because `06` section 5.2 rule 2 makes an unenrolled assignment
 * indistinguishable from an absent one (`NOT_FOUND`, never `FORBIDDEN_ROLE`), and a route that
 * checked enrolment first would leak the existence of another course's resources by returning a
 * different code.
 *
 * **What these helpers never do.** They do not decide *what* the caller may do with the resource,
 * only whether the caller may see it at all. Every guard returns the resolved ids and the session, so
 * a route cannot accidentally proceed with an unvalidated id.
 */

import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, type ApiErrorBody } from '@/lib/api/errors';
import { AuthError, requireRole, type SessionContext } from '@/lib/auth/roles';
import { findAssignmentScope, type AssignmentScope } from '@/lib/db/queries/assignments';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import { findReviewArtifact, type ReviewArtifactRow } from '@/lib/db/queries/review';
import { findVisibleAssignmentScope, type VisibleScope } from '@/lib/db/queries/student-visibility';
import { withTransaction } from '@/lib/db/transaction';

export type Guarded<T> = { readonly ok: true; readonly value: T } | {
  readonly ok: false;
  readonly response: NextResponse<ApiErrorBody>;
};

/** Resolve the session for a role, mapping an `AuthError` to its envelope. */
async function session(
  request: NextRequest,
  requestId: string,
  role: 'tutor' | 'student',
): Promise<Guarded<SessionContext>> {
  try {
    return { ok: true, value: await requireRole(role, request) };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, response: apiError(error.code, error.message, requestId) };
    }
    return { ok: false, response: apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId) };
  }
}

/**
 * A tutor, an existing assignment, and a tutor enrolment on its course.
 *
 * Returns the assignment scope so the route does not re-read it.
 */
export async function guardTutorAssignment(
  request: NextRequest,
  requestId: string,
  assignmentId: string,
): Promise<Guarded<{ session: SessionContext; scope: AssignmentScope }>> {
  const resolved = await session(request, requestId, 'tutor');
  if (!resolved.ok) return resolved;

  const scope = await withTransaction((tx) => findAssignmentScope(tx, assignmentId));
  if (scope === null) {
    return { ok: false, response: apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId) };
  }
  const role = await withTransaction((tx) =>
    findEnrolmentRole(tx, resolved.value.userId, scope.courseId),
  );
  if (role !== 'tutor') {
    return { ok: false, response: apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId) };
  }

  return { ok: true, value: { session: resolved.value, scope } };
}

/**
 * A tutor and an artifact they may act on, resolved through the artifact's own assignment.
 *
 * The artifact lookup happens **before** the enrolment check because the assignment id is a property
 * of the artifact; the alternative -- trusting an assignment id from the URL -- would let a tutor on
 * course A act on an artifact of course B by pairing their own assignment id with a foreign artifact
 * id.
 */
export async function guardTutorArtifact(
  request: NextRequest,
  requestId: string,
  artifactId: string,
): Promise<Guarded<{ session: SessionContext; artifact: ReviewArtifactRow }>> {
  const resolved = await session(request, requestId, 'tutor');
  if (!resolved.ok) return resolved;

  const artifact = await withTransaction((tx) => findReviewArtifact(tx, artifactId));
  if (artifact === null) {
    return { ok: false, response: apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId) };
  }

  const guarded = await guardTutorAssignment(request, requestId, artifact.assignmentId);
  if (!guarded.ok) return guarded;

  return { ok: true, value: { session: resolved.value, artifact } };
}

/**
 * A student and an assignment this student may see, **through gate rule G1**.
 *
 * `null` from `findVisibleAssignmentScope` is `NOT_FOUND` -- never an empty shell (`06` section 3.4,
 * trap T3). There is deliberately no variant of this guard that returns the assignment id without the
 * visible scope: a route that could list by assignment id could list before checking the gate.
 */
export async function guardStudentVisibleAssignment(
  request: NextRequest,
  requestId: string,
  assignmentId: string,
): Promise<Guarded<{ session: SessionContext; scope: VisibleScope }>> {
  const resolved = await session(request, requestId, 'student');
  if (!resolved.ok) return resolved;

  const scope = await withTransaction((tx) => findVisibleAssignmentScope(tx, assignmentId));
  if (scope === null) {
    return { ok: false, response: apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId) };
  }

  // G1 decides whether the assignment is published; enrolment decides whether this caller may see
  // this course. Both answer NOT_FOUND (`06` section 5.2 rule 2), so a student cannot use the
  // difference to learn that another course's assignment exists.
  const role = await withTransaction((tx) =>
    findEnrolmentRole(tx, resolved.value.userId, scope.courseId),
  );
  if (role !== 'student') {
    return { ok: false, response: apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId) };
  }

  return { ok: true, value: { session: resolved.value, scope } };
}
