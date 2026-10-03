import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/ui/empty-state';
import { loadCourseAssignments, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The student assignments page (`07` UI-UX-SPEC section 3.5).
 *
 * Card contents are the doc's: "title, due date when set, resolution rate as a percentage, `n of m
 * Checklist items complete`, open Query count", ordered "by due date ascending, with undated
 * assignments last" (which the query does with `nulls last`).
 *
 * **Two rules that are easy to break and are therefore stated.** First, "an assignment card never
 * shows a progress number derived from anything but the student's own Checklist progress (US-S-9)" --
 * which is why the counts come from `student_checklist_progress`, filtered to the student, and not from
 * any aggregate. Second, a student sees only `PUBLISHED` assignments, because G1 renders anything else
 * invisible; listing an unpublished one and showing its empty state would confirm it exists.
 *
 * **The percentages are UI copy.** `06` section 5.1 stores a rate as a decimal in a field ending in
 * `Rate`; a percentage is rendered here and nowhere else, so the API keeps one representation.
 */
export default async function CourseAssignmentsPage(props: {
  readonly params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await props.params;
  const session = await requireStudentPage(`/student/courses/${courseId}`);
  const assignments = await loadCourseAssignments(session, courseId);

  // The enrolled course's own label, read from the session's memberships rather than re-queried: the
  // session already resolved them, and a second read could disagree with the guard that just ran.
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
          <EmptyState message="No assignments are published for this course yet. They will appear here once your tutor publishes them." />
        ) : (
          <ul className="flex flex-col gap-4">
            {assignments.items.map((assignment) => {
              const completed = assignment.checklistCompleted ?? 0;
              const total = assignment.checklistTotal ?? 0;
              const rate = total === 0 ? null : completed / total;
              return (
                <li key={assignment.id}>
                  <Link
                    className="block rounded-card border border-solid border-default bg-card p-4 shadow-card"
                    href={`/student/assignments/${assignment.id}`}
                  >
                    <span className="mb-1 block heading-3 text-ink">{assignment.title}</span>
                    {assignment.dueAt === null ? null : (
                      <span className="block tight text-muted">
                        Due {assignment.dueAt.slice(0, 10)}
                      </span>
                    )}
                    <span className="mt-2 block tight text-ink">
                      {completed} of {total} Checklist items complete
                      {rate === null ? null : ` - ${String(Math.round(rate * 100))}%`}
                    </span>
                    {assignment.openQueryCount === null || assignment.openQueryCount === 0 ? null : (
                      <span className="mt-1 block tight text-muted">
                        {assignment.openQueryCount} open private{' '}
                        {assignment.openQueryCount === 1 ? 'question' : 'questions'}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
