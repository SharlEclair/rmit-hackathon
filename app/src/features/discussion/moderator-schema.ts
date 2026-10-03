/**
 * `ModeratorOutput`: the Discussion Moderator's structured-output schema
 * (`05-AI-GUARDRAILS.md` section 9.6, `06-DATA-MODEL.md` section 4.4).
 *
 * ## Why this lives here rather than in `src/lib/llm/schema.ts`
 *
 * Standing agreement 11 **freezes** `src/lib/llm/types.ts` and `src/lib/llm/schema.ts`: "must not edit
 * these files: an enum addition is a request through `05-ISSUES.md`". Agreement 12 says every
 * structured-output schema lives in `schema.ts`. Those two point opposite ways for a Phase 6 addition,
 * so the request was raised before any code was written -- **I-49** -- and this is the answer it
 * settled on:
 *
 *   - **The Phase 3 precedent governs.** `05` section 12.1 keeps every guardrail module under
 *     `src/lib/guardrail/`, and the guardrail declares its own `guardrail_decision` schema in
 *     `guardrail/types.ts` -- which agreement 11 explicitly permits ("Phase 3 declares its own
 *     `guardrail_decision` schema under `src/lib/guardrail/` and must **not** edit these files"). A
 *     capability whose modules live under a feature directory declares its schema there too.
 *   - **`05` section 9.5 makes the separation structural, not stylistic:** "Different input (public
 *     discussion), different failure cost ..., different authority (advisory to a tutor rather than
 *     binding on a student turn), different schema, and a different review queue. Keeping it separate
 *     from the Policy Guard is a **D12** requirement."
 *   - **The freeze's trigger is not met.** Agreement 11's stated reason is that an `AiCapability` enum
 *     addition invalidates the freeze -- and `discussion_moderator` **already exists** in that enum, with
 *     `llm/budget.ts` already mapping it to the `moderation_batch` scope kind. No enum changes, so this is
 *     a new file rather than an edit to a frozen one.
 *
 * ## The combinator rules are part of the schema, not a caller's duty
 *
 * `05` section 9.6's validation rules: "`overallSeverity` is the maximum flag severity, or 0 when there
 * are no flags; an unknown `reasonCode` is a validation failure". The first is a `.superRefine` rather
 * than a comment, because a model that returns flags disagreeing with its own summary has produced output
 * that fails validation -- and `AGENTS.md` section 6 rule 4 makes a schema failure **a refusal, not a
 * retry-until-it-passes**.
 */

import { z } from 'zod';

/**
 * The closed reason-code vocabulary of `05` section 9.2.
 *
 * `05` section 9.6 types `reasonCode` as `"^MOD_[A-Z_]+$"` -- a pattern, not an enum -- and then says "an
 * unknown `reasonCode` is a validation failure". A pattern alone cannot enforce that, so the enum is
 * spelled out from section 9.2's table and the pattern's intent is met by construction. The difference
 * matters: with the pattern alone, `MOD_FOOBAR` would validate and reach a tutor's queue as a reason code
 * nothing can render.
 */
export const MODERATOR_REASON_CODES = [
  // Severity 4 -- `05` section 9.2
  'MOD_HARASSMENT',
  'MOD_HATE',
  'MOD_THREAT',
  'MOD_SELF_HARM',
  'MOD_SEXUAL',
  'MOD_EXAM_LEAK',
  // Severity 3
  'MOD_PII',
  'MOD_SOLUTION_SHARE',
  'MOD_MISCONDUCT_SOLICIT',
  'MOD_CONFIDENTIAL',
  // Severity 2
  'MOD_UNSUPPORTED_CLAIM',
  'MOD_INCIVILITY',
  // Severity 1
  'MOD_OFF_TOPIC',
  'MOD_SPAM',
] as const;

export type ModeratorReasonCode = (typeof MODERATOR_REASON_CODES)[number];

/**
 * The severity each code carries, from `05` section 9.2's own column.
 *
 * **Recorded as a table rather than inferred**, because `05` section 9.4 maps severity to an automatic
 * action -- a severity-3 code hides a post pending review and a severity-4 one hides it immediately -- so
 * a wrong severity is a wrongly hidden post, which section 9.5 calls "a visible injustice in a small
 * cohort". The model's `severity` field is therefore **cross-checked against this table** rather than
 * trusted: see `moderatorOutputSchema`'s refinement.
 */
export const MODERATOR_CODE_SEVERITY: Readonly<Record<ModeratorReasonCode, 1 | 2 | 3 | 4>> = {
  MOD_HARASSMENT: 4,
  MOD_HATE: 4,
  MOD_THREAT: 4,
  MOD_SELF_HARM: 4,
  MOD_SEXUAL: 4,
  MOD_EXAM_LEAK: 4,
  MOD_PII: 3,
  MOD_SOLUTION_SHARE: 3,
  MOD_MISCONDUCT_SOLICIT: 3,
  MOD_CONFIDENTIAL: 3,
  MOD_UNSUPPORTED_CLAIM: 2,
  MOD_INCIVILITY: 2,
  MOD_OFF_TOPIC: 1,
  MOD_SPAM: 1,
};

/**
 * One flag, with `05` section 9.6's bounds.
 *
 * `spanStart`/`spanEnd` are `integer | null`. They are **not** validated for ordering here: a span that
 * ends before it starts is a malformed highlight rather than a policy failure, and `05` section 9.6 asks
 * only that each be a non-negative integer. The consumer ignores an inverted span rather than refusing
 * the whole moderation result, because refusing would lose the reason code with it.
 */
export const moderatorFlagSchema = z
  .object({
    reasonCode: z.enum(MODERATOR_REASON_CODES),
    severity: z.number().int().min(1).max(4),
    /**
     * Tutor-facing and **never shown to the post's author or to other students** (`05` section 9.6).
     *
     * `05` section 9.4 binding rule 4 also forbids the student's view disclosing "that a model flagged the
     * post", so this text reaches `moderation_flags.detail` -- a column the student response type has no
     * field for (`06` section 5.5.14) -- and stops there.
     */
    explanation: z.string().max(240),
    spanStart: z.number().int().min(0).nullable(),
    spanEnd: z.number().int().min(0).nullable(),
  })
  .strict();

export const moderatorOutputSchema = z
  .object({
    flags: z.array(moderatorFlagSchema).max(6),
    overallSeverity: z.number().int().min(0).max(4),
    /**
     * `05` section 9.6 lists this in `properties` but **not** in `required`, so it is optional and
     * defaults to `false`.
     *
     * Defaulting rather than requiring is the conservative reading of the two available ones: the field's
     * meaning is "this content contains personal data", and a model that omits it has not asserted that it
     * does. A default of `true` would mark every post whose response omitted the field, and refusing the
     * response outright would lose the flags that came with it.
     */
    containsPersonalData: z.boolean().default(false),
  })
  .strict()
  // `05` section 9.6: "`overallSeverity` is the maximum flag severity, or 0 when there are no flags".
  // A model whose summary disagrees with its own flags has produced output that fails validation, which
  // `AGENTS.md` section 6 rule 4 makes a **refusal** rather than a retry.
  .superRefine((value, ctx) => {
    const expected =
      value.flags.length === 0
        ? 0
        : Math.max(...value.flags.map((flag) => flag.severity));
    if (value.overallSeverity !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['overallSeverity'],
        message: `overallSeverity must be the maximum flag severity (${String(expected)}), not ${String(value.overallSeverity)}.`,
      });
    }
  })
  // A code's severity is a property of the code (`05` section 9.2), so a flag that claims a different one
  // is refused rather than silently corrected: correcting it would hide a model that is confused about
  // the policy, and the action severity drives hiding a post.
  .superRefine((value, ctx) => {
    value.flags.forEach((flag, index) => {
      const declared = MODERATOR_CODE_SEVERITY[flag.reasonCode];
      if (flag.severity !== declared) {
        ctx.addIssue({
          code: 'custom',
          path: ['flags', index, 'severity'],
          message: `${flag.reasonCode} carries severity ${String(declared)} in 05 section 9.2, not ${String(flag.severity)}.`,
        });
      }
    });
  });

export type ModeratorFlag = z.infer<typeof moderatorFlagSchema>;
export type ModeratorOutput = z.infer<typeof moderatorOutputSchema>;

/**
 * The severity that decides an automatic action, from validated moderator output.
 *
 * `05` section 9.4: 0 and 1 take no action, 2 marks the post for tutors, 3 hides it pending review, and 4
 * hides it immediately. Returning the validated `overallSeverity` keeps that mapping in one place.
 */
export function actionFor(moderator: ModeratorOutput): 'none' | 'mark' | 'hide_pending_review' | 'hide_immediate' {
  switch (moderator.overallSeverity) {
    case 0:
    case 1:
      return 'none';
    case 2:
      return 'mark';
    case 3:
      return 'hide_pending_review';
    default:
      return 'hide_immediate';
  }
}

/**
 * `05` section 9.4's binding rule 5, applied.
 *
 * "**If moderation output fails schema validation, the post is treated as severity 2 (flagged, visible)
 * and the tutor queue receives a system note.** Moderator failure must not hide student content, and must
 * not silently pass content either." Both halves are load-bearing: severity 2 is the *visible* middle, so
 * a moderator that cannot be parsed neither hides a post (which would be an unaccountable suppression) nor
 * lets it through unexamined (which would make the check decorative).
 *
 * Returning a synthetic `ModeratorOutput` rather than a flag lets the caller use one code path, and the
 * `MOD_UNSUPPORTED_CLAIM`-free construction is deliberate: the reason code for a parse failure is not a
 * judgement about the content, so it is emitted as `MOD_INCIVILITY`'s *slot* with an explanation that says
 * what actually happened. The tutor reads the note, not a fabricated policy claim.
 */
export function moderatorFailureFallback(detail: string): ModeratorOutput {
  // The prefix and suffix are part of the 240-character bound, so the explanation is built and then
  // sliced -- rather than slicing the detail to a guessed budget, which is what the first version did and
  // it overshot by 14 characters on a long input. `.slice` on the whole sentence is correct by
  // construction for any detail length, and the trailing text a slice might cut is ellipsis-free prose
  // rather than a claim, so a truncated tail loses nothing load-bearing.
  const sentence = `Moderation could not be parsed and was not applied (${detail}).`;
  const explanation = sentence.length <= 240 ? sentence : `${sentence.slice(0, 237)}...`;
  return {
    flags: [
      {
        reasonCode: 'MOD_INCIVILITY',
        severity: 2,
        explanation,
        spanStart: null,
        spanEnd: null,
      },
    ],
    overallSeverity: 2,
    containsPersonalData: false,
  };
}
