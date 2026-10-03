import { readCommitSha } from '@/lib/config';

// The walking-skeleton page (11 WP-01). Deliberately unstyled by Tailwind utilities: the
// design tokens are owned by 07/17 and land with the first UI phase (D75), so any utility
// class used here would reference a custom property that does not exist yet.
//
// It is a server component and reads only server-side config. It must not become a
// dashboard: the student and tutor landing routes are decided by WP-03 and WP-06/WP-07.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main>
      <h1>Assignment Assistant</h1>
      <p>The app is running.</p>
      <ul>
        <li>
          Health: <a href="/api/health">/api/health</a>
        </li>
        <li>Commit: {readCommitSha()}</li>
      </ul>
    </main>
  );
}
