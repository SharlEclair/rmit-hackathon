# 07 - UI/UX Specification

**Purpose.** Every screen, every state, and the visual grammar that keeps the official assignment distinct from AI-generated interpretation. This doc is written so a builder can implement a screen without inventing a state, and so a reviewer can check constraint C2 by looking at one screenshot.

**Normative parents.** [`../AGENTS.md`](../AGENTS.md) (C1-C8), [`01-DECISIONS.md`](01-DECISIONS.md), [`15-GLOSSARY.md`](15-GLOSSARY.md). The interface contract is [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 5; where this doc names a response field, that doc defines it.

**Vocabulary.** Screen copy and this doc use only glossary terms. Where a fixed string is required, it is given in section 2.5 and repeated at the point of use.

**Screens covered.** Student login, student dashboard, student assignments, the four student workspace tabs (Assignment/Info, My Queries, Discussions, Checklist), the Assistant panel, tutor login, tutor dashboard, tutor assignments, Add Assignment (upload, ingestion, review, approval, publish), and the three tutor assignment tabs (Queries, Discussions, Analysis). Section 10 is the traceability matrix that proves it.

---

## 1. Reading order and scope

| You are | Read |
|---|---|
| Building any screen | 2 first, then your screen's section |
| Reviewing C2 or D18 | 2.2, 2.4, 4.2, 4.3 |
| Reviewing C4 or C5 | 6.3, 6.6, 8.2 |
| Reviewing the approval boundary (C3) | 7.3, 7.4 |
| Checking state coverage | 2.1, then the state table in each screen section, then 10 |

Not in this doc: component implementation, the data shapes (see [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 5), the guardrail decision procedure ([`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md)), metric definitions ([`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md)).

---

## 2. Visual grammar and the state model

### 2.1 The five state kinds

Every screen defines these five states where they apply. A state that genuinely does not apply is marked "Not applicable" with the reason, not omitted.

| Kind | Meaning | Shared treatment | Copy pattern | Applies to |
|---|---|---|---|---|
| **Loading** | Data is in flight | Skeleton matching the final layout's shape, not a spinner in the middle of an empty page. After 8 seconds, add the line "Still working." and a note that leaving the page is safe. | `Loading <noun>...` | Every screen that fetches |
| **Empty** | The request succeeded and there is nothing yet | A bordered panel with one sentence naming what would appear here and one action that creates it. Never a blank region. Never the word "No data". | `<Thing> will appear here once <actor> <action>.` | Every list and tab |
| **Error** | The request failed | The failed action in plain words, whether anything was saved, one primary action (Retry, or Back), and the request id in small secondary text. Never a stack trace, never a code alone. | `We could not load <thing>. Nothing was changed.` | Every screen that fetches or mutates |
| **Insufficient data** | An aggregate is below the k-anonymity floor of 5 contributing students (D32) | A neutral panel with the explanation in the tutor's terms. No number, no count, no estimate. | `Insufficient data - fewer than 5 students have worked on this Milestone.` | Tutor Analysis only |
| **Refused request** | The Guardrail refused a student request (D8, D11) | A designed boundary panel: what was refused, the reason code in plain words, the policy rule quoted when a published rule applies, what the Assistant can help with, and an escalation route. Distinct from the error treatment: it is a designed behaviour, not a failure. The same treatment covers the **unavailable** variant, where no AI Usage Policy is approved and the verdict is `REFUSE` with reason code `POL_ABSENT` (D47). | `I cannot <prohibited action> under this assignment's AI usage policy.` | Assistant panel; the workspace after an upload is blocked |

Rules that apply to all five:

1. No state is conveyed by colour alone (NFR-A-3).
2. Every state is operable by keyboard and announced to assistive technology: a live region announces loading completion, an error, and a refusal.
3. A state never hides navigation. A student can always switch tabs, and a tutor can always return to the assignment list.
4. An error state never discards the user's typed input.

### 2.2 Content classes and their rendering

This is the visual expression of C2 and D18. Five content classes exist, one per truth tier group. A component that renders content from the wrong class is a defect.

| Content class | Tier | Surface | Border and left rule | Badge text (exact) | Required lexical marker | Never |
|---|---|---|---|---|---|---|
| **Official document** | T1 | `--surface-official` (#FFFFFF) | 1px solid `--border-official`; 4px solid left rule | `ORIGINAL ASSIGNMENT BRIEF` or `OFFICIAL RUBRIC` | `Source: <filename>, page <n>` | Paraphrase, summary, re-generated text, AI badge, "interpretation" |
| **Section heading inside the workspace** for T1 | T1 | page surface | none | `Official assignment documents` | - | The words "summary" or "overview" |
| **Tutor-published** | T2 | `--surface-approved` (#F6FEF9) | 1px solid `--border-approved`; 4px solid left rule | `PUBLISHED BY YOUR TUTOR` | `Published by your tutor on <date>` | The word "official"; an AI badge; a verbatim requirement restated |
| **Approved structure** | T3 | `--surface-approved` (#F6FEF9) | 1px solid `--border-approved` | `APPROVED BY YOUR TUTOR - structure, not requirements` | `Approved by your tutor` | A requirement stated as if it were the brief; the word "official" |
| **Peer content** | T4 | `--surface-peer` (#FFFFFF) | 1px dotted `--border-peer` | `PEER DISCUSSION - NOT OFFICIAL GUIDANCE` | `Peer discussion` | The approved treatment; the word "official"; citation by the Assistant |
| **AI interpretation** | T5 | `--surface-interpretation` (#FFFBF0) | 1px dashed `--border-interpretation`; 4px dashed left rule | Pre-approval: `AI GENERATED - REQUIRES TUTOR APPROVAL`. Post-approval, student-facing: `AI-GENERATED INTERPRETATION - NOT THE OFFICIAL REQUIREMENT` | Post-approval: `Refer to the original brief for exact requirements.` | The word "official"; the official document frame; a verbatim requirement style |

Detail rules:

1. **The badge is never removed, collapsed, or truncated** at any breakpoint or scroll position. On narrow screens the badge may wrap to two lines; it may not shorten.
2. **The Map's badge is sticky** within the Map panel, so a scrolled node still carries it.
3. **A verbatim requirement inside a T5 node** is rendered in the official typography with a quoted-block treatment and an explicit `From the brief, page <n>` label, so the reader can see where the T5 panel stops and the T1 quote starts.
4. **The tutor review surface** uses the pre-approval badge on every artifact in every state: in the list, expanded, in edit mode, and in the validation-warning view. A tutor never sees an AI artifact without it (C3, glossary section 4).
5. **The word "official"** appears only on T1 and T2 elements. An AI-generated FAQ candidate is never labelled "official" even after approval; once published it is labelled "Published by your tutor".
6. **Greyscale test.** With colour removed, the four treatments remain distinguishable by border style (solid, dashed, dotted), badge text, and left-rule presence. This is checked as a screenshot test (NFR-A-4).

### 2.3 Design tokens

Tokens are owned values, not a component library's defaults (AGENTS section 5.1). Names below are the contract; hex values are the current choice and may be tuned without changing this doc's structure.

```text
Surfaces      --surface-page #F7F8FA   --surface-card #FFFFFF
              --surface-official #FFFFFF
              --surface-approved #F6FEF9
              --surface-interpretation #FFFBF0
              --surface-peer #FFFFFF

Borders       --border-default #D0D5DD
              --border-official #1F4E79      (solid)
              --border-approved #027A48      (solid)
              --border-interpretation #B54708 (dashed)
              --border-peer #667085          (dotted)

Accents       --accent-official #1F4E79
              --accent-approved #027A48
              --accent-interpretation #B54708
              --accent-peer #475467

States        --state-error #B42318    --state-warning #B54708
              --state-success #027A48  --state-info #175CD3

Text          --text-primary #101828   --text-secondary #475467
              --text-inverse #FFFFFF

Type          body 15px/1.5, tight 14px/1.45, heading-1 28px/1.25,
              heading-2 20px/1.3, heading-3 16px/1.4,
              badge 11px uppercase, letter-spacing 0.06em, weight 600,
              mono 13px/1.5 for ids and request ids

Space         4 8 12 16 24 32 48            Radius  6px (cards), 4px (badges)
Shadow        --shadow-card 0 1px 2px rgba(16,24,40,0.06)
Focus         --focus-ring 2px solid --state-info with 2px offset, always visible
```

Contrast: badge text on its badge background, and body text on every surface above, are checked at 4.5:1 or better (3:1 for text 18px and above). The check is part of the screen review, not an afterthought.

### 2.4 What must never happen

A reviewer can check constraint C2 in one screenshot by looking for these. Each is a defect, not a preference.

1. AI-generated text inside the official document frame.
2. A paraphrase rendered in the brief viewer's typography, or in the brief's scroll container.
3. The Assignment Map above the official brief in reading order, or in the same panel, or with the official treatment.
4. Any AI element labelled "official".
5. A peer answer rendered with the approved or official treatment.
6. A badge removed, collapsed, or shortened on scroll, hover, or at a narrow breakpoint.
7. A Map node without a source link when the node claims a requirement.
8. "Insufficient data" rendered as `0`, `0%`, or an empty cell.
9. An aggregate showing a contributor count below 5.
10. A refusal rendered with the generic error treatment, or as "Something went wrong".
11. A tutor-facing screen showing a name, avatar, email, profile link, or user id next to an anonymous post.
12. A sort order, filter, or search that groups posts by author identity.
13. A tutor-facing screen showing per-student progress or a student ranking.
14. The phrase "this assistant is safe" or any other promise the system does not keep (glossary section 2 rule 2).
15. A student-facing Publish control, anywhere.

### 2.5 Fixed strings

Copy that carries a constraint. These strings are used verbatim; the glossary's language rules apply to everything else.

| Context | String |
|---|---|
| Pre-approval artifact badge | `AI generated - requires tutor approval` |
| Student-facing Map badge | `AI-generated interpretation - not the official requirement` |
| Map disclaimer line | `Refer to the original brief for exact requirements.` |
| Official brief panel header | `Original assignment brief` |
| Official rubric panel header | `Official rubric` |
| Tutor-published badge | `Published by your tutor` |
| Approved structure badge | `Approved by your tutor - structure, not requirements` |
| Peer content badge | `Peer discussion - not official guidance` |
| Anonymous display | `Anonymous Student #<n>` |
| No-grounding answer | `We could not find this in your assignment documents.` |
| Refusal opener | `I cannot <action> under this assignment's AI usage policy.` |
| Refusal escalation | `Ask your tutor privately` |
| Elapsed time label | `Elapsed time` |
| Insufficient data | `Insufficient data - fewer than 5 students have worked on this Milestone.` |
| Empty Checklist | `Your Checklist will appear here once your tutor publishes it.` |
| Empty Queries (student) | `Your private questions to your tutor will appear here.` |
| Empty Discussions | `No discussion threads yet. Ask the first question.` |
| Blocked upload | `This file was not sent to the Assistant because <reason>.` |
| Audio or video selected | `Audio and video cannot be sent to the Assistant. You can send an image, a PDF, or a text file.` |
| Anonymous posting hint | `Your name will not be shown to anyone, including your tutor.` |
| Assistant unavailable, no approved policy | `The Assistant is unavailable for this assignment because no AI usage policy has been approved yet. Ask your tutor privately.` |

### 2.6 Component inventory

Owned primitives (AGENTS section 5.1). A screen is composed from these; a new visual treatment requires a new primitive and a review against section 2.2.

| Primitive | Renders | Notes |
|---|---|---|
| `ContentClassPanel` | One of the five classes in 2.2 | Owns surface, border, left rule, badge, and the required lexical marker. Screens never re-implement the treatment. |
| `ReviewStatusBadge` | Publication status for a tutor | Pre-approval text is fixed; the badge appears in every artifact state (glossary section 4). |
| `StatePanel` | Loading, empty, error, insufficient data, refused request | One component, five variants, so the five state kinds cannot drift. |
| `AuthorityQuote` | A verbatim T1 excerpt with its source label | Used inside T5 panels and in citations. |
| `SourceLink` | `Brief, page <n>` plus a deep link | The only way the workspace references a requirement. |
| `TrustTierLabel` | Computed tier, for tutor-facing surfaces only | Never shown to a student. |
| `ProgressMark` | not started / in progress / complete | Icon plus text, never colour alone. |
| `ChecklistItemRow` | One Checklist item with its planning level | Owns start, complete, reopen. |
| `AssistantMessage` | Student turn, assistant turn, or refusal | Owns verdict rendering. |
| `AuthorLabel` | Anonymous or attributed author | The only component allowed to render authorship; it never receives a student identifier. |
| `CitationList` | Sources of an assistant answer | Renders tier-appropriate labels. |
| `ModerationBadge` | Post moderation state | Tutor sees reason code; student sees only "hidden pending tutor review". |

### 2.7 Accessibility, responsive behaviour, and motion

| Area | Requirement |
|---|---|
| Keyboard | Every control is reachable in reading order; Tab order follows visual order; Escape closes the Assistant panel and modals; Enter submits forms. Focus returns to the invoking control when a panel closes. |
| Focus | Visible focus ring on every focusable element, including inside the Map. Focus is never trapped except inside a modal, where it is trapped deliberately and released on close. |
| Live regions | Loading completion, errors, refusals, and new assistant tokens are announced. Streaming text is announced in sentence-sized chunks, not per token, so a screen reader is not flooded. |
| Contrast | 4.5:1 body text, 3:1 large text and graphical objects, checked per token against its own background. |
| Target size | Interactive targets at least 24x24 CSS pixels, 44x44 preferred on touch. |
| Motion | Motion is limited to 150 ms opacity and transform transitions. No parallax, no auto-playing animation, no motion that carries meaning. `prefers-reduced-motion: reduce` disables all non-essential transitions. |
| Zoom | Usable at 200% zoom without horizontal scrolling for the main reading columns; the Map becomes a vertical list below 900 px rather than panning off-screen. |
| Breakpoints | `sm <640` single column, tabs become a scrollable segmented control; `md 640-1023` two-column where noted; `lg >=1024` full layout with the Assistant as a side panel instead of an overlay. |
| Language | Plain English, present tense, second person. No exclamation marks in error or refusal copy. No emoji in product chrome. |

---

## 3. Authentication, shell, and dashboards

### 3.1 Login (student and tutor)

Route: `/login`. Roles: public. One screen serves both roles; the server decides the landing route from `user.role`.

```text
+---------------------------------------------------+
|  AssignMate                             |
|                                                   |
|  +---------------------------------------------+  |
|  | Email          [___________________________]|  |
|  | Password       [___________________________]|  |
|  |                                             |  |
|  | [ Sign in ]                                 |  |
|  +---------------------------------------------+  |
|                                                   |
|  Students: your workspace. Tutors: your courses.  |
+---------------------------------------------------+
```

Primary action: sign in. On success, route to `/student` or `/tutor` from `SessionResponse.redirectTo`.

| State | Trigger | What the user sees | Controls |
|---|---|---|---|
| Loading | Submit in flight | Button becomes `Signing in...`, disabled, form fields stay readable and enabled for editing | - |
| Empty | Not applicable: the form is the empty state, and there is no data list on this screen | - | - |
| Error | Invalid credentials | Inline panel above the form: `Email or password is not correct.` The email field keeps its value; the password field clears. The same message is used for an unknown email and a wrong password, so the form does not confirm which addresses exist | `Try again` focuses the password field |
| Error | Network failure | `We could not reach the server. Nothing was changed.` With the request id in small secondary text | `Try again` |
| Error | Rate limited | `Too many sign-in attempts. Try again in <n> minutes.` | Disabled submit until the window passes |
| Insufficient data | Not applicable: no aggregate on this screen | - | - |
| Refused request | Not applicable: the Assistant is not reachable before sign-in | - | - |

Additional rules: no "forgot password" link in the MVP (D42); no SSO, no Canvas sign-in. A student who signs in with a tutor account lands on the tutor dashboard, and the reverse, with no error.

### 3.2 Session and role guard

| Situation | Behaviour |
|---|---|
| No session on a protected route | Redirect to `/login` with `?next=<path>` and no error flash. |
| Session expired mid-use | The next request returns `UNAUTHENTICATED`; the shell shows a modal: `Your session has ended. Sign in again to continue.` Any unsent text is copied to a local draft and restored after sign-in. |
| Wrong role for the route | A student visiting `/tutor/...` sees the not-found screen (`404`), never a permission error, so the route's existence is not confirmed. The shell keeps their real navigation visible. |
| Assignment archived while open | The workspace shows the not-found screen with the line `This assignment is no longer available.` and a link back to the course. |
| Assignment not yet published | Students never see the link. A direct URL returns the not-found screen. |

### 3.3 Shell and navigation

```text
STUDENT SHELL                                   TUTOR SHELL
+-----------------------------------------+     +-----------------------------------------+
| AssignMate    <name> [Menu]   |     | AssignMate    <name> [Menu]   |
|-----------------------------------------|     |-----------------------------------------|
| Courses > COSC1234 > Assignment A       |     | Courses > COSC1234 > Assignment A       |
|-----------------------------------------|     |-----------------------------------------|
| [Assignment/Info][My Queries][Discussions][Checklist] | [Queries][Discussions][Analysis]  |
|                                         |     |                                         |
|  workspace content                      |     |  workspace content                      |
|                                         |     |                                         |
|                                  ((AI)) |     |                                         |
+-----------------------------------------+     +-----------------------------------------+
```

Rules:

1. The tab strip is the only navigation inside a workspace. Tabs are deep-linkable.
2. Notification counts appear on the Discussion and Queries tabs where the API provides them (unanswered Queries for tutors, new tutor replies for students). A count is never shown for the moderation queue to a student.
3. The Assistant floating action button (FAB) sits bottom-right on all four student workspace tabs and nowhere else. A tutor has no Assistant FAB: the Assistant is a student-facing capability (D13).
4. The FAB is reachable by keyboard, labelled `AssignMate`, and shows an unread dot only while a proactive message is undismissed.
5. At `lg`, the Assistant opens as a right side panel and the workspace narrows; below `lg` it opens as a bottom sheet that can be dragged to full height and closed with Escape.
6. The review status vocabulary never appears to a student: a student sees published content, or the empty state that explains it is not published yet.

### 3.4 Student dashboard (My Courses)

Route: `/student`. Roles: student.

```text
My Courses
+------------------------+  +------------------------+
| COSC1234               |  | COSC1100               |
| Software Engineering   |  | Introduction to IT     |
| 3 assignments          |  | 1 assignment           |
| 1 needs your attention |  |                        |
+------------------------+  +------------------------+
```

Card contents: course code, title, term, assignment count, and one attention line when the student has an open Query with a new tutor reply.

| State | Trigger | What the user sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Two or three skeleton cards with the real card's dimensions | - |
| Empty | No enrollments | `You are not enrolled in any courses yet. Your courses will appear here once you are enrolled.` | `Refresh` |
| Error | Fetch failed | `We could not load your courses. Nothing was changed.` plus request id | `Try again` |
| Insufficient data | Not applicable: no aggregates on this screen | - | - |
| Refused request | Not applicable | - | - |

### 3.5 Student assignments page

Route: `/student/courses/{courseId}`. Roles: student enrolled in the course.

Card contents: title, due date when set, resolution rate as a percentage, `n of m Checklist items complete`, open Query count. Cards are ordered by due date ascending, with undated assignments last.

| State | Trigger | What the user sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Skeleton cards | - |
| Empty | No published assignments | `No assignments are published for this course yet.` | `Back to my courses` |
| Error | Fetch failed | `We could not load the assignments for this course.` plus request id | `Try again` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable | - | - |

Rule: an assignment card never shows a progress number derived from anything but the student's own Checklist progress (US-S-9).

### 3.6 Tutor dashboard

Route: `/tutor`. Roles: tutor.

Course cards add a review line: `2 assignments need review` when any assignment is in `in_review`, and `1 assignment has 5 open queries`.

| State | Trigger | What the user sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Skeleton cards | - |
| Empty | No courses | `You are not teaching any courses yet.` | `Refresh` |
| Error | Fetch failed | `We could not load your courses.` plus request id | `Try again` |
| Insufficient data | Not applicable: the counts here are workflow counts, not cohort aggregates | - | - |
| Refused request | Not applicable | - | - |

### 3.7 Tutor assignments page

Route: `/tutor/courses/{courseId}`. Roles: tutor on the course.

Each card shows the assignment title, its `assignment.status` as a word (`Draft`, `Ingesting`, `In review`, `Published`, `Archived`), the review progress (`7 of 24 items approved`), and, once published, the number of open Queries. A floating action button bottom-right adds an assignment.

| State | Trigger | What the user sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Skeleton cards | - |
| Empty | No assignments in the course | `No assignments yet. Add the first one.` | `Add assignment` |
| Error | Fetch failed | `We could not load the assignments for this course.` plus request id | `Try again` |
| Insufficient data | Not applicable: review counts are workflow counts, not cohort aggregates | - | - |
| Refused request | Not applicable | - | - |

---

## 4. Student assignment workspace

Route: `/student/assignments/{assignmentId}`. Roles: student enrolled in the course. Four tabs plus the Assistant FAB.

### 4.1 Workspace shell and tabs

```text
+---------------------------------------------------------------------------+
| COSC1234 > Assignment A                            Due 12 Oct   [Menu]    |
|---------------------------------------------------------------------------|
| [ Assignment / Info ] [ My Queries 2 ] [ Discussions ] [ Checklist 3/9 ]  |
|---------------------------------------------------------------------------|
|                                                                           |
|   tab content                                                             |
|                                                                           |
|                                                                    ((AI)) |
+---------------------------------------------------------------------------+
```

Tab order is fixed: Assignment/Info, My Queries, Discussions, Checklist. The order encodes the product's priority: the official document first, then private tutor contact, then the cohort, then progress.

Tab strip rules:

1. The active tab is marked with an underline plus `aria-selected`, never by colour alone.
2. Counts: My Queries shows the number of threads with a new tutor reply; Checklist shows `n/m` complete. Discussions shows no count when there is nothing new; a count is never used for moderation activity.
3. A tab with nothing published yet is still present and shows its empty state. Tabs are never hidden, because a missing tab reads as a missing feature.

Workspace-level states:

| State | Trigger | What the student sees | Controls |
|---|---|---|---|
| Loading | Bootstrap fetch in flight | Tab strip with skeletons; the tabs are clickable and each shows its own skeleton | - |
| Empty | Assignment published but no artifacts approved yet (partial publish) | The tab that has no content shows its own empty state; the workspace loads normally | - |
| Error | Bootstrap failed | Full-page panel: `We could not load this assignment. Nothing was changed.` plus request id | `Try again`, `Back to my courses` |
| Error | Assignment archived or unpublished mid-session (404) | `This assignment is no longer available.` | `Back to my courses` |
| Insufficient data | Not applicable: this screen shows the student's own data, never an aggregate | - | - |
| Refused request | Not applicable at workspace level; the refusal state lives in the Assistant panel (4.7) | - | - |

### 4.2 Official brief viewer

Implements C2, D17, D43. This is the anchor of the product's honesty claim: what the student reads first is the document the tutor uploaded, unaltered.

```text
+---------------------------------------------------------------------------+
| ORIGINAL ASSIGNMENT BRIEF                                     [ 100% ]    |
| Source: COSC1234_Assignment_A.pdf                                            |
|---------------------------------------------------------------------------|
| Documents: [ Brief ] [ Rubric ] [ AI usage policy ] [ Supplementary ]     |
|---------------------------------------------------------------------------|
|  +---------------------------------------------------------------------+  |
|  |  page 4 of 12                                                       |  |
|  |                                                                     |  |
|  |   2. Submission                                                     |  |
|  |   Submit one file only. Include a README that explains how to run   |  |
|  |   your project.                                                     |  |
|  |                                                                     |  |
|  +---------------------------------------------------------------------+  |
|                    [ < Previous ]  4 / 12  [ Next > ]                     |
+---------------------------------------------------------------------------+
```

Layout order inside the tab, top to bottom: official documents (viewer), then the Assignment Map (4.3), then the published AI Usage Policy card (4.2.1). The Map never appears above the viewer, and the viewer is never inside a collapsible that a student could miss.

Behaviour:

1. The viewer renders the uploaded document page by page. Text is never re-generated, re-flowed into new prose, or summarised.
2. Document tabs switch between sources by kind. The brief is selected by default; the Rubric tab gets the `Official rubric` header.
3. `Source: <filename>, page <n>` is displayed above the page. This is the format used wherever the workspace cites a requirement.
4. Page navigation: previous, next, and a page number input. A deep link (`#page=<n>`) opens the document at that page, scrolls it into view, and briefly highlights the page frame.
5. When a `sourceRef` section label exists, the viewer shows `Section: <label>` next to the page number.
6. Zoom steps are 75, 100, 125, 150 percent. Zoom never changes the pagination, so page anchors stay valid.
7. The viewer is page-rasterised and deliberately minimal ([`02-SCOPE.md`](02-SCOPE.md) section 2.4): no in-document search, no annotation, no download control, and no print control. The extracted text still exists server-side because it is the Assistant's grounding, but the viewer never displays it as a second, searchable rendering of the brief.
8. An extraction warning (`EXTRACTION_FAILED`, or a page count of 0) shows an inline notice on the affected document: `This document could not be fully read. Ask your tutor to upload a readable copy.`
9. A supplementary document is labelled `Supplementary material - not the requirement`.
10. Page navigation is the only control the viewer adds to the document. Requirement citations elsewhere resolve to a page anchor, which is the mechanism C2 relies on, not a download.

| State | Trigger | What the student sees | Controls |
|---|---|---|---|
| Loading | Document fetch or render in flight | Page-shaped skeleton with the correct aspect ratio, plus `Loading page 4 of 12...` | - |
| Empty | The assignment has no brief source (should be impossible after publish) | `The original brief is not available. Tell your tutor.` | `Ask your tutor privately` |
| Error | Render failed for one document | Inline panel inside the panel: `We could not display this document.` plus the reason | `Try again` |
| Error | Document list failed | `We could not load the assignment documents.` plus request id | `Try again` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable: the viewer never calls a model | - | - |

#### 4.2.1 Published AI Usage Policy card

Implements D9, D47, C1. One card, below the Assignment Map, rendering the assignment's approved AI Usage Policy rules (T2 treatment, 2.2).

1. The card is present only when at least one policy rule is `PUBLISHED`. Before that the card is absent and the Assistant is in the unavailable state (4.7.2 rule 6, 4.7.3 rule 2).
2. Each rule is shown verbatim, exactly as the tutor approved it. The interface never summarises, merges, or rewords a rule, and never presents a policy rule as an assignment requirement (C2).
3. The card carries the T2 treatment and the `Published by your tutor` label (2.2, 2.5). The word "official" appears only on T1 and T2 elements (2.2 rule 5).
4. The card has no edit, approve, or dismiss control. Policy authorship is a tutor surface (7.3).
5. The card is not part of the Assistant's transcript and the Assistant never cites itself as the policy's author.

| State | Trigger | What the student sees | Controls |
|---|---|---|---|
| Loading | Policy fetch in flight | Two skeleton rule rows | - |
| Empty | No policy rule is `PUBLISHED` | The card is absent, and the Assistant shows the unavailable state (2.5) | `Ask your tutor privately` |
| Error | Policy fetch failed | `We could not load this assignment's AI usage policy.` plus request id | `Try again` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable: the card renders a published document and makes no model call | - | - |

### 4.3 Assignment Map

Implements D18 and D19. The Map answers "how is this assignment structured?". The Checklist (4.6) answers "where am I?". They are separate features, and the Map never becomes a to-do list.

```text
+---------------------------------------------------------------------------+
|  AI-GENERATED INTERPRETATION - NOT THE OFFICIAL REQUIREMENT        [sticky]|
|  Refer to the original brief for exact requirements.                      |
|---------------------------------------------------------------------------|
|  [ Group by requirement ]  [ Show rubric links ]  [ Show my position ]    |
|---------------------------------------------------------------------------|
|  Requirement 1  Deliverable and submission format          Brief p.4      |
|    |                                                                      |
|    +-- Requirement 1.1  "Submit one file only."            Brief p.4      |
|    |     +-- Rubric: Code quality (30%)                     Rubric p.2     |
|    |     +-- Milestone 1  Requirements          complete                  |
|    |     +-- Milestone 2  Design                you are here              |
|    |                                                                      |
|  Requirement 2  API behaviour                              Brief p.6      |
|    +-- Milestone 3  API implementation                      not started   |
|                                                                           |
|  [ Milestone 2 node selected ]                                            |
|  +---------------------------------------------------------------------+  |
|  | Milestone 2 - Design                          Approved by your tutor|  |
|  | Approved structure. 3 Checklist items.                              |  |
|  | Requirement context: "Submit one file only." (from the brief, p.4)  |  |
|  | [ Open the brief at page 4 ]   [ Go to the Checklist ]              |  |
|  +---------------------------------------------------------------------+  |
+---------------------------------------------------------------------------+
```

Node rendering rules:

1. The panel's badge is sticky and never scrolls out of view (2.2 rule 2).
2. A Requirement node shows its AI label, the verbatim excerpt when one exists, and a `From the brief, page <n>` link. A verbatim excerpt is rendered with `AuthorityQuote`: quoted, official typography, and visually inside the T5 panel but clearly marked as quoted from T1.
3. A node with no located source shows `No page location found` and no page link, and it never states a requirement.
4. A Rubric node shows the section label and the weight only when the weight was verified against the source text.
5. A Milestone node carries the approved-structure treatment (`APPROVED BY YOUR TUTOR - structure, not requirements`) and its own progress mark.
6. Selecting a node opens a detail panel. The detail panel offers structure and navigation only: related Checklist items, related Rubric sections, the source page, and related published FAQ entries. It never offers a next action, a suggested approach, or a plan.
7. Filters: group by requirement, show or hide Rubric links, show or hide the student's position. Filters do not change node content.
8. Below 900 px the Map becomes a vertical, indented list rather than a canvas (2.7). Keyboard users traverse it as a tree with left and right arrow keys.
9. Progress marks in the Map and in the Checklist tab come from the same data and must never disagree (US-S-21).

| State | Trigger | What the student sees | Controls |
|---|---|---|---|
| Loading | Structure fetch in flight | Indented skeleton tree with the badge already visible | - |
| Empty | The Map has not been published for this assignment | `The Assignment Map will appear here once your tutor publishes it. The original brief above is always the authoritative source.` | - |
| Error | Fetch failed | `We could not load the Assignment Map.` plus request id. The brief viewer above remains usable | `Try again` |
| Error | A referenced source page cannot be resolved | The node shows `No page location found` and stays navigable | - |
| Insufficient data | Not applicable: the Map is not an aggregate | - | - |
| Refused request | Not applicable: the Map is static approved content and makes no model call | - | - |

### 4.4 My Queries tab

The student side of the private Query thread. The lifecycle and the tutor side are in section 5; this section covers the student's list, composer, and thread.

```text
+---------------------------------------------------------------------------+
| My Queries                                          [ Ask your tutor ]     |
|---------------------------------------------------------------------------|
| +-----------------------------------------------------------------------+ |
| | Will the marker run my project on Windows?           Answered         | |
| | You asked 3 Oct, 14:02 - 2 messages - 1 reply       [ Open thread ]   | |
| +-----------------------------------------------------------------------+ |
| | How strictly is the word count enforced?             Open             | |
| | You asked 3 Oct, 16:40 - 1 message                   [ Open thread ]   | |
+---------------------------------------------------------------------------+
```

List rules: newest activity first; each row shows subject or the first line of the opening message, the status word, the timestamps, and the message count. The status words are `Open`, `Answered`, `Resolved`, `Closed` and are shown as text.

Thread view: messages in order, each labelled `You` or `<Tutor display name>`, with the date and time. A tutor reply that was published to the FAQ shows a `Published by your tutor in the official FAQ` line with a link. When the Assistant used this thread as context, nothing in the thread changes: it is read-only to the Assistant (O9). A message is not editable after sending; a correction is a new message. Query threads carry no attachments in the MVP ([`02-SCOPE.md`](02-SCOPE.md) section 5).

Composer: subject (optional, up to 200 characters), body (required, up to 8000 characters), and a `Send privately` button. Query threads carry no attachments in the MVP ([`02-SCOPE.md`](02-SCOPE.md) section 5: flat thread view, no attachments). The composer states `Your tutor sees your name on a private question.` so the attribution difference from a Discussion post is explicit.

`Flag Resolved` appears only when at least one tutor reply exists.

| State | Trigger | What the student sees | Controls |
|---|---|---|---|
| Loading | List or thread fetch in flight | Two skeleton rows; in a thread, skeleton message bubbles | - |
| Empty | No Queries yet | `Your private questions to your tutor will appear here.` plus a secondary line: `Good for questions about your own situation. For questions the whole cohort could learn from, use Discussions.` | `Ask your tutor` |
| Error | Send failed | The composer keeps the text and shows `We could not send your question. Nothing was sent.` plus request id | `Try again` |
| Error | List or thread failed | `We could not load your questions.` plus request id | `Try again` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable: a Query asks a human, so the Guardrail does not apply. The `Ask your tutor privately` escalation from a refusal lands here | - | - |

### 4.5 Discussions tab

The student side of the cohort discussion. Thread and post detail, anonymity, moderation, and flagging rules are in section 6; this section fixes the tab's structure and states.

```text
+---------------------------------------------------------------------------+
| Discussions                                                               |
|---------------------------------------------------------------------------|
| OFFICIAL FAQ                                                              |
| +-----------------------------------------------------------------------+ |
| | Does the README count toward the file limit?                          | |
| | Published by your tutor - 2 Oct              [ Read answer ]          | |
| +-----------------------------------------------------------------------+ |
|                                                                           |
| STUDENT DISCUSSION                                    [ Ask anonymously ] |
| +-----------------------------------------------------------------------+ |
| | Windows or macOS for the marker?           Anonymous Student #482     | |
| | 3 replies - last reply 1 hour ago                                    | |
| +-----------------------------------------------------------------------+ |
| | Reading list for the API section?          Priya S.                   | |
| | 1 reply - last reply yesterday                                       | |
+---------------------------------------------------------------------------+
```

| State | Trigger | What the student sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Section headers with skeleton rows under each | - |
| Empty | No threads yet | `No discussion threads yet. Ask the first question.` The Official FAQ section shows `No official FAQ entries yet.` | `Ask anonymously` |
| Empty | FAQ only | The Official FAQ section renders and the thread section shows its empty state | `Ask anonymously` |
| Error | Fetch failed | `We could not load the discussions.` plus request id | `Try again` |
| Error | Post failed | The composer keeps its text and states `Your post was not sent. Nothing was posted.` | `Try again` |
| Error | A post is hidden by moderation | The hidden post's row shows `Hidden pending tutor review.` The thread stays readable | - |
| Insufficient data | Not applicable: the student never sees aggregates here | - | - |
| Refused request | Not applicable: the Discussion Moderator flags content; it does not refuse a request. A flagged post result is a moderation state, not a refusal | - | - |

### 4.6 Checklist / milestones

Implements D19 and D20, and the elapsed-time decision D33. The answer to "where am I?".

```text
+---------------------------------------------------------------------------+
| Checklist                                                3 of 9 complete   |
| [##################--------------]  33%  Resolution rate                  |
|---------------------------------------------------------------------------|
| Milestone 1 - Requirements                            complete            |
|   [x] Understand the submission format              12m elapsed time       |
|   [x] Identify the required deliverables             8m elapsed time       |
|                                                                           |
| Milestone 2 - Design                              in progress - you are here|
|   [x] Plan the module boundaries                    24m elapsed time       |
|   [~] Review the rubric weightings       Started 3 Oct 14:02  [ Complete ]|
|   [ ] Verify the design against the requirements      Not started         |
|                                                                           |
| Milestone 3 - API implementation                       not started        |
|   [ ] Understand the endpoint requirements                                |
+---------------------------------------------------------------------------+
```

Rules:

1. Milestones render as an accordion ordered by the tutor's `displayOrder`. The Milestone containing the student's current in-progress item is expanded by default; the others are collapsed. Expanding or collapsing changes no state.
2. The progress header shows completed over total and the resolution rate, both computed from published items only.
3. A Checklist item row shows the item title, its planning level word where useful (`Understand`, `Identify`, `Plan`, `Verify`, `Review`, `Note`), the elapsed time when complete, and the state mark. The state mark uses icon plus text plus colour (NFR-A-3).
4. State controls: `Start` on a not-started item, `Complete` on an in-progress item, `Reopen` on a completed item. Starting and completing are optimistic: the mark changes immediately and reverts with a toast if the server refuses.
5. Elapsed time is always labelled `Elapsed time`, never `Time worked` or `Time on task` (D33). Idle time is included, and a tooltip says so in one sentence: `Elapsed time counts from start to completion, including time away from the page.`
6. Reopened items (D48): an item that has been reopened shows the **first** start-to-complete elapsed time and the note `Reopened <n> time(s)`. The interface never accumulates time across reopen cycles, never shows a second, larger duration, and never replaces the first interval. If the item is currently in progress after a reopen, the row shows the original elapsed time plus `Reopened <n> time(s)` and a `Complete` control.
6. Item text never contains an instruction to implement, and the row has no "how to" affordance. The only per-item affordance beyond progress is a link to the related FAQ entries when any exist.
7. Item-level actions never open the Assistant automatically; opening the Assistant is always the student's action (except the O2 proactive message, which is capped and dismissible).
8. A Milestone with no published items does not render as an empty accordion: it renders `No Checklist items are published for this Milestone yet.` inside the panel.
9. Ordering within a Milestone is the tutor's order. Ordering never sorts by completion state.

| State | Trigger | What the student sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Progress header skeleton plus three skeleton rows | - |
| Empty | No published Checklist | `Your Checklist will appear here once your tutor publishes it.` The brief and the Map above remain fully usable | - |
| Error | Fetch failed | `We could not load your Checklist.` plus request id | `Try again` |
| Error | Mark failed | The row reverts, and a toast reads `We could not save that. Your Checklist is unchanged.` | `Try again` |
| Insufficient data | Not applicable: the student sees their own progress, which is never aggregated | - | - |
| Refused request | Not applicable: progress marking is not an AI request. The closest case, starting a Milestone with no published items, is handled by rule 8 | - | - |

### 4.7 Proactive milestone context and the Assistant panel

Implements O2, D13, D4, and the refusal surface for C1. The Assistant is available on all four tabs through the FAB. It is one coach, not a set of capabilities: `Assignment Analyst`, `Guardrail`, `Discussion Moderator`, and `Insight Engine` are never named in the interface (D13).

#### 4.7.1 Proactive milestone context

When a student first enters a Milestone, the Assistant FAB shows an unread dot and the panel contains one proactive message.

```text
+---------------------------------------------------------------------------+
| AssignMate                            Milestone 2 - Design  [X]  |
|---------------------------------------------------------------------------|
| You are starting Milestone 2. Before you begin, here are 3 things the      |
| assignment specifically requires you to consider:                          |
|                                                                            |
| 1. One file only is accepted for submission.        Brief p.4  [ Open ]    |
| 2. The rubric awards 30% for code quality.          Rubric p.2 [ Open ]    |
| 3. The design must be verifiable against the        Brief p.6  [ Open ]    |
|    stated requirements.                                                    |
|                                                                            |
| [ Dismiss ]                                                                |
|---------------------------------------------------------------------------|
| Ask about this assignment...                                     [ Send ]  |
+---------------------------------------------------------------------------+
```

Rules (O2, all testable):

1. Exactly one proactive message per (student, assignment, Milestone). Returning to the Milestone shows the transcript entry but never a second notice.
2. A maximum of 3 bullets, each grounded in published content: the brief, a published Rubric section, an approved Milestone or Checklist item, or a published FAQ entry. Each bullet carries a source link.
3. No bullet contains code, an implementation instruction, an evaluation, or a solution step. If approved content cannot support 3 bullets, fewer are shown; the panel never pads with model-generated advice.
4. The message is assembled from approved content, not generated live during the visit, so it cannot bypass Approval (C3).
5. `Dismiss` removes the message and the unread dot permanently for that Milestone. Dismissal is recorded and never repeated.
6. The message header names the Milestone so the context is unambiguous, and the header is not clickable into anything else.

#### 4.7.2 The Assistant panel

```text
+---------------------------------------------------------------------------+
| AssignMate                                          [ Clear ] [X]|
|---------------------------------------------------------------------------|
|  [ transcript: student turns right, assistant turns left ]                 |
|                                                                            |
|  Assistant                                                                 |
|  The brief requires one submission file (Brief p.4). The rubric awards     |
|  30% for code quality (Rubric p.2). Those are the two constraints that     |
|  apply to this Milestone.                                                  |
|  Sources: Brief p.4  |  Official rubric p.2                                |
|                                                                            |
|  You                                                                       |
|  Here is my code. Tell me what to change.                                   |
|                                                                            |
|  ----------------------------------------------------------------          |
|  I cannot review or change your implementation under this assignment's     |
|  AI usage policy.                                                          |
|                                                                            |
|  Policy: "The assistant must not debug, evaluate, or modify student        |
|  implementations." (Published by your tutor)                               |
|                                                                            |
|  I can help with:                                                          |
|  - Understanding the requirement you are working on                        |
|  - Interpreting the rubric                                                 |
|  - Planning your own next steps at a high level                            |
|                                                                            |
|  [ Ask your tutor privately ]                                              |
|---------------------------------------------------------------------------|
| [ + ] Upload          Ask about this assignment...               [ Send ]  |
+---------------------------------------------------------------------------|
```

Panel rules:

1. The panel header states the assignment and, when opened from a Milestone, the Milestone context.
2. Each assistant turn renders its citations as `Sources: <label> | <label>`, each a `SourceLink`. An answer with no source renders the fixed no-grounding line (2.5) and an `Ask your tutor privately` control instead of citations.
3. A student turn with a refusal verdict renders the refusal panel described below. The transcript keeps the refusal, so a student can reread what was refused and why.
4. Streaming: text appears progressively. The `guardrail` event arrives first; when the verdict is a refusal, no text streams at all and the refusal panel appears at once. A client that receives text before a verdict treats the stream as corrupt and shows the error state.
5. Uploads: the `+` control opens a file picker for images (PNG, JPEG), PDF, and plain text (O11). Audio and video are not selectable: the picker refuses them with rule `UP5` ([`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md) section 6.4) before storage and before any guardrail or model call, and says so in the fixed line from 2.5 rather than accepting the file and failing afterwards. Each upload shows a chip with its kind, extraction status, and guardrail scan status. A chip in `blocked` state shows the blocked-upload string and cannot be sent. Sending with a blocked upload selected is refused client-side with the reason, and the server refuses it again (C6). The blocked and refused paths apply to all three surviving modalities: an image of a problem, a PDF of student work, and a text file asking for a solution each reach the same guard.
6. Policy gate (D47): when `policy.available = false`, the composer is replaced by the unavailable state and `Ask your tutor privately`. The Assistant does not open as an empty but usable box, because no approved policy means no assistance.
7. The composer is capped at 4000 characters with a counter appearing in the last 200.
8. `Clear` clears the student's own transcript after a confirmation that says the transcript will be removed from their view. It never deletes audit or guardrail records.
9. The panel never displays confidence scores, model names, prompt versions, or capability names.

#### 4.7.3 The refusal panel

The refusal is a designed behaviour (D8, D11). It uses the boundary treatment, not the error treatment.

```text
+---------------------------------------------------------------------------+
| I cannot review or change your implementation under this assignment's      |
| AI usage policy.                                                           |
|                                                                            |
| Policy: "The assistant must not debug, evaluate, or modify student         |
| implementations." (Published by your tutor)                                |
|                                                                            |
| I can help with:                                                           |
| - Understanding the requirement you are working on                         |
| - Interpreting the rubric                                                  |
| - Planning your own next steps at a high level                             |
|                                                                            |
| [ Ask your tutor privately ]                                               |
+---------------------------------------------------------------------------+
```

Rules:

1. The opener states what was refused in the student's own terms: `I cannot <action>...`.
2. The quoted rule comes from the assignment's published AI Usage Policy. When no published rule exists, the verdict is `REFUSE` with reason code `POL_ABSENT` and the panel is the **unavailable** variant: it states that the Assistant is unavailable because no policy has been approved, and offers `Ask your tutor privately` (D47). It never says a default policy applied.
3. `I can help with` contains 2 to 4 items drawn from the approved policy and the fixed affordances. It never lists a capability that would itself be prohibited.
4. `Ask your tutor privately` opens the Query composer with the student's original request copied into the body, and the student must send it. The system never creates a Query on the student's behalf (D24).
5. The panel variant is selected by the Guardrail's `refusalTemplateId`, owned by [`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md) section 7.2: `T-REFUSE` renders the boundary panel above, `T-SCOPE` renders the same panel with the permitted scope named, `T-CLARIFY` renders the clarification question with its two interpretations, and `T-ESCALATE` renders the panel with the escalation control emphasised. The interface maps four templates to four layouts and invents no codes.
6. A refusal is never red-badged as an error, is never labelled "Blocked", and never says the student did something wrong. It states the boundary.
7. `CLARIFY` uses the same panel with a question in place of a statement: `I need to check what you are asking before I answer. Do you mean <interpretation A> or <interpretation B>?` and offers the two interpretations as buttons. It still does not answer: `CLARIFY` produces no model answer, makes no provider call for the answer, and counts as a refusal in the golden set (D69).
8. A refusal never disables the composer, and the same session can immediately ask a permitted question (US-S-12). The one exception is `POL_ABSENT`, where the composer stays replaced by the unavailable state (D47).

| State | Trigger | What the student sees | Controls |
|---|---|---|---|
| Loading | Request sent, awaiting the verdict event | Composer disabled, a `Checking your request...` line in the transcript, and the last transcript entry stays readable | `Cancel` (aborts the request; nothing is stored) |
| Loading | Tokens streaming | Progressive text plus a caret; composer disabled | `Cancel` |
| Empty | No transcript yet | Nothing in the transcript, and the composer is focused with the placeholder `Ask about this assignment...` | - |
| Empty | No proactive message for this Milestone | The panel shows the transcript only; the FAB has no unread dot | - |
| Error | `LLM_UNAVAILABLE` | `The Assistant is unavailable right now. Your assignment documents are still available above.` plus request id | `Try again` |
| Error | `LLM_OUTPUT_INVALID` | Client-side, this is rendered as a refusal with `SCHEMA_VALIDATION_FAILED`; the copy is `I could not produce a reliable answer, so I did not answer. Nothing was changed.` | `Try again` |
| Error | Rate limited | `You have reached the Assistant's limit for now. Try again in <n> minutes, or ask your tutor privately.` | `Ask your tutor privately` |
| Error | Stream interrupted mid-answer | The partial answer is marked `This answer was interrupted.` and is not presented as complete | `Try again` |
| Insufficient data | Not applicable: the Assistant answers from documents, and the no-grounding case is handled by rule 2 above, not by an aggregate state | - | - |
| Refused request | Verdict `REFUSE`, `CLARIFY`, or `ESCALATE_TO_TUTOR` | The refusal panel in 4.7.3, in place of an answer | `Ask your tutor privately`, or the clarification buttons |

---

## 5. Queries and publishing

Implements D24: a Query is private, and Publish is the tutor's separate act of promoting an answer into the official shared FAQ. The two must be unmistakable in the interface, because confusing them leaks a student's private question to the cohort.

### 5.1 The Query lifecycle in interface terms

| Status | Set by | Student sees | Tutor sees |
|---|---|---|---|
| `open` | student | `Open`, with the reply composer available | In the grouped list under `Open`, count incremented |
| `answered` | tutor reply | `Answered`, with the tutor's message and `Flag Resolved` | Under `Answered`, with the reply in the thread |
| `resolved` | student | `Resolved`, with the option to reply again | Under `Resolved`, deprioritised in the list |
| `closed` | tutor | `Closed`, read-only | Under `Closed` |

Transitions: a student reply to an `answered` or `resolved` thread returns it to `open`. A tutor reply to any live thread sets `answered`. There is no automatic close.

### 5.2 Tutor Queries tab (grouped)

Route: `/tutor/assignments/{assignmentId}` tab `Queries`.

```text
+---------------------------------------------------------------------------+
| Queries                                      Group by: Milestone   [Search]|
|---------------------------------------------------------------------------|
| > Milestone 3 - API implementation            17 questions   12 open      |
|     (expanded)                                                            |
|     +-------------------------------------------------------------------+ |
|     | Authentication for the API endpoints        Priya S.    open      | |
|     | Asked 3 Oct 09:12 - 1 message                       [ Open ]      | |
|     +-------------------------------------------------------------------+ |
|     | Which validation library is expected?       Anonymous? No - Queries| |
|     | Asked 3 Oct 11:40 - 3 messages                      [ Open ]      | |
|     +-------------------------------------------------------------------+ |
| > Milestone 2 - Design                        12 questions    5 open      |
| > Milestone 1 - Requirements                    3 questions    1 open      |
+---------------------------------------------------------------------------+
```

Rules:

1. Group headers show the group label, the total question count, and the open count. Groups are collapsed by default except the group with the oldest unanswered Query, which opens on first load.
2. Grouping is by approved Milestone only: the student picks a Milestone when posting, and AI clustering of question topics is out of scope in the MVP ([`02-SCOPE.md`](02-SCOPE.md) section 2.4). Group headers use the approved Milestone title and the approved-structure treatment (T3). The AI topic-label treatment exists in this design system and is not used here because no topic label is produced.
3. A group header shows the Milestone title. Renaming is not offered in the MVP, because the label is tutor-authored content, not a model output.
4. A Query row shows the subject or first line, the asking student's display name, the status, the timestamps, and the message count. A Query is private, so the student's name is shown: Queries are not anonymous (see [`03-PRD.md`](03-PRD.md) section 10.2 item 1).
5. `Search` filters by text within the assignment's Queries only.
6. Sort orders available: newest activity, oldest unanswered, most messages. No sort order changes what is visible, and none of them is student-derived in a way that would leak anything: a Query is attributed by design.
7. The tab badge in the shell shows the number of open Queries.

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Skeleton group headers with two skeleton rows each | - |
| Empty | No Queries in the assignment | `No questions yet. Students' private questions will appear here, grouped by Milestone.` | `Refresh` |
| Empty | A group with no matching Query after search | `No questions match "<term>".` | `Clear search` |
| Error | Fetch failed | `We could not load the questions.` plus request id | `Try again` |
| Error | Grouping failed | Rows render ungrouped under `Ungrouped questions`, with the note `Topic grouping is unavailable right now.` Nothing is hidden | - |
| Insufficient data | Not applicable: Queries are individual threads, not aggregates | - | - |
| Refused request | Not applicable: a Query addresses a human tutor | - | - |

### 5.3 Query thread detail (tutor)

```text
+---------------------------------------------------------------------------+
| < Back to Queries                                                          |
| Will the marker run my project on Windows?                                 |
| Asked by Priya S. - 3 Oct 14:02 - Status: answered                         |
|---------------------------------------------------------------------------|
| Priya S. - 3 Oct 14:02                                                     |
| My project uses a Windows-only build step. Will the marker run it on       |
| Windows, or should I make it cross-platform?                               |
|                                                                            |
| You - 3 Oct 15:10                                                          |
| [ answer text ]                                                            |
| Published by your tutor in the official FAQ                                |
|----------------------------------------------------------------------------|
| Reply privately to Priya S.                                                |
| [ body                                                              ]      |
| [ Reply privately ]   [ Reply and publish to the official FAQ ]            |
+---------------------------------------------------------------------------+
```

The two submit controls are visually distinct (see 5.4) and the destructive-in-scope one, publish, is on the right and styled as a secondary action, not the primary one.

### 5.4 Reply versus Publish

| Aspect | Reply | Publish |
|---|---|---|
| Verb in the interface | `Reply privately` | `Publish to the official FAQ` |
| Who sees the result | Only the asking student | Every enrolled student of the assignment |
| Visual treatment of the result | Private thread message, no badge | T2 treatment: `PUBLISHED BY YOUR TUTOR` |
| Confirmation required | None; the control states the recipient | A confirmation dialog that names the cohort scope |
| Confirmation copy | `Reply privately to <student>. Only <student> will see this.` (static helper text under the composer) | `Publish this answer to the official FAQ? Every student enrolled in this assignment will see it. <student>'s original question will be shown as the FAQ question.` |
| Reversible | A further reply corrects the record; the message itself is immutable | Yes: the entry can be unpublished, which removes it from student view and from the Assistant's retrieval set |
| Effect on the Query status | Sets `answered` | Sets `answered` and creates a FAQ entry linked to the thread |
| Where it appears | Inside the thread only | Official FAQ section in the tutor's Discussions tab and the student's Discussions tab |
| Recorded | `query_messages` row | `faq_entries` row with `published_by_user_id`, `source_kind`, and a link to the source message |

Publish flow:

1. The tutor selects a message they already sent, or composes a new one and chooses `Reply and publish to the official FAQ`.
2. A preview panel shows the FAQ entry exactly as a student will see it: question text, answer text, and the `PUBLISHED BY YOUR TUTOR` badge. The question defaults to the Query subject or the opening message, and is editable before publishing.
3. The confirmation dialog names the cohort scope and states that the asking student's question text becomes the public question.
4. On confirm, the entry is created and the thread shows `Published by your tutor in the official FAQ` with a link.
5. Post-publish editing follows FR-REV-7: saving an edit withdraws the entry from student view until it is approved and published again, and the editor warns before saving.

Rules that make confusion unlikely:

1. The two controls never share a colour, an icon, or a label prefix. Publish always contains the word `official`; Reply always contains the word `privately`.
2. Publish is unavailable on a message that has not been sent, and unavailable to any non-tutor role.
3. A student sees no Publish control anywhere (US-S-15 criterion 4).
4. The thread header states the thread's visibility once: `Private between <student> and the tutors of this course.`

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Thread fetch in flight | Header plus skeleton messages | - |
| Empty | Not applicable in a thread: a thread always has at least one message | - | - |
| Error | Reply failed | The composer keeps the body and shows `We could not send your reply. Nothing was sent.` plus request id | `Try again` |
| Error | Publish failed | The confirmation dialog stays open with `We could not publish this answer. Nothing was published.` | `Try again`, `Cancel` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable | - | - |

### 5.5 Official FAQ management (tutor)

Route: `/tutor/assignments/{assignmentId}` tab `Discussions`, section `Official FAQ`.

Each entry row shows the question, the answer's first line, the publisher, the published date, the source (`From a student question`, `From a peer answer`, `Tutor written`, or `AI suggestion - approved`), and the display order. Actions: edit, reorder, unpublish, retire.

Editing an entry opens the same editor used for AI candidates, with the pre-approval badge while the edit is unsaved and the withdrawal warning of FR-REV-7. AI-suggested candidates appear in a separate `Suggestions` group carrying the pre-approval badge; approving one moves it into the FAQ list with the T2 treatment.

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Three skeleton rows | - |
| Empty | No entries and no candidates | `No official FAQ entries yet. Publish an answer from a question, or write one.` | `Write a FAQ entry` |
| Empty | Candidates only | The `Suggestions` group renders with the pre-approval badge, and the published list shows `No published entries yet.` | `Approve`, `Edit`, `Reject` per candidate |
| Error | Fetch failed | `We could not load the official FAQ.` | `Try again` |
| Error | Unpublish failed | `We could not unpublish this entry. It is still visible to students.` | `Try again` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable | - | - |

---

## 6. Discussions

Implements D25, D26, D28, D30. This section owns the discussion surface: the Official FAQ presentation, thread and post components, the anonymity display rules, moderation states, and flagging.

### 6.1 Structure

Both roles see the same two sections in the same order: `Official FAQ` (T2) and `Student discussion` (T4). The tutor tab adds a third section, `Moderation queue` (6.6).

Official FAQ rules:

1. Each entry shows the T2 treatment and `Published by your tutor on <date>`.
2. Entries are ordered by the tutor's display order, then by publish date.
3. An entry with a source link to the brief shows the `SourceLink`.
4. An entry can be collapsed to its question and expanded in place; expanding does not navigate away.
5. FAQ entries are the only discussion-derived content the Assistant can cite (O10).

Student discussion rules:

1. Threads are ordered by most recent post, newest first. Ordering is by time only, never by author (A-ID-4).
2. A thread row shows the title, the author label of the opening post, the reply count, and the last reply time.
3. The `Ask anonymously` control opens the composer with the anonymous toggle on.
4. The composer fields: title (new thread only, 5 to 200 characters), body (1 to 4000 characters), anonymous toggle, optional Milestone link, and `Post`.
5. The anonymous toggle carries the fixed hint `Your name will not be shown to anyone, including your tutor.` The attributed choice carries `Your name will be shown to the cohort.`

### 6.2 Thread and post components

```text
+---------------------------------------------------------------------------+
| Windows or macOS for the marker?                                          |
| Anonymous Student #482 - 3 Oct 14:02                                      |
| My project uses a Windows-only build step. Will the marker run Windows?    |
| [ Reply ]                                                                 |
|                                                                            |
|   +---------------------------------------------------------------------+ |
|   | Anonymous Student #482 - 3 Oct 14:20                                | |
|   | The submission brief says one file, so it has to run anywhere.      | |
|   |   [ Edit ] [ Delete ]        <- shown only on the student's own post | |
|   +---------------------------------------------------------------------+ |
|                                                                            |
|   +---------------------------------------------------------------------+ |
|   | PEER DISCUSSION - NOT OFFICIAL GUIDANCE                             | |
|   | Priya S. - 3 Oct 14:31                                              | |
|   | Check the rubric, code quality is 30%.                              | |
|   | Accepted response - approved by your tutor                           | |
|   +---------------------------------------------------------------------+ |
|                                                                            |
| [ Reply ]  [ Post anonymously ]                                            |
+---------------------------------------------------------------------------+
```

Rules:

1. Nesting is one level deep. Replies to replies render flat, in time order, with the parent quoted in one line. Deeper nesting is not offered, because it destroys readability at cohort scale.
2. Every post carries an `AuthorLabel`. The label is the only authorship element, and it renders either the pseudonym or the display name (6.3).
3. An accepted peer answer keeps the peer-content badge and adds `Accepted response - approved by your tutor`. It is never rendered with the T2 treatment, because it is still T4 (FR-PEER-4).
4. `Edit` and `Delete` appear only on the viewer's own post and only while the thread is open. `Delete` asks for confirmation and explains that the post will be removed from the discussion while moderation history is retained.
5. An edited post shows `Edited <time>`.
6. A removed post renders as a tombstone: `This post was removed by a tutor.` with no body and no author label beyond the pseudonym.
7. A post's body is never truncated without an explicit `Show more` control.
8. A tutor viewing a thread never sees `Edit` on a student post: tutors hide or remove and the thread says `Hidden by a tutor` or `Removed by a tutor`.

### 6.3 Anonymity display rules

| Actor | Sees | Never sees |
|---|---|---|
| Posting student (own post) | `Anonymous Student #482` as the public label, plus `Edit` and `Delete` affordances, plus a private note `You posted this anonymously.` | Their own real name attached to the post anywhere |
| Other students | `Anonymous Student #482`, stable within the assignment | Any name, avatar, email, profile link, or user id |
| Tutor | `Anonymous Student #482`, stable within the assignment, so continuity is visible and identity is not | Any name, avatar, email, profile link, user id, or a sort order that reveals authorship |
| Any role | The pseudonym differs in a different assignment | Correlation between assignments |

Implementation-facing rules:

1. The pseudonym is derived as specified in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 4.2. The interface never computes, caches, or re-derives it.
2. The `AuthorLabel` component accepts only `{ isAnonymised, displayLabel }` (A-ID-5). It has no prop that can carry a student identifier, which makes an accidental leak a type error rather than a review miss.
3. No avatar is rendered for an anonymous post. A placeholder avatar is a leak vector (identical placeholders by hash, or a colour derived from identity), so the label is text only.
4. The tutor's course roster is not shown inside a discussion thread, so a tutor cannot match pseudonyms to people by elimination in the interface.
5. Export and print views apply the same label. There is no printable author list.
6. A student who posts attributed in one thread and anonymously in another has two labels in the same screen; the interface does not connect them and does not warn the student about the difference beyond the composer hint.

### 6.4 Moderation states

| Post state | Cause | Student view | Tutor view | Author's own view |
|---|---|---|---|---|
| `visible` | Default, or a tutor approved a hidden post | Full post and author label | Full post, with `Hide` and `Remove` | Full post, with `Edit` and `Delete` |
| `hidden_pending_review` | A high-severity flag from the Discussion Moderator (O3) | Body replaced by `Hidden pending tutor review.` | Full post plus the flag reason and severity, with `Approve`, `Remove` | Body visible to the author with the note `Only you and your tutors can see this while it is reviewed.` |
| `removed` | A tutor removed it | Tombstone, no body | Full post with `Removed by <tutor> at <time>` and the ability to see it in the queue history | Tombstone, with the reason when a reason was recorded |
| deleted by author | The author deleted it (D28) | Absent from the thread | Absent from the thread; retained in the audit record | Absent |

Rules: the Discussion Moderator never removes content (D28); a hidden post is a reversible, review-pending state, not a punishment. Students never see flag counts, severity values, or reason codes (O3).

### 6.5 Flagging

Implements D30: one flag per student per post, feeding the tutor moderation queue, with no visibility of flag activity to students.

```text
Post footer:  [ Reply ]   [ Flag ]        <- Flag on any post that is not your own

Flag dialog:
+-------------------------------------------------------------+
| Flag this post                                              |
|                                                             |
| Why are you flagging it?                                    |
| ( ) Harassment                                              |
| ( ) Inappropriate content                                   |
| ( ) Personal information                                    |
| ( ) Answers someone else's assignment                       |
| ( ) Other                                                   |
|                                                             |
| [ Cancel ]                              [ Send to tutor ]   |
+-------------------------------------------------------------+
```

Rules:

1. `Flag` appears only on another person's post, and only once per student per post. After flagging, the control becomes the text `Flagged for tutor review`, disabled, with no count.
2. A second attempt is refused with `You have already flagged this post.` and creates no duplicate row.
3. The reason list maps to the `reason_code` values in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 7.5.4.
4. A student never sees how many flags a post has, who else flagged it, or what a tutor decided. The post either stays visible or becomes hidden or removed, and the state is explained by its own copy (6.4).
5. The flagger's identity is not shown to the tutor. The moderation queue shows the flag, the reason, and the target.
6. Flagging never removes a post by itself. High-severity AI flags hide pending review; student flags enter the queue.

### 6.6 Tutor Discussions tab

Route: `/tutor/assignments/{assignmentId}` tab `Discussions`.

```text
+---------------------------------------------------------------------------+
| Official FAQ                                                     [ Edit ] |
| +-----------------------------------------------------------------------+ |
| | Does the README count toward the file limit?   Published 2 Oct        | |
| +-----------------------------------------------------------------------+ |
|                                                                           |
| Student discussion                                            [ New post ]|
| +-----------------------------------------------------------------------+ |
| | Windows or macOS for the marker?      Anonymous Student #482          | |
| | 3 replies - last reply 1 hour ago                    [ Open thread ]  | |
| +-----------------------------------------------------------------------+ |
|                                                                           |
| Moderation queue                                                          |
| +-----------------------------------------------------------------------+ |
| | High - SOLUTIONS SHARING                    1 hour ago                | |
| | Anonymous Student #482 in "Windows or macOS for the marker?"          | |
| | "here is my full solution, copy the config below..."                  | |
| | Post hidden pending review.          [ Approve ] [ Remove ]           | |
| +-----------------------------------------------------------------------+ |
+---------------------------------------------------------------------------+
```

Tutor rules:

1. The tutor sees the same author labels as everyone else (6.3). There is no "who is this?" control, no hover reveal, and no profile link.
2. Moderation actions are `Approve` (unhide), `Hide`, and `Remove`, each with an optional reason. Every action is recorded with the tutor's identity.
3. On a peer answer the tutor also sees `Approve answer`, `Reject answer`, and `Reply`, and `Publish to the official FAQ` becomes available once the answer is approved (section 6 of [`03-PRD.md`](03-PRD.md); O8).
4. The moderation queue shows a flag's source (`AI` or `Student flag`), severity, reason code, target, and a one-line excerpt. It never shows the flagger.
5. Removing a post does not delete it and does not remove its thread's replies.

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Skeleton sections | - |
| Empty | No threads | `No discussion threads yet.` | `New post` |
| Empty | No open flags | `Nothing to review.` The queue section stays visible so its absence is not mistaken for a failure | - |
| Empty | No FAQ entries | `No official FAQ entries yet.` | `Write a FAQ entry`, or publish from a Query |
| Error | Fetch failed | `We could not load the discussions.` plus request id | `Try again` |
| Error | Moderation action failed | The post keeps its previous state and a toast reads `We could not save that decision. Nothing was changed.` | `Try again` |
| Insufficient data | Not applicable: the queue is a work list, not an aggregate | - | - |
| Refused request | Not applicable: moderation decisions are human | - | - |

---

## 7. Tutor ingestion and approval

Implements C3, D21, and D22. The whole flow carries one idea: nothing AI-generated is student-visible until the tutor approves it and publishes it.

### 7.1 Add assignment (upload)

Route: `/tutor/courses/{courseId}/assignments/new`. Roles: tutor on the course.

```text
+---------------------------------------------------------------------------+
| Add assignment                                                            |
|---------------------------------------------------------------------------|
| Title  [______________________________________]                           |
| Due    [ optional date ]                       Course: COSC1234           |
|---------------------------------------------------------------------------|
| +-----------------------------------------------------------------------+ |
| |  Drop files here, or choose files                                     | |
| |  PDF, DOCX, PPTX, PNG, JPEG, TXT, MD - up to 10 files                 | |
| +-----------------------------------------------------------------------+ |
|                                                                           |
| Uploaded materials                                                        |
| +-----------------------------------------------------------------------+ |
| | assignment-brief.pdf     Brief         12 pages   extracted    [x]    | |
| | rubric.pdf               Rubric         2 pages   extracted    [x]    | |
| | ai-guidelines.docx       AI policy      1 page    extracted    [x]    | |
| | scan-of-part-2.png       Supplementary  -         pending      [x]    | |
| +-----------------------------------------------------------------------+ |
|                                                                           |
| Nothing here is visible to students until you review, approve, and         |
| publish it.                                                               |
|                                                                           |
| [ Start analysis ]                                     [ Save draft ]     |
+---------------------------------------------------------------------------+
```

Rules:

1. Multiple files in one session, drag and drop or picker. Each row shows the filename, the inferred kind with a control to change it, the page count when known, the extraction status, and a remove control (FR-ING-1, FR-ING-3).
2. Supported formats are stated on the drop zone. An unsupported file is refused with `This file type is not supported. Supported: PDF, DOCX, PPTX, PNG, JPEG, TXT, MD.` and no row is created (O5, D57, FR-ING-2).
3. A file over the limit is refused with the limit stated in megabytes.
4. `Start analysis` is enabled when at least one file has kind `brief` and no extraction is in flight (FR-ING-5, FR-REV-5).
5. The screen states the approval boundary in the fixed sentence shown above, so the tutor knows nothing is live yet.
6. A duplicate file (same checksum) is offered as `This looks like a file you already uploaded.` with options to keep both or replace.

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Upload in progress | The row appears immediately with a progress bar and `Uploading...`; the rest of the screen stays interactive | `Cancel` on that row |
| Empty | No files yet | The drop zone with the supported-format line | `Choose files` |
| Error | Upload rejected | Inline row error with the reason (format, size), and the file is not listed | `Try another file` |
| Error | Extraction failed for a file | The row shows `Could not read this file.` with `Remove` and `Try again`; other files are unaffected (FR-ING-10) | `Remove`, `Try again` |
| Error | Title missing at `Start analysis` | Field-level validation on the title, and `Start analysis` stays disabled | - |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable: the Assignment Analyst does not refuse tutor uploads; it reports extraction failures | - | - |

### 7.2 Ingestion progress

Same route, after `Start analysis`.

```text
+---------------------------------------------------------------------------+
| Analysing assignment documents                                            |
|---------------------------------------------------------------------------|
| [x] Extracting text           3 of 4 files                    1m 12s       |
| [ ] Reading the brief and rubric                                          |
| [ ] Proposing structure and Milestones                                    |
| [ ] Proposing Checklist items and FAQ suggestions                         |
| [ ] Extracting the AI usage policy                                        |
| [ ] Checking for ambiguity and contradictions                             |
|---------------------------------------------------------------------------|
| You can leave this page. The analysis continues and you will find the      |
| results in Review.                                                         |
|---------------------------------------------------------------------------|
| scan-of-part-2.png could not be read. Remove or replace it and run the     |
| analysis again; your other files are kept.                                 |
|                                            [ Remove file ]  [ Run again ]   |
+---------------------------------------------------------------------------+
```

Rules:

1. Stages are named in the tutor's language, not the pipeline's: extracting, reading, proposing structure, proposing Checklist and FAQ suggestions, extracting the policy, checking for ambiguity. Internal capability names never appear (D13).
2. A run can be left and returned to; progress is server-side (FR-ING-5).
3. A failed file is named, and the other files keep their results (FR-ING-10).
4. On completion the tutor is taken to the review screen with a summary line: `24 items proposed. Review them before publishing.`

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Run in flight | The stage list with completed, current, and pending marks, plus elapsed time | `Leave page` |
| Loading | Long run (>90s) | The same list plus `Still working. Large documents can take a couple of minutes.` | - |
| Empty | Not applicable: a run is always in one of its states | - | - |
| Error | Ingestion failed entirely | `The analysis could not finish. Nothing was published.` plus the failing stage and request id | `Run again`, `Back to uploads` |
| Error | A second run requested while one is running | Inline notice `An analysis is already running.` and the button is disabled (FR-ING-5, `INGESTION_IN_PROGRESS`) | - |
| Error | Provider unavailable | `The analysis service is unavailable right now. Your files are saved.` plus request id | `Run again` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable | - | - |

### 7.3 Review and approval

Route: `/tutor/assignments/{assignmentId}/review`.

```text
+---------------------------------------------------------------------------+
| Review assignment A          Needs review 18 | Edited 2 | Approved 4        |
|                              [ Approve all reviewed ]   [ Publish ]        |
|---------------------------------------------------------------------------|
| Uploaded materials          | AI generated - requires tutor approval       |
| - assignment-brief.pdf p.1  | +------------------------------------------+ |
| - rubric.pdf p.1            | | Requirement 1  Deliverable and submission| |
|                             | | AI GENERATED - REQUIRES TUTOR APPROVAL   | |
|                             | | Verbatim: "Submit one file only."        | |
|                             | | From: assignment-brief.pdf p.4  [ Open ] | |
|                             | | Summary: ...            [ Edit ]         | |
|                             | | Provenance: gemini-3.8-flash, ingest-v3  | |
|                             | | [ Approve ]  [ Reject ]                  | |
|                             | +------------------------------------------+ |
|                             | | Milestone 2 - Design                     | |
|                             | | AI GENERATED - REQUIRES TUTOR APPROVAL   | |
|                             | | ! Checklist item 4 names an action       | |
|                             | |   ("Implement endpoints"). Fix or reject.| |
|                             | | [ Fix ]  [ Reject ]                      | |
|                             | +------------------------------------------+ |
|                             | Groups: Requirements | Rubric | Milestones | |
|                             | Checklist | FAQ suggestions | AI policy |    |
+---------------------------------------------------------------------------+
```

Artifact card rules:

1. Every AI artifact carries the pre-approval badge in every state: collapsed, expanded, editing, and in the validation list (glossary section 4, C3).
2. A verbatim field is shown read-only with its source link. A summary or interpretation field is editable inline. The interface never presents the editable field as the requirement.
3. Provenance is visible on demand: model id, prompt version, generation time, and the grounding sources.
4. A validation warning is rendered inside the card, with the fix or reject options. Approving an artifact with warnings requires acknowledging each one, and the acknowledgement is recorded.
5. A `VERBATIM_MISMATCH` warning cannot be acknowledged: the card offers `Reject` and `Open the source document` only.
6. Checklist items display their planning level, and an item with an implementation verb shows the warning in the tutor's words: `Checklist items describe what to understand or verify, not what to build.`
7. `Approve all reviewed` approves every artifact that has no unacknowledged warning, and reports what it skipped and why.
8. Group filters: Requirements, Rubric, Milestones, Checklist, FAQ suggestions, AI policy. Each group header shows its own status counts.
9. The uploaded materials panel is always beside the artifacts, so the tutor can compare a proposal with its source without navigating away (FR-REV-1).
10. The `Publish` control is visible from the first load but disabled with the blockers listed: no brief, no Milestone, no approved AI Usage Policy rule, unacknowledged warnings (FR-REV-5).

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Two-column skeleton with the materials panel and three artifact skeletons | - |
| Empty | No run yet | `Nothing has been analysed yet. Upload the assignment documents to start.` | `Upload documents` |
| Empty | A group with no artifacts | The group renders `No items proposed for this group.` | `Add one` where the artifact kind allows tutor authoring |
| Error | Fetch failed | `We could not load the review items.` plus request id | `Try again` |
| Error | Save failed | The card keeps the tutor's edit in a local draft and shows `We could not save this change. Nothing was changed on the server.` | `Try again`, `Discard` |
| Error | Stale revision (another tutor saved) | `Another tutor changed this item while you were editing.` with a side-by-side comparison and a choice | `Keep mine`, `Use theirs` |
| Insufficient data | Not applicable: review counts are workflow counts | - | - |
| Refused request | Not applicable: the Assignment Analyst does not refuse; validation blocks instead | - | - |

### 7.4 Publish

```text
+---------------------------------------------------------------------------+
| Publish assignment A                                                      |
|---------------------------------------------------------------------------|
| This will make the following visible to every enrolled student:           |
|   Requirements            6                                                |
|   Rubric sections         4                                                |
|   Milestones              4    (18 Checklist items)                        |
|   Official FAQ entries    3                                                |
|   AI usage policy rules   5                                                |
|                                                                           |
| Still needs review and will NOT be published:                             |
|   FAQ suggestions         2                                                |
|                                                                           |
| Open ambiguity findings: 1 (does not block publishing)                    |
|   Potential contradiction - Brief p.4 vs Rubric p.2     [ View finding ]  |
|                                                                           |
| Students will see the original documents, the Assignment Map, the          |
| Checklist, and the published policy. Nothing unpublished becomes visible.  |
|                                                                           |
| [ Cancel ]                                              [ Publish ]        |
+---------------------------------------------------------------------------+
```

Rules:

1. The confirmation lists exactly what becomes visible by artifact kind and count, and what does not (FR-REV-6, US-T-10).
2. Open ambiguity findings are listed and explicitly stated as non-blocking (FR-AMB-9).
3. Publish is a single action, recorded with the tutor's identity.
4. After publish, the assignment card shows `Published` and the review screen becomes read-only except for edits, each of which carries the withdrawal warning (FR-REV-7).

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Publish in flight | The dialog stays open with `Publishing...`, controls disabled | - |
| Empty | Not applicable | - | - |
| Error | Publish blocked | The dialog lists the blockers with links to fix each | `Go to blockers`, `Cancel` |
| Error | Publish failed | `We could not publish. Nothing was made visible.` plus request id | `Try again` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable | - | - |

### 7.5 Ambiguity findings panel

Accessible from the review screen and from the publish dialog. Tutor-facing only, never student-visible.

Layout, content, and the three closure actions are specified in [`03-PRD.md`](03-PRD.md) section 5.2 and [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 7.2.12. The UI rules that matter:

1. The panel is rendered with the AI interpretation treatment and its provenance, so a finding is never mistaken for an official statement.
2. A contradiction shows both verbatim excerpts side by side, each with its page or section label.
3. There is no text field for clarification wording anywhere in this panel. The only resolution control lists FAQ entries the tutor has already published (D23).
4. `Dismiss with reason` requires a reason.
5. Findings never appear in the student workspace, at any status.

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | Two skeleton finding cards | - |
| Empty | No findings | `No potential ambiguities or contradictions were found.` plus `This is not a guarantee that the assignment is unambiguous.` | - |
| Error | Fetch failed | `We could not load the findings.` plus request id | `Try again` |
| Error | Resolve failed | The card stays open with `We could not record that decision.` | `Try again` |
| Insufficient data | Not applicable | - | - |
| Refused request | Not applicable: this is a detection surface, and it never answers a question | - | - |

---

## 8. Tutor Analysis tab

Route: `/tutor/assignments/{assignmentId}` tab `Analysis`. Implements C5, D31-D35 and [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md).

```text
+---------------------------------------------------------------------------+
| ASSIGNMENT HEALTH                          Window: last 14 days [ Change ] |
|---------------------------------------------------------------------------|
| Average resolution rate  68% Students active  24 / 37                     |
| Potential difficulty areas  1                                             |
|---------------------------------------------------------------------------|
| Milestone performance                                                     |
| Milestone           Contributors  Avg elapsed  Resolution rate  Questions |
| Requirements                  31          18m              94%          3 |
| Database design               28          47m              71%         28 |
| API implementation            24       1h 12m              54%         41 |
| Testing                       29          32m              83%          9 |
| Assistant turns (M6)         118  reported separately, not question vol   |
|---------------------------------------------------------------------------|
| [Demo data] This view is computed by the real aggregation over a synthetic |
| cohort. No real student data exists in this project.                       |
|---------------------------------------------------------------------------|
| Potential difficulty detected                                             |
| API implementation: students are spending more time here (1h 12m average,  |
| above the assignment average) and asking more questions (41, the highest). |
|                                                                           |
| [ View related questions ]                                                |
+---------------------------------------------------------------------------+
```

Rules:

1. The window is always stated in words and is changeable. No number is shown without its window.
2. Elapsed time is labelled `Avg elapsed` and explained once: `Elapsed time counts from start to completion, including time away from the page.` Never "time worked" or "time on task" (D33).
3. Difficulty is stated only when both signals are present: elapsed time above the assignment average and question volume above the assignment average. One signal alone is shown as data, not as a difficulty area (D34).
4. The difficulty panel names the evidence and stops. It offers a route to the related questions, and no recommendation, priority, or prescribed action (D35).
5. No row, tooltip, export, or drill-down identifies a student. There is no student list view, no per-student row, and no sorting by anything student-derived (FR-TO-9, FR-TO-10).
6. Contributor count is shown only for buckets at or above the floor of 5. A bucket below the floor renders the **Insufficient data** state (8.2).
7. `View related questions` switches to the Queries tab filtered by that Milestone, which is human content, not per-student data.
8. Question volume counts **tutor-directed questions only**: private Queries plus discussion posts that received a moderation flag (D49). Assistant turns are shown as a separate `Assistant turns (M6)` figure, are never added to question volume, and never trigger a potential difficulty area on their own.
9. The view carries a visible `Demo data` marker, because the aggregation is real code over a synthetic cohort and the presenter must be able to say so in the same breath ([`02-SCOPE.md`](02-SCOPE.md) section 5).
10. `Average resolution rate` is the mean of per-student resolution rates; the per-milestone `Resolution rate` column is a cohort ratio over approved items. Neither is called "completion" (D56).

### 8.1 Empty and unsupported states

| State | Trigger | What the tutor sees | Controls |
|---|---|---|---|
| Loading | Fetch in flight | The headline as skeletons, the milestone table with skeleton rows, no difficulty panel yet | - |
| Empty | The assignment is published but no student activity exists yet | `No activity yet. Assignment Health will appear once students start working.` The window selector stays visible | `Refresh` |
| Empty | A Milestone with no data at all (no events, no questions) | The row renders with `Insufficient data` (8.2) rather than a zero row | - |
| Error | Fetch failed | `We could not load Assignment Health.` plus request id | `Try again` |
| Error | Stale aggregate | `This view was computed <time> ago.` with a `Recompute` control when the age exceeds the window refresh interval | `Recompute` |
| Insufficient data | A milestone has fewer than 5 contributors | The row shows `Insufficient data - fewer than 5 students have worked on this Milestone.` in place of every metric. No count, no zero, no estimate (D32, US-T-19) | - |
| Insufficient data | Fewer than 5 students enrolled | The headline shows `Insufficient data` for the activity metrics and still shows the enrolment count, which is an enrolment fact rather than student activity | - |
| Refused request | Not applicable: Analysis answers no questions and makes no model call | - | - |

### 8.2 Insufficient data treatment

```text
| API implementation        Insufficient data - fewer than 5 students have    |
|                           worked on this Milestone.                        |
```

Rules:

1. The treatment is neutral, not an error and not a warning (2.1).
2. It never shows a contributor count, and it never hints at the real number with wording such as "very few" or "1 to 4".
3. The explanation sentence is fixed (2.5) so the guarantee is stated consistently.
4. The state is also used when a Milestone has no events at all, so "no data" and "too little data" are indistinguishable to the tutor, which is deliberate.

---

## 9. Cross-cutting interaction behaviour

### 9.1 Deep links

| Link | Target | Behaviour |
|---|---|---|
| Workspace tab | `/student/assignments/{id}?tab=checklist` | Opens the workspace on that tab; an unpublished tab falls back to Assignment/Info and does not error |
| Brief page | `/student/assignments/{id}?tab=info&doc={sourceId}&page={n}` | Opens the viewer at the page and briefly highlights the page frame |
| Map node | `...?tab=info&node={nodeId}` | Opens the Map, expands to the node, selects it, and opens its detail panel |
| Milestone | `...?tab=checklist&milestone={milestoneId}` | Expands that Milestone and scrolls it into view |
| Source link anywhere | `...?tab=info&doc={sourceId}&page={n}` | A `SourceLink` always resolves to a page in the official viewer, never to a Map node |
| Refusal escalation | `/student/assignments/{id}?tab=queries&draft={token}` | Opens the Query composer with the student's request pre-filled; the student still presses send |
| Proactive message | `...?tab=info&milestone={milestoneId}` from a bullet's source link | Opens the cited source, not the Assistant |

A deep link never bypasses authorization: every route re-checks role and enrollment, and an unauthorized link renders the not-found screen (3.2).

### 9.2 Notification counts

| Count | Appears on | Source | Rules |
|---|---|---|---|
| New tutor replies | Student shell, My Queries tab | Queries with a tutor message newer than the student's last read | Cleared when the thread is opened |
| Undismissed proactive message | Assistant FAB | `assistant_proactive_messages.dismissed_at is null` for the current Milestone | Cleared on dismiss |
| Open Queries | Tutor shell, Queries tab | Queries with status `open` | Never shows a per-student breakdown |
| Items needing review | Tutor shell, assignment card | Artifacts in `NEEDS_REVIEW` or `EDITED` | Workflow count, safe to show |
| Moderation queue size | Tutor Discussions tab | Open moderation flags | Shown to tutors only; never to students |

A count never appears for content a role cannot act on, and a count is never a surrogate for a per-student metric.

### 9.3 Interface guards versus server enforcement

The interface hides what a role cannot do; the server refuses it anyway. Both are required, and the interface's hiding is never the enforcement.

| Situation | Interface | Server |
|---|---|---|
| Student opens a tutor route | Not-found screen, real navigation preserved | `FORBIDDEN_ROLE` or `NOT_FOUND` |
| Student on another student's Query | Never linked; a guessed URL renders not-found | `NOT_FOUND` |
| Student tries to publish | No Publish control exists anywhere | `FORBIDDEN_ROLE` |
| Student tries to edit another's post | No Edit control; a direct PATCH fails | `NOT_FOUND` |
| Tutor tries to see an anonymous author | No control, no hover reveal, no profile link, no author sort | No field exists in the response (A-ID-5) |
| Tutor opens an assignment in another course | Not linked | `NOT_FOUND` |
| Student opens an unpublished assignment | Not linked | `NOT_FOUND` |

### 9.4 Error and refusal copy catalogue

| Server code | Interface copy | Treatment |
|---|---|---|
| `VALIDATION_FAILED` | Field-level messages from `details.fields` | Inline field |
| `NOT_FOUND` | `This item is no longer available.` | Not-found screen or inline panel |
| `FORBIDDEN_ROLE` | `This account cannot open this screen.` | Not-found screen |
| `IMMUTABLE_FIELD` | `This text comes from the original document and cannot be edited here. Change the document and run the analysis again, or publish a clarification as an official FAQ entry.` | Inline panel on the field |
| `INVALID_STATE_TRANSITION` | `That action is not available in the current state.` plus the state in words | Inline panel |
| `STALE_REVISION` | `Another tutor changed this item while you were editing.` | Comparison dialog |
| `INGESTION_IN_PROGRESS` | `An analysis is already running.` | Inline notice |
| `NO_SOURCES` | `Upload at least one document before starting the analysis.` | Inline notice on the upload screen |
| `EXTRACTION_FAILED` | `This document could not be read.` plus the file name | Row error |
| `UNSUPPORTED_FORMAT` | `This file type is not supported. Supported: <list>.` | Row error |
| `PAYLOAD_TOO_LARGE` | `This file is larger than the <n> MB limit.` | Row error |
| `RATE_LIMITED` | `Try again in <n> minutes.` | Inline notice, controls disabled until the window passes |
| `LLM_UNAVAILABLE` | `The Assistant is unavailable right now. Your assignment documents are still available above.` | Assistant panel error |
| `LLM_OUTPUT_INVALID` | `I could not produce a reliable answer, so I did not answer. Nothing was changed.` | Refusal treatment |
| `INTERNAL` | `Something went wrong on our side. Nothing was changed.` plus request id | Error panel |
| Verdict `REFUSE` (`POL_ABSENT`) | The unavailable state: `The Assistant is unavailable for this assignment because no AI usage policy has been approved yet. Ask your tutor privately.` | Boundary treatment, composer replaced (D47) |
| Verdict `REFUSE` | The refusal panel (4.7.3) | Boundary treatment |
| Verdict `CLARIFY` | The clarification question with two interpretations | Boundary treatment |
| Verdict `ESCALATE_TO_TUTOR` | The refusal panel plus `Ask your tutor privately` | Boundary treatment |

### 9.5 Perceived performance

| Interaction | Target | Mechanism |
|---|---|---|
| Workspace bootstrap | First content under 2 s (NFR-PERF-1) | Server-rendered shell with the official document first; Map and Checklist stream in after |
| Checklist start and complete | Immediate | Optimistic state with server reconciliation; revert plus toast on failure |
| Assistant send | First token under 3 s live, under 1 s with `mock` | Streaming; the guardrail verdict arrives first and is rendered immediately |
| Ingestion | Progress visible within 1 s of starting | Stage list rendered from the first poll; no blocking modal |
| Assignment Health | Under 2 s for 40 students and 6 Milestones | Pre-computed metrics rows; the tab reads a read model, not raw events |
| Map with 60 nodes | Interaction stays responsive | Rendered as a tree/list below 900 px; above that, only the selected subtree is expanded by default |

### 9.6 Print and export

1. There is no per-student export anywhere in the product. The API has no such endpoint (see [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 5.4).
2. A discussion export, if one is ever added, keeps the `Anonymous Student #<n>` labels, includes no author list, and is ordered by time.
3. Printing the workspace prints the official document in the official treatment and the Map in the interpretation treatment, badges included.
4. Assignment Health prints with its window and its **Insufficient data** rows intact.

---

## 10. Traceability matrix

### 10.1 Screens, states, interfaces

Every screen in the required list, with its section, its primary interfaces, and its decisions. "States" names the state kinds the screen defines; all five kinds are defined for every screen, with non-applicable kinds justified in place.

| Screen or surface | Route | Section | Primary endpoints | Decisions | States defined |
|---|---|---|---|---|---|
| Student login | `/login` | 3.1 | `POST /api/auth/login`, `GET /api/auth/session` | D42 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Student dashboard | `/student` | 3.4 | `GET /api/courses` | D1, D3 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Student assignments | `/student/courses/{courseId}` | 3.5 | `GET /api/courses/{courseId}/assignments` | D1, D3 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Workspace shell | `/student/assignments/{id}` | 4.1 | `GET /api/student/assignments/{id}` | D1, D36 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Assignment/Info tab - official brief viewer | `...?tab=info` | 4.2 | `GET .../brief` | C2, D17, D43 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Assignment/Info tab - Assignment Map | `...?tab=info` | 4.3 | `GET .../structure` | D18, D19, D43 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| My Queries tab | `...?tab=queries` | 4.4, 5.1 | `GET/POST .../queries`, `GET /api/student/queries/{id}`, `POST .../messages`, `POST .../resolve` | D24, O9 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Discussions tab (student) | `...?tab=discussions` | 4.5, 6.1-6.5 | `GET .../discussions`, `GET .../faq-entries`, thread and post writes, flag | D25, D26, D28, D30 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Checklist tab | `...?tab=checklist` | 4.6 | `GET .../checklist`, three transition endpoints | D19, D20, D33, D48, O1 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Assistant panel | FAB on all four tabs | 4.7 | `GET .../assistant/session`, `POST .../assistant/messages`, proactive endpoints | C1, D4, D6, D8, D11, D13, D47, O2, O11 | Loading (request, stream), empty, error (four variants), insufficient data (n/a), refused (including the unavailable variant) |
| Tutor login | `/login` | 3.1 | `POST /api/auth/login` | D42 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Tutor dashboard | `/tutor` | 3.6 | `GET /api/courses` | D3 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Tutor assignments | `/tutor/courses/{courseId}` | 3.7 | `GET /api/courses/{courseId}/assignments` | D1, D21 | Loading, empty, error, insufficient data (n/a), refused (n/a) |
| Add assignment - upload | `/tutor/courses/{courseId}/assignments/new` | 7.1 | `POST /api/tutor/courses/{courseId}/assignments`, `POST .../sources` | O5, FR-ING-1 to FR-ING-3 | Loading, empty, error (three variants), insufficient data (n/a), refused (n/a) |
| Add assignment - ingestion | same route | 7.2 | `POST .../ingest`, `GET .../ingest` | D12, FR-ING-5, FR-ING-10 | Loading (two variants), empty (n/a), error (three variants), insufficient data (n/a), refused (n/a) |
| Review and approval | `/tutor/assignments/{id}/review` | 7.3 | `GET .../review`, `PATCH /api/tutor/structure-artifacts/{id}`, `POST .../approve` | C3, D21, D22 | Loading, empty (two variants), error (three variants), insufficient data (n/a), refused (n/a) |
| Publish | review route, dialog | 7.4 | `POST .../publish` | D21, D22, FR-REV-5 | Loading, empty (n/a), error (two variants), insufficient data (n/a), refused (n/a) |
| Ambiguity findings | review route, panel | 7.5 | `GET .../ambiguity-findings`, `PATCH /api/tutor/ambiguity-findings/{id}` | D23 | Loading, empty, error (two variants), insufficient data (n/a), refused (n/a) |
| Tutor Queries tab | `...?tab=queries` | 5.2 | `GET .../queries` (grouped) | D24, FR-TO-1 | Loading, empty (two variants), error (two variants), insufficient data (n/a), refused (n/a) |
| Query detail and Reply/Publish | query route | 5.3, 5.4 | `GET /api/tutor/queries/{id}`, `POST .../reply`, `POST .../publish` | D24, O8 | Loading, empty (n/a), error (two variants), insufficient data (n/a), refused (n/a) |
| Official FAQ management | Discussions tab, section 1 | 5.5, 6.1 | `GET/PATCH/DELETE /api/tutor/faq-entries/{id}`, `POST /api/tutor/assignments/{id}/artifacts` | D24, D29, O8 | Loading, empty (two variants), error (two variants), insufficient data (n/a), refused (n/a) |
| Tutor Discussions tab | `...?tab=discussions` | 6.6 | `GET .../discussions`, `POST /api/tutor/discussion-posts/{id}/moderate`, `/answer-review`, `/promote-to-faq` | D28, D29, O3, O8 | Loading, empty (three variants), error (two variants), insufficient data (n/a), refused (n/a) |
| Tutor Analysis tab | `...?tab=analysis` | 8 | `GET .../analytics`, `GET .../analytics/milestones/{id}` | C5, D31-D35, D49 | Loading, empty (two variants), error (two variants), insufficient data (two variants), refused (n/a) |

### 10.2 Constraint coverage

| Constraint | Where the interface satisfies it |
|---|---|
| C1 (never does the work) | 4.7.3 refusal panel; 2.5 fixed refusal copy; 9.4 refusal catalogue |
| C2 (never paraphrases the requirement) | 2.2 official treatment; 4.2 viewer rules; 4.3 quoted verbatim rule; 2.4 anti-patterns 1, 2, 7 |
| C3 (nothing AI-generated is student-visible before Approval) | 2.2 pre-approval badge; 7.3 artifact cards; 7.4 publish scope list |
| C4 (tutor cannot see the identity behind an anonymous post) | 6.3 anonymity table; 2.4 anti-patterns 11, 12 |
| C5 (aggregate-only analytics) | 8 rules 5 and 6; 8.2 Insufficient data; 2.4 anti-patterns 9, 13 |
| C6 (uploads are not a route around C1) | 4.7.2 rule 5, which now covers the three surviving modalities (image, PDF, text) and the blocked-upload chip path those three can reach; 2.5 blocked-upload and audio/video-boundary strings; 2.1 refused-request state |
| C7 (no secret in a response or a log) | 4.2 rules 7 and 10 (the viewer exposes no download, print, or byte-serving control, so no document URL is minted for a client to hold); 9.4 errors carry a request id and no internals |
| C8 (adapter-only model calls) | No interface consequence; verified by lint (test T-14 in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 9.2) |

### 10.3 Open interface questions

1. Anonymous Queries: this doc assumes Queries are attributed (5.2 rule 4, 4.4). If the answer changes, the Query card, the composer hint, and the `AuthorLabel` usage in Queries change together.
2. Whether the Assignment Map keeps a canvas view above 900 px or is always the tree/list form. The tree/list form is the accessible default; the canvas is an enhancement and must not become the only way to read the Map.
3. If O11 is widened again (audio or video back in scope), three places change together: the picker in 4.7.2 rule 5, the fixed strings in 2.5, and the C6 coverage row in 10.2. The guard itself does not change, because it is modality-independent by design.
4. The four refusal layouts are keyed to `refusalTemplateId` (4.7.3 rule 5). If [`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md) adds a fifth template, this doc needs a fifth layout rather than a fallback to the generic error panel.



