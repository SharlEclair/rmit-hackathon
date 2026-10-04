/**
 * Gate rule G1: the student-visibility predicate (`06` section 3.4; trap **T3**; D99).
 *
 * **Why this module exists as its own file.** T3 is the trap where an implementation resolves the
 * gate in the *view*: it filters a list and shows an empty shell for an assignment the student may
 * not see. `06` section 3.4 is explicit -- "A student request for an assignment whose `status <>
 * 'published'` returns `NOT_FOUND` (404), never an empty shell" -- and an empty list is
 * indistinguishable from "this assignment has no content yet". A gate in the query layer is also the
 * only version a test can hold: T-17's assertion lands on the query, not on a component.
 *
 * **The predicate, complete.** `06` section 3.4:
 *
 * ```text
 * artifact.publication_status = 'PUBLISHED'
 * AND artifact.structure.is_current = true          (for structure-scoped artifacts)
 * AND assignments.status = 'published'
 * ```
 *
 * **How the shape of this API enforces the gate.** Every list function takes a `VisibleScope`, and a
 * `VisibleScope` can only be produced by `findVisibleAssignmentScope`. There is deliberately no
 * `listVisibleMilestones(assignmentId)`: a caller that could list by assignment id could list before
 * checking the gate, and the empty-shell bug would come back. The route's only correct sequence is
 *
 * ```text
 * const scope = await findVisibleAssignmentScope(tx, assignmentId);   // null -> 404
 * if (scope === null) return notFound();
 * const milestones = await listVisibleMilestones(tx, scope);
 * ```
 *
 * **APPROVED is not visible.** `06` section 3.1 lists `APPROVED` as student-invisible and D21 makes
 * only `APPROVED -> PUBLISHED` student-visible. Handoff issue I-21 left a gate text that treated
 * `APPROVED` as the threshold; D99 settles it in favour of `PUBLISHED`, and `isStudentVisible()` in
 * `src/features/review/transitions.ts` is the one place the rule is stated for the UI.
 *
 * **Identity and content.** Nothing here reads an identity column and nothing returns `storage_key`
 * or extracted text: these are the reads a student is allowed to make about their own assignment's
 * approved structure (C5's sibling rule for content, `06` section 6.9 rule 2).
 */

import type { Executor } from './courses';
import { isoTimestamp } from '@/lib/db/values';

/** A resolved gate: the assignment is published and this is its current structure. */
export interface VisibleScope {
  readonly assignmentId: string;
  readonly structureId: string;
  /**
   * The assignment's course, so a route can check enrolment without a second read.
   *
   * Enrolment is authorisation, not visibility: G1 decides whether the assignment is *published*, and
   * `06` section 5.2 rule 2 decides whether this caller may see this course at all. A route needs both,
   * and both answer `NOT_FOUND`.
   */
  readonly courseId: string;
}

/**
 * The gate itself. Returns `null` for every reason an assignment is not student-visible, so a caller
 * has exactly one branch and cannot distinguish "not published" from "no current structure" -- which
 * is the point: both are `NOT_FOUND` to the student (`06` section 5.2 rule 5's spirit).
 *
 * The join is an inner join on `is_current = true`, so an assignment with no current structure (an
 * ingestion that never completed) is `null` rather than an empty scope.
 */
export async function findVisibleAssignmentScope(
  ex: Executor,
  assignmentId: string,
): Promise<VisibleScope | null> {
  const rows = await ex<{ assignment_id: string; structure_id: string; course_id: string }[]>`
    select a.id as assignment_id, s.id as structure_id, a.course_id
      from assignments a
      join assignment_structures s
        on s.assignment_id = a.id and s.is_current = true
     where a.id = ${assignmentId}::uuid
       and a.status = 'published'
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : { assignmentId: row.assignment_id, structureId: row.structure_id, courseId: row.course_id };
}

/** A published requirement node, with only the fields the student surfaces render. */
export interface VisibleRequirement {
  readonly id: string;
  readonly title: string;
  /** T1, verbatim, quoted in the student's UI (`06` section 2.2). */
  readonly verbatimText: string;
  readonly mapSummary: string | null;
  readonly sourceChunkId: string;
  readonly sourcePage: number | null;
  readonly sourceSectionLabel: string | null;
  readonly displayOrder: number;
  /** The Map node's `sourceRef` (`06` section 5.5.5): the source row and the chunk's page range. */
  readonly sourceId: string;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
}

export interface VisibleRubricSection {
  readonly id: string;
  readonly sectionLabel: string;
  readonly criteriaText: string;
  readonly weightPercent: number | null;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly mapInterpretation: string | null;
  readonly displayOrder: number;
  readonly sourceChunkId: string;
  readonly sourceId: string;
}

export interface VisibleMilestone {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly displayOrder: number;
}

export interface VisibleChecklistItem {
  readonly id: string;
  readonly milestoneId: string;
  readonly title: string;
  readonly planningLevel: string;
  readonly description: string | null;
  readonly displayOrder: number;
}

export interface VisibleFaqEntry {
  readonly id: string;
  readonly milestoneId: string | null;
  readonly question: string;
  readonly answer: string;
  readonly displayOrder: number;
  /**
   * When the entry became PUBLISHED, so the student surface can render the T2 marker
   * `Published by your tutor on <date>` (`07` section 2.2). It is read rather than derived because
   * the marker is a claim about a fact, and a date recomputed at render time would be a different
   * fact. `null` only if a PUBLISHED row somehow carries no stamp.
   */
  readonly publishedAt: string | null;
}

export interface VisiblePolicyRule {
  readonly id: string;
  readonly ruleCode: string;
  readonly ruleText: string;
  readonly effect: string;
  readonly appliesTo: string;
  readonly displayOrder: number;
}

export async function listVisibleRequirements(
  ex: Executor,
  scope: VisibleScope,
): Promise<VisibleRequirement[]> {
  const rows = await ex<
    {
      id: string;
      title: string;
      verbatim_text: string;
      map_summary: string | null;
      source_chunk_id: string;
      source_page: number | null;
      source_section_label: string | null;
      display_order: number;
      source_id: string;
      page_from: number | null;
      page_to: number | null;
    }[]
  >`
    select r.id, r.title, r.verbatim_text, r.map_summary, r.source_chunk_id, r.source_page,
           r.source_section_label, r.display_order,
           c.source_id, c.page_from, c.page_to
      from requirement_nodes r
      join source_chunks c on c.id = r.source_chunk_id
     where r.assignment_id = ${scope.assignmentId}::uuid
       and r.structure_id = ${scope.structureId}::uuid
       and r.publication_status = 'PUBLISHED'
     order by r.display_order asc
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    verbatimText: row.verbatim_text,
    mapSummary: row.map_summary,
    sourceChunkId: row.source_chunk_id,
    sourcePage: row.source_page,
    sourceSectionLabel: row.source_section_label,
    displayOrder: row.display_order,
    sourceId: row.source_id,
    pageFrom: row.page_from,
    pageTo: row.page_to,
  }));
}

export async function listVisibleRubricSections(
  ex: Executor,
  scope: VisibleScope,
): Promise<VisibleRubricSection[]> {
  const rows = await ex<
    {
      id: string;
      section_label: string;
      criteria_text: string;
      weight_percent: string | null;
      page_from: number | null;
      page_to: number | null;
      map_interpretation: string | null;
      display_order: number;
      source_chunk_id: string;
      source_id: string;
    }[]
  >`
    select s.id, s.section_label, s.criteria_text, s.weight_percent, s.page_from, s.page_to,
           s.map_interpretation, s.display_order, s.source_chunk_id, c.source_id
      from rubric_sections s
      join source_chunks c on c.id = s.source_chunk_id
     where s.assignment_id = ${scope.assignmentId}::uuid
       and s.structure_id = ${scope.structureId}::uuid
       and s.publication_status = 'PUBLISHED'
     order by s.display_order asc
  `;
  return rows.map((row) => ({
    id: row.id,
    sectionLabel: row.section_label,
    criteriaText: row.criteria_text,
    weightPercent: row.weight_percent === null ? null : Number(row.weight_percent),
    pageFrom: row.page_from,
    pageTo: row.page_to,
    mapInterpretation: row.map_interpretation,
    displayOrder: row.display_order,
    sourceChunkId: row.source_chunk_id,
    sourceId: row.source_id,
  }));
}

export async function listVisibleMilestones(
  ex: Executor,
  scope: VisibleScope,
): Promise<VisibleMilestone[]> {
  const rows = await ex<
    { id: string; title: string; summary: string | null; display_order: number }[]
  >`
    select id, title, summary, display_order
      from milestones
     where assignment_id = ${scope.assignmentId}::uuid
       and structure_id = ${scope.structureId}::uuid
       and publication_status = 'PUBLISHED'
       and deleted_at is null
     order by display_order asc
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    displayOrder: row.display_order,
  }));
}

export async function listVisibleChecklistItems(
  ex: Executor,
  scope: VisibleScope,
): Promise<VisibleChecklistItem[]> {
  const rows = await ex<
    {
      id: string;
      milestone_id: string;
      title: string;
      planning_level: string;
      description: string | null;
      display_order: number;
    }[]
  >`
    select id, milestone_id, title, planning_level, description, display_order
      from checklist_items
     where assignment_id = ${scope.assignmentId}::uuid
       and structure_id = ${scope.structureId}::uuid
       and publication_status = 'PUBLISHED'
       and deleted_at is null
     order by milestone_id asc, display_order asc
  `;
  return rows.map((row) => ({
    id: row.id,
    milestoneId: row.milestone_id,
    title: row.title,
    planningLevel: row.planning_level,
    description: row.description,
    displayOrder: row.display_order,
  }));
}

/**
 * Published FAQ entries (T2).
 *
 * `faq_entries` has no `structure_id`, so the gate here is the two conditions the table can express:
 * the assignment is published (checked by the caller holding a `VisibleScope`) and the entry is
 * `PUBLISHED`. Transition 8 is what makes this read the proof of T-18: a published entry that a tutor
 * edits becomes `EDITED` and disappears from this list immediately.
 */
export async function listVisibleFaqEntries(
  ex: Executor,
  scope: VisibleScope,
): Promise<VisibleFaqEntry[]> {
  const rows = await ex<
    {
      id: string;
      milestone_id: string | null;
      question: string;
      answer: string;
      display_order: number;
      published_at: Date | string | null;
    }[]
  >`
    select id, milestone_id, question, answer, display_order, published_at
      from faq_entries
     where assignment_id = ${scope.assignmentId}::uuid
       and publication_status = 'PUBLISHED'
       and deleted_at is null
     order by display_order asc, created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    milestoneId: row.milestone_id,
    question: row.question,
    answer: row.answer,
    displayOrder: row.display_order,
    publishedAt: isoTimestamp(row.published_at),
  }));
}

/**
 * Published FAQ entries for one assignment, **without requiring a `VisibleScope`**.
 *
 * **Why this exists beside `listVisibleFaqEntries`, and why it is safe.** A tutor's read of their own
 * course's FAQ is authorised by their enrolment, which `guardTutorAssignment` has already resolved --
 * gate rule G1 is about what a **student** may see before approval, so it is not the gate a tutor read
 * needs. Requiring a `VisibleScope` here would force the tutor route to fabricate one, and a fabricated
 * scope is exactly the kind of argument a later reader trusts and reuses on a student path (the failure
 * `01-STATE.md` section 5 item 4 warns about).
 *
 * The safety comes from the call site, and it is worth stating: the **only** callers are tutor routes
 * that have already run `guardTutorAssignment`. No student route may call this, and
 * `tests/discussion/imports.test.ts` records the distinction. The published-only condition is the same
 * as the gated reader's, so the projection cannot leak an unpublished entry either way.
 */
export async function listPublishedFaqEntries(
  ex: Executor,
  assignmentId: string,
): Promise<VisibleFaqEntry[]> {
  const rows = await ex<
    {
      id: string;
      milestone_id: string | null;
      question: string;
      answer: string;
      display_order: number;
      published_at: Date | string | null;
    }[]
  >`
    select id, milestone_id, question, answer, display_order, published_at
      from faq_entries
     where assignment_id = ${assignmentId}::uuid
       and publication_status = 'PUBLISHED'
       and deleted_at is null
     order by display_order asc, created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    milestoneId: row.milestone_id,
    question: row.question,
    answer: row.answer,
    displayOrder: row.display_order,
    publishedAt: isoTimestamp(row.published_at),
  }));
}

/**
 * The published AI Usage Policy (T2).
 *
 * `06` section 7.2.11: the guardrail reads only `PUBLISHED` rules, and with none published the
 * Assistant is unavailable (D47) -- `AiPolicyResponse.available` is `false` rather than a permissive
 * default. Phase 5 owns the route; Phase 4 owns the gate it must be read through.
 */
export async function listVisiblePolicyRules(
  ex: Executor,
  scope: VisibleScope,
): Promise<VisiblePolicyRule[]> {
  const rows = await ex<
    {
      id: string;
      rule_code: string;
      rule_text: string;
      effect: string;
      applies_to: string;
      display_order: number;
    }[]
  >`
    select id, rule_code, rule_text, effect, applies_to, display_order
      from ai_policy_rules
     where assignment_id = ${scope.assignmentId}::uuid
       and structure_id = ${scope.structureId}::uuid
       and publication_status = 'PUBLISHED'
     order by display_order asc
  `;
  return rows.map((row) => ({
    id: row.id,
    ruleCode: row.rule_code,
    ruleText: row.rule_text,
    effect: row.effect,
    appliesTo: row.applies_to,
    displayOrder: row.display_order,
  }));
}
