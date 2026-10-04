import Link from 'next/link';

import { EmptyState } from '@/components/ui/empty-state';
import { loadTutorCourses, requireTutorPage } from '@/features/review/server-data';

export const dynamic = 'force-dynamic';

/**
 * The tutor dashboard (`07` UI-UX-SPEC section 3.6).
 *
 * It lists the courses this tutor teaches, each linking to its assignments. The review work itself is
 * per assignment (`07` section 7.3), so this page is navigation and nothing else: it deliberately shows
 * no cohort numbers, because `08` section 2.1 forbids per-student aggregates outside Assignment Health
 * and a count on a dashboard is the first place a per-student figure would appear.
 *
 * **The 404 discipline applies to the empty case too.** A tutor with no courses sees a sentence rather
 * than an empty page (`07` section 2.1), and the sentence says what would appear and what creates it.
 */
export default async function TutorDashboardPage() {
  const session = await requireTutorPage('/tutor');
  const courses = await loadTutorCourses(session);

  return (
    <main className="min-h-screen bg-page px-4 py-8 md:px-6 lg:px-8">
      {/* The same composition rules as the student dashboard, so the two read as one product:
          `17` section 4.1's 1200px cap and its 4/8/12/16/24/32/48 rhythm. */}
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="heading-1 text-ink">Courses I tutor</h1>
          <p className="tight text-muted">Signed in as {session.profile.displayName}</p>
        </header>

        {courses.items.length === 0 ? (
          <EmptyState
            message="You are not a tutor on any course yet. Your courses will appear here once you are added to one."
            action={
              <Link className="tight text-info underline" href="/tutor">
                Refresh
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-6">
            {courses.items.map((course) => (
              <li key={course.id}>
                {/* No shadow: `17` section 1.3 principle 4 reserves elevation for overlays, and a
                    course card is part of the page. The hover moves the border rather than
                    de-emphasising the card, which the design law forbids. */}
                <Link
                  className="block rounded-card border border-solid border-default bg-card p-4 shadow-card transition duration-base ease-out hover:-translate-y-px hover:border-ink hover:shadow-lift md:p-6"
                  href={`/tutor/courses/${course.id}`}
                >
                  <span className="mono block text-muted">{course.code}</span>
                  <span className="heading-3 mb-2 mt-1 block text-ink">{course.title}</span>
                  <span className="tight block text-muted">
                    {course.term} - {course.assignmentCount}{' '}
                    {course.assignmentCount === 1 ? 'assignment' : 'assignments'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
