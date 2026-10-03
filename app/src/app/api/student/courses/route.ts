import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { CourseListResponse } from '@/lib/api/types';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { listCoursesForUser } from '@/lib/db/queries/student-workspace';
import { withTransaction } from '@/lib/db/transaction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/courses` (`06` section 5.4, 5.5.2).
 *
 * The dashboard's data: every course this student is enrolled in, with the number of assignments
 * they can actually see.
 *
 * **`FORBIDDEN_ROLE`, not `NOT_FOUND`, when the caller is not a student.** `06` section 5.4 gives
 * this route `FORBIDDEN_ROLE` and no `NOT_FOUND`, because there is no addressed resource to hide:
 * section 5.2 rule 3 makes 403 the answer when "the caller is authenticated, the resource is theirs
 * to know about, and the role is wrong". A tutor asking for a student's course list is that case.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<CourseListResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);

  try {
    const session = await requireRole('student', request);
    const courses = await withTransaction((tx) => listCoursesForUser(tx, session.userId));
    return withRequestId(
      NextResponse.json(
        {
          items: courses.map((course) => ({
            id: course.id,
            code: course.code,
            title: course.title,
            term: course.term,
            roleInCourse: course.roleInCourse === 'tutor' ? 'tutor' : 'student',
            assignmentCount: course.assignmentCount,
          })),
        },
        { status: 200 },
      ),
      requestId,
    );
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, requestId);
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }
}
