/**
 * The student workspace reads: `06-DATA-MODEL.md` sections 5.5.2, 5.5.3, 5.5.4, 5.5.6 and 5.5.7.
 *
 * **Gate rule G1 is not re-implemented here.** Every function below takes a `VisibleScope`, which
 * only `findVisibleAssignmentScope` can produce, so there is no signature through which a caller
 * could read an assignment's content by id before the gate resolved (trap T3, `01-STATE.md` section
 * 5 items 1-2). A new read belongs here as `(ex, scope)` or not at all.
 *
 * **What this module deliberately does not read.** A Query count and an FAQ count are read here
 * because `06` section 5.5.3 puts them in the workspace bootstrap; the Query *threads* themselves are
 * Phase 6's (`11` WP-10). The counts are computed from the `queries` table, which the seed already
 * populates, so the bootstrap is complete against the contract rather than against a placeholder.
 */

import type { Executor } from './courses';
import type { VisibleScope } from './student-visibility';
import { isoTimestamp, requiredNumber } from '../values';

// ---------------------------------------------------------------------------------------------
// Courses and assignment cards (`06` section 5.5.2)
// ---------------------------------------------------------------------------------------------

export interface StudentCourseRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly term: string;
  readonly roleInCourse: string;
  readonly assignmentCount: number;
}

/**
 * The courses this user is enrolled in, with a published-assignment count for a student.
 *
 * The count is role-shaped: a student counts only published assignments (G1 renders an unpublished
 * one invisible, so counting it would show a course with nothing in it), while a tutor counts every
 * assignment they can see in review. `06` section 5.5.2 gives `assignmentCount` no such qualification,
 * so this is the reading taken and is recorded in the module rather than left implicit.
 */
export async function listCoursesForUser(ex: Executor, userId: string): Promise<StudentCourseRow[]> {
  const rows = await ex<
    {
      id: string;
      code: string;
      title: string;
      term: string;
      role_in_course: string;
      assignment_count: number;
    }[]
  >`
    select c.id,
           c.code,
           c.title,
           c.term,
           e.role_in_course,
           (
             select count(*)
               from assignments a
              where a.course_id = c.id
                and (e.role_in_course = 'tutor' or a.status = 'published')
           )::int as assignment_count
      from enrollments e
      join courses c on c.id = e.course_id
     where e.user_id = ${userId}::uuid
     order by c.code asc
  `;
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    term: row.term,
    roleInCourse: row.role_in_course,
    assignmentCount: row.assignment_count,
  }));
}

/**
 * How many courses have at least one open Query with a tutor reply, keyed by course id.
 *
 * `07` section 3.4 gives the dashboard "one attention line when the student has an open Query with a
 * new tutor reply". A tutor reply sets a Query's status to `answered` (`07` section 5.1), so the
 * condition is `open or answered` in the student's own threads -- and it is aggregated per course so
 * the dashboard issues one query rather than one per card.
 */
export async function countAnsweredQueriesPerCourse(
  ex: Executor,
  userId: string,
): Promise<Map<string, number>> {
  const rows = await ex<{ course_id: string; answered_count: string | number }[]>`
    select a.course_id, count(distinct q.id) as answered_count
      from queries q
      join assignments a on a.id = q.assignment_id
     where q.student_id = ${userId}::uuid
       and q.status = 'answered'
     group by a.course_id
  `;
  return new Map(rows.map((row) => [row.course_id, requiredNumber(row.answered_count)]));
}

/** One course, for the route that addresses it directly. `null` means "not enrolled". */export async function findCourseForUser(
  ex: Executor,
  userId: string,
  courseId: string,
): Promise<StudentCourseRow | null> {
  const rows = await ex<
    {
      id: string;
      code: string;
      title: string;
      term: string;
      role_in_course: string;
      assignment_count: number;
    }[]
  >`
    select c.id,
           c.code,
           c.title,
           c.term,
           e.role_in_course,
           (
             select count(*)
               from assignments a
              where a.course_id = c.id
                and (e.role_in_course = 'tutor' or a.status = 'published')
           )::int as assignment_count
      from enrollments e
      join courses c on c.id = e.course_id
     where e.user_id = ${userId}::uuid
       and c.id = ${courseId}::uuid
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        code: row.code,
        title: row.title,
        term: row.term,
        roleInCourse: row.role_in_course,
        assignmentCount: row.assignment_count,
      };
}

export interface StudentAssignmentCardRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly publishedAt: string | null;
  readonly checklistCompleted: number | null;
  readonly checklistTotal: number | null;
  readonly openQueryCount: number | null;
}

/**
 * The assignment cards for one course, **as a student**, ordered by due date ascending with undated
 * last (`07` section 3.5).
 *
 * There is deliberately no `isStudent` parameter. `06` section 5.2 makes the role per **course** (an
 * `enrollments.role_in_course`), so a caller passing a global role would be wrong for a user who
 * tutors one course and studies another. A tutor-facing card list is a different query with different
 * fields (`needsReviewCount`), and it belongs to the tutor phase.
 *
 * Only published assignments are returned, because G1 renders anything else invisible to a student;
 * counting or listing it would be the empty-shell bug T3 forbids.
 */
export async function listAssignmentCardsForStudent(
  ex: Executor,
  userId: string,
  courseId: string,
): Promise<StudentAssignmentCardRow[]> {
  const rows = await ex<
    {
      id: string;
      title: string;
      status: string;
      due_at: Date | string | null;
      published_at: Date | string | null;
      checklist_completed: string | number;
      checklist_total: string | number;
      open_query_count: string | number;
    }[]
  >`
    select a.id,
           a.title,
           a.status,
           a.due_at,
           a.published_at,
           (
             select count(*)
               from student_checklist_progress p
              where p.student_id = ${userId}::uuid
                and p.state = 'completed'
                and p.checklist_item_id in (
                  select ci.id
                    from checklist_items ci
                    join milestones m on m.id = ci.milestone_id
                   where m.assignment_id = a.id
                     and ci.publication_status = 'PUBLISHED'
                     and m.publication_status = 'PUBLISHED'
                     and ci.deleted_at is null
                )
           ) as checklist_completed,
           (
             select count(*)
               from checklist_items ci
               join milestones m on m.id = ci.milestone_id
              where m.assignment_id = a.id
                and ci.publication_status = 'PUBLISHED'
                and m.publication_status = 'PUBLISHED'
                and ci.deleted_at is null
           ) as checklist_total,
           (
             select count(*)
               from queries q
              where q.assignment_id = a.id
                and q.student_id = ${userId}::uuid
                and q.status = 'open'
           ) as open_query_count
      from assignments a
     where a.course_id = ${courseId}::uuid
       and a.status = 'published'
     order by a.due_at asc nulls last, a.created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    dueAt: isoTimestamp(row.due_at),
    publishedAt: isoTimestamp(row.published_at),
    checklistCompleted: requiredNumber(row.checklist_completed),
    checklistTotal: requiredNumber(row.checklist_total),
    openQueryCount: requiredNumber(row.open_query_count),
  }));
}

// ---------------------------------------------------------------------------------------------
// The workspace bootstrap's parts (`06` sections 5.5.3, 5.5.4, 5.5.7)
// ---------------------------------------------------------------------------------------------

export interface WorkspaceHeaderRow {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string | null;
  readonly publishedAt: string;
  readonly courseCode: string;
  readonly courseTitle: string;
}

/** The assignment header of `06` section 5.5.3. */
export async function readWorkspaceHeader(
  ex: Executor,
  scope: VisibleScope,
): Promise<WorkspaceHeaderRow | null> {
  const rows = await ex<
    {
      id: string;
      title: string;
      due_at: string | null;
      published_at: string | null;
      course_code: string;
      course_title: string;
    }[]
  >`
    select a.id, a.title, a.due_at, a.published_at, c.code as course_code, c.title as course_title
      from assignments a
      join courses c on c.id = a.course_id
     where a.id = ${scope.assignmentId}::uuid
       and a.status = 'published'
     limit 1
  `;
  const row = rows[0];
  // `published_at` is non-null by constraint for a published assignment
  // (`ck_assignments_published_at`), so the fallback is unreachable and is written as the empty
  // string rather than as a non-null assertion.
  if (row === undefined || row.published_at === null) return null;
  return {
    id: row.id,
    title: row.title,
    dueAt: isoTimestamp(row.due_at),
    publishedAt: isoTimestamp(row.published_at) ?? '',
    courseCode: row.course_code,
    courseTitle: row.course_title,
  };
}

export interface SourceManifestRow {
  readonly id: string;
  readonly kind: string;
  readonly mimeType: string;
  readonly title: string;
  readonly pageCount: number | null;
  readonly extractionFailed: boolean;
}

/**
 * The published documents of `06` section 5.5.3's `brief.sources[]` and of section 5.5.4.
 *
 * `extractionFailed` is derived, not stored: `07` section 4.2 rule 8 shows an inline notice when a
 * document "could not be fully read", which is `extraction_status = 'failed'` **or** a page count of
 * `0`. Deriving it here keeps one definition of the condition.
 *
 * `title` is the stored filename. It is a document label, never requirement text, and the document
 * itself is never re-authored (C2).
 */
export async function listPublishedSourceManifests(
  ex: Executor,
  scope: VisibleScope,
): Promise<SourceManifestRow[]> {
  const rows = await ex<
    {
      id: string;
      kind: string;
      mime_type: string;
      original_filename: string;
      page_count: number | null;
      extraction_status: string;
    }[]
  >`
    select id, kind, mime_type, original_filename, page_count, extraction_status
      from assignment_sources
     where assignment_id = ${scope.assignmentId}::uuid
       and deleted_at is null
     order by case kind
                when 'brief' then 0
                when 'rubric' then 1
                when 'ai_policy' then 2
                when 'marking_guide' then 3
                else 4
              end asc,
              created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    title: row.original_filename,
    pageCount: row.page_count,
    extractionFailed: row.extraction_status === 'failed' || row.page_count === 0,
  }));
}

export interface BriefSectionRow {
  readonly sourceId: string;
  readonly label: string;
  readonly pageFrom: number;
  readonly pageTo: number;
  readonly sourceChunkIds: string[];
}

/**
 * The page map of `06` section 5.5.4's `sections[]`.
 *
 * **Why this is a manifest and not document bytes (I-06).** No route in the 64-route vocabulary
 * serves source bytes and `LocalStorageDriver.signedUrl` deliberately throws (I-06, T12). The viewer
 * therefore renders each page from this document's own **stored verbatim extraction**: the sections
 * here are the extractor's own headings and page ranges, and the text behind them is `source_chunks`
 * text as extracted -- never re-flowed, never summarised (C2, D17). A chunk with no section label is
 * still located by its page range, which is what a page anchor needs.
 */
export async function listBriefSections(
  ex: Executor,
  scope: VisibleScope,
): Promise<BriefSectionRow[]> {
  const rows = await ex<
    {
      source_id: string;
      section_label: string | null;
      // `coalesce` guarantees both ends, so the columns are non-null and the normaliser only
      // converts the driver's numeric-as-string case (values.ts).
      page_from: number;
      page_to: number;
      chunk_ids: string[];
    }[]
  >`
    select source_id,
           section_label,
           min(coalesce(page_from, page_to, 1))::int as page_from,
           max(coalesce(page_to, page_from, 1))::int as page_to,
           array_agg(id order by chunk_index asc) as chunk_ids
      from source_chunks
     where assignment_id = ${scope.assignmentId}::uuid
     group by source_id, section_label
     order by source_id asc, min(chunk_index) asc
  `;
  return rows.map((row) => ({
    sourceId: row.source_id,
    // A chunk group with no heading text is located by page, and the label column is the document's
    // own text where it exists. An empty string here would render as an empty heading, so the page
    // range is the label instead (never a word this product authored).
    label: row.section_label ?? `Page ${requiredNumber(row.page_from)}`,
    // `coalesce` guarantees both ends are present, so the normaliser only fixes the column's type.
    pageFrom: requiredNumber(row.page_from),
    pageTo: requiredNumber(row.page_to),
    sourceChunkIds: row.chunk_ids,
  }));
}

/** The published page text the brief viewer renders, in reading order. */
export interface BriefPageRow {
  readonly sourceId: string;
  readonly chunkId: string;
  readonly page: number;
  readonly text: string;
}

/**
 * Every published chunk's text, in document order, so the viewer can render page by page.
 *
 * This is the **stored extraction** being displayed verbatim. It is not a second rendering of the
 * requirement: it is the same text the extractor produced from the uploaded document, and it is
 * the only student-facing surface for requirement text (`07` section 4.2 rule 1, C2).
 */
export async function listBriefPageText(
  ex: Executor,
  scope: VisibleScope,
): Promise<BriefPageRow[]> {
  const rows = await ex<
    {
      id: string;
      source_id: string;
      page_from: number | null;
      page_to: number | null;
      text: string;
    }[]
  >`
    select id, source_id, page_from, page_to, text
      from source_chunks
     where assignment_id = ${scope.assignmentId}::uuid
     order by source_id asc, chunk_index asc
  `;
  return rows.map((row) => ({
    sourceId: row.source_id,
    chunkId: row.id,
    page: row.page_from ?? row.page_to ?? 1,
    text: row.text,
  }));
}

export interface WorkspaceCountsRow {
  readonly openQueries: number;
  readonly queriesWithTutorReply: number;
  readonly checklistCompleted: number;
  readonly checklistTotal: number;
  readonly officialFaqCount: number;
}

/**
 * The five counts of `06` section 5.5.3 (`counts`, `officialFaqCount`) and section 5.5.6 (`totals`).
 *
 * One statement, because these five numbers all describe the same instant: a student who completes
 * an item while this runs should not see a completed count from before it and a total from after.
 *
 * `queriesWithTutorReply` counts threads whose status is `answered` -- the state a tutor reply sets
 * (`07` section 5.1) -- rather than joining `query_messages`, so it agrees with the `Answered` badge
 * the student sees on the same screen.
 *
 * **`queries` has no `deleted_at`, and these two counts must not filter as though it did.** Only
 * `query_messages` is soft-deletable (`0006_queries_faq.sql`): a Query thread is closed by its status,
 * not removed. A `deleted_at is null` predicate here fails at the database with
 * "column q.deleted_at does not exist" -- which is what a first live request to this route reported
 * before the predicate was removed.
 */
export async function readWorkspaceCounts(
  ex: Executor,
  scope: VisibleScope,
  studentId: string,
): Promise<WorkspaceCountsRow> {
  const rows = await ex<
    {
      open_queries: number;
      queries_with_tutor_reply: number;
      checklist_completed: number;
      checklist_total: number;
      official_faq_count: number;
    }[]
  >`
    select (
             select count(*) from queries q
              where q.assignment_id = ${scope.assignmentId}::uuid
                and q.student_id = ${studentId}::uuid
                and q.status = 'open'
           )::int as open_queries,
           (
             select count(*) from queries q
              where q.assignment_id = ${scope.assignmentId}::uuid
                and q.student_id = ${studentId}::uuid
                and q.status = 'answered'
           )::int as queries_with_tutor_reply,
           (
             select count(*)
               from student_checklist_progress p
              where p.student_id = ${studentId}::uuid
                and p.state = 'completed'
                and p.checklist_item_id in (
                  select ci.id
                    from checklist_items ci
                    join milestones m on m.id = ci.milestone_id
                   where m.assignment_id = ${scope.assignmentId}::uuid
                     and ci.publication_status = 'PUBLISHED'
                     and m.publication_status = 'PUBLISHED'
                     and ci.deleted_at is null
                )
           )::int as checklist_completed,
           (
             select count(*)
               from checklist_items ci
               join milestones m on m.id = ci.milestone_id
              where m.assignment_id = ${scope.assignmentId}::uuid
                and ci.publication_status = 'PUBLISHED'
                and m.publication_status = 'PUBLISHED'
                and ci.deleted_at is null
           )::int as checklist_total,
           (
             select count(*) from faq_entries f
              where f.assignment_id = ${scope.assignmentId}::uuid
                and f.publication_status = 'PUBLISHED'
                and f.deleted_at is null
           )::int as official_faq_count
  `;
  const row = rows[0];
  return {
    openQueries: row === undefined ? 0 : requiredNumber(row.open_queries),
    queriesWithTutorReply: row === undefined ? 0 : requiredNumber(row.queries_with_tutor_reply),
    checklistCompleted: row === undefined ? 0 : requiredNumber(row.checklist_completed),
    checklistTotal: row === undefined ? 0 : requiredNumber(row.checklist_total),
    officialFaqCount: row === undefined ? 0 : requiredNumber(row.official_faq_count),
  };
}

/**
 * When this assignment's AI Usage Policy was published, or `null` when no rule is published.
 *
 * `06` section 5.5.7 puts `publishedAt` on the policy response, and `ai_policy_rules` carries a
 * `published_at` per rule rather than one per policy. The policy's publication moment is therefore
 * the latest of its rules' -- the point at which the last rule became available to a student. Reading
 * `max` rather than the first rule's is what makes the value mean "since when has this been readable
 * in full", and it is `null` (not a fabricated timestamp) when nothing is published, which is D47's
 * unavailable state.
 * `ai_policy_rules` has no `deleted_at` (`0004_structure.sql`): a policy rule is withdrawn by
 * publication status, not removed. A `deleted_at is null` predicate here fails at the database, which
 * is what the first live request to this route reported; `listVisiblePolicyRules` in
 * `student-visibility.ts` is the read that already gets this right, so the two agree.
 */
export async function readPolicyPublishedAt(
  ex: Executor,
  scope: VisibleScope,
): Promise<string | null> {
  const rows = await ex<{ published_at: Date | string | null }[]>`
    select max(published_at) as published_at
      from ai_policy_rules
     where assignment_id = ${scope.assignmentId}::uuid
       and structure_id = ${scope.structureId}::uuid
       and publication_status = 'PUBLISHED'
  `;
  return isoTimestamp(rows[0]?.published_at ?? null);
}

// ---------------------------------------------------------------------------------------------
// The checklist with own progress (`06` section 5.5.6)
// ---------------------------------------------------------------------------------------------
export interface ChecklistProgressRow {
  readonly itemId: string;
  readonly state: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly elapsedSeconds: number | null;
  readonly reopenCount: number;
}

/**
 * This student's own progress rows for one assignment, keyed by checklist item.
 *
 * A missing entry is `not_started` with no timestamps, which is why the caller defaults rather than
 * the query inventing a row: `06` section 7.3.2 creates the row on first transition, not on read
 * ("The row is created on first open" applies to `student_assignments`, not to every item).
 */
export async function listOwnChecklistProgress(
  ex: Executor,
  scope: VisibleScope,
  studentId: string,
): Promise<ChecklistProgressRow[]> {
  const rows = await ex<
    {
      checklist_item_id: string;
      state: string;
      started_at: string | null;
      completed_at: string | null;
      elapsed_seconds: number | null;
      reopen_count: number;
    }[]
  >`
    select p.checklist_item_id, p.state, p.started_at, p.completed_at, p.elapsed_seconds,
           p.reopen_count
      from student_checklist_progress p
      join checklist_items ci on ci.id = p.checklist_item_id
      join milestones m on m.id = ci.milestone_id
     where p.student_id = ${studentId}::uuid
       and m.assignment_id = ${scope.assignmentId}::uuid
  `;
  return rows.map((row) => ({
    itemId: row.checklist_item_id,
    state: row.state,
    startedAt: isoTimestamp(row.started_at),
    completedAt: isoTimestamp(row.completed_at),
    elapsedSeconds: row.elapsed_seconds === null ? null : requiredNumber(row.elapsed_seconds),
    reopenCount: requiredNumber(row.reopen_count),
  }));
}

/**
 * The assignment a Checklist item belongs to, or `null` when the item does not exist.
 *
 * **Not gated, on purpose, and it must stay that way.** A transition route addresses an item without
 * its assignment, so it needs the assignment id *before* it can run gate rule G1 -- and it returns
 * only that id, no item text and no assignment content. The gate then runs against it and
 * `findVisibleChecklistItem` decides whether the item is actually visible. Returning content from this
 * function would be the T3 bug; returning one id to feed a guard is not.
 */
export async function findChecklistItemAssignmentId(
  ex: Executor,
  itemId: string,
): Promise<string | null> {
  const rows = await ex<{ assignment_id: string }[]>`
    select m.assignment_id
      from checklist_items ci
      join milestones m on m.id = ci.milestone_id
     where ci.id = ${itemId}::uuid
       and ci.deleted_at is null
     limit 1
  `;
  return rows[0]?.assignment_id ?? null;
}

/**
 * One checklist item, resolved through gate rule G1, for the three transition routes.
 *
 * `null` covers three cases with one answer -- the item does not exist, it is not published, or its
 * milestone's assignment is not the caller's visible scope -- because all three are `NOT_FOUND`
 * (`06` section 5.2 rule 2, trap T3). The result carries the assignment id so a route can prove the
 * item it is about to write belongs to the scope it already gated.
 */
export interface VisibleChecklistItemRef {
  readonly itemId: string;
  readonly assignmentId: string;
  readonly milestoneId: string;
  readonly title: string;
}

export async function findVisibleChecklistItem(
  ex: Executor,
  scope: VisibleScope,
  itemId: string,
): Promise<VisibleChecklistItemRef | null> {
  const rows = await ex<
    { id: string; assignment_id: string; milestone_id: string; title: string }[]
  >`
    select ci.id, m.assignment_id, ci.milestone_id, ci.title
      from checklist_items ci
      join milestones m on m.id = ci.milestone_id
     where ci.id = ${itemId}::uuid
       and m.assignment_id = ${scope.assignmentId}::uuid
       and ci.publication_status = 'PUBLISHED'
       and m.publication_status = 'PUBLISHED'
       and ci.deleted_at is null
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        itemId: row.id,
        assignmentId: row.assignment_id,
        milestoneId: row.milestone_id,
        title: row.title,
      };
}

/** This student's progress row for one item, or `null` when they have never touched it. */
export async function findOwnChecklistProgress(
  ex: Executor,
  studentId: string,
  itemId: string,
): Promise<ChecklistProgressRow | null> {
  const rows = await ex<
    {
      checklist_item_id: string;
      state: string;
      started_at: string | null;
      completed_at: string | null;
      elapsed_seconds: number | null;
      reopen_count: number;
    }[]
  >`
    select checklist_item_id, state, started_at, completed_at, elapsed_seconds, reopen_count
      from student_checklist_progress
     where student_id = ${studentId}::uuid
       and checklist_item_id = ${itemId}::uuid
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        itemId: row.checklist_item_id,
        state: row.state,
        startedAt: isoTimestamp(row.started_at),
        completedAt: isoTimestamp(row.completed_at),
        elapsedSeconds: row.elapsed_seconds === null ? null : requiredNumber(row.elapsed_seconds),
        reopenCount: requiredNumber(row.reopen_count),
      };
}
