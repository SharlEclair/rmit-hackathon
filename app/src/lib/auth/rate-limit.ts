/**
 * The login rate limit (`06` S5.6, first row): **10 attempts per IP per 10 minutes, enforced in
 * the route handler before the password comparison.**
 *
 * **Dependency-free and in-process, on purpose.** `06` names no store, D79 gives no table, and
 * WP-03 forbids new dependencies, so the counter is a module-level `Map`. The honest
 * consequences, which nothing in this file may claim away:
 *
 * - It is per process. A multi-instance deployment has one bucket per instance, so the effective
 *   limit is `10 x instances`. The MVP runs one Node process (`12` S3.6), and the Assistant has
 *   its own durable counters in `assistant_sessions.llm_call_count`; the login limit does not.
 * - It resets on restart. A restart therefore resets an attacker's budget.
 * - The map is swept lazily, on access to the same key, plus a size-bounded sweep of expired
 *   entries. It cannot grow without bound: at most `MAX_TRACKED_KEYS` buckets are retained, and
 *   a bucket holds at most one timestamp per attempt inside the window.
 *
 * **The counter key holds no address.** The IP is hashed (SHA-256, truncated) before it is used
 * as a key, because `06` S5.7 forbids IP addresses in application logs "beyond the rate limiter's
 * own bucket key" -- hashing keeps even that key from being an address at rest. Nothing here is
 * logged at all.
 */

import { createHash } from 'node:crypto';

/** `06` S5.6: 10 login attempts per IP per 10 minutes. */
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * The most buckets retained. A defence against unbounded memory from a spray of source
 * addresses; the oldest bucket is dropped when the cap is reached, which can only ever
 * *weaken* the limit, never block a legitimate user.
 */
const MAX_TRACKED_KEYS = 4096;

/** Attempt timestamps, epoch milliseconds, oldest first. */
const attemptTimesByKey = new Map<string, number[]>();

export interface RateLimitDecision {
  readonly allowed: boolean;
  /**
   * Seconds until the oldest attempt in the window falls out of it, i.e. until at least one
   * attempt is available again. `0` when the attempt is allowed.
   */
  readonly retryAfterSeconds: number;
}

/** Truncated SHA-256 of the caller key. Never the address itself (see the module comment). */
function bucketKey(callerKey: string): string {
  return createHash('sha256').update(callerKey, 'utf8').digest('hex').slice(0, 32);
}

function sweepExpired(now: number): void {
  for (const [key, times] of attemptTimesByKey) {
    const live = times.filter((time) => now - time < LOGIN_RATE_LIMIT_WINDOW_MS);
    if (live.length === 0) attemptTimesByKey.delete(key);
    else attemptTimesByKey.set(key, live);
  }
}

/**
 * Record one attempt and decide whether it is allowed.
 *
 * The attempt is recorded **whether or not** it is allowed, so a caller that keeps hammering
 * keeps pushing its own window forward. (An attacker cannot gain by being rejected: the reset
 * only ever moves later.)
 *
 * Call order matters and is fixed by `06` S5.6: this runs **before** the password comparison, so
 * a wrong password and an unknown email both consume the budget.
 */
export function checkLoginRateLimit(callerKey: string, now: number = Date.now()): RateLimitDecision {
  const key = bucketKey(callerKey);
  const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;

  if (attemptTimesByKey.size >= MAX_TRACKED_KEYS) sweepExpired(now);
  if (attemptTimesByKey.size >= MAX_TRACKED_KEYS) {
    // Still full of live buckets: drop the oldest-inserted key rather than grow without bound.
    const oldest = attemptTimesByKey.keys().next();
    if (!oldest.done) attemptTimesByKey.delete(oldest.value);
  }

  const times = (attemptTimesByKey.get(key) ?? []).filter((time) => time > windowStart);
  const allowed = times.length < LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
  times.push(now);
  attemptTimesByKey.set(key, times);

  if (allowed) return { allowed: true, retryAfterSeconds: 0 };

  const oldestLive = times[0] ?? now;
  const retryAfterMs = oldestLive + LOGIN_RATE_LIMIT_WINDOW_MS - now;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

/**
 * The caller key for a request: the client address, or `unknown` when no address header is
 * present. All unknown-address callers share one bucket, which is the conservative direction
 * (it can only make the limit tighter, never looser).
 *
 * `x-forwarded-for` is trusted because the app is expected to sit behind a proxy that sets it
 * (`12` S2). Behind no proxy at all, a client can send the header itself and pick its own bucket;
 * the limit is then a speed bump rather than a control. Fixing that needs a trusted-proxy
 * setting, and WP-03 may not add an environment variable.
 */
export function callerKeyFor(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded !== null) {
    const first = forwarded.split(',')[0];
    const trimmed = first?.trim();
    if (trimmed !== undefined && trimmed !== '') return trimmed;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp !== undefined && realIp !== '') return realIp;
  return 'unknown';
}

/** Test seam: drop every bucket so one test cannot change another's outcome. */
export function resetLoginRateLimit(): void {
  attemptTimesByKey.clear();
}
