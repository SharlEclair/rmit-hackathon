/**
 * The one thing every Query route needs before it can call the feature: the caller as the feature sees
 * them.
 *
 * **A Query viewer needs `anonIdSecret` because `createQuery` emits the `query_created` analytics event in
 * the same transaction** (trap **T7**), and that event's `subject_ref` is the analytics pseudonym derived
 * from the secret (`06` section 4.7.2). A Query is identity-bearing -- the tutor sees who asked (D24,
 * D50) -- but its *analytics* row is not, which is why the secret is needed here even though no response
 * from this feature carries a pseudonym.
 *
 * **This file deliberately does not import the discussion identity service.** A Query is always
 * attributed, so it has no anonymous identity to resolve, and A-ID-2's single-reader rule stays provable
 * (`tests/discussion/imports.test.ts` asserts the identity module is imported only from the discussion
 * feature and its routes).
 */

import type { SessionContext } from '@/lib/auth/roles';
import { getConfig } from '@/lib/config';
import type { QueryViewer } from '@/features/queries/service';

/**
 * The viewer the feature needs, or `null` when the secret is missing.
 *
 * Only the session is needed: unlike a Discussion route, nothing here has to know which assignment the
 * caller can see, because every read and write is scoped by a `queryId` whose assignment the route has
 * already gated. Taking just the session is what keeps a caller from passing a scope it does not use.
 */
export function queryViewerFor(session: SessionContext): QueryViewer | null {
  const anonIdSecret = readAnonIdSecret();
  if (anonIdSecret === null) return null;
  return { userId: session.userId, anonIdSecret };
}

/**
 * A missing `ANON_ID_SECRET` is a configuration fault. The value itself is never reported (C7), and
 * `null` is what a route turns into `INTERNAL`.
 */
function readAnonIdSecret(): string | null {
  try {
    return getConfig().anonIdSecret;
  } catch {
    return null;
  }
}
