/**
 * Route-group protection (WP-03 deliverable; `04` S9.1; `07` S3.2).
 *
 * **Strategy chosen: (b) -- a cheap presence/shape check only.** The real verification happens in
 * every route handler and server component through `requireRole`, which uses `node:crypto` and
 * the `users` row.
 *
 * **Why not (a), verifying in middleware with Web Crypto.** Three reasons, in order of weight:
 *
 * 1. `04` S9.1 is explicit that "a layout-level check is convenience, not authorisation" and that
 *    "route handlers repeat the check". A middleware that verified the signature would still not
 *    be the authorisation, because it cannot reach the `users` row to resolve the authoritative
 *    role (`04` S9.1: role is "resolved server-side on every request; never trusted from the
 *    client"). Implementing HMAC verification a second time in `crypto.subtle` would add a second
 *    implementation of a security primitive whose two copies can disagree -- the failure mode
 *    `AGENTS.md` S6.1 warns about -- while buying no authorisation.
 * 2. This file cannot import `@/lib/auth/session`: middleware runs on the edge runtime, where
 *    `node:crypto` does not exist. A duplicated Web-Crypto verifier would be the only thing
 *    standing between an unauthenticated visitor and a page whose server component independently
 *    re-checks anyway.
 * 3. The check here is deliberately weak and cheap: **is the cookie present, and is its value
 *    plausibly a token?** An expired cookie therefore still passes this gate and is then refused
 *    by the server-side guard, which is correct -- the middleware never grants access.
 *
 * The gap this leaves, stated plainly: a visitor who forges a cookie-shaped string reaches the
 * route's own component, which calls `requireRole` and refuses. No page and no route handler in
 * `app/` may rely on this file for authorisation.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { LOGIN_PATH, PROTECTED_PATH_PREFIXES, SESSION_COOKIE_NAME } from '@/lib/auth/_shared';

/**
 * The cheapest shape test that is still worth doing: three dot-separated base64url segments. It
 * exists so an obviously-not-a-token value is rejected before a page render, not because it
 * proves anything about authenticity.
 */
function looksLikeSessionToken(value: string): boolean {
  if (value.length === 0 || value.length > 4096) return false;
  const parts = value.split('.');
  return parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * `?next=` is carried through so the sign-in screen can return the visitor to where they were
 * (`07` S3.2). Only a same-origin absolute path is carried, so the parameter cannot be turned
 * into an open redirect.
 */
function withNext(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie !== undefined && looksLikeSessionToken(cookie)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = '';
  url.searchParams.set('next', withNext(pathname, search));
  return NextResponse.redirect(url);
}

/**
 * Only the two protected route groups are matched. Everything else -- `/api/**`, `/_next/**`,
 * `/login`, and the walking-skeleton `/` -- is untouched, so the middleware can never intercept
 * an API request (the handlers do their own checking) or a static asset.
 */
export const config = {
  matcher: ['/student/:path*', '/tutor/:path*'],
};
