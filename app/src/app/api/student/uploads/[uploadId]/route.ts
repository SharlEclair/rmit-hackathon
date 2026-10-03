import { NextResponse, type NextRequest } from 'next/server';

import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { StudentUploadResponse } from '@/lib/api/types';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { findStudentUpload } from '@/lib/db/queries/uploads';
import { withTransaction } from '@/lib/db/transaction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/uploads/{uploadId}` (`06` section 5.4): extraction and scan status for an
 * **own** upload.
 *
 * The read is scoped by `student_id` in the query, never by a client-supplied id (`06` section 5.2
 * rule 4). A row belonging to another student is therefore indistinguishable from a row that does
 * not exist, and both answer `NOT_FOUND`.
 *
 * This is the route Phase 3's guardrail scan and Phase 5's assistant turn poll while an upload is
 * still `pending`. The response never carries the extracted text (`06` section 5.5.10).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ uploadId: string }> },
): Promise<NextResponse<StudentUploadResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);

  let session;
  try {
    session = await requireRole('student', request);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, requestId);
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }

  const { uploadId } = await context.params;
  const upload = await withTransaction((tx) => findStudentUpload(tx, uploadId, session.userId));
  if (upload === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const body: StudentUploadResponse = {
    id: upload.id,
    kind: upload.kind,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
    extractionStatus: upload.extractionStatus,
    guardrailScanStatus: upload.guardrailScanStatus,
    guardrailReasonCode: upload.guardrailReasonCode,
    createdAt: upload.createdAt,
  };
  return withRequestId(NextResponse.json(body, { status: 200 }), requestId);
}
