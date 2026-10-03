/**
 * The extraction layer's contract: what stage S3 hands stage S4, and how it fails.
 *
 * Owned by `04` S3 (Extract) and `04` S7 (the ingestion table), with the stored shape of the
 * result fixed by `06` S7.2.2 (`assignment_sources.page_count` is nullable) and `06` S7.2.3
 * (`source_chunks.text` is "verbatim extract, never rewritten").
 *
 * The constraint this module exists to hold is **C2**: the original document is the source of
 * truth, so what a reader returns is carried through unaltered. Nothing here normalises
 * Unicode, collapses whitespace, de-hyphenates a line-break split, or reflows a paragraph --
 * that is stage S4 in `04` S7, owned by the ingestion pipeline. A "helpful" tidy-up here would
 * rewrite T1 text before any stage is able to tell that it had been rewritten.
 */

/** The one alphabet this module knows how to name. Images take a different path entirely. */
export type ExtractionFormat = 'pdf' | 'docx' | 'pptx' | 'text' | 'markdown';

/**
 * MIME types the router dispatches on.
 *
 * Declared here rather than in `index.ts` so that a format module can name its own MIME type
 * without importing the dispatcher and creating an import cycle.
 */
export const PDF_MIME = 'application/pdf';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const TEXT_MIME = 'text/plain';
export const MARKDOWN_MIME = 'text/markdown';

/** One page of extracted text, 1-based, exactly as the reader returned it. */
export interface ExtractedPage {
  readonly page: number; // 1-based
  readonly text: string; // the extractor's own output; never rewritten
}

export interface ExtractionResult {
  readonly format: ExtractionFormat;
  /** `null` when the format has no pages: `06` S7.2.2 permits it, and only PDF has page anchors. */
  readonly pageCount: number | null;
  readonly pages: readonly ExtractedPage[];
  /** The pages joined in order, verbatim. */
  readonly text: string;
  /**
   * `false` for a PDF whose text layer is empty.
   *
   * `04` S7 stage S3 and `04` S13 open item 2: a scanned PDF is flagged for tutor attention
   * rather than guessed at. This flag only reports what the extractor found; the decision to
   * mark the document `needs_tutor_attention` and skip chunking belongs to the pipeline.
   */
  readonly hasTextLayer: boolean;
  readonly charCount: number;
}

export type ExtractionErrorCode = 'UNSUPPORTED_FORMAT' | 'CORRUPT_DOCUMENT' | 'EMPTY_DOCUMENT';

/**
 * A failure the ingestion pipeline is expected to handle: it maps to
 * `assignment_sources.extraction_error` (`06` S7.2.2), which is a message safe to show a tutor
 * and never a stack trace. So `message` is authored here, and the original parser error is
 * deliberately not attached -- a pdf.js or zlib stack trace can quote document bytes.
 */
export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;

  constructor(code: ExtractionErrorCode, message: string) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
    // Survives a downlevel class transform, so `instanceof` is reliable for callers that only
    // see the thrown value.
    Object.setPrototypeOf(this, ExtractionError.prototype);
  }
}
