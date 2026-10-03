/**
 * The assistant service layer: the database orchestration the four routes share.
 *
 * **Why it exists.** `06` section 5.4 gives the Assistant four routes and they must all obey the same
 * three rules: run the student guard first, read only published material, and write the turn and its
 * analytics event in one transaction (trap T7). Four copies of that ordering is four places for it
 * to drift, and the repo's own convention (`src/features/review/actions.ts`) is that a route is an
 * adapter: parse, guard, call, serialise.
 *
 * **What the routes still own.** HTTP: the status code, the error envelope, the SSE frame order, and
 * the request-body validation. Nothing here returns a `NextResponse`.
 *
 * **The transaction boundary.** A model call must not happen inside a transaction, so a turn reads
 * in one, calls the provider outside it, and writes in another. The writes that must not be
 * separated -- both message rows, the session counters, both guardrail log rows and the analytics
 * event -- are one `withTransaction` at the call site, and `persistAssistantTurn` is written to be
 * called inside it.
 *
 * Identity: `subject_ref` is derived once, by `analytics.ts`, and stored on the session; this module
 * never recomputes it and never returns a student id.
 */

import { randomUUID } from 'node:crypto';

import type { AssistantCitation, AssistantMessageResponse, AssistantSessionResponse, GuardrailVerdictApi, ProactiveMessageResponse, TruthTierApi } from '@/lib/api/types';
import type { AppConfig } from '@/lib/config';
import type { SessionContext } from '@/lib/auth/roles';
import { emitAnalyticsEvent } from '@/lib/db/queries/analytics';
import {
  bumpAssistantSession,
  countCompletedChecklistItems,
  dismissProactiveNotice,
  findAssistantMessage,
  findOrCreateAssistantSession,
  findOrCreateStudentAssignment,
  findProactiveNotice,
  insertAssistantMessage,
  insertGuardrailLog,
  insertProactiveNoticeIfAbsent,
  listAssistantMessages,
  listAssistantSessionTurns,
  listCitedArtifacts,
  listMilestoneRequirements,
  type AssistantMessageRow,
  type AssistantSessionRow,
  type ProactiveNoticeRow,
} from '@/lib/db/queries/assistant';
import type { Executor } from '@/lib/db/queries/courses';
import {
  listVisibleChecklistItems,
  listVisibleFaqEntries,
  listVisibleMilestones,
  listVisiblePolicyRules,
  type VisibleChecklistItem,
  type VisibleMilestone,
  type VisiblePolicyRule,
  type VisibleScope,
} from '@/lib/db/queries/student-visibility';
import type { SessionState, Verdict } from '@/lib/guardrail/types';

import type { AssistantTurnSuccess } from './answer';
import { buildGroundingSet, citationForArtifact, type GroundingSet } from './context';
import { assembleProactiveNotice, parseProactiveBullets, type ProactiveBullet } from './proactive';
import { retrieveGroundingChunks } from './retrieve';

/** The guard's return value, for the routes that already ran it. */
export interface AssistantContext {
  readonly session: SessionContext;
  readonly scope: VisibleScope;
}

/** The model that answers an assistant turn: the reasoning model, never the multimodal one. */
export function resolveAssistantModelId(config: AppConfig): string {
  return config.llmModelReasoning ?? 'mock';
}

/** The budget unit's ceiling for one session (`LLM_MAX_CALLS_PER_SESSION`, D92). */
export function assistantCallsRemaining(config: AppConfig, callsUsed: number): number {
  return Math.max(0, config.llmMaxCallsPerSession - callsUsed);
}

/** A fresh id for a row this layer creates. */
export function newAssistantId(): string {
  return randomUUID();
}

export async function ensureAssistantSession(
  ex: Executor,
  context: AssistantContext,
  subjectRef: string,
): Promise<AssistantSessionRow> {
  return findOrCreateAssistantSession(ex, {
    id: newAssistantId(),
    studentId: context.session.userId,
    assignmentId: context.scope.assignmentId,
    subjectRef,
  });
}

export async function loadPolicyRows(
  ex: Executor,
  scope: VisibleScope,
): Promise<VisiblePolicyRule[]> {
  return listVisiblePolicyRules(ex, scope);
}

/**
 * The guardrail's per-session state (`05` section 4.4).
 *
 * `turns[].verdict` is typed `Verdict` here because the SQL filters `verdict is not null` and
 * `assistant_messages.ck_assistant_messages_verdict` bounds the column to the five verdicts. The
 * cast records that: the CHECK is the runtime guarantee and the type is the compile-time one.
 *
 * `turns[].rules` is always empty and `completedItemCount` is counted from
 * `student_checklist_progress`: see `listAssistantSessionTurns` and `countCompletedChecklistItems`
 * for why each is the honest reading rather than the convenient one.
 */
export async function loadSessionState(
  ex: Executor,
  sessionId: string,
  currentMilestoneTitle: string | null,
  completedItemCount: number,
): Promise<SessionState> {
  const turns = await listAssistantSessionTurns(ex, sessionId);
  return {
    turns: turns.map((turn) => ({
      turnId: turn.turnId,
      text: turn.text,
      verdict: turn.verdict as Verdict,
      rules: turn.rules,
    })),
    currentMilestoneTitle,
    completedItemCount,
  };
}

/** How many Checklist items a student has completed, for the session-state field above. */
export async function loadCompletedItemCount(
  ex: Executor,
  studentId: string,
  assignmentId: string,
): Promise<number> {
  const studentAssignmentId = await findOrCreateStudentAssignment(ex, {
    id: newAssistantId(),
    studentId,
    assignmentId,
  });
  return countCompletedChecklistItems(ex, studentAssignmentId);
}

/** The milestone the turn is focused on, or null. Only a published milestone of this scope counts. */
export async function resolveMilestone(
  ex: Executor,
  scope: VisibleScope,
  milestoneId: string | null,
): Promise<VisibleMilestone | null> {
  const milestones = await listVisibleMilestones(ex, scope);
  if (milestoneId === null) return milestones[0] ?? null;
  return milestones.find((milestone) => milestone.id === milestoneId) ?? null;
}

export interface LoadedGrounding {
  readonly grounding: GroundingSet;
  readonly retrievedChunkIds: string[];
  readonly mode: 'full_text' | 'stable_order';
}

/** Block C: retrieval plus the published T2/T3 material, in authority order (`context.ts`). */
export async function loadGrounding(
  ex: Executor,
  scope: VisibleScope,
  query: string,
): Promise<LoadedGrounding> {
  const retrieved = await retrieveGroundingChunks(ex, scope, query);
  const [faqEntries, milestones, checklistItems] = await Promise.all([
    listVisibleFaqEntries(ex, scope),
    listVisibleMilestones(ex, scope),
    listVisibleChecklistItems(ex, scope),
  ]);

  const grounding = buildGroundingSet({
    chunks: retrieved.chunks,
    faqEntries,
    milestones,
    checklistItems,
  });

  return { grounding, retrievedChunkIds: retrieved.chunkIds, mode: retrieved.mode };
}

/** A published Checklist item of one milestone, so the item list is the milestone's own. */
export function checklistItemsForMilestone(
  items: readonly VisibleChecklistItem[],
  milestoneId: string,
): VisibleChecklistItem[] {
  return items.filter((item) => item.milestoneId === milestoneId);
}

export interface PersistTurnInput {
  readonly assignmentId: string;
  readonly studentId: string;
  readonly subjectRef: string;
  /** The HMAC key from `getConfig().anonIdSecret`. Never stored, never logged (`analytics.ts`). */
  readonly anonIdSecret: string;
  readonly sessionId: string;
  /** The student's own turn, verbatim. Never logged (`06` section 7.3.4). */
  readonly turnBody: string;
  readonly uploadIds: readonly string[];
  readonly milestoneId: string | null;
  readonly occurredAt: Date;
  readonly result: AssistantTurnSuccess;
  /** Pre-generated so the analytics dedupe key is the message id, which is one per occurrence. */
  readonly studentMessageId: string;
  readonly assistantMessageId: string;
}

export interface PersistedTurn {
  readonly studentMessageId: string;
  /** Null only when the assistant body was empty, which `answer.ts` refuses to produce. */
  readonly assistantMessageId: string | null;
  readonly createdAt: string;
}

/**
 * Write one turn and its analytics event. **Call inside `withTransaction`** (trap T7).
 *
 * The order is: both message rows, the session counters, the durable guardrail rows, then the
 * analytics event. The event is last only because it is the least load-bearing row; it is in the
 * same transaction, which is what T7 actually requires -- an event that is written later, by another
 * job, is a backfill and is forbidden.
 */
export async function persistAssistantTurn(
  ex: Executor,
  input: PersistTurnInput,
): Promise<PersistedTurn> {
  const { result } = input;
  const decision = result.persistedDecision;

  await insertAssistantMessage(ex, {
    id: input.studentMessageId,
    sessionId: input.sessionId,
    assignmentId: input.assignmentId,
    role: 'student',
    body: input.turnBody,
    verdict: decision.verdict,
    reasonCode: decision.reasonCode,
    policyRuleId: result.logRecord.policyRuleId,
    uploadIds: [...input.uploadIds],
  });

  let assistantRow: AssistantMessageRow | null = null;
  if (result.body.trim() !== '') {
    assistantRow = await insertAssistantMessage(ex, {
      id: input.assistantMessageId,
      sessionId: input.sessionId,
      assignmentId: input.assignmentId,
      role: 'assistant',
      body: result.body,
      citedTiers: result.citedTiers,
      groundingChunkIds: result.groundingIds,
      citedFaqEntryIds: result.faqEntryIds,
      modelId: result.modelId,
      promptVersion: result.logRecord.promptVersion,
      latencyMs: result.usage.latencyMs,
      tokenUsage: result.generated
        ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }
        : null,
    });
  }

  await bumpAssistantSession(ex, {
    sessionId: input.sessionId,
    messages: assistantRow === null ? 1 : 2,
    llmCalls: result.classifierCalls + (result.generated ? 1 : 0),
  });

  await insertGuardrailLog(ex, {
    assignmentId: input.assignmentId,
    assistantSessionId: input.sessionId,
    assistantMessageId: assistantRow?.id ?? null,
    subjectRef: input.subjectRef,
    verdict: result.decision.verdict,
    reasonCode: result.decision.reasonCode,
    policyRuleId: result.logRecord.policyRuleId,
    citedTiers: result.evaluatedTiers,
    modelId: result.decision.modelId ?? null,
    promptVersion: result.decision.promptVersion,
    latencyMs: result.usage.latencyMs,
  });

  // `05` section 3.2.3: a trip is a second decision record, and both are retained.
  if (result.postCheckLogRecord !== null) {
    await insertGuardrailLog(ex, {
      assignmentId: input.assignmentId,
      assistantSessionId: input.sessionId,
      assistantMessageId: assistantRow?.id ?? null,
      subjectRef: input.subjectRef,
      verdict: result.postCheckLogRecord.verdict,
      reasonCode: result.postCheckLogRecord.reasonCode,
      policyRuleId: result.postCheckLogRecord.policyRuleId,
      citedTiers: result.postCheckLogRecord.citedTiers,
      modelId: result.postCheckLogRecord.modelId,
      promptVersion: result.postCheckLogRecord.promptVersion,
      latencyMs: result.postCheckLogRecord.latencyMs,
    });
  }

  await emitAnalyticsEvent(ex, {
    anonIdSecret: input.anonIdSecret,
    assignmentId: input.assignmentId,
    studentId: input.studentId,
    // M6 counts a permitted turn; a refusal is its own event, never counted as a question (D49).
    eventType: assistanceEventType(decision.verdict),
    milestoneId: input.milestoneId,
    occurredAt: input.occurredAt,
    metadata: {
      source: 'api',
      surface: 'assistant',
      verdict: decision.verdict,
      reasonCode: decision.reasonCode,
    },
    // One per occurrence: the student's own message row id.
    dedupeKey: input.studentMessageId,
  });

  return {
    studentMessageId: input.studentMessageId,
    assistantMessageId: assistantRow?.id ?? null,
    createdAt: assistantRow?.createdAt ?? input.occurredAt.toISOString(),
  };
}

function assistanceEventType(verdict: Verdict): 'assistant_message_sent' | 'assistant_request_refused' {
  return verdict === 'ALLOW' || verdict === 'ALLOW_WITH_SCOPE'
    ? 'assistant_message_sent'
    : 'assistant_request_refused';
}

/**
 * The transcript (`06` section 5.5.9's `AssistantSessionResponse`).
 *
 * Citations are rebuilt from the two id arrays on each assistant row (`06` section 7.3.4) -- see
 * `queries/assistant.ts` for why a milestone or checklist citation lives in the chunk array. A
 * citation id that no longer resolves is dropped rather than rendered as a broken link; the body
 * text is never rewritten.
 */
export async function buildSessionResponse(
  ex: Executor,
  sessionId: string,
  assignmentId: string,
): Promise<AssistantSessionResponse> {
  const rows = await listAssistantMessages(ex, sessionId);
  const messages: AssistantMessageResponse[] = [];

  for (const row of rows) {
    if (row.role === 'student') {
      messages.push({
        id: row.id,
        role: 'student',
        createdAt: row.createdAt,
        body: row.body,
        verdict: row.verdict as GuardrailVerdictApi,
        reasonCode: row.reasonCode,
        policyRuleId: row.policyRuleId,
        uploadIds: row.uploadIds,
      });
      continue;
    }

    const artifacts = await listCitedArtifacts(ex, row.groundingChunkIds, row.citedFaqEntryIds);
    messages.push({
      id: row.id,
      role: 'assistant',
      createdAt: row.createdAt,
      body: row.body,
      isProactive: row.isProactive,
      citedTiers: row.citedTiers as TruthTierApi[],
      citations: artifacts.map(citationForArtifact),
    });
  }

  return { sessionId, assignmentId, messages };
}

export interface ProactiveInput {
  readonly context: AssistantContext;
  readonly subjectRef: string;
  readonly anonIdSecret: string;
  /** The milestone the panel is open on, or null for the first published one. */
  readonly milestoneId: string | null;
  readonly occurredAt: Date;
}

/**
 * The one permitted proactive notice for a milestone (`O2`, `06` section 7.3.5).
 *
 * Returns `null` when there is no published milestone, when the notice was dismissed (`07` section
 * 4.7.1 rule 5), or when published content cannot support even one bullet (rule 3: never pad). The
 * once-only guarantee is the database's partial unique constraint, not a check in this function: an
 * insert that loses the race is followed by a read of the winner's row, so two concurrent first
 * visits cannot deliver two notices.
 */
export async function loadOrCreateProactiveNotice(
  ex: Executor,
  input: ProactiveInput,
): Promise<ProactiveMessageResponse | null> {
  const milestone = await resolveMilestone(ex, input.context.scope, input.milestoneId);
  if (milestone === null) return null;

  const studentAssignmentId = await findOrCreateStudentAssignment(ex, {
    id: newAssistantId(),
    studentId: input.context.session.userId,
    assignmentId: input.context.scope.assignmentId,
  });

  const existing = await findProactiveNotice(ex, studentAssignmentId, milestone.id);
  if (existing !== null) {
    if (existing.dismissedAt !== null) return null;
    const message = await findAssistantMessage(ex, existing.assistantMessageId);
    if (message === null) return null;
    return toProactiveResponse(ex, existing, milestone.title, message);
  }

  const [requirements, checklistItems, faqEntries] = await Promise.all([
    listMilestoneRequirements(ex, {
      assignmentId: input.context.scope.assignmentId,
      structureId: input.context.scope.structureId,
      milestoneId: milestone.id,
    }),
    listVisibleChecklistItems(ex, input.context.scope),
    listVisibleFaqEntries(ex, input.context.scope),
  ]);

  const assembly = assembleProactiveNotice({
    milestone,
    requirements,
    checklistItems: checklistItemsForMilestone(checklistItems, milestone.id),
    faqEntries: faqEntries.filter((entry) => entry.milestoneId === milestone.id),
  });
  if (assembly === null) return null;

  const session = await ensureAssistantSession(ex, input.context, input.subjectRef);
  const message = await insertAssistantMessage(ex, {
    id: newAssistantId(),
    sessionId: session.id,
    assignmentId: input.context.scope.assignmentId,
    role: 'assistant',
    isProactive: true,
    body: assembly.body,
    citedTiers: [...assembly.citedTiers],
    groundingChunkIds: [...assembly.groundingIds],
    citedFaqEntryIds: [...assembly.faqEntryIds],
    // A proactive notice is assembled from published content, so it has no model and no prompt
    // version to record: it is not model output at all (O2, I2).
    modelId: null,
    promptVersion: null,
  });

  const notice = await insertProactiveNoticeIfAbsent(ex, {
    id: newAssistantId(),
    studentAssignmentId,
    milestoneId: milestone.id,
    assistantMessageId: message.id,
  });
  if (notice === null) {
    // Another request delivered the notice first. Serve the stored one, never a second assembly.
    const winner = await findProactiveNotice(ex, studentAssignmentId, milestone.id);
    if (winner === null) return null;
    return toProactiveResponse(ex, winner, milestone.title, message);
  }

  await emitAnalyticsEvent(ex, {
    anonIdSecret: input.anonIdSecret,
    assignmentId: input.context.scope.assignmentId,
    studentId: input.context.session.userId,
    eventType: 'assistant_message_sent',
    milestoneId: milestone.id,
    occurredAt: input.occurredAt,
    metadata: { source: 'api', surface: 'assistant', verdict: 'ALLOW' },
    dedupeKey: `proactive:${notice.id}`,
  });

  return {
    noticeId: notice.id,
    milestoneId: milestone.id,
    milestoneTitle: milestone.title,
    bullets: [...assembly.bullets],
    deliveredAt: notice.deliveredAt,
    dismissedAt: null,
  };
}

/**
 * Dismiss once, and return the notice as the response shape.
 *
 * `null` means the notice was already dismissed, which the route maps to
 * `INVALID_STATE_TRANSITION` (`06` section 5.4) rather than pretending to dismiss it twice.
 */
export async function dismissNotice(
  ex: Executor,
  noticeId: string,
  milestoneTitle: string,
): Promise<ProactiveMessageResponse | null> {
  const dismissed = await dismissProactiveNotice(ex, noticeId);
  if (dismissed === null) return null;
  const message = await findAssistantMessage(ex, dismissed.assistantMessageId);
  if (message === null) return null;
  return toProactiveResponse(ex, dismissed, milestoneTitle, message);
}

/**
 * A stored notice, as the response shape.
 *
 * The bullets are the lines of the body that was delivered, paired in order with the citations that
 * were stored beside it. A line whose citation no longer resolves is dropped rather than served
 * without a source, because `07` section 4.7.1 rule 2 makes the source link part of the bullet.
 */
async function toProactiveResponse(
  ex: Executor,
  notice: ProactiveNoticeRow,
  milestoneTitle: string,
  message: AssistantMessageRow,
): Promise<ProactiveMessageResponse> {
  const texts = parseProactiveBullets(message.body);
  const artifacts = await listCitedArtifacts(ex, message.groundingChunkIds, message.citedFaqEntryIds);
  const citations: AssistantCitation[] = artifacts.map(citationForArtifact);

  const bullets: ProactiveBullet[] = [];
  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index];
    const citation = citations[index];
    if (text === undefined || citation === undefined) continue;
    bullets.push({ text, citation });
  }

  return {
    noticeId: notice.id,
    milestoneId: notice.milestoneId,
    milestoneTitle,
    bullets,
    deliveredAt: notice.deliveredAt,
    dismissedAt: notice.dismissedAt,
  };
}
