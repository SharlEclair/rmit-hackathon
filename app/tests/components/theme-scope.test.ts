import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ContentClassPanel } from '@/components/ui/content-class-panel';
import { ThemeScope } from '@/components/ui/theme-scope';

import { contentClassFrame, render } from './harness';

const CHILD = 'panel body';

/**
 * `17` S7.6 rule 1: `ThemeScope` is the only way a page obtains a content-class frame. The
 * strongest available assertion is markup equality: for each tone, the wrapper must be
 * byte-identical to the panel it renders, so a page cannot get a second, differently styled frame
 * through it.
 */
describe('ThemeScope', () => {
  it('is markup-identical to ContentClassPanel for the same tone', () => {
    const officialProps = {
      officialKind: 'rubric' as const,
      sourceFile: 'COSC1234_Rubric.pdf',
      sourcePage: 2,
      children: CHILD,
    };
    expect(render(createElement(ThemeScope, { tone: 'official', ...officialProps }))).toBe(
      render(
        createElement(ContentClassPanel, { contentClass: 'official', ...officialProps }),
      ),
    );

    const approvedProps = { publishedOn: '2 Oct', children: CHILD };
    expect(render(createElement(ThemeScope, { tone: 'approved', ...approvedProps }))).toBe(
      render(createElement(ContentClassPanel, { contentClass: 'approved', ...approvedProps })),
    );

    expect(render(createElement(ThemeScope, { tone: 'structure', children: CHILD }))).toBe(
      render(createElement(ContentClassPanel, { contentClass: 'structure', children: CHILD })),
    );

    expect(render(createElement(ThemeScope, { tone: 'peer', children: CHILD }))).toBe(
      render(createElement(ContentClassPanel, { contentClass: 'peer', children: CHILD })),
    );

    const interpretationProps = { approvalState: 'pre-approval' as const, children: CHILD };
    expect(
      render(createElement(ThemeScope, { tone: 'interpretation', ...interpretationProps })),
    ).toBe(
      render(
        createElement(ContentClassPanel, {
          contentClass: 'interpretation',
          ...interpretationProps,
        }),
      ),
    );
  });

  it('passes the class through as data-content-class, one value only', () => {
    for (const tone of ['official', 'approved', 'structure', 'peer', 'interpretation'] as const) {
      const html =
        tone === 'official'
          ? render(
              createElement(ThemeScope, {
                tone,
                officialKind: 'brief',
                sourceFile: 'a.pdf',
                sourcePage: 1,
                children: CHILD,
              }),
            )
          : tone === 'approved'
            ? render(createElement(ThemeScope, { tone, publishedOn: '2 Oct', children: CHILD }))
            : render(createElement(ThemeScope, { tone, children: CHILD }));

      expect([...html.matchAll(/data-content-class="([^"]*)"/g)]).toHaveLength(1);
      expect(contentClassFrame(html, tone)).toContain('rounded-sheet');
    }
  });
});
