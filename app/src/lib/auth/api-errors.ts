/**
 * The house error envelope, as a small factory.
 *
 * **Shape (`06` S5.3, reproduced exactly).**
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
 * **`message` never contains** a SQL fragment, a stack trace, a file path, a secret, an internal
 * hostname, or another user's row (C7). The messages in this file are fixed sentences, never
 * interpolated from an exception, so there is no path by which driver text reaches a response.
 *
 * Three codes are what WP-03's own routes return (`06` S5.4: `VALIDATION_FAILED`,
 * `UNAUTHENTICATED`, `RATE_LIMITED`). A fourth, `FORBIDDEN_ROLE`, is included because
 * `requireRole` produces it: `06` S5.2 rule 3 is explicit that an authenticated caller on the
 * wrong role gets `403 FORBIDDEN_ROLE`, and every role-scoped route in the build plan checks that.
 * `INTERNAL` is the fifth, for the one case the sign-in route cannot deny: the database is
 * unreachable, which is not a credential problem and must not be reported as one. The remaining
 * codes are added by the work packets that return them; inventing them here would be a type that
 * pretends to cover behaviour that does not exist yet.
 */

import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

export type AuthErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ROLE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** `06` S5.3 fixes the HTTP status per code. */
const STATUS_BY_CODE: Readonly<Record<AuthErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export interface ApiErrorBody {
  error: {
    code: AuthErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

/**
 * The request id for a response.
 *
 * `06` S5.1: "the server sets `x-request-id` on every response and echoes an inbound one". An
 * inbound value is only echoed when it is a short, printable token, so a client cannot inject
 * a header value or a log-injection payload through it.
 */
export function resolveRequestId(request: Request): string {
  const inbound = request.headers.get('x-request-id');
  if (inbound !== null && /^[A-Za-z0-9._:-]{1,128}$/.test(inbound)) return inbound;
  return randomUUID();
}

/** Build the failure envelope as a `NextResponse`, with the request id echoed as a header. */
export function apiError(
  code: AuthErrorCode,
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
 * The retry hint for a rate-limited response. `06` S5.3: `RATE_LIMITED` always carries a
 * `Retry-After` header, and the value is whole seconds, never a timestamp.
 */
export function withRetryAfter(
  response: NextResponse<ApiErrorBody>,
  retryAfterSeconds: number,
): NextResponse<ApiErrorBody> {
  response.headers.set('retry-after', String(Math.max(1, Math.ceil(retryAfterSeconds))));
  return response;
}

/** Set the request id on a successful response too (`06` S5.1 requires it on every response). */
export function withRequestId<T>(response: NextResponse<T>, requestId: string): NextResponse<T> {
  response.headers.set('x-request-id', requestId);
  response.headers.set('cache-control', 'no-store');
  return response;
}

/** The fixed sentences. Exported so tests can assert on them without duplicating the string. */
export const AUTH_ERROR_MESSAGES = {
  // 07 S3.1: identical for an unknown email and a wrong password, so the form never confirms
  // which addresses exist. It is also the message for a deactivated account and for a missing
  // or invalid session cookie ("No session, or the session cookie is invalid or expired").
  unauthenticated: 'Email or password is not correct.',
  /**
   * The same `UNAUTHENTICATED` code, worded for a route where no credential was submitted
   * (`GET /api/auth/session`, `POST /api/auth/logout`). `06` S5.3 defines the code as "No session,
   * or the session cookie is invalid or expired"; telling a session lookup that its *password* was
   * wrong would describe a form that is not on screen.
   */
  noSession: 'No active session. Sign in to continue.',
  forbiddenRole: 'This account does not hold the role this route requires.',
  invalidBody: 'The request body was not valid JSON with an email and a password.',
  rateLimited: 'Too many sign-in attempts.',
  // `06` S5.3: the body of an INTERNAL response contains the code and the request id only, so
  // this sentence says nothing about what went wrong beyond "not your credentials".
  internal: 'Sign-in is temporarily unavailable.',
} as const;
