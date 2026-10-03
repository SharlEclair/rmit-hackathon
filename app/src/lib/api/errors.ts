/**
 * The house error envelope and the platform error codes (`06` section 5.3).
 *
 * **Why this file exists** (handoff issue I-19). The envelope was written in Phase 1 under
 * `src/lib/auth/`, because the first routes that needed it were auth routes. `06` section 5.3 makes
 * `ApiErrorResponse` a platform-wide contract, and `04` section 3 scopes `src/lib/auth/` to "session
 * issue/verify, role resolution, route guards" -- so a non-auth route returning an error had to
 * either import from the auth layer (wrong layering) or re-implement the envelope. Phase 2 moved it
 * here and re-pointed the auth routes in the same change, before a second phase imported the wrong
 * path.
 *
 * **Shape (`06` section 5.3, reproduced exactly).**
 *
 * ```ts
 * interface ApiErrorResponse {
 *   error: {
 *     code: ErrorCode;                    // stable, SCREAMING_SNAKE_CASE
 *     message: string;                    // one sentence, safe to show a user
 *     details?: Record<string, unknown>;  // validated field names, allowed values, retry hints
 *     requestId: string;
 *   };
 * }
 * ```
 *
 * `message` never contains a SQL fragment, a stack trace, a file path, a secret, an internal
 * hostname, or another user's row (C7). Every message in this file is a fixed sentence, never
 * interpolated from an exception, so there is no path by which driver text reaches a response.
 *
 * `ErrorCode` carries all **sixteen** codes of `06` section 5.3. Phase 1 declared five of them and
 * said the rest would be added by the packet that returns them; Phase 2 is that packet for
 * `INGESTION_IN_PROGRESS`, `NO_SOURCES`, `EXTRACTION_FAILED`, `UNSUPPORTED_FORMAT`,
 * `PAYLOAD_TOO_LARGE`, `LLM_UNAVAILABLE` and `LLM_OUTPUT_INVALID`, so the union is completed here
 * rather than widened opportunistically later.
 */

import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

/** Every code of `06` section 5.3. Thirteen are returned by a route today; three are reserved. */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ROLE'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'IMMUTABLE_FIELD'
  | 'INVALID_STATE_TRANSITION'
  | 'STALE_REVISION'
  | 'INGESTION_IN_PROGRESS'
  | 'NO_SOURCES'
  | 'EXTRACTION_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_OUTPUT_INVALID'
  | 'INTERNAL';

/** `06` section 5.3 fixes the HTTP status per code. */
const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  IMMUTABLE_FIELD: 409,
  INVALID_STATE_TRANSITION: 409,
  STALE_REVISION: 409,
  INGESTION_IN_PROGRESS: 409,
  NO_SOURCES: 422,
  EXTRACTION_FAILED: 422,
  UNSUPPORTED_FORMAT: 415,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  LLM_UNAVAILABLE: 503,
  LLM_OUTPUT_INVALID: 502,
  INTERNAL: 500,
};

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

/**
 * The request id for a response.
 *
 * `06` section 5.1: "the server sets `x-request-id` on every response and echoes an inbound one". An
 * inbound value is only echoed when it is a short, printable token, so a client cannot inject a
 * header value or a log-injection payload through it.
 */
export function resolveRequestId(request: Request): string {
  const inbound = request.headers.get('x-request-id');
  if (inbound !== null && /^[A-Za-z0-9._:-]{1,128}$/.test(inbound)) return inbound;
  return randomUUID();
}

/** Build the failure envelope as a `NextResponse`, with the request id echoed as a header. */
export function apiError(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: details === undefined ? { code, message, requestId } : { code, message, details, requestId },
  };
  return NextResponse.json(body, {
    status: STATUS_BY_CODE[code],
    // Anything that can carry a session decision is never cacheable by a shared cache (`06` S5.1).
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
}

/**
 * The retry hint for a rate-limited response. `06` section 5.3: `RATE_LIMITED` always carries a
 * `Retry-After` header, and the value is whole seconds, never a timestamp.
 */
export function withRetryAfter(
  response: NextResponse<ApiErrorBody>,
  retryAfterSeconds: number,
): NextResponse<ApiErrorBody> {
  response.headers.set('retry-after', String(Math.max(1, Math.ceil(retryAfterSeconds))));
  return response;
}

/** Set the request id on a successful response too (`06` section 5.1 requires it on every response). */
export function withRequestId<T>(response: NextResponse<T>, requestId: string): NextResponse<T> {
  response.headers.set('x-request-id', requestId);
  response.headers.set('cache-control', 'no-store');
  return response;
}

/**
 * The fixed sentences, exported so tests and routes assert on them without duplicating the string.
 *
 * Auth-specific copy is in `AUTH_ERROR_MESSAGES`; the ingestion and upload sentences live with the
 * features that return them, because their wording is `07`'s, not this module's.
 */
export const AUTH_ERROR_MESSAGES = {
  // `07` S3.1: identical for an unknown email and a wrong password, so the form never confirms which
  // addresses exist. It is also the message for a deactivated account and for a missing or invalid
  // session cookie ("No session, or the session cookie is invalid or expired").
  unauthenticated: 'Email or password is not correct.',
  /**
   * The same `UNAUTHENTICATED` code, worded for a route where no credential was submitted
   * (`GET /api/auth/session`, `POST /api/auth/logout`). `06` S5.3 defines the code as "No session, or
   * the session cookie is invalid or expired"; telling a session lookup that its *password* was wrong
   * would describe a form that is not on screen.
   */
  noSession: 'No active session. Sign in to continue.',
  forbiddenRole: 'This account does not hold the role this route requires.',
  invalidBody: 'The request body was not valid JSON with an email and a password.',
  rateLimited: 'Too many sign-in attempts.',
  // `06` S5.3: the body of an INTERNAL response contains the code and the request id only, so this
  // sentence says nothing about what went wrong beyond "not your credentials".
  internal: 'Sign-in is temporarily unavailable.',
} as const;

/** The fixed sentences for the Phase 2 routes. */
export const PLATFORM_ERROR_MESSAGES = {
  notFound: 'That resource could not be found.',
  invalidBody: 'The request body was not valid.',
  unsupportedFormat: 'That file type is not accepted here.',
  payloadTooLarge: 'That file is larger than the upload limit.',
  noSources: 'This assignment has no source documents yet.',
  ingestionInProgress: 'An analysis run is already in progress for this assignment.',
  ingestionUnavailable: 'The analysis service is unavailable right now.',
  extractionFailed: 'That document could not be read.',
  internal: 'Something went wrong. Try again.',
} as const;

/**
 * A `401` for a route where no credential was presented, using the envelope above.
 *
 * Kept here so a route does not have to remember which of the two `UNAUTHENTICATED` sentences applies.
 */
export function unauthenticated(requestId: string): NextResponse<ApiErrorBody> {
  return apiError('UNAUTHENTICATED', AUTH_ERROR_MESSAGES.noSession, requestId);
}
