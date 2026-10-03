# 14 -- Hackathon Submission

**Purpose.** A living tracker for every official submission requirement, plus the working text of the mandatory AI-use disclosure. Filled in as work happens, not reconstructed on Sunday morning (`AGENTS.md` S7).

**Official requirements.** [`hackathon info/info.md`](../hackathon%20info/info.md): "Project & Submission Requirements", "What to Submit", "Schedule".

**Status convention.** `NOT STARTED` / `IN PROGRESS` / `DONE` / `AT RISK`. Update the status column the moment it changes.

**Warning about this document.** At the time of writing, **no application code exists** (`app/` is absent) and the repository **is** under version control -- it carries 7 commits, HEAD `da00f71`, remote `origin https://github.com/SharlEclair/rmit-hackathon.git`. Public visibility of that remote is **not verified**: an anonymous fetch of the repository URL returns HTTP 404. Nothing in this file may claim otherwise. Where a field depends on something that does not exist yet, it is marked `TBD` rather than filled with an optimistic guess.

---

## 1. The deadlines

From the official schedule:

| Event | Date and time | Hard? |
|---|---|---|
| Opening ceremony | Fri 2 Oct, 4:00 PM | Formal start of the event window |
| On-campus rooms open | Sat 3 Oct, 9:00 AM | Resource |
| **Team registration form due** | **Sat 3 Oct, 2:00 PM** | **Hard.** One member completes it. |
| Rooms close | Sat 3 Oct, 5:00 PM | Continue remotely |
| Rooms reopen | Sun 4 Oct, 9:00 AM | |
| **Submissions due** | **Sun 4 Oct, 12:00 PM** | **Hard.** "Late exceptions cannot be guaranteed." |
| Live presentations | Sun 4 Oct, 1:00 PM | |
| Winners announced | Sun 4 Oct, 3:00-3:30 PM | |

Internal deadlines, set 30 minutes ahead of every official one so a failure has somewhere to go ([`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) S1.1):

| Internal deadline | Why |
|---|---|
| Sat 1:30 PM -- registration form submitted | 30 minutes of slack on a hard deadline with a form in the way |
| Sun 11:00 AM -- feature freeze, tagged commit | Stops the last-hour "one more fix" that breaks the demo |
| Sun 11:30 AM -- Devpost submission filed | 30 minutes before the official deadline |
| Sun 12:00 PM -- presentation script rehearsed twice more | Presentations start at 1:00 PM |

---

## 2. Requirement tracker

| # | Official requirement | Source | Status | Owner | Evidence / location |
|---|---|---|---|---|---|
| R1 | Team members are RMIT students and CSIT members | Info: Eligibility | `NOT STARTED` | Lead | Confirm for each member before Sat 2:00 PM |
| R2 | Team of **up to 4** students | Info: What to Build | `NOT STARTED` | Lead | Names and member count below |
| R3 | **Team registration form** completed by one member | Info: What to Submit | `NOT STARTED` | Lead | Submission confirmation; deadline Sat 2:00 PM |
| R4 | Register on **Devpost** | Info: Get Started | `NOT STARTED` | Lead | Devpost account(s) |
| R5 | **Public GitHub repository** created | Info: Get Started | `IN PROGRESS` | Track A | The repository exists and is pushed (`origin https://github.com/SharlEclair/rmit-hackathon.git`, 7 commits, HEAD `da00f71`), so WP-01''s `git init` and remote steps are done. **Public visibility is unverified** -- an anonymous fetch returns HTTP 404, so confirm the GitHub visibility setting |
| R6 | Commit often, as proof of progress | Info: Requirements | `IN PROGRESS` | All | `git log --format="%cI %s"` -> 7 commits, all dated `2026-10-04` (inside the event window but inside a single 38-minute span). Commit per logical change from here on; see S8 |
| R7 | Only work inside the hackathon timeline; **no old projects or schoolwork** | Info: Requirements | `DONE` (by construction) | Lead | `app/` does not exist yet, so nothing in it can predate the event. Prior design material is disclosed in S5. |
| R8 | Only work within the team; **no external assistance** | Info: Requirements | `DONE` (acknowledged) | All | [`CONTRIBUTING.md`](../CONTRIBUTING.md); no outside implementation help accepted |
| R9 | **AI use appropriately referenced**; explain **how and why** in the Devpost submission | Info: Requirements | `IN PROGRESS` | Lead | S5 of this document |
| R10 | AI use explained in the **presentation** | Info: Requirements | `IN PROGRESS` | Lead + narrator | [`13-DEMO-STORY.md`](13-DEMO-STORY.md) beat 8 and S15 |
| R11 | **Devpost submission**: repository link plus written description | Info: What to Submit | `NOT STARTED` | Lead | S6 draft; due Sun 12:00 PM |
| R12 | Live presentation prepared | Info: Schedule | `IN PROGRESS` | Lead + narrator | [`13-DEMO-STORY.md`](13-DEMO-STORY.md); rehearsed three times per WP-12 |
| R13 | Nothing committed that we do not have the right to publish | `CONTRIBUTING.md` S1.3 | `IN PROGRESS` | Track A | No third-party code vendored. `cookies.txt` and `.env` gitignored (C7). Canvas research is disclosed in S5. |

### Fields to fill in as they are confirmed

| Field | Value |
|---|---|
| Team name | `TBD` |
| Team members (names, student numbers if required) | `TBD` |
| Public repository URL | https://github.com/SharlEclair/rmit-hackathon.git (**public visibility unverified**) |
| Devpost project URL | `TBD` |
| Demo/presentation slot | From the schedule: Sun 4 Oct, 1:00 PM |
| Registration form submitted by / at | `TBD` |

---

## 3. Submission-day run sheet (Sunday)

Times are local. The lead owns this sheet and announces each transition out loud.

| Time | Action | Owner | Done |
|---|---|---|---|
| 07:00 | Stand-up: what is broken, what is frozen | Lead | [ ] |
| 07:00-09:00 | Finish the last in-flight packet. Nothing new starts. | Tracks | [ ] |
| 09:00 | `pnpm db:seed` and `pnpm demo:smoke` on the demo machine | Track D | [ ] |
| 09:30 | Full rehearsal #2, network **off** | All | [ ] |
| 10:00 | Record any fallback artefact still missing | Track D | [ ] |
| 10:30 | Full rehearsal #3, network on, stopwatch | All | [ ] |
| **11:00** | **FEATURE FREEZE.** Tag the commit. Only docs and slides change after this. | Lead | [ ] |
| 11:00 | Confirm the repository is public and pushed | Lead | [ ] |
| 11:15 | Final read of the Devpost text and the AI-use disclosure against the commit history | Lead | [ ] |
| **11:30** | **FILE THE DEVPOST SUBMISSION.** Do not wait for 11:59. | Lead | [ ] |
| 11:30-11:50 | Reset the demo state; check the fallback files open | Track D | [ ] |
| 11:50 | Laptops to the presentation room; second laptop with the recording | Driver | [ ] |
| 12:00 | Official deadline passes. We are already submitted. | -- | [ ] |
| 12:15-13:00 | Read the script aloud once more; check the two typed questions are on the clipboard | Narrator | [ ] |
| 13:00 | Present | All | [ ] |

---

## 4. What the repository can and cannot show today

This section exists so the disclosure in S5 can be checked against it. Verified by reading the repository, not by memory.

### 4.1 What exists and is verifiable today

| Artefact | Location | What it demonstrates |
|---|---|---|
| Normative working agreement for AI agents | [`AGENTS.md`](../AGENTS.md) | Constraints C1-C8, including that the AI must never do the assignment for the student |
| Team working agreement | [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Commit discipline, definition of done, and the list of rules not traded away under time pressure |
| Project README | [`README.md`](../README.md) | Product model, the refusal excerpt, and an explicit statement that this is the documentation phase |
| Restructured documentation set | `docs/00-INDEX.md` ... `docs/18-IMPLEMENTATION-PLAN.md` | The implementation contract: decisions, scope, PRD, architecture, guardrails, data model, UI spec, analytics, build plan, demo story |
| Decisions register | [`docs/01-DECISIONS.md`](01-DECISIONS.md) | D1-D73, open questions O1-O12 with working defaults, and an explicitly rejected list |
| Canonical vocabulary | [`docs/15-GLOSSARY.md`](15-GLOSSARY.md) | One term, one meaning, and a do-not-use list |
| Environment contract | [`.env.example`](../.env.example) | Includes the offline `mock` provider and the per-assignment anonymity key |
| Frozen originals, unmodified | `docs/project idea.md`, `docs/assignment_assistant_project_handoff.md`, `hackathon info/info.md` | The prior product thinking, preserved verbatim ([`docs/originals/README.md`](originals/README.md)) |
| Canvas discussion research (retired) | `archive/canvas-scraper/` | A read-only scraper with 28 offline tests, an 8-check integrity gate, and one measured discussion topic (33 posts, 12 root questions) used as a design input. Retired prior work -- not required by, and not used by, the app |

### 4.2 What does not exist today, and must not be claimed

| Absent | Consequence for the disclosure |
|---|---|
| Application code (`app/` does not exist) | The disclosure must not describe application implementation as done |
| A commit history that spans the event window | The repository and remote exist (7 commits, HEAD `da00f71`), but all 7 fall inside a 38-minute window on 2026-10-04, so the history does not yet demonstrate sustained progress (S8) |
| Public visibility of the repository | The remote is configured and pushed, but an anonymous fetch returns HTTP 404, so public access is unconfirmed and must not be claimed |
| A Devpost submission | `TBD` until Sunday |
| Team registration | `TBD` until Saturday 2:00 PM |
| Any deployed instance | Not a requirement, and not claimed |

**Rule.** If a sentence in S5 cannot be checked against S4.1, it does not go in S5.

---

## 5. AI-use disclosure (working draft)

The official requirement: *"Use of generative AI must be appropriately referenced. Please include an explanation of how and why you used AI to assist you in your Devpost submission and presentation."* Two things must be covered: **how**, and **why**.

This draft is truthful as of the state described in S4. Sections marked `[APP PHASE - fill in as we go]` are for the build phase and are currently empty on purpose.

### 5.1 Draft text for the Devpost submission

> **How we used generative AI**
>
> **1. Design and documentation (pre-implementation).** We used an agentic coding tool (DeepSeek Harness, DSH) to restructure our own prior product thinking into an implementation-ready documentation set: [`docs/00-INDEX.md`](00-INDEX.md) through [`docs/15-GLOSSARY.md`](15-GLOSSARY.md). The AI was given the frozen source documents and a normative working agreement, [`AGENTS.md`](../AGENTS.md), that constrains what it may write. The decisions register, [`docs/01-DECISIONS.md`](01-DECISIONS.md), is entirely derived from our own earlier design conversation; the AI organised and formalised it, and where our thinking was incomplete the AI recorded the gap as an open question with a working default rather than inventing an answer. We reviewed the result and it is what we are building against.
>
> **2. Application implementation (during the hackathon).** `[APP PHASE - fill in as we go]` Each commit that was substantially AI-drafted is described here, grouped by work packet, with the commit range as evidence. We are keeping this section current rather than reconstructing it at the end.
>
> **3. AI inside the product (runtime).** Assignment Assistant uses a large language model at runtime for four things: reading uploaded assignment documents and proposing a structure for tutor review; classifying student requests against the assignment's AI usage policy; answering permitted student questions from approved content; and flagging discussion posts for tutor review. All model calls go through a single provider adapter, and the provider is configuration rather than a hard dependency: the product can run end to end with a fully offline deterministic provider, which is how we demonstrate it when the network is unreliable.
>
> **4. The constraint on the product's AI.** The single most important design constraint in this project is that the AI must never do the assignment for the student. It does not generate answers, write or debug code, evaluate student work, or tell a student what to change. That boundary is enforced by a separate, deterministic policy layer that runs *before* any model call and is unit-tested offline against a set of cases that includes deliberately reworded attempts to get around it. The model is an enhancement on top of that layer, not the only line of defence.
>
> **Why we used AI**
>
> - **Because the problem we are addressing is about boundaries on AI, and we wanted to build the boundary rather than describe it.** Demonstrating that an AI can be constrained usefully is the product.
> - **Because the design surface was large and the time was short.** We had a detailed design conversation already; using AI to restructure it into a buildable contract let us spend the hackathon building instead of reformatting our own notes.
> - **Because a documentation-first approach is how we keep the AI honest.** The working agreement, the decisions register and the canonical glossary exist so that AI-generated work is checkable against a written contract rather than taken on trust. Every AI-produced artefact carries recorded provenance inside the product, and the same principle is applied to how we built it.
>
> **What we did not use AI for**
>
> - The product decisions. The problem statement, the priority order, the scope cuts, the privacy model and the refusal-as-feature stance are ours, and they predate the hackathon.
> - The Canvas discussion research scraper. That is ordinary deterministic Python with an offline test suite.
> - Any judgement about what to submit or how to present it.
>
> **Prior work, disclosed.** The frozen design documents (`docs/project idea.md`, `docs/assignment_assistant_project_handoff.md`) and the retired Canvas discussion research (`archive/canvas-scraper/`) predate the hackathon. They are design inputs and research evidence, and they are not submitted as hackathon output. All application code will be written during the event window, and the commit history in the repository will be the evidence (confirm the repository is publicly readable before the Devpost text claims it).

### 5.2 Per-packet disclosure log

Filled in during the build. This is what makes S5.1 item 2 specific rather than a blanket statement.

| Work packet | AI-assisted? | What the AI produced | What a human changed | Commit range |
|---|---|---|---|---|
| WP-01 | `TBD` | | | |
| WP-02 | `TBD` | | | |
| WP-03 | `TBD` | | | |
| WP-04 | `TBD` | | | |
| WP-05 | `TBD` | | | |
| WP-06 | `TBD` | | | |
| WP-07 | `TBD` | | | |
| WP-08 | `TBD` | | | |
| WP-09 | `TBD` | | | |
| WP-10 | `TBD` | | | |
| WP-11 | `TBD` | | | |
| WP-12 | `TBD` | | | |

### 5.3 Per-member disclosure

The requirement is about the team's use of AI, so each member states their own tools. Fill in before the submission is filed.

| Member | AI tools used | For what | Anything the AI wrote that was not reviewed? |
|---|---|---|---|
| `TBD` | | | |
| `TBD` | | | |
| `TBD` | | | |
| `TBD` | | | |

Answer "no" only if it is true. An honest "yes, in this one place, and here is what we did about it" costs nothing and is far better than a claim a judge can falsify.

### 5.4 Claims we must not make

Checked before filing. Each of these would be false today.

- "We built a multi-agent system" -- the capabilities are separate internal modules, and decision D13 keeps them out of the user-facing product.
- "It handles text, image, audio and video" -- image (PNG/JPEG), PDF and plain text are in scope (O11); **audio and video are not**, and are refused at the picker. Do not claim all four.
- "It processes audio and video" -- same reason. Name the three supported modalities and stop.
- "It integrates with Canvas" -- Canvas/LMS integration is excluded by decision, not deferred (D45, D59).
- "We validated it with students" -- no students used it.
- "The AI has been evaluated at scale" -- the guardrail has a 53-case golden set (`05` S11), which is a test suite, not an evaluation.
- "It is deployed and live" -- the MVP assumes a long-lived local Node server ([`12-OPERATIONS.md`](12-OPERATIONS.md) S5).
- "AI wrote the whole thing" -- if that were true, it would mean nobody reviewed it, which is worse than the alternative. Say what was reviewed.

---

## 6. Devpost written description (draft)

> **DRAFT WRITTEN AGAINST A PLAN, NOT AGAINST A BUILD.** At the time of writing, `app/` does not exist and there is no commit history for it (S4). The fields below describe the product as designed and the implementation as planned. **Before this is pasted into Devpost it must be rewritten in the past tense against what actually shipped**, field by field, and any field that cannot be verified against the commit history must be cut or marked as not built. Do not paste this section as it stands.

The submission needs a repository link plus a written description. Draft, to be rewritten at freeze time against what actually shipped.

**Title.** Assignment Assistant

**Tagline.** An AI-native assignment workspace that understands the brief, protects academic integrity, and shows tutors where students are getting stuck.

**Inspiration.** A tutor writes one assignment brief. Hundreds of students read it alone, and each has the same handful of questions. The brief is the authority but it cannot answer. The channels that can answer are either not safe to ask in, not authoritative, or both -- so students guess, or they paste the brief into a general assistant that will write the code for them. The gap is between authority and channel, and it is where academic integrity problems start.

**What it does.** A tutor uploads an assignment's brief, rubric and AI usage policy. The system proposes a structure -- milestones, a checklist, FAQ candidates, an ambiguity flag, and a per-assignment AI usage policy -- which the tutor reviews, edits and approves. Students then work inside the assignment: the original brief shown verbatim, an AI-generated navigation map that is clearly labelled as interpretation, a progress checklist, an anonymous place to ask, a private channel to the tutor, and an AI coach that reads that assignment's own AI policy and refuses anything outside it. Students can attach an image, a PDF or a block of text to an Assistant turn; audio and video are refused at the picker rather than accepted and ignored. Tutors see aggregate insight into which milestones are slow and heavily questioned.

**How we will build it.** Next.js, TypeScript, Tailwind, Postgres with in-repo migrations, and a provider-agnostic model adapter with a fully offline mode. See [`docs/04-TECH-ARCHITECTURE.md`](04-TECH-ARCHITECTURE.md). **At freeze time this becomes "How we built it" and the stack list must be checked against `app/package.json`.**

**Why this design.** The hardest part of the problem is making the guardrail credible rather than aspirational. A prompt that says "do not do the assignment" cannot be demonstrated or tested, so the design puts the policy decision in a deterministic layer that runs before any model call, with a default of refusal and a test suite of prohibited and reworded requests. The second difficulty is the same one in disguise: keeping the original brief authoritative while still showing structure, which is why the AI's interpretation is a visibly separate object from the document. **At freeze time this becomes "Challenges", rewritten against what actually turned out to be hard.**

**What we are proud of.** The refusal. A student asks the assistant to debug their code, and it declines, cites that assignment's policy, and offers what it can help with instead. Building that boundary well is the whole point of the product. **At freeze time, confirm on the running system before claiming it, and reword to the past tense.**

**What is next.** Richer analytics distributions over real cohort data rather than a seeded demo cohort. Student audio and video uploads are **not** next: [`02-SCOPE.md`](02-SCOPE.md) rules them OUT (O11), refused at the picker because transcode-and-process is the expensive half of multimodal intake. (The previous wording listed them here; corrected in Phase 0.)

Canvas/LMS integration is **not** on this list and is not planned. It is excluded by decision (D45, D59), not deferred: no Canvas API call, no Canvas SSO, no live LMS sync, and no stub for any of them.

**Built with.** `TBD` -- fill in from `app/package.json` at freeze time. Do not list anything that is not in the lockfile.

---

## 7. Presentation notes

Requirements: explain the **problem, solution, demo and impact**, and state the **AI use** aloud. The script, timing and fallbacks are in [`13-DEMO-STORY.md`](13-DEMO-STORY.md).

| Element | Where it is delivered | Non-negotiable content |
|---|---|---|
| Problem | Beat 1 | The authority-versus-channel gap, named in one sentence |
| Solution | Beats 2-4 | Approval as the trust boundary; interpretation visibly separate from the official brief |
| Demo | Beats 2-7 | The refusal, live, with the deterministic guardrail stated as the reason it is reliable |
| Impact | Beat 8 | Aggregate insight for the tutor, with the k-anonymity floor shown |
| AI use | Beat 8, closing sentence | How, why, and what was reviewed -- in twenty seconds |
| Honesty | Throughout | Analytics runs on seeded demo data; multimodal uploads and Canvas are out of scope. Say it before a judge asks. |

### Presentation checklist

- [ ] Script memorised to bullet points, not word-for-word. The exact refusal wording is memorised word-for-word.
- [ ] Three full rehearsals completed, one with the network off.
- [ ] The AI-use sentence rehearsed as part of the script, not as an afterthought.
- [ ] Every fallback artefact opens offline on the demo machine ([`13-DEMO-STORY.md`](13-DEMO-STORY.md) S12).
- [ ] The two typed demo questions are on the clipboard and in a text file.
- [ ] Two laptops: one to present, one pre-seeded with the recording.
- [ ] Nobody says "revolutionise", "seamlessly", "leverage" or "game-changing".

---

## 8. Risks specific to submission

| Risk | Impact | Mitigation | Trigger |
|---|---|---|---|
| The repository is never made publicly readable | No submission at all | The repository and remote already exist (WP-01''s `git init` and remote are done); confirm the GitHub visibility setting and that `origin/main` is pushed | Sat 09:00 and the repo URL still returns 404 anonymously |
| The commit history does not span the event window | The "commit often" evidence is missing, and the honesty of R7 comes into question | Commit per logical change from here on, using `CONTRIBUTING.md` S2 conventions | **Already firing:** 7 commits, all inside a 38-minute span on 2026-10-04. Also fires on Sunday with fewer than ten commits, or all commits in a single hour |
| A secret is pushed to a public repository | Immediate exposure, credential rotation, history cleanup | `.gitignore` verified in WP-01; `git status --porcelain` before every `git add -A` | Any secret appears in `git status` |
| The disclosure is written on Sunday morning | It is vague, and it does not match the history | S5.2 is filled in per packet as the work happens | Saturday 18:00 with an empty S5.2 |
| Submission is filed late | Disqualified or unjudged; "late exceptions cannot be guaranteed" | Internal deadline 11:30 AM, 30 minutes early | 11:15 AM and the submission is not open in a browser tab, filled in |
| The registration form is missed at Sat 2:00 PM | Team may not be eligible to submit | Treated as a Saturday mid-day task with its own row (R3) | Sat 12:00 PM and the form has not been opened |
| Devpost requires fields we have not prepared (video, images, member list) | A last-minute scramble | Open the submission form on Saturday and read every required field | Sat 18:00 and the form fields are unknown |
| The presentation claims something not built | Judges check, and the credibility cost is larger than the feature | S5.4 checklist, read aloud before presenting | Any presenter statement not traceable to [`02-SCOPE.md`](02-SCOPE.md) S5 |

---

## 9. Related

| Doc | Relationship |
|---|---|
| `hackathon info/info.md` | The official requirements this document tracks. Frozen. |
| [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) | WP-01 creates the repository this submission depends on; WP-12 owns the freeze and the rehearsal. |
| [`13-DEMO-STORY.md`](13-DEMO-STORY.md) | The presentation the notes in S7 support. |
| [`02-SCOPE.md`](02-SCOPE.md) S5 | What may and may not be claimed about the product. |
| [`12-OPERATIONS.md`](12-OPERATIONS.md) S6 | Secret handling, which R13 depends on. |
| [`docs/originals/README.md`](originals/README.md) | Records which files are prior work and must not be presented as hackathon output. |
| [`AGENTS.md`](../AGENTS.md) S7 | The hackathon obligations, of which this document is the tracker. |
