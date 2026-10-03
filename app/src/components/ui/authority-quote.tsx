import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

import { MARKER } from './fixed-strings';

export interface AuthorityQuoteProps {
  /**
   * The verbatim T1 excerpt. The source's own punctuation is preserved and the quote is never
   * re-punctuated to fit the surrounding sentence (`17` S2.4 rule 5), so no quotation marks are
   * added here either: they belong to the excerpt, not to the wrapper.
   */
  quote: string;
  page: number;
  /** Which T1 document the excerpt came from. The default label is `From the brief, page <n>`. */
  documentLabel?: 'brief' | 'rubric';
  className?: string;
}

/**
 * The one place `font-editorial` appears inside a T5 component (`17` S12 G10, S5.2).
 *
 * It exists to show where the T1 quote starts and the T5 panel resumes (`07` S2.2 rule 3), so
 * it keeps the document's own register: `doc-body` serif, a 60-character measure
 * (`17` S2.4 rule 2), the `--surface-document-mat` substrate and a left hairline.
 *
 * The hairline colour is read from the token inline because `--surface-document-edge` is one of
 * the four added L2 tokens of `17` S3.3 and is not wired as a Tailwind colour key in
 * `app/tailwind.config.ts`; reading the token directly is the only route that neither invents a
 * hex literal (`17` S6.1 rule 2) nor substitutes a different token.
 */
export function AuthorityQuote(props: AuthorityQuoteProps): ReactElement {
  const documentLabel = props.documentLabel ?? 'brief';

  return (
    <blockquote
      className={cn(
        'max-w-[60ch] rounded-sheet border-l border-solid bg-document-mat py-2 pl-3 font-editorial doc-body text-ink',
        props.className,
      )}
      style={{ borderLeftColor: 'var(--surface-document-edge)' }}
    >
      <p>{props.quote}</p>
      <a className="mono mt-2 block text-muted" href={`#page=${props.page}`}>
        {MARKER.authorityQuoteLabel(documentLabel, props.page)}
      </a>
    </blockquote>
  );
}
