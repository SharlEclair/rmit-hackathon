/**
 * Assistant persistence and retrieval: `assistant_sessions`, `assistant_messages`,
 * `assistant_proactive_messages`, `student_assignments`, `guardrail_logs`, and the published-chunk
 * reads the grounding set is built from (`06-DATA-MODEL.md` sections 7.3.3-7.3.6, 7.6.2).
 *
 * **Why one module.** `11` WP-07 requires SQL only under `src/lib/db/queries/**`, and the assistant
 * turn is the only feature in this phase that writes three of its tables in one transaction. A
 * second module writing `assistant_messages` is how two writers disagree about what a row means.
 *
 * **What is deliberately not here.** No `student_uploads` read (that module owns it), no
 * row-shape validation, and no policy algebra. Every read that decides *student visibility* takes a
 * `VisibleScope` from `student-visibility.ts` rather than an assignment id, so a caller cannot
 * retrieve before the G1 gate has run (`06` section 3.4, trap T3). The one exception is
 * `searchSourceChunks`, which takes the assignment id **from** a `VisibleScope` at its call site --
 * see `features/assistant/retrieve.ts`.
 *
 * **Reading the citation columns.** `06` section 7.3.4 gives an assistant message exactly two id
 * arrays: `grounding_chunk_ids` for cited chunks (R4) and `cited_faq_entry_ids` for cited FAQ
 * entries. A citation of kind `milestone`, `checklist_item` or `requirement_node` -- all three are
 * members of `06` section 5.5.9's `AssistantCitation.kind` -- has **no column of its own**. This
 * module records such an id in `grounding_chunk_ids` alongside chunk ids and resolves it by kind at
 * read time (`listCitedArtifacts`), which is the only arrangement in which the transcript can
 * re-render the citations the live turn emitted. The gap is reported rather than papered over: a
 * dedicated column is a `06` change, not a code change.
 *
 * Identity: nothing here selects `users`, and nothing returns a student id to a caller outside this
 * layer. `subject_ref` is the one-way pseudonym from `06` section 4.7.1 and is never recomputed
 * here (`analytics.ts` owns that construction).
 */

import type { Executor } from './courses';
import { isoTimestampRequired } from '../values';

/** How many prior turns the guardrail's session state may see (`05` section 4.4). */
export const GUARDRAIL_SESSION_TURN_LIMIT = 10;

export interface AssistantSessionRow {
  readonly id: string;
  readonly assignmentId: string;
  readonly studentId: string;
  readonly subjectRef: string;
  readonly messageCount: number;
  readonly llmCallCount: number;
}

export async function findAssistantSession(
  ex: Executor,
  studentId: string,
  assignmentId: string,
): Promise<AssistantSessionRow | null> {
  const rows = await ex<
    {
      id: string;
      assignment_id: string;
      student_id: string;
      subject_ref: string;
      message_count: number;
      llm_call_count: number;
    }[]
  >`
    select id, assignment_id, student_id, subject_ref, message_count, llm_call_count
      from assistant_sessions
     where student_id = ${studentId}::uuid and assignment_id = ${assignmentId}::uuid
     limit 1
  `;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    subjectRef: row.subject_ref,
    messageCount: row.message_count,
    llmCallCount: row.llm_call_count,
  };
}

/**
 * Create the session unless it exists, and return the row either way.
 *
 * `UNIQUE (student_id, assignment_id)` (`06` section 7.3.3) is what makes this safe under two
 * concurrent first requests: the loser of the race re-reads and adopts the winner's row, so a turn
 * can never be written against a session that lost an insert.
 */
export async function findOrCreateAssistantSession(
  ex: Executor,
  input: {
    readonly id: string;
    readonly studentId: string;
    readonly assignmentId: string;
    readonly subjectRef: string;
  },
): Promise<AssistantSessionRow> {
  const inserted = await ex<{ id: string }[]>`
    insert into assistant_sessions (id, assignment_id, student_id, subject_ref)
    values (${input.id}::uuid, ${input.assignmentId}::uuid, ${input.studentId}::uuid, ${input.subjectRef})
    on conflict do nothing
    returning id
  `;
  if (inserted.length > 0) {
    const created = await findAssistantSession(ex, input.studentId, input.assignmentId);
    // The insert returned, so the row exists; a null here would mean the caller ran outside a
    // transaction that can see its own write, which is a defect rather than a data state.
    if (created === null) throw new Error('assistant session insert returned but the row is unreadable');
    return created;
  }
  const existing = await findAssistantSession(ex, input.studentId, input.assignmentId);
  if (existing === null) throw new Error('assistant session upsert lost a race it should have adopted');
  return existing;
}

/** Advance the session's own counters. Called inside the same transaction as the message writes. */
export async function bumpAssistantSession(
  ex: Executor,
  input: {
    readonly sessionId: string;
    /** Messages written by this turn (0, 1 or 2). */
    readonly messages: number;
    /** Provider calls this turn: the classifier plus, when it ran, the answer call. */
    readonly llmCalls: number;
  },
): Promise<void> {
  await ex`
    update assistant_sessions
       set message_count = message_count + ${input.messages},
           llm_call_count = llm_call_count + ${input.llmCalls},
           last_message_at = now()
     where id = ${input.sessionId}::uuid
  `;
}

export type AssistantMessageRole = 'student' | 'assistant';

export interface AssistantMessageRow {
  readonly id: string;
  readonly sessionId: string;
  readonly assignmentId: string;
  readonly role: AssistantMessageRole;
  readonly isProactive: boolean;
  readonly body: string;
  readonly verdict: string | null;
  readonly reasonCode: string | null;
  readonly policyRuleId: string | null;
  readonly citedTiers: string[];
  readonly groundingChunkIds: string[];
  readonly citedFaqEntryIds: string[];
  readonly uploadIds: string[];
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly latencyMs: number | null;
  readonly tokenUsage: { inputTokens: number; outputTokens: number } | null;
  readonly createdAt: string;
}

export interface NewAssistantMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly assignmentId: string;
  readonly role: AssistantMessageRole;
  readonly isProactive?: boolean;
  /** Never logged (`06` section 7.3.4). */
  readonly body: string;
  readonly verdict?: string | null;
  readonly reasonCode?: string | null;
  readonly policyRuleId?: string | null;
  readonly citedTiers?: readonly string[];
  readonly groundingChunkIds?: readonly string[];
  readonly citedFaqEntryIds?: readonly string[];
  readonly uploadIds?: readonly string[];
  readonly modelId?: string | null;
  readonly promptVersion?: string | null;
  readonly latencyMs?: number | null;
  readonly tokenUsage?: { readonly inputTokens: number; readonly outputTokens: number } | null;
}

interface AssistantMessageDbRow {
  id: string;
  session_id: string;
  assignment_id: string;
  role: string;
  is_proactive: boolean;
  body: string;
  verdict: string | null;
  reason_code: string | null;
  policy_rule_id: string | null;
  cited_tiers: string[];
  grounding_chunk_ids: string[];
  cited_faq_entry_ids: string[];
  upload_ids: string[];
  model_id: string | null;
  prompt_version: string | null;
  latency_ms: number | null;
  token_usage: { inputTokens?: number; outputTokens?: number } | null;
  created_at: Date | string;
}

function toMessageRow(row: AssistantMessageDbRow): AssistantMessageRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    assignmentId: row.assignment_id,
    role: row.role as AssistantMessageRole,
    isProactive: row.is_proactive,
    body: row.body,
    verdict: row.verdict,
    reasonCode: row.reason_code,
    policyRuleId: row.policy_rule_id,
    citedTiers: row.cited_tiers,
    groundingChunkIds: row.grounding_chunk_ids,
    citedFaqEntryIds: row.cited_faq_entry_ids,
    uploadIds: row.upload_ids,
    modelId: row.model_id,
    promptVersion: row.prompt_version,
    latencyMs: row.latency_ms,
    tokenUsage:
      row.token_usage === null
        ? null
        : {
            inputTokens: Number(row.token_usage.inputTokens ?? 0),
            outputTokens: Number(row.token_usage.outputTokens ?? 0),
          },
    createdAt: isoTimestampRequired(row.created_at),
  };
}

export async function insertAssistantMessage(
  ex: Executor,
  message: NewAssistantMessage,
): Promise<AssistantMessageRow> {
  const rows = await ex<AssistantMessageDbRow[]>`
    insert into assistant_messages (
      id, session_id, assignment_id, role, is_proactive, body, verdict, reason_code,
      policy_rule_id, cited_tiers, grounding_chunk_ids, cited_faq_entry_ids, upload_ids,
      model_id, prompt_version, latency_ms, token_usage
    )
    values (
      ${message.id}::uuid,
      ${message.sessionId}::uuid,
      ${message.assignmentId}::uuid,
      ${message.role},
      ${message.isProactive ?? false},
      ${message.body},
      ${message.verdict ?? null},
      ${message.reasonCode ?? null},
      ${message.policyRuleId ?? null}::uuid,
      ${message.citedTiers === undefined ? [] : [...message.citedTiers]},
      ${message.groundingChunkIds === undefined ? [] : [...message.groundingChunkIds]}::uuid[],
      ${message.citedFaqEntryIds === undefined ? [] : [...message.citedFaqEntryIds]}::uuid[],
      ${message.uploadIds === undefined ? [] : [...message.uploadIds]}::uuid[],
      ${message.modelId ?? null},
      ${message.promptVersion ?? null},
      ${message.latencyMs ?? null},
      ${message.tokenUsage === undefined || message.tokenUsage === null
        ? null
        : JSON.stringify(message.tokenUsage)}::jsonb
    )
    returning id, session_id, assignment_id, role, is_proactive, body, verdict, reason_code,
              policy_rule_id, cited_tiers, grounding_chunk_ids, cited_faq_entry_ids, upload_ids,
              model_id, prompt_version, latency_ms, token_usage, created_at
  `;
  const row = rows[0];
  if (row === undefined) throw new Error('assistant message insert returned no row');
  return toMessageRow(row);
}

/** The transcript, oldest first. Soft-deleted rows are the student's cleared turns (07 section 4.7). */
export async function listAssistantMessages(
  ex: Executor,
  sessionId: string,
): Promise<AssistantMessageRow[]> {
  const rows = await ex<AssistantMessageDbRow[]>`
    select id, session_id, assignment_id, role, is_proactive, body, verdict, reason_code,
           policy_rule_id, cited_tiers, grounding_chunk_ids, cited_faq_entry_ids, upload_ids,
           model_id, prompt_version, latency_ms, token_usage, created_at
      from assistant_messages
     where session_id = ${sessionId}::uuid and deleted_at is null
     order by created_at asc, id asc
  `;
  return rows.map(toMessageRow);
}

/** One message by id, soft-deleted rows included as absent. */
export async function findAssistantMessage(
  ex: Executor,
  messageId: string,
): Promise<AssistantMessageRow | null> {
  const rows = await ex<AssistantMessageDbRow[]>`
    select id, session_id, assignment_id, role, is_proactive, body, verdict, reason_code,
           policy_rule_id, cited_tiers, grounding_chunk_ids, cited_faq_entry_ids, upload_ids,
           model_id, prompt_version, latency_ms, token_usage, created_at
      from assistant_messages
     where id = ${messageId}::uuid and deleted_at is null
     limit 1
  `;
  const row = rows[0];
  return row === undefined ? null : toMessageRow(row);
}

/**
 * Prior student turns for `SessionState` (`05` section 4.4).
 *
 * **`rules` is always empty, and that is a schema limit, not an oversight.** No column on
 * `assistant_messages` stores the platform rule ids of a past decision, and `05` section 8.1 keeps
 * `rules` on Table B (the operational log), which `guardrail_logs` (section 7.6.2) deliberately does
 * not carry. So a replay of L1-L3 sees the verdicts and the turns but not the earlier rules. This is
 * reported as a data-model gap; inventing a rules array here would be a fabricated audit trail.
 */
export async function listAssistantSessionTurns(
  ex: Executor,
  sessionId: string,
  limit: number = GUARDRAIL_SESSION_TURN_LIMIT,
): Promise<Array<{ turnId: string; text: string; verdict: string; rules: string[] }>> {
  const rows = await ex<
    { id: string; body: string; verdict: string }[]
  >`
    select id, body, verdict
      from assistant_messages
     where session_id = ${sessionId}::uuid
       and role = 'student'
       and verdict is not null
       and deleted_at is null
     order by created_at desc, id desc
     limit ${limit}
  `;
  return rows
    .map((row) => ({ turnId: row.id, text: row.body, verdict: row.verdict, rules: [] as string[] }))
    .reverse();
}

export interface NewGuardrailLog {
  readonly assignmentId: string;
  readonly assistantSessionId: string;
  readonly assistantMessageId: string | null;
  readonly subjectRef: string;
  readonly verdict: string;
  readonly reasonCode: string;
  readonly policyRuleId: string | null;
  readonly citedTiers: readonly string[];
  readonly modelId: string | null;
  readonly promptVersion: string;
  readonly latencyMs: number | null;
}

/**
 * The durable audit row of `05` section 8.1 Table A / `06` section 7.6.2.
 *
 * **Decision fields only.** The table has no content column and this writer has no content field,
 * so no path here can log a student turn (C7, `N4`). The turn's hash is not stored either: section
 * 7.6.2 does not have a column for it, and inventing one is a `06` change.
 */
export async function insertGuardrailLog(ex: Executor, log: NewGuardrailLog): Promise<void> {
  await ex`
    insert into guardrail_logs (
      assignment_id, assistant_session_id, assistant_message_id, subject_ref, verdict,
      reason_code, policy_rule_id, cited_tiers, model_id, prompt_version, latency_ms
    )
    values (
      ${log.assignmentId}::uuid,
      ${log.assistantSessionId}::uuid,
      ${log.assistantMessageId}::uuid,
      ${log.subjectRef},
      ${log.verdict},
      ${log.reasonCode},
      ${log.policyRuleId}::uuid,
      ${[...log.citedTiers]},
      ${log.modelId},
      ${log.promptVersion},
      ${log.latencyMs}
    )
  `;
}

export async function findStudentAssignmentId(
  ex: Executor,
  studentId: string,
  assignmentId: string,
): Promise<string | null> {
  const rows = await ex<{ id: string }[]>`
    select id
      from student_assignments
     where student_id = ${studentId}::uuid and assignment_id = ${assignmentId}::uuid
     limit 1
  `;
  return rows[0]?.id ?? null;
}

/**
 * The per-student rollup row, created on first open (`06` section 7.3.1).
 *
 * `first_opened_at` is set on insert only: a later visit must not rewrite the moment the student
 * first saw the assignment.
 */
export async function findOrCreateStudentAssignment(
  ex: Executor,
  input: { readonly id: string; readonly studentId: string; readonly assignmentId: string },
): Promise<string> {
  const inserted = await ex<{ id: string }[]>`
    insert into student_assignments (id, assignment_id, student_id, first_opened_at, last_activity_at)
    values (
      ${input.id}::uuid,
      ${input.assignmentId}::uuid,
      ${input.studentId}::uuid,
      now(),
      now()
    )
    on conflict do nothing
    returning id
  `;
  const created = inserted[0];
  if (created !== undefined) return created.id;

  const existing = await findStudentAssignmentId(ex, input.studentId, input.assignmentId);
  if (existing === null) throw new Error('student assignment upsert lost a race it should have adopted');
  return existing;
}

/**
 * Completed published Checklist items for one student on one assignment.
 *
 * Counted from `student_checklist_progress` rather than read from
 * `student_assignments.completed_item_count`: the denormalised counter is `06` section 7.3.1's
 * reading A10 and nothing maintains it until the checklist routes of WP-07 land, so reading it
 * would report 0 for a student who has completed items.
 */
export async function countCompletedChecklistItems(
  ex: Executor,
  studentAssignmentId: string,
): Promise<number> {
  const rows = await ex<{ total: number }[]>`
    select count(*)::int as total
      from student_checklist_progress
     where student_assignment_id = ${studentAssignmentId}::uuid
       and state = 'completed'
  `;
  return rows[0]?.total ?? 0;
}

export interface ProactiveNoticeRow {
  readonly id: string;
  readonly studentAssignmentId: string;
  readonly milestoneId: string;
  readonly assistantMessageId: string;
  readonly deliveredAt: string;
  readonly dismissedAt: string | null;
}

interface ProactiveNoticeDbRow {
  id: string;
  student_assignment_id: string;
  milestone_id: string;
  assistant_message_id: string;
  delivered_at: Date | string;
  dismissed_at: Date | string | null;
}

function toNoticeRow(row: ProactiveNoticeDbRow): ProactiveNoticeRow {
  return {
    id: row.id,
    studentAssignmentId: row.student_assignment_id,
    milestoneId: row.milestone_id,
    assistantMessageId: row.assistant_message_id,
    deliveredAt: isoTimestampRequired(row.delivered_at),
    dismissedAt: row.dismissed_at === null ? null : isoTimestampRequired(row.dismissed_at),
  };
}

export async function findProactiveNotice(
  ex: Executor,
  studentAssignmentId: string,
  milestoneId: string,
): Promise<ProactiveNoticeRow | null> {
  const rows = await ex<ProactiveNoticeDbRow[]>`
    select id, student_assignment_id, milestone_id, assistant_message_id, delivered_at, dismissed_at
      from assistant_proactive_messages
     where student_assignment_id = ${studentAssignmentId}::uuid
       and milestone_id = ${milestoneId}::uuid
     limit 1
  `;
  const row = rows[0];
  return row === undefined ? null : toNoticeRow(row);
}

/**
 * The notice plus the assignment it belongs to, so the dismiss route can run the student guard.
 *
 * The dismiss path (06 section 5.4) carries no assignment id, and every student route must still
 * pass `guardStudentVisibleAssignment`. Resolving the notice first and taking the assignment id from
 * it is the same shape as `guardTutorArtifact`, and it is the only version in which the guard is not
 * weakened to keep a path convenient.
 */
export async function findProactiveNoticeContext(
  ex: Executor,
  noticeId: string,
): Promise<{ notice: ProactiveNoticeRow; studentId: string; assignmentId: string } | null> {
  const rows = await ex<(ProactiveNoticeDbRow & { student_id: string; assignment_id: string })[]>`
    select p.id, p.student_assignment_id, p.milestone_id, p.assistant_message_id,
           p.delivered_at, p.dismissed_at, sa.student_id, sa.assignment_id
      from assistant_proactive_messages p
      join student_assignments sa on sa.id = p.student_assignment_id
     where p.id = ${noticeId}::uuid
     limit 1
  `;
  const row = rows[0];
  if (row === undefined) return null;
  return { notice: toNoticeRow(row), studentId: row.student_id, assignmentId: row.assignment_id };
}

/**
 * Deliver the one permitted notice for this milestone, or report that it was already delivered.
 *
 * `UNIQUE (student_assignment_id, milestone_id)` (`06` section 7.3.5, O2) is the once-only
 * guarantee, so this is a plain `on conflict do nothing`: `null` means another request won and the
 * caller must serve the stored notice rather than assemble a second one.
 */
export async function insertProactiveNoticeIfAbsent(
  ex: Executor,
  input: {
    readonly id: string;
    readonly studentAssignmentId: string;
    readonly milestoneId: string;
    readonly assistantMessageId: string;
  },
): Promise<ProactiveNoticeRow | null> {
  const rows = await ex<ProactiveNoticeDbRow[]>`
    insert into assistant_proactive_messages (
      id, student_assignment_id, milestone_id, assistant_message_id
    )
    values (
      ${input.id}::uuid,
      ${input.studentAssignmentId}::uuid,
      ${input.milestoneId}::uuid,
      ${input.assistantMessageId}::uuid
    )
    on conflict do nothing
    returning id, student_assignment_id, milestone_id, assistant_message_id, delivered_at, dismissed_at
  `;
  const row = rows[0];
  return row === undefined ? null : toNoticeRow(row);
}

/** Set `dismissed_at` once. Returns null when the notice was already dismissed (a 409 at the route). */
export async function dismissProactiveNotice(
  ex: Executor,
  noticeId: string,
): Promise<ProactiveNoticeRow | null> {
  const rows = await ex<ProactiveNoticeDbRow[]>`
    update assistant_proactive_messages
       set dismissed_at = now()
     where id = ${noticeId}::uuid and dismissed_at is null
     returning id, student_assignment_id, milestone_id, assistant_message_id, delivered_at, dismissed_at
  `;
  const row = rows[0];
  return row === undefined ? null : toNoticeRow(row);
}

export interface RetrievedChunk {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceKind: string;
  readonly text: string;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly sectionLabel: string | null;
}

/**
 * Full-text search over an assignment's chunks (D38, `04` section 6).
 *
 * `plainto_tsquery` is used rather than `to_tsquery` so a raw student turn cannot be a syntax error
 * and cannot become an operator-constructed query. A stop-word-only turn yields an empty tsquery, so
 * the result is empty rather than an error -- `features/assistant/retrieve.ts` then falls back to
 * the stable T1 order, because "no keyword match" must not mean "no grounding".
 *
 * Every row is an actual source chunk of an active source of this assignment. `published only` is
 * enforced one level up: the assignment id handed to this function can only come from a
 * `VisibleScope`, which G1 produces.
 */
export async function searchSourceChunks(
  ex: Executor,
  input: {
    readonly assignmentId: string;
    readonly query: string;
    readonly limit: number;
  },
): Promise<RetrievedChunk[]> {
  const rows = await ex<
    {
      id: string;
      source_id: string;
      source_kind: string;
      text: string;
      page_from: number | null;
      page_to: number | null;
      section_label: string | null;
    }[]
  >`
    select c.id, c.source_id, s.kind as source_kind, c.text,
           c.page_from, c.page_to, c.section_label
      from source_chunks c
      join assignment_sources s on s.id = c.source_id
     where c.assignment_id = ${input.assignmentId}::uuid
       and s.deleted_at is null
       and to_tsvector('english', c.text) @@ plainto_tsquery('english', ${input.query})
     order by ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', ${input.query})) desc,
              c.chunk_index asc
     limit ${input.limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceKind: row.source_kind,
    text: row.text,
    pageFrom: row.page_from,
    pageTo: row.page_to,
    sectionLabel: row.section_label,
  }));
}

export interface CitedArtifact {
  readonly id: string;
  readonly kind: 'source_chunk' | 'faq_entry' | 'milestone' | 'checklist_item' | 'requirement_node';
  readonly sourceKind: string | null;
  readonly title: string | null;
  readonly text: string | null;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly sectionLabel: string | null;
}

/**
 * Resolve stored citation ids back to their artifacts, by kind.
 *
 * Five literals rather than one `union`: the five tables have different columns, and a union would
 * project every kind onto one row shape and lose the page anchor the citation label needs. The
 * order of the result follows the requested ids, because a transcript's citation order is part of
 * what the reader saw.
 */
export async function listCitedArtifacts(
  ex: Executor,
  chunkIds: readonly string[],
  faqEntryIds: readonly string[],
): Promise<CitedArtifact[]> {
  const found = new Map<string, CitedArtifact>();

  if (chunkIds.length > 0) {
    const ids = [...chunkIds];
    const chunks = await ex<
      {
        id: string;
        source_kind: string;
        text: string;
        page_from: number | null;
        page_to: number | null;
        section_label: string | null;
      }[]
    >`
      select c.id, s.kind as source_kind, c.text, c.page_from, c.page_to, c.section_label
        from source_chunks c
        join assignment_sources s on s.id = c.source_id
       where c.id = any(${ids}::uuid[])
    `;
    for (const row of chunks) {
      found.set(row.id, {
        id: row.id,
        kind: 'source_chunk',
        sourceKind: row.source_kind,
        title: null,
        text: row.text,
        pageFrom: row.page_from,
        pageTo: row.page_to,
        sectionLabel: row.section_label,
      });
    }

    const requirements = await ex<
      {
        id: string;
        title: string;
        verbatim_text: string;
        source_page: number | null;
        source_section_label: string | null;
        page_from: number | null;
        page_to: number | null;
        source_kind: string;
      }[]
    >`
      select r.id, r.title, r.verbatim_text, r.source_page, r.source_section_label,
             c.page_from, c.page_to, s.kind as source_kind
        from requirement_nodes r
        join source_chunks c on c.id = r.source_chunk_id
        join assignment_sources s on s.id = c.source_id
       where r.id = any(${ids}::uuid[])
    `;
    for (const row of requirements) {
      found.set(row.id, {
        id: row.id,
        kind: 'requirement_node',
        sourceKind: row.source_kind,
        title: row.title,
        text: row.verbatim_text,
        pageFrom: row.source_page ?? row.page_from,
        pageTo: row.page_to,
        sectionLabel: row.source_section_label,
      });
    }

    const milestones = await ex<{ id: string; title: string; summary: string | null }[]>`
      select id, title, summary from milestones where id = any(${ids}::uuid[])
    `;
    for (const row of milestones) {
      found.set(row.id, {
        id: row.id,
        kind: 'milestone',
        sourceKind: null,
        title: row.title,
        text: row.summary,
        pageFrom: null,
        pageTo: null,
        sectionLabel: null,
      });
    }

    const items = await ex<{ id: string; title: string; description: string | null }[]>`
      select id, title, description from checklist_items where id = any(${ids}::uuid[])
    `;
    for (const row of items) {
      found.set(row.id, {
        id: row.id,
        kind: 'checklist_item',
        sourceKind: null,
        title: row.title,
        text: row.description,
        pageFrom: null,
        pageTo: null,
        sectionLabel: null,
      });
    }
  }

  if (faqEntryIds.length > 0) {
    const ids = [...faqEntryIds];
    const entries = await ex<{ id: string; question: string; answer: string }[]>`
      select id, question, answer from faq_entries where id = any(${ids}::uuid[])
    `;
    for (const row of entries) {
      found.set(row.id, {
        id: row.id,
        kind: 'faq_entry',
        sourceKind: null,
        title: row.question,
        text: row.answer,
        pageFrom: null,
        pageTo: null,
        sectionLabel: null,
      });
    }
  }

  const ordered: CitedArtifact[] = [];
  for (const id of [...chunkIds, ...faqEntryIds]) {
    const artifact = found.get(id);
    if (artifact !== undefined) ordered.push(artifact);
  }
  return ordered;
}

export interface MilestoneRequirement {
  readonly id: string;
  readonly title: string;
  readonly verbatimText: string;
  readonly sourceKind: string;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly sectionLabel: string | null;
}

/**
 * The published requirements linked to one published Milestone, for the proactive notice (O2).
 *
 * `milestone_requirement_links` is the association the notice needs: a bullet that quotes the brief
 * must be a requirement the tutor approved *for this milestone*, not a chunk that happens to share a
 * word with its title. `r.publication_status = 'PUBLISHED'` is the same gate every other
 * student-visible read applies, and the structure id comes from the caller's `VisibleScope`.
 */
export async function listMilestoneRequirements(
  ex: Executor,
  input: {
    readonly assignmentId: string;
    readonly structureId: string;
    readonly milestoneId: string;
  },
): Promise<MilestoneRequirement[]> {
  const rows = await ex<
    {
      id: string;
      title: string;
      verbatim_text: string;
      source_kind: string;
      page_from: number | null;
      page_to: number | null;
      section_label: string | null;
    }[]
  >`
    select r.id, r.title, r.verbatim_text, s.kind as source_kind,
           c.page_from, c.page_to, r.source_section_label as section_label
      from milestone_requirement_links l
      join requirement_nodes r on r.id = l.requirement_node_id
      join source_chunks c on c.id = r.source_chunk_id
      join assignment_sources s on s.id = c.source_id
     where l.assignment_id = ${input.assignmentId}::uuid
       and l.milestone_id = ${input.milestoneId}::uuid
       and r.structure_id = ${input.structureId}::uuid
       and r.publication_status = 'PUBLISHED'
       and s.deleted_at is null
     order by r.display_order asc
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    verbatimText: row.verbatim_text,
    sourceKind: row.source_kind,
    pageFrom: row.page_from,
    pageTo: row.page_to,
    sectionLabel: row.section_label,
  }));
}
