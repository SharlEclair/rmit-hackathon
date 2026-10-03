import { createHash, randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { getConfig } from '@/lib/config';
import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { AssignmentSourceResponse } from '@/lib/api/types';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import {
  findAssignmentScope,
  findSourceByContentHash,
  insertSourceIfAbsent,
  type SourceKind,
  type SourceMimeType,
} from '@/lib/db/queries/assignments';
import { withTransaction } from '@/lib/db/transaction';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { getStorageDriver, sourceStorageKey } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/tutor/assignments/{assignmentId}/sources` (`06` section 5.4): upload one source
 * document, multipart. Failure codes `UNSUPPORTED_FORMAT`, `PAYLOAD_TOO_LARGE`, `VALIDATION_FAILED`.
 *
 * The checks run in a fixed order, and each one is a different answer to the tutor:
 *
 *   1. role (`FORBIDDEN_ROLE`), then assignment scope + enrolment (`NOT_FOUND` -- `06` section 5.2
 *      rule 2 makes an unenrolled assignment indistinguishable from an absent one),
 *   2. the multipart body parses and names a file (`VALIDATION_FAILED`),
 *   3. size (`PAYLOAD_TOO_LARGE` -- never truncated), then MIME type (`UNSUPPORTED_FORMAT`),
 *   4. content hash, then storage, then the row.
 *
 * Only the O5/D57/D80 set is accepted: PDF, DOCX, PPTX, PNG/JPEG, plain text and Markdown, matching
 * the CHECK constraint on `assignment_sources.mime_type`. An unsupported type is refused here rather
 * than at extraction, so the tutor learns before anything is stored.
 */
const ACCEPTED_TUTOR_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/markdown',
]);

const SOURCE_KINDS = new Set<SourceKind>([
  'brief',
  'rubric',
  'ai_policy',
  'marking_guide',
  'supplementary',
]);

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<AssignmentSourceResponse | ApiErrorBody>> {
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
  const config = getConfig();

  const scope = await withTransaction((tx) => findAssignmentScope(tx, assignmentId));
  if (scope === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }
  const role = await withTransaction((tx) => findEnrolmentRole(tx, session.userId, scope.courseId));
  if (role !== 'tutor') {
    // Not enrolled on this assignment's course: `NOT_FOUND`, not `FORBIDDEN_ROLE`.
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId, {
      fields: ['file'],
    });
  }
  const file = form.get('file');
  const kindValue = form.get('kind');
  if (!(file instanceof File)) {
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId, {
      fields: ['file'],
    });
  }
  if (typeof kindValue !== 'string' || !SOURCE_KINDS.has(kindValue as SourceKind)) {
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId, {
      fields: ['kind'],
      allowed: [...SOURCE_KINDS],
    });
  }
  const kind = kindValue as SourceKind;

  if (file.size > config.uploadMaxBytes) {
    return apiError('PAYLOAD_TOO_LARGE', PLATFORM_ERROR_MESSAGES.payloadTooLarge, requestId, {
      maxBytes: config.uploadMaxBytes,
    });
  }

  const mimeType = (file.type.split(';')[0] ?? '').trim().toLowerCase();
  if (!ACCEPTED_TUTOR_MIME.has(mimeType)) {
    return apiError('UNSUPPORTED_FORMAT', PLATFORM_ERROR_MESSAGES.unsupportedFormat, requestId, {
      allowedFormats: [...ACCEPTED_TUTOR_MIME],
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentHash = createHash('sha256').update(bytes).digest('hex');

  // Identical hash + same assignment = reuse, never a duplicate row (`06` section 6.9 rule 4).
  const existing = await withTransaction((tx) =>
    findSourceByContentHash(tx, assignmentId, contentHash),
  );
  if (existing !== null) {
    return apiError('VALIDATION_FAILED', 'That document is already attached to this assignment.', requestId, {
      sourceId: existing.id,
    });
  }

  const sourceId = randomUUID();
  // Generated server-side from ids, never from the uploaded filename (`11` WP-04 acceptance).
  const key = sourceStorageKey(assignmentId, sourceId, EXTENSION_BY_MIME[mimeType] ?? 'bin');
  // Imported lazily here rather than at module scope so the route's import graph stays readable;
  // the driver is memoised, so this is one construction per process.
  await getStorageDriver().put({ key, bytes, contentType: mimeType });

  await withTransaction((tx) =>
    insertSourceIfAbsent(tx, {
      id: sourceId,
      assignmentId,
      uploadedByUserId: session.userId,
      kind,
      originalFilename: file.name.slice(0, 255),
      storageKey: key,
      mimeType: mimeType as SourceMimeType,
      byteSize: bytes.byteLength,
      pageCount: null,
      contentHash,
      // The bytes are stored; the text is not extracted yet. Claiming `extracted` here would be a
      // false row state, and the pipeline decides what is owed from the chunk count, not this column.
      extractionStatus: 'pending',
    }),
  );

  const body: AssignmentSourceResponse = {
    id: sourceId,
    kind,
    originalFilename: file.name.slice(0, 255),
    mimeType,
    byteSize: bytes.byteLength,
    pageCount: null,
    extractionStatus: 'pending',
    extractionError: null,
    createdAt: new Date().toISOString(),
  };
  return withRequestId(NextResponse.json(body, { status: 201 }), requestId);
}
