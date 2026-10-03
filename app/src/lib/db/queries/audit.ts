/**
 * The audit trail: `audit_logs` (`06` section 7.6.5; migration `0008`).
 *
 * Phase 2 writes exactly one kind of row: the summary of an ingestion run -- which stages ran, how
 * many artifacts were proposed, and the notes the tutor needs (truncated grounding, discarded
 * citations, rejected checklist items). Without it those facts exist only in a log line nobody
 * keeps.
 *
 * **The redaction rule is the writer's duty, not a constraint** (`06` section 7.6.5, reading A12):
 * a CHECK cannot inspect nested JSON, so a column would not stop a body from being written here.
 * `before`/`after` may therefore contain an artifact's own fields and a `publication_status`
 * transition, and must never contain `student_uploads.extracted_text`, `assistant_messages.body`,
 * `query_messages.body`, `discussion_posts.body`, a `storage_key`, a password hash or a secret.
 * Phase 2's payload contains counts and stage names only, and no document text at all.
 */

import type { Executor } from './courses';

export interface NewAuditLog {
  readonly id: string;
  /** null for a system transition, which is what a pipeline run is. */
  readonly actorUserId: string | null;
  readonly actorRole: 'tutor' | 'student' | null;
  /** Dotted verb, e.g. `ingestion.completed`. */
  readonly action: string;
  readonly targetTable: string;
  readonly targetId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly requestId: string | null;
}

export async function insertAuditLog(ex: Executor, entry: NewAuditLog): Promise<void> {
  await ex`
    insert into audit_logs (
      id, actor_user_id, actor_role, action, target_table, target_id, before, after, request_id
    )
    values (
      ${entry.id}::uuid,
      ${entry.actorUserId}::uuid,
      ${entry.actorRole},
      ${entry.action},
      ${entry.targetTable},
      ${entry.targetId}::uuid,
      ${entry.before === null ? null : JSON.stringify(entry.before)}::jsonb,
      ${entry.after === null ? null : JSON.stringify(entry.after)}::jsonb,
      ${entry.requestId}
    )
    on conflict do nothing
  `;
}
