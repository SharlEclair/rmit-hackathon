import { describe, expect, it } from 'vitest';

import {
  MODERATOR_CODE_SEVERITY,
  MODERATOR_REASON_CODES,
  actionFor,
  moderatorFailureFallback,
  moderatorOutputSchema,
  type ModeratorOutput,
} from '@/features/discussion/moderator-schema';

/**
 * `05-AI-GUARDRAILS.md` section 9.6: the Discussion Moderator's schema, its combinator rules, and section
 * 9.4's severity-to-action mapping.
 *
 * **Why this suite is not a formality.** A moderation result decides whether a student's post is visible.
 * `05` section 9.4 maps severity to an automatic action (2 marks, 3 hides pending review, 4 hides
 * immediately), and section 9.5 gives the cost: "a wrongly hidden post is a visible injustice in a small
 * cohort". So each rule below is asserted in both directions where one exists -- the valid shape passes,
 * and the specific malformation the rule forbids fails.
 *
 * **The two combinator rules are the interesting ones.** `overallSeverity` must equal the maximum flag
 * severity, and a code's severity is a property of the code rather than of the model's opinion. Both are
 * enforced in the schema so a disagreeing model produces a *validation failure* -- which `AGENTS.md`
 * section 6 rule 4 makes a refusal rather than a retry, and which section 9.4 binding rule 5 turns into
 * "flagged, visible, with a tutor note".
 */

function flag(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    reasonCode: 'MOD_OFF_TOPIC',
    severity: 1,
    explanation: 'Unrelated to the assignment brief.',
    spanStart: null,
    spanEnd: null,
    ...overrides,
  };
}

describe('the happy path, and the empty case', () => {
  it('accepts a well-formed single-flag result', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: [flag({ reasonCode: 'MOD_INCIVILITY', severity: 2 })],
      overallSeverity: 2,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts no flags with overallSeverity 0 -- the clean post (05 section 9.6)', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: [],
      overallSeverity: 0,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(actionFor(parsed.data)).toBe('none');
  });

  it('accepts containsPersonalData as optional-by-absence', () => {
    // `05` section 9.6 lists `containsPersonalData` in `properties` but **not** in `required`, so a model
    // that omits it is valid. Asserted because a `.strict()` object with an optional field is easy to get
    // wrong in the other direction -- requiring it would refuse a legal response.
    const parsed = moderatorOutputSchema.safeParse({ flags: [], overallSeverity: 0 });
    expect(parsed.success).toBe(true);
  });
});

describe('overallSeverity is the maximum flag severity (05 section 9.6)', () => {
  it('refuses a summary that understates its own flags', () => {
    // The dangerous direction: flags say severity 4 (hide immediately) and the summary says 1 (no action),
    // so trusting the summary would leave serious content visible.
    const parsed = moderatorOutputSchema.safeParse({
      flags: [flag({ reasonCode: 'MOD_HARASSMENT', severity: 4 })],
      overallSeverity: 1,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a summary that overstates its own flags', () => {
    // The less dangerous but equally wrong direction: this would hide a post nothing flagged.
    const parsed = moderatorOutputSchema.safeParse({
      flags: [flag({ reasonCode: 'MOD_OFF_TOPIC', severity: 1 })],
      overallSeverity: 3,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a non-zero summary over an empty flag list', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: [],
      overallSeverity: 2,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('takes the maximum, not the last or the first, across several flags', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: [
        flag({ reasonCode: 'MOD_OFF_TOPIC', severity: 1 }),
        flag({ reasonCode: 'MOD_PII', severity: 3 }),
        flag({ reasonCode: 'MOD_SPAM', severity: 1 }),
      ],
      overallSeverity: 3,
      containsPersonalData: true,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('a reason code carries its own severity (05 section 9.2)', () => {
  it('refuses a code whose declared severity disagrees with the table', () => {
    // Trusting the model's severity would let `MOD_HARASSMENT` be filed as severity 1 and stay visible.
    const parsed = moderatorOutputSchema.safeParse({
      flags: [flag({ reasonCode: 'MOD_HARASSMENT', severity: 1 })],
      overallSeverity: 1,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a severity-1 code filed as severity 4', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: [flag({ reasonCode: 'MOD_SPAM', severity: 4 })],
      overallSeverity: 4,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts every code at its own table severity', () => {
    // The whole vocabulary at once, so a code added to the enum without a table entry fails here rather
    // than at runtime on a real post.
    for (const code of MODERATOR_REASON_CODES) {
      const severity = MODERATOR_CODE_SEVERITY[code];
      const parsed = moderatorOutputSchema.safeParse({
        flags: [flag({ reasonCode: code, severity })],
        overallSeverity: severity,
        containsPersonalData: false,
      });
      expect(parsed.success, `${code} at severity ${String(severity)}`).toBe(true);
    }
  });

  it('has a severity for every code in the vocabulary', () => {
    // The table and the enum must not drift: a code with no severity would make the refinement above read
    // `undefined` and refuse everything carrying it.
    for (const code of MODERATOR_REASON_CODES) {
      expect(MODERATOR_CODE_SEVERITY[code], `severity for ${code}`).toBeDefined();
      expect([1, 2, 3, 4]).toContain(MODERATOR_CODE_SEVERITY[code]);
    }
    expect(Object.keys(MODERATOR_CODE_SEVERITY)).toHaveLength(MODERATOR_REASON_CODES.length);
  });
});

describe('the vocabulary is closed, and the pattern in the doc is not enough (05 section 9.2)', () => {
  it('refuses an unknown MOD_ code, which a bare pattern would have accepted', () => {
    // `05` section 9.6 types `reasonCode` as `^MOD_[A-Z_]+$` and separately requires "an unknown reasonCode
    // is a validation failure". The pattern cannot do that -- `MOD_FOOBAR` matches it -- so the enum is
    // what makes the sentence true.
    const parsed = moderatorOutputSchema.safeParse({
      flags: [flag({ reasonCode: 'MOD_FOOBAR', severity: 1 })],
      overallSeverity: 1,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a lowercase or unprefixed code', () => {
    for (const reasonCode of ['mod_off_topic', 'OFF_TOPIC', 'MOD_off_TOPIC', '']) {
      const parsed = moderatorOutputSchema.safeParse({
        flags: [flag({ reasonCode, severity: 1 })],
        overallSeverity: 1,
        containsPersonalData: false,
      });
      expect(parsed.success, `reasonCode ${reasonCode}`).toBe(false);
    }
  });
});

describe("the doc's bounds are enforced (05 section 9.6)", () => {
  it('refuses more than six flags', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: Array.from({ length: 7 }, () => flag()),
      overallSeverity: 1,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses an explanation longer than 240 characters', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: [flag({ explanation: 'x'.repeat(241) })],
      overallSeverity: 1,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a severity outside 1..4 and a non-integer', () => {
    for (const severity of [0, 5, 2.5]) {
      const parsed = moderatorOutputSchema.safeParse({
        flags: [flag({ severity })],
        overallSeverity: 1,
        containsPersonalData: false,
      });
      expect(parsed.success, `severity ${String(severity)}`).toBe(false);
    }
  });

  it('refuses an unknown top-level field, because additionalProperties is false', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: [],
      overallSeverity: 0,
      containsPersonalData: false,
      unmodelledField: 'sneaked in',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a null span pair and a real one', () => {
    const parsed = moderatorOutputSchema.safeParse({
      flags: [flag({ spanStart: 4, spanEnd: 19 })],
      overallSeverity: 1,
      containsPersonalData: false,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('severity maps to an action, and nothing silently deletes (05 section 9.4)', () => {
  function outputFor(overallSeverity: 0 | 1 | 2 | 3 | 4): ModeratorOutput {
    return {
      flags: [],
      overallSeverity,
      containsPersonalData: false,
    };
  }

  it('maps 0 and 1 to no action, 2 to a marker, 3 to a pending hide, 4 to an immediate hide', () => {
    expect(actionFor(outputFor(0))).toBe('none');
    expect(actionFor(outputFor(1))).toBe('none');
    expect(actionFor(outputFor(2))).toBe('mark');
    expect(actionFor(outputFor(3))).toBe('hide_pending_review');
    expect(actionFor(outputFor(4))).toBe('hide_immediate');
  });

  it('never returns a removal -- 05 section 9.4 binding rule 1', () => {
    // "There is no severity that results in silent deletion. `remove` is a tutor action." The action union
    // has no removal member, and this asserts the mapping cannot reach one by addition.
    for (const severity of [0, 1, 2, 3, 4] as const) {
      expect(actionFor(outputFor(severity))).not.toBe('remove');
    }
  });
});

describe('a moderator failure is flagged and visible, never hiding and never silent', () => {
  it('produces severity 2 with a reason the tutor can read (05 section 9.4 binding rule 5)', () => {
    const fallback = moderatorFailureFallback('JSON parse failed at byte 12');
    expect(fallback.overallSeverity).toBe(2);
    // The action is `mark`, not a hide: "Moderator failure must not hide student content".
    expect(actionFor(fallback)).toBe('mark');
    // And not `none`: "must not silently pass content either".
    expect(actionFor(fallback)).not.toBe('none');
  });

  it('is itself schema-valid, so the fallback cannot be the thing that fails validation', () => {
    const fallback = moderatorFailureFallback('unparseable');
    expect(moderatorOutputSchema.safeParse(fallback).success).toBe(true);
  });

  it('truncates a long failure detail to the explanation bound, keeping it valid', () => {
    const fallback = moderatorFailureFallback('x'.repeat(900));
    expect(fallback.flags[0]?.explanation.length).toBeLessThanOrEqual(240);
    expect(moderatorOutputSchema.safeParse(fallback).success).toBe(true);
  });
});
