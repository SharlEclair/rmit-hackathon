import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { FaqEntryResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { withTransaction } from '@/lib/db/transaction';
import { editFaqEntry, resolveFaqAssignment, type FaqTargetStatus } from '@/features/faq/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The statuses a tutor write may set, from `ck_publication_status`'s vocabulary.
 *
 * `AI_GENERATED` is absent because an artifact never returns to being ungenerated (D96), and the
 * out-of-student-view transition is **`REJECTED`** rather than an invented `WITHDRAWN` -- a first pass
 * used the latter and the CHECK refused it, which is the schema doing its job.
 */
const TARGET_STATUSES = ['NEEDS_REVIEW', 'EDITED', 'APPROVED', 'PUBLISHED', 'REJECTED'] as const;

/**
 * `PATCH /api/tutor/faq-entries/{entryId}` (`06` section 5.4, `07` section 5.5).
 *
 * **The route gates on the entry's own assignment**, resolved from the row rather than from the client,
 * so a tutor cannot pair their own assignment with a foreign entry id. The pattern is Phase 4's
 * `guardTutorArtifact`, and it is the reason the path addresses the entry and not the assignment.
 *
 * **`revision` is required and a mismatch is `409 STALE_REVISION`.** `0012` added the column and D98
 * established optimistic concurrency for tutor writes; the guard is inside the `update`'s WHERE clause,
 * so two concurrent edits cannot both pass a read-then-write check. A client that omits `revision` is
 * refused rather than defaulted, because defaulting would silently disable the protection.
 *
 * **`PUBLISHED` is the only student-visible status (D99).** `APPROVED` is a real, distinct state that
 * remains invisible, and `WITHDRAWN` clears the publication stamps so a withdrawn entry cannot read as
 * ever-published.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
): Promise<NextResponse<FaqEntryResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { entryId } = await context.params;

  const assignmentId = await withTransaction((tx) => resolveFaqAssignment(tx, entryId));
  if (assignmentId === null) {
    return apiError('NOT_FOUND', 'That FAQ entry could not be found.', requestId);
  }

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const now = new Date();
  const outcome = await withTransaction((tx) =>
    editFaqEntry(tx, {
      entryId,
      expectedRevision: parsed.expectedRevision,
      question: parsed.question,
      answer: parsed.answer,
      targetStatus: parsed.targetStatus,
      tutorUserId: guarded.value.session.userId,
      now,
    }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId, outcome.details);

  await withTransaction((tx) =>
    insertAuditLog(tx, {
      id: randomUUID(),
      actorUserId: guarded.value.session.userId,
      actorRole: 'tutor',
      action: 'faq_entry.edited',
      targetTable: 'faq_entries',
      targetId: entryId,
      // The revision pair and the status transition, and **no question or answer text** (06 section
      // 7.6.5's redaction rule: the audit row carries the act, not the content).
      before: { revision: parsed.expectedRevision },
      after: { revision: outcome.value.revision, publicationStatus: outcome.value.publicationStatus },
      requestId,
    }),
  );

  return withRequestId(NextResponse.json(outcome.value, { status: 200 }), requestId);
}

type ParsedBody =
  | {
      readonly ok: true;
      readonly question: string;
      readonly answer: string;
      readonly expectedRevision: number;
      readonly targetStatus: FaqTargetStatus;
    }
  | { readonly ok: false; readonly message: string; readonly details?: Record<string, unknown> };

async function readBody(request: NextRequest): Promise<ParsedBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, message: 'The request body was not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'The request body was not valid.' };
  }
  const record = raw as Record<string, unknown>;

  const question = record['question'];
  if (typeof question !== 'string') {
    return { ok: false, message: 'A question is required.', details: { fields: ['question'] } };
  }
  const answer = record['answer'];
  if (typeof answer !== 'string') {
    return { ok: false, message: 'An answer is required.', details: { fields: ['answer'] } };
  }

  const revision = record['revision'];
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    return {
      ok: false,
      message: 'A revision is required so a concurrent edit can be detected.',
      details: { fields: ['revision'] },
    };
  }

  const publicationStatus = record['publicationStatus'];
  if (
    typeof publicationStatus !== 'string' ||
    !TARGET_STATUSES.includes(publicationStatus as FaqTargetStatus)
  ) {
    return {
      ok: false,
      message: 'A publication status is required.',
      details: { fields: ['publicationStatus'], allowed: [...TARGET_STATUSES] },
    };
  }

  return {
    ok: true,
    question,
    answer,
    expectedRevision: revision,
    targetStatus: publicationStatus as FaqTargetStatus,
  };
}
