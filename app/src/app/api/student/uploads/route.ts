import { NextResponse, type NextRequest } from 'next/server';

import { getConfig } from '@/lib/config';
import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { StudentUploadResponse } from '@/lib/api/types';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { findAssignmentScope } from '@/lib/db/queries/assignments';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import { withTransaction } from '@/lib/db/transaction';
import { getStorageDriver } from '@/lib/storage';
import { getLlmClient } from '@/lib/llm';
import { attachStudentUpload } from '@/features/uploads/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/student/uploads` (`06` section 5.4, `06` section 5.5.10): multipart; images, PDF or
 * plain text only (O11). Failure codes `UNSUPPORTED_FORMAT`, `PAYLOAD_TOO_LARGE`, `NOT_FOUND`.
 *
 * **The picker's refusals and this route's refusals are the same refusals.** O11 puts audio and video
 * out of the MVP at the picker with rule `UP5`, so a client that offers them is the defect, and the
 * route backs the refusal up rather than trusting the client: an audio or video part is refused with
 * `UP5` before storage and before any extraction, so it never becomes a row or an adapter call.
 *
 * The response is `StudentUploadResponse` and therefore carries no `storageKey`, no filename and no
 * extracted text.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<StudentUploadResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);

  let session;
  try {
    session = await requireRole('student', request);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, requestId);
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId, {
      fields: ['file', 'assignmentId'],
    });
  }

  const file = form.get('file');
  const assignmentId = form.get('assignmentId');
  if (!(file instanceof File) || typeof assignmentId !== 'string' || assignmentId === '') {
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId, {
      fields: ['file', 'assignmentId'],
    });
  }

  // The student must be enrolled on the course that owns the assignment; anything else is
  // `NOT_FOUND`, so the API never confirms that another course's assignment exists.
  const scope = await withTransaction((tx) => findAssignmentScope(tx, assignmentId));
  if (scope === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }
  const role = await withTransaction((tx) => findEnrolmentRole(tx, session.userId, scope.courseId));
  if (role !== 'student') {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const config = getConfig();
  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await attachStudentUpload({
    studentId: session.userId,
    assignmentId,
    filename: file.name,
    mimeType: file.type,
    bytes,
    config,
    storage: getStorageDriver(),
    client: getLlmClient(),
    // No `scan` is passed. Phase 3 owns the guardrail, so the scan status stays `pending` and the
    // upload cannot be attached to an assistant turn (`06` section 5.5.9 stream rule 5). Passing a
    // permissive scanner here would be the C6 failure this path exists to prevent.
  });

  if (!result.ok) {
    return apiError(result.refusal.code, result.refusal.message, requestId, result.refusal.details);
  }
  return withRequestId(NextResponse.json(toResponse(result.upload), { status: 201 }), requestId);
}

function toResponse(upload: {
  id: string;
  kind: StudentUploadResponse['kind'];
  mimeType: string;
  byteSize: number;
  extractionStatus: StudentUploadResponse['extractionStatus'];
  guardrailScanStatus: StudentUploadResponse['guardrailScanStatus'];
  guardrailReasonCode: string | null;
  createdAt: string;
}): StudentUploadResponse {
  // Field by field, never a spread of the row: a spread is how `storageKey` or `extractedText`
  // reaches a response the day somebody adds a column (`06` section 5.5.10).
  return {
    id: upload.id,
    kind: upload.kind,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
    extractionStatus: upload.extractionStatus,
    guardrailScanStatus: upload.guardrailScanStatus,
    guardrailReasonCode: upload.guardrailReasonCode,
    createdAt: upload.createdAt,
  };
}
