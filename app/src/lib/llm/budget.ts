/**
 * Budget accounting for model calls (`04` section 5.6).
 *
 * The counter lives in Postgres so it survives a restart (`llm_call_counters`, migration `0011`),
 * and the increment happens **before** the call is issued. That ordering is the point: a counter
 * incremented after the call cannot stop a runaway loop, because the loop has already spent.
 *
 * The store is an injectable seam rather than a hard dependency. Two reasons, both honest:
 *
 * 1. `pnpm test` must pass with no database (`docs/handoff/01-STATE.md` section 5 item 7), so an
 *    adapter test cannot open a connection. It injects a fake store and asserts the ceiling logic.
 * 2. The ceiling itself is enforced in SQL (`on conflict ... where calls_used < max_calls`), so a
 *    fake store is only ever used to test the adapter's *reaction* to the ceiling, never to decide
 *    what the ceiling is.
 */

import type { AppConfig } from '@/lib/config';

import { consumeCall, type LlmScopeKind } from '@/lib/db/queries/llm-budget';
import { withTransaction } from '@/lib/db/transaction';

import { LlmError } from './types';

export interface BudgetConsumeResult {
  readonly allowed: boolean;
  readonly callsUsed: number;
  readonly maxCalls: number;
}

export interface BudgetStore {
  consume(input: {
    readonly scopeKey: string;
    readonly scopeKind: LlmScopeKind;
    readonly maxCalls: number;
  }): Promise<BudgetConsumeResult>;
}

/**
 * The production store: one short transaction per call.
 *
 * It deliberately does **not** join a caller's transaction. The budget counter is not the analytics
 * event that trap T7 requires to commit with a state change; it is a guard that must be durable
 * *before* the call goes out. Joining a caller's transaction would make the counter roll back with
 * the caller's work while the provider call had already happened and been billed.
 */
export function createPostgresBudgetStore(): BudgetStore {
  return {
    async consume(input) {
      return withTransaction((tx) =>
        consumeCall(tx, {
          scopeKey: input.scopeKey,
          scopeKind: input.scopeKind,
          maxCalls: input.maxCalls,
        }),
      );
    },
  };
}

/** Which budget class a call belongs to. D68 is the reason `attachment_extraction` is its own. */
export function scopeKindForCapability(capability: string): LlmScopeKind {
  switch (capability) {
    case 'attachment_extraction':
      return 'attachment_extraction';
    case 'assignment_analyst':
      return 'ingestion_run';
    case 'discussion_moderator':
      return 'moderation_batch';
    default:
      // The guardrail and the assistant share the assistant-session budget: a guardrail decision
      // and the answer it gates are the same student turn, and counting them separately would
      // double the effective ceiling on the path that matters most (04 section 5.6).
      return 'assistant_session';
  }
}

/**
 * The scope key for a call.
 *
 * The scope kind is prefixed, so the counters are structurally separate rather than separate by
 * convention. A caller that reused an assistant session id for extraction would still get a
 * distinct counter, which is what D68 requires ("its own budget counter -- never the assistant
 * session counter") and what a comment alone could not guarantee.
 */
export function scopeKeyFor(capability: string, sessionId: string): string {
  return `${scopeKindForCapability(capability)}:${sessionId}`;
}

/** The default ceiling, read from the validated config (`LLM_MAX_CALLS_PER_SESSION`, default 12). */
export function maxCallsFromConfig(config: AppConfig): number {
  return config.llmMaxCallsPerSession;
}

/** Throw the non-retryable `BUDGET_EXCEEDED` (`04` section 5.6). */
export function budgetExceeded(): LlmError {
  return new LlmError(
    'BUDGET_EXCEEDED',
    'the model-call budget for this session is exhausted',
    false,
  );
}
