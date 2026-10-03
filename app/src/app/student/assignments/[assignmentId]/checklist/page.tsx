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
 */
export default async function ChecklistTabPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireStudentPage(`/student/assignments/${assignmentId}/checklist`);
  const { scope } = await loadWorkspace(session, assignmentId);
  const checklist = await loadChecklist(scope, session);

  return <ChecklistPanel assignmentId={assignmentId} checklist={checklist} />;
}
