import { NextResponse, type NextRequest } from 'next/server';

import { resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { BriefResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildBriefResponse } from '@/features/workspace/bundle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/assignments/{assignmentId}/brief` (`06` section 5.4, 5.5.4).
 *
 * **The anchor of the product's honesty claim** (C2, D17, I3). `07` section 4.2 rule 1: the viewer
 * renders the document page by page and "text is never re-generated, re-flowed into new prose, or
 * summarised". `buildBriefResponse` therefore returns the extractor's own headings and page ranges,
 * and the viewer renders `source_chunks.text` under them -- the same text the extractor produced from
 * the uploaded file, not a second rendering of it.
 *
 * **I-06 is why this is a manifest and not a byte stream.** No route in the 64-route vocabulary serves
 * source bytes, and `LocalStorageDriver.signedUrl` throws `SIGNED_URL_UNSUPPORTED` rather than
 * inventing a path (T12). `06` section 5.5.3 would put a `viewerUrl` on the workspace's source list;
 * shipping a URL to a route that does not exist is the "present but broken" affordance `11` WP-07
 * explicitly prefers to an absent one, so it is absent. See the Phase 5 decision row for the reading.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<BriefResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const brief = await withTransaction((tx) => buildBriefResponse(tx, guarded.value.scope));
  return withRequestId(NextResponse.json(brief, { status: 200 }), requestId);
}
