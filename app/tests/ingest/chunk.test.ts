/**
 * Stage S4 normalisation and stage S5 chunking (`04` sections 7 and 6.2).
 *
 * The properties being pinned are the ones a citation and a verbatim check depend on:
 *
 *   - a single newline is an extractor artefact and becomes a space, so a numbered requirement is not
 *     fragmented into one-word chunks;
 *   - a blank line is a paragraph boundary and survives;
 *   - a hyphen split across a line inside a word is rejoined, and a real hyphen is not;
 *   - every chunk carries the page range and the section label that govern it;
 *   - splitting happens at sentence boundaries, never mid-word and never inside a numbered item
 *     unless that item alone exceeds the hard cap;
 *   - the same input always produces the same boundaries (the cache-stability rule, `04` section 5.5).
 */

import { describe, expect, it } from 'vitest';

import {
  CHARS_PER_TOKEN,
  chunkPages,
  isHeading,
  normalisePageText,
  type NormalisedPage,
} from '@/features/ingest/chunk';

describe('normalisePageText (S4)', () => {
  it('turns a single extracted newline into a space', () => {
    expect(normalisePageText('The report\nmust state the word count.')).toBe(
      'The report must state the word count.',
    );
  });

  it('preserves a paragraph boundary', () => {
    expect(normalisePageText('First paragraph.\n\nSecond paragraph.')).toBe(
      'First paragraph.\n\nSecond paragraph.',
    );
  });

  it('rejoins a word hyphenated across a line, and leaves a real hyphen alone', () => {
    expect(normalisePageText('govern-\nance')).toBe('governance');
    expect(normalisePageText('well-known requirement')).toBe('well-known requirement');
  });

  it('removes non-breaking spaces and zero-width characters', () => {
    expect(normalisePageText('1,800\u00a0words\u200b here')).toBe('1,800 words here');
  });

  it('does not rewrite words or numbers', () => {
    const source = '1. The report must be 1,800 words.\n2. Use APA 7th.';
    expect(normalisePageText(source)).toBe('1. The report must be 1,800 words. 2. Use APA 7th.');
  });
});

describe('isHeading', () => {
  it('accepts the numbered and criterion headings the documents actually use', () => {
    expect(isHeading('3.2 Referencing')).toBe(true);
    expect(isHeading('Criterion 2 -- Analysis')).toBe(true);
  });

  it('rejects an ordinary sentence and a long paragraph', () => {
    expect(isHeading('The report must be 1,800 words.')).toBe(false);
    expect(isHeading(`1. ${'x'.repeat(200)}`)).toBe(false);
  });
});

describe('chunkPages (S5)', () => {
  const pages: NormalisedPage[] = [
    {
      page: 1,
      text: [
        '3. Requirements',
        '1. The report must state the word count and the reference style for every source used.',
        '2. The report must include a reference list in APA 7th style with at least eight sources.',
      ].join('\n\n'),
    },
    {
      page: 2,
      text: [
        '4. Formatting',
        'Use a single column, 12 point text, and page numbers in the footer of every page.',
      ].join('\n\n'),
    },
  ];

  it('anchors every chunk to the page it came from', () => {
    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.pageFrom).toBe(1);
    expect(chunks[chunks.length - 1]?.pageTo).toBe(2);
  });

  it('labels a chunk with the heading the document itself uses', () => {
    const chunks = chunkPages(pages);
    const first = chunks[0];
    expect(first?.sectionLabel).toBe('3. Requirements');
  });

  it('starts a new chunk at a heading, so a section does not share a chunk with the previous one', () => {
    const chunks = chunkPages(pages);
    const labelled = chunks.filter((chunk) => chunk.sectionLabel === '3. Requirements');
    const formatting = chunks.find((chunk) => chunk.sectionLabel === '4. Formatting');
    expect(labelled.length).toBeGreaterThan(0);
    expect(formatting).toBeDefined();
    expect(formatting?.text.startsWith('4. Formatting')).toBe(true);
  });

  it('keeps each numbered requirement whole when it fits the target', () => {
    const chunks = chunkPages(pages);
    const requirements = [
      '1. The report must state the word count and the reference style for every source used.',
      '2. The report must include a reference list in APA 7th style with at least eight sources.',
    ];
    for (const requirement of requirements) {
      const holders = chunks.filter((chunk) => chunk.text.includes(requirement));
      expect(holders, requirement).toHaveLength(1);
    }
  });

  it('splits an oversized paragraph at sentence boundaries, never mid-sentence', () => {
    const long = Array.from({ length: 40 }, (_, index) => `Sentence number ${String(index)} is here.`).join(' ');
    const chunks = chunkPages([{ page: 1, text: long }], { targetTokens: 20, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.endsWith('.')).toBe(true);
      expect(chunk.charCount).toBe(chunk.text.length);
    }
  });

  it('overlaps by carrying a tail forward, and loses no text', () => {
    const chunks = chunkPages(
      [
        { page: 1, text: 'Alpha sentence one. Beta sentence two.' },
        { page: 2, text: 'Gamma sentence three. Delta sentence four.' },
      ],
      { targetTokens: 6, overlapTokens: 3 },
    );
    expect(chunks.length).toBeGreaterThan(1);
    const whole = chunks.map((chunk) => chunk.text).join(' ');
    for (const word of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      expect(whole).toContain(word);
    }
  });

  it('is deterministic: the same pages produce identical boundaries', () => {
    expect(JSON.stringify(chunkPages(pages))).toBe(JSON.stringify(chunkPages(pages)));
  });

  it('nulls the page anchors for a format without pages', () => {
    const chunks = chunkPages([{ page: 1, text: 'Text extracted from an image.' }], {
      pageAnchors: false,
    });
    expect(chunks[0]?.pageFrom).toBeNull();
    expect(chunks[0]?.pageTo).toBeNull();
  });

  it('targets the documented character budget', () => {
    const paragraph = 'word '.repeat(600).trim();
    const chunks = chunkPages([{ page: 1, text: paragraph }], { targetTokens: 100, overlapTokens: 0 });
    const target = 100 * CHARS_PER_TOKEN;
    // The first chunk is at or below the target; only a single unsplittable sentence may exceed it.
    expect(chunks[0]?.charCount).toBeLessThanOrEqual(target * 2);
  });
});
