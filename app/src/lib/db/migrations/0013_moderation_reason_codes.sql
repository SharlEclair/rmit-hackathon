-- 0013: widen `moderation_flags.reason_code` to the Discussion Moderator's vocabulary.
--
-- `06-DATA-MODEL.md` section 7.5.4 defined `reason_code` with
-- `CHECK (reason_code in ('HARASSMENT','INAPPROPRIATE_CONTENT','PERSONAL_INFORMATION',
-- 'PROHIBITED_ASSISTANCE','SOLUTION_SHARING','OTHER'))` -- six generic values -- while
-- `05-AI-GUARDRAILS.md` section 9.2 gives the Discussion Moderator fourteen codes and section 9.6
-- constrains `ModeratorOutput.reasonCode` to `^MOD_[A-Z_]+$`. The two vocabularies have no overlap, so
-- **no AI flag could be written at all**: the insert failed `ck_moderation_flags_reason_code`.
--
-- The six values are the **student's** flagging vocabulary (D30: "one flag per user per post, feeding
-- the moderator queue"), and `06` section 5.5.14 types the student-facing response with exactly those
-- six. The moderator's vocabulary is a separate, richer list because a tutor reviewing the queue needs
-- to tell targeted abuse from a threat from sexual content -- distinctions the student's five
-- categories deliberately do not draw.
--
-- **Both vocabularies are therefore admitted, and the source column says which applies.** Widening is
-- the honest fix: mapping the fourteen model codes down to five would discard the distinction
-- `05` section 9.4 uses to choose an automatic action, and the severity that drives hiding a post is
-- derived from the code. The CHECK cannot express "six when source is student, fourteen when source is
-- ai" without duplicating the list per branch, so it admits the union and each writer uses its own set.
--
-- Recorded as D109. The `06` table entry and the `05` section 9.2 note are corrected in the same change.

alter table moderation_flags
  drop constraint if exists ck_moderation_flags_reason_code;

alter table moderation_flags
  add constraint ck_moderation_flags_reason_code check (
    reason_code in (
      -- The student's flagging vocabulary (`06` section 5.5.14, D30).
      'HARASSMENT',
      'INAPPROPRIATE_CONTENT',
      'PERSONAL_INFORMATION',
      'PROHIBITED_ASSISTANCE',
      'SOLUTION_SHARING',
      'OTHER',
      -- The Discussion Moderator's vocabulary (`05` section 9.2, section 9.6's `^MOD_[A-Z_]+$`).
      'MOD_HARASSMENT',
      'MOD_HATE',
      'MOD_THREAT',
      'MOD_SELF_HARM',
      'MOD_SEXUAL',
      'MOD_EXAM_LEAK',
      'MOD_PII',
      'MOD_SOLUTION_SHARE',
      'MOD_MISCONDUCT_SOLICIT',
      'MOD_CONFIDENTIAL',
      'MOD_UNSUPPORTED_CLAIM',
      'MOD_INCIVILITY',
      'MOD_OFF_TOPIC',
      'MOD_SPAM'
    )
  );
