/**
 * Server-side workspace loading for the student pages.
 *
 * **Why the pages read the query layer and not their own HTTP API.** A server component that
 * `fetch`es `/api/student/...` would need to forward the session cookie, would run a second full
 * request inside the first, and would put the URL contract between two halves of one process. These
 * pages call the same builders the routes call, inside the same transaction, so a page cannot show
 * something the API would refuse -- and the API stays the contract for *other* clients rather than a
 * hop this app makes to itself.
 *
 * **Gate rule G1 is enforced here by the same function the routes use.** `findVisibleAssignmentScope`
 * is the only source of a `VisibleScope`, so a page has no way to read an assignment's content before
 * the gate resolved (trap T3). A `null` scope becomes `notFound()`, never an empty shell.
 */

import { notFound, redirect } from 'next/navigation';

import type {
  AssignmentListResponse,
  AssignmentStatusApi,
  BriefResponse,
  ChecklistResponse,
  CourseListResponse,
  StudentWorkspaceResponse,
} from '@/lib/api/types';
import { LOGIN_PATH } from '@/lib/auth/_shared';
import type { SessionContext } from '@/lib/auth/roles';
import { getStudentServerSession } from '@/lib/auth/server-session';
import { withTransaction } from '@/lib/db/transaction';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import { findVisibleAssignmentScope, type VisibleScope } from '@/lib/db/queries/student-visibility';
import {
  countAnsweredQueriesPerCourse,
  listAssignmentCardsForStudent,
  listCoursesForUser,
} from '@/lib/db/queries/student-workspace';
import { buildBriefResponse, buildChecklistResponse, buildStudentWorkspace } from '@/features/workspace/bundle';

const STATUSES: readonly AssignmentStatusApi[] = [
  'draft',
  'ingesting',
  'in_review',
  'published',
  'archived',
];

function toStatus(value: string): AssignmentStatusApi {
  return STATUSES.find((status) => status === value) ?? 'draft';
}

/** The signed-in student, or a redirect to sign in. Never returns for an unauthenticated request. */
export async function requireStudentPage(path: string): Promise<SessionContext> {
  const session = await getStudentServerSession();
  if (session === null) {
    // `07` section 3.2: an unauthenticated request goes to the login screen with `?next=` so the
    // student lands where they were trying to go. The middleware does the same cheap check; this is
    // the authorisation, and it runs even when the middleware was bypassed.
    redirect(`${LOGIN_PATH}?next=${encodeURIComponent(path)}`);
  }
  return session;
}

/** The dashboard: the courses this student is enrolled in, each with its attention flag. */
export async function loadCourses(session: SessionContext): Promise<{
  courses: CourseListResponse;
  /**
   * Course ids with at least one Query the tutor has answered, so the card can show `07` section
   * 3.4's single attention line. A `Set` rather than a count: the line says *that* a reply is waiting,
   * and a number beside a course name reads as a badge to clear rather than a prompt to read.
   */
  attentionCourseIds: ReadonlySet<string>;
}> {
  const [courses, answered] = await Promise.all([
    withTransaction((tx) => listCoursesForUser(tx, session.userId)),
    withTransaction((tx) => countAnsweredQueriesPerCourse(tx, session.userId)),
  ]);
  return {
    courses: {
      items: courses.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        term: course.term,
        roleInCourse: course.roleInCourse === 'tutor' ? 'tutor' : 'student',
        assignmentCount: course.assignmentCount,
      })),
    },
    attentionCourseIds: new Set(
      [...answered.entries()].filter(([, count]) => count > 0).map(([courseId]) => courseId),
    ),
  };
}

/**
 * The assignments of one course, for a student.
 *
 * `notFound()` when the student is not enrolled: `06` section 5.2 rule 2 makes an unenrolled course
 * indistinguishable from an absent one, and a page that rendered an empty list would confirm the
 * course exists.
 */
export async function loadCourseAssignments(
  session: SessionContext,
  courseId: string,
): Promise<AssignmentListResponse> {
  const role = await withTransaction((tx) => findEnrolmentRole(tx, session.userId, courseId));
  if (role !== 'student') notFound();

  const cards = await withTransaction((tx) =>
    listAssignmentCardsForStudent(tx, session.userId, courseId),
  );
  return {
    items: cards.map((card) => ({
      id: card.id,
      title: card.title,
      status: toStatus(card.status),
      dueAt: card.dueAt,
      publishedAt: card.publishedAt,
      checklistCompleted: card.checklistCompleted,
      checklistTotal: card.checklistTotal,
      openQueryCount: card.openQueryCount,
      needsReviewCount: null,
    })),
  };
}

export interface LoadedWorkspace {
  readonly workspace: StudentWorkspaceResponse;
  /**
   * The resolved gate. The tab pages need it to build their own response without re-resolving the
   * gate, which would be three chances to disagree about whether the assignment is visible.
   */
  readonly scope: VisibleScope;
}

/**
 * The workspace bootstrap, through the gate.
 *
 * `notFound()` for every `null`: the assignment is not published, it has no current structure, or it
 * has no readable header. All three are `NOT_FOUND` to a student and none is an empty shell
 * (`06` section 3.4, trap T3).
 */
export async function loadWorkspace(
  session: SessionContext,
  assignmentId: string,
): Promise<LoadedWorkspace> {
  const result = await withTransaction(async (tx) => {
    const scope = await findVisibleAssignmentScope(tx, assignmentId);
    if (scope === null) return null;
    const workspace = await buildStudentWorkspace(tx, scope, session.userId);
    return workspace === null ? null : { workspace, scope };
  });

  if (result === null) notFound();
  return result;
}

/** The checklist tab's own response, from a scope the layout already gated. */
export async function loadChecklist(
  scope: VisibleScope,
  session: SessionContext,
): Promise<ChecklistResponse> {
  return withTransaction((tx) => buildChecklistResponse(tx, scope, session.userId));
}

/** The Assignment tab's brief, from a scope the layout already gated. */
export async function loadBrief(scope: VisibleScope): Promise<BriefResponse> {
  return withTransaction((tx) => buildBriefResponse(tx, scope));
}
