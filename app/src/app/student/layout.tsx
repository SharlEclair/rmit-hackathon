import type { ReactNode } from 'react';

import { SidebarShell } from '@/components/sidebar-shell';
import { loadSidebar, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The student section shell: the persistent course/assignment sidebar plus the page.
 *
 * It sits above `/student` and everything beneath it, so the sidebar is built once and survives
 * navigation between the dashboard, a course and the four assignment tabs.
 *
 * **The session is resolved here and again in the assignment layout.** That is deliberate rather than
 * duplicated work: `requireStudentPage` is the authorisation gate, and a layout that trusted its
 * parent's gate would be one refactor away from rendering for the wrong role. It re-reads a cookie and
 * one `users` row, which is not the cost that matters on a page that has already queried the database.
 *
 * **This layout does not gate assignment content.** Gate rule G1 stays where it was -- in
 * `loadWorkspace` inside the assignment layout -- and the sidebar's own visibility rule is the join
 * predicate in `loadSidebar`. One rule, stated once, in each place that needs it.
 */
export default async function StudentSectionLayout(props: {
  readonly children: ReactNode;
}): Promise<React.ReactElement> {
  const session = await requireStudentPage('/student');
  const courses = await loadSidebar(session);

  return (
    <SidebarShell
      courses={courses}
      displayName={session.profile.displayName}
      role="student"
    >
      {props.children}
    </SidebarShell>
  );
}
