/**
 * PDF text-layer extraction -- stage S3 of the ingestion pipeline (`04` S7).
 *
 * The reader is `pdfjs-dist@6.3.289`, the pin in `04` S2.2, imported through the legacy build
 * because that is the specifier `scripts/seed.ts` already uses under this toolchain. The bytes
 * are handed to `getDocument` rather than a path so the result does not depend on the working
 * directory or on URL escaping (the same reason `seed.ts` does it).
 *
 * Text is taken **verbatim** (C2, `06` S7.2.3): one text item per printed line, joined by the
 * line break the extractor implies between them. No Unicode normalisation, no whitespace
 * collapsing and no de-hyphenation happens here -- those are S4 and they are not this module's
 * to perform. In particular this module does not stitch a sentence the document wrapped across
 * two lines, because that would silently change the bytes the tutor's citation claims to quote.
 *
 * A PDF whose text layer is empty is **not** an error: it is a scanned document. `04` S7 stage S3
 * requires it be flagged for tutor attention rather than guessed at, and `04` S13 open item 2
 * leaves the follow-up to the pipeline, so the flag is `hasTextLayer: false` and nothing more.
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { ExtractionError, type ExtractedPage, type ExtractionResult } from './types';

/**
 * Read the text layer of one PDF.
 *
 * Throws `CORRUPT_DOCUMENT` -- worded for a tutor, never carrying a parser stack -- when the
 * bytes cannot be parsed as a PDF at all.
 */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  if (bytes.length === 0) {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'The PDF is empty and cannot be read.');
  }

  const loadingTask = getDocument({ data: bytes });
  try {
    const document = await loadingTask.promise;
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      // `items` mixes text items with marked-content markers, which carry no string. The guard
      // is the same one `scripts/seed.ts` uses, so the fixture is read identically by the seeder
      // and by the pipeline that replaces it.
      pages.push({
        page: pageNumber,
        text: content.items.map((item) => ('str' in item ? item.str : '')).join('\n'),
      });
    }

    return buildResult(pages);
  } catch {
    throw new ExtractionError('CORRUPT_DOCUMENT', 'This file could not be read as a PDF.');
  } finally {
    // The loading task owns a worker; an awaited run that leaks one keeps the process alive.
    await loadingTask.destroy();
  }
}

function buildResult(pages: readonly ExtractedPage[]): ExtractionResult {
  const text = pages.map((page) => page.text).join('\n');
  let nonWhitespace = 0;
  for (const page of pages) {
    nonWhitespace += page.text.replace(/\s/g, '').length;
  }
  return {
    format: 'pdf',
    pageCount: pages.length,
    pages,
    text,
    hasTextLayer: nonWhitespace > 0,
    charCount: text.length,
  };
}
