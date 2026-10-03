/**
 * Plain-text and Markdown extraction -- stage S3 of the ingestion pipeline (`04` S7).
 *
 * These two MIME types reach the same place as a PDF text layer: both are T1 material whose text
 * is already text (`06` S7.2.2, the note added by D80). `docs/fixtures/demo-ai-policy.md` is the
 * committed example, and it is ingested through this module.
 *
 * Text is taken **verbatim** (C2, `06` S7.2.3). Markdown syntax is left in place: the fixture is a
 * Markdown document, its headings and lists are part of what it says, and stripping them here
 * would rewrite T1 text before S4 or the chunker could see it. Unicode is not normalised -- a
 * combining sequence stays a combining sequence.
 *
 * The decoder is fatal, so a file that is not valid UTF-8 is refused instead of being silently
 * read through replacement characters, which would put U+FFFD into a citation the tutor is
 * supposed to be able to trust.
 */

import {
  ExtractionError,
  MARKDOWN_MIME,
  TEXT_MIME,
  type ExtractionResult,
} from './types';

/**
 * Extract a UTF-8 text or Markdown document.
 *
 * Throws `UNSUPPORTED_FORMAT` when asked for a MIME type this module does not own -- the router
 * is expected to have dispatched already, and a guard here means a dispatch bug surfaces as a
 * labelled error rather than as a document read with the wrong decoder.
 */
export function extractPlainText(bytes: Uint8Array, mimeType: string): ExtractionResult {
  const isMarkdown = mimeType === MARKDOWN_MIME;
  if (!isMarkdown && mimeType !== TEXT_MIME) {
    throw new ExtractionError(
      'UNSUPPORTED_FORMAT',
      'This extractor reads text/plain and text/markdown documents only.',
    );
  }

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ExtractionError(
      'CORRUPT_DOCUMENT',
      'This file is not valid UTF-8 text and cannot be read.',
    );
  }

  // A byte-order mark is a transport artefact, not the document's first character; leaving it in
  // would make the first chunk's text differ from the file's visible first character.
  const text = decoded.startsWith('\uFEFF') ? decoded.slice(1) : decoded;

  return {
    format: isMarkdown ? 'markdown' : 'text',
    // No page anchors: a text file has no pages for a viewer to deep-link to (D43), so the whole
    // document is one part. `pageCount` stays null rather than 1, because `06` S7.2.2's page
    // count is about pages a viewer can navigate to, and a text file has none.
    pageCount: null,
    pages: [{ page: 1, text }],
    text,
    // A file that decoded at all has a text layer by definition. An empty file is a different
    // finding, and it belongs to the pipeline that knows the requirement set, not here.
    hasTextLayer: true,
    charCount: text.length,
  };
}
