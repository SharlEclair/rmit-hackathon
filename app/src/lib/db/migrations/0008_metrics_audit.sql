-- 0008_metrics_audit.sql
--
-- Analytics and audit: `analytics_events`, `guardrail_logs`, `milestone_metrics`,
-- `assignment_metrics`, `audit_logs` (06 sections 7.6.1-7.6.5; spec schema.md 2.6).
--
-- Privacy classes (06 section 4.6; stated here because 6.7 rule 4 requires the class in a SQL
-- comment -- the class determines which modules may read the table):
--   analytics_events   identity-free (append-only)
--   guardrail_logs     identity-free (append-only)
--   milestone_metrics  identity-free
--   assignment_metrics identity-free
--   audit_logs         identity-bearing (the actor) (append-only)
--
-- 6.2 rule 4: the append-only tables carry `updated_at` for uniformity and are never updated by
-- application code. Their `set_updated_at()` trigger is harmless there and is attached in
-- 0010_updated_at_triggers.sql for uniformity.
--
-- 8.3 rule 10: adding a column to an identity-free table is a decision, not an edit. That applies
-- to analytics_events, milestone_metrics, assignment_metrics and guardrail_logs.
--
-- No destructive statement appears in this file.

-- ---------------------------------------------------------------------------------------------
-- analytics_events -- 06 section 7.6.1 -- class: identity-free (append-only)
--
-- The single identity-free fact table for cohort insight (4.7.1).
--
-- Prohibited columns, permanently: `student_id`, `user_id`, `anon_identity_id`, `author_user_id`,
-- `display_name`, `email`, `ip_address`, `user_agent`, `filename`, `body`, `text`,
-- `extracted_text`, `session_token` (A-ID-6, 4.7.3). The INSERT above is the enforcement point.
-- ---------------------------------------------------------------------------------------------
create table analytics_events (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null
                      constraint fk_analytics_events_assignments references assignments (id) on delete restrict,
  -- Domain-separated HMAC from 4.7.1 (prefix "aa:ana:v1|"), 32 hex characters. One-way, and no
  -- table maps it back.
  subject_ref       text not null
                      constraint ck_analytics_events_subject_ref check (subject_ref ~ '^[0-9a-f]{32}$'),
  event_type        text not null
                      constraint ck_analytics_events_event_type check (event_type in (
                        'session_started','checklist_item_started','checklist_item_completed',
                        'checklist_item_reopened','query_created','query_resolved',
                        'discussion_post_created','assistant_message_sent','assistant_request_refused',
                        'faq_viewed','brief_viewed','map_node_opened')),
  milestone_id      uuid
                      constraint fk_analytics_events_milestones references milestones (id) on delete restrict,
  checklist_item_id uuid
                      constraint fk_analytics_events_checklist_items references checklist_items (id) on delete restrict,
  -- Present on checklist_item_completed and checklist_item_reopened.
  duration_seconds  integer
                      constraint ck_analytics_events_duration check (
                        duration_seconds is null or duration_seconds >= 0),
  occurred_at       timestamptz not null default now(),
  -- Key allowlist: `source` (ui/api), `surface` (workspace_tab/assistant/discussion), `verdict`,
  -- `reasonCode`. No other key may be written, but a CHECK cannot enforce a JSON key allowlist --
  -- that is test T-15.
  metadata          jsonb not null default '{}'
                      constraint ck_analytics_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 06 section 6.6
create index idx_analytics_events_assignment
  on analytics_events (assignment_id, milestone_id, occurred_at);

-- ---------------------------------------------------------------------------------------------
-- guardrail_logs -- 06 section 7.6.2 -- class: identity-free (append-only)
--
-- The durable guardrail audit row required by D15 and AGENTS section 6.5: the decision, the rule
-- cited, the prompt version.
--
-- Prohibited columns, permanently: `request_text`, `response_text`, `message_body`,
-- `queue_position` derived from identity, `student_id`, `user_id`, `anon_identity_id`, `upload_id`,
-- `extracted_text`, `ip_address`, `user_agent`, `cookie`. The decision is reproducible from
-- `verdict` + `reason_code` + `policy_rule_id` + `prompt_version`; the text is not needed to audit
-- it and must not be stored (C7, AGENTS section 6.5). No MVP endpoint returns this table.
-- ---------------------------------------------------------------------------------------------
create table guardrail_logs (
  id                   uuid primary key default gen_random_uuid(),
  assignment_id        uuid not null
                         constraint fk_guardrail_logs_assignments references assignments (id) on delete restrict,
  -- The opaque session id, not the student.
  assistant_session_id uuid
                         constraint fk_guardrail_logs_assistant_sessions references assistant_sessions (id) on delete restrict,
  assistant_message_id uuid
                         constraint fk_guardrail_logs_assistant_messages references assistant_messages (id) on delete restrict,
  -- Same construction as 7.6.1, so refusal rates can be counted without identity.
  subject_ref          text not null
                         constraint ck_guardrail_logs_subject_ref check (subject_ref ~ '^[0-9a-f]{32}$'),
  verdict              text not null
                         constraint ck_guardrail_logs_verdict check (verdict in
                           ('ALLOW','ALLOW_WITH_SCOPE','CLARIFY','REFUSE','ESCALATE_TO_TUTOR')),
  reason_code          text not null,
  -- null means no published rule applied, which for POL_ABSENT means the Assistant was
  -- unavailable (D47).
  policy_rule_id       uuid
                         constraint fk_guardrail_logs_ai_policy_rules references ai_policy_rules (id) on delete restrict,
  cited_tiers          text[] not null default '{}'
                         constraint ck_guardrail_logs_cited_tiers check (
                           cited_tiers <@ array['T1','T2','T3','T4','T5']),
  model_id             text,
  prompt_version       text not null,
  latency_ms           integer
                         constraint ck_guardrail_logs_latency check (latency_ms is null or latency_ms >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 06 section 6.6
create index idx_guardrail_logs_assignment on guardrail_logs (assignment_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- milestone_metrics -- 06 section 7.6.3 -- class: identity-free
--
-- The aggregate read model behind the tutor's per-milestone rows (5.5.11), built by the query in
-- 4.7.2.
-- ---------------------------------------------------------------------------------------------
create table milestone_metrics (
  id                      uuid primary key default gen_random_uuid(),
  assignment_id           uuid not null
                            constraint fk_milestone_metrics_assignments references assignments (id) on delete restrict,
  milestone_id            uuid not null
                            constraint fk_milestone_metrics_milestones references milestones (id) on delete restrict,
  window_start            timestamptz not null,
  window_end              timestamptz not null,
  -- The k-anonymity floor, enforced by the schema (D32, I-5). The whole point is that even a
  -- hand-written INSERT cannot create a de-anonymising bucket.
  contributor_count       integer not null
                            constraint ck_milestone_metrics_contributor_count check (contributor_count >= 5),
  started_count           integer not null
                            constraint ck_milestone_metrics_started_count check (started_count >= 0),
  completed_count         integer not null
                            constraint ck_milestone_metrics_completed_count check (completed_count >= 0),
  completion_rate         numeric(5,4) not null
                            constraint ck_milestone_metrics_completion_rate check (completion_rate between 0 and 1),
  average_elapsed_seconds integer
                            constraint ck_milestone_metrics_average_elapsed check (
                              average_elapsed_seconds is null or average_elapsed_seconds >= 0),
  median_elapsed_seconds  numeric(10,2)
                            constraint ck_milestone_metrics_median_elapsed check (
                              median_elapsed_seconds is null or median_elapsed_seconds >= 0),
  -- Tutor-directed questions only: private Queries plus flagged discussion posts (D49), from
  -- step 2 in 4.7.2.
  question_count          integer not null default 0,
  -- Metric M6, reported separately and never added to question_count (D49).
  assistant_turn_count    integer not null default 0,
  -- All posts, not only flagged ones.
  discussion_post_count   integer not null default 0,
  difficulty_score        numeric(5,2),
  computed_at             timestamptz not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint ck_milestone_metrics_window check (window_end > window_start),
  constraint uq_milestone_metrics_window unique (milestone_id, window_start, window_end)
);

-- There is deliberately no `is_suppressed` column and no row for a bucket below the floor:
-- absence is uniform, so a reader cannot tell "0 contributors" from "4 contributors" (4.7.2).
-- Every analytics number the tutor sees is either a row from this table or the Insufficient data
-- state.

-- ---------------------------------------------------------------------------------------------
-- assignment_metrics -- 06 section 7.6.4 -- class: identity-free
--
-- The Assignment Health headline row (5.5.11).
-- ---------------------------------------------------------------------------------------------
create table assignment_metrics (
  id                              uuid primary key default gen_random_uuid(),
  assignment_id                   uuid not null
                                    constraint fk_assignment_metrics_assignments references assignments (id) on delete restrict,
  window_start                    timestamptz not null,
  window_end                      timestamptz not null,
  -- An enrolment fact (count(*) over enrollments), not student activity.
  enrolled_count                  integer not null
                                    constraint ck_assignment_metrics_enrolled_count check (enrolled_count >= 0),
  -- null when fewer than 5 (D32).
  active_count                    integer
                                    constraint ck_assignment_metrics_active_count check (
                                      active_count is null or active_count >= 5),
  completed_item_count            integer
                                    constraint ck_assignment_metrics_completed_count check (
                                      completed_item_count is null or completed_item_count >= 0),
  -- Reading A10: `total_item_count` counts published Checklist items of the current structure
  -- whose `deleted_at is null`; a soft-deleted item is not part of the cohort's work.
  total_item_count                integer,
  average_completion_rate         numeric(5,4)
                                    constraint ck_assignment_metrics_average_completion_rate check (
                                      average_completion_rate is null or average_completion_rate between 0 and 1),
  question_count                  integer,
  -- Count only; the milestone detail is in milestone_metrics.
  potential_difficulty_area_count integer,
  computed_at                     timestamptz not null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint ck_assignment_metrics_window check (window_end > window_start),
  constraint uq_assignment_metrics_window unique (assignment_id, window_start, window_end),
  -- 7.6.4 / D52: a tiny cohort suppresses activity metrics at assignment level too, because the
  -- k-anonymity floor applies to the Assignment Health headline and not only to per-milestone
  -- rows. Below five contributors the headline reports "Insufficient data" rather than a number.
  constraint ck_assignment_metrics_small_cohort check (
    enrolled_count >= 5 or (active_count is null and average_completion_rate is null))
);

-- ---------------------------------------------------------------------------------------------
-- audit_logs -- 06 section 7.6.5 -- class: identity-bearing (the actor) (append-only)
--
-- The record of every state transition and tutor mutation, including publication status changes
-- (section 3, 3.5 rule 4). No MVP endpoint returns it.
-- ---------------------------------------------------------------------------------------------
create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  -- null for a system transition.
  actor_user_id uuid
                  constraint fk_audit_logs_users references users (id) on delete restrict,
  actor_role    text
                  constraint ck_audit_logs_actor_role check (
                    actor_role is null or actor_role in ('student','tutor','system')),
  -- Dotted verb, e.g. `artifact.approved`, `assignment.published`.
  action        text not null
                  constraint ck_audit_logs_action_length check (length(action) between 3 and 80),
  target_table  text not null
                  constraint ck_audit_logs_target_table_length check (length(target_table) between 3 and 64),
  target_id     uuid,
  -- Reading A12: redaction of `before`/`after` is application code and NOT a constraint. Permitted
  -- are the artifact's own fields for faq_entries, milestones, checklist_items, ai_policy_rules,
  -- requirement_nodes.map_summary, rubric_sections.map_interpretation, ambiguity_findings.status
  -- and publication_status transitions; prohibited without exception are discussion_posts.body,
  -- query_messages.body, assistant_messages.body, student_uploads.extracted_text,
  -- users.password_hash, any secret, any storage_key, and any student identity attached to a
  -- discussion object (7.6.5). A CHECK cannot inspect nested JSON semantics, so no CHECK is placed
  -- on their contents: the redaction duty belongs to the writer.
  before        jsonb,
  after         jsonb,
  -- The x-request-id of the request that caused the transition.
  request_id    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 06 section 6.6
create index idx_audit_logs_target on audit_logs (target_table, target_id, created_at);
