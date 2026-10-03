import { EmptyState } from '@/components/ui/empty-state';
import { loadWorkspace, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The Discussions tab (`07` UI-UX-SPEC section 4.5).
 *
 * The same deliberate Phase 5 boundary as `../queries/page.tsx`: section 4.1 rule 3 forbids hiding a
 * tab, so the route exists and states its empty case, while the anonymous thread itself is `11` WP-10
 * (Phase 6, `06` section 5.5.13).
 *
 * **The Official FAQ section is rendered separately and first**, because section 4.5's wireframe puts it
 * above the student discussion and it is a different authority class: T2 published answers versus T4
 * peer prose. The count of published entries is a real read from the workspace bundle, so the section
 * is present and accurate even before Phase 6 adds the entries themselves.
 */
export default async function DiscussionsTabPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireStudentPage(`/student/assignments/${assignmentId}/discussions`);
  const { workspace } = await loadWorkspace(session, assignmentId);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="heading-2 text-ink">Official FAQ</h2>
        {workspace.officialFaqCount === 0 ? (
          <EmptyState message="No official FAQ entries yet." />
        ) : (
          <p className="rounded-card border border-solid border-default bg-card p-4 body text-ink">
            {workspace.officialFaqCount} official{' '}
            {workspace.officialFaqCount === 1 ? 'answer has' : 'answers have'} been published by your
            tutor.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="heading-2 text-ink">Student discussion</h2>
        <EmptyState message="No discussion threads yet. Ask the first question." />
      </section>
    </div>
  );
}
