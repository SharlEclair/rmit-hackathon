import { EmptyState } from '@/components/ui/empty-state';
import { loadWorkspace, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The My Queries tab (`07` UI-UX-SPEC section 4.4).
 *
 * **This tab is present and states its empty case, and that is the deliberate Phase 5 boundary.** `07`
 * section 4.1 rule 3 is unconditional: "A tab with nothing published yet is still present and shows its
 * empty state. Tabs are never hidden, because a missing tab reads as a missing feature." So the route
 * exists from this phase even though the private-Query thread itself is `11` WP-10 (Phase 6, `06`
 * section 5.5.12).
 *
 * **It is not a stub that will be thrown away.** The page already resolves the session and the gate
 * through the same loader the other tabs use, so when Phase 6 adds the list and the composer it adds
 * them here rather than re-creating the route, and the tab's count already comes from the real
 * `queries` read in the workspace bundle.
 *
 * `07` section 4.4's empty copy is used verbatim, including its second line: the distinction it draws
 * -- private questions for your own situation, Discussions for what the cohort could learn from -- is
 * the product decision D24 depends on, not decoration.
 */
export default async function QueriesTabPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireStudentPage(`/student/assignments/${assignmentId}/queries`);
  // The gate still runs, deliberately: a tab that skipped it would make an unpublished assignment
  // reachable by URL, which is the empty-shell bug T3 forbids.
  await loadWorkspace(session, assignmentId);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading-2 text-ink">My Queries</h2>
      <EmptyState
        message={
          <>
            Your private questions to your tutor will appear here. Good for questions about your own
            situation. For questions the whole cohort could learn from, use Discussions.
          </>
        }
      />
    </section>
  );
}
