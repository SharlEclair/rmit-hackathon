/**
 * Assignment structure and its artifacts: `assignment_structures`, `requirement_nodes`,
 * `rubric_sections`, `requirement_rubric_links`, `milestone_requirement_links`, `milestones`,
 * `checklist_items`, `ai_policy_rules`, `ambiguity_findings`
 * (`06` sections 7.2.4-7.2.12; migration `0004_structure.sql`).
 *
 * Three contract points this module must not soften:
 *
 * 1. **Provenance trio** (`06` section 6.11). A row with `origin = 'ai'` is rejected by the
 *    database unless `provenance` carries `modelId`, `promptVersion` and `generatedAt`, so the
 *    writer always supplies all three plus `groundingChunkIds`. The indexed
 *    `grounding_chunk_ids` column is the queryable copy of the same list.
 * 2. **The approval stamp is implied by the status** (`ck_*_approval`, `ck_*_approved_at`,
 *    `ck_*_published_at`). `APPROVED` and `PUBLISHED` both need `approved_by_user_id`;
 *    `PUBLISHED` also needs `published_at`.
 * 3. **`ambiguity_findings` has no `proposed_clarification` column and never will** (D23, C2).
 *    The table detects and locates; the tutor authors the clarification as a `faq_entries` row
 *    and links it. This module cannot write a clarification even by mistake, because the column
 *    does not exist.
 */

import type { Executor } from './courses';

/** `06` section 3.1: the six lifecycle values, `text` + a named CHECK and never a Postgres enum. */
export type PublicationStatus =
  | 'AI_GENERATED'
  | 'NEEDS_REVIEW'
  | 'EDITED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED';

export type Origin = 'ai' | 'tutor';

/** `checklist_items.planning_level` (`06` section 7.2.10). */
export type PlanningLevel = 'understand' | 'identify' | 'plan' | 'verify' | 'review' | 'note';

/** `ai_policy_rules.effect` (`06` section 7.2.11). */
export type AiPolicyEffect = 'PROHIBIT' | 'ALLOW' | 'ESCALATE_TO_TUTOR' | 'CLARIFY';

/** `ai_policy_rules.applies_to` (`06` section 7.2.11). */
export type AiPolicyAppliesTo = 'assistant' | 'uploads' | 'discussion' | 'all';

export type AmbiguityKind = 'ambiguity' | 'contradiction';
export type AmbiguitySeverity = 'low' | 'medium' | 'high';
export type AmbiguityStatus = 'open' | 'acknowledged' | 'resolved_by_clarification' | 'dismissed';

/** The provenance payload of `06` section 6.11. */
export interface Provenance {
  readonly modelId: string;
  readonly promptVersion: string;
  readonly generatedAt: string;
  readonly groundingChunkIds: readonly string[];
}

/** The three stamp columns every lifecycle-bearing artifact carries. */
export interface PublicationStamp {
  readonly publicationStatus: PublicationStatus;
  readonly approvedByUserId: string | null;
  readonly approvedAt: string | null;
  readonly publishedAt: string | null;
}

interface ProvenancedRow {
  readonly id: string;
  readonly assignmentId: string;
  readonly structureId: string;
  readonly origin: Origin;
  readonly provenance: Provenance | null;
  readonly groundingChunkIds: readonly string[];
  readonly stamp: PublicationStamp;
}

export interface NewAssignmentStructure {
  readonly id: string;
  readonly assignmentId: string;
  readonly version: number;
  readonly isCurrent: boolean;
  readonly origin: Origin;
  readonly provenance: Provenance | null;
  readonly groundingChunkIds: readonly string[];
  readonly stamp: PublicationStamp;
}

export interface NewRequirementNode extends ProvenancedRow {
  readonly parentRequirementNodeId: string | null;
  readonly title: string;
  readonly verbatimText: string;
  readonly sourceChunkId: string;
  readonly sourcePage: number | null;
  readonly sourceSectionLabel: string | null;
  readonly mapSummary: string | null;
  readonly displayOrder: number;
}

export interface NewRubricSection extends ProvenancedRow {
  readonly sourceChunkId: string;
  readonly sectionLabel: string;
  readonly criteriaText: string;
  readonly weightPercent: number | null;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly mapInterpretation: string | null;
  readonly displayOrder: number;
}

export interface NewMilestone extends ProvenancedRow {
  readonly title: string;
  readonly summary: string | null;
  readonly displayOrder: number;
}

export interface NewChecklistItem extends ProvenancedRow {
  readonly milestoneId: string;
  readonly title: string;
  readonly planningLevel: PlanningLevel;
  readonly description: string | null;
  readonly displayOrder: number;
}

export interface NewAiPolicyRule extends ProvenancedRow {
  readonly ruleCode: string;
  readonly ruleText: string;
  readonly effect: AiPolicyEffect;
  readonly appliesTo: AiPolicyAppliesTo;
  readonly sourceChunkId: string | null;
  readonly displayOrder: number;
}

export interface NewAmbiguityFinding {
  readonly id: string;
  readonly assignmentId: string;
  readonly structureId: string;
  readonly sourceId: string | null;
  readonly kind: AmbiguityKind;
  readonly severity: AmbiguitySeverity;
  readonly title: string;
  readonly description: string;
  readonly locatedPage: number | null;
  readonly locatedSectionLabel: string | null;
  readonly excerptA: string;
  /** Required by `ck_ambiguity_findings_excerpt_b_required` when `kind = 'contradiction'`. */
  readonly excerptB: string | null;
  readonly sourceChunkIds: readonly string[];
  readonly status: AmbiguityStatus;
  readonly origin: 'ai';
  readonly provenance: Provenance;
}

export interface NewRequirementRubricLink {
  readonly id: string;
  readonly assignmentId: string;
  readonly requirementNodeId: string;
  readonly rubricSectionId: string;
  /** `null` means AI-proposed (`06` section 7.2.7). */
  readonly createdByUserId: string | null;
}

export interface NewMilestoneRequirementLink {
  readonly id: string;
  readonly assignmentId: string;
  readonly requirementNodeId: string;
  readonly milestoneId: string;
  /** `null` means AI-proposed (`06` section 7.2.8). */
  readonly createdByUserId: string | null;
}

/** JSON for a jsonb column. `JSON.stringify` keeps the driver out of the serialisation path. */
function json(value: unknown): string {
  return JSON.stringify(value);
}

function provenanceJson(origin: Origin, provenance: Provenance | null): string | null {
  return origin === 'ai' && provenance !== null ? json(provenance) : null;
}

export async function insertStructureIfAbsent(
  ex: Executor,
  structure: NewAssignmentStructure,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into assignment_structures (
      id, assignment_id, version, is_current, publication_status, origin, provenance,
      grounding_chunk_ids, approved_by_user_id, approved_at, published_at
    )
    values (
      ${structure.id}::uuid,
      ${structure.assignmentId}::uuid,
      ${structure.version},
      ${structure.isCurrent},
      ${structure.stamp.publicationStatus},
      ${structure.origin},
      ${provenanceJson(structure.origin, structure.provenance)}::jsonb,
      ${structure.groundingChunkIds}::uuid[],
      ${structure.stamp.approvedByUserId}::uuid,
      ${structure.stamp.approvedAt}::timestamptz,
      ${structure.stamp.publishedAt}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertRequirementNodeIfAbsent(
  ex: Executor,
  node: NewRequirementNode,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into requirement_nodes (
      id, assignment_id, structure_id, parent_requirement_node_id, title, verbatim_text,
      source_chunk_id, source_page, source_section_label, map_summary, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at
    )
    values (
      ${node.id}::uuid,
      ${node.assignmentId}::uuid,
      ${node.structureId}::uuid,
      ${node.parentRequirementNodeId}::uuid,
      ${node.title},
      ${node.verbatimText},
      ${node.sourceChunkId}::uuid,
      ${node.sourcePage},
      ${node.sourceSectionLabel},
      ${node.mapSummary},
      ${node.displayOrder},
      ${node.stamp.publicationStatus},
      ${node.origin},
      ${provenanceJson(node.origin, node.provenance)}::jsonb,
      ${node.groundingChunkIds}::uuid[],
      ${node.stamp.approvedByUserId}::uuid,
      ${node.stamp.approvedAt}::timestamptz,
      ${node.stamp.publishedAt}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertRubricSectionIfAbsent(
  ex: Executor,
  section: NewRubricSection,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into rubric_sections (
      id, assignment_id, structure_id, source_chunk_id, section_label, criteria_text,
      weight_percent, page_from, page_to, map_interpretation, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at
    )
    values (
      ${section.id}::uuid,
      ${section.assignmentId}::uuid,
      ${section.structureId}::uuid,
      ${section.sourceChunkId}::uuid,
      ${section.sectionLabel},
      ${section.criteriaText},
      ${section.weightPercent},
      ${section.pageFrom},
      ${section.pageTo},
      ${section.mapInterpretation},
      ${section.displayOrder},
      ${section.stamp.publicationStatus},
      ${section.origin},
      ${provenanceJson(section.origin, section.provenance)}::jsonb,
      ${section.groundingChunkIds}::uuid[],
      ${section.stamp.approvedByUserId}::uuid,
      ${section.stamp.approvedAt}::timestamptz,
      ${section.stamp.publishedAt}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertMilestoneIfAbsent(
  ex: Executor,
  milestone: NewMilestone,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into milestones (
      id, assignment_id, structure_id, title, summary, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at
    )
    values (
      ${milestone.id}::uuid,
      ${milestone.assignmentId}::uuid,
      ${milestone.structureId}::uuid,
      ${milestone.title},
      ${milestone.summary},
      ${milestone.displayOrder},
      ${milestone.stamp.publicationStatus},
      ${milestone.origin},
      ${provenanceJson(milestone.origin, milestone.provenance)}::jsonb,
      ${milestone.groundingChunkIds}::uuid[],
      ${milestone.stamp.approvedByUserId}::uuid,
      ${milestone.stamp.approvedAt}::timestamptz,
      ${milestone.stamp.publishedAt}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertChecklistItemIfAbsent(
  ex: Executor,
  item: NewChecklistItem,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into checklist_items (
      id, assignment_id, structure_id, milestone_id, title, planning_level, description,
      display_order, publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at
    )
    values (
      ${item.id}::uuid,
      ${item.assignmentId}::uuid,
      ${item.structureId}::uuid,
      ${item.milestoneId}::uuid,
      ${item.title},
      ${item.planningLevel},
      ${item.description},
      ${item.displayOrder},
      ${item.stamp.publicationStatus},
      ${item.origin},
      ${provenanceJson(item.origin, item.provenance)}::jsonb,
      ${item.groundingChunkIds}::uuid[],
      ${item.stamp.approvedByUserId}::uuid,
      ${item.stamp.approvedAt}::timestamptz,
      ${item.stamp.publishedAt}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertAiPolicyRuleIfAbsent(
  ex: Executor,
  rule: NewAiPolicyRule,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into ai_policy_rules (
      id, assignment_id, structure_id, rule_code, rule_text, effect, applies_to,
      source_chunk_id, display_order, publication_status, origin, provenance,
      grounding_chunk_ids, approved_by_user_id, approved_at, published_at
    )
    values (
      ${rule.id}::uuid,
      ${rule.assignmentId}::uuid,
      ${rule.structureId}::uuid,
      ${rule.ruleCode},
      ${rule.ruleText},
      ${rule.effect},
      ${rule.appliesTo},
      ${rule.sourceChunkId}::uuid,
      ${rule.displayOrder},
      ${rule.stamp.publicationStatus},
      ${rule.origin},
      ${provenanceJson(rule.origin, rule.provenance)}::jsonb,
      ${rule.groundingChunkIds}::uuid[],
      ${rule.stamp.approvedByUserId}::uuid,
      ${rule.stamp.approvedAt}::timestamptz,
      ${rule.stamp.publishedAt}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

/**
 * Insert one ambiguity finding.
 *
 * `source_chunk_ids` is `not null` with `array_length(..., 1) >= 1` (`ck_ambiguity_findings_source_chunks`),
 * so a finding always cites the chunk it was found in. There is no proposed clarification: the
 * column does not exist (D23, C2).
 */
export async function insertAmbiguityFindingIfAbsent(
  ex: Executor,
  finding: NewAmbiguityFinding,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into ambiguity_findings (
      id, assignment_id, structure_id, source_id, kind, severity, title, description,
      located_page, located_section_label, excerpt_a, excerpt_b, source_chunk_ids,
      status, origin, provenance
    )
    values (
      ${finding.id}::uuid,
      ${finding.assignmentId}::uuid,
      ${finding.structureId}::uuid,
      ${finding.sourceId}::uuid,
      ${finding.kind},
      ${finding.severity},
      ${finding.title},
      ${finding.description},
      ${finding.locatedPage},
      ${finding.locatedSectionLabel},
      ${finding.excerptA},
      ${finding.excerptB},
      ${finding.sourceChunkIds}::uuid[],
      ${finding.status},
      ${finding.origin},
      ${json(finding.provenance)}::jsonb
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertRequirementRubricLinkIfAbsent(
  ex: Executor,
  link: NewRequirementRubricLink,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into requirement_rubric_links (
      id, assignment_id, requirement_node_id, rubric_section_id, created_by_user_id
    )
    values (
      ${link.id}::uuid,
      ${link.assignmentId}::uuid,
      ${link.requirementNodeId}::uuid,
      ${link.rubricSectionId}::uuid,
      ${link.createdByUserId}::uuid
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function insertMilestoneRequirementLinkIfAbsent(
  ex: Executor,
  link: NewMilestoneRequirementLink,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into milestone_requirement_links (
      id, assignment_id, requirement_node_id, milestone_id, created_by_user_id
    )
    values (
      ${link.id}::uuid,
      ${link.assignmentId}::uuid,
      ${link.requirementNodeId}::uuid,
      ${link.milestoneId}::uuid,
      ${link.createdByUserId}::uuid
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Phase 2 (WP-05): the reads and the one transition the ingestion pipeline owns.
// ---------------------------------------------------------------------------------------------

/** The AI Usage Policy rules a prompt may rely on: approved or published, in display order. */
export async function listApprovedPolicyRules(
  ex: Executor,
  assignmentId: string,
): Promise<Array<{ id: string; ruleCode: string; ruleText: string }>> {
  const rows = await ex<{ id: string; rule_code: string; rule_text: string }[]>`
    select id, rule_code, rule_text
      from ai_policy_rules
     where assignment_id = ${assignmentId}::uuid
       and publication_status in ('APPROVED','PUBLISHED')
     order by display_order asc
  `;
  return rows.map((row) => ({ id: row.id, ruleCode: row.rule_code, ruleText: row.rule_text }));
}

/** The milestone titles a prompt may rely on: approved or published, in display order. */
export async function listApprovedMilestones(
  ex: Executor,
  assignmentId: string,
): Promise<Array<{ id: string; title: string }>> {
  const rows = await ex<{ id: string; title: string }[]>`
    select id, title
      from milestones
     where assignment_id = ${assignmentId}::uuid
       and publication_status in ('APPROVED','PUBLISHED')
       and deleted_at is null
     order by display_order asc
  `;
  return rows.map((row) => ({ id: row.id, title: row.title }));
}

export interface NeedsReviewPromotion {
  readonly structureId: string;
  /** The FAQ candidates this run inserted. `faq_entries` has no `structure_id`, so they are named. */
  readonly faqEntryIds: readonly string[];
}

/**
 * Transition 1 of `06` section 3.2: `AI_GENERATED -> NEEDS_REVIEW`.
 *
 * `04` section 7 stage S8 states it as a two-step: "Status starts at `AI_GENERATED` and immediately
 * moves to `NEEDS_REVIEW`". The insert writes the first state and this writes the second, in the same
 * transaction as the inserts, so a crash cannot leave artifacts in a state the review screen does not
 * list.
 *
 * Only rows still in `AI_GENERATED` are moved, so a re-run cannot drag an artifact a tutor has
 * already edited or approved back into the review queue.
 */
export async function promoteStructureToNeedsReview(
  ex: Executor,
  input: NeedsReviewPromotion,
): Promise<void> {
  const { structureId } = input;
  await ex`
    update assignment_structures set publication_status = 'NEEDS_REVIEW'
     where id = ${structureId}::uuid and publication_status = 'AI_GENERATED'
  `;
  // Written out one table at a time rather than composed from a loop: a table name cannot be a bound
  // parameter, and building the statement by string interpolation is how an identifier ends up
  // injectable. Five literal statements are boring and reviewable.
  await ex`
    update requirement_nodes set publication_status = 'NEEDS_REVIEW'
     where structure_id = ${structureId}::uuid and publication_status = 'AI_GENERATED'
  `;
  await ex`
    update rubric_sections set publication_status = 'NEEDS_REVIEW'
     where structure_id = ${structureId}::uuid and publication_status = 'AI_GENERATED'
  `;
  await ex`
    update milestones set publication_status = 'NEEDS_REVIEW'
     where structure_id = ${structureId}::uuid and publication_status = 'AI_GENERATED'
  `;
  await ex`
    update checklist_items set publication_status = 'NEEDS_REVIEW'
     where structure_id = ${structureId}::uuid and publication_status = 'AI_GENERATED'
  `;
  await ex`
    update ai_policy_rules set publication_status = 'NEEDS_REVIEW'
     where structure_id = ${structureId}::uuid and publication_status = 'AI_GENERATED'
  `;
  if (input.faqEntryIds.length > 0) {
    await ex`
      update faq_entries set publication_status = 'NEEDS_REVIEW'
       where id = any(${input.faqEntryIds}::uuid[]) and publication_status = 'AI_GENERATED'
    `;
  }
}
