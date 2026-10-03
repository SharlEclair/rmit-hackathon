/**
 * The assistant stream's frames (`06-DATA-MODEL.md` section 5.5.9; trap T4, trap T5).
 *
 * **Why the framing is not in the route.** The event order is a contract that a test must be able to
 * assert without opening a `ReadableStream`, and a Next route module should export nothing but its
 * handlers and its config. So the frames are built here, in order, and the route only encodes them.
 *
 * The order, stated once:
 *
 * ```text
 * permitted turn:  guardrail  token*  citations  message  done
 * refusal turn:    guardrail           message           done
 * failed answer:   guardrail           message  error   done     (06 5.5.9 rule 6)
 * ```
 *
 * `guardrail` is first, always (trap T4), and it carries the **persisted** decision: a post-check
 * trip or a schema failure replaces an initially-permitted verdict with `REFUSE`, and a client that
 * saw `ALLOW` first would wait for tokens that never arrive (`07` section 4.7.2 rule 4). A refusal
 * therefore emits zero `token` frames.
 *
 * Pure: no I/O, no clock. `requestId` and `createdAt` are passed in.
 */

import type {
  AssistantCitation,
  GuardrailEvent,
  GuardrailVerdictApi,
  RefusalPayload,
  TruthTierApi,
} from '@/lib/api/types';
import { REASON_CODES } from '@/lib/guardrail/reasons';
import { refusalCopyFor } from '@/lib/guardrail/refusal-copy';
import type { GuardrailDecision } from '@/lib/guardrail/types';

import type { AssistantTurnSuccess } from './answer';

/** How large one `token` frame is. Transport framing only; it changes no content. */
export const TOKEN_FRAME_CHARS = 48;

export interface AssistantStreamInput {
  readonly result: AssistantTurnSuccess;
  readonly policyRows: ReadonlyArray<{ readonly id: string; readonly ruleText: string }>;
  readonly assignmentId: string;
  readonly milestoneId: string | null;
  /** The assistant message row's id (`06` 5.5.9's `message` frame). */
  readonly messageId: string;
  readonly createdAt: string;
  readonly requestId: string;
}

export interface SseFrame {
  readonly event: 'guardrail' | 'token' | 'citations' | 'message' | 'error' | 'done';
  readonly data: unknown;
}

/** Cut the answer into `token` frames. Transport framing only; it changes no content. */
export function tokenFrames(text: string, size: number = TOKEN_FRAME_CHARS): string[] {
  const frames: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    frames.push(text.slice(index, index + size));
  }
  return frames;
}

/**
 * The transport projection of `GuardrailDecision` (`06` section 5.5.9).
 *
 * `citedTiers` is the tiers this turn's grounding set covered -- the tiers *evaluated*, which is
 * what R4 asks the event to carry. The tiers the answer actually cited are on the message row.
 */
export function guardrailEventFor(input: AssistantStreamInput): GuardrailEvent {
  const decision = input.result.persistedDecision;
  return {
    verdict: decision.verdict as GuardrailVerdictApi,
    rules: [...decision.rules],
    reasonCode: decision.reasonCode,
    deterministic: decision.deterministic,
    scope: decision.scope,
    clarifyingQuestion: decision.clarifyingQuestion ?? null,
    policyRef: decision.policyRef ?? null,
    refusalTemplateId: decision.refusalTemplateId ?? null,
    citedTiers: input.result.evaluatedTiers as TruthTierApi[],
    refusal: refusalPayloadFor(input),
  };
}

/**
 * The refusal payload (`06` section 5.5.9), or `null` for a permitted turn.
 *
 * `whatICanHelpWith` is the guardrail's own per-class copy (`refusalCopyFor`, `R5`, I-27): the route
 * must never re-word it, and a second list here would be a second place the refusal promise is
 * written down.
 *
 * `policyRuleText` is resolved from the `ai_policy_rules.id` the decision recorded. The frozen
 * algebra attaches a rule only to a policy-driven decision, so a platform-rule refusal (P5, P9, ...)
 * can carry `null` while its reason code is not the no-policy code. That is a divergence from `06`'s
 * stronger "null only for POL_ABSENT", reported rather than patched over: deriving a rule sentence
 * here would be re-implementing L2.
 *
 * **`unavailable` compares against `REASON_CODES.POLICY_ABSENT`, not the literal `'POL_ABSENT'`.**
 * `06` section 5.5.9 names the reason code `POL_ABSENT`, but the frozen guardrail's machine code for
 * that outcome is `POLICY_ABSENT` (`reasons.ts`; `POL_ABSENT` is the *rule id* and the sentence key).
 * The decision record is authoritative, so this reads the constant from the guardrail rather than a
 * literal -- a literal here would have made `unavailable` always false and the client would have
 * offered a usable Assistant with no approved policy (D47's exact failure).
 */
export function refusalPayloadFor(input: AssistantStreamInput): RefusalPayload | null {
  const decision: GuardrailDecision = input.result.persistedDecision;
  if (decision.verdict === 'ALLOW' || decision.verdict === 'ALLOW_WITH_SCOPE') return null;

  const primary = decision.rules[0] ?? 'A12';
  const policyRuleId = input.result.logRecord.policyRuleId;
  const rule = input.policyRows.find((row) => row.id === policyRuleId);

  return {
    verdict: decision.verdict,
    refusalTemplateId: decision.refusalTemplateId ?? 'T-REFUSE',
    reasonCode: decision.reasonCode,
    policyRuleId,
    policyRuleText: rule === undefined ? null : rule.ruleText,
    // `06` section 5.5.9: 2..4 items, and `R5` requires at least two. The guardrail's copy supplies
    // three for every class.
    whatICanHelpWith: refusalCopyFor(primary).capabilities.slice(0, 4),
    escalation:
      decision.verdict === 'ESCALATE_TO_TUTOR'
        ? {
            // D24: the Query is drafted for the student to send, never created on their behalf. The
            // path is the assignment workspace's query composer, which is where the student is.
            queryDraftUrl: `/student/assignments/${input.assignmentId}/queries/new`,
            milestoneId: input.milestoneId,
          }
        : null,
    unavailable: decision.reasonCode === REASON_CODES.POLICY_ABSENT,
  };
}

/** The ordered frames of one turn. */
export function assistantStreamFrames(input: AssistantStreamInput): SseFrame[] {
  const decision = input.result.persistedDecision;
  const permitted = decision.verdict === 'ALLOW' || decision.verdict === 'ALLOW_WITH_SCOPE';
  const frames: SseFrame[] = [{ event: 'guardrail', data: guardrailEventFor(input) }];

  if (permitted && input.result.generated && input.result.body.trim() !== '') {
    for (const text of tokenFrames(input.result.body)) frames.push({ event: 'token', data: { text } });
    frames.push({ event: 'citations', data: { citations: input.result.citations as AssistantCitation[] } });
  }

  frames.push({ event: 'message', data: { messageId: input.messageId, createdAt: input.createdAt } });

  if (input.result.streamError !== null) {
    frames.push({
      event: 'error',
      data: {
        code: input.result.streamError.code,
        message: input.result.streamError.message,
        requestId: input.requestId,
      },
    });
  }

  frames.push({
    event: 'done',
    data: {
      usage: {
        inputTokens: input.result.usage.inputTokens,
        outputTokens: input.result.usage.outputTokens,
        latencyMs: input.result.usage.latencyMs,
      },
    },
  });

  return frames;
}

/** One SSE frame, encoded. */
export function encodeSseFrame(frame: SseFrame): string {
  return `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
}
