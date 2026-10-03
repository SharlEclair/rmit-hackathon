# 03 - Product Requirements

**Purpose.** What the product must do, for whom, and how we know it does it. This doc states requirements; it does not restate the schema ([`06-DATA-MODEL.md`](06-DATA-MODEL.md)), the screens ([`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md)), or the guardrail procedure ([`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md)).

**Normative parents.** [`../AGENTS.md`](../AGENTS.md) (constraints C1-C8), [`01-DECISIONS.md`](01-DECISIONS.md) (D1-D73, O1-O12), [`15-GLOSSARY.md`](15-GLOSSARY.md) (vocabulary). Scope is decided in [`02-SCOPE.md`](02-SCOPE.md); where this doc appears to enlarge scope, 02 wins.

**One-sentence product model.** Tutors upload an assignment and its supporting documents; the system turns them into a tutor-approved assignment structure (Assignment Map, Milestones, Checklist, FAQ entries, AI Usage Policy, ambiguity findings); students work through the assignment using the original brief, that structure, anonymous Discussions, private Queries, and a strictly constrained Assignment Assistant; tutors receive aggregate insight into where the cohort is spending time and asking questions.

**The single most important sentence.** The AI must never do the assignment for the student. Every requirement below is subordinate to that sentence, and a requirement that improves helpfulness while weakening it is rejected rather than traded off.

---

## 1. Problem, users, and jobs

### 1.1 Problem

Derived from [`project idea.md`](project%20idea.md) sections 1 and 5.

| Affected | Problem | Consequence |
|---|---|---|
| Student | The brief and Rubric are long, ambiguous, or hard to map onto work | Time lost to interpretation rather than the assignment; quiet misreading of requirements |
| Student | Asking for clarification carries a social cost: "stupid" questions, fear of judgement, not wanting to bother the tutor, or a question too personal to post publicly | Questions go unasked, so the misunderstanding persists and surfaces at marking |
| Student | The permitted use of AI differs per assignment and is often unclear | Either over-reliance (integrity risk) or avoidance of legitimate help |
| Tutor | The same question arrives repeatedly, in private, one student at a time | Repetitive answering, no leverage, no shared knowledge base |
| Tutor | Which parts of the assignment are actually causing difficulty is invisible until marks are poor | Interventions happen after the learning window |
| Tutor | Ambiguity and contradictions in the brief surface only once students start work | Clarifications arrive late and land in scattered private threads |
| Both | A general-purpose AI assistant will happily write the answer | The one thing the product must not do is the thing an unconstrained assistant does best |

### 1.2 Users and roles

| Role | Who | What they need | What they must never get |
|---|---|---|---|
| Student | An enrolled university student working on one assignment at a time | Understand the requirement, navigate the work, track their own progress, ask safely, get bounded AI help | An assistant that does the work; exposure of their identity when they chose anonymity; visibility of another student's private Query |
| Tutor | A teacher or marker on the course | See the assignment turned into a reviewable structure quickly; group and answer questions; publish official answers; see where the cohort struggles | Per-student analytics; the identity behind an anonymous post; the system authoring the clarification for them |
| Both | Same person may hold both roles in different courses (D42: two roles exist, `student` and `tutor`) | Role-appropriate landing and navigation | A single blended view that confuses the two capacities |

There is no third role. There is no administrator in the MVP.

### 1.3 Jobs to be done

| # | Job | Primary role | Requirement sections |
|---|---|---|---|
| J1 | "Tell me what this assignment actually requires, in the assignment's own words." | Student | 3, 4.2 |
| J2 | "Show me how the assignment is structured so I can navigate it." | Student | 3 |
| J3 | "Let me track where I am without telling me how to do the work." | Student | 3 |
| J4 | "Let me ask a question without paying a social price." | Student | 6, 7 |
| J5 | "Help me understand and plan, but refuse to do the work, and tell me why it refused." | Student | 3 |
| J6 | "Turn my documents into a structure I can check, correct, and approve." | Tutor | 4.1, 4.2, 5 |
| J7 | "Tell me where my own assignment is ambiguous or contradictory, and let me decide what to do about it." | Tutor | 5 |
| J8 | "Stop me answering the same question twelve times." | Tutor | 7 |
| J9 | "Show me where the cohort is struggling, as evidence, without naming anyone." | Tutor | 4.3, 7 |

### 1.4 Product principles that shape every requirement

| # | Principle | Source |
|---|---|---|
| P1 | The assignment is the central object. All functionality is contextualised around one assignment. | D1 |
| P2 | The product is an AI-native assignment workspace, never "ChatGPT for assignments". | D2 |
| P3 | Student workspace and tutor insight are equal halves. Neither is a secondary feature. | D3 |
| P4 | The Assistant guides, clarifies, contextualises, and enforces boundaries. It never solves, implements, debugs, or evaluates. | D4, C1 |
| P5 | The original document is authoritative and shown verbatim. Interpretation is labelled as interpretation. | C2, D17, D18 |
| P6 | Nothing AI-generated becomes student-visible before tutor Approval. | C3, D21, D22 |
| P7 | Anonymity is absolute or it is worthless. | C4, D25, D26, D27 |
| P8 | Cohort insight is aggregate only, with a k-anonymity floor. | C5, D31, D32 |
| P9 | Detection is a model task; authoring official clarification is the tutor's professional judgement. | D23 |
| P10 | No course teaching content is ingested. Scope is the assignment and approved assignment material. | D5 |

---

## 2. Scope and constraints

1. The committed MVP scope is [`02-SCOPE.md`](02-SCOPE.md). This doc does not add features to it. Every requirement below is either in scope or explicitly marked as owned by another doc.
2. Constraints C1-C8 in [`../AGENTS.md`](../AGENTS.md) are absolute. Each functional requirement names the constraint it serves; a requirement with no constraint behind it is a candidate for removal.
3. Rejected approaches are listed in [`01-DECISIONS.md`](01-DECISIONS.md) section H and are not re-litigated here.
4. Requirement language: **must** is mandatory for the MVP, **should** is expected but may be trimmed by 02 without changing this doc's intent, **may** is optional.

---

## 3. Student requirements

Every story is testable as written. Where a story depends on an interface detail, the owning section of [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) is named.

### US-S-1 - Sign in and land on my courses

**As a** student, **I want** to sign in with my email and password and land on my courses, **so that** I reach my work in one step.

Acceptance criteria:

1. A valid credential pair sets an httpOnly session cookie and routes to the student dashboard (D42).
2. An invalid pair returns the same message for an unknown email and a wrong password, and shows no hint about which was wrong.
3. A student who signs in with a tutor account is routed to the tutor dashboard; an unknown role never routes to a student screen.
4. The login form shows a loading state on submit, an inline error on failure, and never clears the email field after a failure.

### US-S-2 - Open an assignment

**As a** student, **I want** to see the assignments in a course and open one, **so that** I can start work.

Acceptance criteria:

1. The assignments page lists only assignments whose status is `published` for the student's courses (Gate rule G1 in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 3.4).
2. Each card shows the title, the due date when set, my Checklist progress, and my resolution rate.
3. An assignment with no approved Checklist shows "Checklist not published yet" rather than a zero.
4. Opening an assignment whose status changed to `archived` after the list was loaded returns the not-found state, not a broken workspace.

### US-S-3 - Read the official brief verbatim

**As a** student, **I want** the original assignment document rendered as it was written, **so that** I am reading the requirement and not a summary (C2, D17, D43).

Acceptance criteria:

1. The official brief is displayed in a page-mapped viewer as the uploaded document. No text is rewritten, re-flowed into new prose, or truncated without a control that reveals the rest.
2. The viewer is the first content in the Assignment/Info tab. The Assignment Map appears after it, never before it.
3. Every claim elsewhere in the workspace that refers to a requirement links to a page in this viewer.
4. A DOCX or PPTX source is displayed as a paginated conversion of the uploaded file; the viewer offers page navigation and nothing that rewrites the text ([`02-SCOPE.md`](02-SCOPE.md) section 2.4 commits a page-rasterised viewer with no download, annotation, or in-document search controls).
5. A page anchor from a Map node opens the viewer at that page.

### US-S-4 - Read the official Rubric

**As a** student, **I want** the official marking criteria and weightings shown as the tutor uploaded them, **so that** I know what is being marked.

Acceptance criteria:

1. Rubric criteria text is rendered verbatim from the source document.
2. Weightings are shown only when the number was located in the source text; an unverified weight is not displayed as fact.
3. The Rubric is labelled "Official rubric" and shares the official visual treatment with the brief.

### US-S-5 - Navigate with the Assignment Map

**As a** student, **I want** a structural view of the assignment, **so that** I can see how requirements, rubric sections, and Milestones relate (D18, D19, D43).

Acceptance criteria:

1. Every Map node carries the label "AI-generated interpretation" and the disclaimer that it is not the official requirement.
2. A node with a verbatim requirement shows that verbatim text and its source page; a node without one shows only the AI interpretation and a link to the brief.
3. Clicking a node with a source location opens the official brief at that page.
4. The Map never renders text that contradicts the T1 text it links to. If a contradiction is detected, the T1 text is shown and the node is flagged (rule R2 in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 2.3).
5. The Map is visually distinct from the brief in colour, border, badge, and typography (see [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 2).
6. The Map shows my Milestone position without showing a solution plan.

### US-S-6 - Know what AI use is permitted here

**As a** student, **I want** the assignment's AI Usage Policy before I use the Assistant, **so that** I know the boundary in advance (D9).

Acceptance criteria:

1. The published AI Usage Policy is readable in the Assignment/Info tab and is linked from the Assistant panel.
2. Each rule is attributed to the tutor's approval, not to the AI that extracted it: the entry shows "Published by your tutor".
3. When no policy rule has been published, the workspace states that the Assistant is unavailable for this assignment, rather than implying that a default policy is in force (D47).
4. A refusal by the Assistant quotes the specific rule that caused it. When the refusal is `POL_ABSENT`, the panel states that the Assistant is unavailable because no policy has been approved.

### US-S-7 - Work through Milestones and Checklist items

**As a** student, **I want** tutor-approved Milestones with granular Checklist items, **so that** I can structure my own work without being told how to do it (D19, D20).

Acceptance criteria:

1. Only published Milestones and Checklist items appear, ordered as the tutor approved them.
2. Each item's `planning_level` is one of understand, identify, plan, verify, review, note (O1).
3. No item text names an implementation action. An item that does ("Implement endpoints") is a defect and is reported, not displayed.
4. The Checklist does not restate requirements as instructions and does not contain a solution plan.
5. Collapsing and expanding a Milestone does not change any progress state.

### US-S-8 - Mark progress and see elapsed time

**As a** student, **I want** to start and complete Checklist items, **so that** I can track where I am (D33).

Acceptance criteria:

1. Starting an item records the start time; completing it records the completion time and elapsed time.
2. Elapsed time is labelled "elapsed time" and never "time worked" or "time on task". Idle time counts.
3. Reopening a completed item is possible. It increments the reopen count and returns the item to in-progress; elapsed time stays at the **first** start-to-complete interval and is never extended by a reopen (D48).
4. Marking an item does not cause any AI-generated guidance to appear.
5. Progress survives a page reload and a new session.

### US-S-9 - See my resolution rate

**As a** student, **I want** a summary of how much of the approved Checklist I have completed, **so that** I know whether I am behind.

Acceptance criteria:

1. Resolution rate is completed items over published items, shown as a percentage.
2. With no published Checklist, the state is "Checklist not published yet", not 0%.
3. The student's own progress is visible to the student only; no tutor-facing screen shows it ([`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 4.7.4).

### US-S-10 - Get one proactive milestone message

**As a** student, **I want** a short orientation when I enter a Milestone, **so that** I know what the assignment requires me to consider before I start (O2).

Acceptance criteria:

1. At most one proactive message per (student, assignment, Milestone). The second visit shows nothing.
2. The message has at most 3 bullets, each grounded in published content (the brief, an approved Milestone or Checklist item, or a published FAQ entry), and each bullet links to its source.
3. The message contains no instruction to implement, no code, no evaluation, and no solution step.
4. The message is dismissible, and dismissal is permanent for that Milestone.
5. The message is never generated live during the visit; it is assembled from approved content only (C3).

### US-S-11 - Ask a permitted question

**As a** student, **I want** to ask about the assignment and get an answer grounded in the official material, **so that** I can proceed without guessing.

Acceptance criteria:

1. The answer cites at least one source: the brief, an approved Milestone or Checklist item, a published FAQ entry, or the published AI Usage Policy.
2. Citations are visible in the message with a page link where a source page exists.
3. When nothing in the assignment documents supports an answer, the response is "We could not find this in your assignment documents" plus a route to ask the tutor, and it does not assert the requirement.
4. The Assistant's answer never contradicts T1 or T2 material (rules R1 and R4).
5. The raw Discussion content of other students is never cited as authority (O10).

### US-S-12 - Be refused, and understand the refusal

**As a** student, **I want** a clear refusal when my request would make the AI do my work, **so that** I know the boundary and what I can still ask (C1, D6, D8, D11).

Acceptance criteria:

1. Requests to generate an answer, generate or modify code, debug an implementation, evaluate correctness, tell me what to change, or decompose the work into solution steps are refused.
2. Derived effort is refused identically: reworded requests, hypothetical framing, "don't give me the answer, just check my approach", and step-by-step decomposition.
3. The refusal states which rule applied, quotes the assignment's policy when a published rule applies, and lists what the Assistant can help with.
4. The refusal offers "Ask your tutor privately" as the escalation route; it never creates the Query on my behalf.
5. A refused request does not reduce my ability to ask a permitted question in the same session.
6. A request whose intent is unclear produces a clarifying refusal, not an attempt to answer (D8, `CLARIFY`).

### US-S-13 - Upload a file without bypassing the guard

**As a** student, **I want** to send an image, PDF, or text file to the Assistant, **so that** I can ask about something I cannot easily type, **with the same rules applied** (C6, D10, O11).

Acceptance criteria:

1. Accepted modalities: images (PNG, JPEG), PDF, and plain text. Audio and video are **not selectable**: the picker states that they are unavailable rather than accepting a file and failing later (O11).
2. A file over the configured limit is refused with the limit stated.
3. A file whose content asks the Assistant to do the work produces the same refusal as the equivalent typed request: "solve the problem in this image", "debug this code", and "evaluate this implementation" are refused on every modality that ships.
4. A refused upload is reported to me with its reason and is never sent to the model provider.
5. The upload's extracted text is never shown to a tutor and never written to a log.

### US-S-14 - Ask my tutor privately

**As a** student, **I want** a private thread with my tutor, **so that** I can raise something specific to my situation.

Acceptance criteria:

1. Creating and replying to a Query is possible from the assignment workspace and from a refusal's escalation route.
2. A Query is visible to me and to tutors of the course, and to nobody else (`NOT_FOUND` for anyone else).
3. A Query thread shows the messages in order, the status, and whether the tutor has replied.
4. The Assistant may use my own Query thread as context for my own questions, read-only, and never another student's (O9), and my Query content never appears in cohort analytics.

### US-S-15 - Continue or close a Query

**As a** student, **I want** to reply when the answer did not help and to mark the thread resolved when it did.

Acceptance criteria:

1. Replying to an answered Query keeps the same thread and reopens it for the tutor.
2. "Flag Resolved" is available only on a thread with at least one tutor reply, and sets the status to resolved.
3. A resolved thread can be reopened by replying.
4. A student cannot publish, promote, or make any part of a Query visible to the cohort (D24).

### US-S-16 - Ask anonymously

**As a** student, **I want** to post in Discussions under a pseudonym, **so that** I can ask without a social cost (D25, D27).

Acceptance criteria:

1. A post can be submitted anonymously or with my name, and the choice is visible before submission.
2. An anonymous post is displayed as `Anonymous Student #<n>` using the exact format, and my name appears nowhere in the thread, the response payload, or any tutor-facing screen.
3. My pseudonym is stable within this assignment, so my follow-up replies are recognisable as the same person, and unrelated to my pseudonym in any other assignment.
4. The author of an anonymous post is never resolvable by the tutor through the interface, an API response, an export, or a sort order (C4, D26).
5. My own anonymous post shows me an "Edit" affordance so I can manage my own content without exposing myself.

### US-S-17 - Read the official FAQ

**As a** student, **I want** tutor-published answers in one place, **so that** I can find the official clarification without reading every thread.

Acceptance criteria:

1. Official FAQ entries appear in Discussions and are labelled "Published by your tutor".
2. A FAQ entry shows the tutor's answer and any source link, and never appears as an AI claim.
3. Peer answers are visually and textually distinct from FAQ entries ("Peer discussion - not official guidance").
4. A FAQ entry removed by the tutor disappears from the student view.

### US-S-18 - Answer a peer and be reviewed

**As a** student, **I want** to answer another student's question, **so that** the cohort helps itself (D29).

Acceptance criteria:

1. I can reply to a thread, anonymously or attributed.
2. My answer may be moderated before or after visibility, and the thread shows when a post is hidden pending tutor review.
3. A tutor can approve, reject, or reply to my answer. An approved answer is shown as an accepted response and is still labelled peer content, not official guidance.
4. My answer is never promoted to the official FAQ automatically. Promotion is a separate, explicit tutor action (O8).
5. I cannot publish anything as official (D24).

### US-S-19 - Edit or delete my own post

**As a** student, **I want** to correct or withdraw my own post, **so that** I stay in control of what I said (D28).

Acceptance criteria:

1. Edit and delete are available on my own posts only, and the server enforces it, not just the interface.
2. An edited post shows that it was edited.
3. A deleted post is removed from the student view; moderation and audit history is retained.
4. Deleting an anonymous post does not change my pseudonym or my other posts.
5. A tutor cannot edit my post: they can hide or remove it, and the thread says so.

### US-S-20 - Flag a post

**As a** student, **I want** to report a post, **so that** tutors can act on content I think is unsafe or against the rules (D30).

Acceptance criteria:

1. I can flag a post once; a second flag on the same post reports that it is already flagged and creates no duplicate.
2. Flagging sends the post to the tutor moderation queue. It does not remove the post and does not alert the author.
3. I never see a flag count or who else flagged anything.
4. My identity is not shown to the tutor as the reporter.

### US-S-21 - Know where I am without being told what to do

**As a** student, **I want** a position indicator across Milestones, **so that** I can orient myself.

Acceptance criteria:

1. Completed, in-progress, and not-started states are distinguishable by more than colour.
2. The indicator shows position only. It never suggests the next implementation action, and it never ranks my work.
3. The indicator is visible on the Assignment Map and in the Checklist tab, and the two never disagree.

---

## 4. Tutor requirements and ingestion

### 4.1 Assignment ingestion

Implements C3, D21, D22, and the workflow in [`assignment_assistant_project_handoff.md`](assignment_assistant_project_handoff.md) sections 7, 8, 55, 56.

| ID | Requirement | Verification |
|---|---|---|
| FR-ING-1 | A tutor **must** be able to create an assignment in one of their courses and upload multiple source documents in one session. | Upload 3 files; all 3 persist with their `kind`. |
| FR-ING-2 | Supported source formats are PDF, DOCX, PPTX, PNG, JPEG, plus plain text and Markdown (O5, **D57**). An unsupported file **must** be refused at upload with a message naming the supported set. Note: [`02-SCOPE.md`](02-SCOPE.md) section 2.4 states the same O5 set and does not narrow it; DOCX and PPTX are accepted and extracted, not rejected. | Upload a `.zip`; expect `UNSUPPORTED_FORMAT` and no row. |
| FR-ING-3 | A source **must** be classified as brief, rubric, AI policy, marking guide, or supplementary. At least one brief is required before publish. | Attempt publish with no brief; expect a publish blocker. |
| FR-ING-4 | Extraction **must** produce page-anchored source chunks with page numbers and a section label where the document provides one. | Inspect `source_chunks` for a 10-page PDF; every chunk has a page range. |
| FR-ING-5 | Ingestion **must** run as a background job with a visible status: queued, extracting, analysing, complete, failed. | Poll the status endpoint while a run is in progress; every stage is observed. |
| FR-ING-6 | The Assignment Analyst **must** propose: Requirement nodes with verbatim text, Rubric sections, Milestones, Checklist items, FAQ entry candidates, AI Usage Policy rules, and ambiguity findings. | Review bundle contains all seven artifact kinds after one run. |
| FR-ING-7 | Every proposed artifact **must** carry provenance: model id, prompt version, generation timestamp, and the source chunk ids it was grounded in. | No artifact in the review bundle has an empty `groundingChunkIds` or a missing `promptVersion`. |
| FR-ING-8 | Every proposed artifact **must** start at `AI_GENERATED` or `NEEDS_REVIEW`, and **must** be marked "AI generated - requires tutor approval" everywhere it is shown. | No artifact is student-visible before publish (test T-17). |
| FR-ING-9 | Requirement text and Rubric criteria **must** be verbatim excerpts of the cited source chunk. A non-substring excerpt **must** be rejected rather than shown. | Upload a brief, then force a mismatch; expect `VERBATIM_MISMATCH` and a blocked approval. |
| FR-ING-10 | A failed extraction **must** leave the run resumable: the failing source is identified, and the tutor can remove or replace it and re-run without losing the other sources. | Corrupt one PDF of three; the other two keep their extraction, and the run reports the failing source. |
| FR-ING-11 | Re-ingestion **must** create a new structure version without destroying student progress, and the tutor **must** be told which published artifacts the new version supersedes. | Re-run ingestion; previous version retained, progress rows intact, supersession list shown. |
| FR-ING-12 | Ingestion is the only place the Assignment Analyst writes student-facing-shape content, and it writes nothing that is student-visible. | The Analyst module contains no call that sets `publication_status = 'PUBLISHED'`. |

### 4.2 Review and approval

Implements C3 and D21: AI generates, the tutor reviews and edits, the tutor approves, then students see it.

| ID | Requirement | Verification |
|---|---|---|
| FR-REV-1 | The review screen **must** show uploaded materials beside generated artifacts, so the tutor can compare a proposal with its source without leaving the page. | Side-by-side layout present; each artifact links to its source page. |
| FR-REV-2 | Every artifact **must** be individually editable: title, summary fields, ordering, applicability, and policy wording. | Edit one of each artifact kind; each persists with status `EDITED`. |
| FR-REV-3 | Verbatim fields (`verbatim_text`, `criteria_text`) **must** be immutable. Changing the requirement means editing the source document and re-ingesting, or adding a tutor-authored clarification (which is T2, not a rewritten requirement). | PATCH the verbatim field; expect `IMMUTABLE_FIELD`. |
| FR-REV-4 | Artifacts can be approved individually or in bulk, and rejected individually. Rejection **must** retain the row for audit. | Reject one FAQ candidate; it disappears from student reads and remains queryable for audit. |
| FR-REV-5 | Publish **must** be blocked until the assignment has a brief, at least one Milestone, at least one approved AI Usage Policy rule, and no unacknowledged validation warning on an approved artifact. | Attempt publish at each stage; each blocker names itself. |
| FR-REV-6 | Publish **must** set every approved artifact of the current version to `PUBLISHED` and make the assignment visible to enrolled students in one action. | Publish; a student session sees the workspace immediately. |
| FR-REV-7 | Editing a published artifact **must** withdraw it from student reads until it is approved and published again, and the interface **must** warn before saving. | Edit a published FAQ entry; students stop seeing it until re-approval. |
| FR-REV-8 | Concurrency: two tutors editing the same artifact **must** produce one success and one stale-revision conflict, never a silent lost update. | Two PATCHes with the same revision; second gets `STALE_REVISION`. |

### 4.3 Tutor operations

| ID | Requirement | Story |
|---|---|---|
| FR-TO-1 | Grouped Queries: a tutor **must** see student Queries grouped by topic or Milestone, with a count per group and an expandable list. Grouping is AI-assisted and labelled as interpretation where it is. | US-T-12 |
| FR-TO-2 | Private Reply: a tutor **must** be able to reply to the asking student only. | US-T-13 |
| FR-TO-3 | Publish: a tutor **must** be able to promote a reply into an official FAQ entry, and only a tutor can do it. | US-T-14 |
| FR-TO-4 | Discussion moderation: AI flags with severity and a reason code; high-severity content is hidden pending tutor review; the tutor approves, hides, or removes. The AI never deletes (D28, O3). | US-T-15 |
| FR-TO-5 | Peer answer review: approve, reject, or reply; an approved answer is shown as an accepted response and can be promoted to the FAQ only by a separate explicit action (D29, O8). | US-T-16 |
| FR-TO-6 | Assignment Health: the tutor **must** see the average resolution rate, active-student count, average elapsed time per Milestone, and question volume per Milestone (D56). Question volume counts **tutor-directed questions only**: private Queries plus discussion posts that received a moderation flag. Assistant turns are never question volume and are reported separately as metric M6 (D49). | US-T-17, [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 4.7.2 |
| FR-TO-7 | Potential difficulty areas **must** be presented as evidence with the two signals named (above-average elapsed time and above-average question volume), and the system **must NOT** prescribe an intervention (D34, D35). | US-T-18 |
| FR-TO-8 | Any bucket with fewer than five contributing students **must** show the **Insufficient data** state instead of a number (D32). | US-T-19 |
| FR-TO-9 | No tutor screen, response, export, or sort order **must** resolve the identity behind an anonymous post (C4, D26). | US-T-21 |
| FR-TO-10 | No tutor screen **must** show per-student activity, per-student progress, or a list of students ranked by anything (C5, D31). | US-T-17 |

### Tutor user stories

#### US-T-1 - Sign in and see my courses

Acceptance criteria:

1. A tutor signs in and lands on the tutor dashboard listing their courses as cards with assignment counts.
2. A course card opens that course's assignments page.
3. A tutor with no courses sees an explanatory empty state, not a blank page.

#### US-T-2 - Create an assignment and upload documents

Acceptance criteria:

1. The Add Assignment screen accepts multiple files by drag and drop and by file picker (FR-ING-1).
2. Each uploaded file shows its kind, size, and extraction status.
3. An unsupported file is refused with the supported list stated (FR-ING-2).
4. The screen states that nothing becomes student-visible until the tutor approves and publishes it.

#### US-T-3 - Watch ingestion run

Acceptance criteria:

1. Starting ingestion shows the current stage and elapsed time.
2. A second run while one is in progress is refused with `INGESTION_IN_PROGRESS`.
3. A failure names the failing source and offers remove-and-retry.
4. The screen is safe to leave and return to; the run continues.

#### US-T-4 - See what the AI proposed, clearly marked

Acceptance criteria:

1. Every artifact carries the badge "AI generated - requires tutor approval" until it is approved (C3).
2. The review screen shows counts by publication status.
3. A tutor can tell at a glance which artifacts were edited by a human and which were not.

#### US-T-5 - Verify a requirement against the source

Acceptance criteria:

1. Selecting a Requirement node shows its verbatim text beside the source page it came from.
2. The verbatim text cannot be edited in place (FR-REV-3).
3. A verbatim mismatch is surfaced as an error and blocks approval (FR-ING-9).

#### US-T-6 - Edit a proposal

Acceptance criteria:

1. Editable fields are editable inline; the source text is not.
2. Saving sets the status to `EDITED` and records an audit row.
3. A Checklist item that names an implementation action is refused with the reason (D20, O1).

#### US-T-7 - Approve

Acceptance criteria:

1. Approve works per artifact and in bulk for a filtered set.
2. Approving an artifact with validation warnings requires acknowledging each warning, and the acknowledgement is stored.
3. An approved artifact is still not student-visible until publish (Gate rule G1).

#### US-T-8 - Reject

Acceptance criteria:

1. Rejecting asks for confirmation and retains the row.
2. A rejected artifact disappears from the student workspace and from retrieval.
3. The tutor can add replacement content, which starts at `EDITED` with tutor provenance.

#### US-T-9 - Confirm the AI Usage Policy

Acceptance criteria:

1. Each extracted policy rule is shown with the clause it came from.
2. The tutor can edit the wording, change the effect, or reject the rule.
3. Publish is blocked with no approved rule, and the blocker says so (FR-REV-5).
4. The published policy is what a student sees, quoted verbatim in refusals.

#### US-T-10 - Publish

Acceptance criteria:

1. Publish lists exactly what will become visible, by artifact kind and count.
2. Publish is one action and is recorded in the audit log with the publishing tutor.
3. After publish, the tutor dashboard shows the assignment as published with a student-visible indicator.
4. Nothing unpublished becomes visible as a side effect of publishing.

#### US-T-11 - Review ambiguity and contradiction findings

Acceptance criteria:

1. Each finding shows its kind (ambiguity or contradiction), severity, both verbatim excerpts when it is a contradiction, and the page or section where each occurs.
2. The finding offers no drafted clarification, and no field accepts one (see section 5).
3. The tutor can acknowledge, dismiss with a reason, or mark it resolved by linking an FAQ entry they published.
4. Findings are tutor-visible only and never appear in the student workspace.

#### US-T-12 - See grouped queries

Acceptance criteria:

1. Queries are grouped with a count, and a group expands to the individual threads.
2. Grouping by Milestone uses the approved Milestone title; grouping by topic uses an AI label shown as interpretation.
3. A group shows how many threads are open.
4. The list never shows one student's private thread to another student, and a tutor sees only courses they teach.

#### US-T-13 - Reply privately

Acceptance criteria:

1. The reply form sends to the asking student only, and the response confirms "Replied privately".
2. The interface distinguishes Reply from Publish before the tutor submits, not after (D24; [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 5).
3. A reply is text only: Query threads carry no attachments in the MVP ([`02-SCOPE.md`](02-SCOPE.md) section 5).
4. A reply is immutable once sent (a correction is a new message).

#### US-T-14 - Publish to the official FAQ

Acceptance criteria:

1. Publish is available only on a tutor message, and creates a FAQ entry with the tutor recorded as publisher.
2. The FAQ entry is T2 and is labelled "Published by your tutor" to students.
3. The tutor can edit the FAQ entry's question and answer before or after publishing, with the withdrawal rule of FR-REV-7.
4. A student cannot create, edit, or publish a FAQ entry through any path.

#### US-T-15 - Moderate discussions

Acceptance criteria:

1. The moderation queue lists AI flags with severity, reason code, and the flagged post.
2. High-severity flags hide the post pending review (O3).
3. The tutor can approve (unhide), hide, or remove, and each action is recorded.
4. The AI never removes content by itself.
5. The queue never shows the identity behind an anonymous post or the identity of a student flagger.

#### US-T-16 - Review a peer answer

Acceptance criteria:

1. Approve marks the answer as an accepted response and leaves it labelled peer content.
2. Reject hides the accepted-response marker but does not delete the post.
3. Reply opens a private Query-style reply to that student, or a public tutor post, and the interface makes clear which one is being created.
4. Promotion to the FAQ is offered as a separate action after approval (O8).

#### US-T-17 - Read Assignment Health

Acceptance criteria:

1. The headline shows enrolled students, active students, the **average resolution rate** (the mean of per-student resolution rates), and the count of potential difficulty areas, over a stated window (D56).
2. Each Milestone row shows contributor count, average and median elapsed time, **resolution rate** (a cohort ratio, not a mean of per-student rates), and question volume.
3. Elapsed time is labelled "elapsed time" and the window is stated in words.
4. No row, field, tooltip, or export names a student.

#### US-T-18 - Act on potential difficulty, not a prescription

Acceptance criteria:

1. A potential difficulty area names both signals that produced it: average elapsed time above the cohort average and question volume above the cohort average.
2. The view offers "View related questions", which opens the Queries tab filtered to that Milestone.
3. The view states no recommended action and ranks no intervention (D35).

#### US-T-19 - See Insufficient data

Acceptance criteria:

1. A Milestone with fewer than 5 contributors renders the **Insufficient data** state, not a zero and not a blank cell.
2. The state explains the k-anonymity floor in one sentence, in the tutor's terms.
3. The assignment-level activity metrics also show the state when fewer than 5 students are enrolled.
4. No count of contributors is shown in the state.

#### US-T-20 - Re-ingest

Acceptance criteria:

1. Re-ingestion is available on a published assignment and warns that published artifacts will be superseded.
2. The previous version remains queryable for audit.
3. Student progress on Checklist items is preserved, and the tutor is told which items have no successor in the new version.

#### US-T-21 - Confirm anonymity holds

Acceptance criteria:

1. A tutor viewing an anonymous post sees `Anonymous Student #<n>` and no name, email, avatar, or profile link.
2. Sorting, filtering, searching, and exporting a thread set produces no ordering that reveals authorship.
3. The same pseudonym recurs within one assignment and differs across assignments.
4. A test in the suite asserts the absence of identity fields in every tutor response (test T-11 in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 9.2).

---

## 5. Ambiguity and contradiction detection

Implements D23 and the handoff section 14. This is a tutor-facing ingestion feature, and it is deliberately narrow.

**What it is.** During ingestion, the Assignment Analyst reads the uploaded documents and reports places where the assignment is unclear, self-inconsistent, or inconsistent with its own Rubric. It says what it found and where, with verbatim evidence.

**What it is not.** It is not a clarification service. The system does not draft, propose, paraphrase, or publish the clarification. The tutor authors it. Authoring an official clarification is the tutor's professional judgement and, once published, it is T2 content under the tutor's name; a model-drafted clarification would be an AI claim wearing a tutor's authority.

### 5.1 Findings

| ID | Requirement | Verification |
|---|---|---|
| FR-AMB-1 | Ingestion **must** detect potential ambiguities and potential contradictions and record each as an ambiguity finding. | Run ingestion on a fixture with one known contradiction; the finding is present. |
| FR-AMB-2 | A finding **must** be classified as `ambiguity` or `contradiction`, and assigned a severity of low, medium, or high. | Each finding has both fields populated. |
| FR-AMB-3 | A finding **must** locate the issue: the page number, the section label where the document provides one, and at least one verbatim excerpt. A contradiction **must** carry two verbatim excerpts from the two conflicting locations. | Every contradiction finding has `excerpt_a`, `excerpt_b`, and a location. |
| FR-AMB-4 | A finding **must** cite the source chunk ids it was grounded in, so a reviewer can trace it to the document. | `source_chunk_ids` non-empty on every finding. |
| FR-AMB-5 | A finding **must** be presented to the tutor in the review bundle, and the tutor **must** be able to acknowledge it, dismiss it with a reason, or mark it resolved by linking a published FAQ entry. | All three transitions work and are recorded. |
| FR-AMB-6 | A finding **MUST NOT** carry a drafted or proposed clarification, and no API field, database column, or UI control **must** accept one. The only text a finding holds is the tutor-facing description and the verbatim excerpts. | Schema review: `ambiguity_findings` has no clarification column ([`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 7.2.12); test T-22. |
| FR-AMB-7 | The system **MUST NOT** publish a clarification, edit an uploaded document, or modify a Requirement to remove the ambiguity. | No write path touches `assignment_sources` content or verbatim fields. |
| FR-AMB-8 | A finding **MUST NOT** be student-visible at any status, including after resolution. | Student endpoints never return findings; the review bundle is tutor-only. |
| FR-AMB-9 | A finding **MUST NOT** block publish. Detection informs; it does not gate the approval boundary. | Publish succeeds with an open high-severity finding, and the finding is listed on the publish confirmation. |
| FR-AMB-10 | A finding **MUST** be labelled as AI-generated interpretation (T5) with its provenance, so a tutor never mistakes it for an official statement. | Each finding shows the provenance badge and at least one grounding source. |
| FR-AMB-11 | A dismissed finding **must** be retained with its reason and the dismissing tutor, for audit. | `status = 'dismissed'`, `resolved_by_user_id` and `resolved_at` set, row retained. |
| FR-AMB-12 | Detection **may** surface a place where the brief and the Rubric disagree, but it **must NOT** decide which one is correct; the tutor does. | A brief-versus-Rubric conflict produces one finding naming both, with no recommended resolution. |

### 5.2 What the tutor sees for one finding

```text
Potential contradiction detected          [AI-generated interpretation]
Severity: high

What: Section 2 requires a single-file submission; the Rubric awards marks
      for a modular repository structure.

Where:
  Brief, page 4, "2. Submission"          "Submit one file only."
  Rubric, page 2, "Code quality"          "Marks are awarded for a modular
                                           repository structure."

Sources: Brief p.4, Rubric p.2
Status: open

[ Acknowledge ]  [ Dismiss with reason ]  [ Resolve with published FAQ entry ]
```

The resolution control lists only FAQ entries the tutor has already published. There is no text field on this screen that accepts clarification wording. That is the UI expression of D23, and it is what a reviewer should check first.

### 5.3 Closure model

| Status | Set by | Meaning | Student effect |
|---|---|---|---|
| `open` | ingestion | Detected, not yet looked at | None; not visible |
| `acknowledged` | tutor | Seen; the tutor is aware and has decided nothing needs publishing | None |
| `resolved_by_clarification` | tutor | A clarification was published as a FAQ entry, and the finding links to it | Indirect: the FAQ entry becomes visible as T2 |
| `dismissed` | tutor | Not a real issue, with a recorded reason | None |

A finding never closes by the system's own action. There is no expiry, no auto-close, and no state in which the system has authored the outcome.

### 5.4 Acceptance criteria for the demo

1. A fixture assignment contains one deliberate contradiction between the brief and the Rubric, and one deliberate ambiguity (an undefined term).
2. A single ingestion run produces both findings, each with a page location and verbatim excerpts.
3. The contradiction finding shows both excerpts side by side with page labels.
4. No screen in the flow offers a drafted clarification; the only resolution path links to a FAQ entry the tutor writes and publishes.
5. After the tutor publishes the clarification, the finding shows the linked entry, and students see the FAQ entry labelled "Published by your tutor" and never see the finding.

---

## 6. Peer answers and approval

Implements D24, D29, D28, and O8. The purpose is to let the cohort help itself without granting any student authority over official content.

### 6.1 Requirements

| ID | Requirement | Verification |
|---|---|---|
| FR-PEER-1 | A student **must** be able to answer another student's question in a Discussion thread, anonymously or attributed. | Post a reply in both modes; authorship fields match the choice. |
| FR-PEER-2 | Peer content **must** be moderated by the Discussion Moderator, which flags with a severity and a reason code and never deletes (D28). | A flagged post produces a moderation flag row; the post is only hidden by a tutor action or by the high-severity pending-review rule. |
| FR-PEER-3 | A tutor **must** be able to approve, reject, or reply to a peer answer (D29). | All three actions work from the tutor Discussions tab. |
| FR-PEER-4 | An approved peer answer **must** be shown as an accepted response and **MUST** remain labelled peer content, never official guidance (T4). | The badge reads "Peer discussion - not official guidance" on the accepted answer. |
| FR-PEER-5 | A rejected peer answer **MUST** be retained, with its accepted-response marker cleared; rejection is not deletion. | Post still readable; `accepted_answer_status = 'rejected'`. |
| FR-PEER-6 | Promotion to the official FAQ **MUST** be a separate, explicit tutor action available only after the answer is approved. There is **no** automatic promotion path (O8). | No API route and no code path creates a FAQ entry from an approved answer without the explicit promote action. |
| FR-PEER-7 | A promoted answer **must** become a FAQ entry at T2 with the tutor recorded as publisher, and the entry **must** show "Published by your tutor". | Inspect the created entry: `published_by_user_id` set, `source_kind = 'peer_answer'`, label present. |
| FR-PEER-8 | A student **MUST NOT** create, edit, publish, unpublish, or reorder a FAQ entry through any path, including by editing their own post after promotion. | Attempt every student write path; all fail with `FORBIDDEN_ROLE` or `NOT_FOUND`. |
| FR-PEER-9 | A promoted peer answer **MUST NOT** be cited by the Assistant as authority. It is T2 only because a tutor adopted it, and its peer provenance is recorded. | Assistant citations resolve to the FAQ entry (T2) and the entry shows its source kind; raw discussion posts are never in the retrieval set (O10). |
| FR-PEER-10 | Editing the original post after promotion **MUST NOT** change the published FAQ entry text. | Edit the post; the FAQ entry is unchanged. |

### 6.2 The lifecycle, in one diagram

```text
Student A asks (anonymous or attributed)
        |
        v
Discussion Moderator flags (advisory, never deletes)
        |
        v
Post is visible, or hidden pending tutor review if high severity
        |
        v
Student B answers
        |
        v
Tutor review of the answer: approve | reject | reply
        |
        +--> reject  -> marker cleared, post retained
        |
        +--> reply   -> private Reply to Student B, or a public tutor post
        |
        +--> approve -> shown as accepted response, still labelled peer content
                            |
                            v
                  Separate explicit action: Publish to official FAQ
                            |
                            v
                  FAQ entry (T2, "Published by your tutor")
                            |
                            v
                  Eligible for the Assistant's retrieval set
```

Three boundaries this diagram encodes:

1. Approval of an answer and promotion to the FAQ are two actions, never one (FR-PEER-6, O8).
2. Only the tutor crosses the line from T4 to T2 (FR-PEER-8, D24).
3. The Assistant retrieves FAQ entries, not discussion posts (FR-PEER-9, O10).

### 6.3 Acceptance criteria

1. A student cannot reach a Publish control anywhere in the interface, and the API refuses a Publish attempt from a student session.
2. After a tutor approves an answer, the accepted response appears identically to every student, with the peer-content label still visible.
3. The tutor's Discussions tab shows the approve, reject, reply, and promote actions on an answer, and promote is disabled until the answer is approved.
4. A promoted entry appears in the Official FAQ section of every student's Discussions tab within one refresh.
5. Removing the FAQ entry does not delete the original post or the approval record.

---

## 7. Non-functional requirements

### 7.1 Privacy

| ID | Requirement | Verification |
|---|---|---|
| NFR-P-1 | No tutor-facing query, response, screen, export, or sort order resolves the identity behind an anonymous post (C4, D26). | Test T-03, T-04, T-11. |
| NFR-P-2 | Tutor analytics are aggregate only, with a k-anonymity floor of 5 contributing students (C5, D31, D32). | `milestone_metrics` CHECK constraint; test T-16. |
| NFR-P-3 | Student progress and assistant transcripts are readable by the owning student only; no tutor endpoint accepts a student identifier. | Endpoint index review; test T-11. |
| NFR-P-4 | Analytics tables and log tables hold no student identifier, and no reverse mapping from a pseudonym exists. | Schema review; test T-16, T-15. |
| NFR-P-5 | A student's private Query content never appears in cohort analytics (O9). | Analytics build reads counts only ([`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 4.7.2). |

### 7.2 Security and secrets

| ID | Requirement | Verification |
|---|---|---|
| NFR-S-1 | Secrets (`AUTH_SECRET`, `ANON_ID_SECRET`, provider keys) are never committed, logged, returned, or placed in a fixture (C7). | Test T-21; `.gitignore` review. |
| NFR-S-2 | Session is an httpOnly cookie; password hashes use argon2id; no SSO, no Canvas OAuth, no email verification (D42; Canvas/LMS excluded outright by D45 and D59). | Auth module review. |
| NFR-S-3 | Authorization checks both role and course enrollment; cross-course access returns `NOT_FOUND`. | Test over every assignment-scoped route. |
| NFR-S-4 | Uploads are validated by MIME type and size before storage, and a refused upload is never sent to a model provider (C6, O11). | Test T-20, T-26. |
| NFR-S-5 | Model output is consumed as schema-validated structured data; a validation failure is a refusal, not a retry-until-valid loop (D16). | Guardrail golden set; `LLM_OUTPUT_INVALID` behaviour. |
| NFR-S-6 | With no approved AI Usage Policy, the Assistant is **unavailable**: the Guardrail returns `REFUSE` with reason code `POL_ABSENT` and no model call is made. There is no permissive default (D47). | Test T-23 in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 9.2. |

### 7.3 Performance

| ID | Requirement | Verification |
|---|---|---|
| NFR-PERF-1 | First contentful paint of the assignment workspace under 2 seconds on the demo laptop with the local database. | Manual measurement, recorded in the demo notes. |
| NFR-PERF-2 | First token of an Assistant response visible within 3 seconds with the configured provider, and within 1 second with the `mock` provider (D40). | Manual measurement in both provider modes. |
| NFR-PERF-3 | Checklist start and complete actions feel immediate: the optimistic state is shown and the counter updates without a full reload. | Interaction check. |
| NFR-PERF-4 | Assignment Health renders within 2 seconds for a cohort of 40 students and 6 Milestones. | Seeded fixture measurement. |
| NFR-PERF-5 | Ingestion of a 20-page brief plus a 4-page Rubric completes within 90 seconds with a live provider, and within 5 seconds with `mock`. | Timed run, recorded as demo evidence. |

### 7.4 Accessibility and usability

| ID | Requirement | Verification |
|---|---|---|
| NFR-A-1 | Every interactive control is reachable and operable by keyboard, with a visible focus indicator. | Keyboard-only pass over every screen in [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md). |
| NFR-A-2 | Text contrast meets WCAG 2.1 AA (4.5:1 body, 3:1 large text), including the official-versus-interpretation badge colours. | Contrast check per token. |
| NFR-A-3 | State is never conveyed by colour alone: completed, in-progress, and not-started Checklist items differ in icon or text as well as colour. | Visual review. |
| NFR-A-4 | The distinction between the official brief and the AI-generated interpretation survives greyscale and a screenshot with no colour. | Greyscale screenshot check. |
| NFR-A-5 | Every screen has defined loading, empty, error, insufficient-data, and refused-request states where they apply ([`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 2). | State matrix review against the screen list. |
| NFR-A-6 | Copy follows the glossary language rules: no AI output is called official, no guarantee is promised that the system does not provide. | Copy review against [`15-GLOSSARY.md`](15-GLOSSARY.md) section 2. |

### 7.5 Reliability and demo behaviour

| ID | Requirement | Verification |
|---|---|---|
| NFR-R-1 | The `mock` provider makes the whole product loop walkable with no API key and no network (D40). | Demo run with `LLM_PROVIDER=mock`. |
| NFR-R-2 | A provider failure produces an explicit error state and a refusal-shaped Assistant message, never a silent partial answer or a blank panel. | Kill the provider mid-run; observe `LLM_UNAVAILABLE`. |
| NFR-R-3 | Ingestion is resumable: a failed source does not discard the successful ones (FR-ING-10). | Corrupt-file run. |
| NFR-R-4 | Published content is readable with the model provider fully unavailable: the brief, the Map, the Checklist, FAQs, Queries, and Discussions never require a live model call. | Demo run with no provider key. |
| NFR-R-5 | Schema migrations run from an empty database in one command, and the seed fixture produces a demonstrable cohort including the **Insufficient data** state. | Fresh-database run. |

### 7.6 Auditability and maintainability

| ID | Requirement | Verification |
|---|---|---|
| NFR-AUD-1 | Every publication-status transition and every tutor mutation writes an audit row with actor, action, target, and request id. | Audit rows for every transition in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 3.2. |
| NFR-AUD-2 | Every guardrail decision is logged with the verdict, the reason code, the policy rule cited, the prompt version, and the tiers considered, without student content (D15). | `guardrail_logs` review; test T-21. |
| NFR-AUD-3 | Every AI artifact carries provenance retained through every status transition, including rejected artifacts (D22, I-9). | Review bundle inspection. |
| NFR-M-1 | Docs change in the same commit as behaviour ([`00-INDEX.md`](00-INDEX.md) section 5 rule 3). | Commit review. |
| NFR-M-2 | Every LLM call goes through the provider adapter; no vendor SDK import outside `src/lib/llm/` (C8, D39). | Lint rule, test T-14. |

---

## 8. Measures of success and rubric alignment

The project is judged on the 50-point rubric in [`hackathon info/info.md`](../hackathon%20info/info.md). Each criterion is paired with the requirement that earns it and the evidence a judge can see. This table is product-facing; the submission checklist is owned by [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) and the rubric narrative by [`10-RUBRIC-ALIGNMENT.md`](10-RUBRIC-ALIGNMENT.md).

| Rubric criterion | Max | How this product scores | Requirement IDs | Evidence in the demo |
|---|---|---|---|---|
| Problem Relevance | 10 | The problem is named by students and tutors, not invented: fear of asking, repetitive questions, late-discovered ambiguity, unclear AI boundaries. Section 1 maps each claim to a stakeholder. | J1-J9, P5, P7 | The problem slide quotes the anonymous-question and repetitive-question pains; the demo shows the FAQ a repeated question becomes |
| Desirability & Impact | 10 | Two-sided value: students get navigation and a safe place to ask; tutors get grouped questions and cohort-level difficulty evidence. | US-S-5, US-S-16, US-T-12, US-T-17 | Student anonymous post to tutor-approved FAQ, then the same question counted in Assignment Health |
| Solution & Creativity | 8 | Two non-obvious ideas: an assignment-specific AI Usage Policy enforced by an independent guardrail, and ambiguity detection that locates without authoring. | FR-ING-6, FR-AMB-1 to FR-AMB-12, US-S-12 | The contradiction finding appears during ingestion, and the refusal quotes the assignment's own policy |
| Design (UI/UX) | 8 | The visual grammar keeps the official brief and the AI interpretation unmistakably separate, and every screen has a defined state set. | US-S-3, US-S-5, NFR-A-1 to NFR-A-6 | Side-by-side brief and Map with distinct treatment; a refusal that explains what it can still do |
| Functionality | 9 | The full loop works end to end: upload, ingest, review, approve, publish, student work, query, discussion, analytics. | FR-ING-1 to FR-ING-12, FR-REV-1 to FR-REV-8, sections 3 and 4 | One uninterrupted run of the loop, plus `mock` as the network-failure fallback |
| Presentation | 5 | The story is the loop, not the chatbot: the AI that refuses is shown as a designed behaviour, not a limitation. | All | The demo narrative in [`13-DEMO-STORY.md`](13-DEMO-STORY.md) |

Product-level success measures for the demo, all observable:

| Measure | Target | Source |
|---|---|---|
| Ingestion produces all seven artifact kinds from real documents | 1 run, all 7 kinds | Review bundle |
| Refusal correctness on the golden set | Every prohibited request refused; no false allow | [`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md) golden set |
| Anonymous posts resolvable to a name through any tutor path | 0 | Test T-03, T-04, T-11 |
| Tutor screens showing per-student activity | 0 | US-T-17, FR-TO-10 |
| Screens with a defined state set for all five state kinds where applicable | 100% | [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) state matrix |
| Product loop walkable with no provider key | Yes | NFR-R-1 |
| Buckets below 5 contributors rendered as **Insufficient data** | 100% | US-T-19 |
| Model calls made when no AI Usage Policy is approved | 0 | NFR-S-6, D47 |
| Assistant turns counted as question volume | 0 | FR-TO-6, D49 |

---

## 9. Out of scope

1. The authoritative scope list is [`02-SCOPE.md`](02-SCOPE.md). This section names only the items a reader of this PRD is most likely to assume are in scope.
2. Explicitly rejected by [`01-DECISIONS.md`](01-DECISIONS.md) section H and not to be reintroduced: a general-purpose study chatbot; letting the Assistant "just check" a student's work; per-student analytics with names attached; AI-authored official clarifications; skippable tutor approval for internal testing; a second vector database; Canvas/LMS integration in any form; paraphrasing the brief into the workspace as if it were the brief; distinguishing active from idle time on task.
3. Excluded outright, in the product's own terms - not deferred, not awaiting a later phase: Canvas/LMS integration in any form (D45, D59); ingesting course teaching material (D5); student upload of audio or video (O11 - images, PDF, and plain text are in, and audio and video are refused at the picker); attachments on a private Query thread (02 section 5); AI clustering of question topics (02 section 2.4); a permission matrix beyond the flat tutor model (O4); email verification and password reset; notifications and email digests; deadline or calendar integration; grading; plagiarism detection; a mobile application (the workspace is a responsive web application); export of analytics to another system.
4. Anything listed as out of scope is not scaffolded, not stubbed, and not left as a TODO hook (AGENTS section 4.1 rule 3).

---

## 10. Traceability and open product questions

### 10.1 Requirement to decision to interface

| Requirement area | Decisions | Detail doc | Primary endpoints |
|---|---|---|---|
| Student workspace and navigation | D1, D17, D18, D19, D43 | [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) sections 4.2, 4.3, 4.6 | `GET /api/student/assignments/{id}`, `/brief`, `/structure`, `/checklist` |
| Assistant and guardrail | C1, D4, D6, D7, D8, D10, D11, D12, D13, D16 | [`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md), [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 5.5.9 | `POST /api/student/assignments/{id}/assistant/messages` |
| AI Usage Policy | D9, D21 | [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 7.2.11 | `GET /api/student/assignments/{id}/policy` |
| Ingestion and approval | D21, D22, C3 | [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 3 | `/api/tutor/assignments/{id}/sources`, `/ingest`, `/review`, `/approve`, `/publish` |
| Ambiguity detection | D23 | this doc section 5, [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 7.2.12 | `GET /api/tutor/assignments/{id}/ambiguity-findings` |
| Anonymous discussions | C4, D25, D26, D27, D28, D30 | [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 4, [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 6 | `/api/student/discussion-threads`, `/api/student/discussion-posts/{id}/flag` |
| Queries, Reply, Publish | D24, O9 | [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 5 | `/api/student/queries`, `/api/tutor/queries/{id}/reply`, `/publish` |
| Peer answers | D29, O8 | this doc section 6 | `/api/tutor/discussion-posts/{id}/answer-review`, `/promote-to-faq` |
| Cohort insight | C5, D31, D32, D33, D34, D35 | [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md), [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 4.7 | `GET /api/tutor/assignments/{id}/analytics` |
| Stack, adapter, storage | D36-D42, D44, D45 | [`04-TECH-ARCHITECTURE.md`](04-TECH-ARCHITECTURE.md) | - |
| Scope | O6 | [`02-SCOPE.md`](02-SCOPE.md) | - |

### 10.2 Open product questions and their working defaults

Reproduced from [`01-DECISIONS.md`](01-DECISIONS.md) section G where the product is affected, with the answer this doc assumes. None of these blocks the build.

| ID | Question | Assumed here | Where it lands |
|---|---|---|---|
| O1 | Checklist wording and the milestone/task boundary | Understand / identify / plan / verify / review / note; 3-6 Milestones, 3-6 items each; no implementation imperative | US-S-7, FR-ING-6, [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 7.2.10 |
| O2 | Proactive Assistant behaviour | One message per Milestone, max 3 bullets, grounded in published content, dismissible, never repeated | US-S-10, [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 4.7 |
| O3 | Discussion moderation workflow | AI flags with severity and reason code; high severity hidden pending review; tutors decide; students never see flag counts | US-S-20, US-T-15 |
| O4 | Tutor permission model | Flat: any tutor on the course can edit, approve, publish, and moderate; `owner` exists in the schema and grants nothing | [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 3.5 |
| O5 | Supported file formats | Tutor: PDF, DOCX, PPTX, PNG, JPEG, plus plain text and Markdown (**D57**). Student: superseded by O11 for the MVP - images (PNG, JPEG), PDF, and plain text; audio and video out. Anything else refused at upload with the list, never silently | US-S-13, FR-ING-2 |
| O7 | Product name | Assignment Assistant | All copy |
| O8 | Auto-promotion of approved peer answers | Never; promotion is a separate explicit tutor action | Section 6, FR-PEER-6 |
| O9 | Assistant visibility of private Queries | Own thread only, read-only, never in analytics | US-S-14, NFR-P-5 |
| O10 | Whether discussions ground the Assistant | Only published FAQ entries are retrievable; raw peer discussion is never authoritative | US-S-11, FR-PEER-9 |
| O11 | Which student upload modalities ship in the MVP | Images (PNG, JPEG), PDF, and plain text are IN; audio and video are OUT and refused at the picker. C6 still binds every modality that ships (reversed from the original scope cut; see [`02-SCOPE.md`](02-SCOPE.md) section 2.2 S6a) | US-S-13 |
| O12 | Whether there is a per-assignment AI Usage Policy editor | IN and non-negotiable; D9 cannot be demonstrated without it. Scope may not grow elsewhere to compensate | US-T-9, NFR-S-6, [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 7.2.11 |

Two product questions this doc raised and could not settle alone, carried into [`06-DATA-MODEL.md`](06-DATA-MODEL.md) section 10 and **now settled**:

1. **Are private Queries ever anonymous?** No -- a private Query is always attributed (**D50**, `06` section 10 item 6). A Query is attributed (US-S-14) and anonymity belongs to Discussions (US-S-16), so both assumptions hold and no payload contract changes.
2. **Is the Assignment Health headline also k-anonymity floored?** Yes (**D52**, `06` section 10 item 5). This matches the PRD assumption (US-T-19, NFR-P-2). [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md) owns the final wording.

