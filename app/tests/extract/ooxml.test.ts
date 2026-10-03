/**
 * Unit tests for the DOCX/PPTX reader (`11` Phase 2; `04` S3/S7; `06` S7.2.3; C2).
 *
 * The archives are built here, in memory, from `node:zlib` and a hand-written central directory.
 * A fixture committed as base64 would prove that the reader can read *that* fixture; building the
 * archive with the real deflate algorithm proves the reader walks a genuine ZIP index and inflates
 * a genuine deflate stream, which is the claim the module actually makes. No ZIP library is
 * added: `04` S2.2 pins the dependency set.
 *
 * Pure: no database, no network, no provider key, no fixture file.
 */

import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { extractDocument } from '../../src/lib/extract/index';
import { DOCX_MIME, ExtractionError, PPTX_MIME } from '../../src/lib/extract/types';

// ---------------------------------------------------------------------------------------------
// A minimal ZIP writer, so the reader is exercised against a real archive
// ---------------------------------------------------------------------------------------------

interface ZipMember {
  readonly name: string;
  readonly content: string;
}

/** Clamp a CRC32 accumulator to an unsigned 32-bit value. */
function toUint32(value: number): number {
  return value >>> 0;
}

/** The standard reflected CRC-32 (IEEE 802.3), which every ZIP writer emits. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = toUint32(crc ^ byte);
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? toUint32((crc >>> 1) ^ 0xedb88320) : toUint32(crc >>> 1);
    }
  }
  return toUint32(crc ^ 0xffffffff);
}

/**
 * Build a ZIP archive whose every member is deflated.
 *
 * Deflate rather than "stored" on purpose: the reader has a stored path and a deflate path, and
 * the compressed path is the one a real Word or PowerPoint file takes.
 */
function buildZip(members: readonly ZipMember[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const member of members) {
    const name = new TextEncoder().encode(member.name);
    const raw = new TextEncoder().encode(member.content);
    const deflated = new Uint8Array(deflateRawSync(raw));
    const checksum = crc32(raw);

    const local = new Uint8Array(30 + name.length + deflated.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // local file header signature
    localView.setUint16(4, 20, true); // version needed to extract
    localView.setUint16(6, 0, true); // general purpose flags
    localView.setUint16(8, 8, true); // compression method: deflate
    localView.setUint16(10, 0, true); // last modified time
    localView.setUint16(12, 0x21, true); // last modified date (1980-01-01)
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, deflated.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // extra field length
    local.set(name, 30);
    local.set(deflated, 30 + name.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); // central directory header signature
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed to extract
    centralView.setUint16(8, 0, true); // general purpose flags
    centralView.setUint16(10, 8, true); // compression method: deflate
    centralView.setUint16(12, 0, true); // last modified time
    centralView.setUint16(14, 0x21, true); // last modified date
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, deflated.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true); // extra field length
    centralView.setUint16(32, 0, true); // file comment length
    centralView.setUint16(34, 0, true); // disk number start
    centralView.setUint16(36, 0, true); // internal attributes
    centralView.setUint32(38, 0, true); // external attributes
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralChunks.push(central);

    localOffset += local.length;
  }

  const centralSize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); // end of central directory signature
  endView.setUint16(4, 0, true); // this disk number
  endView.setUint16(6, 0, true); // disk with the central directory
  endView.setUint16(8, members.length, true); // entries on this disk
  endView.setUint16(10, members.length, true); // entries in total
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true); // offset of the central directory
  endView.setUint16(20, 0, true); // comment length

  const total = localOffset + centralSize + end.length;
  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...localChunks, ...centralChunks, end]) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }
  return archive;
}

/** Byte offset of one central-directory entry, so a test can lie about that entry's fields. */
function centralEntryOffset(archive: Uint8Array, name: string): number {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const eocd = archive.byteLength - 22;
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const stored = new TextDecoder().decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    if (stored === name) return cursor;
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`test helper could not find a central directory entry for ${name}`);
}

/** Byte offset of an entry's compressed data, so a test can damage the stream itself. */
function entryDataOffset(archive: Uint8Array, name: string): number {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const localHeaderOffset = view.getUint32(centralEntryOffset(archive, name) + 42, true);
  const nameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  return localHeaderOffset + 30 + nameLength + extraLength;
}

/** Wrap a paragraph's text in the DOCX paragraph/run shape Word produces. */
function docxParagraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function docx(body: string): Uint8Array {
  return buildZip([
    { name: '[Content_Types].xml', content: '<Types/>' },
    { name: 'word/document.xml', content: `<w:document><w:body>${body}</w:body></w:document>` },
  ]);
}

function pptx(slides: readonly string[]): Uint8Array {
  return buildZip(
    slides.map((slide, index) => ({
      name: `ppt/slides/slide${index + 1}.xml`,
      content: slide,
    })),
  );
}

/** A minimal `<a:p>` paragraph, the PPTX analogue of `docxParagraph`. */
function aParagraph(text: string): string {
  return `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;
}

// ---------------------------------------------------------------------------------------------
// The control: without this, the tests below could pass for the wrong reason
// ---------------------------------------------------------------------------------------------

describe('the in-test ZIP writer', () => {
  it('is accepted by the reader, which is what makes the archives real', async () => {
    const result = await extractDocument({
      bytes: docx(docxParagraph('round trip')),
      mimeType: DOCX_MIME,
    });
    expect(result.text).toBe('round trip');
  });
});

// ---------------------------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------------------------

describe('extractDocument -- DOCX', () => {
  it('turns paragraph ends into line breaks and keeps the text verbatim', async () => {
    const bytes = docx(
      docxParagraph('1. Requirements') +
        docxParagraph('The report body is 1,800 words.') +
        docxParagraph('Three parts: A, B and C.'),
    );

    const result = await extractDocument({ bytes, mimeType: DOCX_MIME });

    expect(result.format).toBe('docx');
    expect(result.pageCount).toBeNull();
    expect(result.hasTextLayer).toBe(true);
    expect(result.text).toBe(
      ['1. Requirements', 'The report body is 1,800 words.', 'Three parts: A, B and C.'].join('\n'),
    );
    expect(result.charCount).toBe(result.text.length);
  });

  it('turns a <w:br/> into a line break', async () => {
    const bytes = docx(
      '<w:p><w:r><w:t>first line</w:t><w:br/><w:t>second line</w:t></w:r></w:p>',
    );

    const result = await extractDocument({ bytes, mimeType: DOCX_MIME });

    expect(result.text).toBe('first line\nsecond line');
  });

  it('does not glue two runs of one sentence into a single invented word', async () => {
    const bytes = docx('<w:p><w:r><w:t>governance</w:t></w:r><w:r><w:t>risk</w:t></w:r></w:p>');

    const result = await extractDocument({ bytes, mimeType: DOCX_MIME });

    expect(result.text).toBe('governance risk');
  });

  it('decodes the five XML entities and numeric character references', async () => {
    const bytes = docx(
      docxParagraph('Research &amp; development') +
        docxParagraph('1 &lt; 2 &gt; 1 &quot;quoted&quot; &apos;single&apos;') +
        docxParagraph('&#65;&#x42;&#67;'),
    );

    const result = await extractDocument({ bytes, mimeType: DOCX_MIME });

    expect(result.text).toBe(
      ['Research & development', '1 < 2 > 1 "quoted" \'single\'', 'ABC'].join('\n'),
    );
  });

  it('keeps a literal &amp;lt; as the characters the document holds, not as <', async () => {
    // `&amp;lt;` is the document's own text "&lt;". Decoding `&amp;` first would produce "<",
    // which is a different character -- the classic double-decode defect.
    const result = await extractDocument({
      bytes: docx(docxParagraph('literal &amp;lt; stays')),
      mimeType: DOCX_MIME,
    });

    expect(result.text).toBe('literal &lt; stays');
  });

  it('drops whitespace-only paragraphs rather than emitting blank lines', async () => {
    const bytes = docx(docxParagraph('alpha') + docxParagraph('   ') + docxParagraph('beta'));

    const result = await extractDocument({ bytes, mimeType: DOCX_MIME });

    expect(result.text).toBe('alpha\nbeta');
  });

  it('throws CORRUPT_DOCUMENT for a zip with no word/document.xml part', async () => {
    const archive = buildZip([{ name: 'word/styles.xml', content: '<w:styles/>' }]);

    await expect(
      extractDocument({ bytes: archive, mimeType: DOCX_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });

  it('throws CORRUPT_DOCUMENT for bytes that are not a zip at all', async () => {
    const notAZip = new TextEncoder().encode('This is a DOCX, trust me.');

    await expect(extractDocument({ bytes: notAZip, mimeType: DOCX_MIME })).rejects.toBeInstanceOf(
      ExtractionError,
    );
    await expect(
      extractDocument({ bytes: notAZip, mimeType: DOCX_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });

  it('throws CORRUPT_DOCUMENT for a truncated archive', async () => {
    const archive = docx(docxParagraph('truncated'));
    const truncated = archive.subarray(0, archive.length - 100);

    await expect(
      extractDocument({ bytes: truncated, mimeType: DOCX_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });

  it('throws CORRUPT_DOCUMENT when the index lies about an entry size, damaging the stream', async () => {
    // A size the archive declares and the data cannot satisfy forces a deterministic failure on
    // the inflate path -- the case the CRC-32 check does not cover, because damage to a deflate
    // stream can just as easily decode into wrong text as into an error.
    const archive = docx(docxParagraph('damaged deflate stream'));
    const entry = centralEntryOffset(archive, 'word/document.xml');
    const damaged = archive.slice();
    new DataView(damaged.buffer).setUint32(entry + 20, 0, true); // compressed size: 0

    await expect(
      extractDocument({ bytes: damaged, mimeType: DOCX_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });

  it('throws CORRUPT_DOCUMENT for a compression method other than stored or deflate', async () => {
    const archive = docx(docxParagraph('unsupported method'));
    const entry = centralEntryOffset(archive, 'word/document.xml');
    const mutated = archive.slice();
    new DataView(mutated.buffer).setUint16(entry + 10, 99, true);

    await expect(
      extractDocument({ bytes: mutated, mimeType: DOCX_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });
});

// ---------------------------------------------------------------------------------------------
// PPTX
// ---------------------------------------------------------------------------------------------

describe('extractDocument -- PPTX', () => {
  it('reads every slide, ordered by slide number, and reports a null page count', async () => {
    // Slide 2 is authored before slide 1 and the reader must not follow authoring order.
    const archive = pptx([
      `<p:sld><p:cSld><p:spTree>${aParagraph('second slide')}</p:spTree></p:cSld></p:sld>`,
      `<p:sld><p:cSld><p:spTree>${aParagraph('first slide')}</p:spTree></p:cSld></p:sld>`,
    ]);

    const result = await extractDocument({ bytes: archive, mimeType: PPTX_MIME });

    expect(result.format).toBe('pptx');
    expect(result.pageCount).toBeNull();
    expect(result.text).toBe('second slide\nfirst slide');
  });

  it('orders slide10 after slide2, not before it lexicographically', async () => {
    const labels = Array.from({ length: 11 }, (_unused, index) => `slide number ${index + 1}`);
    const archive = buildZip(
      labels.map((label, index) => ({
        name: `ppt/slides/slide${index + 1}.xml`,
        content: `<p:sld><p:cSld><p:spTree>${aParagraph(label)}</p:spTree></p:cSld></p:sld>`,
      })),
    );

    const result = await extractDocument({ bytes: archive, mimeType: PPTX_MIME });
    const lines = result.text.split('\n');

    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe('slide number 1');
    expect(lines[1]).toBe('slide number 2');
    expect(lines[9]).toBe('slide number 10');
    expect(lines[10]).toBe('slide number 11');
  });

  it('turns an <a:br/> into a line break and decodes entities', async () => {
    const archive = pptx([
      '<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>Q&amp;A</a:t><a:br/><a:t>outline</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>',
    ]);

    const result = await extractDocument({ bytes: archive, mimeType: PPTX_MIME });

    expect(result.text).toBe('Q&A\noutline');
  });

  it('throws CORRUPT_DOCUMENT for a pptx with no slide parts', async () => {
    const archive = buildZip([{ name: 'ppt/presentation.xml', content: '<p:presentation/>' }]);

    await expect(
      extractDocument({ bytes: archive, mimeType: PPTX_MIME }),
    ).rejects.toMatchObject({ code: 'CORRUPT_DOCUMENT' });
  });
});

// ---------------------------------------------------------------------------------------------
// CRC-32: what stops a damaged deflate stream from becoming T1 text (`06` S7.2.3, C2)
// ---------------------------------------------------------------------------------------------

describe('extractDocument -- CRC-32 verification', () => {
  it('accepts intact archives: the DOCX body and every slide still extract unchanged', async () => {
    // Without this, the checks below could pass because the reader refuses everything.
    const document = await extractDocument({
      bytes: docx(docxParagraph('1. Requirements') + docxParagraph('The report is 1,800 words.')),
      mimeType: DOCX_MIME,
    });
    expect(document.text).toBe('1. Requirements\nThe report is 1,800 words.');

    const deck = await extractDocument({
      bytes: pptx([
        `<p:sld><p:cSld><p:spTree>${aParagraph('first slide')}</p:spTree></p:cSld></p:sld>`,
        `<p:sld><p:cSld><p:spTree>${aParagraph('second slide')}</p:spTree></p:cSld></p:sld>`,
      ]),
      mimeType: PPTX_MIME,
    });
    expect(deck.text).toBe('first slide\nsecond slide');
  });

  it('throws CORRUPT_DOCUMENT when a byte inside the deflated document part is flipped', async () => {
    // The flip is one byte into the deflate stream, which for this body keeps the stream
    // decodable and changes the bytes it produces (checked against this runtime's zlib). The
    // reader must refuse it either way: a stream that fails to inflate and a stream that inflates
    // to the wrong text are both documents whose text cannot be trusted.
    const archive = docx(
      docxParagraph('1. Requirements') + docxParagraph('The report is 1,800 words.'),
    );
    const damaged = archive.slice();
    const offset = entryDataOffset(damaged, 'word/document.xml') + 1;
    damaged[offset] = (damaged[offset] ?? 0) ^ 0xff;

    await expect(extractDocument({ bytes: damaged, mimeType: DOCX_MIME })).rejects.toMatchObject({
      code: 'CORRUPT_DOCUMENT',
    });
  });

  it('throws CORRUPT_DOCUMENT when a slide part of a deck is damaged', async () => {
    const archive = pptx([
      `<p:sld><p:cSld><p:spTree>${aParagraph('first slide')}</p:spTree></p:cSld></p:sld>`,
    ]);
    const damaged = archive.slice();
    const offset = entryDataOffset(damaged, 'ppt/slides/slide1.xml') + 1;
    damaged[offset] = (damaged[offset] ?? 0) ^ 0xff;

    await expect(extractDocument({ bytes: damaged, mimeType: PPTX_MIME })).rejects.toMatchObject({
      code: 'CORRUPT_DOCUMENT',
    });
  });

  it('throws CORRUPT_DOCUMENT when the index records a wrong CRC for intact bytes', async () => {
    // The bytes are untouched and inflate to the right text; only the recorded checksum disagrees.
    // That is the case a reader without a CRC check cannot tell from a valid document.
    const archive = docx(docxParagraph('SECRET-MARKER: this body must never reach a tutor.'));
    const entry = centralEntryOffset(archive, 'word/document.xml');
    const lying = archive.slice();
    const view = new DataView(lying.buffer, lying.byteOffset, lying.byteLength);
    view.setUint32(entry + 16, (view.getUint32(entry + 16, true) ^ 0xffffffff) >>> 0, true);

    await expect(
      extractDocument({ bytes: lying, mimeType: DOCX_MIME }),
    ).rejects.toBeInstanceOf(ExtractionError);
    await expect(extractDocument({ bytes: lying, mimeType: DOCX_MIME })).rejects.toMatchObject({
      code: 'CORRUPT_DOCUMENT',
      // The message is persisted to `assignment_sources.extraction_error` and shown to a tutor
      // (`06` S7.2.2), so it must not quote the document or carry a parser error into that field.
      message: expect.not.stringContaining('SECRET-MARKER'),
    });
  });
});

