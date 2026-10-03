# 00 — Documentation Index

**Project:** Assignment Assistant — CSIT RE:Uni Hackathon 2026 (theme: *Innovating Education*)
**Status of this doc set:** implementation-ready. No application code has been written yet; that is deliberate.
**Normative contract:** [`../AGENTS.md`](../AGENTS.md). If this doc set and `AGENTS.md` disagree, `AGENTS.md` wins.

---

## 1. Read this first, by role

| You are | Read in this order |
|---|---|
| **Any AI agent, first time in the repo** | [`../AGENTS.md`](../AGENTS.md) → `01` → `02` → the doc your task names |
| **Building the guardrail / assistant** | `01` → `05` → `06` → `11` |
| **Building ingestion (Assignment Analyst)** | `01` → `03` §4 → `04` → `05` §6 → `06` |
| **Building UI** | `01` → `07` → `02` → `06` §5 |
| **Building analytics** | `01` → `08` → `06` → `10` |
| **Preparing the demo / presentation** | `13` → `14` → `02` §4 |
| **A human teammate, 10 minutes** | [`../README.md`](../README.md) → `01` → `02` |

Never start coding from a single doc. `01-DECISIONS.md` is the canonical answer to "what did we actually settle?" and every other doc defers to it.

---

## 2. The doc set

| # | Doc | Answers | Owner |
|---|---|---|---|
| 00 | **00-INDEX.md** *(this file)* | Where is everything, and what is authoritative? | Lead |
| 01 | [01-DECISIONS.md](01-DECISIONS.md) | What is decided, what is recommended, what is still open — with rationale. | Lead |
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

---

## 3. Frozen inputs — do not edit

These are the source material the doc set was restructured from. They are preserved verbatim on purpose: they are the record of how the product was reasoned about, and the hackathon requires that prior thinking not be passed off as new work.

| File | What it contributes |
|---|---|
| [`hackathon info/info.md`](../hackathon%20info/info.md) | Official brief: eligibility, 50-point rubric, schedule, submission requirements, AI-disclosure rule. |
| [`docs/project idea.md`](project%20idea.md) | Problem statement, the five connected systems, the product loop, the ChatGPT contrast. |
| [`docs/assignment_assistant_project_handoff.md`](assignment_assistant_project_handoff.md) | The full design conversation: finalized decisions, strong directions, open questions, screen architecture, data-model sketch, priority tiers. |

Everything in this doc set is either **derived** from those three files, or an **implementation decision** this doc set added (marked as such in `01-DECISIONS.md` with a rationale). Nothing in them was deleted — superseded material is cited by section number.

### Precedence when docs disagree

```text
AGENTS.md            (constraints; never overridden)
   ↓
01-DECISIONS.md      (what we settled)
   ↓
02-SCOPE.md          (what we are building)
   ↓
lower-numbered doc   (wins over higher-numbered doc)
   ↓
frozen inputs        (source material, not specification)
```

---

## 4. Adjacent, but not part of this doc set

| Path | What it is |
|---|---|
| [`archive/canvas-scraper/`](../archive/canvas-scraper/README.md) | **Retired prior work** — a read-only RMIT Canvas discussion scraper (28 offline tests, 8-check integrity gate) that answered a design question — *what do real student assignment questions actually look like?* It is **no longer required and not used by the app**, which must run with `CANVAS_*` unset (D44, D45). |
| [`.env.example`](../.env.example) | Environment contract. Copy to `.env`; never commit `.env`. |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Commit discipline, branching, definition of done. |

---

## 5. How to keep this doc set alive

Rules that keep it useful instead of decorative:

1. **Numbers are stable.** `docs/NN-...` is cited from code comments. Never renumber; never reuse a retired number.
2. **Decision IDs are stable.** `D1`, `D2`, … in `01-DECISIONS.md` are cited from PR descriptions and code comments. Retire an ID by marking it superseded, never by deleting it.
3. **Change the doc in the same commit as the code.** A doc that describes old behaviour is worse than no doc.
4. **Deciding something new?** Add a row to `01-DECISIONS.md` with status, rationale, and the doc that now owns it. Do not bury a decision in code.
5. **Unsure whether something is in scope?** `02-SCOPE.md` is the answer. If it is not listed as in-scope, it is out.
