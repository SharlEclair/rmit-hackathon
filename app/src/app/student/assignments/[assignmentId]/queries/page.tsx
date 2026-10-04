import Link from 'next/link';

import { QueryComposer } from '@/components/query-composer';
import { EmptyState } from '@/components/ui/empty-state';
import { EMPTY_STATE } from '@/components/ui/fixed-strings';
import { StatePanel } from '@/components/ui/state-panel';
import { buildStudentQueryList } from '@/features/queries/service';
import { queryViewerFor } from '@/features/queries/routes';
import {
  formatDateTime,
  messageCountLabel,
  queryStatusWord,
  queryTitle,
} from '@/features/workspace/presentation';
import { withTransaction } from '@/lib/db/transaction';
import { loadWorkspace, requireStudentPage } from '@/features/workspace/server-data';

export const dynamic = 'force-dynamic';

/**
 * The My Queries tab (`07` UI-UX-SPEC section 4.4).
 *
 * **This tab was a stated empty case and nothing else.** The route existed from Phase 5 because
 * section 4.1 rule 3 is unconditional -- "A tab with nothing published yet is still present and shows
 * its empty state. Tabs are never hidden" -- and Phase 6 built the whole backend behind it: `openQuery`,
 * `addStudentMessage`, `resolveOwnQuery`, four routes and the composer's contract. What was missing was
 * the screen, so a student read "your private questions will appear here" and had no way to ask one.
 * `01-STATE.md` section 5 named this the second item to inspect, expecting the same half-built state as
 * Discussions; it was the same state, and this is the missing half.
 *
 * **The list is read through the same builder the route uses**, scoped by `student_id` inside the SQL
 * (`06` section 5.2 rule 4), so a page cannot show a thread the API would refuse and no student id ever
 * comes from the client.
 *
 * **The gate still runs, deliberately**: `loadWorkspace` is what turns an unpublished assignment into a
 * `404`, so this tab cannot be reached by URL for an assignment the student may not see (trap T3).
 */
export default async function QueriesTabPage(props: {
  readonly params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await props.params;
  const base = `/student/assignments/${assignmentId}/queries`;
  const session = await requireStudentPage(base);
  const { scope } = await loadWorkspace(session, assignmentId);

  const viewer = queryViewerFor(session);
  if (viewer === null) {
    return <StatePanel kind="error" message="We could not load your questions." />;
  }

  const list = await withTransaction((tx) =>
    buildStudentQueryList(tx, scope.assignmentId, viewer),
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="heading-2 text-ink">My Queries</h2>
        <QueryComposer assignmentId={assignmentId} />

        {list.items.length === 0 ? (
          /*
            Section 4.4's empty copy, verbatim, including its second line: the distinction it draws --
            private questions for your own situation, Discussions for what the cohort could learn from --
            is the product decision D24 depends on, not decoration.
          */
          <EmptyState
            message={
              <>
                {EMPTY_STATE.queries}{' '}
                Good for questions about your own situation. For questions the whole cohort could learn
                from, use Discussions.
              </>
            }
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {list.items.map((item) => (
              <li key={item.id}>
                {/*
                  Section 4.4: newest activity first (the read's own order), each row showing the subject,
                  the status word, the timestamps and the message count. The status is a word and not a
                  colour, and it is never inferred here -- `queryStatusWord` is the one mapping.
                */}
                <Link
                  href={`${base}/${item.id}`}
                  className="flex flex-col gap-2 rounded-card border border-solid border-default bg-card p-4 no-underline transition-colors duration-fast ease-out hover:border-ink"
                >
                  <span className="heading-3 text-ink">{queryTitle(item.subject)}</span>
                  <span className="ui-sm text-muted">
                    {queryStatusWord(item.status)}
                    {formatDateTime(item.createdAt) === null
                      ? ''
                      : ` - you asked ${String(formatDateTime(item.createdAt))}`}
                    {` - ${messageCountLabel(item.messageCount)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
