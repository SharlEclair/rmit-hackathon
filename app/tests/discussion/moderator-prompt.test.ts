import { describe, expect, it } from 'vitest';

import {
  MODERATOR_DEFAULT_MAX_OUTPUT_TOKENS,
  MODERATOR_PROMPT_VERSION,
  MODERATOR_SCHEMA_NAME,
  buildModeratorPrompt,
  buildModeratorRequest,
  moderatorJsonSchema,
} from '@/features/discussion/moderator-prompt';
import { moderatorOutputSchema } from '@/features/discussion/moderator-schema';

/**
 * The Discussion Moderator's prompt assembly and the provider-facing schema (`05` sections 9.1-9.6).
 *
 * **Why the schema generation is tested rather than assumed.** `toResponseFormat` in the frozen
 * `lib/llm/schema.ts` takes a `StructuredSchemaName`, so this feature generates its JSON Schema itself
 * with `z.toJSONSchema` -- the same call that function makes internally. Trap **T30** is the reason this
 * deserves a test rather than a comment: the provider's structured-output subset is opaque, its refusal
 * names no field, and a schema one keyword outside the subset fails with "Request contains an invalid
 * argument." indistinguishable from a bad model id. So the generated schema is asserted for the
 * properties the subset is known to accept.
 *
 * **What this suite cannot reach.** Whether the provider accepts the schema is only knowable from a live
 * call, and Phase 6 makes none (the acceptance runs use `mock`). The tests here pin the *shape* and the
 * removal of the meta-schema key; a live call remains the remaining verification, and `I-36`'s paid-tier
 * key is the reason it is not made here.
 */

describe('the JSON Schema is generated, minimised and stable', () => {
  it('generates without throwing, and drops the top-level $schema key', () => {
    // `$schema` is deleted because the provider rejects a meta-schema key it does not recognise (T30).
    const schema = moderatorJsonSchema() as Record<string, unknown>;
    expect(schema['$schema']).toBeUndefined();
    expect(schema['type']).toBe('object');
  });

  it('carries only the keywords the provider subset accepts (trap T30)', () => {
    // The known-good subset. Anything else risks a field-less "invalid argument" refusal, so a keyword
    // added by a future zod version fails here rather than at a live call during a demo.
    //
    // **The walk is keyword-aware.** A naive `Object.keys` traversal reports the *property names* of
    // `properties` (`flags`, `reasonCode`, `spanStart`, ...) as though they were keywords, which is a bug
    // in the test rather than in the schema. So `properties`' own keys and `required`'s entries are
    // skipped: they are data, not vocabulary.
    const allowed = new Set([
      'type',
      'properties',
      'required',
      'items',
      'enum',
      'nullable',
      'additionalProperties',
      'anyOf',
      'maxItems',
      'maxLength',
      'minimum',
      'maximum',
    ]);
    const dataKeys = new Set(['properties', 'required', 'enum']);
    const unexpected: string[] = [];
    const walk = (node: unknown, isData: boolean): void => {
      if (Array.isArray(node)) {
        node.forEach((item) => {
          walk(item, isData);
        });
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      for (const [key, value] of Object.entries(node)) {
        if (!isData) {
          if (!allowed.has(key)) unexpected.push(key);
          walk(value, dataKeys.has(key));
          continue;
        }
        // A `properties` object maps a property name to a subschema; the name is data and the value is a
        // schema again. `required` and `enum` are arrays of data.
        if (Array.isArray(value) || typeof value !== 'object' || value === null) continue;
        for (const subschema of Object.values(value)) walk(subschema, false);
      }
    };
    walk(moderatorJsonSchema(), false);
    expect(unexpected).toEqual([]);
  });

  it('is stable across calls, and the same object is reused', () => {
    // It is a pure function of a constant schema, so regenerating per request would be waste; the identity
    // assertion also catches a cache accidentally keyed on something variable.
    expect(moderatorJsonSchema()).toBe(moderatorJsonSchema());
  });

  it('names the schema with the version, because the name is part of the cache key', () => {
    expect(MODERATOR_SCHEMA_NAME).toBe(`moderator_output_v${String(MODERATOR_PROMPT_VERSION)}`);
  });
});

describe('the prompt is the four blocks of 04 section 5.5, in order', () => {
  it('names the prefix <capability>-v<n>', () => {
    const assembly = buildModeratorPrompt({
      assignmentTitle: 'Case Analysis',
      grounding: 'The report must be 2000 words.',
      postBody: 'How long should it be?',
    });
    expect(assembly.systemPrefixId).toBe('discussion_moderator-v1');
  });

  it('puts the static blocks before the variable one, so the cacheable prefix is long', () => {
    // 04 section 5.5: "the later the first variable byte, the larger the cacheable prefix". The assembly
    // carries them separately for exactly this reason, and `assembleMessages` places A and B in `system`
    // and C and D in `user`.
    const assembly = buildModeratorPrompt({
      assignmentTitle: 'Case Analysis',
      grounding: 'grounding text',
      postBody: 'post text',
    });
    expect(assembly.staticPlatform.length).toBeGreaterThan(200);
    expect(assembly.staticPolicy.length).toBeGreaterThan(200);
    expect(assembly.variable).toContain('post text');
    // The post must not appear in a static block: that would make the prefix variable and destroy caching.
    expect(assembly.staticPlatform).not.toContain('post text');
    expect(assembly.staticPolicy).not.toContain('post text');
  });

  it('delimits the post rather than truncating it', () => {
    // A truncated classification could miss the sentence that matters, and 05 section 9.1 makes the
    // failure cost asymmetric: a missed flag leaves harmful content visible.
    const long = 'x'.repeat(4000);
    const assembly = buildModeratorPrompt({
      assignmentTitle: 'A',
      grounding: '',
      postBody: long,
    });
    expect(assembly.variable).toContain(long);
  });

  it('lists every reason code the schema accepts, so the prompt and the enum cannot drift', () => {
    const { staticPolicy } = buildModeratorPrompt({
      assignmentTitle: 'A',
      grounding: '',
      postBody: 'b',
    });
    for (const code of [
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
      'MOD_SPAM',
    ]) {
      expect(staticPolicy, `policy must name ${code}`).toContain(code);
    }
  });

  it('states the unsupported-claim rule, which never hides a post by itself', () => {
    // 05 section 9.4 binding rule 2, and the single most likely way for the moderator to be misused:
    // "The correct response to a student misstating the brief is a tutor reply linking the verbatim
    // requirement (C2, D14), not suppression."
    const { staticPolicy } = buildModeratorPrompt({
      assignmentTitle: 'A',
      grounding: '',
      postBody: 'b',
    });
    expect(staticPolicy).toMatch(/never hides/i);
  });

  it('asks for the tutor-facing explanation and forbids addressing the author', () => {
    const { staticPlatform } = buildModeratorPrompt({
      assignmentTitle: 'A',
      grounding: '',
      postBody: 'b',
    });
    // 05 section 9.6: the explanation is tutor-facing; 9.4 binding rule 4 forbids the student's view
    // disclosing that a model flagged the post. A prompt that asked for a verdict on the person would
    // produce text the schema cannot carry and a tutor cannot act on.
    expect(staticPlatform).toMatch(/read by a tutor/i);
    expect(staticPlatform).toMatch(/Do not address the author/i);
  });

  it('says an unremarkable post must produce no flags', () => {
    // The common case. Without this the model over-flags, and 05 section 9.3's severity 1 queues a post
    // "quietly" -- noise a tutor has to read.
    const { staticPlatform } = buildModeratorPrompt({
      assignmentTitle: 'A',
      grounding: '',
      postBody: 'b',
    });
    expect(staticPlatform).toMatch(/Flag nothing when the post is an ordinary on-topic/i);
  });
});

describe('the request obeys the capability contract', () => {
  function request() {
    return buildModeratorRequest({
      modelId: 'test-model',
      sessionId: 'session-1',
      assignmentTitle: 'Case Analysis',
      grounding: 'grounding',
      postBody: 'How long should the report be?',
    });
  }

  it('uses the discussion_moderator capability and temperature 0', () => {
    const built = request();
    expect(built.capability).toBe('discussion_moderator');
    // D89/A-D: every classifying capability runs at temperature 0. The same post must give the same flags.
    expect(built.temperature).toBe(0);
  });

  it('sends the two messages in the order assembleMessages produces', () => {
    const built = request();
    expect(built.messages.map((message) => message.role)).toEqual(['system', 'user']);
    // `content` is a union of content parts, so the assertion narrows to the text parts rather than
    // assuming the first one is text -- `toContain` on the array would compare references and never match
    // a string, which is how this assertion was wrong on the first run.
    const userText = (built.messages[1]?.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    expect(userText).toContain('How long should the report be?');
  });

  it('carries a json_schema response format named for the version, and strict', () => {
    const built = request();
    expect(built.responseFormat).toMatchObject({
      type: 'json_schema',
      name: MODERATOR_SCHEMA_NAME,
      strict: true,
    });
  });

  it('defaults the output ceiling and the timeout, and accepts overrides', () => {
    expect(request().maxOutputTokens).toBe(MODERATOR_DEFAULT_MAX_OUTPUT_TOKENS);
    expect(request().timeoutMs).toBe(120_000);
    const overridden = buildModeratorRequest({
      modelId: 'm',
      sessionId: 's',
      assignmentTitle: 'A',
      grounding: '',
      postBody: 'b',
      maxOutputTokens: 512,
      timeoutMs: 5_000,
    });
    expect(overridden.maxOutputTokens).toBe(512);
    expect(overridden.timeoutMs).toBe(5_000);
  });

  it('generates a schema the application-side validator can also parse against', () => {
    // The provider schema and the zod schema must describe the same shape, or a provider-valid payload
    // would be refused by zod -- which AGENTS.md section 6 rule 4 makes a refusal, not a retry, so it
    // would look like a moderation failure on every post.
    const schema = moderatorJsonSchema() as { properties?: Record<string, unknown> };
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
      'containsPersonalData',
      'flags',
      'overallSeverity',
    ]);
    expect(
      moderatorOutputSchema.safeParse({
        flags: [],
        overallSeverity: 0,
        containsPersonalData: false,
      }).success,
    ).toBe(true);
  });
});
