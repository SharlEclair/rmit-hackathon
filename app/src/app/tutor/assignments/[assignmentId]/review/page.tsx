import { ReviewPanel } from '@/components/review-panel';
import { loadReviewBundle, requireTutorPage } from '@/features/review/server-data';

export const dynamic = 'force-dynamic';

/**
 * The tutor review screen (`07` UI-UX-SPEC section 7.3; `11` WP-06).
 *
 * This is the page Phase 4 deliberately did not build. Its own status note names the reason: every
 * Tailwind colour key resolved to an undefined custom property, and the design-system gates that would
 * have caught it did not exist (**I-44**). Both are now false, so the screen can be built against
 * values that exist.
 *
 * **The gate is the tutor enrolment, and it answers `404`.** `loadReviewBundle` resolves the assignment,
 * checks the tutor enrolment on its course and only then reads the bundle, so a tutor on another course
 * cannot reach this page by URL -- the same order `guardTutorAssignment` applies to the routes, and the
 * same `NOT_FOUND` (`06` section 5.2 rule 2). The API route remains the contract for the writes; the
 * page reads the query layer directly, for the reason `features/workspace/server-data.ts` records.
 *
 * `07` section 7.3's screen states -- loading, empty, error -- belong to the client panel, because the
 * mutations that can fail are there.
 */
export default async function ReviewAssignmentPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireTutorPage(`/tutor/assignments/${assignmentId}/review`);
  const bundle = await loadReviewBundle(session, assignmentId);

  return (
    <main className="min-h-screen bg-page px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <ReviewPanel bundle={bundle} />
      </div>
    </main>
  );
}
