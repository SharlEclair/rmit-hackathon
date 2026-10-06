import type { ReactNode } from 'react';

import { ProactiveAssistant } from '@/components/proactive-assistant';
import { WorkspaceTabs } from '@/components/workspace-tabs';
import { requireStudentPage, loadWorkspace } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The student assignment workspace shell (`07` UI-UX-SPEC section 4.1).
 *
 * It resolves the session and the workspace **once** for every tab beneath it, so the four tabs cannot
 * disagree about whether the assignment is visible, what the student's progress is, or how many
 * replies are waiting. Each tab page receives the already-gated bundle through `children`, which is
 * why the pages below do not re-resolve gate rule G1.
 *
 * **`notFound()` comes from `loadWorkspace`, and it is the gate.** A `draft`, `ingesting`, `in_review`
 * or `archived` assignment, an assignment with no current structure, and another course's assignment
 * are all the same `404` (`06` section 3.4, trap T3) -- never an empty shell, which would confirm the
 * assignment exists.
 *
 * The Optional Catch-all is deliberately not used: the tab set is fixed by section 4.1, and a dynamic
 * segment would let a URL name a fifth tab that the product does not have.
 */
export default async function AssignmentWorkspaceLayout(props: {
  readonly children: ReactNode;
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const session = await requireStudentPage(`/student/assignments/${assignmentId}`);
  const { workspace } = await loadWorkspace(session, assignmentId);

  return (
    <main className="min-h-screen bg-page px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-col gap-1">
          <p className="mono text-muted">{workspace.assignment.courseCode}</p>
          <h1 className="heading-1 text-ink">{workspace.assignment.title}</h1>
          {workspace.assignment.dueAt === null ? null : (
            <p className="tight text-muted">
              {/* A due date is a document fact, never a model summary (C2, D17). */}
              Due {workspace.assignment.dueAt.slice(0, 10)}
            </p>
          )}
        </header>

        <WorkspaceTabs
          assignmentId={assignmentId}
          counts={{
            queriesWithReply: workspace.counts.queriesWithTutorReply,
            checklistCompleted: workspace.counts.checklistCompleted,
            checklistTotal: workspace.counts.checklistTotal,
          }}
        />

        {props.children}

        {/*
          The Assistant, at the foot of every tab (`07` section 3.3 rule 3: "the Assistant floating
          action button (FAB) sits bottom-right on all four student workspace tabs and nowhere else",
          and section 4.7: "the Assistant is available on all four tabs"). It is mounted once in the
          layout rather than per tab, so switching tabs cannot reset the transcript -- the panel owns
          it, and a per-tab mount would discard it on every navigation.

          The panel is a client component: it owns the `ReadableStream` reader and the composer. The
          proactive notice is not fetched here, because its milestone focus is the student's current
          item, which Phase 6's progress work will supply; until then the panel renders the transcript
          and the composer, and `proactive: null` is an honest "no notice is due" (`06` section 5.5.9:
          `null` means exactly that).
        */}
        <ProactiveAssistant
          assignmentId={assignmentId}
          policyAvailable={workspace.policy.available}
        />
      </div>
    </main>
  );
}
