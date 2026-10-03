/**
 * The Discussion Moderator's prompt: `05-AI-GUARDRAILS.md` sections 9.1-9.6.
 *
 * **What the moderator is, and what it is not.** `05` section 9.5: "Different input (public discussion),
 * different failure cost (a wrongly hidden post is a visible injustice in a small cohort), different
 * authority (advisory to a tutor rather than binding on a student turn)." So the model's output is
 * **advisory**: it proposes flags and a severity, and section 9.4's mapping decides what the platform does.
 * Nothing in this prompt asks the model to remove or edit anything, because binding rule 1 reserves
 * removal to a tutor.
 *
 * **The prompt never asks the model to judge the student.** It asks whether *the post* matches a policy
 * category, which is the only question the reason-code vocabulary can answer. A prompt that asked "is this
 * student behaving badly" would produce output the schema cannot express and a tutor cannot act on.
 *
 * **`explanation` is tutor-facing and the prompt says so.** `05` section 9.6: "`explanation` is
 * tutor-facing and is never shown to the post author or to other students", and section 9.4 binding rule 4
 * forbids the student's view disclosing "that a model flagged the post". The prompt therefore asks for a
 * neutral description of the content, not a verdict on the person, because the text is written to be read
 * by a tutor who must decide.
 *
 * **The version is in the id.** `systemPrefixId` is `<capability>-v<n>` (`04` section 5.5 rule 3) and the
 * version is part of the cache key and the audit log, so a change to this text is a new version rather
 * than an edit.
 */

import { z } from 'zod';

import {
  assembleMessages,
  systemPrefixId,
  type PromptAssembly,
} from '@/lib/llm/prompt';
import type { JsonSchema, LlmMessage, LlmRequest } from '@/lib/llm/types';
import { moderatorOutputSchema } from '@/features/discussion/moderator-schema';

/** The prompt version. Bumping it is what records that the prompt changed (`04` section 5.5 rule 3). */
export const MODERATOR_PROMPT_VERSION = 1;

/** The schema's stable provider-side name. Part of the cache key, so it moves only with the version. */
export const MODERATOR_SCHEMA_NAME = `moderator_output_v${String(MODERATOR_PROMPT_VERSION)}`;

/**
 * `ModeratorOutput` as JSON Schema, generated from the zod schema.
 *
 * `$schema` is deleted because the provider rejects a top-level meta-schema key it does not recognise
 * (trap **T30**), and the draft is pinned to `draft-2020-12` to match the doc's own `$schema` in
 * `05` section 9.6. Computed once per process: it is a pure function of a constant schema.
 */
let cachedJsonSchema: JsonSchema | null = null;
export function moderatorJsonSchema(): JsonSchema {
  if (cachedJsonSchema !== null) return cachedJsonSchema;
  const generated = z.toJSONSchema(moderatorOutputSchema, {
    target: 'draft-2020-12',
    // The refinements are application-side; without this zod refuses to convert a schema that has any.
    io: 'output',
  }) as Record<string, unknown>;
  delete generated['$schema'];
  cachedJsonSchema = generated as JsonSchema;
  return cachedJsonSchema;
}

/**
 * The output ceiling.
 *
 * `ModeratorOutput` is at most six flags of 240 characters plus three scalars, so a few thousand tokens
 * covers it with room for the provider's structured-output wrapper. The value is deliberately far below
 * the Analyst's: thinking is `low` for this capability (`05` section 9.1 keeps moderation cheap and
 * frequent), so the ceiling does not have to absorb a reasoning budget -- and **trap T32** is the reason
 * to say so explicitly, because a ceiling that a thinking budget consumes reports itself as a schema
 * defect.
 */
export const MODERATOR_DEFAULT_MAX_OUTPUT_TOKENS = 2_048;

/** 120s, matching the Analyst's timeout: a moderation pass runs on a request path, not a batch job. */
export const MODERATOR_DEFAULT_TIMEOUT_MS = 120_000;

const STATIC_PLATFORM = [
  'You classify a single post from a university assignment discussion board against a fixed policy',
  'category list. You are an advisory classifier: a tutor makes the decision, never you.',
  '',
  'Rules:',
  '1. Return only the JSON object the schema describes. No prose outside it.',
  '2. Use only reason codes from the list you are given. Never invent a code.',
  '3. Each code has a fixed severity. Report the severity that belongs to the code.',
  '4. `overallSeverity` is the highest severity among your flags, or 0 when you flag nothing.',
  '5. `explanation` is read by a tutor. Describe what in the post matched the category, neutrally, in',
  '   under 240 characters. Do not address the author. Do not recommend an action.',
  '6. Flag nothing when the post is an ordinary on-topic question or answer. An unremarkable post is',
  '   the common case and must produce an empty flag list.',
  '7. Set `containsPersonalData` true when the post states personal information about any person,',
  '   including the author.',
].join('\n');

/**
 * The category list, rendered from the closed vocabulary.
 *
 * It is passed as policy rather than as a static platform block because the codes are the assignment's
 * moderation vocabulary and a capability prompt should not duplicate a list that a schema already owns --
 * if the table in `moderator-schema.ts` changes, this text follows it without a second edit.
 */
const STATIC_POLICY = [
  'Flag a post only when it matches one of these categories.',
  '',
  'Severity 4 -- potential harm or serious misconduct:',
  '  MOD_HARASSMENT Targeted abuse or intimidation of a person',
  '  MOD_HATE Attack on a protected characteristic',
  '  MOD_THREAT Threat of harm',
  '  MOD_SELF_HARM Content indicating risk of self-harm',
  '  MOD_SEXUAL Sexual content',
  '  MOD_EXAM_LEAK Live exam or test content disclosed',
  '',
  'Severity 3 -- likely a policy breach:',
  '  MOD_PII Personal information about self or another',
  '  MOD_SOLUTION_SHARE Posting a solution, answer, or code where the assignment prohibits it',
  '  MOD_MISCONDUCT_SOLICIT Asking others to do the assessed work',
  '  MOD_CONFIDENTIAL Confidential material: staff-only notes, another unit content',
  '',
  'Severity 2 -- worth a tutor eyes:',
  '  MOD_UNSUPPORTED_CLAIM States something about the assignment that contradicts the brief',
  '  MOD_INCIVILITY Rude but not abusive',
  '',
  'Severity 1 -- low signal, no harm:',
  '  MOD_OFF_TOPIC Unrelated to the assignment',
  '  MOD_SPAM Repetition, promotion, flooding',
  '',
  'A post that merely misstates the brief is MOD_UNSUPPORTED_CLAIM, which never hides the post by',
  'itself: the correct response to a student misstating the brief is a tutor reply, not suppression.',
].join('\n');

export interface ModeratorPromptInput {
  /** The assignment's title, so an off-topic judgement has something to compare against. */
  readonly assignmentTitle: string;
  /** The one assignment requirement most related to the post, when retrieval found one. */
  readonly grounding: string;
  /** The post as its author wrote it. Never truncated by the caller: see the note in `buildModeratorRequest`. */
  readonly postBody: string;
}

/** The assembly, exposed so a test can assert the four blocks without a provider. */
export function buildModeratorPrompt(input: ModeratorPromptInput): PromptAssembly {
  return {
    systemPrefixId: systemPrefixId('discussion_moderator', MODERATOR_PROMPT_VERSION),
    staticPlatform: STATIC_PLATFORM,
    staticPolicy: STATIC_POLICY,
    grounding: input.grounding,
    variable: [
      `Assignment: ${input.assignmentTitle}`,
      '',
      'Post to classify:',
      '"""',
      input.postBody,
      '"""',
    ].join('\n'),
  };
}

/**
 * The request for one moderation pass.
 *
 * **The provider-facing schema is generated from the zod schema, and the frozen union is not touched.**
 * `toResponseFormat` in `lib/llm/schema.ts` takes a `StructuredSchemaName`, which is `keyof
 * STRUCTURED_SCHEMAS` -- so using it would mean adding `moderator_output_v1` to that frozen object, which
 * is exactly the agreement-11 edit I-49 exists to avoid. `z.toJSONSchema` is the same call
 * `toResponseFormat` makes internally, so the generated schema is identical in shape.
 *
 * **The generated schema carries structure only, which is what the provider needs.** Trap **T30**: the
 * provider's structured-output subset is opaque and its refusal names no field, so a schema one keyword
 * outside the subset fails with "Request contains an invalid argument." The refinements that make
 * `overallSeverity` agree with the flags are **not** expressible as JSON Schema and do not survive this
 * conversion -- which is correct, because they are the application's business rather than the provider's:
 * the model is constrained to the shape, and `moderatorOutputSchema` refuses a payload whose summary
 * disagrees. A payload the provider allows but zod refuses is a **refusal** (`AGENTS.md` section 6 rule 4),
 * never a retry.
 *
 * `temperature` is 0 for the same reason every classifying capability uses 0 (`AGENTS.md` section 6's
 * "Determinism over cleverness"): the same post must produce the same flags.
 */
export function buildModeratorRequest(input: {
  readonly modelId: string;
  readonly sessionId: string;
  readonly assignmentTitle: string;
  readonly grounding: string;
  readonly postBody: string;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}): LlmRequest {
  const assembly = buildModeratorPrompt({
    assignmentTitle: input.assignmentTitle,
    grounding: input.grounding,
    postBody: input.postBody,
  });
  const messages: LlmMessage[] = assembleMessages(assembly);
  return {
    capability: 'discussion_moderator',
    modelId: input.modelId,
    systemPrefixId: assembly.systemPrefixId,
    messages,
    responseFormat: {
      type: 'json_schema',
      name: MODERATOR_SCHEMA_NAME,
      schema: moderatorJsonSchema(),
      strict: true,
    },
    temperature: 0,
    maxOutputTokens: input.maxOutputTokens ?? MODERATOR_DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: input.timeoutMs ?? MODERATOR_DEFAULT_TIMEOUT_MS,
    sessionId: input.sessionId,
  };
}
