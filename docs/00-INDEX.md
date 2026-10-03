# 00 -- Documentation Index

**Project:** Assignment Assistant -- CSIT RE:Uni Hackathon 2026 (theme: *Innovating Education*)
**Status of this doc set:** implementation-ready. No application code has been written yet; that is deliberate.

> **Superseded at the Phase 7 freeze.** The line above was true when the doc set was written and is kept as
> history. **The application is built**: Phases 1-6 are complete and tagged, `app/` holds a Next.js App
> Router implementation with **48 API route files** and **757 tests in 48 files**, four HTTP acceptance runs
> (`verify-student` 18/18, `verify-review` 20/20, `verify-analytics` 13/13, `verify-discussion` 20/20) and
> `pnpm demo:beats` at 11/11. The live per-area state is
> [`handoff/01-STATE.md`](handoff/01-STATE.md) section 3 -- rewritten every session, and the only place a
> reader should look for what exists.
>
> **Where that status is restated, and why pointers rather than edits.** Several spec documents open with a
> variant of "no application code exists" -- `02-SCOPE.md`, `04-TECH-ARCHITECTURE.md`, `11-BUILD-PLAN.md`,
> `12-OPERATIONS.md` and `16-VERIFICATION-REPORT.md`. Each is a **historical statement about the doc set at
> the time of writing, not a claim about the repository**, and each carries a superseding note rather than
> being silently rewritten -- because why they read as they do is itself informative: the specification
> preceded the build, and the build was held to it.
>
> **The rule this file carries forward** (trap **T42**): a claim about the repository, written into a file
> the repository contains, is stale on commit. Totals are therefore not quoted in `docs/**`; the command
> that counts is given instead, and the durable form of the event-window claim is
> `git log --format=%ad --date=short | sort -u`, which returns one date however many commits follow.
**Normative contract:** [`../AGENTS.md`](../AGENTS.md). If this doc set and `AGENTS.md` disagree, `AGENTS.md` wins.

---

## 1. Read this first, by role

| You are | Read in this order |
|---|---|
| **Any AI agent, first time in the repo** | [`../AGENTS.md`](../AGENTS.md) -> `01` -> `02` -> the doc your task names |
| **Building the guardrail / assistant** | `01` -> `05` -> `06` -> `11` |
| **Building ingestion (Assignment Analyst)** | `01` -> `03` S4 -> `04` -> `05` S6 -> `06` |
| **Building UI** | `01` -> `07` -> `02` -> `06` S5 |
| **Building analytics** | `01` -> `08` -> `06` -> `10` |
| **Preparing the demo / presentation** | `13` -> `14` -> `02` S4 |
| **A human teammate, 10 minutes** | [`../README.md`](../README.md) -> `01` -> `02` |

Never start coding from a single doc. `01-DECISIONS.md` is the canonical answer to "what did we actually settle?" and every other doc defers to it.

---

## 2. The doc set

| # | Doc | Answers | Owner |
|---|---|---|---|
| 00 | **00-INDEX.md** *(this file)* | Where is everything, and what is authoritative? | Lead |
| 01 | [01-DECISIONS.md](01-DECISIONS.md) | What is decided, what is recommended, what is still open -- with rationale. | Lead |
| 02 | [02-SCOPE.md](02-SCOPE.md) | What is in the MVP, what is mocked, what is explicitly out. | Lead |
| 03 | [03-PRD.md](03-PRD.md) | Problem, users, requirements, user stories, acceptance criteria. | Product |
| 04 | [04-TECH-ARCHITECTURE.md](04-TECH-ARCHITECTURE.md) | Stack, system shape, provider adapter, retrieval, ingestion pipeline. | Tech |
| 05 | [05-AI-GUARDRAILS.md](05-AI-GUARDRAILS.md) | The policy layer: rules, decision procedure, structured contract, golden test set. | Tech |
| 06 | [06-DATA-MODEL.md](06-DATA-MODEL.md) | Entities, relationships, truth hierarchy, API contracts. | Tech |
| 07 | [07-UI-UX-SPEC.md](07-UI-UX-SPEC.md) | Every screen, every state, the design language. | Design |
| 08 | [08-ANALYTICS-SPEC.md](08-ANALYTICS-SPEC.md) | Metrics, aggregation windows, thresholds, the Assignment Health view. | Data |
| 09 | [09-PROBLEM-AND-RATIONALE.md](09-PROBLEM-AND-RATIONALE.md) | Why this problem is real and worth the hackathon's marks. | Product |
| 10 | [10-RUBRIC-ALIGNMENT.md](10-RUBRIC-ALIGNMENT.md) | How the build maps to the 50-point judging rubric, with evidence per criterion. | Lead |
| 11 | [11-BUILD-PLAN.md](11-BUILD-PLAN.md) | Sequenced work packets, dependencies, verification gates, risk register. | Lead |
| 12 | [12-OPERATIONS.md](12-OPERATIONS.md) | Env vars, local dev, deploy, secret handling, failure modes. | Tech |
| 13 | [13-DEMO-STORY.md](13-DEMO-STORY.md) | The 5-minute demo script, beat by beat, with fallbacks. | Lead |
| 14 | [14-HACKATHON-SUBMISSION.md](14-HACKATHON-SUBMISSION.md) | Devpost + presentation requirements, AI-use disclosure, submission checklist. | Lead |
| 15 | [15-GLOSSARY.md](15-GLOSSARY.md) | Canonical vocabulary. One term, one meaning. | Lead |
| 16 | [16-VERIFICATION-REPORT.md](16-VERIFICATION-REPORT.md) | Point-in-time adversarial audit of this doc set, plus the Lead's resolution addendum. Local-only; not committed. | Verifier |
| 17 | [17-DESIGN-SYSTEM.md](17-DESIGN-SYSTEM.md) | Aesthetic direction, typography, token architecture, component governance, shadcn policy, quality gates. | Design |
| 18 | [18-IMPLEMENTATION-PLAN.md](18-IMPLEMENTATION-PLAN.md) | The phase-by-phase build, the session-handoff protocol, and the cross-phase trap register. | Lead |

### The handoff set -- `docs/handoff/`

Each phase is implemented in a **separate chat session**, so project state lives on disk rather
than in a conversation. Every session reads these **before** doing anything else; the entry point
is [handoff/00-README.md](handoff/00-README.md), which carries the session protocol and the
handoff template.

> **Created in Phase 0.** `docs/handoff/` exists as of the `phase-00-complete` tag, so every link
> in this section resolves. The directory is maintained by the session protocol in
> [`handoff/00-README.md`](handoff/00-README.md), not by the phase plan.

| Path | Answers | Rewritten or appended |
|---|---|---|
| [handoff/00-README.md](handoff/00-README.md) | Where do I start, and what is the protocol? | Rarely |
| [handoff/01-STATE.md](handoff/01-STATE.md) | What is actually built, and how do I prove it? | **Rewritten every session** |
| [handoff/02-DECISIONS.md](handoff/02-DECISIONS.md) | Why is this the way it is? | Append-only |
| [handoff/03-INVARIANTS.md](handoff/03-INVARIANTS.md) | What must I not break, and what must I not re-derive? | Append-only |
| [handoff/04-INTERFACES.md](handoff/04-INTERFACES.md) | What signatures may I not change? | Append-only |
| [handoff/05-ISSUES.md](handoff/05-ISSUES.md) | What is known-broken right now? | Append-only |
| [handoff/06-SESSION-LOG.md](handoff/06-SESSION-LOG.md) | What happened last time, and what failed? | Append-only |
| [handoff/07-ARCHIVE/](handoff/07-ARCHIVE/README.md) | What did the log look like at each phase end? | Append-only |

**Precedence.** These files sit **below** `AGENTS.md`, `01-DECISIONS.md` and `02-SCOPE.md`. Where a
handoff file contradicts the register, the register wins and the handoff file is the bug.

---

## 3. Frozen inputs -- do not edit

These are the source material the doc set was restructured from. They are preserved verbatim on purpose: they are the record of how the product was reasoned about, and the hackathon requires that prior thinking not be passed off as new work.

| File | What it contributes |
|---|---|
| [`hackathon info/info.md`](../hackathon%20info/info.md) | Official brief: eligibility, 50-point rubric, schedule, submission requirements, AI-disclosure rule. |
| [`docs/project idea.md`](project%20idea.md) | Problem statement, the five connected systems, the product loop, the ChatGPT contrast. |
| [`docs/assignment_assistant_project_handoff.md`](assignment_assistant_project_handoff.md) | The full design conversation: finalized decisions, strong directions, open questions, screen architecture, data-model sketch, priority tiers. |

Everything in this doc set is either **derived** from those three files, or an **implementation decision** this doc set added (marked as such in `01-DECISIONS.md` with a rationale). Nothing in them was deleted -- superseded material is cited by section number.

### Precedence when docs disagree

```text
AGENTS.md  (constraints; never overridden)
  v 
01-DECISIONS.md  (what we settled)
  v 
02-SCOPE.md  (what we are building)
  v 
lower-numbered doc  (wins over higher-numbered doc)
  v 
frozen inputs  (source material, not specification)
```

---

## 4. Adjacent, but not part of this doc set

| Path | What it is |
|---|---|
| [`archive/canvas-scraper/`](../archive/canvas-scraper/README.md) | **Retired prior work** -- a read-only RMIT Canvas discussion scraper (28 offline tests, 8-check integrity gate) that answered a design question -- *what do real student assignment questions actually look like?* It is **no longer required and not used by the app**, which must run with `CANVAS_*` unset (D44, D45). |
| [`.env.example`](../.env.example) | Environment contract. Copy to `.env`; never commit `.env`. |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Commit discipline, branching, definition of done. |

---

## 5. How to keep this doc set alive

Rules that keep it useful instead of decorative:

1. **Numbers are stable.** `docs/NN-...` is cited from code comments. Never renumber; never reuse a retired number.
2. **Decision IDs are stable.** `D1`, `D2`, ... in `01-DECISIONS.md` are cited from PR descriptions and code comments. Retire an ID by marking it superseded, never by deleting it.
3. **Change the doc in the same commit as the code.** A doc that describes old behaviour is worse than no doc.
4. **Deciding something new?** Add a row to `01-DECISIONS.md` with status, rationale, and the doc that now owns it. Do not bury a decision in code.
5. **Unsure whether something is in scope?** `02-SCOPE.md` is the answer. If it is not listed as in-scope, it is out.
