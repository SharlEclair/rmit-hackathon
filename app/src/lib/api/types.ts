/**
 * Shared API response contracts.
 *
 * `04` S5.1 requires typed request/response contracts shared with the client. This file
 * is the home for the response types `06-DATA-MODEL.md` S5.4 references: Phase 0 found
 * about ten of them referenced but never defined (handoff I-03), and the rule recorded
 * there is to define each one when the route that returns it is built. `/api/health` is
 * the first such route, so `HealthResponse` is defined here (decision **D76**).
 *
 * Nothing in this file may contain a secret (C7). A response type that has a field for a
 * key, a hash, or a raw session token is a defect, not a convenience.
 */

/**
 * `GET /api/health` -> 200. Liveness and provider-configuration *presence*, never values
 * (`06` S5.4). Public route: it must not reveal whether a key is valid, only whether the
 * app is up and how it is configured.
 *
 * - `ok`          -- true only when there are no config problems **and** the database answers.
 * - `db`          -- `down` also covers "`DATABASE_URL` is not set"; the process stays alive (D77).
 * - `llmProvider` -- the resolved provider id, never the key (`gemini` | `deepseek` | `mock`).
 * - `commit`      -- short SHA, or `unknown`.
 */
export interface HealthResponse {
  ok: boolean;
  db: 'up' | 'down';
  llmProvider: string;
  commit: string;
}

/**
 * `POST|GET /api/tutor/assignments/{assignmentId}/ingest` (`06` section 5.5.8).
 *
 * The polling shape for the Postgres-backed job row D60 makes the execution model. Phase 2 built the
 * row (migration `0011`, `06` section 7.7.1) and this response, closing handoff issue I-15 for the
 * response half; the row's stage enum is `S0`-`S7`.
 */
export interface IngestionStatusResponse {
  jobId: string;
  assignmentId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | null;
  /** `S0`-`S7` = 8 stages today. Sent rather than hard-coded in the client. */
  completedStages: number;
  totalStages: number;
  startedAt: string;
  finishedAt: string | null;
  error: { code: string; message: string } | null;
}

/**
 * `POST /api/student/uploads` and `GET /api/student/uploads/{uploadId}` (`06` section 5.5.10).
 *
 * **`storageKey`, the original filename and the extracted text are absent by contract.** They exist
 * on the row and must never appear here (I-7, `06` section 5.5.10).
 */
export interface StudentUploadResponse {
  id: string;
  kind: 'image' | 'pdf' | 'text';
  mimeType: string;
  byteSize: number;
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'failed';
  guardrailScanStatus: 'pending' | 'clear' | 'blocked';
  guardrailReasonCode: string | null;
  createdAt: string;
}

/**
 * `POST /api/tutor/assignments/{assignmentId}/sources` (`06` section 5.4).
 *
 * `05-ISSUES.md` I-03 lists `AssignmentSourceResponse` among the response types `06` references and
 * never defines; this is its definition, written when the route that returns it was built.
 * `storageKey` is absent for the same reason as above (`06` section 6.9 rule 2).
 */
export interface AssignmentSourceResponse {
  id: string;
  kind: 'brief' | 'rubric' | 'ai_policy' | 'marking_guide' | 'supplementary';
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  pageCount: number | null;
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'failed';
  extractionError: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------------------------
// Phase 4 (WP-06): the tutor review contract of `06` section 5.5.8.
//
// Defined here, in one place, when the routes that return them were built -- which is the rule
// recorded against handoff I-03 and repeated for I-41. The five payload types below are the
// concrete form of I-41's complaint: `06` section 5.5.8's `payload` union names six payloads and
// defines only `RequirementNodePayload`. (`RubricSectionPayload` is the fifth missing one; I-41
// named the other four, and it is the same gap.)
//
// **No payload carries a column a tutor may not change.** `revision`, the status, the stamps,
// `origin`, `provenance` and `grounding_chunk_ids` are response-level fields, not payload fields, so
// a PATCH body cannot express them. That is structural rather than a validation rule: a field not in
// the type cannot be set by a client that respects the contract, and `IMMUTABLE_FIELD` (409) catches
// the one that does not.
// ---------------------------------------------------------------------------------------------

/** `06` section 3.1. `text` + CHECK in the schema, never a Postgres enum. */
export type PublicationStatusApi =
  | 'AI_GENERATED'
  | 'NEEDS_REVIEW'
  | 'EDITED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED';

/** `assignments.status` (`06` section 7.2.1). Distinct from every `publicationStatus` (section 3.6). */
export type AssignmentStatusApi = 'draft' | 'ingesting' | 'in_review' | 'published' | 'archived';

/**
 * `06` section 5.4's `AssignmentResponse`, returned by the assignment routes.
 *
 * One of the response types `06` references and never defined (handoff **I-03**), so it is defined
 * here when the first route that returns it was built -- Phase 4's publish route. `status` is the
 * **assignment's** status, never an artifact's: `06` section 3.6 makes the two different fields and
 * forbids a bare `status` from being ambiguous.
 */
export interface AssignmentResponse {
  id: string;
  title: string;
  status: AssignmentStatusApi;
  dueAt: string | null;
  currentStructureId: string | null;
}

/** `06` section 2.2. Computed at read time from the artifact kind and its status; never stored. */
export type TruthTierApi = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

/** `06` section 5.5.8's `ValidationWarning.code`, verbatim. */
export type ValidationWarningCode =
  | 'VERBATIM_MISMATCH'
  | 'WEIGHT_NOT_FOUND'
  | 'CHECKLIST_VERB_MISMATCH'
  | 'CHECKLIST_IMPERATIVE'
  | 'UNGROUNDED_ARTIFACT'
  | 'OVERLAPPING_REQUIREMENT';

export interface ValidationWarning {
  code: ValidationWarningCode;
  message: string;
  sourceRef?: { sourceId: string; pageFrom: number; pageTo: number };
}

export interface RequirementNodePayload {
  title: string;
  /** Immutable; a change is a new node (`06` section 7.2.5, I-2). */
  verbatimText: string;
  mapSummary: string | null;
  sourceChunkId: string;
  sourcePage: number | null;
  sourceSectionLabel: string | null;
  displayOrder: number;
}

export interface RubricSectionPayload {
  sectionLabel: string;
  /** Immutable verbatim text (`06` section 7.2.6). */
  criteriaText: string;
  weightPercent: number | null;
  pageFrom: number | null;
  pageTo: number | null;
  mapInterpretation: string | null;
  displayOrder: number;
}

export interface MilestonePayload {
  title: string;
  summary: string | null;
  displayOrder: number;
}

export interface ChecklistItemPayload {
  title: string;
  /**
   * Derived from the title on every save rather than trusted from the client (`06` section 7.2.10
   * rule 2, `checkChecklistItem`). The field is present because the review card displays it; sending
   * a different value changes nothing.
   */
  planningLevel: 'understand' | 'identify' | 'plan' | 'verify' | 'review' | 'note';
  description: string | null;
  displayOrder: number;
}

export interface FaqEntryPayload {
  question: string;
  answer: string;
  milestoneId: string | null;
  displayOrder: number;
}

export interface AiPolicyRulePayload {
  ruleCode: string;
  ruleText: string;
  effect: 'PROHIBIT' | 'ALLOW' | 'ESCALATE_TO_TUTOR' | 'CLARIFY';
  appliesTo: 'assistant' | 'uploads' | 'discussion' | 'all';
  displayOrder: number;
}

/**
 * `assignment_structures` (`06` section 7.2.4).
 *
 * The **seventh** payload the union was missing, found in Phase 4: `ReviewArtifactResponse.kind`
 * includes `structure` and the union had no member for it, so the type could not be satisfied without
 * inventing a shape. Same class as I-41, recorded with it. There is no editable field: the structure's
 * `version` and `is_current` are the pipeline's, so a PATCH on this kind is `IMMUTABLE_FIELD`.
 */
export interface StructurePayload {
  version: number;
  isCurrent: boolean;
}

/** The `payload` union of `06` section 5.5.8. Discriminated by `ReviewArtifactResponse.kind`. */
export type ReviewArtifactPayload =
  | StructurePayload
  | RequirementNodePayload
  | RubricSectionPayload
  | MilestonePayload
  | ChecklistItemPayload
  | FaqEntryPayload
  | AiPolicyRulePayload;

export type ReviewArtifactKind =
  | 'structure'
  | 'requirement_node'
  | 'rubric_section'
  | 'milestone'
  | 'checklist_item'
  | 'faq_entry'
  | 'ai_policy_rule';

export interface ReviewArtifactResponse {
  id: string;
  kind: ReviewArtifactKind;
  publicationStatus: PublicationStatusApi;
  /** Computed at read time (`06` section 2.2); there is no tier column. */
  truthTier: TruthTierApi;
  origin: 'ai' | 'tutor';
  provenance: {
    modelId: string | null;
    promptVersion: string | null;
    generatedAt: string;
    groundingChunkIds: string[];
  };
  /** Optimistic-concurrency token (`06` section 5.5.8; added by migration `0012`; D98). */
  revision: number;
  payload: ReviewArtifactPayload;
  validation: { ok: boolean; warnings: ValidationWarning[] };
}

/** `06` section 5.5.8's `publishBlockers` union, complete per D71. */
export type PublishBlocker =
  | 'NO_POLICY_RULE_APPROVED'
  | 'NO_MILESTONE'
  | 'MILESTONE_WITHOUT_REQUIREMENT'
  | 'PENDING_VALIDATION_WARNINGS';

export interface ReviewBundleResponse {
  assignment: {
    id: string;
    title: string;
    status: 'draft' | 'ingesting' | 'in_review' | 'published' | 'archived';
    dueAt: string | null;
    currentStructureId: string | null;
  };
  /** `null` means no run has ever been requested (`06` section 5.5.8; handoff I-39). */
  ingestion: IngestionStatusResponse | null;
  sources: AssignmentSourceResponse[];
  counts: Record<PublicationStatusApi, number>;
  artifacts: ReviewArtifactResponse[];
  ambiguityFindings: AmbiguityFindingResponse[];
  gates: {
    canIngest: boolean;
    canApprove: boolean;
    canPublish: boolean;
    publishBlockers: PublishBlocker[];
  };
}

/** `06` section 7.2.12. Never student-visible, at any status (D23). */
export interface AmbiguityFindingResponse {
  id: string;
  kind: 'ambiguity' | 'contradiction';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  locatedPage: number | null;
  locatedSectionLabel: string | null;
  excerptA: string;
  excerptB: string | null;
  status: 'open' | 'acknowledged' | 'resolved_by_clarification' | 'dismissed';
  resolutionFaqEntryId: string | null;
}

/**
 * `PATCH /api/tutor/structure-artifacts/{artifactId}` (`06` section 5.5.8).
 *
 * `expectedRevision` is required and is not advisory: a mismatch is `STALE_REVISION` (409) and the
 * row is not written (T-19).
 */
export interface StructureArtifactPatchRequest {
  expectedRevision: number;
  payload: Partial<ReviewArtifactPayload>;
  action: 'save' | 'approve' | 'reject';
  /**
   * Required to approve an artifact that carries warnings. `VERBATIM_MISMATCH` is **not**
   * acknowledgable (`06` section 5.5.8): it must be fixed, or the node rejected.
   */
  acknowledgeWarnings?: ValidationWarningCode[];
}

/** `POST /api/tutor/assignments/{assignmentId}/artifacts` (`06` section 5.4). */
export interface CreateArtifactRequest {
  kind: 'milestone' | 'checklist_item' | 'faq_entry' | 'ai_policy_rule';
  /** The structure the artifact belongs to. Must be the assignment's current structure. */
  structureId: string;
  /** For a `checklist_item`, the milestone it sits under. Ignored for the other kinds. */
  milestoneId?: string;
  payload: Partial<ReviewArtifactPayload>;
}

/** `POST .../approve` and the counts the review screen shows (`06` section 5.5.8's `counts`). */
export interface ReviewCountsResponse {
  counts: Record<PublicationStatusApi, number>;
  /** How many artifacts the call moved, and how many it skipped because none was needed. */
  approved: number;
  skipped: number;
}

/**
 * `GET /api/student/assignments/{assignmentId}/structure` (`06` section 5.5.5, reproduced exactly).
 *
 * Phase 4 ships this one student route because WP-06's verification gate asserts the gate rule G1
 * direction through it: a student request for an unpublished assignment is `404`, and the same
 * request after publish is `200`. Phase 5 (WP-07) owns the rest of the student workspace.
 */
export interface AssignmentMapNodeResponse {
  id: string;
  kind: 'requirement' | 'rubric_section' | 'milestone' | 'checklist_item';
  title: string;
  /** T5, interpretation. */
  mapSummary: string | null;
  /** T1, requirements and rubric sections only. */
  verbatimText: string | null;
  truthTier: 'T1' | 'T3' | 'T5';
  sourceRef: {
    sourceId: string;
    pageFrom: number;
    pageTo: number;
    sectionLabel: string | null;
  } | null;
  /** Students only; Phase 4's structure read omits it because progress is the checklist's (WP-07). */
  progress?: { state: 'not_started' | 'in_progress' | 'completed' };
}

export interface AssignmentMapEdgeResponse {
  from: string;
  to: string;
  kind:
    | 'requirement_rubric'
    | 'requirement_milestone'
    | 'milestone_checklist_item'
    | 'rubric_milestone';
}

export interface AssignmentMapResponse {
  assignmentId: string;
  structureId: string;
  generatedAt: string;
  /** Fixed string; the UI must render it (`06` section 5.5.5, `07` section 2.5). */
  label: 'AI-generated interpretation';
  /** Fixed copy from `07` section 2.5. */
  disclaimer: string;
  nodes: AssignmentMapNodeResponse[];
  /** An edge is present only when both endpoint nodes are `PUBLISHED` (`06` section 5.5.5). */
  edges: AssignmentMapEdgeResponse[];
}

// ---------------------------------------------------------------------------------------------
// Phase 5 (WP-07 and WP-09): the student workspace and Assistant contracts.
//
// The same rule as Phase 4's block: define each response type when the route that returns it is
// built, in this one file (`06` S5.4/5.5, handoff I-03). Everything below is `06` S5.5.3, S5.5.4,
// S5.5.6, S5.5.7 and S5.5.9 name for name. Nothing here renames a Phase 4 type and nothing adds a
// field `06` does not list: a response type that grows a field the doc does not have is a contract
// change, not an implementation detail.
//
// One deliberate naming note. `06` S5.5.2 names `AssignmentListResponse` and `CourseListResponse`
// and defines neither, and S5.5.6's `ChecklistResponse.milestones[].publicationStatus` is typed
// `'PUBLISHED'` exactly. Both are honoured below. `AssignmentCardResponse` is the element type of
// `AssignmentListResponse`; the doc gives the list shape only, so the element is named here.
// ---------------------------------------------------------------------------------------------

/**
 * `06` section 5.5.2. The list envelope is `{ items }`, not `{ courses }`/`{ assignments }`.
 *
 * The field names and the nullability are the doc's, not a naming preference: this doc's
 * `checklistCompleted`/`checklistTotal` are `number | null` ("null for tutors, and for students
 * before publish"), and `openQueryCount`/`needsReviewCount` are role-exclusive and therefore null
 * for the other role. A field the contract carries must be present and null, never omitted.
 */
export interface CourseListResponse {
  items: CourseResponse[];
}

export interface AssignmentListResponse {
  items: AssignmentListCard[];
}

/** `06` section 5.5.2's inline element type, named here because the doc gives the list shape only. */
export interface AssignmentListCard {
  id: string;
  title: string;
  status: AssignmentStatusApi;
  dueAt: string | null;
  publishedAt: string | null;
  /** `null` for a tutor, and for a student before publish. */
  checklistCompleted: number | null;
  checklistTotal: number | null;
  /** Students only; `null` for a tutor. */
  openQueryCount: number | null;
  /** Tutors only; `null` for a student. */
  needsReviewCount: number | null;
}

/**
 * `06` section 5.4 names `CourseResponse` twice (as the return of `GET /api/courses/{courseId}` and
 * `GET /api/courses`) and section 5.5.2 defines neither it nor a field list, so this is the I-03
 * case: the shape is defined when the route that returns it is built.
 */
export interface CourseResponse {
  id: string;
  code: string;
  title: string;
  term: string;
  roleInCourse: 'student' | 'tutor';
  assignmentCount: number;
}

/** `06` section 5.5.4. `truthTier` is `'T1'` at the document level; the viewer never rewrites text. */
export type SourceKindApi =
  | 'brief'
  | 'rubric'
  | 'ai_policy'
  | 'marking_guide'
  | 'supplementary';

export interface BriefDocumentSectionResponse {
  /** The document's own heading text, verbatim. Never a label this product authored. */
  label: string;
  pageFrom: number;
  pageTo: number;
  sourceChunkIds: string[];
}

export interface BriefDocumentResponse {
  id: string;
  /**
   * The stored filename, for `07` section 4.2 rule 3's `Source: <filename>, page <n>` marker.
   *
   * It is a document label and never requirement text (C2): the document itself is what is rendered
   * verbatim below it.
   */
  title: string;
  kind: SourceKindApi;
  mimeType: string;
  pageCount: number;
  truthTier: 'T1';
  sections: BriefDocumentSectionResponse[];
  /**
   * `07` section 4.2 rule 8's extraction warning. `05-ISSUES.md` I-06 keeps the byte-serving route
   * unbuilt, so this response is a **manifest plus the stored extraction**: `viewerUrl` is absent by
   * design rather than present-but-broken, and `pages` is the verbatim text the viewer renders
   * (WP-07 acceptance criterion: an absent affordance beats a broken one). See **D107**.
   */
  extractionFailed: boolean;
  /**
   * The document's own extracted text, page by page, in reading order.
   *
   * This is `source_chunks.text` as the extractor produced it: never re-flowed, never summarised,
   * never re-authored (C2, D17, N8). It exists because **D107** resolves I-06 by rendering the stored
   * extraction rather than serving document bytes, so the viewer's content has to travel with the
   * manifest. A page with no extracted text is `text: ''`, which the viewer renders as the page's
   * frame with the `07` section 4.2 rule 8 notice rather than as a blank.
   */
  pages: Array<{ page: number; text: string; sourceChunkIds: string[] }>;
}

export interface BriefResponse {
  assignmentId: string;
  documents: BriefDocumentResponse[];
}

/** `06` section 5.5.6. */
export type ChecklistStateApi = 'not_started' | 'in_progress' | 'completed';

export type PlanningLevelApi =
  | 'understand'
  | 'identify'
  | 'plan'
  | 'verify'
  | 'review'
  | 'note';

export interface ChecklistItemResponse {
  id: string;
  title: string;
  description: string | null;
  planningLevel: PlanningLevelApi;
  displayOrder: number;
  state: ChecklistStateApi;
  startedAt: string | null;
  completedAt: string | null;
  /** Labelled `Elapsed time` in the UI, never "time worked" (D33, `07` section 4.6 rule 5). */
  elapsedSeconds: number | null;
  /** D48: a reopened item keeps its first interval and reports how many times it was reopened. */
  reopenCount: number;
}

export interface ChecklistMilestoneResponse {
  id: string;
  title: string;
  summary: string | null;
  displayOrder: number;
  publicationStatus: 'PUBLISHED';
  completionState: ChecklistStateApi;
  items: ChecklistItemResponse[];
}

export interface ChecklistResponse {
  assignmentId: string;
  milestones: ChecklistMilestoneResponse[];
  totals: { completed: number; total: number; resolutionRate: number };
}

export interface ChecklistProgressResponse {
  itemId: string;
  state: ChecklistStateApi;
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number | null;
  reopenCount: number;
  totals: { completed: number; total: number; resolutionRate: number };
}

/** `06` section 5.5.7. `available: false` is D47's fail-closed state, never a permissive default. */
export interface AiPolicyResponse {
  assignmentId: string;
  available: boolean;
  publishedAt: string | null;
  truthTier: 'T2';
  rules: Array<{
    id: string;
    ruleCode: string;
    ruleText: string;
    effect: 'PROHIBIT' | 'ALLOW' | 'ESCALATE_TO_TUTOR' | 'CLARIFY';
    appliesTo: 'assistant' | 'uploads' | 'discussion' | 'all';
  }>;
}

/** `06` section 5.5.3. `null` for `structure`/`checklist` means "not published yet", not "empty". */
export interface StudentWorkspaceResponse {
  assignment: {
    id: string;
    title: string;
    courseCode: string;
    courseTitle: string;
    status: 'published';
    dueAt: string | null;
    publishedAt: string;
  };
  brief: {
    sources: Array<{
      id: string;
      kind: SourceKindApi;
      /** Derived from the filename; the document itself is verbatim (C2). */
      title: string;
      mimeType: string;
      pageCount: number | null;
    }>;
  };
  structure: AssignmentMapResponse | null;
  checklist: ChecklistResponse | null;
  policy: AiPolicyResponse;
  officialFaqCount: number;
  counts: {
    openQueries: number;
    queriesWithTutorReply: number;
    checklistCompleted: number;
    checklistTotal: number;
    resolutionRate: number;
  };
  dataState: 'ready' | 'not_published';
}

/** `06` section 5.5.9. The stream's first event is always `guardrail` (trap T4). */
export type GuardrailVerdictApi =
  | 'ALLOW'
  | 'ALLOW_WITH_SCOPE'
  | 'CLARIFY'
  | 'REFUSE'
  | 'ESCALATE_TO_TUTOR';

export interface AssistantCitation {
  kind: 'source_chunk' | 'faq_entry' | 'milestone' | 'checklist_item' | 'requirement_node';
  id: string;
  /** e.g. `Brief p.4, section 3.2`. Built from provenance, never from a model's assertion. */
  label: string;
  truthTier: TruthTierApi;
  /** `#page=<n>` on the brief manifest, or `null` when no page location exists (D43). */
  deepLink: string | null;
}

export interface RefusalPayload {
  verdict: 'CLARIFY' | 'REFUSE' | 'ESCALATE_TO_TUTOR';
  refusalTemplateId: 'T-REFUSE' | 'T-SCOPE' | 'T-CLARIFY' | 'T-ESCALATE';
  reasonCode: string;
  policyRuleId: string | null;
  policyRuleText: string | null;
  /** 2..4 items, drawn from the approved policy and the fixed affordances (`07` section 4.7.3 rule 3). */
  whatICanHelpWith: string[];
  escalation: { queryDraftUrl: string; milestoneId: string | null } | null;
  /** True only for `POL_ABSENT` (D47): the Assistant has no approved policy and makes no call. */
  unavailable: boolean;
}

/** The transport projection of `GuardrailDecision` (`05` section 7.2); its field set is `05`'s. */
export interface GuardrailEvent {
  verdict: GuardrailVerdictApi;
  rules: string[];
  reasonCode: string;
  deterministic: boolean;
  scope: 'SCOPE_LOCATE' | 'SCOPE_TERM' | 'SCOPE_RUBRIC' | 'SCOPE_POLICY' | 'SCOPE_PROGRESS' | null;
  clarifyingQuestion: string | null;
  policyRef: { policyId: string; version: number } | null;
  refusalTemplateId: 'T-REFUSE' | 'T-SCOPE' | 'T-CLARIFY' | 'T-ESCALATE' | null;
  /** The tiers evaluated, from R4. */
  citedTiers: TruthTierApi[];
  refusal: RefusalPayload | null;
}

/** `POST .../assistant/messages` (`06` section 5.5.9). */
export interface AssistantRequest {
  /** 1..4000 characters. */
  body: string;
  /** Every id must have `guardrail_scan_status = 'clear'`, else 400 with `details.uploadIds` (C6). */
  uploadIds?: string[];
  milestoneId?: string | null;
}

export type AssistantMessageResponse =
  | {
      id: string;
      role: 'student';
      createdAt: string;
      body: string;
      verdict: GuardrailVerdictApi;
      reasonCode: string | null;
      policyRuleId: string | null;
      uploadIds: string[];
    }
  | {
      id: string;
      role: 'assistant';
      createdAt: string;
      body: string;
      isProactive: boolean;
      citedTiers: TruthTierApi[];
      citations: AssistantCitation[];
    };

export interface AssistantSessionResponse {
  sessionId: string;
  assignmentId: string;
  messages: AssistantMessageResponse[];
}

/** `06` section 5.5.9. `null` means no proactive message is due or the last one was dismissed (O2). */
export interface ProactiveMessageResponse {
  noticeId: string;
  milestoneId: string;
  milestoneTitle: string;
  /** At most 3 bullets, each grounded in published content (`07` section 4.7.1 rule 2). */
  bullets: Array<{ text: string; citation: AssistantCitation }>;
  deliveredAt: string;
  dismissedAt: string | null;
}

// ---------------------------------------------------------------------------------------------
// Phase 6 (WP-10 and WP-11): queries, discussions, moderation, FAQ and analytics.
//
// The same rule as every block before this one: define each response type when the route that
// returns it is built, in this one file (`06` S5.4/5.5, handoff I-03). This block also closes three
// types `06` section 5.4 references and never defines -- `QueryMessageResponse`, `FaqEntryResponse`
// and `FaqEntryListResponse` (I-03) -- and every field below is the doc's, name for name and
// nullability for nullability.
//
// **The `author` shape is the anonymity contract, not a convenience.** `06` section 4.4's A-ID-5:
// "No tutor response schema contains a field named `studentId`, `studentName`, `email`, `userId`,
// `anonIdentityId`, or `subjectRef`. `author` objects carry only `isAnonymised` and `displayLabel`."
// That is a type-level guarantee, and `tests/discussion/imports.test.ts` asserts it against these
// declarations. A field added here for convenience is a C4 violation, not a convenience.
// ---------------------------------------------------------------------------------------------

/**
 * `06` section 4.1 and A-ID-5. The **whole** field set of an author reference.
 *
 * `displayLabel` is computed at read time from the persisted `display_number` through the single
 * approved view `discussion_author_display` (D55, trap **T14**), so it survives an `ANON_ID_SECRET`
 * rotation and a client can never construct it.
 */
export interface DiscussionAuthor {
  readonly isAnonymised: boolean;
  readonly displayLabel: string;
}

/** `06` section 5.4's `ModerationFlagResponse.columns` (section 5.5.14). */
export type ModerationTargetKindApi = 'discussion_post' | 'query_message';
export type ModerationSourceApi = 'ai' | 'student';
export type ModerationSeverityApi = 'low' | 'medium' | 'high';
export type ModerationReasonCodeApi =
  | 'HARASSMENT'
  | 'INAPPROPRIATE_CONTENT'
  | 'PERSONAL_INFORMATION'
  | 'PROHIBITED_ASSISTANCE'
  | 'SOLUTION_SHARING'
  | 'OTHER';
export type ModerationStatusApi = 'open' | 'upheld' | 'dismissed';

/** `06` section 5.5.14. **The reporter is never named** (A-ID-5), and a student never sees a count (D30, O3). */
export interface ModerationFlagResponse {
  id: string;
  targetKind: ModerationTargetKindApi;
  targetId: string;
  source: ModerationSourceApi;
  severity: ModerationSeverityApi;
  reasonCode: ModerationReasonCodeApi;
  status: ModerationStatusApi;
  createdAt: string;
  reviewedAt: string | null;
}

/** `06` section 5.5.12. */
export type QueryStatusApi = 'open' | 'answered' | 'resolved' | 'closed';

export interface QueryListResponse {
  items: Array<{
    id: string;
    subject: string | null;
    status: QueryStatusApi;
    milestoneId: string | null;
    createdAt: string;
    lastMessageAt: string | null;
    messageCount: number;
    hasTutorReply: boolean;
  }>;
}

/**
 * `06` section 5.4 names `QueryMessageResponse` for `POST .../queries/{id}/messages` and
 * `POST .../tutor/queries/{id}/reply` and section 5.5.12 defines `QueryThreadResponse` instead
 * (I-03). It is the element of that thread's `messages[]`, plus the thread's own id so a created
 * message is addressable without a second read.
 */
export interface QueryMessageResponse {
  id: string;
  queryId: string;
  authorRole: 'student' | 'tutor';
  /** A private Query is **always attributed** (D24, D50): a student may be anonymous in a Discussion, never here. */
  authorDisplayName: string;
  body: string;
  createdAt: string;
  /** Set when this reply became an official FAQ entry (D24, O8). */
  publishedAsFaqEntryId: string | null;
}

export interface QueryThreadResponse {
  id: string;
  assignmentId: string;
  subject: string | null;
  milestoneId: string | null;
  status: QueryStatusApi;
  createdAt: string;
  resolvedAt: string | null;
  messages: Array<{
    id: string;
    authorRole: 'student' | 'tutor';
    authorDisplayName: string;
    body: string;
    createdAt: string;
    publishedAsFaqEntryId: string | null;
  }>;
}

export interface TutorQueryGroupListResponse {
  /** Topic clustering is out of scope in the MVP (`02` section 2.4), so this is the only value. */
  grouping: 'milestone';
  items: Array<{
    groupKey: string;
    /** The approved Milestone title (T3). */
    label: string;
    labelSource: 'milestone';
    truthTier: 'T3';
    queryCount: number;
    openCount: number;
    queries: QueryListResponse['items'];
  }>;
}

/** `06` section 5.5.13. */
export type DiscussionThreadStatusApi = 'open' | 'locked' | 'removed';
export type DiscussionPostStatusApi = 'visible' | 'hidden_pending_review' | 'removed';
/** `06` section 5.5.13 gives four values; `proposed` has no producer in the MVP (`03-PRD` goes none -> approved/rejected). */
export type AcceptedAnswerStatusApi = 'none' | 'proposed' | 'approved' | 'rejected';

export interface DiscussionPostResponse {
  id: string;
  parentPostId: string | null;
  /**
   * `null` for a post with `status = 'hidden_pending_review'` when the caller is a student other than
   * the author (`06` section 5.5.13): the row shows `Hidden pending tutor review`.
   */
  body: string | null;
  status: DiscussionPostStatusApi;
  acceptedAnswerStatus: AcceptedAnswerStatusApi;
  author: DiscussionAuthor;
  createdAt: string;
  editedAt: string | null;
  /** Students only, resolved server-side. Never derived from a client-supplied id. */
  isOwnPost: boolean;
  /** Tutors only. */
  editedByModerator: boolean;
}

export interface DiscussionThreadResponse {
  id: string;
  title: string;
  milestoneId: string | null;
  status: DiscussionThreadStatusApi;
  postCount: number;
  lastPostAt: string | null;
  createdAt: string;
  author: DiscussionAuthor;
  /** Students only, resolved server-side. */
  isOwnThread: boolean;
  posts: DiscussionPostResponse[];
}

export interface StudentDiscussionResponse {
  /** T2, published only. */
  officialFaq: FaqEntryListResponse['items'];
  threads: DiscussionThreadResponse[];
}

export interface TutorDiscussionResponse {
  officialFaq: FaqEntryListResponse['items'];
  threads: DiscussionThreadResponse[];
  /** **No reporter identity** (`06` section 4.4). */
  moderationQueue: ModerationFlagResponse[];
}

/** `06` section 5.4's `FaqEntryResponse` and `FaqEntryListResponse`, both referenced and never defined (I-03). */
export type FaqSourceKindApi = 'ai_candidate' | 'query_reply' | 'peer_answer' | 'tutor_authored';

export interface FaqEntryResponse {
  id: string;
  assignmentId: string;
  milestoneId: string | null;
  question: string;
  answer: string;
  sourceKind: FaqSourceKindApi;
  /** T5 before publish, T2 once `PUBLISHED` (`06` section 7.4.4). */
  publicationStatus: PublicationStatusApi;
  /** `true` only when `publicationStatus = 'PUBLISHED'`: the one state a student may read. */
  isPublished: boolean;
  displayOrder: number;
  createdAt: string;
  publishedAt: string | null;
  /** Optimistic-concurrency token for `PATCH /api/tutor/faq-entries/{id}` (`0012`, D98). */
  revision: number;
}

export interface FaqEntryListResponse {
  items: FaqEntryResponse[];
}
