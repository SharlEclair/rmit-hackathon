import { notFound } from 'next/navigation';

import { requireTutorPage } from '@/features/review/server-data';
import { withTransaction } from '@/lib/db/transaction';
import { findAssignmentScope } from '@/lib/db/queries/assignments';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import { buildTutorQueryGroups } from '@/features/queries/service';
import { buildTutorDiscussion } from '@/features/discussion/service';
import { viewerFor } from '@/features/discussion/routes';
import { buildAssignmentHealth } from '@/features/analytics/service';

import { TutorAssignmentHub } from './tutor-assignment-hub';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentHubPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireTutorPage(`/tutor/assignments/${assignmentId}`);

  const scope = await withTransaction((tx) => findAssignmentScope(tx, assignmentId));
  if (scope === null) notFound();

  const role = await withTransaction((tx) =>
    findEnrolmentRole(tx, session.userId, scope.courseId),
  );
  if (role !== 'tutor') notFound();

  const course = session.courses.find((c) => c.id === scope.courseId);

  // Pre-load data for the three tabs
  const viewer = viewerFor({ session, scope: { assignmentId } }, 'tutor');

  const [queries, discussion, health] = await withTransaction(async (tx) => {
    const q = await buildTutorQueryGroups(tx, assignmentId);
    const d = viewer
      ? await buildTutorDiscussion(tx, { assignmentId }, viewer)
      : { officialFaq: [], threads: [], moderationQueue: [] };
    const h = await buildAssignmentHealth(tx, { assignmentId, now: new Date() });
    return [q, d, h] as const;
  });

  return (
    <main className="min-h-screen bg-bg px-4 py-8 md:px-8">
      <TutorAssignmentHub
        assignmentId={assignmentId}
        assignmentTitle={scope.title}
        assignmentStatus={scope.status}
        courseCode={course?.code}
        initialQueries={queries}
        initialDiscussion={discussion}
        initialHealth={health}
      />
    </main>
  );
}
