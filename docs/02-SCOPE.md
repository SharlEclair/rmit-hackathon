# 02 -- Scope

**Purpose.** The definitive answer to *"is this in scope?"* If a feature is not listed here as IN or CHEAP-AND-VISIBLE, it is OUT. Do not implement it, do not scaffold it, do not leave a TODO hook for it (`AGENTS.md` S4.1.3).

**Status.** Committed. This is the resolution of open question **O6** in [`01-DECISIONS.md`](01-DECISIONS.md).

**Authority.** Constraint `AGENTS.md` S2 wins over this file. `01-DECISIONS.md` wins over this file. Within this file: S2 (IN) beats S3 (CHEAP-AND-VISIBLE) beats S4 (OUT).

**Timeline assumption.** One hackathon weekend, team of up to four. The work packets that deliver this scope are in [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md).

---

## 1. The scope rule

> Build one complete loop, end to end, honestly. Not six half-loops.

The handoff warns explicitly about the **overengineering risk** (handoff S66): *"the team should avoid implementing every possible feature if doing so weakens the core end-to-end demo."* The 16-item Tier 1 list in handoff S67 is a product priority order, not a weekend build order. This document converts it into one.

Two cuts are already decided upstream and are not re-litigated here:

| Upstream decision | Effect on scope |
|---|---|
| **D45, D59** -- Canvas/LMS integration is excluded outright | Excluded by decision, not deferred. Canvas/LMS is not on the roadmap, not a future phase, and must not be scaffolded or stubbed. The app must start and run with `CANVAS_*` unset. The scraper is retired prior design research (`archive/canvas-scraper/`) and is never imported by `app/`. |
| **D5** -- no course/module teaching content | Ingested material is the assignment plus assignment-related documents only. No lecture notes, no textbook, no unit-wide corpus. |

### The demo loop this scope exists to deliver

```text
TUTOR                                  STUDENT
  upload brief + rubric + AI policy
        |
        v
  AI proposes structure, milestones,
  checklist, FAQ candidates, AI policy,
  one ambiguity flag          [T5]
        |
        v
  TUTOR REVIEWS / EDITS / APPROVES     [T2, T3]
        |
        +-----------------------------> works the assignment:
                                          original brief, verbatim   [T1]
                                          Assignment Map             [T5]
                                          checklist + elapsed time
                                          Assistant (policy-bound),
                                            + image/PDF/text attachments
                                          private Query -> tutor Reply
                                          anonymous Discussion -> Post
                                          FAQ published by tutor     [T2]
        <-----------------------------+
  Assignment Health:
  milestone with high elapsed time AND
  high question volume -> evidence only
```

Everything in S2 is here because the loop does not close without it. Everything in S3 is here because it is unusually cheap for how much it adds to the demo. Everything in S4 is out.

---

## 2. IN -- the committed MVP

Scope is the Tier 1 list of handoff S67 with **no Tier 1 item dropped**, plus one item added: **T6**, the per-assignment AI Usage Policy editor, without which decision **D9** cannot be demonstrated (**O12**). The divergences from the handoff priority lists are itemised in S2.3.

### 2.1 Tutor side

| # | In scope | Why it is load-bearing | Spec owner |
|---|---|---|---|
| T1 | Tutor sign-in with a role claim (`tutor`) | Both halves of the product need an identity boundary (D42). | `04`, `07` |
| T2 | Course and assignment dashboard | The assignment is the central object (D1); there must be a screen that says which one you are in. | `03`, `07` |
| T3 | Assignment creation with document upload: brief, rubric, AI policy | The upload is the entry point of the whole product (handoff S50.2). | `04` S6, `07` |
| T4 | Assignment ingestion producing a structured proposal | Converts a PDF into a workspace. The product's value proposition (handoff S64). | `04` S5, `03` S4 |
| T5 | Tutor review screen: edit, reorder, discard, and **approve** each AI artifact | Approval is the trust boundary (C3, D21, D22). Without this screen the product is an unmoderated AI policy generator. | `06` S3, `07` S5 |
| T6 | Per-assignment **AI Usage Policy** -- editable free text, tutor-approved | Decision D9: policy is per-assignment data, not a global constant. This is the single input the refusal beat depends on. Formally an item the handoff's Tier 1 list omits; it is non-negotiable here and scope may not grow elsewhere to compensate (**O12**). Until a policy for the assignment is approved, the Assistant is **unavailable** rather than permissive: the guardrail returns `REFUSE` / `POL_ABSENT` (**D47**). | `05` S5, `06` |
| T7 | Amendment and re-approval after publication | If an approved artifact is edited, it returns to `NEEDS_REVIEW` and is no longer authoritative. Cheap, and it is the honest version of "approval is a gate". | `06` S3 |
| T8 | Queries tab: private student queries grouped by milestone, with private Reply | Handoff S22, decision D24. Justifies the tutor-side existence of the query channel. | `03` S6, `07` S5 |
| T9 | Discussions tab: anonymous threads, moderation queue, FAQ publishing | Decisions D24-D30. Publishing is the moment shared knowledge is created. | `07` S6, `05` S9 |
| T10 | Assignment Health: per-milestone resolution rate, elapsed time, tutor-directed question count, plus one **potential difficulty area** signal | The tutor half of the product (D3, D34, D49). "Where is the cohort stuck" is the second-most-important line in the pitch. Question volume counts Queries and flagged discussion posts only; Assistant turns are reported separately as M6 (D49). | `08` S5 |

### 2.2 Student side

| # | In scope | Why it is load-bearing | Spec owner |
|---|---|---|---|
| S1 | Student sign-in with a role claim (`student`), scoped to enrolled assignments | D42. | `04` S7 |
| S2 | Student dashboard listing assignments | Entry point. | `03`, `07` |
| S3 | Assignment Workspace shell with the original brief rendered **verbatim**, plus page navigation | Constraint C2 and decision D17. The original document is the source of truth and must look like it. | `07` S4.2 |
| S4 | **Assignment Map** -- the approved AI-generated navigation layer, visually distinct and labelled as interpretation | Handoff S50.3, decision D18. Moving from a Map node to the page of the brief it came from is the demo's proof that interpretation and authority are different things. | `07` S4.3 |
| S5 | **Checklist** -- approved milestones and items, with `start` / `complete` and elapsed-time capture | Decision D19: Map and checklist stay separate. Elapsed time (D33) is the raw input to analytics. | `07` S4.6, `08` S4 |
| S6 | AssignMate: one conversational surface per (student, assignment), grounded in approved content only | The product's most visible AI surface. | `03` S7, `05` |
| S6a | Student uploads as attachments to an Assistant turn: **PNG/JPEG, PDF, plain text**. Each upload is scanned by the guardrail before it becomes part of the turn, and its extracted content is student content subject to the same rules (C6). Audio and video are refused at the picker with a clear message, not silently (**O11**). | The modality students actually reach for when their question is about something on screen. Constraint C6 binds every modality: an upload is input to *understanding*, never a request to perform work. | `07` S4.7.2 rule 5, `05` S6.4 |
| S7 | **Guardrail**: an independent, deterministic-first policy layer returning one of the five verdicts, logging the rule cited | Decisions D7, D8, D11, D16. This is the differentiator (handoff S50.1). Nothing else in the product matters if this is a prompt clause. | `05` |
| S8 | Private **Query** thread, student to tutor | Decision D24. Gives the student a route that does not require asking publicly. | `07` S5 |
| S9 | **Discussion** threads with anonymous posting, `Anonymous Student #N` display, replies, post edit/delete, and one flag per user per post | Decisions D25-D30. Anonymity is the reason the discussion channel is used at all. | `07` S6 |
| S10 | **Official FAQ** -- read-only student view of tutor-published entries | Decision D24. The destination of the shared-knowledge path. | `06` S2, `07` S4.5 |

### 2.3 Divergences from the handoff priority lists

**Tier 1 -- no Tier 1 item is dropped.** All 16 Tier 1 items in handoff S67 map into S2.1 T1-T10 and S2.2 S1-S10. The two rows below are the only Tier 1 divergences, and neither removes an item.

| Handoff Tier 1 item | Decision | Reason |
|---|---|---|
| Per-assignment AI Usage Policy editor (absent from the Tier 1 list) | **ADDED** as T6 (**O12**) | Decision D9 makes policy per-assignment data, and the policy editor is the input the refusal beat depends on. It is the one item the handoff's Tier 1 list omits; it is non-negotiable here, and scope may not grow elsewhere to compensate. |
| Basic cohort analytics | **IN**, trimmed | In scope at the level of per-milestone aggregates and one derived signal (T10). Rich distributions, cohort time histograms and trend lines are OUT. |

**Tier 2 -- placed, with the reason recorded.** These items were never Tier 1; the handoff lists them under Tier 2, and each is either IN or narrowed rather than dropped.

| Handoff Tier 2 item | Decision | Reason |
|---|---|---|
| Multimodal student uploads (text/image/audio/video/PDF) | **Narrowed, not dropped** (**O11**) | Student uploads for **PNG/JPEG, PDF and plain text are IN**; **audio and video are OUT**. The original cut dropped the capability entirely; it was reverted because the expensive part is transcode-and-process for audio and video, not the picker, and the default model handles images and PDFs natively (D40; the default provider and model are now `gemini` / `gemini-3.8-flash`, **D61, D62**). Dropping audio and video removes the whole cost centre while keeping what students actually reach for. Constraint C6 is unchanged and binds every modality: an upload is input to *understanding*, never a request to perform work (`05` S6.4). |
| Automatic difficulty detection | **IN**, at S2.1 T10 | The aggregation is roughly twenty lines over data S5 already records. It stays in S2 rather than S3: T10 already carries the "plus one potential difficulty area" signal, and the CHEAP-AND-VISIBLE list (S3, CV-1 to CV-5) does not contain it. It was only listed as Tier 2 because the handoff had not yet separated "aggregate" from "rich distributions". |

### 2.4 Simplifications that are in scope as simplifications

These are IN, but deliberately smaller than the handoff imagined. They are decisions, not gaps:

| Area | Simplified to | Decision |
|---|---|---|
| Tenancy | One course, one assignment walkable end to end; the schema supports many, the seed ships one | D1, seed fixture |
| Retrieval | Postgres full-text over chunks; no vector database, no embeddings | D38 |
| File formats accepted | **Tutor sources: PDF, DOCX, PPTX, PNG/JPEG**, plus plain text/Markdown - the set defined by **O5** and confirmed by **D57**, which this doc does not narrow. A scanned PDF with no text layer is flagged for tutor attention rather than guessed at; that is an extraction reality, not a scope cut. Student uploads stay at their own narrower set: PNG/JPEG, PDF, plain text (O11). No silent conversion, and an unsupported type is refused at upload with `UNSUPPORTED_FORMAT` and the allowed list in `details.allowedFormats[]` | O5, O11, `04` S6 |
| Demo formats actually exercised | The rehearsed ingestion path will use a **text-layer PDF** only. DOCX/PPTX are accepted and will be extracted per `04` S6 (**D57**), but they are not planned for rehearsal before freeze and the demo must not depend on them; a scanned PDF with no text layer is flagged for tutor attention rather than guessed at. Recorded here so nobody mistakes "accepted" for "demonstrated" | O5, D57, `13` |
| Student uploads | Image (PNG/JPEG), PDF and plain text accepted; audio and video refused at the picker with a clear message. Extraction is type-and-size check then text or vision extraction; no transcode pipeline | O11, `05` S6.4 |
| Question grouping | Student picks a milestone when posting; no AI clustering of query topics | O2, `03` S6 |
| Time tracking | Elapsed wall-clock between start and complete, idle included, labelled "elapsed time". Only the first start-to-complete interval counts; re-opening increments `reopen_count` and adds no elapsed time | D33, D48 |
| Tutor permissions | Flat; a single `owner` flag exists in the schema and is not enforced in the UI | O4 |
| Tutor roles in demo data | One tutor account, one student account | seed fixture |
| Document viewer | Page-rasterised in-app viewer; no annotation, no search-within-document, no download controls | D43 |

---

## 3. CHEAP-AND-VISIBLE -- Tier 2 subset

Ordered by how much demo value each buys per hour. Build in this order, stop when the clock says stop. Each is a self-contained increment: none of them is a dependency of anything in S2.

| Priority | Feature | Effort | Why it earns its place | Spec owner |
|---|---|---|---|---|
| CV-1 | **Ambiguity / contradiction flag** surfaced on one requirement | 2-3 h | Handoff S14, decision D23. One flag in the tutor review screen demonstrates that the system reads the brief critically and that the tutor, not the model, owns the clarification. | `03` S5 |
| CV-2 | **Milestone-contextual proactive Assistant message** -- exactly one per milestone, from approved content, max 3 bullets, dismissible | 2 h | Open question O2. Turns the Assistant from reactive to present, and it is a rendering of content that already exists. | `07` S4.7 |
| CV-3 | **AI discussion moderation flag** -- advisory severity + reason code; high severity hides pending tutor review | 3 h | Decisions D28, O3. Makes the moderation queue non-empty in a live demo. | `05` S9 |
| CV-4 | **PDF deep link from a Map node to its source page** | 2 h if page mapping is stored at ingestion, 5 h if retrofitted | Decision D43. The strongest cheap visual proof of C2. Build page mapping into ingestion (T4) rather than retrofitting. | `07` S4.2, `04` S5 |
| CV-5 | **Rich analytics distribution** for one milestone (elapsed-time histogram) | 2 h | Decision D34. Turns "47 minutes" into a shape. Lowest priority of the five: the signal in T10 already carries the argument. | `08` S5 |

If the team is behind schedule on Saturday evening, CV-4 and CV-5 are cut first. CV-1 and CV-2 are cut only if S2 is not yet complete.

---

## 4. OUT -- with the reason

Each entry states the reason so a later "quick win" does not quietly reintroduce it.

### 4.1 Product capabilities

| Out of scope | Reason |
|---|---|
| **Canvas API integration, Canvas SSO, live LMS sync** | **D45, D59.** Excluded by decision, not deferred: no form of Canvas or LMS integration is planned, and none may be stubbed. A live authenticated third-party session is a demo-day single point of failure with no scoring benefit. The app must run with `CANVAS_*` unset. |
| Course/module teaching-content ingestion | **D5.** Keeps the system an assignment workspace, not a general tutor, and keeps retrieval tractable. |
| Student audio and video uploads | **O11.** Transcode-and-process is the expensive half of multimodal intake, and it buys one demo beat. Image, PDF and plain-text uploads carry the capability; audio and video are refused at the picker with a clear message, not silently. Constraint C6 still binds the shipped request path: pasted code or a pasted draft is the text modality and every guardrail rule applies to it unchanged. |
| Any assistant behaviour that generates, critiques, debugs, evaluates or reviews student work | **C1, D6, D11.** Not a scope tradeoff. This is the product. |
| AI-authored official clarifications or FAQ content | **D23.** Detection and drafting for tutor review only. The tutor authors what becomes official. |
| Auto-promotion of an approved student answer into the FAQ | **O8.** Promotion is always an explicit separate tutor action, so authority is never granted implicitly. |
| Per-student analytics, identity reveal behind an anonymous post, individual activity history | **C5, D26, D31.** The privacy promise is not a feature toggle. |
| "Show me who asked this" for tutors, in any form including sort order | **D26.** If the guarantee is not absolute it is worthless. |
| Active-vs-idle time classification | **D33.** Unbounded research cost for a metric nobody asked for. |
| A second vector database, or embeddings in the MVP | **D38.** Assignment documents are tens of pages. Full-text is sufficient and one less service to keep alive. |
| A general-purpose study chatbot mode | **D2.** Scope creep into the one thing the product defines itself against. |
| Real-time collaboration, comments on the brief, inline annotation | Not required by any part of the loop, and each is a separate editing model. |
| Email or push notifications | The demo is synchronous. Deep-linkable in-app state is enough. |
| Calendar / deadline integration | Tier 3 (handoff S67). |
| Advanced tutor permission model | **O4.** Flat is fine at this size. |
| Historical assignment comparison across semesters | Tier 3. Needs a data history that does not exist. |
| Intervention recommendations ("email these students") | **D35.** Analytics surface evidence and stop. |
| Mobile application | The hackathon accepts a web application. A second shell halves the UI budget. |
| Internationalisation, theming, light/dark toggle | Cosmetic. Pick one and commit. |

### 4.2 Non-product items

| Out of scope | Reason |
|---|---|
| Editing `app/` before WP-01 | There is no application code yet, and it must all be written inside the hackathon window (`AGENTS.md` S7). **Superseded:** all application code now exists and every commit is dated `2026-10-04`, so the window requirement is satisfied and evidenced by the commit dates rather than by the absence of code. Live state: [`handoff/01-STATE.md`](handoff/01-STATE.md) section 3. |
| Presenting `archive/canvas-scraper/` as submission-time code | It was built during the design phase and is prior work. It may be *cited* as research evidence; it must not be presented as hackathon output. |
| Modifying, reformatting or moving the frozen originals | `AGENTS.md` S3, `CONTRIBUTING.md` S1.5. Corrections go into `01-DECISIONS.md`. |
| Importing `archive/canvas-scraper/` from `app/` | **D44.** Keeps a working tool working and keeps the submission honest about what was built during the event. |
| Committing `cookies.txt`, `.env`, `out/`, or any credential | **C7.** |
| Separate backend service, queue, worker, or microservice | One deployable (D36). A queue is an operational surface with no requirement behind it. |
| GraphQL, tRPC, a design-system dependency, a component library with its own design language | `AGENTS.md` S5.1. |
| Kubernetes, Terraform, CI matrix beyond lint + typecheck + test | Operational cost with no judging criterion attached. |

---

## 5. What is REAL, MOCKED, STUBBED or SIMPLIFIED at demo time

Read this table as the honest contract with the judges. Every row is either built and working, or it is labelled.

| Surface | Status at demo | What that means in practice |
|---|---|---|
| TypeScript / Next.js / Tailwind app, one deployable | **REAL** | Built during the event. Runs locally. |
| Postgres schema, migrations, typed query layer | **REAL** | Migration files in the repo; no hand-edited database. |
| Auth: email + password, httpOnly session cookie, role claim | **REAL (simplified)** | No SSO, no email verification, no password reset (D42). Two seeded accounts. |
| Document upload and storage | **REAL (simplified)** | Local filesystem driver (D41). S3 driver exists behind the interface and is not exercised. |
| PDF text extraction and chunking | **REAL (simplified)** | Text-layer PDFs only. Page mapping stored at ingestion. |
| Assignment ingestion (Assignment Analyst) | **REAL** with `LLM_PROVIDER=deepseek`; **MOCK** with `mock` | Same interface. `mock` returns fixed, hand-written structured output for the demo assignment. The status of the provider is visible in the UI so nobody is misled about what produced the screen. |
| Guardrail policy layer | **REAL** | Deterministic rules; runs with no network call. The model call is an enhancement, not the only line of defence (D7, `AGENTS.md` S6.2). Unit-tested against a golden set that includes laundering attempts. |
| Guardrail model-assisted classification | **REAL** with a live provider; **STUB** offline | With `mock`, classification falls back to the rule layer only and says so in its log. Never fails open (D8, D16). |
| Assistant responses | **REAL** with a live provider; **MOCK** with `mock` | Grounded in approved content. With `mock`, responses are deterministic canned strings for the scripted demo questions, clearly labelled in the UI. |
| Assignment Map | **REAL** | Rendered from tutor-approved nodes. Visually distinct from the brief (C2, D18). |
| Map node -> source page deep link | **REAL** if CV-4 lands; **NOT PRESENT** otherwise | If it is not built, the Map still renders, and nobody claims the deep link works. |
| Checklist and elapsed-time capture | **REAL** | Elapsed wall-clock, idle included, labelled "elapsed time" (D33). |
| Private Query thread and tutor Reply | **REAL (simplified)** | Flat thread view, no attachments, no read receipts. |
| Anonymous Discussion and `Anonymous Student #N` | **REAL** | Per-(student, assignment) HMAC pseudonym from `ANON_ID_SECRET` (D27). |
| Discussion moderation | **REAL** (tutor remove/hide). **MOCK** AI flagging offline (`mock` returns a fixed severity for the demo post) | The queue and the human action are real. Only the model's advisory flag is canned offline. |
| FAQ publishing | **REAL** | Tutor-only action, explicit (D24). |
| Assignment Health aggregates | **REAL logic over SYNTHETIC data** | The aggregation, the k-anonymity floor and the difficulty signal are real code. The cohort is a seeded fixture of 37 synthetic students, generated deterministically by the seed script. Every analytics screen carries a visible "demo data" marker. No real student data exists anywhere in this project. |
| Potential difficulty area | **REAL** | Derived from the seeded data by real code (D34). The *claim* that a real cohort has this shape is not made. |
| Ambiguity / contradiction flag | **MOCK** at write time, **REAL** as a review workflow | The demo flag for the seeded assignment is authored in the fixture. The review/edit/discard/approve path around it is real. |
| Proactive milestone message | **REAL** if CV-2 lands | From approved content only, capped, dismissible (O2). |
| Student attachment uploads: image (PNG/JPEG), PDF, plain text | **REAL** if S6a lands before freeze; **NOT PRESENT** otherwise | Picker, type and size check, extraction, and a guardrail scan per upload. If it does not land, the picker is absent entirely rather than present-but-broken, and the Assistant states uploads are unsupported. |
| Student audio and video uploads | **OUT** | Refused at the picker with a clear message. No transcode, no processing path, no silent acceptance. |
| Canvas integration | **OUT** | Not built, not stubbed, not referenced in the app (D45). The retired scraper in `archive/canvas-scraper/` is not required by, and not used by, the app (D44). |
| Notification delivery, calendar, deadlines | **OUT** | Not built. |

### The rule for the demo

> If a screen shows canned output, the presenter says so in the same breath, or the screen itself says so.

A judge who is told "this is the offline provider, so the structure you see was authored by us as a fixture" trusts everything else more, not less. A judge who discovers it alone stops believing the rest of the demo.

---

## 6. Scope change control

1. If it is not in S2 or S3, it is out. Do not build it.
2. If something in S2 turns out to be undevelopable in the time available, it moves to S4 by **amending this file**, not by silently dropping it. Say what is not built.
3. A new feature request inside the weekend requires: a row in `01-DECISIONS.md`, an entry in S2 or S3 here, a work packet or an amendment to an existing one in [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md), and something else moving out. Net scope does not grow.
4. Any change that weakens `AGENTS.md` S2 is not a scope change, it is a defect. Stop and ask.

---

## 7. Related

| Doc | Relationship |
|---|---|
| [`01-DECISIONS.md`](01-DECISIONS.md) | Source of D1-D73 and O1-O12. Wins over this file on conflict. |
| [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) | The work packets that deliver S2 and S3. |
| [`10-RUBRIC-ALIGNMENT.md`](10-RUBRIC-ALIGNMENT.md) | What each in-scope feature is worth to a judge. |
| [`13-DEMO-STORY.md`](13-DEMO-STORY.md) | The 5-minute path through this scope, with fallbacks. |
| [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) | Tracks what was actually built against this table. |
| `hackathon info/info.md` | Frozen brief. S67 (MVP priority tiers) and S66 (overengineering) are the inputs to S2 and S4. |
