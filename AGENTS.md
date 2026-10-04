# AGENTS.md -- Working Agreement for AI Coding Agents

> **Audience:** any AI agent (DSH, Claude Code, Cursor, Codex) working in this repository.
> **Status:** normative. If code, comments, or another doc contradicts this file, this file wins -- or the contradiction is a bug to report.
> **Read next, in order:** `docs/00-INDEX.md` -> `docs/01-DECISIONS.md` -> [`docs/handoff/00-README.md`](docs/handoff/00-README.md) -> whichever doc the task names.

---

## 1. What this project is

**AssignMate** -- an AI-native assignment workspace for university students and tutors, built for the CSIT RE:Uni Hackathon 2026 (theme: *Innovating Education*).

One-sentence product model:

> Tutors upload an assignment and its supporting documents; the system turns them into a **tutor-approved** assignment structure (map, milestones, checklist, FAQs, AI-use rules, ambiguity flags); students then work through the assignment using the original brief, that structure, anonymous discussions, private tutor queries, and a **strictly constrained** AI coach; tutors receive **aggregate** insight into where the cohort is spending time and asking questions.

The single most important sentence in this repository:

> **The AI must never do the assignment for the student.**

Every design and code decision is subordinate to that constraint. A feature that improves helpfulness while weakening it must be rejected.

---

## 2. Absolute constraints (never violate, never "temporarily" weaken)

| # | Constraint | Enforcement point |
|---|---|---|
| C1 | The Assistant never generates assignment answers, code, or solution steps; never debugs, evaluates, or critiques student work; never tells a student what to change. | `docs/05-AI-GUARDRAILS.md` |
| C2 | Official assignment requirements are **never paraphrased and presented as the requirement**. The original document is the source of truth. | `docs/06-DATA-MODEL.md`, UI spec |
| C3 | Nothing AI-generated becomes student-facing until a tutor **approves** it. AI output is always marked `AI generated -- requires tutor approval`. | `docs/11-BUILD-PLAN.md` |
| C4 | Tutors cannot see the identity behind an anonymous discussion post. | `docs/07-UI-UX-SPEC.md`, `docs/06-DATA-MODEL.md` |
| C5 | Tutor analytics are **aggregate only**. No per-student identification, no individual activity histories. | `docs/08-ANALYTICS-SPEC.md` |
| C6 | Student uploads (text/image/audio/video/PDF) never become a route around C1. Same guard, all modalities. | `docs/05-AI-GUARDRAILS.md` |
| C7 | Secrets (`cookies.txt`, API keys, `.env`) are never committed, never logged, never returned in an API response. | `.gitignore`, `docs/12-OPERATIONS.md` |
| C8 | Every LLM call goes through the provider adapter. No vendor SDK is imported outside `src/lib/llm/`. | `docs/04-TECH-ARCHITECTURE.md` |

If a task appears to require breaking one of these, **stop and ask** -- do not reinterpret the constraint.

---

## 3. Current state -- read this before assuming anything

**The application is built and frozen.** Phases 1-6 are complete and tagged; the code is under `app/` and the feature set is frozen at `phase-07-freeze`. The status line this section used to carry -- "documentation only, there is no application code yet" -- was true when it was written and is kept in this note rather than deleted, because how the docs read is downstream of it (`docs/00-INDEX.md` carries the same note).

**The live state is [`docs/handoff/01-STATE.md`](docs/handoff/01-STATE.md), rewritten every session.** It is the authoritative answer to "what exists", including the section listing what is deliberately **not** built. Do not infer the build's state from this section or from any other doc.

| Path | State | Agent may modify? |
|---|---|---|
| `docs/project idea.md` | Original source. **Frozen.** | [x] never |
| `docs/assignment_assistant_project_handoff.md` | Original source. **Frozen.** | [x] never |
| `hackathon info/info.md` | Original brief + rubric. **Frozen.** | [x] never |
| `docs/00-INDEX.md` ... `docs/18-IMPLEMENTATION-PLAN.md`, plus `docs/handoff/**` | Restructured, implementation-ready docs | [ok] update, keep in sync |
| `archive/canvas-scraper/**` | **Retired prior work.** Read-only Canvas discussion scraper, kept for historical reference only. Not required by, and not used by, the app (D44, D45). | ! only if the task names it |
| `app/**` | **Built through Phase 6, frozen at `phase-07-freeze`.** Next.js App Router implementation of the committed MVP. | [ok] update; the freeze means only a defect found in a rehearsal justifies touching it |

Do not "tidy" the frozen files. Do not reflow, rename, or reformat them. Their value is that they are untouched.

---

## 4. How to work in this repo

> **Read [docs/handoff/00-README.md](docs/handoff/00-README.md) first, and update it last.** It is
> the session-start contract: the read order, the live state of the build, and the protocol for
> recording what this session did. Do not begin work, or end a turn, without it.

### 4.1 Before writing code

1. Read `docs/00-INDEX.md` and `docs/01-DECISIONS.md`.
2. Read the doc(s) the task names. If the task names none, find the relevant doc yourself -- do not guess at requirements.
3. Confirm the task is inside the committed MVP scope (`docs/02-SCOPE.md`). Features listed there as *out of scope* are out of scope; do not implement them, do not scaffold them, do not leave TODO hooks for them.
4. If a requirement is genuinely ambiguous, prefer the conservative reading (see S2) and record the interpretation in `docs/01-DECISIONS.md` as a new decision entry.

### 4.2 While writing code

- **Surgical changes.** Change what the task requires and nothing else. No drive-by refactors, no renames of working code, no dependency upgrades outside the task.
- **Small, honest increments.** A half-finished vertical slice that works end-to-end beats four half-finished subsystems.
- **Mock behind the adapter, not in the UI.** If an integration is not ready, put the fake behind the same interface the real one will use (`src/lib/llm/`, `docs/04-TECH-ARCHITECTURE.md`).
- **Determinism over cleverness in the guardrail.** The policy layer must be independently testable without a live model call.
- **Every AI-produced artifact carries provenance** -- which model, which prompt version, which source chunks. See `docs/06-DATA-MODEL.md`.

### 4.3 Before claiming a task is done

Verify, then report. A claim of completion without evidence is a defect.

- [ ] The thing runs -- you executed it, and can quote the output.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] `pnpm test` passes, including the guardrail golden set if you touched AI behaviour (`docs/05-AI-GUARDRAILS.md`).
- [ ] If you touched the Assistant, uploads, moderation or any HTTP surface, the relevant acceptance run passes: `verify-student`, `verify-review`, `verify-analytics`, `verify-discussion` (all four are HTTP runs and need a live server; they are deliberately **not** in `pnpm test`, which must pass with no network and no database).
- [ ] No absolute constraint from S2 was weakened.
- [ ] Docs updated in the same change if behaviour or interfaces changed.
- [ ] No secret value appears in code, logs, fixtures, or committed files.

State plainly what is **not** done, what is mocked, and what you did not verify. Understating completeness is safe; overstating it is not.

---

## 5. Code conventions

Applies to `app/`, which now exists. These are constraints on changes to it, and the stack is fixed.

### 5.1 Stack (fixed -- see `docs/04-TECH-ARCHITECTURE.md`)

- **TypeScript**, `strict: true`. No `any` in exported signatures.
- **Next.js (App Router)** for both UI and API route handlers. One deployable.
- **Tailwind CSS** + a small set of owned UI primitives. No component library that supplies its own design language wholesale.
- **Postgres** via a typed query layer; migrations are files in the repo, never hand-edited databases.
- **Provider-agnostic LLM adapter** (`src/lib/llm/`). Default provider is configured, not hard-coded.

### 5.2 File and folder layout

```
app/
  src/app/  # routes: (auth)/, (tutor)/, (student)/, api/
  src/components/  # presentational, no data fetching
  src/features/<domain>/  # feature logic: assignment, assistant, discussion, analytics
  src/lib/llm/  # the ONLY place a vendor SDK may be imported
  src/lib/guardrail/  # policy layer -- pure, testable, no network
  src/lib/db/  # schema, queries, migrations
  src/lib/auth/  # session + role resolution
  tests/  # unit + guardrail golden set
```

### 5.3 Naming and style

- Files: `kebab-case.ts` / `kebab-case.tsx`. React components: `PascalCase` exports.
- Database: `snake_case` tables and columns, plural table names, `id` primary keys, `created_at`/`updated_at` on every row.
- API: REST-ish JSON under `/api/`, plural nouns, typed request/response contracts shared with the client.
- Doc filenames: `NN-TITLE.md` under `docs/`, uppercase titles, lowercase-kebab otherwise.
- Markdown: ATX headings, fenced code blocks with a language tag, ASCII only (no smart quotes, no em dashes in code comments).

### 5.4 Comments

Comment the *why* and the *constraint*, not the *what*. Good:

```ts
// Refuse-by-default: an unparseable policy decision must never read as ALLOW.
```

Bad:

```ts
// increment i
```

Never write a comment that claims a guarantee the code does not provide -- that is worse than no comment.

---

## 6. Guardrail-specific rules (the highest-risk area)

If a task touches `src/lib/guardrail/`, student uploads, the Assistant, or discussion moderation, additionally:

1. **Never** make the guardrail's default path permissive. Default is `REFUSE` / `NEEDS_REVIEW`.
2. The decision must be produced by code that runs **without** a network call where possible; a model call is an enhancement, not the only line of defence.
3. Every change to guardrail behaviour requires a new or updated case in the golden set (`docs/05-AI-GUARDRAILS.md`), including at least one case that tries to launder a prohibited request.
4. Structured output only. An LLM response that fails schema validation is a refusal, not a retry-until-it-passes.
5. Log the decision, the policy rule cited, and the prompt version. Do not log student content or uploads in plaintext.

---

## 7. Hackathon-specific obligations

These are submission requirements, not nice-to-haves. Track them in `docs/14-HACKATHON-SUBMISSION.md`.

- **Commit often.** The repository history is the evidence that the work was done inside the hackathon window. Small, frequent, meaningfully-messaged commits.
- **Public repository.** No secrets, no credentials, no third-party material that cannot be published.
- **AI use must be disclosed.** The Devpost submission and the live presentation must explain *how* and *why* generative AI was used. Keep `docs/14-HACKATHON-SUBMISSION.md` current as we go -- do not try to reconstruct it the night before.
- **No work from before the hackathon.** The code in `app/` must be written during the event. Prior context (the frozen design docs, the Canvas discussion research) informs the design; it must not be presented as submission-time code.
- **No external assistance.** Do not accept implementation help from people outside the team.

---

## 8. Communication rules for agents

- Report **evidence**, not adjectives: the command you ran, the output you saw, the file and line you changed.
- If blocked, say what is blocking, what you tried, and what you need. Do not silently substitute a different task.
- If you discover the docs are wrong, say so explicitly and propose the correction. Do not quietly code around a wrong doc -- the next agent will trip on it.
- Use the shared task board for multi-agent work; do not write to a file another agent owns without coordinating.
- Prefer the smallest change that makes the task verifiably true.
