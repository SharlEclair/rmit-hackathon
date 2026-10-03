import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/ui/empty-state';
import { loadTutorCourseAssignments, requireTutorPage } from '@/features/review/server-data';

export const dynamic = 'force-dynamic';

/**
 * The assignments of one course, for its tutor (`07` UI-UX-SPEC section 3.7).
 *
 * Each row links to the review screen. The status word is the assignment's own lifecycle
 * (`draft`/`ingesting`/`in_review`/`published`/`archived`), which `06` section 3.6 keeps deliberately
 * distinct from an artifact's `publicationStatus` -- the two are different fields and conflating them
 * is the mistake `11` WP-02's corrected gate query exists to prevent (trap **T21**).
 */
export default async function TutorCourseAssignmentsPage(props: {
  readonly params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await props.params;
  const session = await requireTutorPage(`/tutor/courses/${courseId}`);
  const assignments = await loadTutorCourseAssignments(session, courseId);

  const course = session.courses.find((membership) => membership.id === courseId);
  if (course === undefined) notFound();

  return (
    <main className="min-h-screen bg-page px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <p className="mono text-muted">{course.code}</p>
          <h1 className="heading-1 text-ink">{course.title}</h1>
          <p className="tight text-muted">{course.term}</p>
        </header>

        {assignments.items.length === 0 ? (
          <EmptyState message="No assignments exist for this course yet. They will appear here once one is created." />
        ) : (
          <ul className="flex flex-col gap-3">
            {assignments.items.map((assignment) => (
              <li key={assignment.id}>
                <Link
                  className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-solid border-default bg-card p-4 shadow-card"
                  href={`/tutor/assignments/${assignment.id}/review`}
                >
                  <span className="flex flex-col gap-1">
                    <span className="heading-3 text-ink">{assignment.title}</span>
                    {assignment.dueAt === null ? null : (
                      <span className="tight text-muted">Due {assignment.dueAt.slice(0, 10)}</span>
                    )}
                  </span>
                  <span className="tight text-muted">{statusWord(assignment.status)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

/**
 * `06` section 3.1's lifecycle, in words.
 *
 * `in_review` is the state a publish is possible from, so it is the one a tutor most needs to
 * recognise; `ingesting` is the one where nothing can be done yet.
 */
function statusWord(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'ingesting':
      return 'Analysis running';
    case 'in_review':
      return 'In review';
    case 'published':
      return 'Published';
    default:
      return 'Archived';
  }
}
