/**
 * The auth facts that `middleware.ts` and the auth modules must agree on.
 *
 * **Why this file exists, and why it has no imports.** `middleware.ts` runs on the edge
 * runtime, where `node:crypto` and `@node-rs/argon2` do not exist, so it can never import
 * `./session` (which imports `node:crypto`) or `./password`. But the middleware and the
 * session module must not hold two copies of the cookie name or two copies of the
 * post-sign-in landing paths: two sources of truth that disagree are exactly how a gate
 * stops matching the thing it gates. This module is the smallest possible shared surface:
 * string and path constants only, zero imports, safe on every runtime.
 *
 * It is the ONE file added beyond WP-03's deliverable list (see the report), and it is
 * deliberately not in the deliverable list's spirit of "one module per concern": it is a
 * constant table, not a behaviour module.
 */

/** The session cookie name. Not a secret, and not a token prefix (`04` S9.1). */
export const SESSION_COOKIE_NAME = 'aa_session';

/** Role-appropriate landing paths (`06` S5.5.1 `redirectTo`; `07` S3.1). */
export const STUDENT_LANDING_PATH = '/student';
export const TUTOR_LANDING_PATH = '/tutor';

/** Where an unauthenticated request is sent, with `?next=<path>` (`07` S3.2). */
export const LOGIN_PATH = '/login';

/**
 * The route groups a signed-in visitor may reach. Middleware does a cheap presence check on
 * these; the real authorisation is `requireRole` in each route handler and server component,
 * because "a layout-level check is convenience, not authorisation" (`04` S9.1, WP-03).
 */
export const PROTECTED_PATH_PREFIXES: readonly string[] = [STUDENT_LANDING_PATH, TUTOR_LANDING_PATH];
