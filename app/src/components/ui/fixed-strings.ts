/**
 * The fixed strings of `07-UI-UX-SPEC.md` S2.5, owned by exactly one module.
 *
 * Why one module: S2.5 is the table of "copy that carries a constraint ... used verbatim".
 * If two components each spell a badge string, the second spelling is where a paraphrase
 * enters the product (C2). Every primitive in this directory reads its copy from here.
 *
 * Casing note, recorded rather than silently resolved. `07` S2.2 prints the content-class
 * badges in uppercase (`ORIGINAL ASSIGNMENT BRIEF`) while `07` S2.5 prints the same strings
 * in sentence case (`Original assignment brief`). The DOM text below is the S2.5 form, and
 * the uppercase presentation is the `badge` type role of `17` S2.4 ("All badges, uppercase").
 * One string per constraint, one presentation rule, no third spelling.
 */

/** `07` S2.2 badge text and the panel headers of `07` S2.5, in DOM (sentence) case. */
export const BADGE = {
  officialBrief: 'Original assignment brief',
  officialRubric: 'Official rubric',
  publishedByTutor: 'Published by your tutor',
  approvedStructure: 'Approved by your tutor - structure, not requirements',
  peerDiscussion: 'Peer discussion - not official guidance',
  interpretationPreApproval: 'AI generated - requires tutor approval',
  interpretationStudentFacing:
    'AI-generated interpretation - not the official requirement',
} as const;

/** The required lexical marker of each content class (`07` S2.2), plus the citation forms. */
export const MARKER = {
  /** `07` S2.2 T1 marker. */
  officialSource: (filename: string, page: number): string => `Source: ${filename}, page ${page}`,
  /** `07` S2.2 T2 marker. */
  publishedOn: (date: string): string => `Published by your tutor on ${date}`,
  /** `07` S2.2 T3 marker. */
  approvedByTutor: 'Approved by your tutor',
  /** `07` S2.2 T4 marker. */
  peerDiscussion: 'Peer discussion',
  /** `07` S2.2 T5 marker, the Map disclaimer line of `07` S2.5. */
  mapDisclaimer: 'Refer to the original brief for exact requirements.',
  /** `07` S2.2 rule 3 / S4.3 rule 2: the label on a verbatim T1 excerpt inside a T5 panel. */
  authorityQuoteLabel: (documentLabel: 'brief' | 'rubric', page: number): string =>
    `From the ${documentLabel}, page ${page}`,
  /** `07` S2.6: the workspace's only requirement citation form. */
  sourceLinkBrief: (page: number): string => `Brief, page ${page}`,
  sourceLinkRubric: (page: number): string => `Official rubric, page ${page}`,
  /** `07` S4.3 rule 3. */
  sourceLinkUnresolved: 'No page location found',
} as const;

/** The five state kinds of `07` S2.1 and the copy that belongs to each. */
export const STATE_COPY = {
  /** `07` S2.1 loading copy pattern. */
  loading: (noun: string): string => `Loading ${noun}...`,
  /** `07` S2.1: added after 8 seconds. */
  stillWorking: 'Still working.',
  /** `07` S2.1: the note that leaving the page is safe, added with `stillWorking`. */
  stillWorkingNote: 'Leaving this page is safe.',
  /** `07` S2.5. I-26 fixes the capitalised form and the plain hyphen; never render 0 or 0%. */
  insufficientData:
    'Insufficient data - fewer than 5 students have worked on this Milestone.',
  /** `07` S2.5 / D33: the only permitted label for a start-to-completion interval. */
  elapsedTime: 'Elapsed time',
  /** `07` S4.6 rule 5; D33 includes idle time, so the tooltip says so. */
  elapsedTimeTooltip:
    'Elapsed time counts from start to completion, including time away from the page.',
  /** `07` S2.1 error state: the request id is secondary text, never a code alone. */
  requestIdLabel: 'Request id',
  /** `07` S4.7.3 rule 1 opener. */
  refusalOpener: (action: string): string =>
    `I cannot ${action} under this assignment's AI usage policy.`,
  /** `07` S2.5 escalation label. */
  refusalEscalation: 'Ask your tutor privately',
  /** `07` S4.7.3 rule 2 / S9.4 `POL_ABSENT`: the unavailable variant (D47). */
  refusalUnavailable:
    'The Assistant is unavailable for this assignment because no AI usage policy has been approved yet. Ask your tutor privately.',
  /** The two labelled blocks of the refusal panel (`07` S4.7.3 wireframe). */
  refusalPolicyLabel: 'Policy',
  refusalCanHelpWithLabel: 'I can help with',
} as const;

/**
 * The Empty-state sentences of `07` S2.5 and S2.1. They are here rather than in a screen so the
 * "never the word No data" rule has one place to fail.
 */
export const EMPTY_STATE = {
  checklist: 'Your Checklist will appear here once your tutor publishes it.',
  queries: 'Your private questions to your tutor will appear here.',
  discussions: 'No discussion threads yet. Ask the first question.',
} as const;

/** `07` S2.5: the anonymous display form. The number is persisted, never derived (D55). */
export function anonymousDisplay(displayNumber: number): string {
  return `Anonymous Student #${displayNumber}`;
}

/**
 * `07` S4.6 rule 6 / D48: the reopen note. The FIRST start-to-completion interval stands and
 * this note is appended to it; the row never accumulates time across reopen cycles.
 */
export function reopenedCountLabel(count: number): string {
  return `Reopened ${count} time${count === 1 ? '' : 's'}`;
}

/** `07` S2.5: the blocked-upload line, with the guardrail reason in plain words. */
export function blockedUpload(reason: string): string {
  return `This file was not sent to the Assistant because ${reason}.`;
}
