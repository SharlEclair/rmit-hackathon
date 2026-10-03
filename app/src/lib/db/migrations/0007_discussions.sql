-- 0007_discussions.sql
--
-- Discussions: `discussion_threads`, `discussion_posts`, `anon_identities`, `moderation_flags`
-- (06 sections 7.5.1-7.5.4 and the full definition in 4.3; spec schema.md 2.5).
--
-- Privacy classes (06 section 4.6; stated here because 6.7 rule 4 requires the class in a SQL
-- comment -- the class determines which modules may read the table). Every table in this file is
-- pseudonymous. A tutor-facing discourse read must take its author label from the view
-- `discussion_author_display` and never join `anon_identities` directly (A-ID-2, A-ID-3).
--
-- `anon_identities` is the single most restricted table in the schema. Rows are NEVER deleted
-- (4.3 rule 1): deleting one would free its `display_number` and let a later post by the same
-- student appear as a different person mid-discussion. It has no `deleted_at`, is excluded from
-- every cascade, and its FKs are ON DELETE RESTRICT.
--
-- `moderation_flags.target_id` is polymorphic across `discussion_post` and `query_message`. A
-- CHECK cannot express a polymorphic FK, so the delete rules are enforced in the query layer and
-- covered by test T-13 (7.5.4).
--
-- Reading A8: no `expectedRevision`/`revision` column is added here either; handoff issue I-16
-- stays open and is owned by Phase 2/4.
--
-- No destructive statement appears in this file.

-- ---------------------------------------------------------------------------------------------
-- discussion_threads -- 06 section 7.5.1 -- class: pseudonymous
--
-- A shared, cohort-visible thread. The thread carries no authorship columns at all; `first_post_id`
-- exists so the thread's author is not duplicated as a column pair (7.5.1, section 10 item 12).
-- ---------------------------------------------------------------------------------------------
create table discussion_threads (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
                  constraint fk_discussion_threads_assignments references assignments (id) on delete restrict,
  milestone_id  uuid
                  constraint fk_discussion_threads_milestones references milestones (id) on delete restrict,
  title         text not null
                  constraint ck_discussion_threads_title_length check (length(title) between 5 and 200),
  -- The FK and its UNIQUE are added by alter table below: `discussion_posts` does not exist yet,
  -- and 8.2's insert-order note requires the FK to be DEFERRABLE INITIALLY DEFERRED so a
  -- single-statement insert path (thread, opening post, then first_post_id) also works.
  first_post_id uuid,
  status        text not null default 'open'
                  constraint ck_discussion_threads_status check (status in ('open','locked','removed')),
  -- Reading A10: this denormalised counter counts posts whose `deleted_at is null`. A post whose
  -- status is 'removed' or 'hidden_pending_review' is NOT deleted, so it stays counted.
  post_count    integer not null default 0
                  constraint ck_discussion_threads_post_count check (post_count >= 0),
  last_post_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 06 section 6.6
create index idx_discussion_threads_assignment
  on discussion_threads (assignment_id, last_post_at desc);

-- ---------------------------------------------------------------------------------------------
-- anon_identities -- 06 section 7.5.3, full definition 4.3 -- class: pseudonymous
--
-- The only mapping between a student and a per-assignment pseudonym. The display label is NOT
-- stored: it is computed as 'Anonymous Student #' || display_number (4.1, 7.5.3). The three unique
-- constraints are all load-bearing -- the first is the lookup key, the second the domain-separated
-- HMAC for audit, and the third the DB-level enforcement of "unique within an assignment".
-- ---------------------------------------------------------------------------------------------
create table anon_identities (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null
                   constraint fk_anon_identities_users references users (id) on delete restrict,
  assignment_id  uuid not null
                   constraint fk_anon_identities_assignments references assignments (id) on delete restrict,
  -- HMAC_SHA256(ANON_ID_SECRET, "aa:anon:v1|" + lower(student_id) + "|" + lower(assignment_id));
  -- stored for audit and reproducibility, never the lookup key (4.2 fact 6).
  pseudonym_hmac bytea not null,
  display_number integer not null
                   constraint ck_anon_identities_display_number check (display_number between 1 and 900),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint uq_anon_identities_student_assignment unique (student_id, assignment_id),
  constraint uq_anon_identities_assignment_hmac  unique (assignment_id, pseudonym_hmac),
  -- 6.1 names this one: uq_anon_identities_assignment_display_number. It is the DB-level
  -- enforcement of "unique within an assignment" (4.2 fact 2).
  constraint uq_anon_identities_assignment_display_number unique (assignment_id, display_number)
);

-- ---------------------------------------------------------------------------------------------
-- discussion_posts -- 06 section 7.5.2 -- class: pseudonymous
--
-- One Post in a Discussion thread; the object of the anonymity guarantee.
--
-- `ck_posts_author_xor` is the schema-level form of C4: an anonymous post has no `author_user_id`
-- at all, so no query over this table can name its author even before the identity table is
-- considered (7.5.2, 9.1). Own-post operations resolve through `author_anon_identity_id` (A-ID-7).
-- ---------------------------------------------------------------------------------------------
create table discussion_posts (
  id                         uuid primary key default gen_random_uuid(),
  thread_id                  uuid not null
                               constraint fk_discussion_posts_discussion_threads references discussion_threads (id) on delete restrict,
  assignment_id              uuid not null
                               constraint fk_discussion_posts_assignments references assignments (id) on delete restrict,
  parent_post_id             uuid
                               constraint fk_discussion_posts_parent references discussion_posts (id) on delete restrict,
  -- Set only for an attributed post.
  author_user_id             uuid
                               constraint fk_discussion_posts_users references users (id) on delete restrict,
  -- Set only for an anonymous post.
  author_anon_identity_id    uuid
                               constraint fk_discussion_posts_anon_identities references anon_identities (id) on delete restrict,
  is_anonymised              boolean not null,
  body                       text not null
                               constraint ck_discussion_posts_body_length check (length(body) between 1 and 4000),
  status                     text not null default 'visible'
                               constraint ck_discussion_posts_status check (
                                 status in ('visible','hidden_pending_review','removed')),
  accepted_answer_status     text not null default 'none'
                               constraint ck_discussion_posts_accepted_answer_status check (
                                 accepted_answer_status in ('none','proposed','approved','rejected')),
  answer_approved_by_user_id uuid
                               constraint fk_discussion_posts_answer_approved_by_users references users (id) on delete restrict,
  answer_approved_at         timestamptz,
  edited_at                  timestamptz,
  deleted_at                 timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- 7.5.2: exactly one authorship path, and it must agree with is_anonymised.
  constraint ck_posts_author_xor check (
    (is_anonymised and author_anon_identity_id is not null and author_user_id is null)
    or
    (not is_anonymised and author_user_id is not null and author_anon_identity_id is null)
  ),
  constraint ck_discussion_posts_no_self_parent check (
    parent_post_id is null or parent_post_id <> id),
  constraint ck_discussion_posts_answer_approver check (
    accepted_answer_status <> 'approved' or answer_approved_by_user_id is not null)
);

-- 06 section 6.6
create index idx_discussion_posts_thread on discussion_posts (thread_id, created_at);

-- The mutually referential half of the thread/post pair (7.5.1 + the 8.2 insert-order note).
-- Created after discussion_posts, so the FK can be declared here.
-- DERIVED name: 7.5.1 says `first_post_id` is "unique" but does not name the object; 6.1's
-- `uq_<table>_<columns>` convention gives this one.
alter table discussion_threads
  add constraint uq_discussion_threads_first_post unique (first_post_id);

-- Reading A9: ON DELETE SET NULL, not RESTRICT. The column is nullable and a thread without a
-- first post is representable, so a legitimate hard delete of a removed post must not be blocked;
-- soft delete (deleted_at) remains the product path for a student deleting their own post (D28).
-- DEFERRABLE INITIALLY DEFERRED is required by 8.2 so a single-statement insert path works.
alter table discussion_threads
  add constraint fk_discussion_threads_first_post
  foreign key (first_post_id) references discussion_posts (id)
  on delete set null deferrable initially deferred;

-- The remaining deferred FK: 7.4.4 allows a tutor-published FAQ entry to record the discussion
-- post it was promoted from (source_kind = 'peer_answer', D29/O8).
alter table faq_entries
  add constraint fk_faq_entries_discussion_posts
  foreign key (source_discussion_post_id) references discussion_posts (id) on delete restrict;

-- ---------------------------------------------------------------------------------------------
-- moderation_flags -- 06 section 7.5.4 -- class: pseudonymous
--
-- One AI or student flag against a Post or a Query message (O3, D30). The reporter is stored as a
-- pseudonym reference, never a user id (D54), so the moderator queue cannot resolve them (4.4,
-- A-ID-5). AI flags are unlimited per target; a second AI flag on the same target updates the
-- existing open flag instead of inserting a duplicate (7.5.4) -- application behaviour, not a
-- constraint.
-- ---------------------------------------------------------------------------------------------
create table moderation_flags (
  id                        uuid primary key default gen_random_uuid(),
  assignment_id             uuid not null
                              constraint fk_moderation_flags_assignments references assignments (id) on delete restrict,
  target_kind               text not null
                              constraint ck_moderation_flags_target_kind check (
                                target_kind in ('discussion_post','query_message')),
  -- Polymorphic; resolved by the query layer against target_kind (7.5.4).
  target_id                 uuid not null,
  source                    text not null
                              constraint ck_moderation_flags_source check (source in ('ai','student')),
  severity                  text not null
                              constraint ck_moderation_flags_severity check (severity in ('low','medium','high')),
  reason_code               text not null
                              constraint ck_moderation_flags_reason_code check (reason_code in
                                ('HARASSMENT','INAPPROPRIATE_CONTENT','PERSONAL_INFORMATION',
                                 'PROHIBITED_ASSISTANCE','SOLUTION_SHARING','OTHER')),
  -- The flag explanation; never contains upload content.
  detail                    text
                              constraint ck_moderation_flags_detail_length check (detail is null or length(detail) <= 500),
  reporter_anon_identity_id uuid
                              constraint fk_moderation_flags_anon_identities references anon_identities (id) on delete restrict,
  ai_model_id               text,
  ai_prompt_version         text,
  status                    text not null default 'open'
                              constraint ck_moderation_flags_status check (status in ('open','upheld','dismissed')),
  reviewed_by_user_id       uuid
                              constraint fk_moderation_flags_users references users (id) on delete restrict,
  reviewed_at               timestamptz,
  resolution_note           text
                              constraint ck_moderation_flags_resolution_note_length check (
                                resolution_note is null or length(resolution_note) <= 500),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint ck_moderation_flags_student_reporter check (
    source <> 'student' or reporter_anon_identity_id is not null),
  constraint ck_moderation_flags_ai_model check (source <> 'ai' or ai_model_id is not null),
  constraint ck_moderation_flags_ai_prompt_version check (
    source <> 'ai' or ai_prompt_version is not null),
  constraint ck_moderation_flags_reviewer check (status = 'open' or reviewed_by_user_id is not null)
);

-- 06 section 6.6 `uq_moderation_flags_student_flag`: one student flag per target (D30, D54).
-- Partial, so it is an index and never an inline UNIQUE constraint (trap T19).
create unique index uq_moderation_flags_student_flag
  on moderation_flags (target_kind, target_id, reporter_anon_identity_id)
  where source = 'student';

-- 06 section 6.6
create index idx_moderation_flags_queue on moderation_flags (assignment_id, status, severity);
