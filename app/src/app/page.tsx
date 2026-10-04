import { readCommitSha } from '@/lib/config';

/**
 * The walking-skeleton page (`11` WP-01).
 *
 * **What it is, and deliberately still is: an operational status page, not a dashboard.** It reports
 * that the process is up and which commit is serving, and it links the health endpoint. The student
 * and tutor landing routes are decided by WP-03 and WP-06/WP-07, so this must not grow into a second
 * front door -- a visitor with a session is redirected by the middleware, and a visitor without one
 * signs in at `/login`.
 *
 * **The comment here used to forbid Tailwind classes**, on the same reasoning the sign-in screen once
 * used: "the design tokens are owned by 07/17 and land with the first UI phase (D75), so any utility
 * class used here would reference a custom property that does not exist yet." The tokens landed; the
 * comment did not, and neither did the markup (I-63). It is styled now, and the classes come from the
 * existing components rather than from new decisions.
 *
 * It stays visibly an ops page on purpose. Dressing a status endpoint as a product landing screen
 * would make it harder to tell a healthy deploy from a product, which is the one thing this page is
 * for.
 */
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="heading-1 text-ink">AssignMate</h1>
          <p className="tight text-muted">The app is running.</p>
        </header>

        <div className="rounded-card border border-solid border-default bg-card p-4">
          <h2 className="heading-3 mb-4 text-ink">Status</h2>
          <dl className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <dt className="ui-sm text-muted">Health</dt>
              <dd className="tight">
                <a className="text-info underline" href="/api/health">
                  /api/health
                </a>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="ui-sm text-muted">Commit</dt>
              <dd className="mono-sm text-ink">{readCommitSha()}</dd>
            </div>
          </dl>
        </div>

        <p className="ui-sm mt-4 text-muted">
          Sign in at{' '}
          <a className="text-info underline" href="/login">
            /login
          </a>
          .
        </p>
      </div>
    </main>
  );
}
