-- 0006_queries_faq.sql
--
-- Queries and FAQ: `queries`, `query_messages`, `faq_entries`
-- (06 sections 7.4.1, 7.4.2, 7.4.4; spec schema.md 2.4).
--
-- Privacy classes (06 section 4.6; stated here because 6.7 rule 4 requires the class in a SQL
-- comment -- the class determines which modules may read the table):
--   queries        identity-bearing
--   query_messages identity-bearing
--   faq_entries    identity-free
--
-- `queries` is `identity-bearing`. THIS FILE'S CLASS COMMENT AGREES WITH 06 SECTION 4.6, WHICH
-- ALREADY LISTS `queries` AND `query_messages` UNDER IDENTITY-BEARING. There is no divergence to
-- resolve here. A first draft of this comment claimed 4.6 said "pseudonymous" and that D50 had to
-- overrule it; that claim came from `.local/spec/schema.md` ambiguity A1 and is FALSE -- it was
-- re-checked against `docs/06` section 4.6, which lists both tables under Identity-bearing, and
-- against the extract's own table of contents, which contradicted itself. See the trust note in
-- `docs/01-DECISIONS.md` section J. Recorded rather than quietly deleted because a wrong comment
-- about the class is worse than no comment: the class decides which modules may read the table.
--
-- `query_attachments` deliberately does not exist (06 section 7.4.3 and section 10 item 15; spec
-- schema.md 5.2). A private Query thread is a flat text thread with no attachments and no read
-- receipts. No table, column, or endpoint may be scaffolded for it.
--
-- Deferred FK added in this file: `ambiguity_findings.resolution_faq_entry_id` -> `faq_entries`.
-- The column was declared in 0004_structure.sql because 7.2.12 is normative on the column set,
-- but `faq_entries` cannot exist before this file.
--
-- Deferred FK NOT added in this file: `faq_entries.source_discussion_post_id` -> `discussion_posts`.
-- `discussion_posts` is created in 0007_discussions.sql, so that constraint is added there.
--
-- No destructive statement appears in this file.

-- ---------------------------------------------------------------------------------------------
-- queries -- 06 section 7.4.1 -- class: identity-bearing
--
-- A private student-to-tutor thread (D24), always attributed (D50). The tutor sees this student's
-- `display_name` because a Query is private, not anonymous.
-- ---------------------------------------------------------------------------------------------
create table queries (
  id                      uuid primary key default gen_random_uuid(),
  assignment_id           uuid not null
                            constraint fk_queries_assignments references assignments (id) on delete restrict,
  student_id              uuid not null
                            constraint fk_queries_users references users (id) on delete restrict,
  -- The anchor used for question-volume aggregation.
  milestone_id            uuid
                            constraint fk_queries_milestones references milestones (id) on delete restrict,
  requirement_node_id     uuid
                            constraint fk_queries_requirement_nodes references requirement_nodes (id) on delete restrict,
  subject                 text
                            constraint ck_queries_subject_length check (subject is null or length(subject) <= 200),
  status                  text not null default 'open'
                            constraint ck_queries_status check (status in ('open','answered','resolved','closed')),
  -- RESERVED and not populated in the MVP: topic clustering of student questions is out of scope
  -- (02 section 2.4), and the tutor tab groups by Milestone only. The column is specified so M12
  -- has a home and enabling clustering later is not a migration.
  topic_label             text
                            constraint ck_queries_topic_label_length check (
                              topic_label is null or length(topic_label) <= 120),
  topic_label_source      text not null default 'ai'
                            constraint ck_queries_topic_label_source check (topic_label_source in ('ai','tutor')),
  topic_confidence        numeric(4,3)
                            constraint ck_queries_topic_confidence check (
                              topic_confidence is null or topic_confidence between 0 and 1),
  grouping_model_id       text,
  grouping_prompt_version text,
  message_count           integer not null default 0
                            constraint ck_queries_message_count check (message_count >= 0),
  last_message_at         timestamptz,
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint ck_queries_resolved_at check (status <> 'resolved' or resolved_at is not null)
);

-- 06 section 6.6
create index idx_queries_assignment_status on queries (assignment_id, status, last_message_at desc);

-- ---------------------------------------------------------------------------------------------
-- query_messages -- 06 section 7.4.2 -- class: identity-bearing
--
-- One message in a private Query thread. `body` is immutable after send (IMMUTABLE_FIELD on
-- PATCH); a moderator may soft-delete, but the author may not rewrite a sent message. A tutor
-- message may be published as a FAQ entry, which is recorded on the new `faq_entries` row rather
-- than by mutating this one.
-- ---------------------------------------------------------------------------------------------
create table query_messages (
  id             uuid primary key default gen_random_uuid(),
  query_id       uuid not null
                   constraint fk_query_messages_queries references queries (id) on delete restrict,
  assignment_id  uuid not null
                   constraint fk_query_messages_assignments references assignments (id) on delete restrict,
  author_role    text not null
                   constraint ck_query_messages_author_role check (author_role in ('student','tutor')),
  author_user_id uuid not null
                   constraint fk_query_messages_users references users (id) on delete restrict,
  body           text not null
                   constraint ck_query_messages_body_length check (length(body) between 1 and 8000),
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 06 section 6.6
create index idx_query_messages_query on query_messages (query_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- faq_entries -- 06 section 7.4.4 -- class: identity-free
--
-- A tutor-published answer forming the assignment's official shared knowledge. Tier T2 when
-- PUBLISHED, T5 before. Only a tutor can create or publish an entry (D24).
-- ---------------------------------------------------------------------------------------------
create table faq_entries (
  id                        uuid primary key default gen_random_uuid(),
  assignment_id             uuid not null
                              constraint fk_faq_entries_assignments references assignments (id) on delete restrict,
  milestone_id              uuid
                              constraint fk_faq_entries_milestones references milestones (id) on delete restrict,
  question                  text not null
                              constraint ck_faq_entries_question_length check (length(question) between 5 and 500),
  answer                    text not null
                              constraint ck_faq_entries_answer_length check (length(answer) between 5 and 4000),
  source_kind               text not null
                              constraint ck_faq_entries_source_kind check (
                                source_kind in ('ai_candidate','query_reply','peer_answer','tutor_authored')),
  source_query_id           uuid
                              constraint fk_faq_entries_queries references queries (id) on delete restrict,
  source_query_message_id   uuid
                              constraint fk_faq_entries_query_messages references query_messages (id) on delete restrict,
  -- FK to discussion_posts added by 0007_discussions.sql; that table cannot exist this early.
  source_discussion_post_id uuid,
  published_by_user_id      uuid
                              constraint fk_faq_entries_users references users (id) on delete restrict,
  display_order             integer not null default 0,
  publication_status        text not null default 'AI_GENERATED'
                              constraint ck_publication_status check (publication_status in
                                ('AI_GENERATED','NEEDS_REVIEW','EDITED','APPROVED','PUBLISHED','REJECTED')),
  origin                    text not null default 'ai'
                              constraint ck_origin check (origin in ('ai','tutor')),
  provenance                jsonb
                              constraint ck_provenance_shape check (
                                origin <> 'ai' or (
                                  provenance is not null
                                  and provenance ? 'modelId'
                                  and provenance ? 'promptVersion'
                                  and provenance ? 'generatedAt'
                                )),
  grounding_chunk_ids       uuid[] not null default '{}',
  approved_by_user_id       uuid
                              constraint fk_faq_entries_approved_by_users references users (id) on delete restrict,
  approved_at               timestamptz,
  published_at              timestamptz,
  deleted_at                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint ck_faq_entries_approval check (
    publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null),
  -- Reading A3: same literal shape as 7.2.4.
  constraint ck_faq_entries_approved_at check (
    approved_at is null or publication_status in ('APPROVED','PUBLISHED')),
  constraint ck_faq_entries_published_at check (
    publication_status <> 'PUBLISHED' or published_at is not null),
  constraint ck_faq_entries_published_by check (
    publication_status <> 'PUBLISHED' or published_by_user_id is not null),
  -- Reading A7: 7.4.4 states in prose that source_kind = 'peer_answer' "requires
  -- source_discussion_post_id" and gives no CHECK. Structural enforcement beats handler
  -- validation, so it is a CHECK. The promotion itself stays explicit (D29, O8): there is no
  -- automatic promotion path in the API, and this CHECK does not create one.
  constraint ck_faq_entries_peer_answer_source check (
    source_kind <> 'peer_answer' or source_discussion_post_id is not null)
);

-- 06 section 6.6 `uq_faq_entries_display_order`:
--   unique (assignment_id, display_order)
--   where deleted_at is null and publication_status = 'PUBLISHED'
-- Partial, so it is an index and never an inline UNIQUE constraint (trap T19).
create unique index uq_faq_entries_display_order
  on faq_entries (assignment_id, display_order)
  where deleted_at is null and publication_status = 'PUBLISHED';

-- Deferred from 0004_structure.sql: 7.2.12 requires that a finding can close as
-- 'resolved_by_clarification' only by linking to a FAQ entry the tutor published (D23, C2).
alter table ambiguity_findings
  add constraint fk_ambiguity_findings_faq_entries
  foreign key (resolution_faq_entry_id) references faq_entries (id) on delete restrict;
