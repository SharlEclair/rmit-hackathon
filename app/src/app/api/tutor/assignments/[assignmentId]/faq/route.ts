import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { FaqEntryListResponse, FaqEntryResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { withTransaction } from '@/lib/db/transaction';
import { authorFaqEntry, buildTutorFaq } from '@/features/faq/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/tutor/assignments/{assignmentId}/faq` (`06` section 5.4, `07` section 5.5).
 *
 * **Every entry, whatever its publication status**, which is the one FAQ read that must not filter: the
 * tutor's screen is where an `AI_GENERATED` candidate gets reviewed and an `APPROVED` entry gets
 * published, and neither is visible to a student. It is the deliberate counterpart of the student route's
 * published-only read, and the two are separate functions rather than one with a flag.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<FaqEntryListResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const items = await withTransaction((tx) => buildTutorFaq(tx, assignmentId));
  return withRequestId(NextResponse.json({ items }, { status: 200 }), requestId);
}

/**
 * `POST /api/tutor/assignments/{assignmentId}/faq` (`06` section 5.4).
 *
 * A tutor writes an answer by hand. **It starts `NEEDS_REVIEW`, never `PUBLISHED`**, because C3 read
 * through D99 applies to a hand-written answer exactly as it does to an AI candidate: content becomes
 * student-facing only when a tutor approves **and** publishes it, and the two are separate actions.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<FaqEntryResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const now = new Date();
  const outcome = await withTransaction((tx) =>
    authorFaqEntry(tx, {
      assignmentId,
      milestoneId: parsed.milestoneId,
      question: parsed.question,
      answer: parsed.answer,
      now,
    }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId, outcome.details);

  await withTransaction((tx) =>
    insertAuditLog(tx, {
      id: randomUUID(),
      actorUserId: guarded.value.session.userId,
      actorRole: 'tutor',
      action: 'faq_entry.authored',
      targetTable: 'faq_entries',
      targetId: outcome.value.id,
      // The transition and the source, and **no answer text**: the answer is untrusted tutor prose and
      // `06` section 7.6.5's redaction rule keeps content out of the audit row.
      before: null,
      after: { sourceKind: 'tutor_authored', publicationStatus: outcome.value.publicationStatus },
      requestId,
    }),
  );

  return withRequestId(NextResponse.json(outcome.value, { status: 201 }), requestId);
}

type ParsedBody =
  | {
      readonly ok: true;
      readonly question: string;
      readonly answer: string;
      readonly milestoneId: string | null;
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
  const milestoneId = record['milestoneId'];
  if (milestoneId !== undefined && milestoneId !== null && typeof milestoneId !== 'string') {
    return {
      ok: false,
      message: 'milestoneId must be a string or null.',
      details: { fields: ['milestoneId'] },
    };
  }

  // Length and trim are the service's, so the two write paths (author and edit) apply one rule.
  return {
    ok: true,
    question,
    answer,
    milestoneId: typeof milestoneId === 'string' ? milestoneId : null,
  };
}
