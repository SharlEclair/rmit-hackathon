/**
 * The student workspace's response builders: `06-DATA-MODEL.md` sections 5.5.3, 5.5.4, 5.5.6 and 5.5.7.
 *
 * **Why the assembly lives here and not in the routes.** Three of the four responses share the same
 * parts (the checklist appears in the bootstrap and in its own route; the policy appears in the
 * bootstrap and in its own route). One builder per response means the bootstrap cannot drift from the
 * endpoints it summarises -- the failure mode where `/checklist` and the workspace tab disagree about
 * the same student's progress.
 *
 * **Every read takes the `VisibleScope`.** A caller that reached this module has already passed gate
 * rule G1, and nothing here can widen what it sees (trap T3).
 */

import type {
  AiPolicyResponse,
  BriefDocumentResponse,
  BriefResponse,
  ChecklistItemResponse,
  ChecklistMilestoneResponse,
  ChecklistProgressResponse,
  ChecklistResponse,
  ChecklistStateApi,
  PlanningLevelApi,
  SourceKindApi,
  StudentWorkspaceResponse,
} from '@/lib/api/types';
import type { Executor } from '@/lib/db/queries/courses';
import {
  listVisibleChecklistItems,
  listVisibleMilestones,
  listVisiblePolicyRules,
  type VisiblePolicyRule,
  type VisibleScope,
} from '@/lib/db/queries/student-visibility';
import {
  findOwnChecklistProgress,
  findVisibleChecklistItem,
  listBriefSections,
  listOwnChecklistProgress,
  listPublishedSourceManifests,
  readPolicyPublishedAt,
  readWorkspaceCounts,
  readWorkspaceHeader,
} from '@/lib/db/queries/student-workspace';
import { buildAssignmentMap } from '@/features/structure/map';

const SOURCE_KINDS: readonly SourceKindApi[] = [
  'brief',
  'rubric',
  'ai_policy',
  'marking_guide',
  'supplementary',
];

const PLANNING_LEVELS: readonly PlanningLevelApi[] = [
  'understand',
  'identify',
  'plan',
  'verify',
  'review',
  'note',
];

const CHECKLIST_STATES: readonly ChecklistStateApi[] = [
  'not_started',
  'in_progress',
  'completed',
];

/**
 * Narrow a stored text value to a contract union without asserting it is one.
 *
 * The columns carry CHECKs for these values, so a fallback is unreachable in practice. It exists so
 * an unexpected value cannot be returned as though it were a contract member: the gate would rather
 * render a conservative default than publish a value the client has no branch for.
 */
function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return allowed.find((entry) => entry === value) ?? fallback;
}

const EFFECTS = ['PROHIBIT', 'ALLOW', 'ESCALATE_TO_TUTOR', 'CLARIFY'] as const;
const APPLIES_TO = ['assistant', 'uploads', 'discussion', 'all'] as const;

/** `06` section 5.5.7. `available: false` is D47's fail-closed state, never a permissive default. */
export async function buildAiPolicyResponse(
  ex: Executor,
  scope: VisibleScope,
): Promise<AiPolicyResponse> {
  const rules = await listVisiblePolicyRules(ex, scope);
  const publishedAt = await readPolicyPublishedAt(ex, scope);
  return {
    assignmentId: scope.assignmentId,
    // `06` section 5.5.7: false means no rule is PUBLISHED. Publish requires at least one approved
    // rule (transition 7), so in practice this is unreachable -- it exists because failing closed
    // must be free, and the Assistant must render as unavailable rather than as an empty box (D47).
    available: rules.length > 0,
    publishedAt,
    truthTier: 'T2',
    rules: rules.map((rule: VisiblePolicyRule) => ({
      id: rule.id,
      ruleCode: rule.ruleCode,
      ruleText: rule.ruleText,
      effect: oneOf(EFFECTS, rule.effect, 'PROHIBIT'),
      appliesTo: oneOf(APPLIES_TO, rule.appliesTo, 'assistant'),
    })),
  };
}

/**
 * `06` section 5.5.6, from the published readers plus this student's own progress.
 *
 * A published Milestone with no published item is still returned, with an empty `items` array: `07`
 * section 4.6 rule 8 requires the panel to render its own empty sentence rather than disappear, so the
 * absence of items is the UI's to state. Dropping the milestone here would silently remove a heading
 * the tutor published.
 *
 * `completionState` is derived from the items and never stored, which is what makes `07` section 4.3
 * rule 9 ("progress marks in the Map and in the Checklist come from the same data and must never
 * disagree") true by construction.
 */
export async function buildChecklistResponse(
  ex: Executor,
  scope: VisibleScope,
  studentId: string,
): Promise<ChecklistResponse> {
  const [milestones, items, progress] = await Promise.all([
    listVisibleMilestones(ex, scope),
    listVisibleChecklistItems(ex, scope),
    listOwnChecklistProgress(ex, scope, studentId),
  ]);

  const progressByItem = new Map(progress.map((row) => [row.itemId, row]));

  const itemsByMilestone = new Map<string, ChecklistItemResponse[]>();
  let completed = 0;
  for (const item of items) {
    const own = progressByItem.get(item.id);
    const state = oneOf(CHECKLIST_STATES, own?.state ?? 'not_started', 'not_started');
    if (state === 'completed') completed += 1;    const mapped: ChecklistItemResponse = {
      id: item.id,
      title: item.title,
      description: item.description,
      planningLevel: oneOf(PLANNING_LEVELS, item.planningLevel, 'understand'),
      displayOrder: item.displayOrder,
      state,
      startedAt: own?.startedAt ?? null,
      completedAt: own?.completedAt ?? null,
      // D48: the FIRST start-to-complete interval. A reopen never adds to it, and the query layer
      // never recomputes it -- the column is the record.
      elapsedSeconds: own?.elapsedSeconds ?? null,
      reopenCount: own?.reopenCount ?? 0,
    };
    const bucket = itemsByMilestone.get(item.milestoneId);
    if (bucket === undefined) itemsByMilestone.set(item.milestoneId, [mapped]);
    else bucket.push(mapped);
  }

  const total = items.length;
  const milestoneResponses: ChecklistMilestoneResponse[] = milestones.map((milestone) => {
    const ownItems = itemsByMilestone.get(milestone.id) ?? [];
    return {
      id: milestone.id,
      title: milestone.title,
      summary: milestone.summary,
      displayOrder: milestone.displayOrder,
      publicationStatus: 'PUBLISHED',
      completionState: completionStateOf(ownItems),
      items: ownItems,
    };
  });

  return {
    assignmentId: scope.assignmentId,
    milestones: milestoneResponses,
    totals: { completed, total, resolutionRate: rate(completed, total) },
  };
}

/**
 * A milestone's state, derived from its own items.
 *
 * `completed` only when every item is completed AND there is at least one item: an empty milestone is
 * `not_started`, not `completed`, because "all zero of zero items are done" would tell a student they
 * had finished something they never saw.
 */
function completionStateOf(items: readonly ChecklistItemResponse[]): ChecklistStateApi {
  if (items.length === 0) return 'not_started';
  if (items.every((item) => item.state === 'completed')) return 'completed';
  if (items.some((item) => item.state !== 'not_started')) return 'in_progress';
  return 'not_started';
}

/**
 * The **UI** state of an item, which is not the stored state.
 *
 * The API and the column have three values (`06` section 5.5.6), but the row component needs four,
 * because `07` section 4.6 rule 6 describes a state the column cannot express: "an item that has been
 * reopened shows the **first** start-to-complete elapsed time and the note `Reopened <n> time(s)`".
 *
 * Deriving `reopened` from `reopenCount` rather than adding a fourth contract value is the reading
 * recorded here: `reopen_count` IS the fact ("this item has been reopened"), the API contract is
 * `06`'s three-value `state`, and the fourth case is presentational. A component that collapsed
 * `reopened` into `in_progress` would lose the elapsed time and the count, which is exactly what D48
 * exists to preserve -- so the distinction is forced at the component's own props by its type
 * (`checklist-item-row.tsx`: `{ state: 'reopened'; elapsed; reopenedCount }`).
 */
export type ChecklistItemUiState = 'not-started' | 'in-progress' | 'complete' | 'reopened';

export function uiStateOf(item: ChecklistItemResponse): ChecklistItemUiState {
  if (item.state === 'not_started') return 'not-started';
  if (item.state === 'in_progress') return 'in-progress';
  return item.reopenCount > 0 ? 'reopened' : 'complete';
}

/**
 * `06` section 5.5.6's `ChecklistProgressResponse`, read back after a transition.
 *
 * Every transition returns this, and it is built by re-reading rather than by trusting the write: the
 * three queries compute `elapsed_seconds` inside Postgres, so the only honest source for the value is
 * the row. That also makes the response idempotent-correct -- repeating `start` returns the standing
 * row rather than a second, invented one.
 *
 * Returns `null` when the item is not in this student's visible scope, which every caller turns into
 * `NOT_FOUND` (trap T3).
 */
export async function buildChecklistProgressResponse(
  ex: Executor,
  scope: VisibleScope,
  studentId: string,
  itemId: string,
): Promise<ChecklistProgressResponse | null> {
  const item = await findVisibleChecklistItem(ex, scope, itemId);
  if (item === null) return null;

  const [own, checklist] = await Promise.all([
    findOwnChecklistProgress(ex, studentId, itemId),
    buildChecklistResponse(ex, scope, studentId),
  ]);

  const state = oneOf(CHECKLIST_STATES, own?.state ?? 'not_started', 'not_started');
  return {
    itemId,
    state,
    startedAt: own?.startedAt ?? null,
    completedAt: own?.completedAt ?? null,
    elapsedSeconds: own?.elapsedSeconds ?? null,
    reopenCount: own?.reopenCount ?? 0,
    totals: checklist.totals,
  };
}

/**
 * A `0..1` rate (`06` section 5.1: "Decimal `0..1` in a field whose name ends in `Rate`"), or `0` when
 * its denominator is zero. A zero denominator is a real state (nothing published yet), and `06`'s
 * conventions forbid using zero to mean "unknown" -- but here zero *is* the value: nothing done out of
 * nothing. The two cases are distinguishable by `total`.
 */
function rate(completed: number, total: number): number {
  if (total === 0) return 0;
  return completed / total;
}

/**
 * `06` section 5.5.4.
 *
 * **The manifest is a manifest, and the text is the stored extraction (I-06).** `06` section 5.5.3
 * would have `brief.sources[]` carry a `viewerUrl`, but no route in the 64-route vocabulary serves
 * document bytes and `LocalStorageDriver.signedUrl` deliberately throws (`signedUrl` -> I-06, T12).
 * Rather than mint a URL to a route that does not exist, the viewer renders each page from the
 * document's own stored verbatim extraction: `sections` here are the extractor's headings and page
 * ranges, and the text behind them is `source_chunks.text` as extracted -- never re-flowed, never
 * summarised, never re-authored (C2, D17, N8).
 *
 * `extractionFailed` is derived from `extraction_status = 'failed'` or a page count of 0, which is
 * `07` section 4.2 rule 8's condition. Deriving it once keeps one definition of "could not be read".
 */
export async function buildBriefResponse(
  ex: Executor,
  scope: VisibleScope,
): Promise<BriefResponse> {
  const [manifests, sections] = await Promise.all([
    listPublishedSourceManifests(ex, scope),
    listBriefSections(ex, scope),
  ]);

  const sectionsBySource = new Map<string, BriefDocumentResponse['sections']>();
  for (const section of sections) {
    const bucket = sectionsBySource.get(section.sourceId);
    const entry = {
      label: section.label,
      pageFrom: section.pageFrom,
      pageTo: section.pageTo,
      sourceChunkIds: section.sourceChunkIds,
    };
    if (bucket === undefined) sectionsBySource.set(section.sourceId, [entry]);
    else bucket.push(entry);
  }

  return {
    assignmentId: scope.assignmentId,
    documents: manifests.map((manifest) => ({
      id: manifest.id,
      kind: oneOf(SOURCE_KINDS, manifest.kind, 'supplementary'),
      mimeType: manifest.mimeType,
      // The contract types this as a number and the column is nullable; a document with no page count
      // has no pages to anchor to, so it reports zero rather than null (which the response cannot
      // express). `extractionFailed` is what the UI reads in that case.
      pageCount: manifest.pageCount ?? 0,
      truthTier: 'T1',
      sections: sectionsBySource.get(manifest.id) ?? [],
      extractionFailed: manifest.extractionFailed,
    })),
  };
}

/**
 * `06` section 5.5.3, the whole workspace in one response.
 *
 * `structure` and `checklist` are `null` when nothing is published inside the assignment, which the
 * contract distinguishes from an empty one: `null` means "not published yet", and `07` section 4.3's
 * empty state is what renders. The Map builder already returns an empty graph in that case, so the
 * null is decided here rather than by the builder.
 *
 * Returns `null` only when the assignment has no readable header, which a caller holding a
 * `VisibleScope` cannot reach -- it exists so the route has one branch rather than an assertion.
 */
export async function buildStudentWorkspace(
  ex: Executor,
  scope: VisibleScope,
  studentId: string,
): Promise<StudentWorkspaceResponse | null> {
  const header = await readWorkspaceHeader(ex, scope);
  if (header === null) return null;

  const [manifests, map, checklist, policy, counts] = await Promise.all([
    listPublishedSourceManifests(ex, scope),
    buildAssignmentMap(ex, scope),
    buildChecklistResponse(ex, scope, studentId),
    buildAiPolicyResponse(ex, scope),
    readWorkspaceCounts(ex, scope, studentId),
  ]);

  const hasStructure = map.nodes.length > 0 || map.edges.length > 0;
  const hasChecklist = checklist.milestones.length > 0;

  return {
    assignment: {
      id: header.id,
      title: header.title,
      courseCode: header.courseCode,
      courseTitle: header.courseTitle,
      // The scope only exists for a published assignment, so this is a fact about the gate, not a
      // value read from the row.
      status: 'published',
      dueAt: header.dueAt,
      publishedAt: header.publishedAt,
    },
    brief: {
      sources: manifests.map((manifest) => ({
        id: manifest.id,
        kind: oneOf(SOURCE_KINDS, manifest.kind, 'supplementary'),
        title: manifest.title,
        mimeType: manifest.mimeType,
        pageCount: manifest.pageCount,
      })),
    },
    structure: hasStructure ? map : null,
    checklist: hasChecklist ? checklist : null,
    policy,
    officialFaqCount: counts.officialFaqCount,
    counts: {
      openQueries: counts.openQueries,
      queriesWithTutorReply: counts.queriesWithTutorReply,
      checklistCompleted: counts.checklistCompleted,
      checklistTotal: counts.checklistTotal,
      resolutionRate: rate(counts.checklistCompleted, counts.checklistTotal),
    },
    dataState: 'ready',
  };
}
