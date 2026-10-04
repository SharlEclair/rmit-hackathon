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
    /*
      **`gap-12` (48px), not `gap-6`.** `17` section 4.1 rule 3: "48px between the three major regions of
      the Assignment/Info tab (official documents, Assignment Map, published AI Usage Policy), in the
      order `07` section 4.2 fixes." The three regions previously sat 24px apart, which is the
      inside-a-panel step rather than the between-regions one, so the tab read as one dense stack
      instead of the argument it is meant to be -- document, then interpretation of it, then the rules
      for using AI on it.
    */
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-3">
        <h2 className="heading-2 text-ink">Original assignment documents</h2>
        <DocumentViewer brief={brief} />
      </section>

      {/*
        **The T5 containment inset, `17` section 4.3 rule 2.** The Map "begins below it, inset by 16px on
        both sides at `lg`, so its dashed left edge sits inside the T1 frame's solid left edge. The
        visual message is containment: interpretation is subordinate, and the inset makes it structural
        rather than stated." Rule 4 removes the inset at `sm`, where the width is not there to spend.
        Rule 3 is why the inset is never reversed: a T5 panel is never wider than, or above, a T1 panel,
        and the order is fixed here rather than by a prop.
      */}
      <section className="flex flex-col gap-3 lg:px-4">
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
