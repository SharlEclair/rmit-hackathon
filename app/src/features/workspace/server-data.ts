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

/** One assignment as the sidebar needs it. Deliberately tiny: the sidebar renders names, not facts. */
export interface SidebarAssignment {
  readonly id: string;
  readonly title: string;
}

/** One course and its visible assignments, for the sidebar tree. */
export interface SidebarCourse {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly term: string;
  readonly roleInCourse: 'student' | 'tutor';
  readonly assignments: readonly SidebarAssignment[];
}

/**
 * Courses and their assignments, for the persistent sidebar.
 *
 * **Why one query rather than one per course.** The sidebar renders on every page, so a per-course
 * follow-up would put an N+1 on the critical path of every navigation. One statement returning
 * courses joined to their visible assignments keeps the whole tree in a single round trip.
 *
 * **Visibility is the role's, and it is the same rule the rest of the app uses.** A student sees only
 * `status = 'published'` assignments, which is gate rule G1 stated as a join predicate; a tutor sees
 * every assignment on a course they teach, because a draft or in-review assignment is precisely what
 * they are working on. A single `or` on `role_in_course` expresses both without a second code path
 * that could drift from `listCoursesForUser`'s own count.
 *
 * **Test fixtures are excluded, and that is a deliberate exception rather than a tidy-up.** The four
 * acceptance runs build their own assignments and never delete them, by design: deleting one would
 * take the audit trail the run exists to produce. They share a database with the demo, so after a few
 * rounds of verification the course tree was thirty-three rows of `Review demo (20:34)` and
 * `Student workspace demo (21:37)` with the one real assignment buried at the top. A navigation tree
 * that shows test residue teaches a reader that the sidebar is not worth reading.
 *
 * The exclusion is a **name predicate, not a status one**: those fixtures are genuinely published
 * assignments in the database, so nothing about their state distinguishes them. The predicate is kept
 * in one place, matches the two names `verify-student.ts` and `verify-review.ts` generate, and is
 * commented at both ends so a future fixture that forgets to match it is a one-line fix rather than a
 * mystery.
 *
 * **This is navigation, not content.** It carries a title and an id and nothing else: no status, no
 * progress, no dates. A sidebar that showed a status would be a second place for the product's
 * visibility rules to be stated, and a second place for them to be wrong (`06` section 3.4, trap T3).
 */
export async function loadSidebar(session: SessionContext): Promise<readonly SidebarCourse[]> {
  const rows = await withTransaction(
    (tx) =>
      tx<
        {
          course_id: string;
          course_code: string;
          course_title: string;
          course_term: string;
          role_in_course: string;
          assignment_id: string | null;
          assignment_title: string | null;
        }[]
      >`
        select c.id           as course_id,
               c.code         as course_code,
               c.title        as course_title,
               c.term         as course_term,
               e.role_in_course,
               a.id           as assignment_id,
               a.title        as assignment_title
          from enrollments e
          join courses c on c.id = e.course_id
          left join assignments a
                 on a.course_id = c.id
                and (e.role_in_course = 'tutor' or a.status = 'published')
                and a.title not like 'Review demo (%'
                and a.title not like 'Student workspace demo (%'
                and a.title not like 'Ingestion verification (%'
                and a.title not like 'Phase % discussion fixture %'
                and a.title not like 'Phase % analytics fixture %'
                and a.title not like 'Phase % fixture %'
         where e.user_id = ${session.userId}::uuid
         order by c.code asc, a.created_at asc
      `,
  );

  const byCourse = new Map<string, SidebarCourse & { assignments: SidebarAssignment[] }>();
  for (const row of rows) {
    const existing = byCourse.get(row.course_id) ?? {
      id: row.course_id,
      code: row.course_code,
      title: row.course_title,
      term: row.course_term,
      roleInCourse: row.role_in_course === 'tutor' ? ('tutor' as const) : ('student' as const),
      assignments: [] as SidebarAssignment[],
    };
    if (row.assignment_id !== null && row.assignment_title !== null) {
      existing.assignments.push({ id: row.assignment_id, title: row.assignment_title });
    }
    byCourse.set(row.course_id, existing);
  }

  return [...byCourse.values()];
}
