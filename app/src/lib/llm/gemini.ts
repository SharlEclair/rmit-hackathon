/**
 * The Gemini adapter -- the project's default provider (D61, model `gemini-3.8-flash` D62).
 *
 * **Call shape: the Interactions API, settled by D73 and re-verified live on 2026-10-04.**
 *
 * | Fact | Value |
 * |---|---|
 * | Endpoint | `POST {LLM_BASE_URL or https://generativelanguage.googleapis.com}/v1beta/interactions` |
 * | Auth | `x-goog-api-key` header (never a query parameter, so a key cannot land in a proxy log) |
 * | Static prefix | `system_instruction` (the `system` message content) |
 * | Variable content | `input`, a plain string (a `Turn[]`/`role+content` shape is rejected: "use step_list input format instead of turn_list") |
 * | Required | `store: false` -- the API stores interactions server-side by default and a student turn is student content (C7, D73) |
 * | Structured output | `response_format: { type: 'text', mime_type: 'application/json', schema }` |
 * | Thinking | `generation_config.thinking_level`, one of `low`/`medium`/`high`. `minimal` is rejected by this model, which is why `low` is the floor rather than an off switch |
 * | Output | `steps[]`; text is the concatenation of the last `model_output` step's `content[]` entries where `type = 'text'`; `thought` steps are skipped and their `signature` values are never read or logged |
 *
 * The live re-verification is recorded in the Phase 2 session entry: `input: <string>` -> HTTP 200
 * with a `thought` step and a `model_output` step; `input: [{role, content}]` -> HTTP 400;
 * `input: [{role, parts}]` -> HTTP 400 (unknown parameter `parts`); a structured call -> HTTP 200
 * whose `model_output` text was exactly `{"ok": true}`.
 *
 * No vendor SDK is imported: the Interactions REST shape is used directly, so this module depends
 * on `fetch` and nothing else. `04` section 5.3 names `@google/genai` as the SDK; the SDK's own
 * surface is `generateContent`, which D73 documents as **legacy and not built by default**. The
 * choice is recorded as decision D83 rather than made silently.
 *
 * Never logged: the API key, a `thought` signature, or any request/response body. Error messages
 * go through `errors.ts`, which reads one bounded `message` field and nothing else.
 */

import type { LlmThinkingLevels } from '@/lib/config';

import { describeProviderError, mapHttpStatus, maxAttempts } from './errors';
import {
  LlmError,
  type AiCapability,
  type LlmCapabilities,
  type LlmMessage,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type ModelValidationResult,
} from './types';

/** `04` section 5.3: the one known-good id, and the ids the mock knows about. */
export const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
export const GEMINI_INTERACTIONS_PATH = '/v1beta/interactions';
export const GEMINI_KNOWN_MODEL_IDS = ['gemini-3.8-flash'] as const;

/** The env var that carries each capability's thinking level (`04` section 11, D62, D68). */
export type LlmThinkingKeyName = keyof LlmThinkingLevels;

export interface GeminiDeps {
  readonly apiKey: string;
  /** `LLM_BASE_URL`, or null for the provider default. */
  readonly baseUrl: string | null;
  /** `null` when the config did not validate the levels; the adapter then refuses to call. */
  readonly thinkingLevels: LlmThinkingLevels | null;
  /** Seams for tests. A test must never reach the network or a real clock. */
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly now?: () => Date;
}

/**
 * Which thinking level a capability uses (D62, D68).
 *
 * `insight_engine` has no level because it makes no model call at all (D67); mapping it is not an
 * error here, and `complete()` refuses it explicitly.
 */
export function thinkingKeyFor(capability: AiCapability): LlmThinkingKeyName {
  switch (capability) {
    case 'assignment_analyst':
      return 'analyst';
    case 'policy_guard':
      return 'guardrail';
    case 'student_assistant':
      return 'assistant';
    case 'discussion_moderator':
      return 'moderator';
    case 'attachment_extraction':
      return 'extraction';
    case 'insight_engine':
      return 'analyst';
  }
}

interface InteractionStep {
  type?: unknown;
  content?: unknown;
}

interface InteractionBody {
  status?: unknown;
  steps?: unknown;
  usage?: unknown;
}

export function createGeminiProvider(deps: GeminiDeps): LlmProvider {
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? ((): Date => new Date());
  const base = (deps.baseUrl === null || deps.baseUrl === '' ? GEMINI_DEFAULT_BASE_URL : deps.baseUrl)
    .replace(/\/+$/, '');
  const endpoint = `${base}${GEMINI_INTERACTIONS_PATH}`;

  const capabilities: LlmCapabilities = {
    jsonOutput: true,
    toolCalls: true,
    vision: true,
    // The provider accepts audio and video. The *product* refuses them at the picker with rule UP5
    // (O11, D57), before storage and before any adapter call; this field describes the provider,
    // not the policy. `04` section 12 states that distinction.
    audio: true,
    video: true,
  };

  async function callOnce(rawBody: unknown, timeoutMs: number): Promise<LlmResponse> {
    const startedAt = now().getTime();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.apiKey },
        body: JSON.stringify(rawBody),
        signal: controller.signal,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError' || name === 'TimeoutError') {
        throw new LlmError('TIMEOUT', 'the provider did not answer within the request timeout', false);
      }
      throw new LlmError('PROVIDER_UNAVAILABLE', 'the provider could not be reached', true);
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = now().getTime() - startedAt;
    const text = await response.text();

    if (!response.ok) {
      const mapping = mapHttpStatus(response.status);
      throw new LlmError(mapping.code, describeProviderError(response.status, safeJson(text)), mapping.retryable);
    }

    let parsed: InteractionBody;
    try {
      parsed = JSON.parse(text) as InteractionBody;
    } catch {
      throw new LlmError('PROVIDER_UNAVAILABLE', 'the provider returned a body that is not JSON', true);
    }

    const extracted = extractModelOutput(parsed.steps);
    const usage = readUsage(parsed.usage);
    return {
      provider: 'gemini',
      modelId: readString(parsed, 'model') ?? '',
      json: null,
      text: extracted.text,
      toolCalls: [],
      usage,
      finishReason: extracted.found && parsed.status === 'completed' ? 'stop' : 'content_filter',
      latencyMs,
      // The Interactions response carries no request id; null is the honest value (04 section 5.2
      // allows null) rather than a synthesised one that would look like a provider trace id.
      providerRequestId: null,
    };
  }

  return {
    id: 'gemini',
    capabilities,

    async validateConfiguration(): Promise<ModelValidationResult> {
      const checkedAt = now().toISOString();
      const modelId = GEMINI_KNOWN_MODEL_IDS[0];
      const startedAt = now().getTime();
      try {
        await withRetry(
          () =>
            callOnce(
              {
                model: modelId,
                store: false,
                input: 'ping',
                generation_config: { thinking_level: 'low', max_output_tokens: 1 },
              },
              10_000,
            ),
          sleep,
          random,
        );
        return { ok: true, provider: 'gemini', modelId, checkedAt, latencyMs: now().getTime() - startedAt };
      } catch (error) {
        const llmError =
          error instanceof LlmError
            ? error
            : new LlmError('PROVIDER_UNAVAILABLE', 'the provider could not be reached', true);
        return {
          ok: false,
          provider: 'gemini',
          modelId,
          checkedAt,
          errorCode: llmError.code,
          // A safe sentence. `describeProviderError` already bounded whatever the provider said.
          reason: llmError.message,
          latencyMs: now().getTime() - startedAt,
        };
      }
    },

    async complete(request: LlmRequest): Promise<LlmResponse> {
      // D67: the Insight Engine computes cohort insight deterministically and makes no model call.
      // Refusing loudly here is what stops a later phase from quietly adding one.
      if (request.capability === 'insight_engine') {
        throw new LlmError(
          'CONFIG_INVALID',
          'the insight engine makes no model call (D67); this request is a programming error',
          false,
        );
      }
      if (request.tools !== undefined && request.tools.length > 0) {
        // Silent tool-dropping would change the answer without changing the request, which is the
        // one failure mode an adapter must never have. No Phase 2 capability uses tools.
        throw new LlmError('CONFIG_INVALID', 'this adapter does not implement tool calling', false);
      }
      if (deps.thinkingLevels === null) {
        throw new LlmError(
          'CONFIG_INVALID',
          'thinking levels were not validated for this provider configuration',
          false,
        );
      }

      const body: Record<string, unknown> = {
        model: request.modelId,
        // Mandatory (D73): the API stores interactions server-side by default.
        store: false,
        system_instruction: systemText(request.messages),
        input: inputText(request.messages),
        generation_config: {
          thinking_level: deps.thinkingLevels[thinkingKeyFor(request.capability)],
          temperature: request.temperature,
          max_output_tokens: request.maxOutputTokens,
        },
      };
      if (request.responseFormat.type === 'json_schema') {
        body['response_format'] = {
          type: 'text',
          mime_type: 'application/json',
          schema: request.responseFormat.schema,
        };
      }

      const response = await withRetry(
        () => callOnce(body, request.timeoutMs),
        sleep,
        random,
      );

      if (request.responseFormat.type === 'json_schema') {
        // An unparseable body is NOT an adapter error: `04` section 5.7 makes a schema failure a
        // refusal the caller records (`SYS_SCHEMA_INVALID`), never a retry. Null is the honest
        // signal; the caller's `parseStructured` refuses it.
        return { ...response, json: tryParseJson(response.text) };
      }
      return response;
    },
  };
}

/** Retry policy from `04` section 5.7: at most one retry, jittered, only for a retryable code. */
async function withRetry(
  attempt: () => Promise<LlmResponse>,
  sleep: (ms: number) => Promise<void>,
  random: () => number,
): Promise<LlmResponse> {
  let lastError: unknown;
  for (let index = 0; index < 2; index += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      const code = error instanceof LlmError ? error.code : 'PROVIDER_UNAVAILABLE';
      if (index >= maxAttempts(code) - 1) break;
      await sleep(1000 * (1 + random() * 0.25));
    }
  }
  throw lastError;
}

/** Blocks A and B (`04` section 5.5). Concatenated in order; the adapter does not reorder them. */
function systemText(messages: readonly LlmMessage[]): string {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => textOf(message))
    .join('\n\n');
}

/** Blocks C and D. A `Turn[]`-style shape is rejected by this API version, so roles collapse here. */
function inputText(messages: readonly LlmMessage[]): string {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => textOf(message))
    .join('\n\n');
}

function textOf(message: LlmMessage): string {
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter((text) => text !== '')
    .join('\n');
}

/** Concatenate the last `model_output` step's text parts; skip `thought` steps entirely. */
function extractModelOutput(steps: unknown): { text: string | null; found: boolean } {
  if (!Array.isArray(steps)) return { text: null, found: false };
  let text: string | null = null;
  for (const step of steps as InteractionStep[]) {
    if (step.type !== 'model_output') continue;
    const content = Array.isArray(step.content) ? step.content : [];
    const pieces: string[] = [];
    for (const entry of content) {
      if (typeof entry !== 'object' || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (record['type'] === 'text' && typeof record['text'] === 'string') pieces.push(record['text']);
    }
    text = pieces.join('');
  }
  return { text, found: text !== null };
}

/**
 * Token accounting.
 *
 * `total_output_tokens` excludes thought tokens, which D73 verified are **billed as output**
 * (`total_thought_tokens` was 105 for a one-token answer at `low`). Reporting only the visible
 * tokens would understate the cost of every call, so the thought tokens are added in and the
 * cached count is reported as-is -- never estimated (`04` section 5.2, `LlmUsage`).
 */
function readUsage(usage: unknown): LlmResponse['usage'] {
  const record = typeof usage === 'object' && usage !== null ? (usage as Record<string, unknown>) : {};
  const output = readNumber(record, 'total_output_tokens');
  const thoughts = readNumber(record, 'total_thought_tokens');
  return {
    inputTokens: readNumber(record, 'total_input_tokens'),
    cachedInputTokens: readNumber(record, 'total_cached_tokens'),
    outputTokens: output + thoughts,
  };
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function readString(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function tryParseJson(text: string | null): unknown | null {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
