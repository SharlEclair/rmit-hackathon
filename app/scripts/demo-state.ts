#!/usr/bin/env node
/**
 * `pnpm demo:state` -- produces the **two pre-approval demo states** that `13-DEMO-STORY.md` section 3
 * names and that D81 assigns to WP-12 rather than to the seed.
 *
 * ## Why this exists, and why it is not the seed's job
 *
 * D81 is explicit: "**The demo's pre-approval states are not this seed's job:** `13` section 3 names
 * `state-1-before-ingest` and `state-2-after-ingest` as demo states, and WP-12's `demo/reset.sh` is what
 * produces them; what Phase 1 seeds is the cohort assignment that every later phase's tests and the
 * Assignment Health beat read."
 *
 * The seeded assignment is therefore **fully `PUBLISHED` on purpose**, and that is correct for beats 4-8:
 * gate G1 makes `PUBLISHED` the only student-visible status, and `06` section 7.2.11 makes the guardrail
 * read only published policy rules, so without a published rule the refusal beat cannot happen at all.
 *
 * **But that leaves beats 2 and 3 without a state to run on**, and this is the gap the Phase 7 rehearsal
 * found: turn 6 of the review screen renders `AI generated - requires tutor approval` for unreviewed
 * artifacts, and the seeded assignment has almost none -- 54 `PUBLISHED` to 1 `NEEDS_REVIEW` -- so beat 2's
 * badge and beat 3's "discard a candidate" have almost nothing to act on. `demo/reset.ps1` ran migrations,
 * the drift check and the seed, and produced no pre-approval state at all.
 *
 * ## What it creates
 *
 * Two assignments beside the seeded one, so **the published state stays intact** and beats 4-8 keep working
 * from the same demo run:
 *
 * | State | What it is | Which beats |
 * |---|---|---|
 * | `state-1-before-ingest` | A `draft` assignment with no structure, presented as a freshly created assignment awaiting an upload | Beat 2's opening |
 * | `state-2-after-ingest` | A `published`-assignment-shaped structure whose artifacts are all `NEEDS_REVIEW`, presented as the proposal that just came back | Beats 2 and 3 |
 *
 * **`NEEDS_REVIEW` is not `AI_GENERATED`, and that is deliberate.** `06` section 3.2 transition 1 moves
 * `AI_GENERATED -> NEEDS_REVIEW` immediately on insert, so `NEEDS_REVIEW` **is** the state an artifact is in
 * when the tutor first sees it -- the review screen renders the same badge either way. Seeding the earlier
 * state would mean seeding a state the product is never in by the time a human looks.
 *
 * **Idempotent.** Both assignments are matched by title and reused, so running this twice does not produce
 * four assignments, and `demo/reset.ps1` can call it safely before every rehearsal.
 *
 * Usage: `pnpm demo:state` (needs the database; no server required).
 */

import { randomUUID } from 'node:crypto';

import { withTransaction } from '../src/lib/db/transaction';
import type { Executor } from '../src/lib/db/queries/courses';

const STATE_1_TITLE = 'Case Analysis -- not yet uploaded';
const STATE_2_TITLE = 'Case Analysis -- proposal awaiting review';

/** The assignment whose content the after-ingest state mirrors. */
interface Source {
  readonly id: string;
  readonly courseId: string;
  readonly structureId: string;
  readonly tutorId: string;
}

async function main(): Promise<void> {
  const result = await withTransaction(async (tx) => {
    const source = await findSource(tx);
    if (source === null) {
      throw new Error('No published seeded assignment found; run "pnpm db:seed" first.');
    }

    const beforeId = await ensureBeforeIngest(tx, source);
    const afterId = await ensureAfterIngest(tx, source);
    return { source, beforeId, afterId };
  });

  process.stdout.write('demo states ready\n\n');
  process.stdout.write(`  state-1-before-ingest  ${result.beforeId}\n`);
  process.stdout.write(`     "${STATE_1_TITLE}" -- draft, no structure, awaiting an upload\n\n`);
  process.stdout.write(`  state-2-after-ingest   ${result.afterId}\n`);
  process.stdout.write(`     "${STATE_2_TITLE}" -- proposal with all artifacts NEEDS_REVIEW\n\n`);
  process.stdout.write(`  the seeded cohort assignment is untouched: ${result.source.id}\n`);
  process.stdout.write('\nopen the tutor review screen for the after-ingest assignment to see the badge.\n');
}

/** The seeded assignment every other beat reads: published, with a current structure. */
async function findSource(ex: Executor): Promise<Source | null> {
  const rows = await ex<
    { id: string; course_id: string; structure_id: string; created_by_user_id: string }[]
  >`
    select a.id, a.course_id, s.id as structure_id, a.created_by_user_id
      from assignments a
      join assignment_structures s on s.assignment_id = a.id and s.is_current = true
     where a.status = 'published'
       and exists (select 1 from milestones m
                    where m.assignment_id = a.id and m.publication_status = 'PUBLISHED')
     order by a.created_at asc
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        courseId: row.course_id,
        structureId: row.structure_id,
        tutorId: row.created_by_user_id,
      };
}

/**
 * A `draft` assignment with no structure.
 *
 * `assignments.status = 'draft'` is what makes it the "before ingest" state: no current structure means
 * `findVisibleAssignmentScope` returns `null`, so **no student route can see it** and gate rule G1 holds
 * without any extra work. That is the same property `verify-student.ts` relies on for its not-found checks.
 */
async function ensureBeforeIngest(ex: Executor, source: Source): Promise<string> {
  const existing = await findByTitle(ex, STATE_1_TITLE);
  if (existing !== null) return existing;

  const rows = await ex<{ id: string }[]>`
    insert into assignments (course_id, title, status, created_by_user_id)
    values (${source.courseId}::uuid, ${STATE_1_TITLE}, 'draft', ${source.tutorId}::uuid)
    returning id
  `;
  const created = rows[0];
  if (created === undefined) throw new Error('Could not create the before-ingest assignment.');
  return created.id;
}

/**
 * A published assignment whose structure's artifacts are all `NEEDS_REVIEW`.
 *
 * **The structure is copied from the seeded one rather than reusing it**, because promoting the seeded
 * structure would un-publish the assignment every other beat reads -- and D81's whole point is that the
 * published state is what beats 4-8 need. Copying also means `demo/reset.ps1` can run this repeatedly
 * against a live demo without disturbing it.
 *
 * The copy carries what the review screen renders: milestones, their checklist items, requirement nodes,
 * rubric sections, AI policy rules and FAQ entries -- the six artifact kinds `06` section 3.1's machine
 * knows. Sources are **not** copied: they are the uploaded documents, and re-uploading them is not what a
 * proposal state represents.
 */
async function ensureAfterIngest(ex: Executor, source: Source): Promise<string> {
  const existing = await findByTitle(ex, STATE_2_TITLE);
  if (existing !== null) return existing;

  const assignmentRows = await ex<{ id: string }[]>`
    insert into assignments (course_id, title, status, published_at, current_structure_id, created_by_user_id)
    values (${source.courseId}::uuid, ${STATE_2_TITLE}, 'published', now(), null, ${source.tutorId}::uuid)
    returning id
  `;
  const assignment = assignmentRows[0];
  if (assignment === undefined) throw new Error('Could not create the after-ingest assignment.');

  const structureRows = await ex<{ id: string }[]>`
    insert into assignment_structures (
      assignment_id, version, is_current, publication_status, origin,
      grounding_chunk_ids, approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    values (
      ${assignment.id}::uuid, 1, true, 'PUBLISHED', 'tutor',
      '{}'::uuid[], ${source.tutorId}::uuid, now(), now(), now(), now()
    )
    returning id
  `;
  const structure = structureRows[0];
  if (structure === undefined) throw new Error('Could not create the after-ingest structure.');
  void structure;

  await copyArtifacts(ex, source, assignment.id);

  await ex`
    update assignments
       set current_structure_id = (select id from assignment_structures
                                    where assignment_id = ${assignment.id}::uuid and is_current = true)
     where id = ${assignment.id}::uuid
  `;
  return assignment.id;
}

/**
 * Copy the six artifact kinds across, each landing at `NEEDS_REVIEW`.
 *
 * Written as one statement per table rather than a loop, for the same reason `promoteStructureToNeedsReview`
 * is: a table name cannot be a bound parameter, and composing SQL by string interpolation is how an
 * identifier ends up unquoted.
 */
/**
 * Copy the six artifact kinds across, each landing at `NEEDS_REVIEW`.
 *
 * **Every column list below was read from `information_schema`, not inferred from a sibling table.** The
 * first version of this function borrowed shapes and failed three times in a row -- on `rubric_sections.title`
 * (it is `section_label`), on `checklist_items.category` (it does not exist), and on `deleted_at`
 * predicates for the three tables that have no such column (trap **T33**). A five-second
 * `select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where
 * table_name = '<t>'` would have prevented all three, which is why the correction is recorded here rather
 * than only in the diff.
 *
 * Written as one statement per table rather than a loop, for the same reason `promoteStructureToNeedsReview`
 * is: a table name cannot be a bound parameter, and composing SQL by string interpolation is how an
 * identifier ends up unquoted.
 *
 * `deleted_at` exists on `milestones`, `checklist_items` and `faq_entries` only.
 */
async function copyArtifacts(ex: Executor, source: Source, targetAssignmentId: string): Promise<void> {
  const targetStructureRows = await ex<{ id: string }[]>`
    select id from assignment_structures
     where assignment_id = ${targetAssignmentId}::uuid and is_current = true limit 1
  `;
  const targetStructure = targetStructureRows[0]?.id;
  if (targetStructure === undefined) throw new Error('The after-ingest structure is missing.');

  await ex`
    insert into requirement_nodes (
      assignment_id, structure_id, parent_requirement_node_id, title, verbatim_text,
      source_chunk_id, source_page, source_section_label, map_summary, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    select ${targetAssignmentId}::uuid, ${targetStructure}::uuid, null, title, verbatim_text,
           source_chunk_id, source_page, source_section_label, map_summary, display_order,
           'NEEDS_REVIEW', origin, provenance, grounding_chunk_ids,
           null, null, null, now(), now()
      from requirement_nodes where assignment_id = ${source.id}::uuid
  `;

  await ex`
    insert into rubric_sections (
      assignment_id, structure_id, source_chunk_id, section_label, criteria_text, weight_percent,
      page_from, page_to, map_interpretation, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    select ${targetAssignmentId}::uuid, ${targetStructure}::uuid, source_chunk_id, section_label,
           criteria_text, weight_percent, page_from, page_to, map_interpretation, display_order,
           'NEEDS_REVIEW', origin, provenance, grounding_chunk_ids,
           null, null, null, now(), now()
      from rubric_sections where assignment_id = ${source.id}::uuid
  `;

  // Milestones first, then their items resolved by matching titles within the copied set -- the copied rows
  // have new ids, so the parent link has to be re-established rather than carried over.
  await ex`
    insert into milestones (
      assignment_id, structure_id, title, summary, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    select ${targetAssignmentId}::uuid, ${targetStructure}::uuid, title, summary, display_order,
           'NEEDS_REVIEW', origin, provenance, grounding_chunk_ids,
           null, null, null, now(), now()
      from milestones where assignment_id = ${source.id}::uuid and deleted_at is null
  `;

  // `structure_id` comes from the **copied** milestone, not the source row: it is NOT NULL and pointing it
  // at the source assignment's structure would cross the two assignments.
  await ex`
    insert into checklist_items (
      assignment_id, structure_id, milestone_id, title, planning_level, description, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    select ${targetAssignmentId}::uuid, tm.structure_id, tm.id, ci.title, ci.planning_level,
           ci.description, ci.display_order, 'NEEDS_REVIEW', ci.origin, ci.provenance,
           ci.grounding_chunk_ids, null, null, null, now(), now()
      from checklist_items ci
      join milestones sm on sm.id = ci.milestone_id
      join milestones tm on tm.assignment_id = ${targetAssignmentId}::uuid and tm.title = sm.title
     where ci.assignment_id = ${source.id}::uuid
       and ci.deleted_at is null
       and sm.assignment_id = ${source.id}::uuid
  `;

  await ex`
    insert into ai_policy_rules (
      assignment_id, structure_id, rule_code, rule_text, effect, applies_to, source_chunk_id,
      display_order, publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    select ${targetAssignmentId}::uuid, ${targetStructure}::uuid, rule_code, rule_text, effect,
           applies_to, source_chunk_id, display_order, 'NEEDS_REVIEW', origin, provenance,
           grounding_chunk_ids, null, null, null, now(), now()
      from ai_policy_rules where assignment_id = ${source.id}::uuid
  `;

  // `faq_entries` has no `structure_id` and no milestone link to re-establish. **`source_discussion_post_id`
  // is copied**, because `ck_faq_entries_peer_answer_source` requires it whenever `source_kind =
  // 'peer_answer'` -- and the seeded FAQ holds promoted peer answers, so omitting it failed the constraint.
  // The FK still points at the source assignment's post, which is correct for a *proposal*: it is the same
  // artifact awaiting review in its own structure.
  await ex`
    insert into faq_entries (
      assignment_id, question, answer, source_kind, source_query_id, source_query_message_id,
      source_discussion_post_id, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    select ${targetAssignmentId}::uuid, question, answer, source_kind, source_query_id,
           source_query_message_id, source_discussion_post_id, display_order,
           'NEEDS_REVIEW', origin, provenance, grounding_chunk_ids,
           null, null, null, now(), now()
      from faq_entries where assignment_id = ${source.id}::uuid and deleted_at is null
  `;

  void randomUUID;
}


async function findByTitle(ex: Executor, title: string): Promise<string | null> {
  const rows = await ex<{ id: string }[]>`
    select id from assignments where title = ${title} limit 1
  `;
  return rows[0]?.id ?? null;
}

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
