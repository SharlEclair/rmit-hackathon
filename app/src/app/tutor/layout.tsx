import type { ReactNode } from 'react';

import { SidebarShell } from '@/components/sidebar-shell';
import { requireTutorPage } from '@/features/review/server-data';
import { loadSidebar } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The tutor section shell: the same persistent sidebar as the student section, with `loadSidebar`
 * narrowing the tree by role instead of by a second component.
 *
 * **One sidebar, two roles, and the difference is the data.** `loadSidebar` returns every assignment
 * on a course the caller teaches -- a draft or in-review assignment is what a tutor is working on --
 * and only published assignments to a student. The visual tree is identical, which is what keeps the
 * two views consistent by construction rather than by two files kept in step.
 *
 * **`requireTutorPage` is the authorisation gate here, not the sidebar's contents.** A user enrolled
 * only as a student is sent to the sign-in screen, so the shell cannot render a tutor tree for the
 * wrong role.
 */
export default async function TutorSectionLayout(props: {
  readonly children: ReactNode;
}): Promise<React.ReactElement> {
  const session = await requireTutorPage('/tutor');
  const courses = await loadSidebar(session);

  return (
    <SidebarShell courses={courses} displayName={session.profile.displayName} role="tutor">
      {props.children}
    </SidebarShell>
  );
}
