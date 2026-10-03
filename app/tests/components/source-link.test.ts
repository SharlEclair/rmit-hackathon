import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { SourceLink } from '@/components/ui/source-link';
import { MARKER } from '@/components/ui/fixed-strings';

import { firstClassAttribute, hasClass, render } from './harness';

describe('SourceLink', () => {
  it('renders the brief form with the page deep link by default', () => {
    const html = render(createElement(SourceLink, { page: 4 }));
    expect(html).toContain(MARKER.sourceLinkBrief(4));
    expect(html).toContain('Brief, page 4');
    expect(html).toContain('href="#page=4"');
    expect(firstClassAttribute(html)).toContain('mono');
  });

  it('renders the rubric form', () => {
    const html = render(createElement(SourceLink, { source: 'rubric', page: 2 }));
    expect(html).toContain('Official rubric, page 2');
    expect(html).toContain('href="#page=2"');
  });

  it('honours an explicit href', () => {
    const html = render(createElement(SourceLink, { page: 4, href: '#page=4&doc=rubric' }));
    expect(html).toContain('href="#page=4&amp;doc=rubric"');
  });

  it('has an unresolved variant with no link at all (`07` S4.3 rule 3)', () => {
    const html = render(createElement(SourceLink, { unresolved: true }));
    expect(html).toContain(MARKER.sourceLinkUnresolved);
    expect(html).toContain('No page location found');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
    expect(firstClassAttribute(html)).toContain('text-muted');
  });

  it('supports the block form used under a node (`17` S8)', () => {
    const html = render(createElement(SourceLink, { page: 6, block: true }));
    expect(hasClass(firstClassAttribute(html), 'block')).toBe(true);
  });
});
