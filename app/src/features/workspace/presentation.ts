/**
 * The pure presentation derivations the student workspace tabs share: the Query status word, the
 * thread-list fallback title, and the two timestamp formats the tabs render.
 *
 * **Why these are a module rather than inline expressions.** `07-UI-UX-SPEC` section 4.4 fixes the
 * four status words (`Open`, `Answered`, `Resolved`, `Closed`) and section 5.1 maps each stored status
 * to the word a student reads; a second spelling in a second component is where a paraphrase enters
 * the product. The same argument applies to the timestamp format: the same instant rendered two ways
 * on two tabs reads as two different facts.
 *
 * **No locale formatting.** `Intl`/`toLocaleDateString` would make the rendered string depend on the
 * server's locale, so the same row could read differently in two environments and a screenshot would
 * not be reproducible. The ISO 8601 value is sliced, which is what the workspace layout already does
 * for the assignment's due date.
 */

import type { QueryStatusApi } from '@/lib/api/types';

/**
 * `07` section 4.4 and section 5.1: the status words, as text. Never an icon, never a colour alone.
 *
 * The record is total over `QueryStatusApi`, so adding a status to the API type without giving it a
 * word is a type error rather than a row that renders `undefined`.
 */
export const QUERY_STATUS_WORD: Record<QueryStatusApi, string> = {
  open: 'Open',
  answered: 'Answered',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** The status word for a Query. */
export function queryStatusWord(status: QueryStatusApi): string {
  return QUERY_STATUS_WORD[status];
}

/**
 * The label a Query row carries: its subject, or the fallback when the student left the subject blank.
 *
 * `07` section 4.4 says a row shows "the subject or the first line of the opening message". The list
 * read returns the subject and not the opening message, so a blank subject falls back to an explicit
 * label rather than to an empty heading -- a row with no title reads as a rendering fault.
 */
export const QUERY_SUBJECT_FALLBACK = 'Question to your tutor';

export function queryTitle(subject: string | null): string {
  const trimmed = subject?.trim() ?? '';
  return trimmed === '' ? QUERY_SUBJECT_FALLBACK : trimmed;
}

/** `2026-10-03T04:02:11.000Z` -> `2026-10-03`. A date with no time, for a marker line. */
export function formatDate(iso: string | null): string | null {
  if (iso === null || iso.length < 10) return null;
  return iso.slice(0, 10);
}

/** `2026-10-03T04:02:11.000Z` -> `2026-10-03 04:02`. UTC, so it does not depend on the server's locale. */
export function formatDateTime(iso: string | null): string | null {
  if (iso === null || iso.length < 16) return null;
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** The message-count phrase of a Query row: `1 message`, `3 messages`. */
export function messageCountLabel(count: number): string {
  return `${String(count)} ${count === 1 ? 'message' : 'messages'}`;
}

/** The post-count phrase of a Discussion thread row: `1 post`, `3 posts`. */
export function postCountLabel(count: number): string {
  return `${String(count)} ${count === 1 ? 'post' : 'posts'}`;
}
