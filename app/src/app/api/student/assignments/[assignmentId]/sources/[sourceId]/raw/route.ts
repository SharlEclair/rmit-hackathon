import { NextResponse, type NextRequest } from 'next/server';

import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import { guardStudentVisibleAssignment, guardTutorAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { getStorageDriver } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string; sourceId: string }> },
): Promise<NextResponse<ArrayBuffer | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId, sourceId } = await context.params;

  // Authorise student first, then tutor
  const studentGuard = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!studentGuard.ok) {
    const tutorGuard = await guardTutorAssignment(request, requestId, assignmentId);
    if (!tutorGuard.ok) {
      return studentGuard.response;
    }
  }

  const source = await withTransaction(async (tx) => {
    const rows = await tx<{ id: string; mime_type: string; storage_key: string; original_filename: string }[]>`
      select id, mime_type, storage_key, original_filename
        from assignment_sources
       where id = ${sourceId}::uuid and assignment_id = ${assignmentId}::uuid and deleted_at is null
       limit 1
    `;
    return rows[0] ?? null;
  });

  if (!source) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  try {
    const storage = getStorageDriver();
    const payload = await storage.get(source.storage_key);

    return withRequestId(
      new NextResponse(Buffer.from(payload.bytes), {
        status: 200,
        headers: {
          'Content-Type': source.mime_type,
          'Content-Disposition': `inline; filename="${encodeURIComponent(source.original_filename)}"`,
          'Cache-Control': 'private, max-age=3600',
        },
      }),
      requestId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve document bytes';
    return apiError('INTERNAL', message, requestId);
  }
}
