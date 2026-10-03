/**
 * The session token: a stateless, HMAC-signed value carried in an httpOnly cookie (**D79**).
 *
 * **Why stateless.** `04` S9.1 ("Auth (D42)") describes a server-side session row with expiry
 * and revocation, but `06-DATA-MODEL.md` defines no session table anywhere, and WP-03's own
 * acceptance criterion is explicit the other way: "Sessions survive a server restart
 * (stateless token), so a demo-day restart does not sign everyone out." D79 therefore fixes
 * the mechanism implemented here: a signed token, no row.
 *
 * **Revocation is deliberately NOT implemented.** There is no storage for it, and inventing a
 * table would be a `06` change D42 does not authorise (D79). A token is valid until it expires
 * or `AUTH_SECRET` changes. Nothing in this file may claim otherwise.
 *
 * **What the signature does and does not mean.** A valid signature proves the payload was
 * issued by this deployment; it does not prove the user still exists, is still active, or
 * still holds the claimed role. Those three are resolved from the `users` row on every request
 * by `roles.ts` (`04` S9.1: role resolution is server-side on every request and is never
 * trusted from the client). The role in the payload is a convenience for the middleware's
 * cheap check, never an authorisation.
 *
 * **No project imports.** This module must be loadable by a unit test under the repository's
 * `vitest.config.ts`, which defines no path aliases, so it imports nothing from `@/`. The
 * secret is a parameter (`DependencySecret` below) rather than a `getConfig()` call for the
 * same reason: it keeps the cryptographic core testable with no environment at all.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { SESSION_COOKIE_NAME } from './_shared';

export type SessionRole = 'student' | 'tutor';

/** The signed payload. Field names are short because every byte is carried in a cookie. */
export interface SessionTokenPayload {
  /** Token format version. A payload with any other value is refused, never migrated. */
  v: 1;
  /** `users.id`. */
  sub: string;
  /** The role **at issue time**. Authoritative role always comes from the `users` row. */
  role: SessionRole;
  /** Issued at, epoch milliseconds. */
  iat: number;
  /** Expires at, epoch milliseconds. */
  exp: number;
}

/** A verified token. Structurally the signed payload, but only ever produced by `verifySessionToken`. */
export type SessionToken = SessionTokenPayload;

/** 12 hours. Long enough to survive a full demo day without a re-sign-in, short enough to bound a stolen cookie. */
export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;

/**
 * The longest lifetime a *verified* token may claim, whatever its `exp` says.
 *
 * A token can only carry a longer window if it was signed with `AUTH_SECRET`, so this is not a
 * forgery defence; it is a defence against a future caller minting an unbounded session by
 * mistake. Keep it equal to `SESSION_LIFETIME_MS` plus a small clock-skew allowance.
 */
export const SESSION_MAX_LIFETIME_MS = SESSION_LIFETIME_MS + 60 * 1000;

/** One day, in seconds, for the cookie's own `Max-Age`. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = Math.floor(SESSION_LIFETIME_MS / 1000);

const TOKEN_VERSION = 1;
const HMAC_ALGORITHM = 'sha256';
const MAX_USER_ID_LENGTH = 64;
const MAX_COOKIE_LENGTH = 4096;

/** Narrow `unknown` to a plain object without an `any` in a signature. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Base64url without padding, encoded from a UTF-8 string. */
function encodeSegment(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Base64url decode, or `null`. `Buffer.from` is lenient, so the round-trip is checked. */
function decodeSegment(segment: string): string | null {
  if (segment.length === 0) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.length === 0) return null;
  // A lenient decode of a non-base64 string can round-trip differently; refuse that case
  // rather than acting on bytes the client did not actually send.
  if (bytes.toString('base64url') !== segment) return null;
  return bytes.toString('utf8');
}

function hmac(secret: string, signingInput: string): Buffer {
  return createHmac(HMAC_ALGORITHM, secret).update(signingInput, 'utf8').digest();
}

function isRole(value: unknown): value is SessionRole {
  return value === 'student' || value === 'tutor';
}

function isEpochMillis(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Sign a payload. The secret is required and must be non-empty; an empty secret would make
 * every token forgeable, so this throws rather than signing one.
 *
 * The payload is validated here as well as in `verifySessionToken`, so a caller that passes a
 * role or an expiry the verifier will refuse finds out at the call site rather than by watching
 * every sign-in silently fail.
 */
export function signSessionToken(
  payload: SessionTokenPayload,
  secret: string,
  now: number = Date.now(),
): string {
  if (secret === '') {
    throw new Error('AUTH_SECRET is empty; refusing to sign a session token');
  }
  if (payload.v !== TOKEN_VERSION) {
    throw new Error('refusing to sign a session token with an unknown version');
  }
  if (payload.sub === '' || payload.sub.length > MAX_USER_ID_LENGTH) {
    throw new Error('refusing to sign a session token with an invalid subject');
  }
  if (!isRole(payload.role)) {
    throw new Error('refusing to sign a session token with a role outside the permitted set');
  }
  if (!isEpochMillis(payload.iat) || !isEpochMillis(payload.exp)) {
    throw new Error('refusing to sign a session token with an invalid lifetime');
  }
  if (payload.exp <= payload.iat || payload.exp - payload.iat > SESSION_MAX_LIFETIME_MS) {
    throw new Error('refusing to sign a session token with an out-of-range lifetime');
  }
  if (payload.exp <= now) {
    throw new Error('refusing to sign an already-expired session token');
  }
  const body: SessionTokenPayload = {
    v: TOKEN_VERSION,
    sub: payload.sub,
    role: payload.role,
    iat: payload.iat,
    exp: payload.exp,
  };
  const signingInput = `${TOKEN_VERSION}.${encodeSegment(JSON.stringify(body))}`;
  const signature = hmac(secret, signingInput).toString('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * Verify a token.
 *
 * **Refuse-by-default** (`AGENTS.md` S6.1, in spirit): every failure -- wrong number of parts,
 * unknown version, non-base64url segment, unparseable JSON, wrong payload shape, signature
 * mismatch, expiry -- answers `null`. Nothing here throws on attacker-controlled input, and
 * nothing here has an "accept anyway" branch.
 *
 * The signature comparison is **constant-time** (`timingSafeEqual`). `timingSafeEqual` throws
 * when the buffers differ in length, so length is checked first and a length mismatch is a
 * plain rejection -- the length of an HMAC digest is public information, not a secret.
 */
export function verifySessionToken(
  token: unknown,
  secret: string,
  now: number = Date.now(),
): SessionToken | null {
  if (typeof token !== 'string') return null;
  if (secret === '') return null;
  if (token.length === 0 || token.length > MAX_COOKIE_LENGTH) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const versionPart = parts[0];
  const payloadPart = parts[1];
  const signaturePart = parts[2];
  if (versionPart === undefined || payloadPart === undefined || signaturePart === undefined) {
    return null;
  }
  if (versionPart !== String(TOKEN_VERSION)) return null;

  const expected = hmac(secret, `${versionPart}.${payloadPart}`);
  // An HMAC-SHA-256 digest is always 32 bytes, so its base64url form is always 43 characters.
  // Checking the length first means an attacker-controlled signature segment is never decoded,
  // and `timingSafeEqual` is never handed buffers of different lengths (it throws on those).
  const expectedSignatureLength = Math.ceil((expected.length * 4) / 3);
  if (signaturePart.length !== expectedSignatureLength) return null;
  const provided = Buffer.from(signaturePart, 'base64url');
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  const payloadJson = decodeSegment(payloadPart);
  if (payloadJson === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  if (parsed['v'] !== TOKEN_VERSION) return null;
  const sub = parsed['sub'];
  if (typeof sub !== 'string' || sub === '' || sub.length > MAX_USER_ID_LENGTH) return null;
  const role = parsed['role'];
  if (!isRole(role)) return null;
  const iat = parsed['iat'];
  const exp = parsed['exp'];
  if (!isEpochMillis(iat) || !isEpochMillis(exp)) return null;
  if (exp <= iat) return null;
  if (exp - iat > SESSION_MAX_LIFETIME_MS) return null;
  // Expiry is inclusive: at `exp` the session is already over.
  if (exp <= now) return null;

  return { v: TOKEN_VERSION, sub, role, iat, exp };
}

// ---------------------------------------------------------------------------------------------
// Cookie plumbing
// ---------------------------------------------------------------------------------------------

/** The attributes this module sets. Every one of them is fixed by `04` S9.1. */
export interface SessionCookieAttributes {
  name: string;
  value: string;
  path: string;
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
}

/**
 * The shape of the response object the route handlers pass in: anything with
 * `cookies.set(options)`. Next.js's `NextResponse` satisfies it structurally, and spelling the
 * subset here keeps this file free of a `next/server` import so the signing core does not drag
 * the framework into a unit test.
 */
export interface SessionCookieTarget {
  cookies: {
    set(options: SessionCookieAttributes): unknown;
  };
}

export interface SessionCookieOptions {
  /**
   * Taken from `config.nodeEnv === 'production'` by the caller. This module never reads
   * `process.env` -- `config.ts` is the only module allowed to (WP-01).
   */
  readonly secure: boolean;
}

/**
 * Write the session cookie onto a response.
 *
 * `httpOnly`, `SameSite=Lax`, `Path=/` and `Secure` in production are the four attributes
 * `04` S9.1 fixes. `maxAge` is the token lifetime, so the cookie and the token expire together
 * rather than one outliving the other.
 */
export function setSessionCookie(
  response: SessionCookieTarget,
  token: string,
  options: SessionCookieOptions,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: options.secure,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Clear the session cookie. The token itself is not revoked (there is no store); it is dropped. */
export function clearSessionCookie(
  response: SessionCookieTarget,
  options: SessionCookieOptions,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: options.secure,
    maxAge: 0,
  });
}

/** Read the raw cookie value from a request, or `null` when absent or empty. */
export function readSessionCookie(request: {
  cookies: { get(name: string): { value: string } | undefined };
}): string | null {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (cookie === undefined || cookie.value === '') return null;
  return cookie.value;
}
