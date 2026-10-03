import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { ReviewArtifactResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import {
  findCurrentStructureId,
  findMilestoneStructureId,
  findReviewArtifact,
  insertTutorArtifact,
  type NewTutorArtifact,
} from '@/lib/db/queries/review';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { derivePlanningLevel, TUTOR_AUTHORABLE_KINDS } from '@/features/review/artifacts';
import { inferReviewArtifact } from '@/features/review/mappers';
import { checkPolicyRuleCode } from '@/features/review/policy-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/tutor/assignments/{assignmentId}/artifacts` (`06` section 5.4).
 *
 * A tutor authors a milestone, checklist item, FAQ entry or AI Usage Policy rule. Failure codes are
 * `VALIDATION_FAILED` and `INVALID_STATE_TRANSITION`; the second is for a `structureId` that is not
 * the assignment's current structure, which is a state problem rather than a malformed body -- writing
 * into a superseded structure would put content in a version no student will ever see (`06` section
 * 3.3).
 *
 * The new row starts at `NEEDS_REVIEW`, so it is subject to the same approval boundary as an
 * AI-generated one (C3, D21, `07` section 7.3's badge rules); the reading is recorded on
 * `insertTutorArtifact`.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<ReviewArtifactResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;
  const { session } = guarded.value;

  const parsed = await readCreateBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const result = await withTransaction(async (tx) => {
    const structureId = await findCurrentStructureId(tx, assignmentId);
    if (structureId === null || structureId !== parsed.body.structureId) {
      return { kind: 'notCurrent' as const };
    }

    // A checklist item's milestone must belong to the same structure. The schema cannot enforce it
    // (two independent FKs), and a cross-structure link would render an item under a milestone gate
    // rule G1 never returns.
    if (parsed.body.kind === 'checklist_item' && parsed.body.milestoneId !== null) {
      const milestoneStructure = await findMilestoneStructureId(tx, parsed.body.milestoneId);
      if (milestoneStructure !== structureId) {
        return {
          kind: 'invalid' as const,
          message: 'That milestone is not part of the assignment current structure.',
          details: { fields: ['milestoneId'] },
        };
      }
    }

    const built = buildArtifact(parsed.body, assignmentId, structureId);
    if ('invalid' in built) return { kind: 'invalid' as const, ...built.invalid };

    const id = randomUUID();
    await insertTutorArtifact(tx, { ...built.artifact, id });

    await insertAuditLog(tx, {
      id: randomUUID(),
      actorUserId: session.userId,
      actorRole: 'tutor',
      action: 'artifact.created',
      // The artifact's own table, so the audit trail names what was created rather than the parent.
      targetTable: TABLE_BY_KIND[built.artifact.kind],
      targetId: id,
      before: null,
      after: { kind: built.artifact.kind, publicationStatus: 'NEEDS_REVIEW', origin: 'tutor' },
      requestId,
    });

    const created = await findReviewArtifact(tx, id);
    return created === null ? { kind: 'missing' as const } : { kind: 'ok' as const, created };
  });

  switch (result.kind) {
    case 'notCurrent':
      return apiError(
        'INVALID_STATE_TRANSITION',
        'That structure is not the assignment current structure, so nothing written into it would be visible.',
        requestId,
      );
    case 'invalid':
      return apiError('VALIDATION_FAILED', result.message, requestId, result.details);
    case 'missing':
      return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
    case 'ok':
      return withRequestId(
        NextResponse.json(inferReviewArtifact(result.created), { status: 201 }),
        requestId,
      );
  }
}

const TABLE_BY_KIND: Readonly<Record<CreateBody['kind'], string>> = {
  milestone: 'milestones',
  checklist_item: 'checklist_items',
  faq_entry: 'faq_entries',
  ai_policy_rule: 'ai_policy_rules',
};

interface CreateBody {
  readonly kind: 'milestone' | 'checklist_item' | 'faq_entry' | 'ai_policy_rule';
  readonly structureId: string;
  readonly milestoneId: string | null;
  readonly payload: Record<string, unknown>;
}

type Built =
  | { readonly artifact: NewTutorArtifact }
  | { readonly invalid: { readonly message: string; readonly details?: Record<string, unknown> } };

/**
 * Validate and shape the request into a `NewTutorArtifact`.
 *
 * Every bound here is the column's own CHECK (`06` sections 7.2.9-7.2.11, 7.4.4). Checking it here
 * rather than letting Postgres refuse it is not redundant: a violated CHECK surfaces as a driver
 * error and a `500`, while a tutor needs to be told which field is wrong.
 */
function buildArtifact(body: CreateBody, assignmentId: string, structureId: string): Built {
  const invalid = (message: string, field: string): Built => ({
    invalid: { message, details: { fields: [field] } },
  });

  switch (body.kind) {
    case 'milestone': {
      const title = text(body.payload, 'title');
      if (title === null || title.length === 0 || title.length > 160) {
        return invalid('A milestone needs a title of 1 to 160 characters.', 'title');
      }
      return {
        artifact: {
          kind: 'milestone',
          id: '',
          assignmentId,
          structureId,
          title,
          summary: optionalText(body.payload, 'summary'),
          displayOrder: order(body.payload),
        },
      };
    }
    case 'checklist_item': {
      const title = text(body.payload, 'title');
      if (title === null || title.length < 3 || title.length > 160) {
        return invalid('A checklist item needs a title of 3 to 160 characters.', 'title');
      }
      if (body.milestoneId === null) {
        return invalid('A checklist item belongs to a milestone.', 'milestoneId');
      }
      const level = derivePlanningLevel(title);
      if (level === null) {
        // `06` section 7.2.10 rule 2: the item must open with one of the six planning verbs. Storing
        // it anyway would persist an item the validator then flags, which is a review loop the tutor
        // can avoid by fixing the wording now.
        return invalid(
          'A checklist item starts with one of: understand, identify, plan, verify, review, note.',
          'title',
        );
      }
      return {
        artifact: {
          kind: 'checklist_item',
          id: '',
          assignmentId,
          structureId,
          milestoneId: body.milestoneId,
          title,
          planningLevel: level,
          description: optionalText(body.payload, 'description'),
          displayOrder: order(body.payload),
        },
      };
    }
    case 'faq_entry': {
      const question = text(body.payload, 'question');
      const answer = text(body.payload, 'answer');
      if (question === null || question.length < 5 || question.length > 500) {
        return invalid('A FAQ question is 5 to 500 characters.', 'question');
      }
      if (answer === null || answer.length < 5 || answer.length > 4000) {
        return invalid('A FAQ answer is 5 to 4000 characters.', 'answer');
      }
      const milestoneId = optionalText(body.payload, 'milestoneId');
      return {
        artifact: {
          kind: 'faq_entry',
          id: '',
          assignmentId,
          milestoneId,
          question,
          answer,
          displayOrder: order(body.payload),
        },
      };
    }
    case 'ai_policy_rule': {
      const ruleCode = text(body.payload, 'ruleCode');
      const ruleText = text(body.payload, 'ruleText');
      const effect = text(body.payload, 'effect');
      const appliesTo = text(body.payload, 'appliesTo');
      if (ruleCode === null || ruleText === null || effect === null || appliesTo === null) {
        return invalid(
          'An AI Usage Policy rule needs ruleCode, ruleText, effect and appliesTo.',
          'ruleCode',
        );
      }
      if (ruleText.length < 10 || ruleText.length > 600) {
        return invalid('A policy rule is 10 to 600 characters of tutor-approved wording.', 'ruleText');
      }
      if (!['PROHIBIT', 'ALLOW', 'ESCALATE_TO_TUTOR', 'CLARIFY'].includes(effect)) {
        return invalid('effect must be PROHIBIT, ALLOW, ESCALATE_TO_TUTOR or CLARIFY.', 'effect');
      }
      if (!['assistant', 'uploads', 'discussion', 'all'].includes(appliesTo)) {
        return invalid('appliesTo must be assistant, uploads, discussion or all.', 'appliesTo');
      }
      const check = checkPolicyRuleCode(ruleCode, appliesTo, effect);
      if (!check.ok) {
        return invalid(check.message ?? 'That rule code cannot be used.', 'ruleCode');
      }
      return {
        artifact: {
          kind: 'ai_policy_rule',
          id: '',
          assignmentId,
          structureId,
          ruleCode,
          ruleText,
          effect: effect as 'PROHIBIT' | 'ALLOW' | 'ESCALATE_TO_TUTOR' | 'CLARIFY',
          appliesTo: appliesTo as 'assistant' | 'uploads' | 'discussion' | 'all',
          displayOrder: order(body.payload),
        },
      };
    }
  }
}

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value.trim() : null;
}

function optionalText(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : null;
}

/** `displayOrder` of `null` means "append" (the writer's subselect does the arithmetic). */
function order(payload: Record<string, unknown>): number | null {
  const value = payload['displayOrder'];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

async function readCreateBody(request: NextRequest): Promise<
  | { ok: true; body: CreateBody }
  | { ok: false; message: string; details?: Record<string, unknown> }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, message: 'The request body was not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: 'The request body must be a JSON object.' };
  }
  const body = raw as Record<string, unknown>;

  const kind = body['kind'];
  if (typeof kind !== 'string' || !TUTOR_AUTHORABLE_KINDS.some((allowed) => allowed === kind)) {
    return {
      ok: false,
      message: `kind must be one of: ${TUTOR_AUTHORABLE_KINDS.join(', ')}.`,
      details: { fields: ['kind'] },
    };
  }
  const structureId = body['structureId'];
  if (typeof structureId !== 'string' || structureId === '') {
    return { ok: false, message: 'structureId is required.', details: { fields: ['structureId'] } };
  }
  const milestoneId = body['milestoneId'];
  if (milestoneId !== undefined && milestoneId !== null && typeof milestoneId !== 'string') {
    return { ok: false, message: 'milestoneId must be a string.', details: { fields: ['milestoneId'] } };
  }
  const payload = body['payload'];
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return { ok: false, message: 'payload must be an object.', details: { fields: ['payload'] } };
  }

  return {
    ok: true,
    body: {
      kind: kind as CreateBody['kind'],
      structureId,
      milestoneId: typeof milestoneId === 'string' ? milestoneId : null,
      payload: (payload ?? {}) as Record<string, unknown>,
    },
  };
}
