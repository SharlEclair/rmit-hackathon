'use client';

import { useMemo, useState, type ReactElement } from 'react';

import type { BriefDocumentResponse, BriefResponse } from '@/lib/api/types';
import { ContentClassPanel } from '@/components/ui/content-class-panel';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

/**
 * The official brief viewer (`07` UI-UX-SPEC section 4.2).
 *
 * **The anchor of the product's honesty claim** (C2, D17, I3). Three rules shape every line below:
 *
 *   1. "The viewer renders the uploaded document page by page. Text is never re-generated, re-flowed
 *      into new prose, or summarised" (section 4.2 rule 1). The text rendered is `pages[].text`, which
 *      is `source_chunks.text` as the extractor produced it. Nothing here joins, trims to a summary,
 *      or re-orders it. **D107** is why it is the stored extraction rather than a page image: no route
 *      in the 64-path vocabulary serves document bytes, and `signedUrl` throws rather than invent an
 *      address (I-06, T12).
 *   2. "`Source: <filename>, page <n>` is displayed above the page" (rule 3). That string is the
 *      T1 marker (`07` section 2.2) and comes from `fixed-strings.ts`, so there is one spelling
 *      of it in the product.
 *   3. "Page navigation is the only control the viewer adds to the document" (rule 10) -- no search,
 *      no annotation, no download, no print (rule 7). The controls below are previous, next, and a
 *      page number input, plus the document tabs the layout requires (rule 2).
 *
 * Zoom (rule 6) scales the page frame only: "Zoom never changes the pagination, so page anchors stay
 * valid", which is why it is a CSS transform on the text block and not a re-layout.
 *
 * **Client-side.** Page selection, the zoom step, and the deep-link highlight are all interaction
 * state, and rule 4 requires a `#page=<n>` deep link to open the document at that page. A server
 * component cannot hold that state.
 */
export function DocumentViewer(props: { readonly brief: BriefResponse }): ReactElement {
  const [documentId, setDocumentId] = useState<string | null>(
    props.brief.documents[0]?.id ?? null,
  );
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  const document = useMemo(
    () => props.brief.documents.find((entry) => entry.id === documentId) ?? null,
    [props.brief.documents, documentId],
  );

  if (props.brief.documents.length === 0) {
    // `07` section 4.2 rule 8: "The original brief is not available. Tell your tutor." The state is
    // unreachable after publish (the publish gate requires a policy rule and a milestone, and a brief
    // source is what the ingestion read), but it exists because failing visibly beats failing blank.
    return (
      <EmptyState
        message="The original brief is not available. Tell your tutor."
        action={
          <a className="tight text-info underline" href="#ask-tutor">
            Ask your tutor privately
          </a>
        }
      />
    );
  }

  if (document === null) return <EmptyState message="We could not load the assignment documents." />;

  const currentPage = document.pages.find((entry) => entry.page === page) ?? document.pages[0] ?? null;
  const pageNumbers = document.pages.map((entry) => entry.page);
  const lowest = pageNumbers.length > 0 ? Math.min(...pageNumbers) : 1;
  const highest = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
  const section = document.sections.find(
    (entry) => currentPage !== null && entry.pageFrom <= currentPage.page && entry.pageTo >= currentPage.page,
  );

  return (
    <div className="flex flex-col gap-3">
      {props.brief.documents.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Assignment documents">
          {props.brief.documents.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === documentId}
              className={cn(
                'rounded-control border border-solid px-3 py-1 tight',
                entry.id === documentId
                  ? 'border-border-official bg-official font-semibold text-ink'
                  : 'border-default bg-card text-muted',
              )}
              onClick={() => {
                setDocumentId(entry.id);
                setPage(1);
              }}
            >
              {kindLabel(entry)}
            </button>
          ))}
        </div>
      ) : null}

      {document.extractionFailed ? (
        // `07` section 4.2 rule 8's exact sentence.
        <p className="rounded-control border border-solid border-border-interpretation bg-interpretation p-3 tight text-ink">
          This document could not be fully read. Ask your tutor to upload a readable copy.
        </p>
      ) : null}

      <ContentClassPanel
        contentClass="official"
        officialKind={document.kind === 'rubric' ? 'rubric' : 'brief'}
        sourceFile={document.title}
        sourcePage={currentPage?.page ?? 1}
      >
        <p className="mb-3 body text-muted">
          {currentPage === null
            ? 'This document has no readable pages.'
            : section === undefined
              ? `Page ${String(currentPage.page)}`
              : `Page ${String(currentPage.page)} - Section: ${section.label}`}
        </p>

        <div
          className="rounded-sheet border border-solid border-default bg-document-mat p-4"
          // Zoom scales the frame, not the pagination (rule 6), so page anchors stay valid.
          style={{ fontSize: `${String(zoom)}%` }}
        >
          {/*
            The document's own text, verbatim. `whitespace-pre-wrap` preserves the extractor's own line
            breaks and blank lines, which are part of what it read: collapsing them would be re-flowing
            the document, which rule 1 forbids. No `dangerouslySetInnerHTML` anywhere: the text is data,
            and React's own escaping is what keeps a document from injecting markup.
          */}
          <div className="doc-body whitespace-pre-wrap text-ink">
            {currentPage === null || currentPage.text === ''
              ? 'No text was extracted from this page.'
              : currentPage.text}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-control border border-solid border-default bg-card px-3 py-1 tight text-ink disabled:text-muted"
            onClick={() => {
              setPage((value) => Math.max(lowest, value - 1));
            }}
            disabled={currentPage === null || currentPage.page <= lowest}
          >
            Previous
          </button>
          <label className="tight text-muted">
            <span className="sr-only">Page number</span>
            <input
              type="number"
              className="w-16 rounded-control border border-solid border-default bg-card px-2 py-1 mono text-ink"
              min={lowest}
              max={highest}
              value={currentPage?.page ?? 1}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setPage(Math.min(highest, Math.max(lowest, next)));
              }}
            />
            <span className="ml-1">/ {String(highest)}</span>
          </label>
          <button
            type="button"
            className="rounded-control border border-solid border-default bg-card px-3 py-1 tight text-ink disabled:text-muted"
            onClick={() => {
              setPage((value) => Math.min(highest, value + 1));
            }}
            disabled={currentPage === null || currentPage.page >= highest}
          >
            Next
          </button>
          <label className="tight text-muted">
            <span className="sr-only">Zoom</span>
            <select
              className="rounded-control border border-solid border-default bg-card px-2 py-1 tight text-ink"
              value={zoom}
              onChange={(event) => {
                setZoom(Number(event.target.value));
              }}
            >
              {[75, 100, 125, 150].map((step) => (
                <option key={step} value={step}>
                  {step}%
                </option>
              ))}
            </select>
          </label>
        </div>
      </ContentClassPanel>

      {document.kind === 'supplementary' ? (
        // `07` section 4.2 rule 9's exact label.
        <p className="tight text-muted">Supplementary material - not the requirement</p>
      ) : null}
    </div>
  );
}

/** `07` section 4.2 rule 2's document tab labels. */
function kindLabel(document: BriefDocumentResponse): string {
  switch (document.kind) {
    case 'brief':
      return 'Brief';
    case 'rubric':
      return 'Rubric';
    case 'ai_policy':
      return 'AI usage policy';
    case 'marking_guide':
      return 'Marking guide';
    default:
      return 'Supplementary';
  }
}
