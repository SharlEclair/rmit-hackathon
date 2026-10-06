import { loadTutorCourses, requireTutorPage } from '@/features/review/server-data';
import { NewAssignmentForm } from './new-assignment-form';

export const dynamic = 'force-dynamic';

export default async function NewAssignmentPage() {
  const session = await requireTutorPage('/tutor/assignments/new');
  const courses = await loadTutorCourses(session);

  return (
    <main className="min-h-screen bg-bg px-4 py-8 md:px-8">
      <NewAssignmentForm courses={courses.items} />
    </main>
  );
}
