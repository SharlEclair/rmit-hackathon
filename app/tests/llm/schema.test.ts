/**
 * The structured-output contract (`src/lib/llm/schema.ts`), which is **frozen at Phase 2**.
 *
 * The cases here are the ones a later phase would otherwise break by accident:
 *
 *   - a schema failure is a **result**, never a throw and never a retry (D16);
 *   - `.strict()` rejects an unexpected key, which is how a model that volunteers a clarification for
 *     an ambiguity finding is refused rather than having the text silently dropped (D23, C2);
 *   - a contradiction must quote both locations (`ck_ambiguity_findings_excerpt_b_required`);
 *   - the provider-facing JSON schema is transformed for nullable fields, and the transform must not
 *     loosen what the application accepts.
 */

import { describe, expect, it } from 'vitest';

import {
  PLANNING_LEVELS,
  STRUCTURED_SCHEMAS,
  ambiguityPassSchema,
  attachmentExtractionSchema,
  parseStructured,
  toResponseFormat,
} from '@/lib/llm/schema';

describe('parseStructured (D16: a schema failure is a refusal)', () => {
  it('returns a value and no issues for valid input', () => {
    const result = parseStructured(attachmentExtractionSchema, { text: 'hello' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe('hello');
  });

  it('returns issues rather than throwing for invalid input', () => {
    const result = parseStructured(attachmentExtractionSchema, { text: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      // The issue names the path and the shape, never the offending value.
      expect(result.issues[0]).toContain('text');
      expect(result.issues.join(' ')).not.toContain('42');
    }
  });

  it('refuses an unexpected key instead of stripping it', () => {
    const result = parseStructured(attachmentExtractionSchema, {
      text: 'hello',
      answerForTheStudent: 'here is the solution',
    });
    expect(result.ok).toBe(false);
  });

  it('treats a null payload as a failure, so an unknown mock fixture cannot be persisted', () => {
    expect(parseStructured(attachmentExtractionSchema, null).ok).toBe(false);
  });
});

describe('the ambiguity contract (D23, C2)', () => {
  const finding = {
    kind: 'ambiguity' as const,
    severity: 'medium' as const,
    title: 'Word count is not stated',
    description: 'The brief mentions a limit but does not say where it applies.',
    locatedPage: 2,
    locatedSectionLabel: '3.1',
    excerptA: 'a limit applies',
    excerptB: null,
    sourceChunkRefs: [0],
  };

  it('accepts a finding that locates and does not clarify', () => {
    expect(ambiguityPassSchema.safeParse({ findings: [finding] }).success).toBe(true);
  });

  it('rejects a finding carrying a proposed clarification', () => {
    const withClarification = { ...finding, suggestedClarification: 'Assume 1,800 words.' };
    expect(ambiguityPassSchema.safeParse({ findings: [withClarification] }).success).toBe(false);
  });

  it('requires both excerpts for a contradiction', () => {
    const contradiction = { ...finding, kind: 'contradiction' as const };
    expect(ambiguityPassSchema.safeParse({ findings: [contradiction] }).success).toBe(false);
    expect(
      ambiguityPassSchema.safeParse({ findings: [{ ...contradiction, excerptB: 'no limit applies' }] }).success,
    ).toBe(true);
  });
});

describe('the provider-facing JSON schema', () => {
  it('drops the $schema key and keeps a stable name', () => {
    const format = toResponseFormat('attachment_extraction_v1', attachmentExtractionSchema);
    expect(format.name).toBe('attachment_extraction_v1');
    expect(format.strict).toBe(true);
    expect(format.schema['$schema']).toBeUndefined();
  });

  it('sends only keywords the provider honours, and keeps the application contract intact', () => {
    const format = toResponseFormat('analyst_ambiguity_v1', ambiguityPassSchema);
    const text = JSON.stringify(format.schema);
    // Shapes the provider is asked for.
    for (const kept of ['"type"', '"properties"', '"required"', '"items"', '"enum"', '"nullable"']) {
      expect(text, kept).toContain(kept);
    }
    // Validation keywords the provider is not asked for: zod enforces every one of them, so an
    // out-of-range payload is still refused (D16).
    for (const dropped of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum']) {
      expect(text, dropped).not.toContain(dropped);
    }
    expect(text).not.toContain('"type":"null"');
    expect(ambiguityPassSchema.safeParse({ findings: [{ kind: 'nonsense' }] }).success).toBe(false);
  });

  it('names one schema per structured capability', () => {
    expect(Object.keys(STRUCTURED_SCHEMAS)).toEqual([
      'analyst_structure_v1',
      'analyst_milestones_v1',
      'analyst_faq_v1',
      'analyst_policy_v1',
      'analyst_ambiguity_v1',
      'attachment_extraction_v1',
    ]);
  });

  it('exposes exactly the six planning-level verbs of O1 as the planning enum', () => {
    expect(PLANNING_LEVELS).toEqual(['understand', 'identify', 'plan', 'verify', 'review', 'note']);
  });
});
