-- 0004_structure.sql
--
-- Assignment definition, part 2: `assignment_structures`, `requirement_nodes`,
-- `rubric_sections`, `requirement_rubric_links`, `milestone_requirement_links`, `milestones`,
-- `checklist_items`, `ai_policy_rules`, `ambiguity_findings` (06 sections 7.2.4-7.2.12;
-- spec schema.md 2.2). This file also adds the deferred `assignments.current_structure_id` FK.
--
-- Privacy classes (06 section 4.6; stated here because 6.7 rule 4 requires the class in a SQL
-- comment -- the class determines which modules may read the table). Every table in this file is
-- identity-free.
--
-- Composite integrity (6.4): the six structure-scoped artifact tables carry both `structure_id`
-- and `assignment_id`, with a composite FK `(structure_id, assignment_id)` referencing
-- `assignment_structures (id, assignment_id)`, so an artifact can never be attached to a
-- structure of a different assignment. That is why `uq_structures_id_assignment` exists on the
-- parent before any child is created.
--
-- Deferred FK: `ambiguity_findings.resolution_faq_entry_id` references `faq_entries`, which is
-- created in `0006_queries_faq.sql`. The column is declared here and the constraint is added
-- there, because 7.2.12 is normative on the column set and faq_entries cannot exist earlier.
--
-- Deliberately absent anywhere in this file (decision A8): no `expectedRevision` and no
-- `revision` column. 06 section 3.2 transition 3, 5.5.8 and test T-19 demand optimistic
-- concurrency (`STALE_REVISION`) but section 7 is normative on names and specifies no storage
-- for it, so handoff issue I-16 stays open and is owned by Phase 2/4. Inventing the column here
-- would change this contract silently.
--
-- No destructive statement appears in this file.

-- ---------------------------------------------------------------------------------------------
-- assignment_structures -- 06 section 7.2.4 -- class: identity-free
--
-- One ingestion output version; the container every AI artifact hangs from. Tier T5 while
-- unapproved. Exactly one structure per assignment is `is_current` (3.3).
-- ---------------------------------------------------------------------------------------------
create table assignment_structures (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null
                        constraint fk_assignment_structures_assignments references assignments (id) on delete restrict,
  version             integer not null
                        constraint ck_assignment_structures_version check (version >= 1),
  is_current          boolean not null default false,
  publication_status  text not null default 'AI_GENERATED'
                        constraint ck_publication_status check (publication_status in
                          ('AI_GENERATED','NEEDS_REVIEW','EDITED','APPROVED','PUBLISHED','REJECTED')),
  origin              text not null default 'ai'
                        constraint ck_origin check (origin in ('ai','tutor')),
  provenance          jsonb
                        constraint ck_provenance_shape check (
                          origin <> 'ai' or (
                            provenance is not null
                            and provenance ? 'modelId'
                            and provenance ? 'promptVersion'
                            and provenance ? 'generatedAt'
                          )),
  grounding_chunk_ids uuid[] not null default '{}',
  approved_by_user_id uuid
                        constraint fk_assignment_structures_users references users (id) on delete restrict,
  approved_at         timestamptz,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- 06 section 9.1 / 8.3 rule 5: a row in APPROVED or PUBLISHED must carry its approval stamp.
  constraint ck_assignment_structures_approval check (
    publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null),
  -- Reading A3: literal replication of the shape 7.2.4 states for the stamp column ("same CHECK
  -- shape as above"), so `approved_at` is tied to the status, not merely non-null.
  constraint ck_assignment_structures_approved_at check (
    approved_at is null or publication_status in ('APPROVED','PUBLISHED')),
  constraint ck_assignment_structures_published_at check (
    publication_status <> 'PUBLISHED' or published_at is not null),
  constraint uq_assignment_structures_version unique (assignment_id, version),
  -- 6.4 "Composite integrity": the target of the six composite FKs below. It must exist before
  -- any child table is created.
  constraint uq_structures_id_assignment unique (id, assignment_id)
);

-- 06 section 6.6: one current structure per assignment (3.3). Partial unique index (trap T19),
-- never an inline UNIQUE constraint.
create unique index uq_assignment_structures_current
  on assignment_structures (assignment_id) where is_current;

-- Deferred from 0003_assignment_sources.sql: `assignments.current_structure_id` ->
-- `assignment_structures (id)` is the circular half of the pair with
-- `assignment_structures.assignment_id` -> `assignments (id)` (spec schema.md 0.4). 7.2.1 says
-- the column is "maintained alongside is_current".
alter table assignments
  add constraint fk_assignments_current_structure
  foreign key (current_structure_id) references assignment_structures (id) on delete restrict;

-- ---------------------------------------------------------------------------------------------
-- requirement_nodes -- 06 section 7.2.5 -- class: identity-free
--
-- An Assignment Map node of kind Requirement; the verbatim anchor that all other Map edges hang
-- from. Tier: `verbatim_text` is T1, `map_summary` is T5.
-- ---------------------------------------------------------------------------------------------
create table requirement_nodes (
  id                         uuid primary key default gen_random_uuid(),
  assignment_id              uuid not null,
  structure_id               uuid not null,
  parent_requirement_node_id uuid,
  -- A label, not the requirement text.
  title                      text not null
                               constraint ck_requirement_nodes_title_length check (length(title) <= 200),
  -- **Immutable after insert** (`IMMUTABLE_FIELD` on PATCH) and must be a substring of the cited
  -- chunk text (I-2, R2). The substring rule is a validator, not a CHECK: a CHECK cannot read
  -- another table.
  verbatim_text              text not null
                               constraint ck_requirement_nodes_verbatim_length check (
                                 length(verbatim_text) between 1 and 2000),
  source_chunk_id            uuid not null
                               constraint fk_requirement_nodes_source_chunks references source_chunks (id) on delete restrict,
  source_page                integer
                               constraint ck_requirement_nodes_source_page check (
                                 source_page is null or source_page >= 1),
  source_section_label       text
                               constraint ck_requirement_nodes_section_label_length check (
                                 source_section_label is null or length(source_section_label) <= 200),
  -- AI interpretation, T5, rendered only in the Map surface.
  map_summary                text
                               constraint ck_requirement_nodes_map_summary_length check (
                                 map_summary is null or length(map_summary) <= 600),
  display_order              integer not null
                               constraint ck_requirement_nodes_display_order check (display_order >= 0),
  publication_status         text not null default 'AI_GENERATED'
                               constraint ck_publication_status check (publication_status in
                                 ('AI_GENERATED','NEEDS_REVIEW','EDITED','APPROVED','PUBLISHED','REJECTED')),
  origin                     text not null default 'ai'
                               constraint ck_origin check (origin in ('ai','tutor')),
  provenance                 jsonb
                               constraint ck_provenance_shape check (
                                 origin <> 'ai' or (
                                   provenance is not null
                                   and provenance ? 'modelId'
                                   and provenance ? 'promptVersion'
                                   and provenance ? 'generatedAt'
                                 )),
  grounding_chunk_ids        uuid[] not null default '{}',
  approved_by_user_id        uuid
                               constraint fk_requirement_nodes_users references users (id) on delete restrict,
  approved_at                timestamptz,
  published_at               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- 6.4 self-reference: RESTRICT plus a CHECK preventing self-reference.
  constraint ck_requirement_nodes_no_self_parent check (
    parent_requirement_node_id is null or parent_requirement_node_id <> id),
  constraint fk_requirement_nodes_structures
    foreign key (structure_id, assignment_id)
    references assignment_structures (id, assignment_id) on delete restrict,
  constraint fk_requirement_nodes_parent
    foreign key (parent_requirement_node_id) references requirement_nodes (id) on delete restrict,
  constraint ck_requirement_nodes_approval check (
    publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null),
  -- Reading A3: same literal shape as 7.2.4.
  constraint ck_requirement_nodes_approved_at check (
    approved_at is null or publication_status in ('APPROVED','PUBLISHED')),
  constraint ck_requirement_nodes_published_at check (
    publication_status <> 'PUBLISHED' or published_at is not null),
  constraint uq_requirement_nodes_structure_order unique (structure_id, display_order)
);

-- 06 section 6.6
create index idx_requirement_nodes_structure on requirement_nodes (structure_id, display_order);

-- ---------------------------------------------------------------------------------------------
-- rubric_sections -- 06 section 7.2.6 -- class: identity-free
--
-- One official marking criterion with its weighting; T1 text plus an optional T5 interpretation.
-- ---------------------------------------------------------------------------------------------
create table rubric_sections (
  id                 uuid primary key default gen_random_uuid(),
  assignment_id      uuid not null,
  structure_id       uuid not null,
  source_chunk_id    uuid not null
                       constraint fk_rubric_sections_source_chunks references source_chunks (id) on delete restrict,
  -- The document's own label.
  section_label      text not null
                       constraint ck_rubric_sections_section_label_length check (length(section_label) <= 200),
  -- Verbatim and immutable; substring check as I-2 (validator, not CHECK).
  criteria_text      text not null
                       constraint ck_rubric_sections_criteria_length check (length(criteria_text) <= 4000),
  -- When present the number must appear in the cited chunk text, else the artifact stays
  -- NEEDS_REVIEW with warning WEIGHT_NOT_FOUND (7.2.6) -- validator, not CHECK.
  weight_percent     numeric(5,2)
                       constraint ck_rubric_sections_weight check (
                         weight_percent is null or (weight_percent >= 0 and weight_percent <= 100)),
  page_from          integer
                       constraint ck_rubric_sections_page_from check (page_from is null or page_from >= 1),
  page_to            integer
                       constraint ck_rubric_sections_page_to check (
                         page_to is null or page_from is null or page_to >= page_from),
  -- T5, Map surface only.
  map_interpretation text
                       constraint ck_rubric_sections_map_interpretation_length check (
                         map_interpretation is null or length(map_interpretation) <= 600),
  display_order      integer not null,
  publication_status text not null default 'AI_GENERATED'
                       constraint ck_publication_status check (publication_status in
                         ('AI_GENERATED','NEEDS_REVIEW','EDITED','APPROVED','PUBLISHED','REJECTED')),
  origin             text not null default 'ai'
                       constraint ck_origin check (origin in ('ai','tutor')),
  provenance         jsonb
                       constraint ck_provenance_shape check (
                         origin <> 'ai' or (
                           provenance is not null
                           and provenance ? 'modelId'
                           and provenance ? 'promptVersion'
                           and provenance ? 'generatedAt'
                         )),
  grounding_chunk_ids uuid[] not null default '{}',
  approved_by_user_id uuid
                       constraint fk_rubric_sections_users references users (id) on delete restrict,
  approved_at        timestamptz,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint fk_rubric_sections_structures
    foreign key (structure_id, assignment_id)
    references assignment_structures (id, assignment_id) on delete restrict,
  constraint ck_rubric_sections_approval check (
    publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null),
  -- Reading A3: same literal shape as 7.2.4.
  constraint ck_rubric_sections_approved_at check (
    approved_at is null or publication_status in ('APPROVED','PUBLISHED')),
  constraint ck_rubric_sections_published_at check (
    publication_status <> 'PUBLISHED' or published_at is not null),
  constraint uq_rubric_sections_structure_order unique (structure_id, display_order)
);

-- 06 section 6.6
create index idx_rubric_sections_structure on rubric_sections (structure_id, display_order);

-- ---------------------------------------------------------------------------------------------
-- requirement_rubric_links -- 06 section 7.2.7 -- class: identity-free
--
-- An Assignment Map edge from a Requirement to a Rubric section, AI-proposed or tutor-drawn.
-- No `publication_status`: an edge is rendered only when both endpoints are PUBLISHED (5.5.5).
-- ---------------------------------------------------------------------------------------------
create table requirement_rubric_links (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null
                        constraint fk_requirement_rubric_links_assignments references assignments (id) on delete restrict,
  requirement_node_id uuid not null
                        constraint fk_requirement_rubric_links_requirement_nodes references requirement_nodes (id) on delete restrict,
  rubric_section_id   uuid not null
                        constraint fk_requirement_rubric_links_rubric_sections references rubric_sections (id) on delete restrict,
  -- null means AI-proposed.
  created_by_user_id  uuid
                        constraint fk_requirement_rubric_links_users references users (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- DERIVED name: 7.2.7 states the UNIQUE but does not name the object; 6.1's convention gives
  -- this one.
  constraint uq_requirement_rubric_links unique (requirement_node_id, rubric_section_id)
);

-- ---------------------------------------------------------------------------------------------
-- milestones -- 06 section 7.2.9 -- class: identity-free
--
-- A larger conceptual stage of work. Tier T3 once published. Carries `deleted_at` (6.5) because
-- student progress references items and a hard delete would orphan that progress.
--
-- Created before `milestone_requirement_links` because that table's `milestone_id` FK needs this
-- parent (spec schema.md 2.2 note).
-- ---------------------------------------------------------------------------------------------
create table milestones (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null,
  structure_id        uuid not null,
  title               text not null
                        constraint ck_milestones_title_length check (length(title) <= 160),
  summary             text
                        constraint ck_milestones_summary_length check (
                          summary is null or length(summary) <= 600),
  display_order       integer not null
                        constraint ck_milestones_display_order check (display_order >= 0),
  publication_status  text not null default 'AI_GENERATED'
                        constraint ck_publication_status check (publication_status in
                          ('AI_GENERATED','NEEDS_REVIEW','EDITED','APPROVED','PUBLISHED','REJECTED')),
  origin              text not null default 'ai'
                        constraint ck_origin check (origin in ('ai','tutor')),
  provenance          jsonb
                        constraint ck_provenance_shape check (
                          origin <> 'ai' or (
                            provenance is not null
                            and provenance ? 'modelId'
                            and provenance ? 'promptVersion'
                            and provenance ? 'generatedAt'
                          )),
  grounding_chunk_ids uuid[] not null default '{}',
  approved_by_user_id uuid
                        constraint fk_milestones_users references users (id) on delete restrict,
  approved_at         timestamptz,
  published_at        timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint fk_milestones_structures
    foreign key (structure_id, assignment_id)
    references assignment_structures (id, assignment_id) on delete restrict,
  constraint ck_milestones_approval check (
    publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null),
  -- Reading A3: same literal shape as 7.2.4.
  constraint ck_milestones_approved_at check (
    approved_at is null or publication_status in ('APPROVED','PUBLISHED')),
  constraint ck_milestones_published_at check (
    publication_status <> 'PUBLISHED' or published_at is not null)
);

-- 7.2.9: UNIQUE (structure_id, display_order) WHERE deleted_at IS NULL. A partial unique cannot
-- be an inline UNIQUE constraint; it is an index (trap T19).
create unique index uq_milestones_structure_order
  on milestones (structure_id, display_order) where deleted_at is null;

-- 06 section 6.6
create index idx_milestones_structure
  on milestones (structure_id, display_order) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- milestone_requirement_links -- 06 section 7.2.8 -- class: identity-free
--
-- An Assignment Map edge from a Requirement to a Milestone. A milestone with no requirement link
-- is the publish blocker MILESTONE_WITHOUT_REQUIREMENT (7.2.8, D71) -- a validator rule, not a
-- CHECK, because it spans rows.
-- ---------------------------------------------------------------------------------------------
create table milestone_requirement_links (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null
                        constraint fk_milestone_requirement_links_assignments references assignments (id) on delete restrict,
  requirement_node_id uuid not null
                        constraint fk_milestone_requirement_links_requirement_nodes references requirement_nodes (id) on delete restrict,
  milestone_id        uuid not null
                        constraint fk_milestone_requirement_links_milestones references milestones (id) on delete restrict,
  -- null means AI-proposed.
  created_by_user_id  uuid
                        constraint fk_milestone_requirement_links_users references users (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- DERIVED name: 7.2.8 states the UNIQUE but does not name the object; 6.1's convention gives
  -- this one.
  constraint uq_milestone_requirement_links unique (milestone_id, requirement_node_id)
);

-- ---------------------------------------------------------------------------------------------
-- checklist_items -- 06 section 7.2.10 -- class: identity-free
--
-- A granular, self-checkable progress item under a Milestone. Tier T3 once published.
-- O1/D20 volume guidance is 3 to 6 items per milestone and the imperative-verb rejection is a
-- validator rule with warning CHECKLIST_IMPERATIVE, not a CHECK.
-- ---------------------------------------------------------------------------------------------
create table checklist_items (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null,
  structure_id        uuid not null,
  milestone_id        uuid not null
                        constraint fk_checklist_items_milestones references milestones (id) on delete restrict,
  title               text not null
                        constraint ck_checklist_items_title_length check (length(title) between 3 and 160),
  planning_level      text not null
                        constraint ck_checklist_items_planning_level check (planning_level in
                          ('understand','identify','plan','verify','review','note')),
  description         text
                        constraint ck_checklist_items_description_length check (
                          description is null or length(description) <= 600),
  display_order       integer not null,
  publication_status  text not null default 'AI_GENERATED'
                        constraint ck_publication_status check (publication_status in
                          ('AI_GENERATED','NEEDS_REVIEW','EDITED','APPROVED','PUBLISHED','REJECTED')),
  origin              text not null default 'ai'
                        constraint ck_origin check (origin in ('ai','tutor')),
  provenance          jsonb
                        constraint ck_provenance_shape check (
                          origin <> 'ai' or (
                            provenance is not null
                            and provenance ? 'modelId'
                            and provenance ? 'promptVersion'
                            and provenance ? 'generatedAt'
                          )),
  grounding_chunk_ids uuid[] not null default '{}',
  approved_by_user_id uuid
                        constraint fk_checklist_items_users references users (id) on delete restrict,
  approved_at         timestamptz,
  published_at        timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint fk_checklist_items_structures
    foreign key (structure_id, assignment_id)
    references assignment_structures (id, assignment_id) on delete restrict,
  constraint ck_checklist_items_approval check (
    publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null),
  -- Reading A3: same literal shape as 7.2.4.
  constraint ck_checklist_items_approved_at check (
    approved_at is null or publication_status in ('APPROVED','PUBLISHED')),
  constraint ck_checklist_items_published_at check (
    publication_status <> 'PUBLISHED' or published_at is not null)
);

-- 7.2.10: UNIQUE (milestone_id, display_order) WHERE deleted_at IS NULL. Partial, so an index.
create unique index uq_checklist_items_milestone_order
  on checklist_items (milestone_id, display_order) where deleted_at is null;

-- 06 section 6.6
create index idx_checklist_items_milestone
  on checklist_items (milestone_id, display_order) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- ai_policy_rules -- 06 section 7.2.11 -- class: identity-free
--
-- One rule of the assignment-specific AI Usage Policy (D9). Tier T2 once published, T5 before.
-- The guardrail reads only PUBLISHED rules; with none published it returns REFUSE with reason
-- code POL_ABSENT and the Assistant is unavailable (D47). There is no permissive platform
-- default.
-- ---------------------------------------------------------------------------------------------
create table ai_policy_rules (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null,
  structure_id        uuid not null,
  rule_code           text not null
                        constraint ck_ai_policy_rules_rule_code check (rule_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  -- Tutor-approved wording, quoted verbatim in a refusal.
  rule_text           text not null
                        constraint ck_ai_policy_rules_rule_text_length check (length(rule_text) between 10 and 600),
  effect              text not null
                        constraint ck_ai_policy_rules_effect check (
                          effect in ('PROHIBIT','ALLOW','ESCALATE_TO_TUTOR','CLARIFY')),
  applies_to          text not null
                        constraint ck_ai_policy_rules_applies_to check (
                          applies_to in ('assistant','uploads','discussion','all')),
  -- The clause the rule was extracted from.
  source_chunk_id     uuid
                        constraint fk_ai_policy_rules_source_chunks references source_chunks (id) on delete restrict,
  -- Reading A4: 7.2.11 gives this column as `display_order integer not null` with no UNIQUE and
  -- no CHECK (>= 0), unlike every sibling artifact table. The omission is deliberate in the doc
  -- (perhaps because rule order is advisory), and a migration may not narrow a contract by
  -- inventing a constraint the schema of record does not state. No uniqueness, no range check.
  display_order       integer not null,
  publication_status  text not null default 'AI_GENERATED'
                        constraint ck_publication_status check (publication_status in
                          ('AI_GENERATED','NEEDS_REVIEW','EDITED','APPROVED','PUBLISHED','REJECTED')),
  origin              text not null default 'ai'
                        constraint ck_origin check (origin in ('ai','tutor')),
  provenance          jsonb
                        constraint ck_provenance_shape check (
                          origin <> 'ai' or (
                            provenance is not null
                            and provenance ? 'modelId'
                            and provenance ? 'promptVersion'
                            and provenance ? 'generatedAt'
                          )),
  grounding_chunk_ids uuid[] not null default '{}',
  approved_by_user_id uuid
                        constraint fk_ai_policy_rules_users references users (id) on delete restrict,
  approved_at         timestamptz,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint fk_ai_policy_rules_structures
    foreign key (structure_id, assignment_id)
    references assignment_structures (id, assignment_id) on delete restrict,
  constraint ck_ai_policy_rules_approval check (
    publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null),
  -- Reading A3: same literal shape as 7.2.4.
  constraint ck_ai_policy_rules_approved_at check (
    approved_at is null or publication_status in ('APPROVED','PUBLISHED')),
  constraint ck_ai_policy_rules_published_at check (
    publication_status <> 'PUBLISHED' or published_at is not null),
  constraint uq_ai_policy_rules_structure_rule_code unique (structure_id, rule_code)
);

-- 06 section 6.6
create index idx_ai_policy_rules_assignment on ai_policy_rules (assignment_id, publication_status);

-- ---------------------------------------------------------------------------------------------
-- ambiguity_findings -- 06 section 7.2.12 -- class: identity-free
--
-- A potential ambiguity or contradiction the Assignment Analyst located during ingestion.
-- Tier T5, tutor-facing only, and never student-visible at any status.
--
-- Reading A5 applied here: 7.2.12 gives `structure_id` a **plain** FK to
-- `assignment_structures (id)`, not the composite `(structure_id, assignment_id)` pair that
-- 8.2's summary lists it under. 7.2.12 also gives this table no `grounding_chunk_ids` and no
-- approval stamps, even though it carries `origin`/`provenance` per 6.11. Section 7 is normative
-- on a table's columns, so the composite FK is not added and the missing columns are not
-- invented.
--
-- There is no `proposed_clarification` column and there must never be one (D23, C2): the system
-- detects and locates, the tutor authors the clarification, and the only way a finding closes as
-- resolved is by linking to a FAQ entry the tutor published.
-- ---------------------------------------------------------------------------------------------
create table ambiguity_findings (
  id                      uuid primary key default gen_random_uuid(),
  assignment_id           uuid not null
                            constraint fk_ambiguity_findings_assignments references assignments (id) on delete restrict,
  structure_id            uuid not null,
  source_id               uuid
                            constraint fk_ambiguity_findings_sources references assignment_sources (id) on delete restrict,
  kind                    text not null
                            constraint ck_ambiguity_findings_kind check (kind in ('ambiguity','contradiction')),
  severity                text not null
                            constraint ck_ambiguity_findings_severity check (severity in ('low','medium','high')),
  title                   text not null
                            constraint ck_ambiguity_findings_title_length check (length(title) <= 200),
  description             text not null
                            constraint ck_ambiguity_findings_description_length check (length(description) <= 1000),
  located_page            integer
                            constraint ck_ambiguity_findings_located_page check (
                              located_page is null or located_page >= 1),
  located_section_label   text
                            constraint ck_ambiguity_findings_section_label_length check (
                              located_section_label is null or length(located_section_label) <= 200),
  excerpt_a               text not null
                            constraint ck_ambiguity_findings_excerpt_a_length check (length(excerpt_a) <= 500),
  excerpt_b               text
                            constraint ck_ambiguity_findings_excerpt_b_length check (
                              excerpt_b is null or length(excerpt_b) <= 500)
                            constraint ck_ambiguity_findings_excerpt_b_required check (
                              kind <> 'contradiction' or excerpt_b is not null),
  source_chunk_ids        uuid[] not null
                            constraint ck_ambiguity_findings_source_chunks check (
                              array_length(source_chunk_ids, 1) >= 1),
  status                  text not null default 'open'
                            constraint ck_ambiguity_findings_status check (status in
                              ('open','acknowledged','resolved_by_clarification','dismissed')),
  -- FK to faq_entries added by 0006_queries_faq.sql; that table cannot exist this early.
  resolution_faq_entry_id uuid,
  resolved_by_user_id     uuid
                            constraint fk_ambiguity_findings_users references users (id) on delete restrict,
  resolved_at             timestamptz,
  origin                  text not null default 'ai'
                            constraint ck_ambiguity_findings_origin check (origin = 'ai'),
  provenance              jsonb
                            constraint ck_provenance_shape check (
                              origin <> 'ai' or (
                                provenance is not null
                                and provenance ? 'modelId'
                                and provenance ? 'promptVersion'
                                and provenance ? 'generatedAt'
                              )),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint fk_ambiguity_findings_structures
    foreign key (structure_id) references assignment_structures (id) on delete restrict,
  constraint ck_ambiguity_findings_resolution check (
    status <> 'resolved_by_clarification' or resolution_faq_entry_id is not null)
);

-- 06 section 6.6
create index idx_ambiguity_findings_assignment on ambiguity_findings (assignment_id, status);
