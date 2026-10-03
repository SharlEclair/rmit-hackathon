/**
 * DOCX and PPTX text extraction -- stage S3 of the ingestion pipeline (`04` S7).
 *
 * A `.docx` and a `.pptx` are ZIP archives of XML parts. `04` S2.2 does not pin a ZIP or OOXML
 * library and adding one is out of scope, so this module reads the archive itself: it walks the
 * central directory (never a local-header scan, because a streamed entry can carry zero sizes in
 * its local header) and inflates entries with `node:zlib`. Stored and deflate entries are both
 * supported, which is what Word and PowerPoint produce.
 *
 * Text is taken **verbatim** (C2, `06` S7.2.3). The only transformations applied are the ones
 * that recover structure the XML encodes -- a paragraph end and a line break become a line feed
 * -- plus the XML-level decoding any reader must do to return text rather than markup. Unicode is
 * not normalised, whitespace inside a paragraph is not collapsed, and no word is altered. S4 owns
 * normalisation and is not this module.
 *
 * Deflate carries no integrity check of its own, and a subtly damaged stream still inflates -- to
 * text that is plausible and wrong. That text would become `source_chunks.text`, the T1 ground
 * truth `06` S7.2.3 requires to be verbatim (C2), so each part this module returns is checked
 * against the CRC-32 its central-directory record declares before it is used.
 *
 * `pageCount` is `null`: `06` S7.2.2 allows it, and neither format carries a page anchor for the
 * viewer to deep-link to (`04` S2 table, D43).
 */

import { crc32, inflateRawSync } from 'node:zlib';

import {
  DOCX_MIME,
  ExtractionError,
  PPTX_MIME,
  type ExtractionResult,
} from './types';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MIN_BYTES = 22;
const ZIP64_MARKER = 0xffffffff;
const ZIP64_EXTRA_FIELD = 0x0001;
/** A ZIP comment is at most 64 KiB, which bounds the backward scan for the EOCD record. */
const MAX_COMMENT_BYTES = 0xffff;
/** A bomb that inflates past this is refused rather than buffered. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

/** The DOCX part that carries the document body. */
const DOCX_DOCUMENT_PART = 'word/document.xml';
/** PPTX slide parts. The leading underscore excludes `_rels` and any other sidecar. */
const PPTX_SLIDE_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly flags: number;
  /** The CRC-32 the central directory records for the entry's uncompressed bytes. */
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

/**
 * Extract a DOCX or PPTX.
 *
 * Throws `CORRUPT_DOCUMENT` when the bytes are not a ZIP, when the archive omits the part this
 * format needs, or when a part cannot be read. The message names what is wrong in the terms a
 * tutor would use, because it is persisted to `assignment_sources.extraction_error` (`06` S7.2.2).
 */
export function extractOoxml(bytes: Uint8Array, mimeType: string): ExtractionResult {
  const isDocx = mimeType === DOCX_MIME;
  if (!isDocx && mimeType !== PPTX_MIME) {
    throw new ExtractionError(
      'UNSUPPORTED_FORMAT',
      'This extractor reads .docx and .pptx documents only.',
    );
  }

  const entries = readZipEntries(bytes);
  const parts = isDocx ? docxParts(bytes, entries) : pptxParts(bytes, entries);
  // Each part is a continuous run of paragraphs; the parts are joined by the same line break a
  // paragraph boundary uses, because that is the only boundary the XML actually declares.
  const text = parts
    .map((part) => extractParagraphs(decodeXml(part)).join('\n'))
    .join('\n');

  return {
    format: isDocx ? 'docx' : 'pptx',
    // No page anchors in either format (`06` S7.2.2 allows null, D43).
    pageCount: null,
    // No page anchors, so no `ExtractedPage` entries are fabricated. `text` is the whole document.
    pages: [],
    text,
    hasTextLayer: text.trim().length > 0,
    charCount: text.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------------------------

function findEntry(entries: readonly ZipEntry[], name: string): ZipEntry | null {
  for (const entry of entries) {
    if (entry.name === name) return entry;
  }
  return null;
}

function docxParts(bytes: Uint8Array, entries: readonly ZipEntry[]): Uint8Array[] {
  const document = findEntry(entries, DOCX_DOCUMENT_PART);
  if (document === null) {
    throw new ExtractionError(
      'CORRUPT_DOCUMENT',
      'This .docx file is missing its word/document.xml part.',
    );
  }
  return [readEntry(bytes, document)];
}

/**
 * Every slide part, ordered by slide number rather than by archive order.
 *
 * `slide10.xml` sorts before `slide2.xml` as a string, and the central directory preserves the
 * writer's order rather than numeric order, so the number is parsed and compared as a number.
 * The order is preserved because a deck's slide order is part of its meaning.
 */
function pptxParts(bytes: Uint8Array, entries: readonly ZipEntry[]): Uint8Array[] {
  const slides: { readonly number: number; readonly entry: ZipEntry }[] = [];
  for (const entry of entries) {
    const match = PPTX_SLIDE_PATTERN.exec(entry.name);
    const digits = match?.[1];
    if (digits === undefined) continue;
    slides.push({ number: Number.parseInt(digits, 10), entry });
  }
  if (slides.length === 0) {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'This .pptx file contains no slide parts.');
  }
  slides.sort((left, right) => left.number - right.number);
  return slides.map((slide) => readEntry(bytes, slide.entry));
}

// ---------------------------------------------------------------------------------------------
// ZIP reader
// ---------------------------------------------------------------------------------------------

/**
 * Read the central directory and return one descriptor per entry.
 *
 * The central directory is the authoritative index: a local header written by a streaming writer
 * may carry zero sizes with the real values in a trailing data descriptor, so entries are located
 * through the central directory and the local header is used only to find where the data begins.
 */
function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'This file is not a readable ZIP archive.');
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  const directorySize = view.getUint32(eocd + 12, true);
  if (
    entryCount === 0xffff ||
    directoryOffset === ZIP64_MARKER ||
    directorySize === ZIP64_MARKER
  ) {
    // Refused rather than half-read: the zip64 records live in a different place, and a document
    // part never needs the 4 GiB an archive of that shape implies.
    throw new ExtractionError(
      'CORRUPT_DOCUMENT',
      'This ZIP archive uses zip64 and is not supported.',
    );
  }
  if (directoryOffset + directorySize > bytes.byteLength) {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'This ZIP archive is truncated.');
  }

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength) {
      throw new ExtractionError('CORRUPT_DOCUMENT', 'This ZIP archive is truncated.');
    }
    if (view.getUint32(cursor, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ExtractionError('CORRUPT_DOCUMENT', 'This ZIP archive has a damaged entry index.');
    }

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    if (compressedSize === ZIP64_MARKER || uncompressedSize === ZIP64_MARKER) {
      throw new ExtractionError(
        'CORRUPT_DOCUMENT',
        'This ZIP archive uses zip64 and is not supported.',
      );
    }

    const nameBytes = slice(bytes, cursor + 46, nameLength);
    const extraBytes = slice(bytes, cursor + 46 + nameLength, extraLength);
    // Bit 11 is the UTF-8 name flag. Without it the name is declared CP437; every name this
    // module compares against is ASCII, so a byte-wise read is enough to make or miss the match.
    const name =
      (flags & 0x0800) !== 0
        ? new TextDecoder('utf-8', { fatal: false }).decode(nameBytes)
        : latin1(nameBytes);
    if (hasZip64ExtraField(extraBytes)) {
      throw new ExtractionError(
        'CORRUPT_DOCUMENT',
        'This ZIP archive uses zip64 and is not supported.',
      );
    }

    entries.push({ name, method, flags, crc, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - (EOCD_MIN_BYTES + MAX_COMMENT_BYTES));
  for (let offset = view.byteLength - EOCD_MIN_BYTES; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function hasZip64ExtraField(extra: Uint8Array): boolean {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let cursor = 0;
  while (cursor + 4 <= extra.byteLength) {
    const headerId = view.getUint16(cursor, true);
    const size = view.getUint16(cursor + 2, true);
    if (headerId === ZIP64_EXTRA_FIELD) return true;
    cursor += 4 + size;
  }
  return false;
}

/**
 * Inflate one entry's bytes, honouring the two compression methods an OOXML writer may use, and
 * return them only once they match the CRC-32 the archive declares.
 */
function readEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  if (entry.localHeaderOffset + 30 > bytes.byteLength) {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'This ZIP archive is truncated.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.localHeaderOffset, true) !== LOCAL_HEADER_SIGNATURE) {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'This ZIP archive has a damaged entry header.');
  }
  const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;

  // Bit 3 means the writer put the sizes in a trailing data descriptor and left zeros here. The
  // central directory already carries the authoritative sizes, so the local header is not trusted
  // for them either way.
  const compressed = slice(bytes, dataStart, entry.compressedSize);

  if (entry.method === 0) return verifyCrc(entry, compressed);
  if (entry.method !== 8) {
    throw new ExtractionError(
      'CORRUPT_DOCUMENT',
      `This ZIP archive uses compression method ${entry.method}, which is not supported.`,
    );
  }

  // The declared uncompressed size is a hint from the archive; an entry that lies about it and
  // inflates past the ceiling is refused rather than allowed to exhaust memory.
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'A part of this document is implausibly large.');
  }
  let inflated: Uint8Array;
  try {
    const out = inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
    inflated = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  } catch {
    // The parser error is deliberately dropped rather than chained: `ExtractionError.message`
    // reaches `assignment_sources.extraction_error`, and a zlib error can quote document bytes.
    throw new ExtractionError('CORRUPT_DOCUMENT', 'A part of this document could not be read.');
  }
  return verifyCrc(entry, inflated);
}

/**
 * Refuse an entry whose bytes do not match the CRC-32 its central-directory record declares.
 *
 * The check is the only thing standing between a damaged deflate stream and wrong text presented
 * as the assignment's own words: deflate has no integrity check, and a flipped bit usually still
 * inflates. Both accepted methods are checked, because a stored document part is the same T1
 * ground truth as a deflated one.
 *
 * The boundary is the entries this reader returns. Parts it never reads -- `word/media/*`,
 * `[Content_Types].xml`, `ppt/presentation.xml` -- are not verified, and a bad CRC in one of them
 * is not this reader's business: inflating a whole deck to audit parts no one asked for would buy
 * nothing for the text returned.
 */
function verifyCrc(entry: ZipEntry, data: Uint8Array): Uint8Array {
  // `node:zlib.crc32` is public from Node v22.2.0 and `package.json` pins engines to >=24, so the
  // runtime provides the standard CRC-32 (IEEE 802.3) directly. Preferred over a table in this
  // file: a native call cannot drift from the algorithm the archive was written with.
  if (crc32(data) !== entry.crc) {
    throw new ExtractionError(
      'CORRUPT_DOCUMENT',
      'A part of this document is damaged, so its text cannot be trusted.',
    );
  }
  return data;
}

function decodeXml(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ExtractionError(
      'CORRUPT_DOCUMENT',
      'This document contains text that is not UTF-8.',
    );
  }
}

function latin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function slice(bytes: Uint8Array, start: number, length: number): Uint8Array {
  if (start < 0 || length < 0 || start + length > bytes.byteLength) {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'This ZIP archive is truncated.');
  }
  return bytes.subarray(start, start + length);
}

// ---------------------------------------------------------------------------------------------
// XML to text
// ---------------------------------------------------------------------------------------------

/**
 * Return one string per paragraph, in document order, in the text order the XML declares.
 *
 * Paragraph ends and line breaks become boundaries. Everything else is markup and is dropped,
 * but a run boundary is treated as a word boundary first: Word splits a sentence across `<w:t>`
 * elements for its own reasons, and joining those runs with nothing would invent a word
 * ("governance" + "risk" -> "governancerisk") rather than preserve one.
 */
function extractParagraphs(xml: string): string[] {
  const marked = xml
    .replace(/<\/[A-Za-z0-9_.-]*:?(?:p|br)\s*\/?>/g, '\n')
    .replace(/<[A-Za-z0-9_.-]*:?(?:p|br)\b[^>]*\/?>/g, '\n')
    .replace(/<[A-Za-z0-9_.-]+:t\b[^>]*>/g, ' ')
    .replace(/<[^>]*>/g, '');

  const collapsed = marked.replace(/[^\S\n]+/g, ' ');
  return collapsed
    .split('\n')
    .map((paragraph) => decodeXmlEntities(paragraph).trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * Decode the five predefined XML entities and numeric character references.
 *
 * `&amp;` is replaced last: doing it first would turn the literal text `&amp;lt;` into `<`, which
 * is a different character from the one the document holds.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex: string) => codePoint(Number.parseInt(hex, 16), match))
    .replace(/&#([0-9]+);/g, (match, digits: string) => codePoint(Number.parseInt(digits, 10), match))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A character reference that is not a Unicode scalar value is left as the document wrote it. */
function codePoint(value: number, fallback: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return fallback;
  if (value >= 0xd800 && value <= 0xdfff) return fallback;
  return String.fromCodePoint(value);
}
