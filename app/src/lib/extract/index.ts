/**
 * The extraction entry point -- stage S3 of the ingestion pipeline (`04` S7).
 *
 * One function, one decision: which reader a declared MIME type gets. The declared type is what
 * `assignment_sources.mime_type` stores, and matching S1 (`04` S7) has already checked it against
 * the bytes and refused a mismatch, so this module does not re-sniff content. Anything outside the
 * set below is refused with `UNSUPPORTED_FORMAT`; `06` S7.2.2 requires an unsupported type to be
 * refused at upload rather than silently converted, and the same refusal must not become a silent
 * fallback deeper in.
 *
 * **Images are deliberately absent.** `04` S7 stage S3 sends an image to vision transcription
 * through the provider adapter, and `04` S9.2 step 12 keeps student uploads on a separate path
 * (`attachment_extraction`). Neither is a text-layer read, so neither belongs here -- and nothing
 * in this module imports the adapter, opens a socket, or reads a configuration value (C8).
 *
 * `EMPTY_DOCUMENT` is defined in `types.ts` and deliberately not raised here. Returning "the
 * extractor found no text" is a fact, and `hasTextLayer: false` states it without guessing: `04`
 * S7 stage S3 and `04` S13 open item 2 require a scanned PDF to be flagged for tutor attention,
 * and the decision to mark it and skip chunking belongs to the pipeline.
 */

import { extractOoxml } from './ooxml';
import { extractPdf } from './pdf';
import { extractPlainText } from './plain';
import {
  DOCX_MIME,
  ExtractionError,
  MARKDOWN_MIME,
  PDF_MIME,
  PPTX_MIME,
  TEXT_MIME,
  type ExtractionResult,
} from './types';

export {
  DOCX_MIME,
  ExtractionError,
  MARKDOWN_MIME,
  PDF_MIME,
  PPTX_MIME,
  TEXT_MIME,
  type ExtractedPage,
  type ExtractionErrorCode,
  type ExtractionFormat,
  type ExtractionResult,
} from './types';

/**
 * Extract the text of one document, verbatim.
 *
 * The result is what S4 receives: text that has not been normalised, re-flowed or re-worded
 * (C2, `06` S7.2.3), plus the page anchors the viewer deep-links to (`04` D43).
 */
export async function extractDocument(input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<ExtractionResult> {
  const { bytes, mimeType } = input;

  switch (mimeType) {
    case PDF_MIME:
      return extractPdf(bytes);
    case DOCX_MIME:
    case PPTX_MIME:
      return extractOoxml(bytes, mimeType);
    case TEXT_MIME:
    case MARKDOWN_MIME:
      return extractPlainText(bytes, mimeType);
    default:
      throw new ExtractionError(
        'UNSUPPORTED_FORMAT',
        `"${mimeType}" is not an accepted upload type.`,
      );
  }
}
