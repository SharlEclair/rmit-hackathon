/**
 * Unit tests for the PDF reader and the extraction router (`11` Phase 2; `04` S3/S7; `06` S7.2.3;
 * traps T8/T9 in `docs/handoff/03-INVARIANTS.md`; C2).
 *
 * The PDF under test is the committed fixture `docs/fixtures/demo-brief.pdf`, read through the
 * real reader rather than described: T8 makes that file load-bearing for every later phase, so a
 * change that breaks its text layer or its four page anchors fails here first.
 *
 * The two content assertions are the fixture's contract, not decoration. `demo-brief.pdf` carries
 * the word-count requirement (so the guardrail golden set can ground a refusal in the brief) and
 * deliberately omits any mention of concurrency (trap T9: the assistant must never import an
 * out-of-scope idea). This test is the tripwire for both.
 *
 * Pure: no database, no network, no provider key. `pdfjs-dist` reads bytes from memory.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { extractDocument } from '../../src/lib/extract/index';
import { ExtractionError, PDF_MIME } from '../../src/lib/extract/types';

/** Resolved from this file, so the suite passes whatever the working directory is. */
const FIXTURE_URL = new URL('../../../docs/fixtures/demo-brief.pdf', import.meta.url);

/**
 * A fresh copy of the fixture bytes per call.
 *
 * `getDocument` transfers the `Uint8Array` it is given to the worker, which detaches the
 * underlying `ArrayBuffer`; a second read of the same array throws "detached ArrayBuffer" rather
 * than reporting anything about the document. Copying is what makes the failure cases below read
 * a real file instead of an empty one.
 */
function fixtureBytes(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_URL));
}

/** One extraction shared by the content assertions: parsing a PDF is not free. */
const brief = await extractDocument({ bytes: fixtureBytes(), mimeType: PDF_MIME });

describe('extractDocument -- the committed demo-brief.pdf fixture', () => {
  it('reports the pdf format with the fixture four pages', () => {
    expect(brief.format).toBe('pdf');
    expect(brief.pageCount).toBe(4);
  });

  it('finds a real text layer rather than a scan', () => {
    expect(brief.hasTextLayer).toBe(true);
    expect(brief.charCount).toBeGreaterThan(5000);
  });

  it('returns one entry per page, numbered 1-based, and joins them verbatim', () => {
    expect(brief.pages.map((page) => page.page)).toEqual([1, 2, 3, 4]);
    expect(brief.text).toBe(brief.pages.map((page) => page.text).join('\n'));
    expect(brief.charCount).toBe(brief.text.length);
  });

  it('carries the word-count requirement the brief states', () => {
    // The exact phrase, on the exact line: the extractor joins one text item per printed line,
    // so a sentence the document wraps is two items. That is the behaviour under test, so the
    // assertion is the printed line and not a re-wrapped paraphrase of it.
    expect(brief.text).toContain('Word count .......... 1,800 words');
    expect(brief.text).toMatch(/\bword\b[^\n]{0,40}\b1,800\b/i);
  });

  it('does not mention concurrency anywhere (trap T9)', () => {
    expect(brief.text).not.toMatch(/concurren/i);
  });
});

describe('extractDocument -- failure handling', () => {
  it('throws CORRUPT_DOCUMENT for bytes that are not a PDF', async () => {
    const notAPdf = new TextEncoder().encode('%PDF-1.7 pretending to be a document');

    await expect(extractDocument({ bytes: notAPdf, mimeType: PDF_MIME })).rejects.toBeInstanceOf(
      ExtractionError,
    );
    await expect(
      extractDocument({ bytes: notAPdf, mimeType: PDF_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });

  it('throws CORRUPT_DOCUMENT for empty bytes rather than reporting a textless document', async () => {
    await expect(
      extractDocument({ bytes: new Uint8Array(0), mimeType: PDF_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });

  it('throws CORRUPT_DOCUMENT for a truncated copy of a valid PDF', async () => {
    const truncated = fixtureBytes().subarray(0, 512);

    await expect(
      extractDocument({ bytes: truncated, mimeType: PDF_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });

  it('throws UNSUPPORTED_FORMAT for an image, which the adapter extracts instead', async () => {
    await expect(
      extractDocument({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
  });

  it('throws UNSUPPORTED_FORMAT for a type outside the accepted set', async () => {
    await expect(
      extractDocument({ bytes: new Uint8Array(1), mimeType: 'application/zip' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
  });
});
