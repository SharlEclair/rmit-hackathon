import { ChecklistPanel } from '@/components/checklist-panel';
import {
  loadChecklist,
  loadWorkspace,
  requireStudentPage,
} from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The Checklist tab (`07` UI-UX-SPEC section 4.6).
 *
 * The layout already resolved the session and the gate, so this page re-reads only the Checklist. The
 * `Assignment` tab renders the Map from the same bundle, which is what makes section 4.3 rule 9 true
 * by construction -- "progress marks in the Map and in the Checklist come from the same data and must
 * never disagree" -- because both read `items[].state` from one request.
 *
 * **The wrapper is not decoration.** This page is the only tab that renders a single component with
 * no container of its own, and there is no `layout.tsx` in the `[assignmentId]` segment -- each tab
 * supplies its own frame. Without the `flex flex-col gap-6` div the panel sat flush against the page
 * edge, which is why this page measured zero `className` attributes while its siblings carried six or
 * more (I-63). The class is the siblings' own wrapper, so the three tabs now line up.
 */
export default async function ChecklistTabPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireStudentPage(`/student/assignments/${assignmentId}/checklist`);
  const { scope } = await loadWorkspace(session, assignmentId);
  const checklist = await loadChecklist(scope, session);

  return (
    <div className="flex flex-col gap-6">
      <ChecklistPanel assignmentId={assignmentId} checklist={checklist} />
    </div>
  );
}
