import { NextResponse, type NextRequest } from 'next/server';

import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { IngestionStatusResponse } from '@/lib/api/types';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { findAssignmentScope } from '@/lib/db/queries/assignments';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import { findLatestJob, toIngestionStatusResponse } from '@/lib/db/queries/ingestions';
import { withTransaction } from '@/lib/db/transaction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface AssignmentDetailResponse {
  id: string;
  courseId: string;
  title: string;
  status: string;
  job: IngestionStatusResponse | null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<AssignmentDetailResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);

  let session;
  try {
    session = await requireRole('tutor', request);
  } catch (error) {
    if (error instanceof AuthError) {
      return apiError(error.code, error.message, requestId);
    }
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }

  const { assignmentId } = await context.params;

  const scope = await withTransaction((tx) => findAssignmentScope(tx, assignmentId));
  if (scope === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const role = await withTransaction((tx) => findEnrolmentRole(tx, session.userId, scope.courseId));
  if (role !== 'tutor') {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const job = await withTransaction((tx) => findLatestJob(tx, assignmentId));

  return withRequestId(
    NextResponse.json({
      id: assignmentId,
      courseId: scope.courseId,
      title: scope.title,
      status: scope.status,
      job: job === null ? null : toIngestionStatusResponse(job),
    }),
    requestId,
  );
}
