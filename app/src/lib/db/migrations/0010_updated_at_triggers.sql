-- 0010_updated_at_triggers.sql
--
-- `set_updated_at()` and one BEFORE UPDATE trigger per table (06 section 6.2 rule 2; spec
-- schema.md 0.3).
--
-- 6.2 rule 2: "updated_at is set by the query layer on every UPDATE. A set_updated_at() trigger is
-- added as a belt-and-braces measure for manual SQL." The query layer remains the primary writer;
-- this is the safety net for hand-written SQL and for an UPDATE that forgets the column.
--
-- DERIVED body. 06 names `set_updated_at()` but never gives its body, so the generic body below is
-- DERIVED (spec schema.md 0.3, reading A11). It is safe to make generic because it is a no-op on
-- the tables the application never updates. If another work packet ships a different
-- implementation, that implementation wins and this file is superseded by a later migration.
--
-- Reading A11 applied to coverage: the trigger is attached to **every** table, including the
-- append-only ones (`analytics_events`, `guardrail_logs`, `audit_logs`). 6.2 rule 4 gives those
-- tables `updated_at` "for uniformity" while stating that application code never updates them, so
-- the trigger is harmless there and the uniform rule is easier to verify than an exception list.
-- 33 tables, 33 triggers, all named `trg_<table>_updated_at`.
--
-- No destructive statement appears in this file.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- One trigger per table. The table list is literal rather than name-derived, so a missing or
-- misspelled table fails this migration loudly instead of silently skipping a trigger.
do $$
declare
  t text;
begin
  foreach t in array array[
    'users','courses','enrollments','assignments','assignment_sources','source_chunks',
    'assignment_structures','requirement_nodes','rubric_sections','requirement_rubric_links',
    'milestone_requirement_links','milestones','checklist_items','ai_policy_rules',
    'ambiguity_findings','student_assignments','student_checklist_progress','assistant_sessions',
    'assistant_messages','assistant_proactive_messages','student_uploads','queries',
    'query_messages','faq_entries','discussion_threads','discussion_posts','anon_identities',
    'moderation_flags','analytics_events','guardrail_logs','milestone_metrics',
    'assignment_metrics','audit_logs'
  ] loop
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      'trg_' || t || '_updated_at', t);
  end loop;
end $$;
