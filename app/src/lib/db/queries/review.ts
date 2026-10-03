/**
 * The tutor review surface's reads and writes (`06` sections 5.4, 5.5.8, 3.2; migration `0012`).
 *
 * This module owns the seven artifact tables and the two assignment-level transitions (`approve`,
 * `publish`). It is deliberately *not* where the state machine lives: `resolveTransition` in
 * `src/features/review/transitions.ts` decides whether a transition is legal and which stamp columns
 * it touches, and every write here takes that decision as input. A route that wrote a status without
 * asking the state machine would be the defect this split exists to prevent.
 *
 * **The optimistic-concurrency guard is in the SQL, not around it.** Every write carries
 * `where id = $id and revision = $expected` and `set revision = revision + 1` in the **same**
 * statement, so two concurrent PATCHes with the same `expectedRevision` cannot both succeed: the
 * second updates zero rows and the caller reports `STALE_REVISION` (409). A read-then-check-then-write
 * in application code would pass its own test and lose an update under concurrency (test T-19).
 *
 * **Read-modify-write, with the guard as the race closer.** A PATCH sends a *partial* payload, and a
 * partial payload cannot express "clear this nullable field" through a `coalesce`. The route therefore
 * merges the payload onto the row it read and writes the **full** set of editable columns. The window
 * between the read and the write is exactly what the revision guard closes, which is why the two
 * decisions belong together.
 *
 * **The stamp updates use `case when <flag>`, never composed SQL.** `effects.setApproval` and its
 * three siblings arrive as bound booleans, and the identifier list is a literal in each statement.
 * Trap T19 and `promoteStructureToNeedsReview`'s own comment in `structure.ts` record why a table or
 * column name is never interpolated: it is the one place a name could become injectable, and seven
 * literal statements are boring and reviewable.
 *
 * **No write here changes `origin` or `provenance`.** D22 requires the AI provenance to survive every
 * transition, including a tutor edit; the schema enforces the pair with `ck_provenance_shape`.
 */

import type {
  AiPolicyRulePayload,
  ChecklistItemPayload,
  FaqEntryPayload,
  MilestonePayload,
  RequirementNodePayload,
  ReviewArtifactKind,
  RubricSectionPayload,
} from '@/lib/api/types';
import type { StampEffect } from '@/features/review/transitions';
import type { Executor } from './courses';
import type { Origin, Provenance, PublicationStatus } from './structure';

/** The seven artifact kinds in the order the review screen groups them (`07` section 7.3). */
export const REVIEW_ARTIFACT_KINDS: readonly ReviewArtifactKind[] = [
  'structure',
  'requirement_node',
  'rubric_section',
  'milestone',
  'checklist_item',
  'faq_entry',
  'ai_policy_rule',
];

/**
 * One artifact as the review API needs it.
 *
 * `citedChunkText` is carried rather than re-read per check because the read-time validation is a
 * substring test against it (`06` section 5.5.8, I-2) and a second query per artifact would make the
 * bundle O(2n) for no benefit.
 */
export interface ReviewArtifactRow {
  readonly id: string;
  readonly kind: ReviewArtifactKind;
  readonly assignmentId: string;
  readonly structureId: string | null;
  readonly publicationStatus: PublicationStatus;
  readonly origin: Origin;
  readonly provenance: Provenance | null;
  readonly groundingChunkIds: readonly string[];
  readonly revision: number;
  readonly createdAt: string;
  /** The editable and displayable columns of the kind, in camelCase. */
  readonly payload: Record<string, unknown>;
  readonly citedChunkId: string | null;
  readonly citedChunkText: string | null;
  /** The verbatim quote of every requirement node in the structure, for the overlap warning. */
  readonly siblingQuotes: readonly string[];
}

interface RawArtifact {
  id: string;
  assignment_id: string;
  structure_id: string | null;
  publication_status: string;
  origin: string;
  provenance: Provenance | null;
  grounding_chunk_ids: string[];
  revision: number;
  created_at: Date;
  cited_chunk_id: string | null;
  cited_chunk_text: string | null;
}

function toRow(
  kind: ReviewArtifactKind,
  raw: RawArtifact,
  payload: Record<string, unknown>,
  siblingQuotes: readonly string[] = [],
): ReviewArtifactRow {
  return {
    id: raw.id,
    kind,
    assignmentId: raw.assignment_id,
    structureId: raw.structure_id,
    publicationStatus: raw.publication_status as PublicationStatus,
    origin: raw.origin as Origin,
    provenance: raw.provenance,
    groundingChunkIds: raw.grounding_chunk_ids,
    revision: raw.revision,
    createdAt: raw.created_at.toISOString(),
    payload,
    citedChunkId: raw.cited_chunk_id,
    citedChunkText: raw.cited_chunk_text,
    siblingQuotes,
  };
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

/** The assignment header `06` section 5.5.8's `ReviewBundleResponse.assignment` carries. */
export interface AssignmentHeader {
  readonly id: string;
  readonly title: string;
  readonly status: 'draft' | 'ingesting' | 'in_review' | 'published' | 'archived';
  readonly dueAt: string | null;
  readonly currentStructureId: string | null;
}

/**
 * Read the assignment header, or `null` when it does not exist.
 *
 * Separate from `findAssignmentScope` (Phase 2's, which returns the course and the creator for the
 * enrolment check) because the bundle needs `due_at`, which that function deliberately does not
 * select -- and adding a field to a frozen Phase 2 signature to serve one screen would be the wrong
 * trade. Both read the same row.
 */
export async function readAssignmentHeader(
  ex: Executor,
  assignmentId: string,
): Promise<AssignmentHeader | null> {
  const rows = await ex<
    {
      id: string;
      title: string;
      status: string;
      due_at: Date | null;
      current_structure_id: string | null;
    }[]
  >`
    select id, title, status, due_at, current_structure_id
      from assignments
     where id = ${assignmentId}::uuid
     limit 1
  `;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    title: row.title,
    status: row.status as AssignmentHeader['status'],
    dueAt: row.due_at === null ? null : row.due_at.toISOString(),
    currentStructureId: row.current_structure_id,
  };
}

/** The current structure of an assignment, if it has one. */
export async function findCurrentStructureId(
  ex: Executor,
  assignmentId: string,
): Promise<string | null> {
  const rows = await ex<{ id: string }[]>`
    select id from assignment_structures
     where assignment_id = ${assignmentId}::uuid and is_current = true
     limit 1
  `;
  return rows[0]?.id ?? null;
}

/**
 * Every artifact of the assignment's current structure, plus its FAQ entries.
 *
 * `faq_entries` has no `structure_id` (`06` section 7.4.4), so its rows are scoped by assignment --
 * which is also why a re-ingest does not silently orphan them.
 */
export async function listReviewArtifacts(
  ex: Executor,
  assignmentId: string,
  structureId: string | null,
): Promise<ReviewArtifactRow[]> {
  if (structureId === null) {
    // No structure means no ingestion has produced anything; FAQ candidates cannot exist either,
    // because the only writer of an AI-generated FAQ entry is the ingestion pipeline.
    return [];
  }

  const siblings = await ex<{ verbatim_text: string }[]>`
    select verbatim_text from requirement_nodes
     where structure_id = ${structureId}::uuid
  `;
  const siblingQuotes = siblings.map((row) => row.verbatim_text);

  const structures = await ex<(RawArtifact & { version: number; is_current: boolean })[]>`
    select s.id, s.assignment_id, s.id as structure_id, s.publication_status, s.origin,
           s.provenance, s.grounding_chunk_ids, s.revision, s.created_at,
           null::uuid as cited_chunk_id, null::text as cited_chunk_text, s.version, s.is_current
      from assignment_structures s
     where s.id = ${structureId}::uuid
  `;

  const requirements = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select r.id, r.assignment_id, r.structure_id, r.publication_status, r.origin, r.provenance,
           r.grounding_chunk_ids, r.revision, r.created_at,
           r.source_chunk_id as cited_chunk_id, c.text as cited_chunk_text,
           r.title, r.verbatim_text, r.map_summary, r.source_page, r.source_section_label,
           r.display_order
      from requirement_nodes r
      left join source_chunks c on c.id = r.source_chunk_id
     where r.structure_id = ${structureId}::uuid
     order by r.display_order asc
  `;

  const rubrics = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select r.id, r.assignment_id, r.structure_id, r.publication_status, r.origin, r.provenance,
           r.grounding_chunk_ids, r.revision, r.created_at,
           r.source_chunk_id as cited_chunk_id, c.text as cited_chunk_text,
           r.section_label, r.criteria_text, r.weight_percent, r.page_from, r.page_to,
           r.map_interpretation, r.display_order
      from rubric_sections r
      left join source_chunks c on c.id = r.source_chunk_id
     where r.structure_id = ${structureId}::uuid
     order by r.display_order asc
  `;

  const milestones = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select m.id, m.assignment_id, m.structure_id, m.publication_status, m.origin, m.provenance,
           m.grounding_chunk_ids, m.revision, m.created_at,
           null::uuid as cited_chunk_id, null::text as cited_chunk_text,
           m.title, m.summary, m.display_order
      from milestones m
     where m.structure_id = ${structureId}::uuid and m.deleted_at is null
     order by m.display_order asc
  `;

  const checklist = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select i.id, i.assignment_id, i.structure_id, i.publication_status, i.origin, i.provenance,
           i.grounding_chunk_ids, i.revision, i.created_at,
           null::uuid as cited_chunk_id, null::text as cited_chunk_text,
           i.milestone_id, i.title, i.planning_level, i.description, i.display_order
      from checklist_items i
     where i.structure_id = ${structureId}::uuid and i.deleted_at is null
     order by i.milestone_id asc, i.display_order asc
  `;

  const policy = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select p.id, p.assignment_id, p.structure_id, p.publication_status, p.origin, p.provenance,
           p.grounding_chunk_ids, p.revision, p.created_at,
           p.source_chunk_id as cited_chunk_id, c.text as cited_chunk_text,
           p.rule_code, p.rule_text, p.effect, p.applies_to, p.display_order
      from ai_policy_rules p
      left join source_chunks c on c.id = p.source_chunk_id
     where p.structure_id = ${structureId}::uuid
     order by p.display_order asc
  `;

  const faq = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select f.id, f.assignment_id, null::uuid as structure_id, f.publication_status, f.origin,
           f.provenance, f.grounding_chunk_ids, f.revision, f.created_at,
           null::uuid as cited_chunk_id, null::text as cited_chunk_text,
           f.milestone_id, f.question, f.answer, f.display_order
      from faq_entries f
     where f.assignment_id = ${assignmentId}::uuid and f.deleted_at is null
     order by f.display_order asc, f.created_at asc
  `;

  const rows: ReviewArtifactRow[] = [];

  for (const row of structures) {
    rows.push(
      toRow('structure', row, {
        version: row.version,
        isCurrent: row.is_current,
        displayOrder: 0,
      } as unknown as Record<string, unknown>),
    );
  }
  for (const row of requirements) {
    rows.push(
      toRow('requirement_node', row, {
        title: row.title,
        verbatimText: row.verbatim_text,
        mapSummary: row.map_summary,
        sourceChunkId: row.cited_chunk_id,
        sourcePage: row.source_page,
        sourceSectionLabel: row.source_section_label,
        displayOrder: row.display_order,
      }),
    );
  }
  for (const row of rubrics) {
    rows.push(
      toRow('rubric_section', row, {
        sectionLabel: row.section_label,
        criteriaText: row.criteria_text,
        weightPercent: row.weight_percent === null ? null : Number(row.weight_percent),
        pageFrom: row.page_from,
        pageTo: row.page_to,
        mapInterpretation: row.map_interpretation,
        displayOrder: row.display_order,
      }),
    );
  }
  for (const row of milestones) {
    rows.push(
      toRow('milestone', row, {
        title: row.title,
        summary: row.summary,
        displayOrder: row.display_order,
      }),
    );
  }
  for (const row of checklist) {
    rows.push(
      toRow('checklist_item', row, {
        title: row.title,
        planningLevel: row.planning_level,
        description: row.description,
        milestoneId: row.milestone_id,
        displayOrder: row.display_order,
      }),
    );
  }
  for (const row of policy) {
    rows.push(
      toRow('ai_policy_rule', row, {
        ruleCode: row.rule_code,
        ruleText: row.rule_text,
        effect: row.effect,
        appliesTo: row.applies_to,
        displayOrder: row.display_order,
      }),
    );
  }
  for (const row of faq) {
    rows.push(
      toRow('faq_entry', row, {
        question: row.question,
        answer: row.answer,
        milestoneId: row.milestone_id,
        displayOrder: row.display_order,
      }),
    );
  }

  return rows.map((row) => ({ ...row, siblingQuotes }));
}

/** Publication-status counts for the review header (`06` section 5.5.8's `counts`). */
export async function readPublicationCounts(
  ex: Executor,
  assignmentId: string,
  structureId: string | null,
): Promise<Record<PublicationStatus, number>> {
  const counts: Record<PublicationStatus, number> = {
    AI_GENERATED: 0,
    NEEDS_REVIEW: 0,
    EDITED: 0,
    APPROVED: 0,
    PUBLISHED: 0,
    REJECTED: 0,
  };
  if (structureId === null) return counts;

  const rows = await ex<{ publication_status: string; count: string }[]>`
    select publication_status, count(*)::text as count
      from (
        select publication_status from assignment_structures where id = ${structureId}::uuid
        union all
        select publication_status from requirement_nodes where structure_id = ${structureId}::uuid
        union all
        select publication_status from rubric_sections where structure_id = ${structureId}::uuid
        union all
        select publication_status from milestones
                  where structure_id = ${structureId}::uuid and deleted_at is null
        union all
        select publication_status from checklist_items
                  where structure_id = ${structureId}::uuid and deleted_at is null
        union all
        select publication_status from ai_policy_rules where structure_id = ${structureId}::uuid
        union all
        select publication_status from faq_entries
                  where assignment_id = ${assignmentId}::uuid and deleted_at is null
      ) artifacts
     group by publication_status
  `;
  for (const row of rows) {
    const status = row.publication_status as PublicationStatus;
    if (status in counts) counts[status] = Number(row.count);
  }
  return counts;
}

/** The SQL half of the publish gate. The policy half is `computeGates` in the feature layer. */
export interface GateInputs {
  readonly sourceCount: number;
  readonly activeJobCount: number;
  readonly milestoneCount: number;
  readonly milestonesWithoutRequirement: number;
  readonly approvedPolicyRuleCount: number;
  readonly approvedArtifactCount: number;
}

export async function readGateInputs(
  ex: Executor,
  assignmentId: string,
  structureId: string | null,
): Promise<GateInputs> {
  const sources = await ex<{ count: string }[]>`
    select count(*)::text as count from assignment_sources
     where assignment_id = ${assignmentId}::uuid and deleted_at is null
  `;
  const jobs = await ex<{ count: string }[]>`
    select count(*)::text as count from ingestion_jobs
     where assignment_id = ${assignmentId}::uuid and status in ('queued','running')
  `;

  if (structureId === null) {
    return {
      sourceCount: Number(sources[0]?.count ?? '0'),
      activeJobCount: Number(jobs[0]?.count ?? '0'),
      milestoneCount: 0,
      milestonesWithoutRequirement: 0,
      approvedPolicyRuleCount: 0,
      approvedArtifactCount: 0,
    };
  }

  const milestones = await ex<{ total: string; unlinked: string }[]>`
    select count(*)::text as total,
           count(*) filter (
             where not exists (
               select 1 from milestone_requirement_links l where l.milestone_id = m.id
             )
           )::text as unlinked
      from milestones m
     where m.structure_id = ${structureId}::uuid
       and m.deleted_at is null
       and m.publication_status <> 'REJECTED'
  `;
  const policy = await ex<{ count: string }[]>`
    select count(*)::text as count from ai_policy_rules
     where structure_id = ${structureId}::uuid
       and publication_status in ('APPROVED','PUBLISHED')
  `;
  const approved = await ex<{ count: string }[]>`
    select count(*)::text as count
      from (
        select publication_status from requirement_nodes where structure_id = ${structureId}::uuid
        union all
        select publication_status from rubric_sections where structure_id = ${structureId}::uuid
        union all
        select publication_status from milestones
                  where structure_id = ${structureId}::uuid and deleted_at is null
        union all
        select publication_status from checklist_items
                  where structure_id = ${structureId}::uuid and deleted_at is null
        union all
        select publication_status from ai_policy_rules where structure_id = ${structureId}::uuid
        union all
        select publication_status from faq_entries
                  where assignment_id = ${assignmentId}::uuid and deleted_at is null
      ) artifacts
     where publication_status in ('APPROVED','PUBLISHED')
  `;

  return {
    sourceCount: Number(sources[0]?.count ?? '0'),
    activeJobCount: Number(jobs[0]?.count ?? '0'),
    milestoneCount: Number(milestones[0]?.total ?? '0'),
    milestonesWithoutRequirement: Number(milestones[0]?.unlinked ?? '0'),
    approvedPolicyRuleCount: Number(policy[0]?.count ?? '0'),
    approvedArtifactCount: Number(approved[0]?.count ?? '0'),
  };
}

/**
 * One artifact by id, searched across the seven tables.
 *
 * Seven statements rather than one `union`: the payload columns differ per kind, and a union would
 * have to project every kind's columns onto one row shape -- which is exactly how a payload arrives
 * with the wrong fields in it.
 */
export async function findReviewArtifact(
  ex: Executor,
  artifactId: string,
): Promise<ReviewArtifactRow | null> {
  const structures = await ex<(RawArtifact & { version: number; is_current: boolean })[]>`
    select s.id, s.assignment_id, s.id as structure_id, s.publication_status, s.origin,
           s.provenance, s.grounding_chunk_ids, s.revision, s.created_at,
           null::uuid as cited_chunk_id, null::text as cited_chunk_text, s.version, s.is_current
      from assignment_structures s
     where s.id = ${artifactId}::uuid
  `;
  const first = structures[0];
  if (first !== undefined) {
    return toRow('structure', first, {
      version: first.version,
      isCurrent: first.is_current,
      displayOrder: 0,
    } as unknown as Record<string, unknown>);
  }

  const requirements = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select r.id, r.assignment_id, r.structure_id, r.publication_status, r.origin, r.provenance,
           r.grounding_chunk_ids, r.revision, r.created_at,
           r.source_chunk_id as cited_chunk_id, c.text as cited_chunk_text,
           r.title, r.verbatim_text, r.map_summary, r.source_page, r.source_section_label,
           r.display_order
      from requirement_nodes r
      left join source_chunks c on c.id = r.source_chunk_id
     where r.id = ${artifactId}::uuid
  `;
  const requirement = requirements[0];
  if (requirement !== undefined) {
    return toRow('requirement_node', requirement, {
      title: requirement.title,
      verbatimText: requirement.verbatim_text,
      mapSummary: requirement.map_summary,
      sourceChunkId: requirement.cited_chunk_id,
      sourcePage: requirement.source_page,
      sourceSectionLabel: requirement.source_section_label,
      displayOrder: requirement.display_order,
    });
  }

  const rubrics = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select r.id, r.assignment_id, r.structure_id, r.publication_status, r.origin, r.provenance,
           r.grounding_chunk_ids, r.revision, r.created_at,
           r.source_chunk_id as cited_chunk_id, c.text as cited_chunk_text,
           r.section_label, r.criteria_text, r.weight_percent, r.page_from, r.page_to,
           r.map_interpretation, r.display_order
      from rubric_sections r
      left join source_chunks c on c.id = r.source_chunk_id
     where r.id = ${artifactId}::uuid
  `;
  const rubric = rubrics[0];
  if (rubric !== undefined) {
    return toRow('rubric_section', rubric, {
      sectionLabel: rubric.section_label,
      criteriaText: rubric.criteria_text,
      weightPercent: rubric.weight_percent === null ? null : Number(rubric.weight_percent),
      pageFrom: rubric.page_from,
      pageTo: rubric.page_to,
      mapInterpretation: rubric.map_interpretation,
      displayOrder: rubric.display_order,
    });
  }

  const milestones = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select m.id, m.assignment_id, m.structure_id, m.publication_status, m.origin, m.provenance,
           m.grounding_chunk_ids, m.revision, m.created_at,
           null::uuid as cited_chunk_id, null::text as cited_chunk_text,
           m.title, m.summary, m.display_order
      from milestones m
     where m.id = ${artifactId}::uuid and m.deleted_at is null
  `;
  const milestone = milestones[0];
  if (milestone !== undefined) {
    return toRow('milestone', milestone, {
      title: milestone.title,
      summary: milestone.summary,
      displayOrder: milestone.display_order,
    });
  }

  const items = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select i.id, i.assignment_id, i.structure_id, i.publication_status, i.origin, i.provenance,
           i.grounding_chunk_ids, i.revision, i.created_at,
           null::uuid as cited_chunk_id, null::text as cited_chunk_text,
           i.milestone_id, i.title, i.planning_level, i.description, i.display_order
      from checklist_items i
     where i.id = ${artifactId}::uuid and i.deleted_at is null
  `;
  const item = items[0];
  if (item !== undefined) {
    return toRow('checklist_item', item, {
      title: item.title,
      planningLevel: item.planning_level,
      description: item.description,
      milestoneId: item.milestone_id,
      displayOrder: item.display_order,
    });
  }

  const rules = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select p.id, p.assignment_id, p.structure_id, p.publication_status, p.origin, p.provenance,
           p.grounding_chunk_ids, p.revision, p.created_at,
           p.source_chunk_id as cited_chunk_id, c.text as cited_chunk_text,
           p.rule_code, p.rule_text, p.effect, p.applies_to, p.display_order
      from ai_policy_rules p
      left join source_chunks c on c.id = p.source_chunk_id
     where p.id = ${artifactId}::uuid
  `;
  const rule = rules[0];
  if (rule !== undefined) {
    return toRow('ai_policy_rule', rule, {
      ruleCode: rule.rule_code,
      ruleText: rule.rule_text,
      effect: rule.effect,
      appliesTo: rule.applies_to,
      displayOrder: rule.display_order,
    });
  }

  const entries = await ex<(RawArtifact & Record<string, unknown>)[]>`
    select f.id, f.assignment_id, null::uuid as structure_id, f.publication_status, f.origin,
           f.provenance, f.grounding_chunk_ids, f.revision, f.created_at,
           null::uuid as cited_chunk_id, null::text as cited_chunk_text,
           f.milestone_id, f.question, f.answer, f.display_order
      from faq_entries f
     where f.id = ${artifactId}::uuid and f.deleted_at is null
  `;
  const entry = entries[0];
  if (entry !== undefined) {
    return toRow('faq_entry', entry, {
      question: entry.question,
      answer: entry.answer,
      milestoneId: entry.milestone_id,
      displayOrder: entry.display_order,
    });
  }

  return null;
}

/** The ambiguity findings panel (`06` section 7.2.12). Tutor-facing only; never student-visible. */
export interface AmbiguityFindingRow {
  readonly id: string;
  readonly kind: 'ambiguity' | 'contradiction';
  readonly severity: 'low' | 'medium' | 'high';
  readonly title: string;
  readonly description: string;
  readonly locatedPage: number | null;
  readonly locatedSectionLabel: string | null;
  readonly excerptA: string;
  readonly excerptB: string | null;
  readonly status: 'open' | 'acknowledged' | 'resolved_by_clarification' | 'dismissed';
  readonly resolutionFaqEntryId: string | null;
}

export async function listAmbiguityFindings(
  ex: Executor,
  assignmentId: string,
): Promise<AmbiguityFindingRow[]> {
  const rows = await ex<
    {
      id: string;
      kind: string;
      severity: string;
      title: string;
      description: string;
      located_page: number | null;
      located_section_label: string | null;
      excerpt_a: string;
      excerpt_b: string | null;
      status: string;
      resolution_faq_entry_id: string | null;
    }[]
  >`
    select id, kind, severity, title, description, located_page, located_section_label,
           excerpt_a, excerpt_b, status, resolution_faq_entry_id
      from ambiguity_findings
     where assignment_id = ${assignmentId}::uuid
     order by case severity when 'high' then 0 when 'medium' then 1 else 2 end asc, created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as AmbiguityFindingRow['kind'],
    severity: row.severity as AmbiguityFindingRow['severity'],
    title: row.title,
    description: row.description,
    locatedPage: row.located_page,
    locatedSectionLabel: row.located_section_label,
    excerptA: row.excerpt_a,
    excerptB: row.excerpt_b,
    status: row.status as AmbiguityFindingRow['status'],
    resolutionFaqEntryId: row.resolution_faq_entry_id,
  }));
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

/** `ok` when the row moved, `stale` when the guard failed, `missing` when the row is gone. */
export type WriteOutcome = 'ok' | 'stale' | 'missing';

interface BaseWrite {
  readonly id: string;
  /**
   * The revision the caller read. **`0` means "no precondition"**, which is only legitimate for
   * transition 9 (`DELETE /api/tutor/structure-artifacts/{artifactId}`), whose guard column in
   * `06` section 3.2 is `-` and whose failure codes in `06` section 5.4 do not include
   * `STALE_REVISION`. `0` cannot collide with a real revision: `CK (revision >= 1)` makes it
   * impossible, so the value is unambiguous rather than a sentinel that might one day be valid.
   */
  readonly expectedRevision: number;
  readonly nextStatus: PublicationStatus;
  readonly effects: StampEffect;
  readonly actorUserId: string;
}

/**
 * The stamp columns and the revision bump, identical in every artifact UPDATE.
 *
 * Written as a comment rather than a fragment because postgres.js cannot carry a `SET` clause
 * between two separate template literals without composing the statement, and composing it is the
 * string-interpolation hazard `structure.ts` records. Every statement below repeats these four lines
 * verbatim:
 *
 * ```sql
 * publication_status = $nextStatus,
 * approved_by_user_id = case when $setApproval then $actor::uuid
 *                            when $clearApproval then null
 *                            else approved_by_user_id end,
 * approved_at = case when $setApproval then now()
 *                    when $clearApproval then null
 *                    else approved_at end,
 * published_at = case when $setPublished then now()
 *                     when $clearPublished then null
 *                     else published_at end,
 * revision = revision + 1
 * ```
 */

export async function writeRequirementNode(
  ex: Executor,
  input: BaseWrite & {
    readonly values: Pick<
      RequirementNodePayload,
      'title' | 'mapSummary' | 'sourcePage' | 'sourceSectionLabel' | 'displayOrder'
    >;
  },
): Promise<WriteOutcome> {
  const rows = await ex<{ id: string }[]>`
    update requirement_nodes set
      title = ${input.values.title},
      map_summary = ${input.values.mapSummary},
      source_page = ${input.values.sourcePage},
      source_section_label = ${input.values.sourceSectionLabel},
      display_order = ${input.values.displayOrder},
      publication_status = ${input.nextStatus},
      approved_by_user_id = case when ${input.effects.setApproval} then ${input.actorUserId}::uuid
                                 when ${input.effects.clearApproval} then null
                                 else approved_by_user_id end,
      approved_at = case when ${input.effects.setApproval} then now()
                         when ${input.effects.clearApproval} then null
                         else approved_at end,
      published_at = case when ${input.effects.setPublished} then now()
                          when ${input.effects.clearPublished} then null
                          else published_at end,
      revision = revision + 1
     where id = ${input.id}::uuid
       and (${input.expectedRevision} = 0 or revision = ${input.expectedRevision})
    returning id
  `;
  return outcome(rows.length, ex, input.id);
}

export async function writeRubricSection(
  ex: Executor,
  input: BaseWrite & {
    readonly values: Pick<
      RubricSectionPayload,
      'sectionLabel' | 'weightPercent' | 'pageFrom' | 'pageTo' | 'mapInterpretation' | 'displayOrder'
    >;
  },
): Promise<WriteOutcome> {
  const rows = await ex<{ id: string }[]>`
    update rubric_sections set
      section_label = ${input.values.sectionLabel},
      weight_percent = ${input.values.weightPercent},
      page_from = ${input.values.pageFrom},
      page_to = ${input.values.pageTo},
      map_interpretation = ${input.values.mapInterpretation},
      display_order = ${input.values.displayOrder},
      publication_status = ${input.nextStatus},
      approved_by_user_id = case when ${input.effects.setApproval} then ${input.actorUserId}::uuid
                                 when ${input.effects.clearApproval} then null
                                 else approved_by_user_id end,
      approved_at = case when ${input.effects.setApproval} then now()
                         when ${input.effects.clearApproval} then null
                         else approved_at end,
      published_at = case when ${input.effects.setPublished} then now()
                          when ${input.effects.clearPublished} then null
                          else published_at end,
      revision = revision + 1
     where id = ${input.id}::uuid
       and (${input.expectedRevision} = 0 or revision = ${input.expectedRevision})
    returning id
  `;
  return outcome(rows.length, ex, input.id);
}

export async function writeMilestone(
  ex: Executor,
  input: BaseWrite & { readonly values: Pick<MilestonePayload, 'title' | 'summary' | 'displayOrder'> },
): Promise<WriteOutcome> {
  const rows = await ex<{ id: string }[]>`
    update milestones set
      title = ${input.values.title},
      summary = ${input.values.summary},
      display_order = ${input.values.displayOrder},
      publication_status = ${input.nextStatus},
      approved_by_user_id = case when ${input.effects.setApproval} then ${input.actorUserId}::uuid
                                 when ${input.effects.clearApproval} then null
                                 else approved_by_user_id end,
      approved_at = case when ${input.effects.setApproval} then now()
                         when ${input.effects.clearApproval} then null
                         else approved_at end,
      published_at = case when ${input.effects.setPublished} then now()
                          when ${input.effects.clearPublished} then null
                          else published_at end,
      revision = revision + 1
     where id = ${input.id}::uuid
       and (${input.expectedRevision} = 0 or revision = ${input.expectedRevision})
    returning id
  `;
  return outcome(rows.length, ex, input.id);
}

export async function writeChecklistItem(
  ex: Executor,
  input: BaseWrite & {
    readonly values: Pick<
      ChecklistItemPayload,
      'title' | 'planningLevel' | 'description' | 'displayOrder'
    >;
  },
): Promise<WriteOutcome> {
  const rows = await ex<{ id: string }[]>`
    update checklist_items set
      title = ${input.values.title},
      planning_level = ${input.values.planningLevel},
      description = ${input.values.description},
      display_order = ${input.values.displayOrder},
      publication_status = ${input.nextStatus},
      approved_by_user_id = case when ${input.effects.setApproval} then ${input.actorUserId}::uuid
                                 when ${input.effects.clearApproval} then null
                                 else approved_by_user_id end,
      approved_at = case when ${input.effects.setApproval} then now()
                         when ${input.effects.clearApproval} then null
                         else approved_at end,
      published_at = case when ${input.effects.setPublished} then now()
                          when ${input.effects.clearPublished} then null
                          else published_at end,
      revision = revision + 1
     where id = ${input.id}::uuid
       and (${input.expectedRevision} = 0 or revision = ${input.expectedRevision})
    returning id
  `;
  return outcome(rows.length, ex, input.id);
}

export async function writeFaqEntry(
  ex: Executor,
  input: BaseWrite & {
    readonly values: Pick<FaqEntryPayload, 'question' | 'answer' | 'milestoneId' | 'displayOrder'>;
  },
): Promise<WriteOutcome> {
  // `faq_entries` carries a fifth stamp: `published_by_user_id`, required by
  // `ck_faq_entries_published_by` when the row is PUBLISHED (06 section 7.4.4). It is set and cleared
  // with `published_at` so the pair cannot disagree.
  const rows = await ex<{ id: string }[]>`
    update faq_entries set
      question = ${input.values.question},
      answer = ${input.values.answer},
      milestone_id = ${input.values.milestoneId}::uuid,
      display_order = ${input.values.displayOrder},
      publication_status = ${input.nextStatus},
      approved_by_user_id = case when ${input.effects.setApproval} then ${input.actorUserId}::uuid
                                 when ${input.effects.clearApproval} then null
                                 else approved_by_user_id end,
      approved_at = case when ${input.effects.setApproval} then now()
                         when ${input.effects.clearApproval} then null
                         else approved_at end,
      published_by_user_id = case when ${input.effects.setPublished} then ${input.actorUserId}::uuid
                                  when ${input.effects.clearPublished} then null
                                  else published_by_user_id end,
      published_at = case when ${input.effects.setPublished} then now()
                          when ${input.effects.clearPublished} then null
                          else published_at end,
      revision = revision + 1
     where id = ${input.id}::uuid
       and (${input.expectedRevision} = 0 or revision = ${input.expectedRevision})
    returning id
  `;
  return outcome(rows.length, ex, input.id);
}

export async function writeAiPolicyRule(
  ex: Executor,
  input: BaseWrite & {
    readonly values: Pick<
      AiPolicyRulePayload,
      'ruleCode' | 'ruleText' | 'effect' | 'appliesTo' | 'displayOrder'
    >;
  },
): Promise<WriteOutcome> {
  const rows = await ex<{ id: string }[]>`
    update ai_policy_rules set
      rule_code = ${input.values.ruleCode},
      rule_text = ${input.values.ruleText},
      effect = ${input.values.effect},
      applies_to = ${input.values.appliesTo},
      display_order = ${input.values.displayOrder},
      publication_status = ${input.nextStatus},
      approved_by_user_id = case when ${input.effects.setApproval} then ${input.actorUserId}::uuid
                                 when ${input.effects.clearApproval} then null
                                 else approved_by_user_id end,
      approved_at = case when ${input.effects.setApproval} then now()
                         when ${input.effects.clearApproval} then null
                         else approved_at end,
      published_at = case when ${input.effects.setPublished} then now()
                          when ${input.effects.clearPublished} then null
                          else published_at end,
      revision = revision + 1
     where id = ${input.id}::uuid
       and (${input.expectedRevision} = 0 or revision = ${input.expectedRevision})
    returning id
  `;
  return outcome(rows.length, ex, input.id);
}

/** The structure's own status, used by approve-all and publish so the container moves with its children. */
export async function writeStructureStatus(
  ex: Executor,
  input: BaseWrite,
): Promise<WriteOutcome> {
  const rows = await ex<{ id: string }[]>`
    update assignment_structures set
      publication_status = ${input.nextStatus},
      approved_by_user_id = case when ${input.effects.setApproval} then ${input.actorUserId}::uuid
                                 when ${input.effects.clearApproval} then null
                                 else approved_by_user_id end,
      approved_at = case when ${input.effects.setApproval} then now()
                         when ${input.effects.clearApproval} then null
                         else approved_at end,
      published_at = case when ${input.effects.setPublished} then now()
                          when ${input.effects.clearPublished} then null
                          else published_at end,
      revision = revision + 1
     where id = ${input.id}::uuid
       and (${input.expectedRevision} = 0 or revision = ${input.expectedRevision})
    returning id
  `;
  return outcome(rows.length, ex, input.id);
}

/**
 * Distinguish "the guard failed" from "the row is gone".
 *
 * An UPDATE that matches no row is ambiguous, so the caller asks one extra question only on the
 * failure path. The alternative -- assuming `stale` -- would report `STALE_REVISION` for a deleted
 * artifact, which is a wrong code and a wrong message for the tutor.
 */
async function outcome(
  updated: number,
  ex: Executor,
  id: string,
): Promise<WriteOutcome> {
  if (updated > 0) return 'ok';
  const row = await findReviewArtifact(ex, id);
  return row === null ? 'missing' : 'stale';
}

// ---------------------------------------------------------------------------------------------
// Tutor authoring (06 section 5.4: POST /api/tutor/assignments/{assignmentId}/artifacts)
// ---------------------------------------------------------------------------------------------

/**
 * What a tutor-authored artifact needs. `id` is supplied by the caller, as everywhere in this
 * package: an insert takes its own primary key so a retry is identifiable.
 */
export type NewTutorArtifact =
  | {
      readonly kind: 'milestone';
      readonly id: string;
      readonly assignmentId: string;
      readonly structureId: string;
      readonly title: string;
      readonly summary: string | null;
      /** `null` means append: the insert computes `max(display_order) + 1` inside its own scope. */
      readonly displayOrder: number | null;
    }
  | {
      readonly kind: 'checklist_item';
      readonly id: string;
      readonly assignmentId: string;
      readonly structureId: string;
      readonly milestoneId: string;
      readonly title: string;
      readonly planningLevel: ChecklistItemPayload['planningLevel'];
      readonly description: string | null;
      readonly displayOrder: number | null;
    }
  | {
      readonly kind: 'faq_entry';
      readonly id: string;
      readonly assignmentId: string;
      readonly milestoneId: string | null;
      readonly question: string;
      readonly answer: string;
      readonly displayOrder: number | null;
    }
  | {
      readonly kind: 'ai_policy_rule';
      readonly id: string;
      readonly assignmentId: string;
      readonly structureId: string;
      readonly ruleCode: string;
      readonly ruleText: string;
      readonly effect: AiPolicyRulePayload['effect'];
      readonly appliesTo: AiPolicyRulePayload['appliesTo'];
      readonly displayOrder: number | null;
    };

/**
 * Insert one tutor-authored artifact (`07` section 7.3's "Add one" affordance).
 *
 * **It starts at `NEEDS_REVIEW`, and that is a reading rather than an oversight.** `06` section 3.2
 * has no "tutor creates" transition: the table's actors are the system and the tutor acting on an
 * existing row, and the only creation rows are 1 (`-> AI_GENERATED`) and 10 (`REJECTED ->` a new
 * row). `EDITED` is wrong because D53 defines it as "the tutor has changed at least one editable
 * field" -- of a row that already existed. Starting a tutor-authored artifact in the review queue
 * needs no new transition, keeps the invariant that every published row passed through an explicit
 * `APPROVED` step, and means the artifact carries the same pre-approval badge as everything else
 * (`07` section 7.3 rule 1).
 *
 * `origin = 'tutor'` records authorship and `provenance` stays `null`, which is what
 * `ck_provenance_shape` requires: the row was not generated by a model, and inventing provenance for
 * it would be a false claim about its origin.
 */
export async function insertTutorArtifact(
  ex: Executor,
  input: NewTutorArtifact,
): Promise<void> {
  switch (input.kind) {
    case 'milestone':
      await ex`
        insert into milestones (
          id, assignment_id, structure_id, title, summary, display_order,
          publication_status, origin, grounding_chunk_ids, revision
        ) values (
          ${input.id}::uuid, ${input.assignmentId}::uuid, ${input.structureId}::uuid,
          ${input.title}, ${input.summary},
          coalesce(
            ${input.displayOrder},
            (select coalesce(max(display_order), -1) + 1 from milestones
              where structure_id = ${input.structureId}::uuid and deleted_at is null)
          ),
          'NEEDS_REVIEW', 'tutor', '{}'::uuid[], 1
        )
      `;
      return;
    case 'checklist_item':
      await ex`
        insert into checklist_items (
          id, assignment_id, structure_id, milestone_id, title, planning_level, description,
          display_order, publication_status, origin, grounding_chunk_ids, revision
        ) values (
          ${input.id}::uuid, ${input.assignmentId}::uuid, ${input.structureId}::uuid,
          ${input.milestoneId}::uuid, ${input.title}, ${input.planningLevel}, ${input.description},
          coalesce(
            ${input.displayOrder},
            (select coalesce(max(display_order), -1) + 1 from checklist_items
              where milestone_id = ${input.milestoneId}::uuid and deleted_at is null)
          ),
          'NEEDS_REVIEW', 'tutor', '{}'::uuid[], 1
        )
      `;
      return;
    case 'faq_entry':
      // `source_kind = 'tutor_authored'` is the only value that describes this row, and
      // `ck_faq_entries_peer_answer_source` means it must not be `peer_answer` (D29, O8).
      await ex`
        insert into faq_entries (
          id, assignment_id, milestone_id, question, answer, source_kind, display_order,
          publication_status, origin, grounding_chunk_ids, revision
        ) values (
          ${input.id}::uuid, ${input.assignmentId}::uuid, ${input.milestoneId}::uuid,
          ${input.question}, ${input.answer}, 'tutor_authored',
          coalesce(
            ${input.displayOrder},
            (select coalesce(max(display_order), -1) + 1 from faq_entries
              where assignment_id = ${input.assignmentId}::uuid and deleted_at is null)
          ),
          'NEEDS_REVIEW', 'tutor', '{}'::uuid[], 1
        )
      `;
      return;
    case 'ai_policy_rule':
      await ex`
        insert into ai_policy_rules (
          id, assignment_id, structure_id, rule_code, rule_text, effect, applies_to,
          display_order, publication_status, origin, grounding_chunk_ids, revision
        ) values (
          ${input.id}::uuid, ${input.assignmentId}::uuid, ${input.structureId}::uuid,
          ${input.ruleCode}, ${input.ruleText}, ${input.effect}, ${input.appliesTo},
          coalesce(
            ${input.displayOrder},
            (select coalesce(max(display_order), -1) + 1 from ai_policy_rules
              where structure_id = ${input.structureId}::uuid)
          ),
          'NEEDS_REVIEW', 'tutor', '{}'::uuid[], 1
        )
      `;
      return;
  }
}

/**
 * The structure a milestone belongs to, or `null`.
 *
 * `checklist_items` carries `structure_id` and `milestone_id` as two independent foreign keys, so the
 * database does **not** stop a tutor-authored item from pointing at a milestone of a different
 * structure -- the composite FK `(structure_id, assignment_id)` only ties the item's own pair. A
 * cross-structure link would render an item under a milestone that never appears (gate rule G1 filters
 * by structure), so the create route checks it explicitly.
 */
export async function findMilestoneStructureId(
  ex: Executor,
  milestoneId: string,
): Promise<string | null> {
  const rows = await ex<{ structure_id: string }[]>`
    select structure_id from milestones
     where id = ${milestoneId}::uuid and deleted_at is null
     limit 1
  `;
  return rows[0]?.structure_id ?? null;
}

// ---------------------------------------------------------------------------------------------
// Bulk transitions (06 section 3.4: publish is a bulk action)
// ---------------------------------------------------------------------------------------------

export interface BulkResult {
  readonly moved: number;
}

/**
 * Approve every artifact in the current structure that is `NEEDS_REVIEW` or `EDITED`.
 *
 * No revision guard: this action's intent is "approve whatever is in the review queue", not "approve
 * the version I saw". It reports how many rows moved, so the UI can say what it skipped (an
 * already-approved artifact is simply not selected -- `07` section 7.3 rule 7).
 */
export async function approveAllReviewable(
  ex: Executor,
  input: { readonly assignmentId: string; readonly structureId: string; readonly actorUserId: string },
): Promise<BulkResult> {
  const { structureId, actorUserId } = input;
  const statuses = ['NEEDS_REVIEW', 'EDITED'];
  let moved = 0;

  const stamp = async (run: Promise<{ id: string }[]>): Promise<void> => {
    const rows = await run;
    moved += rows.length;
  };

  await stamp(ex<{ id: string }[]>`
    update assignment_structures set
      publication_status = 'APPROVED', approved_by_user_id = ${actorUserId}::uuid,
      approved_at = now(), revision = revision + 1
     where id = ${structureId}::uuid and publication_status = any(${statuses}::text[])
    returning id
  `);
  await stamp(ex<{ id: string }[]>`
    update requirement_nodes set
      publication_status = 'APPROVED', approved_by_user_id = ${actorUserId}::uuid,
      approved_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid and publication_status = any(${statuses}::text[])
    returning id
  `);
  await stamp(ex<{ id: string }[]>`
    update rubric_sections set
      publication_status = 'APPROVED', approved_by_user_id = ${actorUserId}::uuid,
      approved_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid and publication_status = any(${statuses}::text[])
    returning id
  `);
  await stamp(ex<{ id: string }[]>`
    update milestones set
      publication_status = 'APPROVED', approved_by_user_id = ${actorUserId}::uuid,
      approved_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid and publication_status = any(${statuses}::text[])
       and deleted_at is null
    returning id
  `);
  await stamp(ex<{ id: string }[]>`
    update checklist_items set
      publication_status = 'APPROVED', approved_by_user_id = ${actorUserId}::uuid,
      approved_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid and publication_status = any(${statuses}::text[])
       and deleted_at is null
    returning id
  `);
  await stamp(ex<{ id: string }[]>`
    update ai_policy_rules set
      publication_status = 'APPROVED', approved_by_user_id = ${actorUserId}::uuid,
      approved_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid and publication_status = any(${statuses}::text[])
    returning id
  `);
  await stamp(ex<{ id: string }[]>`
    update faq_entries set
      publication_status = 'APPROVED', approved_by_user_id = ${actorUserId}::uuid,
      approved_at = now(), revision = revision + 1
     where assignment_id = ${input.assignmentId}::uuid and publication_status = any(${statuses}::text[])
       and deleted_at is null
    returning id
  `);

  return { moved };
}

/**
 * Publish every `APPROVED` artifact, then mark the assignment published (transition 7).
 *
 * The order matters and is not cosmetic: the assignment's `status = 'published'` is the third
 * condition of gate rule G1 (`06` section 3.4), so setting it *after* the artifacts means a student
 * request that lands mid-transaction sees the previous, consistent state. Both halves are in one
 * transaction at the call site (`withTransaction`), which is what makes that true.
 */
export async function publishApprovedArtifacts(
  ex: Executor,
  input: {
    readonly assignmentId: string;
    readonly structureId: string;
    readonly actorUserId: string;
    /** Partial publish: the named artifacts only (`06` section 3.4). Undefined means all approved. */
    readonly artifactIds?: readonly string[];
  },
): Promise<BulkResult> {
  const { structureId, actorUserId } = input;
  const named = input.artifactIds === undefined ? null : [...input.artifactIds];

  let moved = 0;
  const run = async (promise: Promise<{ id: string }[]>): Promise<void> => {
    moved += (await promise).length;
  };

  await run(ex<{ id: string }[]>`
    update assignment_structures set
      publication_status = 'PUBLISHED', published_at = now(), revision = revision + 1
     where id = ${structureId}::uuid
       and publication_status = 'APPROVED'
       and (${named}::uuid[] is null or id = any(${named}::uuid[]))
    returning id
  `);
  await run(ex<{ id: string }[]>`
    update requirement_nodes set
      publication_status = 'PUBLISHED', published_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid
       and publication_status = 'APPROVED'
       and (${named}::uuid[] is null or id = any(${named}::uuid[]))
    returning id
  `);
  await run(ex<{ id: string }[]>`
    update rubric_sections set
      publication_status = 'PUBLISHED', published_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid
       and publication_status = 'APPROVED'
       and (${named}::uuid[] is null or id = any(${named}::uuid[]))
    returning id
  `);
  await run(ex<{ id: string }[]>`
    update milestones set
      publication_status = 'PUBLISHED', published_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid
       and publication_status = 'APPROVED'
       and deleted_at is null
       and (${named}::uuid[] is null or id = any(${named}::uuid[]))
    returning id
  `);
  await run(ex<{ id: string }[]>`
    update checklist_items set
      publication_status = 'PUBLISHED', published_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid
       and publication_status = 'APPROVED'
       and deleted_at is null
       and (${named}::uuid[] is null or id = any(${named}::uuid[]))
    returning id
  `);
  await run(ex<{ id: string }[]>`
    update ai_policy_rules set
      publication_status = 'PUBLISHED', published_at = now(), revision = revision + 1
     where structure_id = ${structureId}::uuid
       and publication_status = 'APPROVED'
       and (${named}::uuid[] is null or id = any(${named}::uuid[]))
    returning id
  `);
  // `faq_entries` additionally needs `published_by_user_id`, required by
  // `ck_faq_entries_published_by` when the row is PUBLISHED (06 section 7.4.4).
  await run(ex<{ id: string }[]>`
    update faq_entries set
      publication_status = 'PUBLISHED', published_at = now(),
      published_by_user_id = ${actorUserId}::uuid, revision = revision + 1
     where assignment_id = ${input.assignmentId}::uuid
       and publication_status = 'APPROVED'
       and deleted_at is null
       and (${named}::uuid[] is null or id = any(${named}::uuid[]))
    returning id
  `);

  await ex`
    update assignments set status = 'published', published_at = now()
     where id = ${input.assignmentId}::uuid and status = 'in_review'
  `;

  return { moved };
}

/**
 * Reject one artifact (transition 9): status `REJECTED`, row retained (`06` sections 3.2, 3.7).
 *
 * `deleted_at` is deliberately **not** set. Transition 9's side effect is "Row retained; excluded
 * from all student and retrieval reads", and `REJECTED` already achieves that in every read;
 * `deleted_at` is the descriptor for a soft-deleted row, and 3.7 keeps a rejected row as *evidence*,
 * which a soft-delete would misdescribe.
 */
export async function rejectArtifact(
  ex: Executor,
  input: {
    readonly artifact: ReviewArtifactRow;
    readonly expectedRevision: number;
    readonly actorUserId: string;
    readonly effects: StampEffect;
  },
): Promise<WriteOutcome> {
  const base: BaseWrite = {
    id: input.artifact.id,
    expectedRevision: input.expectedRevision,
    nextStatus: 'REJECTED',
    effects: input.effects,
    actorUserId: input.actorUserId,
  };
  switch (input.artifact.kind) {
    case 'structure':
      return writeStructureStatus(ex, base);
    case 'requirement_node':
      return writeRequirementNode(ex, {
        ...base,
        values: pickRequirement(input.artifact.payload),
      });
    case 'rubric_section':
      return writeRubricSection(ex, { ...base, values: pickRubric(input.artifact.payload) });
    case 'milestone':
      return writeMilestone(ex, { ...base, values: pickMilestone(input.artifact.payload) });
    case 'checklist_item':
      return writeChecklistItem(ex, { ...base, values: pickChecklist(input.artifact.payload) });
    case 'faq_entry':
      return writeFaqEntry(ex, { ...base, values: pickFaq(input.artifact.payload) });
    case 'ai_policy_rule':
      return writeAiPolicyRule(ex, { ...base, values: pickPolicy(input.artifact.payload) });
  }
}

/**
 * Write the transition decided by `resolveTransition`, reusing the stored payload for every column
 * the caller did not send.
 *
 * The merge is here rather than in the route because it has to be paired with the revision guard:
 * the values written are the values the caller's `expectedRevision` described. A merge done in the
 * route would be equally correct only by convention.
 */
export async function applyArtifactTransition(
  ex: Executor,
  input: {
    readonly artifact: ReviewArtifactRow;
    readonly expectedRevision: number;
    readonly nextStatus: PublicationStatus;
    readonly effects: StampEffect;
    readonly actorUserId: string;
    /** The payload fields to change. Absent means "keep the stored value". */
    readonly patch: Readonly<Record<string, unknown>>;
  },
): Promise<WriteOutcome> {
  const merged: Record<string, unknown> = { ...input.artifact.payload, ...definedOnly(input.patch) };
  const base: BaseWrite = {
    id: input.artifact.id,
    expectedRevision: input.expectedRevision,
    nextStatus: input.nextStatus,
    effects: input.effects,
    actorUserId: input.actorUserId,
  };

  switch (input.artifact.kind) {
    case 'structure':
      return writeStructureStatus(ex, base);
    case 'requirement_node':
      return writeRequirementNode(ex, { ...base, values: pickRequirement(merged) });
    case 'rubric_section':
      return writeRubricSection(ex, { ...base, values: pickRubric(merged) });
    case 'milestone':
      return writeMilestone(ex, { ...base, values: pickMilestone(merged) });
    case 'checklist_item':
      return writeChecklistItem(ex, { ...base, values: pickChecklist(merged) });
    case 'faq_entry':
      return writeFaqEntry(ex, { ...base, values: pickFaq(merged) });
    case 'ai_policy_rule':
      return writeAiPolicyRule(ex, { ...base, values: pickPolicy(merged) });
  }
}

/** A PATCH body's `undefined` means "not sent", and `null` means "clear the field". */
function definedOnly(patch: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function pickRequirement(values: Record<string, unknown>) {
  return {
    title: asString(values['title']),
    mapSummary: asNullableString(values['mapSummary']),
    sourcePage: asNullableNumber(values['sourcePage']),
    sourceSectionLabel: asNullableString(values['sourceSectionLabel']),
    displayOrder: asNumber(values['displayOrder']),
  };
}

function pickRubric(values: Record<string, unknown>) {
  return {
    sectionLabel: asString(values['sectionLabel']),
    weightPercent: asNullableNumber(values['weightPercent']),
    pageFrom: asNullableNumber(values['pageFrom']),
    pageTo: asNullableNumber(values['pageTo']),
    mapInterpretation: asNullableString(values['mapInterpretation']),
    displayOrder: asNumber(values['displayOrder']),
  };
}

function pickMilestone(values: Record<string, unknown>) {
  return {
    title: asString(values['title']),
    summary: asNullableString(values['summary']),
    displayOrder: asNumber(values['displayOrder']),
  };
}

function pickChecklist(values: Record<string, unknown>) {
  return {
    title: asString(values['title']),
    planningLevel: asPlanningLevel(values['planningLevel']),
    description: asNullableString(values['description']),
    displayOrder: asNumber(values['displayOrder']),
  };
}

function pickFaq(values: Record<string, unknown>) {
  return {
    question: asString(values['question']),
    answer: asString(values['answer']),
    milestoneId: asNullableString(values['milestoneId']),
    displayOrder: asNumber(values['displayOrder']),
  };
}

function pickPolicy(values: Record<string, unknown>) {
  return {
    ruleCode: asString(values['ruleCode']),
    ruleText: asString(values['ruleText']),
    effect: asPolicyEffect(values['effect']),
    appliesTo: asPolicyAppliesTo(values['appliesTo']),
    displayOrder: asNumber(values['displayOrder']),
  };
}

// The narrowing helpers below exist because a payload merged from a stored row is `unknown` at each
// key. They fail loudly on a wrong type rather than coercing: a silently coerced `displayOrder`
// would reorder a tutor's list, and a silently coerced `effect` would change what the guardrail
// forbids. A malformed value here is a bug in this module or in the column mapping, never user
// input -- user input is validated by the route before it reaches a write.

function asString(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('expected a string column');
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new TypeError('expected a nullable string column');
  return value;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  throw new TypeError('expected a numeric column');
}

function asNullableNumber(value: unknown): number | null {
  if (value === null) return null;
  return asNumber(value);
}

function asPlanningLevel(value: unknown): ChecklistItemPayload['planningLevel'] {
  const levels = ['understand', 'identify', 'plan', 'verify', 'review', 'note'] as const;
  const found = levels.find((level) => level === value);
  if (found === undefined) throw new TypeError('expected a planning_level column');
  return found;
}

function asPolicyEffect(value: unknown): AiPolicyRulePayload['effect'] {
  const effects = ['PROHIBIT', 'ALLOW', 'ESCALATE_TO_TUTOR', 'CLARIFY'] as const;
  const found = effects.find((effect) => effect === value);
  if (found === undefined) throw new TypeError('expected an ai_policy_rules.effect column');
  return found;
}

function asPolicyAppliesTo(value: unknown): AiPolicyRulePayload['appliesTo'] {
  const targets = ['assistant', 'uploads', 'discussion', 'all'] as const;
  const found = targets.find((target) => target === value);
  if (found === undefined) throw new TypeError('expected an ai_policy_rules.applies_to column');
  return found;
}

