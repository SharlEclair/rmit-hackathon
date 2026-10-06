'use client';

import { useState } from 'react';

interface PdfViewerProps {
  assignmentId: string;
  sourceId: string;
  filename: string;
  pageCount?: number;
  extractedTextFallback?: string;
}

export function PdfViewer({
  assignmentId,
  sourceId,
  filename,
  pageCount,
  extractedTextFallback,
}: PdfViewerProps) {
  const [viewMode, setViewMode] = useState<'pdf' | 'text'>('pdf');
  const [pdfLoadError, setPdfLoadError] = useState(false);

  const rawUrl = `/api/student/assignments/${assignmentId}/sources/${sourceId}/raw`;

  return (
    <div className="flex flex-col gap-3">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text truncate max-w-xs">{filename}</span>
          {pageCount && (
            <span className="rounded bg-bg px-2 py-0.5 text-text-muted border border-border">
              {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </span>
          )}
          <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/20">
            Source of Truth (Authoritative)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-bg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                viewMode === 'pdf' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text'
              }`}
            >
              PDF View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('text')}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                viewMode === 'text' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text'
              }`}
            >
              Extracted Text
            </button>
          </div>

          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-border bg-surface px-2.5 py-1 text-text-muted hover:text-text transition-colors"
            title="Open PDF in new tab"
          >
            ↗ Open Tab
          </a>
        </div>
      </div>

      {/* Main Document Content */}
      {viewMode === 'pdf' && !pdfLoadError ? (
        <div className="relative w-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <iframe
            src={`${rawUrl}#toolbar=1&navpanes=0`}
            className="w-full h-[700px] rounded-xl border-none"
            title={`PDF Brief: ${filename}`}
            onError={() => setPdfLoadError(true)}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          {pdfLoadError && (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              Unable to preview PDF directly in your browser. Showing extracted text below, or you can{' '}
              <a href={rawUrl} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                open the PDF in a new tab
              </a>
              .
            </div>
          )}
          <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text">
            {extractedTextFallback || 'No extracted text available for this document.'}
          </div>
        </div>
      )}

      {/* Authority Notice */}
      <p className="text-xs text-text-muted">
        Note: This official brief document is the single source of truth. All navigation maps and checklists below are AI-generated assistive aids.
      </p>
    </div>
  );
}
