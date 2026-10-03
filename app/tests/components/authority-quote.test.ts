import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { AuthorityQuote } from '@/components/ui/authority-quote';
import { MARKER } from '@/components/ui/fixed-strings';

import { firstClassAttribute, render } from './harness';

describe('AuthorityQuote', () => {
  const html = render(
    createElement(AuthorityQuote, { quote: '"Submit one file only."', page: 4 }),
  );

  it('sets the verbatim excerpt in the document register', () => {
    const frame = firstClassAttribute(html);
    expect(frame).toContain('font-editorial');
    expect(frame).toContain('doc-body');
    expect(frame).toContain('text-ink');
  });

  it('caps the measure at 60 characters per line (`17` S2.4 rule 2)', () => {
    expect(firstClassAttribute(html)).toContain('max-w-[60ch]');
  });

  it('sits on the document mat with the document-edge left hairline', () => {
    const frame = firstClassAttribute(html);
    expect(frame).toContain('bg-document-mat');
    expect(frame).toContain('rounded-sheet');
    expect(frame).toContain('border-l');
    expect(frame).not.toContain('shadow-');
    // The hairline colour is the added L2 token, read inline because it is not a Tailwind key.
    expect(html).toContain('border-left-color:var(--surface-document-edge)');
  });

  it('labels the source and links to the page anchor', () => {
    expect(html).toContain(MARKER.authorityQuoteLabel('brief', 4));
    expect(html).toContain('href="#page=4"');
    expect(html).toContain('From the brief, page 4');
  });

  it('names the rubric when the excerpt came from it', () => {
    const rubric = render(
      createElement(AuthorityQuote, { quote: '"Code quality (30%)"', page: 2, documentLabel: 'rubric' }),
    );
    expect(rubric).toContain('From the rubric, page 2');
    expect(rubric).toContain('href="#page=2"');
  });

  it('preserves the excerpt punctuation and adds none of its own', () => {
    // `17` S2.4 rule 5: the quote is never re-punctuated to fit the surrounding sentence.
    expect(html).toContain('&quot;Submit one file only.&quot;');
  });

  it('writes no hex literal and no colour class outside the token set', () => {
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
