import Link from 'next/link';

import { EmptyState } from '@/components/ui/empty-state';
import { loadCourses, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The student dashboard (`07` UI-UX-SPEC section 3.4).
 *
 * Route `/student` -- the role-appropriate landing path `SessionResponse.redirectTo` already points at
 * (`_shared.ts`). It lists the courses the student is enrolled in, each with its assignment count, and
 * one attention line when a tutor has answered one of their private Queries (`07` section 3.4: "one
 * attention line when the student has an open Query with a new tutor reply").
 *
 * **Authorisation is here, not in the middleware.** `requireStudentPage` re-reads the `users` row and
 * redirects an unauthenticated or non-student visitor; the middleware's cookie-presence check is
 * explicitly not authorisation (`_shared.ts`, `04` section 9.1).
 *
 * **The empty state is a sentence plus an action, never "No data"** (`07` section 2.1). A student with
 * no enrolments is a real state -- a new account before an administrator adds them to a course -- and
 * it says what would appear and what creates it.
 */
export default async function StudentDashboardPage() {
  const session = await requireStudentPage('/student');
  const { courses, attentionCourseIds } = await loadCourses(session);

  return (
    <main className="min-h-screen bg-page px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="heading-1 text-ink">My courses</h1>
          <p className="tight text-muted">Signed in as {session.profile.displayName}</p>
        </header>

        {courses.items.length === 0 ? (
          <EmptyState
            message="You are not enrolled in any courses yet. Your courses will appear here once you are enrolled."
            action={
              <Link className="tight text-info underline" href="/student">
                Refresh
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {courses.items.map((course) => (
              <li key={course.id}>
                <Link
                  className="block rounded-card border border-solid border-default bg-card p-4 shadow-card"
                  href={`/student/courses/${course.id}`}
                >
                  <span className="mb-1 block mono text-muted">{course.code}</span>
                  <span className="mb-2 block heading-3 text-ink">{course.title}</span>
                  <span className="block tight text-muted">
                    {course.term} - {course.assignmentCount}{' '}
                    {course.assignmentCount === 1 ? 'assignment' : 'assignments'}
                  </span>
                  {attentionCourseIds.has(course.id) ? (
                    // A sentence, not a count: a number beside a course name reads as a badge to clear
                    // rather than a reply to read (`07` section 2.1 rule 1: no state by colour alone).
                    <span className="mt-2 block tight text-info">
                      Your tutor has replied to a private question.
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
