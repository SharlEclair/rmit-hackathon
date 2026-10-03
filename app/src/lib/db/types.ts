/**
 * Row types derived from the Drizzle table definitions in `./schema`.
 *
 * **The SQL migration is the schema of record.** `src/lib/db/migrations/0001`-`0010` are what
 * `pnpm db:migrate` applies, what the ledger records by checksum, and what `docs/06` sections 6
 * and 7 specify. These types are inferred from the TypeScript mirror in `./schema.ts`, which
 * follows the SQL; a type here is therefore a statement about what a query may read, not about
 * what the database permits.
 *
 * Naming follows `docs/06` section 6.1 for the tables and the conventional `XxxRow` / `NewXxxRow`
 * pair for the types:
 *
 * - `XxxRow` is `typeof xxx.$inferSelect`: the shape a `SELECT` returns, with every column
 *   present and nullable columns typed as nullable.
 * - `NewXxxRow` is `typeof xxx.$inferInsert`: the shape an `INSERT` accepts, where a column with a
 *   database default is optional and a column with no default is required.
 *
 * Both are structural. Neither carries the CHECK constraints, the partial unique indexes, the
 * deferred foreign keys or the `set_updated_at()` trigger; those live in the SQL and are the
 * reason the SQL is the source of truth. In particular:
 *
 * - `NewXxxRow` does not know that `ck_publication_status` restricts a status, or that
 *   `ck_posts_author_xor` requires exactly one authorship path.
 * - `NewXxxRow` for the analytics tables does not know that `contributor_count >= 5` is the
 *   k-anonymity floor, or that certain columns are prohibited there permanently.
 * - `sourceChunks.searchTsv` is absent from `NewSourceChunkRow`, because it is a stored generated
 *   column the application never writes (`docs/06` section 6.8 rule 1).
 */

import type {
  aiPolicyRules,
  ambiguityFindings,
  analyticsEvents,
  anonIdentities,
  assignmentMetrics,
  assignmentSources,
  assignmentStructures,
  assignments,
  assistantMessages,
  assistantProactiveMessages,
  assistantSessions,
  auditLogs,
  checklistItems,
  courses,
  discussionPosts,
  discussionThreads,
  enrollments,
  faqEntries,
  guardrailLogs,
  ingestionJobs,
  llmCallCounters,
  milestoneMetrics,
  milestoneRequirementLinks,
  milestones,
  moderationFlags,
  queries,
  queryMessages,
  requirementNodes,
  requirementRubricLinks,
  rubricSections,
  sourceChunks,
  studentAssignments,
  studentChecklistProgress,
  studentUploads,
  users,
} from './schema';

// ---------------------------------------------------------------------------------------------
// 06 section 7.1 -- identity and access
// ---------------------------------------------------------------------------------------------

/** `docs/06` 7.1.1 -- class: identity-bearing. */
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/** `docs/06` 7.1.2 -- class: identity-free. */
export type CourseRow = typeof courses.$inferSelect;
export type NewCourseRow = typeof courses.$inferInsert;

/** `docs/06` 7.1.3 -- class: identity-bearing. */
export type EnrollmentRow = typeof enrollments.$inferSelect;
export type NewEnrollmentRow = typeof enrollments.$inferInsert;

// ---------------------------------------------------------------------------------------------
// 06 section 7.2 -- assignment definition
// ---------------------------------------------------------------------------------------------

/** `docs/06` 7.2.1 -- class: identity-free. */
export type AssignmentRow = typeof assignments.$inferSelect;
export type NewAssignmentRow = typeof assignments.$inferInsert;

/** `docs/06` 7.2.2 -- class: identity-free. */
export type AssignmentSourceRow = typeof assignmentSources.$inferSelect;
export type NewAssignmentSourceRow = typeof assignmentSources.$inferInsert;

/** `docs/06` 7.2.3 -- class: identity-free. */
export type SourceChunkRow = typeof sourceChunks.$inferSelect;
export type NewSourceChunkRow = typeof sourceChunks.$inferInsert;

/** `docs/06` 7.2.4 -- class: identity-free. */
export type AssignmentStructureRow = typeof assignmentStructures.$inferSelect;
export type NewAssignmentStructureRow = typeof assignmentStructures.$inferInsert;

/** `docs/06` 7.2.5 -- class: identity-free. */
export type RequirementNodeRow = typeof requirementNodes.$inferSelect;
export type NewRequirementNodeRow = typeof requirementNodes.$inferInsert;

/** `docs/06` 7.2.6 -- class: identity-free. */
export type RubricSectionRow = typeof rubricSections.$inferSelect;
export type NewRubricSectionRow = typeof rubricSections.$inferInsert;

/** `docs/06` 7.2.7 -- class: identity-free. */
export type RequirementRubricLinkRow = typeof requirementRubricLinks.$inferSelect;
export type NewRequirementRubricLinkRow = typeof requirementRubricLinks.$inferInsert;

/** `docs/06` 7.2.8 -- class: identity-free. */
export type MilestoneRequirementLinkRow = typeof milestoneRequirementLinks.$inferSelect;
export type NewMilestoneRequirementLinkRow = typeof milestoneRequirementLinks.$inferInsert;

/** `docs/06` 7.2.9 -- class: identity-free. */
export type MilestoneRow = typeof milestones.$inferSelect;
export type NewMilestoneRow = typeof milestones.$inferInsert;

/** `docs/06` 7.2.10 -- class: identity-free. */
export type ChecklistItemRow = typeof checklistItems.$inferSelect;
export type NewChecklistItemRow = typeof checklistItems.$inferInsert;

/** `docs/06` 7.2.11 -- class: identity-free. */
export type AiPolicyRuleRow = typeof aiPolicyRules.$inferSelect;
export type NewAiPolicyRuleRow = typeof aiPolicyRules.$inferInsert;

/** `docs/06` 7.2.12 -- class: identity-free. */
export type AmbiguityFindingRow = typeof ambiguityFindings.$inferSelect;
export type NewAmbiguityFindingRow = typeof ambiguityFindings.$inferInsert;

// ---------------------------------------------------------------------------------------------
// 06 section 7.3 -- student work
// ---------------------------------------------------------------------------------------------

/** `docs/06` 7.3.1 -- class: identity-bearing, student-facing only. */
export type StudentAssignmentRow = typeof studentAssignments.$inferSelect;
export type NewStudentAssignmentRow = typeof studentAssignments.$inferInsert;

/** `docs/06` 7.3.2 -- class: identity-bearing, student-facing only. */
export type StudentChecklistProgressRow = typeof studentChecklistProgress.$inferSelect;
export type NewStudentChecklistProgressRow = typeof studentChecklistProgress.$inferInsert;

/** `docs/06` 7.3.3 -- class: identity-bearing, student-facing only. */
export type AssistantSessionRow = typeof assistantSessions.$inferSelect;
export type NewAssistantSessionRow = typeof assistantSessions.$inferInsert;

/** `docs/06` 7.3.4 -- class: identity-bearing, student-facing only; never returned to a tutor. */
export type AssistantMessageRow = typeof assistantMessages.$inferSelect;
export type NewAssistantMessageRow = typeof assistantMessages.$inferInsert;

/** `docs/06` 7.3.5 -- class: identity-bearing, student-facing only. */
export type AssistantProactiveMessageRow = typeof assistantProactiveMessages.$inferSelect;
export type NewAssistantProactiveMessageRow = typeof assistantProactiveMessages.$inferInsert;

/** `docs/06` 7.3.6 -- class: identity-bearing, student-facing only. */
export type StudentUploadRow = typeof studentUploads.$inferSelect;
export type NewStudentUploadRow = typeof studentUploads.$inferInsert;

// ---------------------------------------------------------------------------------------------
// 06 section 7.4 -- queries and FAQ
// ---------------------------------------------------------------------------------------------

/** `docs/06` 7.4.1 -- class: identity-bearing (reading A1). */
export type QueryRow = typeof queries.$inferSelect;
export type NewQueryRow = typeof queries.$inferInsert;

/** `docs/06` 7.4.2 -- class: identity-bearing. */
export type QueryMessageRow = typeof queryMessages.$inferSelect;
export type NewQueryMessageRow = typeof queryMessages.$inferInsert;

/** `docs/06` 7.4.4 -- class: identity-free. */
export type FaqEntryRow = typeof faqEntries.$inferSelect;
export type NewFaqEntryRow = typeof faqEntries.$inferInsert;

// ---------------------------------------------------------------------------------------------
// 06 section 7.5 -- discussions
// ---------------------------------------------------------------------------------------------

/** `docs/06` 7.5.1 -- class: pseudonymous. */
export type DiscussionThreadRow = typeof discussionThreads.$inferSelect;
export type NewDiscussionThreadRow = typeof discussionThreads.$inferInsert;

/** `docs/06` 7.5.2 -- class: pseudonymous. */
export type DiscussionPostRow = typeof discussionPosts.$inferSelect;
export type NewDiscussionPostRow = typeof discussionPosts.$inferInsert;

/**
 * `docs/06` 7.5.3 and 4.3 -- class: pseudonymous, and the most restricted table in the schema.
 *
 * Exactly one module may read or write this table (A-ID-2), and no tutor-facing query may join it
 * directly -- author labels come from the `discussion_author_display` view (A-ID-3). The type
 * carries no such restriction, so the discipline is the module boundary and test T-02/T-03.
 */
export type AnonIdentityRow = typeof anonIdentities.$inferSelect;
export type NewAnonIdentityRow = typeof anonIdentities.$inferInsert;

/** `docs/06` 7.5.4 -- class: pseudonymous. */
export type ModerationFlagRow = typeof moderationFlags.$inferSelect;
export type NewModerationFlagRow = typeof moderationFlags.$inferInsert;

// ---------------------------------------------------------------------------------------------
// 06 section 7.6 -- analytics and audit
// ---------------------------------------------------------------------------------------------

/**
 * `docs/06` 7.6.1 -- class: identity-free, append-only.
 *
 * The prohibited-column list is permanent (A-ID-6, 4.7.3). A type cannot enforce it, so the
 * guarantee is the schema plus test T-16: no analytics module's SQL may name `student_id`,
 * `user_id` or `anon_identity_id` outside a `count(distinct ...)` over `subject_ref`.
 */
export type AnalyticsEventRow = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEventRow = typeof analyticsEvents.$inferInsert;

/** `docs/06` 7.6.2 -- class: identity-free, append-only. No MVP endpoint returns this table. */
export type GuardrailLogRow = typeof guardrailLogs.$inferSelect;
export type NewGuardrailLogRow = typeof guardrailLogs.$inferInsert;

/**
 * `docs/06` 7.6.3 -- class: identity-free.
 *
 * Absence is uniform: a bucket below the five-contributor floor produces no row at all, so there
 * is no "suppressed" value to read here (4.7.2).
 */
export type MilestoneMetricRow = typeof milestoneMetrics.$inferSelect;
export type NewMilestoneMetricRow = typeof milestoneMetrics.$inferInsert;

/** `docs/06` 7.6.4 -- class: identity-free. */
export type AssignmentMetricRow = typeof assignmentMetrics.$inferSelect;
export type NewAssignmentMetricRow = typeof assignmentMetrics.$inferInsert;

/**
 * `docs/06` 7.6.5 -- class: identity-bearing (the actor), append-only.
 *
 * Reading A12: `before`/`after` redaction is the writer's duty, not a constraint. The row type
 * accepts any JSON, so nothing here prevents a body or a secret being written; section 7.6.5's
 * permitted/prohibited lists are the contract and the writer enforces it.
 */
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;

// ---------------------------------------------------------------------------------------------
// 06 section 7.7 -- platform jobs and budgets (Phase 2, migration 0011)
// ---------------------------------------------------------------------------------------------

/**
 * `docs/06` 7.7.1 -- class: identity-bearing (the requesting tutor).
 *
 * `status` and `stage` are the two fields the polling response is built from; the
 * `INGESTION_IN_PROGRESS` guard is the partial unique index, so it is not visible here (trap T19).
 */
export type IngestionJobRow = typeof ingestionJobs.$inferSelect;
export type NewIngestionJobRow = typeof ingestionJobs.$inferInsert;

/**
 * `docs/06` 7.7.2 -- class: identity-bearing (a scope key names a session or an upload).
 *
 * One row per budget unit, not per call. `maxCalls` is a snapshot, so a configuration change does
 * not retroactively re-price calls that were already counted (`04` section 5.6).
 */
export type LlmCallCounterRow = typeof llmCallCounters.$inferSelect;
export type NewLlmCallCounterRow = typeof llmCallCounters.$inferInsert;
