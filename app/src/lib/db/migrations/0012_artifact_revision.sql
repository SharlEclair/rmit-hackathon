-- 0012_artifact_revision.sql
--
-- Phase 4 (WP-06) adds the optimistic-concurrency token the review contract already assumes:
-- `revision`, on the seven tables that carry a `publication_status`.
--
-- Why this column exists (handoff issue **I-16**, closed by decision **D98**):
--
--   06 section 5.5.8 types `ReviewArtifactResponse.revision` as "optimistic concurrency token"
--   and `StructureArtifactPatchRequest.expectedRevision` as its precondition, and 06 section 3.2
--   transition 3 guards a tutor PATCH on "expectedRevision matches". Test **T-19** requires two
--   concurrent PATCHes with the same `expectedRevision` to produce one success and one
--   `STALE_REVISION`. But no artifact table in 06 section 7 had a revision column, so the contract
--   had nowhere to live and I-16 left Phase 4 the choice: add the column, or amend the contract.
--   The contract already names the field in two places and a test already depends on it, so adding
--   the column is the reading that changes no promise. 06 sections 7.2.4-7.2.6, 7.2.9-7.2.11 and
--   7.4.4 are updated in the same change, because the SQL files are the schema of record and a
--   column that exists only in a migration is a column nobody can review (00-INDEX section 5
--   rule 3).
--
-- Why an application-managed column and not a trigger:
--
--   The guard is `where revision = $expected`, and the increment has to happen in the same
--   statement as that guard or two concurrent writers can both pass it. A `before update` trigger
--   runs after the row has already been located by the primary key, so it cannot express the
--   precondition -- it could only bump the counter and report the race after the write. Every
--   revision-aware UPDATE therefore carries both halves in one statement
--   (`set revision = revision + 1 ... where revision = $expected`), which is also what makes T-19
--   deterministic rather than a timing test.
--
-- Why every status change bumps it too:
--
--   A tutor approving an artifact while a second tutor has it open for editing is the same lost-
--   update hazard as two edits, and transition 6/8 (a PATCH after APPROVED/PUBLISHED clears the
--   approval stamp and hides the item) is destructive enough that it must not be applied to a row
--   the caller has not seen. So approve, publish, reject and edit all increment.
--
-- Privacy classes (06 section 4.6; stated because 6.7 rule 4 requires the class in a SQL comment):
--   assignment_structures, requirement_nodes, rubric_sections, milestones, checklist_items,
--   ai_policy_rules, faq_entries  --  all identity-free. `revision` is an integer counter, carries
--   no identity and no content, and is the first column added to these tables since Phase 1.
--
-- The default is 1, not 0: 06 section 5.5.8 shows `revision: number` with no sentinel, an artifact
-- that has never been touched is at revision 1, and a client holding 1 is not "holding nothing".
--
-- No destructive statement appears in this file. The seven ALTERs are additive and each table is
-- left with its existing rows at revision 1.

alter table assignment_structures
  add column revision integer not null default 1
    constraint ck_assignment_structures_revision check (revision >= 1);

alter table requirement_nodes
  add column revision integer not null default 1
    constraint ck_requirement_nodes_revision check (revision >= 1);

alter table rubric_sections
  add column revision integer not null default 1
    constraint ck_rubric_sections_revision check (revision >= 1);

alter table milestones
  add column revision integer not null default 1
    constraint ck_milestones_revision check (revision >= 1);

alter table checklist_items
  add column revision integer not null default 1
    constraint ck_checklist_items_revision check (revision >= 1);

alter table ai_policy_rules
  add column revision integer not null default 1
    constraint ck_ai_policy_rules_revision check (revision >= 1);

alter table faq_entries
  add column revision integer not null default 1
    constraint ck_faq_entries_revision check (revision >= 1);
