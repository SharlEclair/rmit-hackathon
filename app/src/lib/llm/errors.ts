/**
 * Error mapping for the provider adapters.
 *
 * Three jobs, all deterministic and all testable without a network (`04` sections 5.4 and 5.7):
 *
 * 1. **HTTP status -> `LlmErrorCode`.** The table in `04` section 5.4 fixes the mapping for the
 *    startup probe and section 5.7 fixes the retry policy for a live call. Keeping both in one
 *    module is what stops the two from drifting apart.
 * 2. **Retryability.** `04` section 5.7: at most **one** retry, only for `429`, `5xx` and timeout,
 *    and never after tokens have been produced. `MODEL_UNKNOWN` and `AUTH_FAILED` are never
 *    retried -- startup validation should already have made them impossible.
 * 3. **A safe sentence for a log.** A provider's error body is untrusted input. `describeProviderError`
 *    extracts one bounded message field and nothing else, so a 64 KB HTML error page, a request echo
 *    or a credential cannot reach a log line or a response (`AGENTS.md` C7).
 *
 * What this module deliberately does not do: it never inspects a request or a response payload, so
 * it cannot leak student content into a message.
 */

import { LlmError, type LlmErrorCode } from './types';

export interface ErrorMapping {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;
}

/** `04` section 5.4's table, applied to every provider. */
export function mapHttpStatus(status: number): ErrorMapping {
  if (status === 400) return { code: 'MODEL_UNKNOWN', retryable: false };
  if (status === 401 || status === 403) return { code: 'AUTH_FAILED', retryable: false };
  if (status === 404) return { code: 'MODEL_UNKNOWN', retryable: false };
  if (status === 429) return { code: 'RATE_LIMITED', retryable: true };
  if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', retryable: true };
  // Any other 4xx is the provider refusing this request. Refusing it again will not help.
  return { code: 'CONFIG_INVALID', retryable: false };
}

/** The maximum attempts a code is allowed under `04` section 5.7 (1 initial + retries). */
export function maxAttempts(code: LlmErrorCode): number {
  return code === 'RATE_LIMITED' || code === 'PROVIDER_UNAVAILABLE' || code === 'TIMEOUT' ? 2 : 1;
}

/**
 * Normalise anything a provider path can throw into an `LlmError`.
 *
 * An `AbortError` is a timeout rather than a provider outage, and an unknown throw is
 * `PROVIDER_UNAVAILABLE` rather than `INTERNAL`: from the caller's point of view a transport that
 * produced nothing usable is exactly "the provider could not be reached", and `04` section 5.7
 * makes that a single retry followed by a refusal-equivalent.
 */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return new LlmError('TIMEOUT', 'the provider did not answer within the request timeout', false);
    }
    return new LlmError('PROVIDER_UNAVAILABLE', 'the provider could not be reached', true);
  }
  return new LlmError('PROVIDER_UNAVAILABLE', 'the provider could not be reached', true);
}

/**
 * One bounded, secret-free sentence from an untrusted provider body.
 *
 * Only a top-level `message` or `error.message` string is read, whitespace is collapsed, and the
 * result is truncated to 300 characters. Anything else -- a raw body, a header, a nested object --
 * is replaced by the status code alone. A provider that echoes the request back cannot push
 * student text into a log line through this function, because only a `message` field is read and
 * the caller never passes a request body in.
 */
export function describeProviderError(status: number, body: unknown): string {
  const message = readMessageField(body);
  const suffix = message === null ? '' : `: ${message}`;
  return `provider returned HTTP ${status}${suffix}`.slice(0, 300);
}

function readMessageField(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const direct = record['message'];
  if (typeof direct === 'string') return collapse(direct);
  const nested = record['error'];
  if (typeof nested === 'object' && nested !== null) {
    const inner = (nested as Record<string, unknown>)['message'];
    if (typeof inner === 'string') return collapse(inner);
  }
  return null;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240);
}
