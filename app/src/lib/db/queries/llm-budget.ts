/**
 * The model-call budget counter: `llm_call_counters` (`06` section 7.7.2; migration `0011`).
 *
 * `04` section 5.6: "`LLM_MAX_CALLS_PER_SESSION` (default `12`) is a hard ceiling on model calls per
 * `sessionId`. The counter increments **before** the call is issued, is held in Postgres so it
 * survives a restart, and on exhaustion the adapter throws `BUDGET_EXCEEDED`."
 *
 * Three properties of this implementation, each deliberate:
 *
 * 1. **The increment and the limit check are one statement.** A `select` followed by an `insert`
 *    lets two concurrent calls both observe `calls_used = 11` and both proceed. The conditional
 *    `on conflict ... where calls_used < max_calls` makes the ceiling true under concurrency, which
 *    is the only situation a ceiling matters in.
 * 2. **The counter is per scope key, not per call**, so one table serves every budget class. D68
 *    requires attachment extraction to have its own counter and never the assistant session
 *    counter; that is the scope key (`extraction:<uploadId>` versus the session id), not a second
 *    table.
 * 3. **`max_calls` is written once, at scope creation.** `do update` touches only `calls_used`, so a
 *    configuration change mid-run cannot retroactively authorise a call that was already made or
 *    forbid one that was already counted.
 */

import type { Executor } from './courses';

/** The four budget classes of `04` section 5.2's `LlmRequest.sessionId` doc comment. */
export type LlmScopeKind =
  | 'assistant_session'
  | 'ingestion_run'
  | 'attachment_extraction'
  | 'moderation_batch';

export interface BudgetConsumeResult {
  /** False when the scope is already at its ceiling. The caller must not issue the call. */
  readonly allowed: boolean;
  readonly callsUsed: number;
  readonly maxCalls: number;
}

/**
 * Count one call against a scope, **before** the call is made.
 *
 * Returns `allowed: false` with the counter left untouched when the ceiling is reached; the adapter
 * turns that into a non-retryable `BUDGET_EXCEEDED` (`04` section 5.6: "A runaway loop must fail
 * loudly rather than burn budget silently").
 */
export async function consumeCall(
  ex: Executor,
  input: { readonly scopeKey: string; readonly scopeKind: LlmScopeKind; readonly maxCalls: number },
): Promise<BudgetConsumeResult> {
  const maxCalls = Math.max(1, Math.trunc(input.maxCalls));
  const rows = await ex<{ calls_used: number; max_calls: number }[]>`
    insert into llm_call_counters (scope_key, scope_kind, calls_used, max_calls)
    values (${input.scopeKey}, ${input.scopeKind}, 1, ${maxCalls})
    on conflict (scope_key) do update
       set calls_used = llm_call_counters.calls_used + 1
     where llm_call_counters.calls_used < llm_call_counters.max_calls
    returning calls_used, max_calls
  `;
  const row = rows[0];
  if (row === undefined) {
    const current = await readCounter(ex, input.scopeKey);
    return { allowed: false, callsUsed: current?.callsUsed ?? maxCalls, maxCalls: current?.maxCalls ?? maxCalls };
  }
  return { allowed: true, callsUsed: row.calls_used, maxCalls: row.max_calls };
}

/** The current state of a scope, or null when the scope has never been used. */
export async function readCounter(
  ex: Executor,
  scopeKey: string,
): Promise<{ callsUsed: number; maxCalls: number } | null> {
  const rows = await ex<{ calls_used: number; max_calls: number }[]>`
    select calls_used, max_calls from llm_call_counters where scope_key = ${scopeKey} limit 1
  `;
  const row = rows[0];
  return row === undefined ? null : { callsUsed: row.calls_used, maxCalls: row.max_calls };
}
