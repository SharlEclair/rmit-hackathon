-- 0011_ingestion_jobs.sql
--
-- Phase 2 (WP-04/WP-05) adds the two tables the register had left to this packet:
--
--   ingestion_jobs    D60 + 06 section 5.5.8's IngestionStatusResponse. D60 makes a
--                     Postgres-backed job row the execution model for an Assignment Analyst run,
--                     because stage S6 makes several model calls that can outlive a request
--                     timeout. D60's builder note and handoff issue I-15 both assign this table,
--                     its status enum and the `INGESTION_IN_PROGRESS` guard to WP-04/WP-05.
--   llm_call_counters 04 section 5.6: "The counter increments before the call is issued, is held
--                     in Postgres so it survives a restart." The table is not otherwise specified,
--                     so this file defines it.
--
-- Privacy classes (06 section 4.6; stated here because 6.7 rule 4 requires the class in a SQL
-- comment -- the class determines which modules may read the table):
--   ingestion_jobs     identity-bearing (the requesting tutor)
--   llm_call_counters  identity-bearing (a scope key names an assistant session or an upload)
--
-- Design points that are easy to get wrong, stated so the next reader does not "fix" them:
--
--   1. `llm_call_counters.scope_key` is a **single counter per budget unit**, not a row per call.
--      D68 requires attachment extraction to have its own counter and never the assistant session
--      counter; that is achieved by the scope key, so one table serves all three budget classes
--      without a per-class table.
--   2. The "one ingestion run at a time" rule is a **partial unique index**, not application logic
--      and not an inline UNIQUE (trap T19: an inline UNIQUE cannot carry a WHERE). A second POST
--      while a run is queued or running therefore fails at the database, and the route maps that
--      failure to 409 INGESTION_IN_PROGRESS (06 section 5.3).
--   3. `stage` is nullable: a `queued` job has not reached a stage yet, and 06 section 5.5.8
--      types it `... | null`. The eight stages are the S0-S7 of 04 section 7, so `total_stages`
--      is 8 today and is stored rather than hard-coded in the client.
--   4. A `succeeded` job must be at S7. A run that stopped earlier is `failed`, which is what
--      makes "succeeded" mean "the whole pipeline ran" rather than "the last thing it touched".
--
-- 06 sections 7.7.1 and 7.7.2 are the specification; they were added in the same change, because
-- the SQL files are the schema of record and a table that exists only in a migration is a table
-- nobody can review against a spec (00-INDEX section 5 rule 3).
--
-- No destructive statement appears in this file.

-- ---------------------------------------------------------------------------------------------
-- ingestion_jobs -- 06 section 7.7.1 -- class: identity-bearing (the requesting tutor)
-- ---------------------------------------------------------------------------------------------
create table ingestion_jobs (
  id                   uuid primary key default gen_random_uuid(),
  assignment_id        uuid not null
                         constraint fk_ingestion_jobs_assignments references assignments (id) on delete cascade,
  -- The tutor who pressed the button. Not analytics data, and never returned to a student.
  requested_by_user_id uuid not null
                         constraint fk_ingestion_jobs_users references users (id) on delete restrict,
  status               text not null default 'queued'
                         constraint ck_ingestion_jobs_status check (
                           status in ('queued','running','succeeded','failed')),
  -- null until the run reaches a stage (06 section 5.5.8 types this `| null`).
  stage                text
                         constraint ck_ingestion_jobs_stage check (
                           stage is null or stage in ('S0','S1','S2','S3','S4','S5','S6','S7')),
  completed_stages     integer not null default 0
                         constraint ck_ingestion_jobs_completed_stages check (completed_stages >= 0),
  total_stages         integer not null default 8
                         constraint ck_ingestion_jobs_total_stages check (total_stages > 0),
  -- A code, never a stack trace or a driver message (06 section 5.3).
  error_code           text
                         constraint ck_ingestion_jobs_error_code_length check (
                           error_code is null or length(error_code) <= 64),
  -- A sentence safe to show a tutor.
  error_message        text
                         constraint ck_ingestion_jobs_error_message_length check (
                           error_message is null or length(error_message) <= 500),
  started_at           timestamptz,
  finished_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- A running job has a start time; a queued one does not.
  constraint ck_ingestion_jobs_running_started check (
    status <> 'running' or started_at is not null),
  -- A terminal job has a finish time.
  constraint ck_ingestion_jobs_terminal_finished check (
    status not in ('succeeded','failed') or finished_at is not null),
  -- "succeeded" means the whole S0-S7 pipeline ran; stopping earlier is a failure.
  constraint ck_ingestion_jobs_succeeded_stage check (
    status <> 'succeeded' or stage = 'S7'),
  constraint ck_ingestion_jobs_completed_within_total check (completed_stages <= total_stages)
);

-- The polling read: the newest run for an assignment (06 section 5.5.8).
create index idx_ingestion_jobs_assignment on ingestion_jobs (assignment_id, created_at desc);

-- At most one queued-or-running job per assignment. This is the INGESTION_IN_PROGRESS guard
-- (06 section 5.3), enforced where a race actually happens.
create unique index uq_ingestion_jobs_active
  on ingestion_jobs (assignment_id) where status in ('queued','running');

-- ---------------------------------------------------------------------------------------------
-- llm_call_counters -- 06 section 7.7.2 -- class: identity-bearing (a scope key names a session)
-- ---------------------------------------------------------------------------------------------
create table llm_call_counters (
  id          uuid primary key default gen_random_uuid(),
  -- The budget unit. `04` section 5.2: one assistant session, one ingestion run, one
  -- attachment-extraction scope, one moderation batch. Opaque to this table by design: the
  -- counter must not need to know what kind of object it is counting for.
  scope_key   text not null
                constraint ck_llm_call_counters_scope_key_length check (
                  length(scope_key) between 1 and 200),
  scope_kind  text not null
                constraint ck_llm_call_counters_scope_kind check (
                  scope_kind in ('assistant_session','ingestion_run','attachment_extraction','moderation_batch')),
  calls_used  integer not null default 0
                constraint ck_llm_call_counters_calls_used check (calls_used >= 0),
  -- Snapshot of LLM_MAX_CALLS_PER_SESSION at the time the scope opened, so a configuration change
  -- mid-run cannot retroactively authorise or forbid a call already made.
  max_calls   integer not null
                constraint ck_llm_call_counters_max_calls check (max_calls > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_llm_call_counters_scope_key unique (scope_key),
  constraint ck_llm_call_counters_within_limit check (calls_used <= max_calls)
);

-- One trigger for the two new tables. 0010 attached the trigger to the 33 tables that existed
-- then and is immutable once applied, so this file attaches it to the two it adds. A table without
-- the trigger would silently keep a stale `updated_at`, which is what the trigger exists to catch
-- (06 section 6.2 rule 2).
create trigger trg_ingestion_jobs_updated_at
  before update on ingestion_jobs for each row execute function set_updated_at();

create trigger trg_llm_call_counters_updated_at
  before update on llm_call_counters for each row execute function set_updated_at();
