# Assignment Assistant

**An AI-native assignment workspace for university students and tutors.**

Built for the **CSIT RE:Uni Hackathon 2026** -- theme: *Innovating Education*.

> The assignment workspace that understands the brief, protects academic integrity, and shows tutors where students are getting stuck.

---

## The problem

University assignments sit between two groups who are both poorly served by the current tooling.

**Students** hesitate to ask for clarification -- the question feels stupid, the fear of judgment is real, and they often do not know whether AI is even allowed for this particular assignment. Generic AI assistants make the last problem worse: they will happily write the code or produce the answer, which is exactly what academic integrity rules forbid.

**Tutors** answer the same questions over and over, cannot see which part of the assignment the cohort is actually struggling with, and only discover that a requirement was ambiguous after students start work.

## The product

The assignment -- not a chat window -- is the central object.

```text
TUTOR  STUDENT
  |  |
  |  uploads brief + rubric + AI policy  |
  v  |
AI ingests and proposes a structure:  |
  - Assignment Map  (navigation)  |
  - Milestones + checklist (progress)  |
  - FAQ candidates  (shared answers)  |
  - Ambiguity / contradiction flags  |
  - AI-usage rules  (the guardrail)  |
  |  |
  v  |
TUTOR REVIEWS, EDITS, APPROVES ------------------>|
  |
  works through the assignment:
  - original brief, verbatim
  - the approved Assignment Map
  - checklist progress + elapsed time
  - a strictly constrained AI coach
  - private questions to the tutor
  - anonymous peer discussion
  |
  v
  TUTOR: aggregate cohort insight  -- 
  where time goes, where questions cluster,
  which areas need intervention
```

### The four things that make it different

| # | Differentiator | Why it matters |
|---|---|---|
| 1 | **Assignment-specific AI policy enforcement** | The assistant knows what AI use *this* assignment permits, and refuses the rest. Not a generic chatbot with a disclaimer. |
| 2 | **Upload once, get a workspace** | The brief stops being a PDF in an LMS and becomes a navigable, structured, tutor-approved workspace. |
| 3 | **Anonymous peer discussion with a route to shared knowledge** | Psychological safety increases the number of questions asked; tutor approval turns good answers into official cohort-wide FAQs. |
| 4 | **Cohort difficulty detection** | Elapsed time and question volume are combined to surface *"this section is a problem"* -- not just a bar chart. |

### The refusal is the feature

```text
Student:  "Here's my code. What's wrong with it?"

Assistant: "I can't inspect or modify your implementation under this
  assignment's AI policy.

  I can help with: interpreting the requirement you're working on,
  what the rubric rewards, or planning your own next steps."
```

This is the deliberate design of the product, not a limitation of it. The AI is constrained so that the student remains the one doing the academic work.

---

## Repository status

**Built, frozen, and submitted as a hackathon entry.** The application exists under `app/` -- a Next.js App Router implementation of the committed MVP, written inside the event window and tagged through Phases 1-6. `pnpm demo:smoke` checks the demo machine; four acceptance runs check the product end to end.

**Where to look for what exists.** [`docs/handoff/01-STATE.md`](docs/handoff/01-STATE.md) is rewritten every session and is the authoritative answer. It records the build, the verified commands and their output, and -- in its section 4 -- what is deliberately **not** built.

**Three things a reader should know before trusting any number here.** Totals are deliberately not quoted in this repository (trap **T42**: a count written into a file the repository contains is stale on commit); the event-window claim is `git log --format=%ad --date=short | sort -u`, which returns one date however many commits follow; and `docs/11-BUILD-PLAN.md`, `docs/12-OPERATIONS.md` and `docs/04-TECH-ARCHITECTURE.md` each open with a "no application code exists" line that is **historical** and carries a superseding note.

The docs below are the implementation contract the build was held to. Where the build diverged, the divergence is a numbered row in [`docs/01-DECISIONS.md`](docs/01-DECISIONS.md) rather than an edit to the specification.

| Path | What it is |
|---|---|
| `AGENTS.md` | **Normative working agreement for AI coding agents.** Read first. |
| `CONTRIBUTING.md` | Team working agreement: commits, branches, definition of done. |
| `docs/handoff/01-STATE.md` | **What actually exists right now**, rewritten every session. |
| `docs/00-INDEX.md` | Map of the whole doc set, and the reading order per role. |
| `docs/01-DECISIONS.md` | Decided / recommended / open, with rationale. The canonical answer to "what did we settle?" |
| `docs/02-SCOPE.md` | Committed MVP cut -- what is in, what is mocked, what is out. |
| `docs/03-PRD.md` | Product requirements, user stories, acceptance criteria. |
| `docs/04-TECH-ARCHITECTURE.md` | Stack, system shape, LLM provider adapter. |
| `docs/05-AI-GUARDRAILS.md` | The policy layer: rules, decision procedure, golden test set. |
| `docs/06-DATA-MODEL.md` | Entities, relationships, API contracts, truth hierarchy. |
| `docs/07-UI-UX-SPEC.md` | Screen-by-screen spec and design language. |
| `docs/08-ANALYTICS-SPEC.md` | Aggregate metrics and the Assignment Health view. |
| `docs/09-PROBLEM-AND-RATIONALE.md` | The judge-facing problem argument, with the Canvas measurement as evidence. |
| `docs/10-RUBRIC-ALIGNMENT.md` | Each judged criterion mapped to the features and the evidence for it. |
| `docs/11-BUILD-PLAN.md` | Sequenced work packets, dependencies, verification gates. |
| `docs/12-OPERATIONS.md` | Environment, local setup, secrets handling, failure modes. |
| `docs/13-DEMO-STORY.md` | The demo script and its wow moments. |
| `docs/14-HACKATHON-SUBMISSION.md` | Devpost + presentation requirements, including AI-use disclosure. |
| `docs/15-GLOSSARY.md` | Canonical vocabulary: one term, one meaning, everywhere. |
| `hackathon info/info.md` | The official brief, rubric, and schedule. **Frozen input.** |
| `docs/project idea.md`, `docs/assignment_assistant_project_handoff.md` | Original product thinking. **Frozen inputs** -- superseded in form, not in substance. |

`archive/canvas-scraper/` is a retired read-only Canvas discussion scraper built during the design phase. It answered a research question at the time -- *can we harvest real discussion data as a design input?* -- and it is **no longer required and not used by the app**: Canvas integration is out of MVP scope (D45) and the scraper is never imported by `app/` (D44). See `archive/canvas-scraper/README.md`.

---

## Getting started

> These commands are live. `LLM_PROVIDER=mock` runs the whole product offline with no API key at all -- that is how the four acceptance runs and `pnpm demo:smoke` are verified, and it is a supported mode rather than a stub (**D90**).

```bash
# 1. Configuration
cp .env.example .env  # then fill in DATABASE_URL and AUTH_SECRET
  # LLM_PROVIDER=mock works with no API key at all

# 2. Install and prepare
cd app
pnpm install
pnpm db:migrate
pnpm db:seed  # loads the demo assignment and cohort

# 3. Run
pnpm dev  # http://localhost:3000
```

With `LLM_PROVIDER=mock`, the whole product loop is walkable offline: ingestion produces canned-but-realistic structured output, and the guardrail still runs its real, deterministic rules. Swap in `deepseek` or `gemini` by setting the provider and a key.

### Demo accounts (seeded)

| Role | Credentials |
|---|---|
| Tutor | `tutor@demo.rmit` / `demo1234` |
| Student | `student@demo.rmit` / `demo1234` |

---

## Documentation conventions

- **Numbers are stable.** `docs/NN-...` identifiers are cited from code comments and other docs. Do not renumber.
- **Earlier number wins on conflict.** If `05` and `09` disagree, `05` is right and `09` is a bug.
- **Never paraphrase a requirement into the product.** Where the docs quote the assignment, they quote it. See constraint C2 in `AGENTS.md`.
- **Frozen files stay frozen.** `docs/project idea.md`, `docs/assignment_assistant_project_handoff.md`, and `hackathon info/info.md` are inputs, not deliverables. Corrections go in `docs/01-DECISIONS.md`.

## Licence and use

Hackathon project. Team-authored code only; no third-party code is vendored without a licence check. Generative AI was used in this project and its use is disclosed in `docs/14-HACKATHON-SUBMISSION.md`.
