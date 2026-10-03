/**
 * The DeepSeek adapter -- the documented alternative provider (D39, D40), not the default (D61).
 *
 * `04` section 5.3 last bullet: "the `deepseek` adapter remains ... and must keep working, because
 * D39 makes the provider a configuration decision". It is not the default, and **no live call has
 * been made through it in Phase 2**: `DEEPSEEK_API_KEY` is empty in the working environment and the
 * register does not spend budget on an alternative provider. That is stated here rather than
 * implied, so Phase 5 does not treat this adapter as exercised.
 *
 * The wire shape is the OpenAI-compatible chat-completions shape against
 * `{LLM_BASE_URL or https://api.deepseek.com}/chat/completions`, with bearer auth. Two
 * consequences worth naming:
 *
 * 1. **Schema enforcement is prompt-level, not provider-level.** This provider's structured-output
 *    mode is `{"type": "json_object"}`: it guarantees *valid JSON*, not *this schema*. So the JSON
 *    schema is appended to the variable end of the request and the caller's `parseStructured`
 *    remains the only thing that decides validity -- which is where D16 puts the decision anyway
 *    ("a response that fails schema validation is a refusal, not a retry"). The Gemini adapter is
 *    the one with provider-side schema enforcement.
 * 2. **The static prefix stays byte-identical.** The appended schema goes at the end of the user
 *    content, after the variable block, so blocks A and B (`04` section 5.5) are unaffected.
 *
 * Never logged: the bearer token or a request/response body.
 */

import type { LlmThinkingLevels } from '@/lib/config';

import { describeProviderError, mapHttpStatus, maxAttempts } from './errors';
import {
  LlmError,
  type LlmCapabilities,
  type LlmMessage,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type ModelValidationResult,
} from './types';

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_CHAT_PATH = '/chat/completions';
export const DEEPSEEK_KNOWN_MODEL_IDS = ['deepseek-flash', 'deepseek-v4-pro'] as const;

export interface DeepseekDeps {
  readonly apiKey: string;
  readonly baseUrl: string | null;
  /** Present for symmetry with the Gemini adapter; this provider has no thinking-level parameter. */
  readonly thinkingLevels: LlmThinkingLevels | null;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly now?: () => Date;
}

export function createDeepseekProvider(deps: DeepseekDeps): LlmProvider {
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? ((): Date => new Date());
  const base = (deps.baseUrl === null || deps.baseUrl === '' ? DEEPSEEK_DEFAULT_BASE_URL : deps.baseUrl)
    .replace(/\/+$/, '');
  const endpoint = `${base}${DEEPSEEK_CHAT_PATH}`;

  const capabilities: LlmCapabilities = {
    jsonOutput: true,
    toolCalls: true,
    // Text-only. An image or PDF attachment is resolved to the multimodal model id by
    // `04` section 5.3, and routing such a request here is a configuration error rather than a
    // silently-empty answer: the admissibility check below refuses a non-text part outright.
    vision: false,
    audio: false,
    video: false,
  };

  async function callOnce(body: unknown, timeoutMs: number): Promise<LlmResponse> {
    const startedAt = now().getTime();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.apiKey}`,
        },
        body: JSON.stringify(body),
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
    const raw = await response.text();

    if (!response.ok) {
      const mapping = mapHttpStatus(response.status);
      throw new LlmError(mapping.code, describeProviderError(response.status, safeJson(raw)), mapping.retryable);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new LlmError('PROVIDER_UNAVAILABLE', 'the provider returned a body that is not JSON', true);
    }

    const choice = firstChoice(parsed);
    const message = choice === null ? null : (choice['message'] as Record<string, unknown> | undefined);
    const content = message === undefined ? null : readString(message, 'content');
    const finishReason = choice === null ? null : readString(choice, 'finish_reason');

    return {
      provider: 'deepseek',
      modelId: readString(parsed, 'model') ?? '',
      json: null,
      text: content,
      toolCalls: [],
      usage: readUsage(parsed['usage']),
      finishReason: mapFinishReason(finishReason),
      latencyMs,
      providerRequestId: readString(parsed, 'id'),
    };
  }

  return {
    id: 'deepseek',
    capabilities,

    async validateConfiguration(): Promise<ModelValidationResult> {
      const checkedAt = now().toISOString();
      const modelId = DEEPSEEK_KNOWN_MODEL_IDS[0];
      const startedAt = now().getTime();
      try {
        await withRetry(
          () =>
            callOnce(
              {
                model: modelId,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
                temperature: 0,
                stream: false,
              },
              10_000,
            ),
          sleep,
          random,
        );
        return { ok: true, provider: 'deepseek', modelId, checkedAt, latencyMs: now().getTime() - startedAt };
      } catch (error) {
        const llmError =
          error instanceof LlmError
            ? error
            : new LlmError('PROVIDER_UNAVAILABLE', 'the provider could not be reached', true);
        return {
          ok: false,
          provider: 'deepseek',
          modelId,
          checkedAt,
          errorCode: llmError.code,
          reason: llmError.message,
          latencyMs: now().getTime() - startedAt,
        };
      }
    },

    async complete(request: LlmRequest): Promise<LlmResponse> {
      if (request.capability === 'insight_engine') {
        throw new LlmError(
          'CONFIG_INVALID',
          'the insight engine makes no model call (D67); this request is a programming error',
          false,
        );
      }
      if (request.tools !== undefined && request.tools.length > 0) {
        throw new LlmError('CONFIG_INVALID', 'this adapter does not implement tool calling', false);
      }
      if (!isTextOnly(request.messages)) {
        throw new LlmError(
          'CONFIG_INVALID',
          'this adapter is text-only; a multimodal part must resolve to the multimodal model id',
          false,
        );
      }

      const structured = request.responseFormat.type === 'json_schema';
      const body: Record<string, unknown> = {
        model: request.modelId,
        messages: [
          { role: 'system', content: systemText(request.messages) },
          { role: 'user', content: userText(request.messages, request) },
        ],
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        stream: false,
      };
      if (structured) body['response_format'] = { type: 'json_object' };

      const response = await withRetry(() => callOnce(body, request.timeoutMs), sleep, random);
      if (structured) return { ...response, json: tryParseJson(response.text) };
      return response;
    },
  };
}

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

function systemText(messages: readonly LlmMessage[]): string {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => textOf(message))
    .join('\n\n');
}

/** Variable content last, with the schema appended after it (file header, consequence 2). */
function userText(messages: readonly LlmMessage[], request: LlmRequest): string {
  const body = messages
    .filter((message) => message.role !== 'system')
    .map((message) => textOf(message))
    .join('\n\n');
  if (request.responseFormat.type !== 'json_schema') return body;
  return `${body}\n\nRESPONSE SCHEMA (respond with JSON that validates against it, and nothing else):\n${JSON.stringify(
    request.responseFormat.schema,
  )}`;
}

function textOf(message: LlmMessage): string {
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter((text) => text !== '')
    .join('\n');
}

function isTextOnly(messages: readonly LlmMessage[]): boolean {
  return messages.every((message) => message.content.every((part) => part.type === 'text'));
}

function firstChoice(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const choices = parsed['choices'];
  if (!Array.isArray(choices)) return null;
  const first = choices[0];
  return typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : null;
}

function mapFinishReason(value: string | null): LlmResponse['finishReason'] {
  if (value === 'length') return 'length';
  if (value === 'tool_calls') return 'tool_calls';
  if (value === 'content_filter') return 'content_filter';
  return 'stop';
}

function readUsage(usage: unknown): LlmResponse['usage'] {
  const record = typeof usage === 'object' && usage !== null ? (usage as Record<string, unknown>) : {};
  return {
    inputTokens: readNumber(record, 'prompt_tokens'),
    cachedInputTokens: readNumber(record, 'prompt_cache_hit_tokens'),
    outputTokens: readNumber(record, 'completion_tokens'),
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
