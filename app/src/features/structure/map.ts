/**
 * The Assignment Map (`06` section 5.5.5; D18, C2).
 *
 * **What the Map is and is not.** It is a navigation layer built from the assignment's *approved
 * structure*, labelled `AI-generated interpretation` and carrying the fixed disclaimer, and it never
 * presents itself as the requirement (D18, `07` sections 2.2, 2.5). The verbatim T1 text it quotes is
 * carried on the node as a quoted block with its source page, so the reader can see where the
 * interpretation stops and the brief starts.
 *
 * **The edges are gated on both endpoints.** `06` section 5.5.5: "an edge is returned only when both
 * endpoint nodes are `PUBLISHED`". The nodes come from
 * `src/lib/db/queries/student-visibility.ts`, which applies gate rule G1, so an edge can only be
 * emitted between two nodes that are already in the returned set -- the filter is structural rather
 * than a second predicate that could be forgotten.
 *
 * **Where this module sits.** Phase 4 ships one student route (`.../structure`) because WP-06's gate
 * asserts the G1 direction through it. Phase 5 (WP-07) owns the rest of the workspace and may move
 * this builder into `src/features/map/`; it is deliberately not placed there now, because `11`
 * section 6.2 gives that directory to another track.
 */

import type {
  AssignmentMapEdgeResponse,
  AssignmentMapNodeResponse,
  AssignmentMapResponse,
} from '@/lib/api/types';
import type { Executor } from '@/lib/db/queries/courses';
import { isoTimestampRequired } from '@/lib/db/values';
import {
  listVisibleChecklistItems,
  listVisibleMilestones,
  listVisibleRequirements,
  listVisibleRubricSections,
  type VisibleScope,
} from '@/lib/db/queries/student-visibility';

/** `07` section 2.5's fixed strings, verbatim. */
export const MAP_LABEL = 'AI-generated interpretation' as const;
export const MAP_DISCLAIMER = 'Refer to the original brief for exact requirements.';

export async function buildAssignmentMap(
  ex: Executor,
  scope: VisibleScope,
): Promise<AssignmentMapResponse> {
  const requirements = await listVisibleRequirements(ex, scope);
  const rubrics = await listVisibleRubricSections(ex, scope);
  const milestones = await listVisibleMilestones(ex, scope);
  const items = await listVisibleChecklistItems(ex, scope);

  const nodes: AssignmentMapNodeResponse[] = [
    ...requirements.map((requirement) => ({
      id: requirement.id,
      kind: 'requirement' as const,
      title: requirement.title,
      mapSummary: requirement.mapSummary,
      verbatimText: requirement.verbatimText,
      // A requirement node's authority is the passage it quotes, so the node is T1; the Map summary
      // inside it is T5 and the UI labels it per field (`06` section 2.2).
      truthTier: 'T1' as const,
      sourceRef: {
        sourceId: requirement.sourceId,
        pageFrom: requirement.pageFrom ?? requirement.sourcePage ?? 0,
        pageTo: requirement.pageTo ?? requirement.sourcePage ?? 0,
        sectionLabel: requirement.sourceSectionLabel,
      },
    })),
    ...rubrics.map((rubric) => ({
      id: rubric.id,
      kind: 'rubric_section' as const,
      title: rubric.sectionLabel,
      mapSummary: rubric.mapInterpretation,
      verbatimText: rubric.criteriaText,
      truthTier: 'T1' as const,
      sourceRef: {
        sourceId: rubric.sourceId,
        pageFrom: rubric.pageFrom ?? 0,
        pageTo: rubric.pageTo ?? 0,
        sectionLabel: rubric.sectionLabel,
      },
    })),
    ...milestones.map((milestone) => ({
      id: milestone.id,
      kind: 'milestone' as const,
      title: milestone.title,
      mapSummary: milestone.summary,
      verbatimText: null,
      truthTier: 'T3' as const,
      sourceRef: null,
    })),
    ...items.map((item) => ({
      id: item.id,
      kind: 'checklist_item' as const,
      title: item.title,
      mapSummary: item.description,
      verbatimText: null,
      truthTier: 'T3' as const,
      sourceRef: null,
    })),
  ];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: AssignmentMapEdgeResponse[] = [];

  const requirementRubric = await ex<{ requirement_node_id: string; rubric_section_id: string }[]>`
    select requirement_node_id, rubric_section_id
      from requirement_rubric_links
     where assignment_id = ${scope.assignmentId}::uuid
  `;
  for (const edge of requirementRubric) {
    push(edges, nodeIds, edge.requirement_node_id, edge.rubric_section_id, 'requirement_rubric');
  }

  const requirementMilestone = await ex<
    { requirement_node_id: string; milestone_id: string }[]
  >`
    select requirement_node_id, milestone_id
      from milestone_requirement_links
     where assignment_id = ${scope.assignmentId}::uuid
  `;
  for (const edge of requirementMilestone) {
    push(edges, nodeIds, edge.requirement_node_id, edge.milestone_id, 'requirement_milestone');
  }

  for (const item of items) {
    // `milestone_checklist_item` is implicit in the column rather than a link table (`06` section
    // 7.2.10: `checklist_items.milestone_id`).
    push(edges, nodeIds, item.milestoneId, item.id, 'milestone_checklist_item');
  }

  // Derived through a shared requirement node, by the view `06` section 7.7 defines for it.
  const rubricMilestone = await ex<{ rubric_section_id: string; milestone_id: string }[]>`
    select rubric_section_id, milestone_id
      from v_rubric_milestone_edges
     where assignment_id = ${scope.assignmentId}::uuid
  `;
  for (const edge of rubricMilestone) {
    push(edges, nodeIds, edge.rubric_section_id, edge.milestone_id, 'rubric_milestone');
  }

  const generated = await ex<{ created_at: Date | string }[]>`
    select created_at from assignment_structures where id = ${scope.structureId}::uuid
  `;

  return {
    assignmentId: scope.assignmentId,
    structureId: scope.structureId,
    generatedAt: isoTimestampRequired(generated[0]?.created_at ?? new Date()),
    label: MAP_LABEL,
    disclaimer: MAP_DISCLAIMER,
    nodes,
    edges,
  };
}

/** Emit an edge only when both endpoints survived the gate (`06` section 5.5.5). */
function push(
  edges: AssignmentMapEdgeResponse[],
  nodeIds: ReadonlySet<string>,
  from: string,
  to: string,
  kind: AssignmentMapEdgeResponse['kind'],
): void {
  if (!nodeIds.has(from) || !nodeIds.has(to)) return;
  edges.push({ from, to, kind });
}
