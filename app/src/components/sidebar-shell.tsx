import type { ReactNode } from 'react';

import { Sidebar, type SidebarCourseItem } from '@/components/sidebar';

/**
 * The left-sidebar shell, shared by the student and tutor sections.
 *
 * **Why the sidebar lives in a layout and not in each page.** A persistent sidebar is persistent
 * because it does not remount: mounting it per page would rebuild the tree on every navigation, drop
 * the client's expansion state, and flash the whole navigation on each click. A layout is the only
 * place in the App Router that renders once and survives its children changing.
 *
 * **Why one shell rather than two.** The student and tutor sidebars render the same tree, and
 * `loadSidebar` already narrowed the data by role, so two shells would be two places for the sidebar's
 * appearance to drift. The `role` prop exists only to pick the landing target for the wordmark.
 *
 * **The sidebar scrolls, the page scrolls, and they are independent.** The sidebar is a fixed-width
 * column of its own height; the content column owns its scroll. That is what keeps a long checklist
 * from carrying the navigation off-screen.
 */
export function SidebarShell(props: {
  readonly courses: readonly SidebarCourseItem[];
  readonly displayName: string;
  readonly role: 'student' | 'tutor';
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-h-screen bg-page">
      {/* Hidden below `md`: at phone width a 16rem rail leaves too little for the content, and the
          workspace tabs are the primary navigation there. The sidebar returns above `md`. */}
      <div className="sticky top-0 hidden h-screen md:flex">
        <Sidebar courses={props.courses} displayName={props.displayName} role={props.role} />
      </div>
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}
