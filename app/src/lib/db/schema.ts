/**
 * Drizzle table definitions for typed queries.
 *
 * **The SQL migration files are the schema of record.** `src/lib/db/migrations/0001`-`0010` are
 * what `pnpm db:migrate` applies, what the ledger records by checksum, and what `docs/06` sections
 * 6 and 7 specify. This file is a TypeScript mirror of those tables so the query layer is typed
 * (`04` S2.1: Drizzle ORM 0.45.3 over the `postgres` driver, decision D74). It is not the schema
 * and it is never executed.
 *
 * Consequence, stated plainly so nobody "fixes" it: a change that lands only here does nothing.
 * Column and table changes are migrations; this file follows them.
 *
 * What this file deliberately does **not** express, because it exists for typed queries only and
 * Drizzle cannot carry these faithfully:
 *
 * 1. **The CHECK constraints.** `docs/06` section 6.3 is normative: enum-ish columns are `text`
 *    plus a named CHECK, never `create type ... as enum`. There are no `pgEnum` definitions here
 *    for that reason, and the CHECKs -- approval stamps, the k-anonymity floors, the
 *    `ck_posts_author_xor` anonymity invariant -- live in the SQL alone.
 * 2. **Indexes, including the partial unique indexes** (trap T19: `unique ... where deleted_at is
 *    null` is an index, never an inline `UNIQUE`). Section 6.6 says "No speculative indexes", and
 *    the full inventory is in the migration files.
 * 3. **Foreign keys, including the two deferred circular ones** (`fk_assignments_current_structure`
 *    and `fk_discussion_threads_first_post`, the latter `DEFERRABLE INITIALLY DEFERRED`) and the
 *    six composite `(structure_id, assignment_id)` FKs. Restating them here as ordinary Drizzle
 *    references would lose `DEFERRABLE` and could tempt a future `drizzle-kit` comparison into
 *    "fixing" the database away from the SQL of record.
 * 4. **The two views** (`discussion_author_display`, `v_rubric_milestone_edges`) and the
 *    `set_updated_at()` trigger plus its 33 triggers.
 * 5. **`source_chunks.embedding`.** Decision A14: it is absent from the base schema and arrives by
 *    an optional migration under `migrations/optional/`, so it must not appear here either.
 *
 * A row type from this file therefore describes what a query may read, not what the database
 * permits. Validation and invariants belong to the SQL and to the validators named in `docs/06`.
 *
 * The three standard columns of `docs/06` section 6.2 (`id`, `created_at`, `updated_at`) are
 * written out per table rather than shared through a helper. A helper returning a column builder
 * makes each table's inferred row type depend on the helper's return type, which is where
 * Drizzle's `$inferSelect`/`$inferInsert` inference tends to degrade; the explicit form is
 * boring, verified by `pnpm typecheck`, and costs only repetition.
 */

import {
  boolean,
  customType,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `bytea`. Drizzle's `pg-core` has no first-class binary column, so `anon_identities.pseudonym_hmac`
 * -- `HMAC_SHA256(ANON_ID_SECRET, ...)`, stored for audit and reproducibility (`docs/06` section
 * 4.2 fact 6) -- is one of the two custom types in this file.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * `tsvector`. Read-only in the application: `source_chunks.search_tsv` is a stored generated
 * column, `to_tsvector('english', text)`, and section 6.8 rule 1 says "Ingestion never writes it".
 *
 * The column is declared `not null` because that is what the database has, so the select type has
 * it always present. Writing it is impossible through this layer: `$type<never>()` makes the
 * insert type `never`, so an INSERT that names `searchTsv` is a TypeScript error rather than a
 * runtime "cannot insert into column search_tsv" from Postgres.
 */
const tsvector = customType<{ data: string; driverData: string }>({ dataType: () => 'tsvector' });

// ---------------------------------------------------------------------------------------------
// 0002_identity.sql -- 06 section 7.1
// ---------------------------------------------------------------------------------------------

/** `docs/06` 7.1.1 -- class: identity-bearing. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  /** argon2id. Never selected outside the auth module and never serialised (I-7). */
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.1.2 -- class: identity-free. */
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  term: text('term').notNull(),
  createdByUserId: uuid('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.1.3 -- class: identity-bearing. */
export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull(),
  userId: uuid('user_id').notNull(),
  roleInCourse: text('role_in_course').notNull(),
  isOwner: boolean('is_owner').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// 0003_assignment_sources.sql -- 06 section 7.2.1-7.2.3
// ---------------------------------------------------------------------------------------------

/** `docs/06` 7.2.1 -- class: identity-free. */
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull(),
  title: text('title').notNull(),
  /** A different field from `publication_status`; the two are never interchangeable (3.6). */
  status: text('status').notNull().default('draft'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').notNull(),
  /** Maintained alongside `is_current`. The FK is added by 0004 (circular; spec 0.4). */
  currentStructureId: uuid('current_structure_id'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.2.2 -- class: identity-free. */
export const assignmentSources = pgTable('assignment_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  uploadedByUserId: uuid('uploaded_by_user_id').notNull(),
  kind: text('kind').notNull(),
  originalFilename: text('original_filename').notNull(),
  /** Opaque and driver-relative; never returned by an API (I-7, 6.9 rule 2). */
  storageKey: text('storage_key').notNull(),
  /**
   * The O5/D57 set: PDF, DOCX, PPTX, PNG, JPEG, plain text and Markdown. Section 7.2.2's prose
   * CHECK is the stale side of that conflict (handoff I-17); the migration comment records it.
   */
  mimeType: text('mime_type').notNull(),
  /**
   * `bigint` in the database, mapped through `numeric(20, 0)` with `mode: 'bigint'`.
   *
   * Drizzle 0.45.3 types `bigint` as `number | bigint` and has no string mode, and a byte count
   * as a JS `number` is a silent-precision trap. `numeric(name, { precision: 20, scale: 0 })`
   * emits the same `bigint` column type while the mapping stays lossless: the driver hands back a
   * string and this layer converts it to `bigint`.
   */
  byteSize: numeric('byte_size', { precision: 20, scale: 0, mode: 'bigint' }).notNull(),
  pageCount: integer('page_count'),
  /** SHA-256 of the stored bytes, 64 hex characters. */
  contentHash: text('content_hash').notNull(),
  extractionStatus: text('extraction_status').notNull().default('pending'),
  extractionError: text('extraction_error'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.2.3 -- class: identity-free. */
export const sourceChunks = pgTable('source_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  sourceId: uuid('source_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  /** Verbatim extract, never rewritten (R2). */
  text: text('text').notNull(),
  pageFrom: integer('page_from'),
  pageTo: integer('page_to'),
  sectionLabel: text('section_label'),
  charCount: integer('char_count').notNull(),
  /** Generated, stored, and never written by the application (6.8 rule 1). Read-only. */
  searchTsv: tsvector('search_tsv').$type<never>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// 0004_structure.sql -- 06 section 7.2.4-7.2.12
// ---------------------------------------------------------------------------------------------

/** `docs/06` 7.2.4 -- class: identity-free. */
export const assignmentStructures = pgTable('assignment_structures', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  version: integer('version').notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  publicationStatus: text('publication_status').notNull().default('AI_GENERATED'),
  origin: text('origin').notNull().default('ai'),
  provenance: jsonb('provenance'),
  groundingChunkIds: uuid('grounding_chunk_ids').array().notNull().default([]),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.2.5 -- class: identity-free. */
export const requirementNodes = pgTable('requirement_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  structureId: uuid('structure_id').notNull(),
  parentRequirementNodeId: uuid('parent_requirement_node_id'),
  /** A label, not the requirement text. */
  title: text('title').notNull(),
  /** T1 and immutable after insert; must be a substring of the cited chunk text (I-2, R2). */
  verbatimText: text('verbatim_text').notNull(),
  sourceChunkId: uuid('source_chunk_id').notNull(),
  sourcePage: integer('source_page'),
  sourceSectionLabel: text('source_section_label'),
  /** AI interpretation, T5, rendered only in the Map surface. */
  mapSummary: text('map_summary'),
  displayOrder: integer('display_order').notNull(),
  publicationStatus: text('publication_status').notNull().default('AI_GENERATED'),
  origin: text('origin').notNull().default('ai'),
  provenance: jsonb('provenance'),
  groundingChunkIds: uuid('grounding_chunk_ids').array().notNull().default([]),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.2.6 -- class: identity-free. */
export const rubricSections = pgTable('rubric_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  structureId: uuid('structure_id').notNull(),
  sourceChunkId: uuid('source_chunk_id').notNull(),
  sectionLabel: text('section_label').notNull(),
  criteriaText: text('criteria_text').notNull(),
  weightPercent: numeric('weight_percent', { precision: 5, scale: 2 }),
  pageFrom: integer('page_from'),
  pageTo: integer('page_to'),
  mapInterpretation: text('map_interpretation'),
  displayOrder: integer('display_order').notNull(),
  publicationStatus: text('publication_status').notNull().default('AI_GENERATED'),
  origin: text('origin').notNull().default('ai'),
  provenance: jsonb('provenance'),
  groundingChunkIds: uuid('grounding_chunk_ids').array().notNull().default([]),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.2.7 -- class: identity-free.
 *
 * No `publication_status`: an edge renders only when both endpoints are PUBLISHED (7.2.7, 5.5.5).
 */
export const requirementRubricLinks = pgTable('requirement_rubric_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  requirementNodeId: uuid('requirement_node_id').notNull(),
  rubricSectionId: uuid('rubric_section_id').notNull(),
  /** null means AI-proposed. */
  createdByUserId: uuid('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.2.8 -- class: identity-free. */
export const milestoneRequirementLinks = pgTable('milestone_requirement_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  requirementNodeId: uuid('requirement_node_id').notNull(),
  milestoneId: uuid('milestone_id').notNull(),
  /** null means AI-proposed. */
  createdByUserId: uuid('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.2.9 -- class: identity-free. */
export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  structureId: uuid('structure_id').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  displayOrder: integer('display_order').notNull(),
  publicationStatus: text('publication_status').notNull().default('AI_GENERATED'),
  origin: text('origin').notNull().default('ai'),
  provenance: jsonb('provenance'),
  groundingChunkIds: uuid('grounding_chunk_ids').array().notNull().default([]),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.2.10 -- class: identity-free. */
export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  structureId: uuid('structure_id').notNull(),
  milestoneId: uuid('milestone_id').notNull(),
  title: text('title').notNull(),
  planningLevel: text('planning_level').notNull(),
  description: text('description'),
  displayOrder: integer('display_order').notNull(),
  publicationStatus: text('publication_status').notNull().default('AI_GENERATED'),
  origin: text('origin').notNull().default('ai'),
  provenance: jsonb('provenance'),
  groundingChunkIds: uuid('grounding_chunk_ids').array().notNull().default([]),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.2.11 -- class: identity-free. */
export const aiPolicyRules = pgTable('ai_policy_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  structureId: uuid('structure_id').notNull(),
  ruleCode: text('rule_code').notNull(),
  /** Tutor-approved wording, quoted verbatim in a refusal. */
  ruleText: text('rule_text').notNull(),
  effect: text('effect').notNull(),
  appliesTo: text('applies_to').notNull(),
  sourceChunkId: uuid('source_chunk_id'),
  /** Reading A4: no uniqueness and no range check, deliberately, per section 7.2.11. */
  displayOrder: integer('display_order').notNull(),
  publicationStatus: text('publication_status').notNull().default('AI_GENERATED'),
  origin: text('origin').notNull().default('ai'),
  provenance: jsonb('provenance'),
  groundingChunkIds: uuid('grounding_chunk_ids').array().notNull().default([]),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.2.12 -- class: identity-free.
 *
 * Reading A5: a plain `structure_id` FK, no `grounding_chunk_ids`, no approval stamps, and no
 * `proposed_clarification` column -- ever (D23, C2).
 */
export const ambiguityFindings = pgTable('ambiguity_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  structureId: uuid('structure_id').notNull(),
  sourceId: uuid('source_id'),
  kind: text('kind').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  locatedPage: integer('located_page'),
  locatedSectionLabel: text('located_section_label'),
  excerptA: text('excerpt_a').notNull(),
  excerptB: text('excerpt_b'),
  sourceChunkIds: uuid('source_chunk_ids').array().notNull(),
  status: text('status').notNull().default('open'),
  /** FK to `faq_entries`; added by 0006 because that table cannot exist in 0004. */
  resolutionFaqEntryId: uuid('resolution_faq_entry_id'),
  resolvedByUserId: uuid('resolved_by_user_id'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  /** `origin = 'ai'` only (7.2.12). */
  origin: text('origin').notNull().default('ai'),
  provenance: jsonb('provenance'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// 0005_student_work.sql -- 06 section 7.3.1-7.3.6
// ---------------------------------------------------------------------------------------------

/**
 * `docs/06` 7.3.1 -- class: identity-bearing, student-facing only.
 *
 * No tutor endpoint in section 5 returns this table (4.7.4). Reading A8: no revision column.
 */
export const studentAssignments = pgTable('student_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  studentId: uuid('student_id').notNull(),
  firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  completedItemCount: integer('completed_item_count').notNull().default(0),
  /** Reading A10: counts published items of the current structure with `deleted_at is null`. */
  totalItemCount: integer('total_item_count').notNull().default(0),
  resolutionRate: numeric('resolution_rate', { precision: 5, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.3.2 -- class: identity-bearing, student-facing only.
 *
 * D48: `elapsed_seconds` is the first start-to-complete interval. Reopening increments
 * `reopen_count` and moves `last_state_changed_at`; it does not extend `elapsed_seconds`.
 */
export const studentChecklistProgress = pgTable('student_checklist_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentAssignmentId: uuid('student_assignment_id').notNull(),
  studentId: uuid('student_id').notNull(),
  checklistItemId: uuid('checklist_item_id').notNull(),
  state: text('state').notNull().default('not_started'),
  /** The first start, immutable once set. */
  startedAt: timestamp('started_at', { withTimezone: true }),
  /** The FIRST completion (D48), immutable once set. */
  completedAt: timestamp('completed_at', { withTimezone: true }),
  elapsedSeconds: integer('elapsed_seconds'),
  reopenCount: integer('reopen_count').notNull().default(0),
  lastStateChangedAt: timestamp('last_state_changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.3.3 -- class: identity-bearing, student-facing only.
 *
 * `subject_ref` is the 4.7.1 analytics pseudonym: domain-separated from the discussion pseudonym,
 * one-way, and used only inside `count(distinct ...)` and in `guardrail_logs`.
 */
export const assistantSessions = pgTable('assistant_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  studentId: uuid('student_id').notNull(),
  subjectRef: text('subject_ref').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  messageCount: integer('message_count').notNull().default(0),
  llmCallCount: integer('llm_call_count').notNull().default(0),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.3.4 -- class: identity-bearing, student-facing only, and never returned to a tutor.
 *
 * `tokenUsage` has no declared inner shape here: the SQL CHECK (reading A15) enforces only
 * `jsonb_typeof(...) = 'object'`, and section 7.3.4 documents the payload as
 * `{"inputTokens":int,"outputTokens":int}`. Narrowing it in TypeScript beyond what the database
 * enforces would be a promise this layer does not keep.
 */
export const assistantMessages = pgTable('assistant_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull(),
  assignmentId: uuid('assignment_id').notNull(),
  role: text('role').notNull(),
  isProactive: boolean('is_proactive').notNull().default(false),
  /** Never logged (5.7). */
  body: text('body').notNull(),
  /** Exactly the student turn carries a verdict (7.3.4). */
  verdict: text('verdict'),
  /** Reading A6: required by CHECK when the verdict is CLARIFY, REFUSE or ESCALATE_TO_TUTOR. */
  reasonCode: text('reason_code'),
  /** null means no published rule applied; POL_ABSENT means the Assistant was unavailable (D47). */
  policyRuleId: uuid('policy_rule_id'),
  citedTiers: text('cited_tiers').array().notNull().default([]),
  groundingChunkIds: uuid('grounding_chunk_ids').array().notNull().default([]),
  citedFaqEntryIds: uuid('cited_faq_entry_ids').array().notNull().default([]),
  /** Every element must have `guardrail_scan_status = 'clear'` (I-6); a handler rule, not a CHECK. */
  uploadIds: uuid('upload_ids').array().notNull().default([]),
  modelId: text('model_id'),
  promptVersion: text('prompt_version'),
  latencyMs: integer('latency_ms'),
  tokenUsage: jsonb('token_usage'),
  /** Set when the student clears their own transcript. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.3.5 -- class: identity-bearing, student-facing only. */
export const assistantProactiveMessages = pgTable('assistant_proactive_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentAssignmentId: uuid('student_assignment_id').notNull(),
  milestoneId: uuid('milestone_id').notNull(),
  assistantMessageId: uuid('assistant_message_id').notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.3.6 -- class: identity-bearing, student-facing only.
 *
 * `extractedText` is never logged, never returned to a tutor, and never stored in
 * `guardrail_logs`.
 */
export const studentUploads = pgTable('student_uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  assignmentId: uuid('assignment_id').notNull(),
  /** null until attached to a request. */
  assistantSessionId: uuid('assistant_session_id'),
  /** Audio and video are out of the MVP (O11). */
  kind: text('kind').notNull(),
  originalFilename: text('original_filename').notNull(),
  /** Never returned (I-7). */
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  /** `bigint` in the database; see the note on `assignmentSources.byteSize` for the mapping. */
  byteSize: numeric('byte_size', { precision: 20, scale: 0, mode: 'bigint' }).notNull(),
  extractionStatus: text('extraction_status').notNull().default('pending'),
  extractedText: text('extracted_text'),
  extractionModelId: text('extraction_model_id'),
  guardrailScanStatus: text('guardrail_scan_status').notNull().default('pending'),
  /** Reading A6: required by CHECK when `guardrail_scan_status = 'blocked'`. */
  guardrailReasonCode: text('guardrail_reason_code'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// 0006_queries_faq.sql -- 06 section 7.4.1, 7.4.2, 7.4.4
// ---------------------------------------------------------------------------------------------

/**
 * `docs/06` 7.4.1 -- class: identity-bearing (reading A1: D50 wins over section 4.6's
 * pseudonymous row). A private Query is always attributed, never anonymous.
 */
export const queries = pgTable('queries', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  studentId: uuid('student_id').notNull(),
  milestoneId: uuid('milestone_id'),
  requirementNodeId: uuid('requirement_node_id'),
  subject: text('subject'),
  status: text('status').notNull().default('open'),
  /** RESERVED and not populated in the MVP; topic clustering is out of scope (02 section 2.4). */
  topicLabel: text('topic_label'),
  topicLabelSource: text('topic_label_source').notNull().default('ai'),
  topicConfidence: numeric('topic_confidence', { precision: 4, scale: 3 }),
  groupingModelId: text('grouping_model_id'),
  groupingPromptVersion: text('grouping_prompt_version'),
  messageCount: integer('message_count').notNull().default(0),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.4.2 -- class: identity-bearing. `body` is immutable after send. */
export const queryMessages = pgTable('query_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  queryId: uuid('query_id').notNull(),
  assignmentId: uuid('assignment_id').notNull(),
  authorRole: text('author_role').notNull(),
  authorUserId: uuid('author_user_id').notNull(),
  body: text('body').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.4.4 -- class: identity-free. Only a tutor can create or publish an entry (D24). */
export const faqEntries = pgTable('faq_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  milestoneId: uuid('milestone_id'),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  sourceKind: text('source_kind').notNull(),
  sourceQueryId: uuid('source_query_id'),
  sourceQueryMessageId: uuid('source_query_message_id'),
  /** Reading A7: required by CHECK when `source_kind = 'peer_answer'` (D29, O8). */
  sourceDiscussionPostId: uuid('source_discussion_post_id'),
  publishedByUserId: uuid('published_by_user_id'),
  displayOrder: integer('display_order').notNull().default(0),
  publicationStatus: text('publication_status').notNull().default('AI_GENERATED'),
  origin: text('origin').notNull().default('ai'),
  provenance: jsonb('provenance'),
  groundingChunkIds: uuid('grounding_chunk_ids').array().notNull().default([]),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// 0007_discussions.sql -- 06 section 7.5.1-7.5.4
// ---------------------------------------------------------------------------------------------

/**
 * `docs/06` 7.5.1 -- class: pseudonymous.
 *
 * Reading A10: `post_count` counts posts whose `deleted_at is null`; a post whose status is
 * `removed` or `hidden_pending_review` is not deleted and stays counted.
 */
export const discussionThreads = pgTable('discussion_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  milestoneId: uuid('milestone_id'),
  title: text('title').notNull(),
  /** The thread's author is not duplicated as a column pair (7.5.1, section 10 item 12). */
  firstPostId: uuid('first_post_id'),
  status: text('status').notNull().default('open'),
  postCount: integer('post_count').notNull().default(0),
  lastPostAt: timestamp('last_post_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.5.2 -- class: pseudonymous.
 *
 * `ck_posts_author_xor` is the schema-level form of C4: exactly one authorship path, and it must
 * agree with `isAnonymised`. An anonymous post has no `authorUserId` at all.
 *
 * Ownership for an own-post edit/delete is resolved by comparing `authorAnonIdentityId` with the
 * caller's identity row for that assignment (A-ID-7), never by `authorUserId is null`.
 */
export const discussionPosts = pgTable('discussion_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull(),
  assignmentId: uuid('assignment_id').notNull(),
  parentPostId: uuid('parent_post_id'),
  /** Set only for an attributed post. */
  authorUserId: uuid('author_user_id'),
  /** Set only for an anonymous post. */
  authorAnonIdentityId: uuid('author_anon_identity_id'),
  isAnonymised: boolean('is_anonymised').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('visible'),
  acceptedAnswerStatus: text('accepted_answer_status').notNull().default('none'),
  answerApprovedByUserId: uuid('answer_approved_by_user_id'),
  answerApprovedAt: timestamp('answer_approved_at', { withTimezone: true }),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.5.3 and 4.3 -- class: pseudonymous, and the most restricted table in the schema.
 *
 * Rows are never deleted; the table has no `deleted_at`. Exactly one module may read or write it
 * (A-ID-2). The display label is not stored -- it is computed as `'Anonymous Student #' ||
 * display_number` (4.1) and exposed through the `discussion_author_display` view (A-ID-3).
 */
export const anonIdentities = pgTable('anon_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  assignmentId: uuid('assignment_id').notNull(),
  /** HMAC_SHA256(ANON_ID_SECRET, ...) stored for audit and reproducibility, never the lookup key. */
  pseudonymHmac: bytea('pseudonym_hmac').notNull(),
  displayNumber: integer('display_number').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.5.4 -- class: pseudonymous.
 *
 * `targetId` is polymorphic across `discussion_post` and `query_message`; a CHECK cannot express a
 * polymorphic FK, so the query layer resolves it and test T-13 covers the delete rules.
 */
export const moderationFlags = pgTable('moderation_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  targetKind: text('target_kind').notNull(),
  targetId: uuid('target_id').notNull(),
  source: text('source').notNull(),
  severity: text('severity').notNull(),
  reasonCode: text('reason_code').notNull(),
  /** The flag explanation; never contains upload content. */
  detail: text('detail'),
  /** The reporter as a pseudonym reference, never a user id (D54). */
  reporterAnonIdentityId: uuid('reporter_anon_identity_id'),
  aiModelId: text('ai_model_id'),
  aiPromptVersion: text('ai_prompt_version'),
  status: text('status').notNull().default('open'),
  reviewedByUserId: uuid('reviewed_by_user_id'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// 0008_metrics_audit.sql -- 06 section 7.6.1-7.6.5
// ---------------------------------------------------------------------------------------------

/**
 * `docs/06` 7.6.1 -- class: identity-free, append-only.
 *
 * Prohibited columns, permanently: `student_id`, `user_id`, `anon_identity_id`, `author_user_id`,
 * `display_name`, `email`, `ip_address`, `user_agent`, `filename`, `body`, `text`,
 * `extracted_text`, `session_token` (A-ID-6, 4.7.3). Adding a column to this table is a decision,
 * not an edit (8.3 rule 10).
 */
export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  /** Domain-separated HMAC from 4.7.1; one-way, and no table maps it back. */
  subjectRef: text('subject_ref').notNull(),
  eventType: text('event_type').notNull(),
  milestoneId: uuid('milestone_id'),
  checklistItemId: uuid('checklist_item_id'),
  durationSeconds: integer('duration_seconds'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * Key allowlist: `source`, `surface`, `verdict`, `reasonCode`; no other key may be written
   * (test T-15). The SQL CHECK only enforces `jsonb_typeof(...) = 'object'`.
   */
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.6.2 -- class: identity-free, append-only.
 *
 * Prohibited columns, permanently: `request_text`, `response_text`, `message_body`, a
 * `queue_position` derived from identity, `student_id`, `user_id`, `anon_identity_id`, `upload_id`,
 * `extracted_text`, `ip_address`, `user_agent`, `cookie` (C7, AGENTS section 6.5). No MVP endpoint
 * returns this table.
 */
export const guardrailLogs = pgTable('guardrail_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  /** The opaque session id, not the student. */
  assistantSessionId: uuid('assistant_session_id'),
  assistantMessageId: uuid('assistant_message_id'),
  subjectRef: text('subject_ref').notNull(),
  verdict: text('verdict').notNull(),
  reasonCode: text('reason_code').notNull(),
  /** null means no published rule applied; for POL_ABSENT the Assistant was unavailable (D47). */
  policyRuleId: uuid('policy_rule_id'),
  citedTiers: text('cited_tiers').array().notNull().default([]),
  modelId: text('model_id'),
  promptVersion: text('prompt_version').notNull(),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.6.3 -- class: identity-free.
 *
 * There is no `is_suppressed` column and no row for a bucket below the floor: absence is uniform,
 * so a reader cannot tell "0 contributors" from "4 contributors" (4.7.2).
 */
export const milestoneMetrics = pgTable('milestone_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  milestoneId: uuid('milestone_id').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  /** The k-anonymity floor, enforced by `CHECK (contributor_count >= 5)` (D32, I-5). */
  contributorCount: integer('contributor_count').notNull(),
  startedCount: integer('started_count').notNull(),
  completedCount: integer('completed_count').notNull(),
  completionRate: numeric('completion_rate', { precision: 5, scale: 4 }).notNull(),
  averageElapsedSeconds: integer('average_elapsed_seconds'),
  medianElapsedSeconds: numeric('median_elapsed_seconds', { precision: 10, scale: 2 }),
  /** Tutor-directed questions only: private Queries plus flagged discussion posts (D49). */
  questionCount: integer('question_count').notNull().default(0),
  /** Metric M6, reported separately and never added to `question_count` (D49). */
  assistantTurnCount: integer('assistant_turn_count').notNull().default(0),
  discussionPostCount: integer('discussion_post_count').notNull().default(0),
  difficultyScore: numeric('difficulty_score', { precision: 5, scale: 2 }),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** `docs/06` 7.6.4 -- class: identity-free. */
export const assignmentMetrics = pgTable('assignment_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  /** An enrolment fact (`count(*)` over `enrollments`), not student activity. */
  enrolledCount: integer('enrolled_count').notNull(),
  /** null when fewer than 5 (D32); the floor applies to the headline too (D52). */
  activeCount: integer('active_count'),
  completedItemCount: integer('completed_item_count'),
  /** Reading A10: published items of the current structure with `deleted_at is null`. */
  totalItemCount: integer('total_item_count'),
  averageCompletionRate: numeric('average_completion_rate', { precision: 5, scale: 4 }),
  questionCount: integer('question_count'),
  /** Count only; the milestone detail is in `milestone_metrics`. */
  potentialDifficultyAreaCount: integer('potential_difficulty_area_count'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.6.5 -- class: identity-bearing (the actor), append-only.
 *
 * Reading A12: redaction of `before`/`after` is **application code**, not a constraint. A CHECK
 * cannot inspect nested JSON semantics, so the redaction duty belongs to the writer. The
 * permitted/prohibited field lists are in section 7.6.5 and are reproduced in the migration
 * comment.
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** null for a system transition. */
  actorUserId: uuid('actor_user_id'),
  actorRole: text('actor_role'),
  /** Dotted verb, e.g. `artifact.approved`. */
  action: text('action').notNull(),
  targetTable: text('target_table').notNull(),
  targetId: uuid('target_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  /** The `x-request-id` of the request that caused the transition. */
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// 0011_ingestion_jobs.sql -- 06 section 7.7.1-7.7.2 (Phase 2)
// ---------------------------------------------------------------------------------------------

/**
 * `docs/06` 7.7.1 -- class: identity-bearing (the requesting tutor).
 *
 * The D60 execution model: the ingest route enqueues, this row is the progress the tutor polls, and
 * the pipeline advances it. The `INGESTION_IN_PROGRESS` guard is the partial unique index
 * `uq_ingestion_jobs_active` over `(assignment_id) where status in ('queued','running')`, which
 * cannot be expressed here (trap T19) and lives in the SQL.
 *
 * There is no `stage_progress` JSON and no per-stage timestamp: `stage` plus `completed_stages` is
 * what `06` section 5.5.8's `IngestionStatusResponse` returns, and a second progress representation
 * would be a second source of truth for the same fact.
 */
export const ingestionJobs = pgTable('ingestion_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull(),
  requestedByUserId: uuid('requested_by_user_id').notNull(),
  status: text('status').notNull().default('queued'),
  /** null until the run reaches a stage (`06` section 5.5.8 types it `| null`). */
  stage: text('stage'),
  completedStages: integer('completed_stages').notNull().default(0),
  totalStages: integer('total_stages').notNull().default(8),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `docs/06` 7.7.2 -- class: identity-bearing (a scope key names an assistant session or an upload).
 *
 * One row per budget unit, not one per call (`04` section 5.6). `max_calls` is a snapshot of
 * `LLM_MAX_CALLS_PER_SESSION` at the moment the scope opened, so changing the configuration cannot
 * retroactively authorise a call that was already made or forbid one that was already counted.
 *
 * `ck_llm_call_counters_within_limit` makes the ceiling a database fact: a counter cannot be
 * incremented past its limit even by hand-written SQL.
 */
export const llmCallCounters = pgTable('llm_call_counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The budget unit: a session id, an ingestion run id, or `extraction:<uploadId>` (D68). */
  scopeKey: text('scope_key').notNull(),
  scopeKind: text('scope_kind').notNull(),
  callsUsed: integer('calls_used').notNull().default(0),
  maxCalls: integer('max_calls').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
