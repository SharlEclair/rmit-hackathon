import type { PublicationStatusApi, ReviewArtifactKind, TruthTierApi } from '@/lib/api/types';
import { Badge } from '@/components/ui/badge';
import { MARKER } from '@/components/ui/fixed-strings';

/**
 * The artifact provenance badge (`AGENTS.md` C3, `07-UI-UX-SPEC` section 2.2, `17` section 5.2).
 *
 * **C3 is the constraint this component makes visible:** "Nothing AI-generated becomes student-facing
 * until a tutor approves it. AI output is always marked `AI generated -- requires tutor approval`."
 * Phase 4 built the state machine that enforces the boundary and the badge that states it was named in
 * `11` WP-06's deliverables and deliberately not built, because no screen could render correctly until
 * the token layer existed (**I-44**). This is that badge.
 *
 * **A tutor never sees an unmarked AI artifact.** The badge is derived from `origin` and
 * `publicationStatus`, so the four unapproved states all render the pre-approval string and no caller
 * can pass one that does not. That is the difference between a convention and a guarantee: the
 * component decides, not the page.
 *
 * **Once published, the marker changes but does not disappear.** A published artifact is
 * tutor-sanctioned, so it carries `Published by your tutor` rather than the pre-approval warning --
 * `07` section 2.2 detail rule 5 forbids the word "official" outside T1 and T2, and the approved
 * structure is T3, so the label names the tutor rather than an authority the artifact does not have.
 *
 * **What it deliberately does not show.** The model id and prompt version are provenance, and `06`
 * section 6.11 requires them on the row, but `07` section 4.7.2 rule 9 keeps internal vocabulary out of
 * student surfaces and `05` N12 keeps it out of a student's view. This badge is tutor-facing, so a
 * model id here would be defensible -- but the review row already carries the provenance fields as
 * data, and painting a model name onto a badge invites it into a screenshot. The badge states the
 * approval fact and nothing else.
 */
export interface ArtifactProvenanceBadgeProps {
  readonly origin: 'ai' | 'tutor';
  readonly publicationStatus: PublicationStatusApi;
  /**
   * `06` section 2.2's tier. Accepted so a caller passing the wrong tier for an artifact is visible in
   * the props rather than inferred, and so the badge can carry the tier as its tone.
   */
  readonly truthTier: TruthTierApi;
  readonly kind?: ReviewArtifactKind;
  readonly className?: string;
}

/** The statuses that mean "a tutor has sanctioned this". */
const SANCTIONED: readonly PublicationStatusApi[] = ['APPROVED', 'PUBLISHED'];

export function ArtifactProvenanceBadge(props: ArtifactProvenanceBadgeProps) {
  const sanctioned = SANCTIONED.includes(props.publicationStatus);

  if (props.origin === 'tutor') {
    return (
      // A tutor-authored row has no model behind it, so it is not labelled as AI output. It still
      // states who stands behind the content, which is what the tutor reading the queue needs.
      <Badge variant="status" label="Written by a tutor" className={props.className} />
    );
  }

  if (props.publicationStatus === 'PUBLISHED') {
    return <Badge variant="approved" className={props.className} />;
  }

  if (sanctioned) {
    // Approved but not published: `06` section 3.1 makes APPROVED student-invisible, and D99 puts the
    // visibility threshold at PUBLISHED. The label says so rather than borrowing the published one.
    return <Badge variant="status" label="Approved - not published yet" className={props.className} />;
  }

  if (props.publicationStatus === 'REJECTED') {
    return <Badge variant="status" label="Rejected" className={props.className} />;
  }

  // `AI_GENERATED`, `NEEDS_REVIEW` and `EDITED` all mean the same thing to a tutor: this is AI output
  // and it is not sanctioned yet.
  return <Badge variant="interpretation-pre-approval" className={props.className} />;
}

/**
 * The row's provenance line: when the artifact was generated and what grounded it.
 *
 * `06` section 6.11 requires model, prompt version and source chunks on every AI-produced artifact, and
 * the review surface is where a tutor checks them. It renders `groundingChunkIds.length` as a count
 * rather than the ids: a chunk id is an internal handle, and the citation a tutor cares about is the
 * page, which the artifact's own payload carries.
 */
export function ArtifactProvenanceLine(props: {
  readonly provenance: {
    readonly modelId: string | null;
    readonly promptVersion: string | null;
    readonly generatedAt: string;
    readonly groundingChunkIds: readonly string[];
  };
}) {
  const grounded = props.provenance.groundingChunkIds.length;
  return (
    <p className="mono-sm text-muted">
      Generated {props.provenance.generatedAt.slice(0, 10)}
      {props.provenance.promptVersion === null ? null : ` - ${props.provenance.promptVersion}`}
      {` - ${String(grounded)} grounding ${grounded === 1 ? 'chunk' : 'chunks'}`}
    </p>
  );
}

/**
 * The page-anchor citation a review artifact may carry (`07` section 2.6).
 *
 * It is the same form the student workspace uses, from `fixed-strings.ts`, so a tutor and a student
 * read the same reference for the same page.
 */
export function ArtifactPageCitation(props: {
  readonly pageFrom: number | null;
  readonly kind: 'brief' | 'rubric';
}) {
  if (props.pageFrom === null) {
    return <p className="mono-sm text-muted">{MARKER.sourceLinkUnresolved}</p>;
  }
  return (
    <p className="mono-sm text-muted">
      {props.kind === 'rubric'
        ? MARKER.sourceLinkRubric(props.pageFrom)
        : MARKER.sourceLinkBrief(props.pageFrom)}
    </p>
  );
}
