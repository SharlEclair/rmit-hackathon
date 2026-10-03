#!/usr/bin/env node
/**
 * make-guardrail-fixtures.mjs -- deterministic generator for the WP-08 upload fixtures.
 *
 * Writes six real attachments plus a hash manifest to `docs/fixtures/attachments/`:
 *
 *   code-failing.png     schematic of a failing code screenshot  -> UP1
 *   brief-page-3.png     schematic of a brief page               -> UP2
 *   shared-solution.pdf  a text-layer PDF of a classmate's work  -> UP3
 *   blurred-notes.png    an unreadable image                     -> UP4
 *   lecture.mp3          a placeholder MP3 container             -> UP5 (picker)
 *   screen-capture.mp4   a placeholder MP4 container             -> UP5 (picker)
 *   manifest.json        per-file sha256, mime type and the recorded UP classification
 *
 * Run from the repository root or from app/:
 *
 *   node app/scripts/make-guardrail-fixtures.mjs
 *   node scripts/make-guardrail-fixtures.mjs
 *
 * Determinism rules (requirements, not style, matching make-fixtures.mjs):
 *   - no Date, no Math.random, no locale-dependent formatting
 *   - a fixed PRNG (xorshift32) with one fixed seed for the blurred image
 *   - Node built-ins only: zlib for the PNG IDAT stream, crypto for the manifest hashes
 *
 * WHAT THESE FILES ARE, AND WHAT THEY ARE NOT (read before trusting the golden set):
 *   The PNGs are **schematic** depictions -- dark code areas, document text bars, a low-contrast
 *   smear -- not photographs, and they contain no rendered glyphs. Their classification in
 *   `manifest.json` is therefore a *recorded* UP code, not a vision model's verdict. The guardrail
 *   harness reads each real file, verifies its sha256 against the manifest, and asserts the
 *   recorded code, which is what makes the modality cases execute rather than skip (05 S11.5).
 *   The live vision/PDF classification of these files is Phase 2's extractor and is NOT verified
 *   here; `05-ISSUES.md` I-30 records that boundary.
 *
 * WHY `.gitattributes` MATTERS HERE: trap T20. A `.png`, `.pdf`, `.mp3` or `.mp4` committed
 * without a `binary` attribute is rewritten by `core.autocrlf` on the way into the object store,
 * and the corruption is invisible in a working tree. All four extensions are already pinned in
 * `.gitattributes`; verify with a fresh clone, never with a working-file hash.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, '..');
const REPO_ROOT = resolve(APP_DIR, '..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'fixtures', 'attachments');

// ===========================================================================
// PART 1 -- a minimal PNG writer (truecolour, no interlace, filter 0)
// ===========================================================================

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * `pixel(x, y)` returns `[r, g, b]`. Truecolour, 8 bits per channel: enough for the schematic
 * shapes these fixtures need, and small enough that the generator stays auditable by hand.
 */
function makePng(width, height, pixel) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter type: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[offset] = r & 0xff;
      raw[offset + 1] = g & 0xff;
      raw[offset + 2] = b & 0xff;
      offset += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Fixed PRNG for the "blurred" image: xorshift32, seeded in code so the bytes never move.
function xorshift32(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

/** Dark editor background with light code bars, and a red band where the error is. */
function codeFailingPng() {
  const width = 480;
  const height = 260;
  const background = [30, 30, 46];
  const codeBar = [205, 214, 244];
  const errorBar = [243, 139, 168];
  const gutter = [69, 71, 90];
  return makePng(width, height, (x, y) => {
    if (x < 34) return gutter;
    const row = Math.floor((y - 18) / 18);
    if (y < 12 || row < 0 || row > 11) return background;
    const inRow = y - (18 + row * 18);
    if (inRow > 6) return background;
    const shortLine = row % 4 === 3;
    const lineWidth = 60 + ((row * 37) % 250) - (shortLine ? 40 : 0);
    if (x < 44 || x > 44 + lineWidth) return background;
    return row >= 9 ? errorBar : codeBar;
  });
}

/** A white document page: a heading bar and even text bars, like a page of the brief. */
function briefPagePng() {
  const width = 420;
  const height = 560;
  const paper = [252, 252, 250];
  const ink = [60, 62, 72];
  const heading = [30, 32, 44];
  return makePng(width, height, (x, y) => {
    if (x < 28 || x > width - 28 || y < 28 || y > height - 28) return [225, 227, 232];
    if (y < 40 || y > height - 40) return paper;
    if (y >= 46 && y <= 58 && x < 240) return heading;
    const row = Math.floor((y - 76) / 16);
    if (row < 0 || row > 26) return paper;
    const inRow = y - (76 + row * 16);
    if (inRow > 7) return paper;
    const lineWidth = 300 - ((row * 53) % 90);
    return x < 44 + lineWidth ? ink : paper;
  });
}

/** A low-contrast smear: illegible on purpose, which is exactly what `UP4` means. */
function blurredNotesPng() {
  const width = 320;
  const height = 240;
  const random = xorshift32(0x5eed1234);
  const noise = new Uint8Array(width * height);
  for (let i = 0; i < noise.length; i += 1) noise[i] = random() % 24;
  return makePng(width, height, (x, y) => {
    const base = 150 + Math.round(40 * (y / height)) + noise[y * width + x] - 12;
    const smear = x > 70 && x < 250 && y % 30 < 14 ? 12 : 0;
    const value = Math.max(0, Math.min(255, base + smear));
    return [value, value, value + 4];
  });
}

// ===========================================================================
// PART 2 -- a minimal uncompressed text-layer PDF (single page)
// ===========================================================================

const PDF_WIDTH = 595;
const PDF_HEIGHT = 842;

function pdfEscape(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '(') out += '\\(';
    else if (ch === ')') out += '\\)';
    else if (code >= 32 && code <= 126) out += ch;
    else out += '?';
  }
  return out;
}

/** Build a one-page PDF with an uncompressed content stream, so the text layer stays readable. */
function makePdf(lines) {
  const content = [
    'BT',
    '/F1 11 Tf',
    '14 TL',
    `64 ${PDF_HEIGHT - 90} Td`,
    ...lines.map((line) => `(${pdfEscape(line)}) Tj T*`),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ===========================================================================
// PART 3 -- placeholder MP3 and MP4 containers
// ===========================================================================

/** Eight MPEG-1 Layer III frame headers at 128 kbps / 44.1 kHz, each padded to 417 bytes. */
function makeMp3() {
  const frame = Buffer.alloc(417);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  frame[3] = 0x00;
  const frames = Buffer.concat(Array.from({ length: 8 }, () => frame));
  const id3 = Buffer.concat([
    Buffer.from('ID3', 'ascii'),
    Buffer.from([0x04, 0x00, 0x00]), // version 2.4, no flags
    Buffer.from([0x00, 0x00, 0x00, 0x10]), // synchsafe size: 16 bytes
    Buffer.alloc(16),
  ]);
  return Buffer.concat([id3, frames]);
}

function box(type, payload) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + payload.length, 0);
  return Buffer.concat([size, Buffer.from(type, 'ascii'), payload]);
}

/** A structurally valid ISO-BMFF header (`ftyp` + `free` + `mdat`). Enough for a picker test. */
function makeMp4() {
  const ftyp = box(
    'ftyp',
    Buffer.concat([
      Buffer.from('isom', 'ascii'),
      Buffer.from([0x00, 0x00, 0x02, 0x00]),
      Buffer.from('isomiso2mp41', 'ascii'),
    ]),
  );
  const free = box('free', Buffer.alloc(8));
  const mdat = box('mdat', Buffer.alloc(1024));
  return Buffer.concat([ftyp, free, mdat]);
}

// ===========================================================================
// PART 4 -- write the files and the manifest
// ===========================================================================

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

const SHARED_SOLUTION_LINES = [
  'Classmate solution -- do not share. Synthetic fixture, not real student work.',
  '',
  'Part B design rationale: I chose a queue because the brief mentions load.',
  'The endpoint validates three fields and returns a JSON error envelope.',
  'Test evidence: the happy path returns 201 with a generated identifier.',
  'The analysis argues that stakeholder priority follows decision impact.',
];

const FILES = [
  {
    fileName: 'code-failing.png',
    mimeType: 'image/png',
    bytes: codeFailingPng(),
    classification: 'UP1',
    confidence: 0.94,
    text: null,
    describes: 'schematic of a failing code screenshot',
  },
  {
    fileName: 'brief-page-3.png',
    mimeType: 'image/png',
    bytes: briefPagePng(),
    classification: 'UP2',
    confidence: 0.91,
    text: 'The report must not exceed 2500 words. The word count excludes the reference list. Requirement 4 covers the API endpoint.',
    describes: 'schematic of page 3 of the brief',
  },
  {
    fileName: 'shared-solution.pdf',
    mimeType: 'application/pdf',
    bytes: makePdf(SHARED_SOLUTION_LINES),
    classification: 'UP3',
    confidence: 0.89,
    text: SHARED_SOLUTION_LINES.join('\n'),
    describes: "a classmate's completed solution as a text-layer PDF",
  },
  {
    fileName: 'blurred-notes.png',
    mimeType: 'image/png',
    bytes: blurredNotesPng(),
    classification: 'UP4',
    confidence: 0.22,
    text: null,
    describes: 'an unreadable, low-contrast image',
  },
  {
    fileName: 'lecture.mp3',
    mimeType: 'audio/mpeg',
    bytes: makeMp3(),
    classification: 'UP5',
    confidence: 1,
    text: null,
    describes: 'placeholder MP3 container; audio is out of MVP scope (O11)',
  },
  {
    fileName: 'screen-capture.mp4',
    mimeType: 'video/mp4',
    bytes: makeMp4(),
    classification: 'UP5',
    confidence: 1,
    text: null,
    describes: 'placeholder MP4 container; video is out of MVP scope (O11)',
  },
];

mkdirSync(OUT_DIR, { recursive: true });

const manifestEntries = [];
for (const file of FILES) {
  writeFileSync(join(OUT_DIR, file.fileName), file.bytes);
  manifestEntries.push({
    fileName: file.fileName,
    mimeType: file.mimeType,
    byteLength: file.bytes.length,
    sha256: sha256(file.bytes),
    classification: file.classification,
    confidence: file.confidence,
    text: file.text,
    describes: file.describes,
  });
}

const manifest = {
  generatedBy: 'app/scripts/make-guardrail-fixtures.mjs',
  note: 'Recorded UP classifications for the WP-08 upload fixtures. The harness reads each real file, verifies its sha256 against this manifest, and asserts the code. The classifications are recorded, not produced by a live vision model; see 05-ISSUES.md I-30.',
  attachments: manifestEntries,
};
writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

for (const entry of manifestEntries) {
  console.log(`${entry.fileName}  ${String(entry.byteLength).padStart(7)} bytes  ${entry.classification}  ${entry.sha256.slice(0, 16)}`);
}
console.log(`wrote ${manifestEntries.length} attachments + manifest.json to ${OUT_DIR}`);
