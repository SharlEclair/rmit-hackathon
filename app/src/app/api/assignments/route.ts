import { createHash, randomUUID } from 'node:crypto';

import { NextResponse, after, type NextRequest } from 'next/server';

import { getConfig } from '@/lib/config';
import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import { listCoursesForUser } from '@/lib/db/queries/student-workspace';
import {
  insertAssignmentIfAbsent,
  insertSourceIfAbsent,
  type SourceKind,
  type SourceMimeType,
} from '@/lib/db/queries/assignments';
import { insertQueuedJob } from '@/lib/db/queries/ingestions';
import { withTransaction } from '@/lib/db/transaction';
import { getStorageDriver, sourceStorageKey } from '@/lib/storage';
import { getLlmClient } from '@/lib/llm';
import { runIngestion } from '@/features/ingest/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/markdown',
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

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  md: 'text/markdown',
};

const VALID_SOURCE_KINDS = new Set<SourceKind>([
  'brief',
  'rubric',
  'ai_policy',
  'marking_guide',
  'supplementary',
]);

/**
 * `POST /api/assignments`: Create a new assignment and trigger ingestion pipeline (S0-S8).
 * Accepts multipart/form-data:
 * - title: string
 * - courseId: string (optional, defaults to first enrolled tutor course)
 * - files: File[] (one or more documents)
 * - kinds: string[] or stringified JSON mapping/array of source kinds
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<{ assignmentId: string; jobId: string; status: string } | ApiErrorBody>> {
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId);
  }

  const title = (form.get('title') ?? '').toString().trim();
  if (!title) {
    return apiError('VALIDATION_FAILED', 'Assignment title is required.', requestId, { fields: ['title'] });
  }

  let courseId = (form.get('courseId') ?? '').toString().trim();
  if (!courseId) {
    // Resolve tutor's course
    const courses = await withTransaction((tx) => listCoursesForUser(tx, session.userId));
    const tutorCourse = courses.find((c) => c.roleInCourse === 'tutor');
    if (!tutorCourse) {
      return apiError('NOT_FOUND', 'No course found for this tutor.', requestId);
    }
    courseId = tutorCourse.id;
  } else {
    const role = await withTransaction((tx) => findEnrolmentRole(tx, session.userId, courseId));
    if (role !== 'tutor') {
      return apiError('NOT_FOUND', 'Tutor is not enrolled in this course.', requestId);
    }
  }

  // Collect files
  const files = form.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const singleFile = form.get('file');
  if (singleFile instanceof File && singleFile.size > 0 && !files.includes(singleFile)) {
    files.push(singleFile);
  }

  if (files.length === 0) {
    return apiError('VALIDATION_FAILED', 'At least one assignment file must be uploaded.', requestId, {
      fields: ['files'],
    });
  }

  // Parse kinds if provided
  const kindsInput = form.getAll('kinds').map(String);
  const kindsJson = form.get('kindsJson')?.toString();
  let kindsMap: Record<string, SourceKind> = {};
  if (kindsJson) {
    try {
      kindsMap = JSON.parse(kindsJson);
    } catch {
      // ignore JSON parse error
    }
  }

  const config = getConfig();
  const assignmentId = randomUUID();

  // 1. Create assignment row
  await withTransaction(async (tx) => {
    await insertAssignmentIfAbsent(tx, {
      id: assignmentId,
      courseId,
      title,
      status: 'draft',
      dueAt: null,
      createdByUserId: session.userId,
      publishedAt: null,
    });
  });

  const storage = getStorageDriver();

  // 2. Process and save each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    if (file.size > config.uploadMaxBytes) {
      return apiError('PAYLOAD_TOO_LARGE', `File ${file.name} exceeds max upload size.`, requestId);
    }

    let mimeType = (file.type.split(';')[0] ?? '').trim().toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if ((!mimeType || mimeType === 'application/octet-stream') && ext in MIME_BY_EXT) {
      mimeType = MIME_BY_EXT[ext] ?? mimeType;
    }

    if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
      return apiError('UNSUPPORTED_FORMAT', `File ${file.name} has unsupported format (${mimeType}).`, requestId, {
        allowedFormats: [...ACCEPTED_MIME_TYPES],
      });
    }

    const assignedKind = kindsMap[file.name] || (kindsInput[i] as SourceKind) || (i === 0 ? 'brief' : 'supplementary');
    const kind: SourceKind = VALID_SOURCE_KINDS.has(assignedKind) ? assignedKind : 'supplementary';

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentHash = createHash('sha256').update(bytes).digest('hex');

    const sourceId = randomUUID();
    const storageExt = EXTENSION_BY_MIME[mimeType] ?? 'bin';
    const key = sourceStorageKey(assignmentId, sourceId, storageExt);

    await storage.put({ key, bytes, contentType: mimeType });

    await withTransaction(async (tx) => {
      await insertSourceIfAbsent(tx, {
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
        extractionStatus: 'pending',
      });
    });
  }

  // 3. Queue ingestion job
  const jobId = randomUUID();
  await withTransaction(async (tx) => {
    await insertQueuedJob(tx, {
      id: jobId,
      assignmentId,
      requestedByUserId: session.userId,
    });
  });

  // 4. Run pipeline in background using Next.js after()
  after(async () => {
    try {
      await runIngestion({
        assignmentId,
        jobId,
        requestedByUserId: session.userId,
        client: getLlmClient(),
        storage,
        config,
        requestId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ingestion failed';
      console.error(`Ingestion job ${jobId} failed: ${message}`);
    }
  });

  return withRequestId(
    NextResponse.json(
      {
        assignmentId,
        jobId,
        status: 'queued',
      },
      { status: 202 },
    ),
    requestId,
  );
}
