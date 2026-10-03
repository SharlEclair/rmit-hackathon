-- 0005_student_work.sql
--
-- Student work: `student_assignments`, `student_checklist_progress`, `assistant_sessions`,
-- `assistant_messages`, `assistant_proactive_messages`, `student_uploads`
-- (06 sections 7.3.1-7.3.6; spec schema.md 2.3).
--
-- Privacy classes (06 section 4.6; stated here because 6.7 rule 4 requires the class in a SQL
-- comment -- the class determines which modules may read the table). Every table in this file is
-- identity-bearing, and `student_assignments` and `student_checklist_progress` are additionally
-- student-facing only: no tutor endpoint in 06 section 5 returns either table (4.7.4), and
-- `assistant_messages` is never returned to a tutor (7.3.4).
--
-- Reading A8: no `expectedRevision` or `revision` column is added to any table here. Handoff
-- issue I-16 stays open and is owned by Phase 2/4; 06 section 3.2 transition 3 and test T-19
-- demand optimistic concurrency but section 7 specifies no storage for it.
--
-- No destructive statement appears in this file.

-- ---------------------------------------------------------------------------------------------
-- student_assignments -- 06 section 7.3.1 -- class: identity-bearing (student-facing only)
--
-- The per-student rollup for one assignment. The row is created on first open, not on enrolment.
-- ---------------------------------------------------------------------------------------------
create table student_assignments (
  id                   uuid primary key default gen_random_uuid(),
  assignment_id        uuid not null
                         constraint fk_student_assignments_assignments references assignments (id) on delete restrict,
  student_id           uuid not null
                         constraint fk_student_assignments_users references users (id) on delete restrict,
  first_opened_at      timestamptz,
  last_activity_at     timestamptz,
  -- Reading A10: this denormalised counter counts published Checklist items of the current
  -- structure whose `deleted_at is null`; a soft-deleted item is not part of the student's work.
  completed_item_count integer not null default 0
                         constraint ck_student_assignments_completed_count check (completed_item_count >= 0),
  total_item_count     integer not null default 0
                         constraint ck_student_assignments_total_count check (total_item_count >= 0),
  resolution_rate      numeric(5,4) not null default 0
                         constraint ck_student_assignments_resolution_rate check (resolution_rate between 0 and 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint uq_student_assignments unique (assignment_id, student_id)
);

-- ---------------------------------------------------------------------------------------------
-- student_checklist_progress -- 06 section 7.3.2 -- class: identity-bearing (student-facing only)
--
-- Per-student state and elapsed time for one Checklist item; the source of the student's own
-- progress display and of the events in 7.6.1.
-- ---------------------------------------------------------------------------------------------
create table student_checklist_progress (
  id                    uuid primary key default gen_random_uuid(),
  student_assignment_id uuid not null
                          constraint fk_student_checklist_progress_student_assignments
                          references student_assignments (id) on delete restrict,
  -- Denormalised for the API's ownership filter. Must equal the parent's `student_id`; 7.3.2
  -- says that is enforced in the query layer, so there is deliberately no trigger here.
  student_id            uuid not null
                          constraint fk_student_checklist_progress_users references users (id) on delete restrict,
  checklist_item_id     uuid not null
                          constraint fk_student_checklist_progress_checklist_items
                          references checklist_items (id) on delete restrict,
  state                 text not null default 'not_started'
                          constraint ck_student_checklist_progress_state check (
                            state in ('not_started','in_progress','completed')),
  -- The first start, immutable once set.
  started_at            timestamptz,
  -- The FIRST completion (D48), immutable once set.
  completed_at          timestamptz,
  -- The first start-to-complete interval (D48). Idle time counts (6.12 rule 2).
  elapsed_seconds       integer
                          constraint ck_student_checklist_progress_elapsed check (
                            elapsed_seconds is null or elapsed_seconds >= 0),
  -- Incremented on each reopen; adds nothing to `elapsed_seconds` (D48).
  reopen_count          integer not null default 0
                          constraint ck_student_checklist_progress_reopen_count check (reopen_count >= 0),
  -- The most recent transition, so a reopen is recorded without disturbing the metric.
  last_state_changed_at timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint uq_progress_student_item unique (student_assignment_id, checklist_item_id),
  constraint ck_student_checklist_progress_in_progress check (
    state <> 'in_progress' or started_at is not null),
  constraint ck_student_checklist_progress_completed check (
    state <> 'completed'
    or (started_at is not null and completed_at is not null and elapsed_seconds is not null)),
  -- 06 section 9.1: duration cannot contradict its timestamps.
  constraint ck_student_checklist_progress_elapsed_matches check (
    completed_at is null
    or elapsed_seconds = round(extract(epoch from (completed_at - started_at)))::integer)
);

-- ---------------------------------------------------------------------------------------------
-- assistant_sessions -- 06 section 7.3.3 -- class: identity-bearing (student-facing only)
--
-- The one conversational session per (student, assignment). Created on the first request or the
-- first proactive notice.
-- ---------------------------------------------------------------------------------------------
create table assistant_sessions (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null
                    constraint fk_assistant_sessions_assignments references assignments (id) on delete restrict,
  student_id      uuid not null
                    constraint fk_assistant_sessions_users references users (id) on delete restrict,
  -- The 4.7.1 analytics pseudonym: domain-separated from the discussion pseudonym, one-way, and
  -- used only inside `count(distinct ...)` and in `guardrail_logs`.
  subject_ref     text not null
                    constraint ck_assistant_sessions_subject_ref check (subject_ref ~ '^[0-9a-f]{32}$'),
  is_active       boolean not null default true,
  message_count   integer not null default 0
                    constraint ck_assistant_sessions_message_count check (message_count >= 0),
  -- Capped by LLM_MAX_CALLS_PER_SESSION (12). The CHECK bounds the counter, not the cap: the cap
  -- is configuration and lives in the adapter.
  llm_call_count  integer not null default 0
                    constraint ck_assistant_sessions_llm_call_count check (llm_call_count >= 0),
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_assistant_sessions unique (student_id, assignment_id)
);

-- ---------------------------------------------------------------------------------------------
-- assistant_messages -- 06 section 7.3.4 -- class: identity-bearing (student-facing only)
--
-- One turn in an assistant session, including the guardrail verdict on the student's turn. Never
-- returned to a tutor. `body` is never logged (5.7).
--
-- The two cross-row invariants 7.3.4 states are handler rules, not CHECKs, because a CHECK cannot
-- see another row: an assistant message requires the preceding student message in the same
-- session to have verdict ALLOW or ALLOW_WITH_SCOPE (or to be a proactive notice built from
-- published content only, I-1); and every element of `upload_ids` must have
-- `guardrail_scan_status = 'clear'` (I-6).
-- ---------------------------------------------------------------------------------------------
create table assistant_messages (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null
                        constraint fk_assistant_messages_assistant_sessions
                        references assistant_sessions (id) on delete restrict,
  assignment_id       uuid not null
                        constraint fk_assistant_messages_assignments references assignments (id) on delete restrict,
  role                text not null
                        constraint ck_assistant_messages_role check (role in ('student','assistant')),
  is_proactive        boolean not null default false
                        constraint ck_assistant_messages_proactive check (not is_proactive or role = 'assistant'),
  body                text not null
                        constraint ck_assistant_messages_body_length check (length(body) <= 8000),
  verdict             text
                        constraint ck_assistant_messages_verdict check (
                          verdict is null or verdict in
                            ('ALLOW','ALLOW_WITH_SCOPE','CLARIFY','REFUSE','ESCALATE_TO_TUTOR')),
  reason_code         text,
  -- null means no published rule applied. For POL_ABSENT the Assistant is unavailable (D47);
  -- there is no permissive default.
  policy_rule_id      uuid
                        constraint fk_assistant_messages_ai_policy_rules references ai_policy_rules (id) on delete restrict,
  cited_tiers         text[] not null default '{}'
                        constraint ck_assistant_messages_cited_tiers check (
                          cited_tiers <@ array['T1','T2','T3','T4','T5']),
  -- R4 requires it on any assistant message that asserts a requirement.
  grounding_chunk_ids uuid[] not null default '{}',
  cited_faq_entry_ids uuid[] not null default '{}',
  upload_ids          uuid[] not null default '{}',
  model_id            text,
  prompt_version      text,
  latency_ms          integer
                        constraint ck_assistant_messages_latency check (latency_ms is null or latency_ms >= 0),
  -- Shape {"inputTokens":int,"outputTokens":int}. Reading A15: a CHECK for symmetry with
  -- `analytics_events.metadata` (7.6.1), which is the only other jsonb column the doc range-checks.
  token_usage         jsonb
                        constraint ck_assistant_messages_token_usage_object check (
                          token_usage is null or jsonb_typeof(token_usage) = 'object'),
  -- Set when the student clears their own transcript.
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- 7.3.4: exactly the student turn carries a verdict.
  constraint ck_assistant_messages_verdict_presence check ((role = 'student') = (verdict is not null)),
  -- Reading A6: 7.3.4 states "required when verdict in ('CLARIFY','REFUSE','ESCALATE_TO_TUTOR')"
  -- as prose. Structural enforcement beats handler validation, so it is a CHECK.
  constraint ck_assistant_messages_reason_code check (
    verdict not in ('CLARIFY','REFUSE','ESCALATE_TO_TUTOR') or reason_code is not null)
);

-- 06 section 6.6
create index idx_assistant_messages_session on assistant_messages (session_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- assistant_proactive_messages -- 06 section 7.3.5 -- class: identity-bearing (student-facing only)
--
-- The once-only record that the permitted proactive Assistant message for a milestone has been
-- delivered (O2). The message body is at most 3 bullets, each grounded in published content, and
-- is assembled from approved milestones, Checklist items and FAQ entries rather than generated on
-- the fly.
-- ---------------------------------------------------------------------------------------------
create table assistant_proactive_messages (
  id                    uuid primary key default gen_random_uuid(),
  student_assignment_id uuid not null
                          constraint fk_proactive_messages_student_assignments
                          references student_assignments (id) on delete restrict,
  milestone_id          uuid not null
                          constraint fk_proactive_messages_milestones references milestones (id) on delete restrict,
  assistant_message_id  uuid not null
                          constraint fk_proactive_messages_assistant_messages
                          references assistant_messages (id) on delete restrict,
  delivered_at          timestamptz not null default now(),
  dismissed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- 6.6 `uq_proactive_messages_item`: what makes "never repeated" a database guarantee rather
  -- than a UI convention (7.3.5).
  constraint uq_proactive_messages_item unique (student_assignment_id, milestone_id)
);

-- ---------------------------------------------------------------------------------------------
-- student_uploads -- 06 section 7.3.6 -- class: identity-bearing (student-facing only)
--
-- A student file attached to an assistant request; multimodal input that must not become a route
-- around C1. `extracted_text` is never logged, never returned to a tutor, and never stored in
-- `guardrail_logs`.
-- ---------------------------------------------------------------------------------------------
create table student_uploads (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null
                          constraint fk_student_uploads_users references users (id) on delete restrict,
  assignment_id         uuid not null
                          constraint fk_student_uploads_assignments references assignments (id) on delete restrict,
  -- null until attached to a request.
  assistant_session_id  uuid
                          constraint fk_student_uploads_assistant_sessions
                          references assistant_sessions (id) on delete restrict,
  -- Audio and video are out of the MVP (O11) and are refused at the picker with
  -- UNSUPPORTED_FORMAT, never accepted and then failed later.
  kind                  text not null
                          constraint ck_student_uploads_kind check (kind in ('image','pdf','text')),
  original_filename     text not null
                          constraint ck_student_uploads_filename_length check (length(original_filename) <= 255),
  storage_key           text not null,
  mime_type             text not null
                          constraint ck_student_uploads_mime check (
                            mime_type in ('image/png','image/jpeg','application/pdf','text/plain')),
  byte_size             bigint not null
                          constraint ck_student_uploads_byte_size check (
                            byte_size > 0 and byte_size <= 26214400),
  extraction_status     text not null default 'pending'
                          constraint ck_student_uploads_extraction_status check (
                            extraction_status in ('pending','extracting','extracted','failed')),
  extracted_text        text,
  extraction_model_id   text,
  guardrail_scan_status text not null default 'pending'
                          constraint ck_student_uploads_guardrail_scan_status check (
                            guardrail_scan_status in ('pending','clear','blocked')),
  guardrail_reason_code text,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- DERIVED name: 7.3.6 says `storage_key` is "unique" but does not name the object; 6.1's
  -- convention gives this one.
  constraint uq_student_uploads_storage_key unique (storage_key),
  -- Reading A6: 7.3.6 states "required when guardrail_scan_status = 'blocked'" as prose.
  -- Structural enforcement beats handler validation, so it is a CHECK.
  constraint ck_student_uploads_guardrail_reason check (
    guardrail_scan_status <> 'blocked' or guardrail_reason_code is not null)
);

-- 06 section 6.6
create index idx_student_uploads_student on student_uploads (student_id, assignment_id);
