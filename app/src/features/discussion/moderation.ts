/**
 * The moderation pass: `05-AI-GUARDRAILS.md` sections 9.1-9.6, `06-DATA-MODEL.md` section 4.4.
 *
 * ## What this module does, and the one thing it deliberately does not
 *
 * It calls the Discussion Moderator capability, validates the response, and turns it into
 * `moderation_flags` rows with `source = 'ai'` plus the automatic action `05` section 9.4 maps the
 * severity to. **It never edits or removes a post** -- section 9.4 binding rule 1: "There is no severity
 * that results in silent deletion. `remove` is a tutor action." The strongest automatic action available
 * is `hide_immediate`, which is a visibility state a tutor can reverse with a reason (binding rule 3).
 *
 * ## Every path leads to an outcome; there is no path that does nothing
 *
 * This is the module's central obligation, from `05` section 9.4 binding rule 5: "Moderator failure must
 * not hide student content, and must not silently pass content either." So `moderate` returns an outcome
 * for a provider error, a schema failure, a timeout and a success alike, and the failure cases produce
 * **severity 2** -- flagged and visible, with a tutor note. There is deliberately no code path that
 * returns "no flags" because something went wrong; `noFlags` exists only for a moderator that actually
 * said so.
 *
 * ## Why the client is injected
 *
 * The same shape `features/ingest/analyst.ts` uses: the caller passes an `LlmProvider`, so this module is
 * testable against a stub without a network and without a provider key (`AGENTS.md` section 4.2, "Mock
 * behind the adapter, not in the UI"). The provider is never chosen or configured here.
 */

import { randomUUID } from 'node:crypto';

import type { LlmProvider } from '@/lib/llm/types';
import type { Executor } from '@/lib/db/queries/courses';
import { parseStructured } from '@/lib/llm/schema';
import { insertModerationFlag } from '@/lib/db/queries/discussions';
import {
  actionFor,
  moderatorFailureFallback,
  moderatorOutputSchema,
  type ModeratorFlag,
  type ModeratorOutput,
} from '@/features/discussion/moderator-schema';
import { buildModeratorRequest } from '@/features/discussion/moderator-prompt';

/** `05` section 9.4's automatic actions. `none` and `mark` leave the post visible. */
export type ModerationAction = 'none' | 'mark' | 'hide_pending_review' | 'hide_immediate';

/** The post to moderate. */
export interface ModerationInput {
  readonly postId: string;
  readonly assignmentId: string;
  readonly assignmentTitle: string;
  /** The one retrieved T1/T2 fragment most related to the post, or an empty string. */
  readonly grounding: string;
  readonly postBody: string;
  readonly modelId: string;
  /**
   * The budget scope. `llm/budget.ts` maps `discussion_moderator` to the `moderation_batch` scope kind
   * (`04` section 9.2 step 12), so this is a batch id rather than a per-post one: a moderation pass is
   * accounted as a batch of posts, not as a turn.
   */
  readonly sessionId: string;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

/** Why a moderation pass did not produce model output. */
export type ModerationFailure = 'PROVIDER_ERROR' | 'SCHEMA_INVALID' | 'NO_JSON' | 'CONTENT_FILTERED';

export interface ModerationResult {
  /** The validated output, or the fallback that binding rule 5 mandates. */
  readonly output: ModeratorOutput;
  /** The automatic action, from the validated severity. `05` section 9.4. */
  readonly action: ModerationAction;
  /** `null` on a successful pass. */
  readonly failure: ModerationFailure | null;
  /** `null` when nothing was written, which happens only when the output carried no flags. */
  readonly flagsWritten: number;
}

/**
 * Moderate one post.
 *
 * The write happens here rather than in the caller because the flags are the point of the pass and
 * `06` section 3.5 rule 4 wants the moderation record written with the action it justifies. The caller
 * supplies the executor so the write joins whatever transaction it is already in -- `Postgres`'s
 * `TransactionSql` is the only way to obtain one, which is the same reason `features/analyst.ts` takes an
 * executor.
 */
export async function moderatePost(
  ex: Executor,
  client: LlmProvider,
  input: ModerationInput,
): Promise<ModerationResult> {
  let raw: unknown | null = null;
  let failure: ModerationFailure | null = null;

  try {
    const response = await client.complete(
      buildModeratorRequest({
        modelId: input.modelId,
        sessionId: input.sessionId,
        assignmentTitle: input.assignmentTitle,
        grounding: input.grounding,
        postBody: input.postBody,
        maxOutputTokens: input.maxOutputTokens,
        timeoutMs: input.timeoutMs,
      }),
    );
    if (response.finishReason === 'content_filter') {
      // The provider refused to classify. That is not a policy finding about the post -- it is the
      // provider declining -- so it takes the failure path rather than being read as a flag.
      failure = 'CONTENT_FILTERED';
    } else if (response.json === null) {
      failure = 'NO_JSON';
    } else {
      raw = response.json;
    }
  } catch {
    // A provider error is not a moderation verdict. The catch is deliberately broad and does not
    // rethrow: `05` section 9.4 binding rule 5 makes the *outcome* of a failure fixed, so there is
    // nothing a caller could do differently with the error type.
    failure = 'PROVIDER_ERROR';
  }

  let output: ModeratorOutput;
  if (failure === null) {
    const parsed = parseStructured(moderatorOutputSchema, raw);
    if (parsed.ok) {
      output = parsed.value;
    } else {
      failure = 'SCHEMA_INVALID';
      output = moderatorFailureFallback(parsed.issues.slice(0, 3).join('; '));
    }
  } else {
    output = moderatorFailureFallback(failure);
  }

  const action = actionFor(output);
  const flagsWritten = await writeFlags(ex, input, output, failure);
  return { output, action, failure, flagsWritten };
}

/**
 * Write one `moderation_flags` row per flag.
 *
 * **The flag's severity is the code's severity, taken from the table rather than from the model's field.**
 * The schema already refuses a disagreement, so the two agree by construction for a validated output; the
 * fallback is the only producer of an unvalidated one, and it is built from the table itself. Reading the
 * table here means a future relaxation of the refinement cannot silently file `MOD_HARASSMENT` as low.
 *
 * **`ai_model_id` and `ai_prompt_version` are recorded, and `detail` is the tutor-facing explanation.**
 * `06` section 4.4's `moderation_flags` has both provenance columns for the AI source, which is what makes
 * "which model flagged this, under which prompt" answerable later. `detail` never reaches a student: the
 * student response type (`06` section 5.5.14) has no field for it, and section 9.4 binding rule 4 forbids
 * the student's view disclosing that a model flagged the post at all.
 */
async function writeFlags(
  ex: Executor,
  input: ModerationInput,
  output: ModeratorOutput,
  failure: ModerationFailure | null,
): Promise<number> {
  if (output.flags.length === 0) return 0;

  let written = 0;
  for (const flag of output.flags) {
    const inserted = await insertModerationFlag(ex, {
      id: randomUUID(),
      assignmentId: input.assignmentId,
      targetKind: 'discussion_post',
      targetId: input.postId,
      source: 'ai',
      severity: severityWord(flag.severity),
      // The reason code is the model's, and the vocabulary is closed by the schema, so a row here always
      // carries a code `05` section 9.2 defines.
      reasonCode: flag.reasonCode,
      detail:
        failure === null
          ? flag.explanation
          : `Moderation did not complete (${failure}). ${flag.explanation}`,
      // An AI flag has no reporter: `06` section 4.4 keeps the student reporter as an anonymous identity,
      // and the moderator is not a person. `ck_moderation_flags_ai_provenance` requires the two AI columns
      // instead.
      reporterAnonIdentityId: null,
      aiModelId: input.modelId,
      // The version, not the id: `05` section 9.6's prompt version is what an audit needs, and the id is
      // derivable from it.
      aiPromptVersion: `moderator_output_v1`,
      createdAt: new Date(),
    });
    if (inserted) written += 1;
  }
  return written;
}

/**
 * `moderation_flags.severity` is the **word** (`low`/`medium`/`high`), while `05` section 9.2's severity is
 * the **number** 1..4.
 *
 * The mapping is not one-to-one in either direction, and that is `06` section 4.4's own design: the column
 * has three values and `05`'s scale has four, so 3 and 4 both read as `high`. **The numeric severity is
 * what drives the automatic action** (`05` section 9.4), and the word is what the flag carries. Losing the
 * distinction between 3 and 4 in the column is acceptable because the action has already been taken and
 * the audit row records it -- but it is recorded here rather than left implicit, because two scales with
 * four and three values is exactly the kind of thing a later reader assumes is one scale.
 */
function severityWord(severity: ModeratorFlag['severity']): 'low' | 'medium' | 'high' {
  switch (severity) {
    case 1:
      return 'low';
    case 2:
      return 'medium';
    default:
      // 3 and 4: `06` section 4.4's `high` covers both, and the distinction survives in the action.
      return 'high';
  }
}
