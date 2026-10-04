import { describe, expect, it } from 'vitest';

import {
  QUERY_STATUS_WORD,
  QUERY_SUBJECT_FALLBACK,
  formatDate,
  formatDateTime,
  messageCountLabel,
  postCountLabel,
  queryStatusWord,
  queryTitle,
} from '@/features/workspace/presentation';

/**
 * The presentations the two student tabs share.
 *
 * **Why these are worth a test rather than a glance.** `07-UI-UX-SPEC` section 4.4 fixes four status
 * words and section 5.1 maps each stored status to the word a student reads; a second spelling is a
 * paraphrase in the product, and the record is what makes a fifth status a type error instead of a row
 * that renders `undefined`. The timestamps are pinned for the same reason the format avoids `Intl`: a
 * locale-dependent string would make the same row read differently in two environments.
 */
describe('query status words (07 section 4.4, section 5.1)', () => {
  it('maps every stored status to its word, and is total over the API type', () => {
    expect(QUERY_STATUS_WORD).toEqual({
      open: 'Open',
      answered: 'Answered',
      resolved: 'Resolved',
      closed: 'Closed',
    });
    expect(queryStatusWord('open')).toBe('Open');
    expect(queryStatusWord('closed')).toBe('Closed');
  });
});

describe('queryTitle', () => {
  it('uses the subject when the student wrote one', () => {
    expect(queryTitle('Rubric weighting for the design rationale')).toBe(
      'Rubric weighting for the design rationale',
    );
  });

  it('falls back to an explicit label when the subject is blank, never to an empty heading', () => {
    // `06` section 5.5.12 types the subject as `string | null`, and `07` section 4.4's "first line of
    // the opening message" is not in the list read. A row with no title would read as a rendering fault.
    expect(queryTitle(null)).toBe(QUERY_SUBJECT_FALLBACK);
    expect(queryTitle('')).toBe(QUERY_SUBJECT_FALLBACK);
    expect(queryTitle('   ')).toBe(QUERY_SUBJECT_FALLBACK);
  });
});

describe('timestamp formats', () => {
  const iso = '2026-10-03T04:02:11.000Z';

  it('renders a date without a time, and a date-time as one UTC string', () => {
    expect(formatDate(iso)).toBe('2026-10-03');
    expect(formatDateTime(iso)).toBe('2026-10-03 04:02');
  });

  it('answers null for a missing stamp rather than inventing a date', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDateTime(null)).toBeNull();
  });

  it('answers null for a truncated value instead of slicing a half-formed string', () => {
    expect(formatDate('2026-10')).toBeNull();
    expect(formatDateTime('2026-10-03')).toBeNull();
  });
});

describe('count phrases', () => {
  it('singularises one and pluralises everything else', () => {
    expect(messageCountLabel(1)).toBe('1 message');
    expect(messageCountLabel(3)).toBe('3 messages');
    expect(postCountLabel(1)).toBe('1 post');
    expect(postCountLabel(0)).toBe('0 posts');
  });
});
