/**
 * Unit tests for the text/Markdown reader and the router's MIME dispatch (`11` Phase 2; `04`
 * S3/S7; `06` S7.2.3; C2, D80).
 *
 * `docs/fixtures/demo-ai-policy.md` is a committed fixture, so the Markdown case runs against a
 * real document as well as against a literal. The rest of the cases exist because the decoder is
 * `fatal`: a file that is not UTF-8 must be refused, not read through U+FFFD replacement
 * characters into a citation the tutor is meant to trust.
 *
 * Pure: no database, no network, no provider key.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { extractDocument } from '../../src/lib/extract/index';
import {
  ExtractionError,
  MARKDOWN_MIME,
  TEXT_MIME,
} from '../../src/lib/extract/types';

const encoder = new TextEncoder();

describe('extractDocument -- plain text', () => {
  it('round trips UTF-8, including multi-byte characters, without normalising them', async () => {
    const source = 'Line one\nLine two caf\u00e9 \u4e09\u56db\u4e94';

    const result = await extractDocument({ bytes: encoder.encode(source), mimeType: TEXT_MIME });

    expect(result.format).toBe('text');
    expect(result.text).toBe(source);
    expect(result.charCount).toBe(source.length);
    expect(result.pageCount).toBeNull();
    expect(result.hasTextLayer).toBe(true);
  });

  it('keeps the text verbatim: no whitespace collapsing, no de-hyphenation', async () => {
    // This is the C2 case. S4 collapses whitespace and joins a hyphenated line break; if this
    // module did either, the chunk text would no longer be what the document says.
    const source = 'A sentence that the\nfile wraps.   And  extra   spaces.\nco-ordinated';

    const result = await extractDocument({ bytes: encoder.encode(source), mimeType: TEXT_MIME });

    expect(result.text).toBe(source);
  });

  it('strips a leading byte-order mark', async () => {
    const bytes = encoder.encode('\uFEFFHello');

    const result = await extractDocument({ bytes, mimeType: TEXT_MIME });

    expect(result.text).toBe('Hello');
    expect(result.charCount).toBe(5);
  });

  it('throws CORRUPT_DOCUMENT for bytes that are not valid UTF-8', async () => {
    // 0xff and 0xfe are never valid UTF-8 lead bytes.
    const invalid = new Uint8Array([0x48, 0x69, 0xff, 0xfe, 0x00]);

    await expect(extractDocument({ bytes: invalid, mimeType: TEXT_MIME })).rejects.toBeInstanceOf(
      ExtractionError,
    );
    await expect(
      extractDocument({ bytes: invalid, mimeType: TEXT_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });

  it('returns an empty string for an empty file rather than throwing', async () => {
    // An empty file is a finding for the pipeline that knows the requirement set (S1's size
    // check refuses zero bytes at upload); it is not a parse failure, so it is not reported as
    // one. `EMPTY_DOCUMENT` is defined for the caller that decides to raise it.
    const result = await extractDocument({ bytes: new Uint8Array(0), mimeType: TEXT_MIME });

    expect(result.text).toBe('');
    expect(result.charCount).toBe(0);
    expect(result.pageCount).toBeNull();
  });
});

describe('extractDocument -- Markdown', () => {
  it('maps text/markdown to the markdown format', async () => {
    const source = '# Heading\n\n- item one\n- item two\n';

    const result = await extractDocument({ bytes: encoder.encode(source), mimeType: MARKDOWN_MIME });

    expect(result.format).toBe('markdown');
    expect(result.text).toBe(source);
    expect(result.pageCount).toBeNull();
    expect(result.hasTextLayer).toBe(true);
  });

  it('leaves the Markdown syntax in place, because the syntax is part of what it says', async () => {
    const source = '**bold** and `code` and [a link](https://example.test)';

    const result = await extractDocument({ bytes: encoder.encode(source), mimeType: MARKDOWN_MIME });

    expect(result.text).toBe(source);
  });

  it('reads the committed demo-ai-policy.md fixture verbatim', async () => {
    const fixture = new URL('../../../docs/fixtures/demo-ai-policy.md', import.meta.url);
    const source = readFileSync(fixture, 'utf8');

    const result = await extractDocument({
      bytes: new Uint8Array(readFileSync(fixture)),
      mimeType: MARKDOWN_MIME,
    });

    expect(result.format).toBe('markdown');
    expect(result.charCount).toBeGreaterThan(1000);
    // Byte-for-byte against the file on disk: the reader has no licence to alter T1 text.
    expect(result.text).toBe(source);
  });
});
