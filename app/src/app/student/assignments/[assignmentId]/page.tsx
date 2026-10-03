import { AssignmentMapPanel } from '@/components/assignment-map-panel';
import { DocumentViewer } from '@/components/document-viewer';
import { PolicyCard } from '@/components/policy-card';
import {
  loadBrief,
  loadWorkspace,
  requireStudentPage,
} from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The Assignment/Info tab (`07` UI-UX-SPEC sections 4.1, 4.2, 4.2.1 and 4.3).
 *
 * **The layout order is a constraint, not a preference** (section 4.2): "official documents (viewer),
 * then the Assignment Map (4.3), then the published AI Usage Policy card (4.2.1). The Map never appears
 * above the viewer, and the viewer is never inside a collapsible that a student could miss." The
 * three components are therefore rendered in that order and each is always open.
 *
 * The `workspace.brief.sources` list is used for the document tabs' labels; the viewer's own content
 * comes from `loadBrief`, which is the manifest **plus the stored verbatim extraction** (**D107**).
 */
export default async function AssignmentTabPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireStudentPage(`/student/assignments/${assignmentId}`);
  const { workspace, scope } = await loadWorkspace(session, assignmentId);
  const brief = await loadBrief(scope);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="heading-2 text-ink">Original assignment documents</h2>
        <DocumentViewer brief={brief} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="heading-2 text-ink">Assignment Map</h2>
        {workspace.structure === null ? (
          // `07` section 4.3's empty state, verbatim: a sentence plus the standing reminder that the
          // brief above is authoritative. Not hidden, and not a blank region (`07` section 2.1).
          <p className="rounded-card border border-solid border-default bg-card p-4 body text-ink">
            The Assignment Map will appear here once your tutor publishes it. The original brief above
            is always the authoritative source.
          </p>
        ) : (
          <AssignmentMapPanel structure={workspace.structure} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="heading-2 text-ink">AI usage policy</h2>
        {/*
          Section 4.2.1 rule 1: "The card is present only when at least one policy rule is PUBLISHED.
          Before that the card is absent and the Assistant is in the unavailable state." The card
          component renders that state itself, so the absence is a stated condition rather than a
          missing element.
        */}
        <PolicyCard policy={workspace.policy} />
      </section>
    </div>
  );
}
