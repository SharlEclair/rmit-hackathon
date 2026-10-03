# 18 -- Implementation Plan

**Purpose.** Turn the committed scope in [`02-SCOPE.md`](02-SCOPE.md) and the work packets in
[`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) into a phase-by-phase build that can be executed in
**separate chat sessions**, each starting cold, with enough durable context on disk that no
session has to reconstruct the project's state or re-derive a decision an earlier phase made.

**Status.** **Phase 0 is complete** (`phase-00-complete`): the environment and doc reconciliation,
the provider de-risking and the `docs/handoff/` scaffold all landed, and the rulings that Phase 1
depends on are recorded in [`01-DECISIONS.md`](01-DECISIONS.md) section I. `app/` still does not
exist, so **Phases 1-7 are unstarted**. Live state: [`handoff/01-STATE.md`](handoff/01-STATE.md).

**Authority.** `AGENTS.md` S2 wins over this file. [`01-DECISIONS.md`](01-DECISIONS.md) wins over
this file, and over every other doc. `11-BUILD-PLAN.md` remains the canonical list of work
packets; this file sequences them and adds the session-continuity layer. Where a phase here and
a spec doc disagree, the spec doc wins and this file is the bug.

**Read next, in order:** `AGENTS.md` -> `01-DECISIONS.md` -> `02-SCOPE.md` ->
`docs/handoff/00-README.md` -> the doc the phase names.

> **Note on the `docs/handoff/` references in this file.** Created in Phase 0, so the paths below
> are links and resolve. `docs/fixtures/` is still inline code on purpose: it does not exist until
> WP-02 creates it (D46).

---

## 1. Why this plan exists, and what it adds

`11-BUILD-PLAN.md` assumes a single continuous build weekend with four people in one room and one
shared memory of what happened. This plan assumes the opposite: **each phase runs in a fresh
session with no memory of the last.** That changes context from an assumption into a deliverable.

Three additions follow from that:

1. **A durable handoff system** (`docs/handoff/`, section 3) whose job is not merely to record
   progress but to prevent a later phase from **silently breaking an earlier phase's guarantee**,
   or from re-deriving a decision it has no way to know was already made.
2. **A per-session protocol** (section 4): what a session reads on entry, what it must write on
   exit, and the evidence standard for both.
3. **A cross-phase trap register** (section 7), seeded with the traps already found by reading
   this doc set. These are the cases where a later phase, working honestly from first
   principles, would produce a working-looking but **wrong** result.

### 1.1 The correction that shaped this plan

Reading `11-BUILD-PLAN.md` at the start of the planning session found it asserting that the
repository was **not yet under version control**, that `app/` did not exist, and that
`docs/fixtures/` did not exist. Two of the three were still true; the first was false --
`.git` was present, a public remote was configured, and seven commits already existed.

The lesson is not that the build plan was careless. It was accurate when written. The lesson is
that **a handoff trusted without re-checking becomes a second source of lies**, and the more
authoritative it looks, the worse the failure. Section 4 step 5 exists because of this.

The second finding is sharper. The commit history contains the doc set, not the **reasoning
about** it. A session starting Phase 6 from the repository alone would re-derive `M4` (milestone
average elapsed time) as a plain average over intervals -- the obvious implementation -- and
nothing on disk would contradict it. The correct rule is a two-stage mean over per-student means
(`08` section 4.3), and the difference is invisible until one student completes twenty items and
dominates the milestone figure. That is why `03-INVARIANTS.md` (section 3.5) is the highest-value
file in the handoff set, and why the trap register in section 7 is written as **what to record
instead**, not as a list of topics.

---

## 2. Current verified state

Confirmed by inspection during planning. These correct premises that other docs still assert.

**Superseded at the Phase 7 freeze.** This table records the state confirmed by inspection *during planning*,
before any code existed. It is kept because the premises it corrected are still the reason several docs read
as they do. What is true now: `app/` **exists and is built** through Phase 6; `docs/fixtures/` **exists**;
the repository is **public** (an anonymous GitHub API fetch returns `private=false, visibility=public`),
which closes the "was NOT verified" row below. The live per-area state is
[`handoff/01-STATE.md`](handoff/01-STATE.md) section 3. Commit counts and HEAD shas in this table are
deliberately **not** restated -- see `handoff/03-INVARIANTS.md` **T42**.

| Fact | Evidence | Consequence |
|---|---|---|
| The repository **is** a git repo with a remote and 7 commits (pre-Phase-0 HEAD `da00f71`) | `.git` present; `origin https://github.com/SharlEclair/rmit-hackathon.git`; `git log` -> `da00f71 feat(analytics): make the insight engine deterministic-only`. **Public visibility was NOT verified:** an anonymous fetch of the repository URL returns HTTP 404 | WP-01's `git init` and remote steps are done, so `11` and `12` were corrected in Phase 0. What is *not* done is public readability, which is now a submission risk (`14` S8) |
| `app/` does not exist | `Test-Path app` -> `False` | Every packet from WP-01's skeleton onward is unstarted |
| `docs/fixtures/` does not exist | `Test-Path docs/fixtures` -> `False` | D46's four fixture files are unbuilt |
| Native Postgres 18.6 is **running on 5432**, and `assignment_assistant` exists | `Get-Service postgresql-x64-18` -> `Running`; `psql -l` lists `assignment_assistant` owned by `user` | Path C is live (D66). No provisioning needed |
| The Docker daemon is **not** running | `docker info` -> `open //./pipe/dockerDesktopLinuxEngine: cannot find the file` | Path A unusable without starting Docker Desktop; irrelevant given path C |
| Toolchain present | `node v24.15.0`, `pnpm 12.4.2`, `npm 11.12.1`, `psql 18.6` on PATH | Satisfies `12` section 3.1 |
| ~~**`.env` is stale and will break a Gemini-configured boot**~~ **Resolved in Phase 0** | The provider default was `mock` / `deepseek-flash`; it is now `gemini` / `gemini-3.8-flash` plus `LLM_THINKING_EXTRACTION` (D61, D62, D68). **The second half of this row was wrong:** all four `LLM_THINKING_*` variables were already present in `.env`; checked by name only, no value read | No boot mismatch remains. This is the second instance of a handoff claim being wrong on re-check -- see section 1.1 and `handoff/06-SESSION-LOG.md` |
| `GEMINI_API_KEY` is populated; `DEEPSEEK_API_KEY` is empty | Presence checked by name only; **no value was read or logged** | The Gemini path is the one to validate live |
| `gh` and `vercel` are not installed | `Get-Command` -> nothing | Use git remotes and the web UI |
| The Gemini model id is externally verified | `gemini-3.8-flash` is GA; thinking accepts `low`/`medium`/`high` with `medium` default; ~1M-token input; 64,000-token output | D62 holds. **But** Google's own JS example uses `interactions.create`, not `generateContent` -- the adapter call shape is unsettled and is Phase 0's job |

---

## 3. The handoff system

### 3.1 Files

Created in Phase 0. Under 100 lines each except `01-STATE.md` and `06-SESSION-LOG.md`.

```text
docs/handoff/
  00-README.md        Session-start contract, read order, and the handoff template (section 4.4)
  01-STATE.md         Authoritative current state + environment fingerprint. REWRITTEN each session
  02-DECISIONS.md     Append-only log of settled technical decisions
  03-INVARIANTS.md    Shared agreements + cross-phase traps. The file that prevents silent breakage
  04-INTERFACES.md    Frozen signatures of shared modules, each with its frozen-at commit
  05-ISSUES.md        Known problems, accepted risks, deferred defects, each with an owner phase
  06-SESSION-LOG.md   Append-only per-session narrative
  07-ARCHIVE/         Session snapshots: 06-SESSION-LOG.md as it stood at each phase end
```

`docs/00-INDEX.md` gains rows for all eight paths. `AGENTS.md` section 4 gains **three lines**
pointing at `docs/handoff/00-README.md` -- three lines, not a section.

**Why not put this in `AGENTS.md`.** That file is the normative working agreement and is already
about 10 KB. The `agents-md` skill's guidance is explicit that agent-facing instruction files
degrade past roughly 100 lines, and that reference material should be pointed at rather than
embedded. Handoff content is reference material that changes every session; `AGENTS.md` is a
contract that should not. Keeping them separate also means a handoff error cannot corrupt the
constraints the whole project rests on.

### 3.2 Precedence

`AGENTS.md` > `01-DECISIONS.md` > `02-SCOPE.md` > lower-numbered doc > **these handoff docs**.
Where a handoff file contradicts the register, the register wins and the handoff file is the bug
-- the same rule `00-INDEX.md` section 5 applies to every other doc.

### 3.3 Why each file exists

| File | The question it answers | If it did not exist |
|---|---|---|
| `00-README.md` | Where do I start, and what is the protocol? | Every session invents its own entry ritual |
| `01-STATE.md` | What is actually built, and how do I prove it? | Sessions trust stale prose and build on sand |
| `02-DECISIONS.md` | Why is this the way it is? | Decisions get relitigated, or silently reversed |
| `03-INVARIANTS.md` | What must I not break, and what must I not re-derive? | Later phases break earlier guarantees while passing their own tests |
| `04-INTERFACES.md` | What signatures may I not change? | Two sessions shape the same type differently and integration fails |
| `05-ISSUES.md` | What is known-broken right now? | Bugs are rediscovered, or silently inherited |
| `06-SESSION-LOG.md` | What happened last time, and what failed? | Failed approaches are retried identically |

---

## 4. The session protocol

### 4.1 Session start

A session does not begin with code. It begins with these steps, in order.

| # | Step | Why |
|---|---|---|
| 1 | Read `AGENTS.md`, `docs/00-INDEX.md`, then `docs/handoff/00-README.md` | Constraints and entry point |
| 2 | Read `01-STATE.md`, `03-INVARIANTS.md`, `04-INTERFACES.md` | Where we are; what must not break; what must not be re-shaped |
| 3 | Read `05-ISSUES.md` and the **last two entries** of `06-SESSION-LOG.md` | Open problems and immediate history |
| 4 | Read the phase's own spec docs (named per phase in section 5) | The actual requirements -- never this plan's summary of them |
| 5 | **Re-verify the state claim before trusting it.** Run `01-STATE.md`'s verification block and its environment fingerprint check. Report any divergence to the user **before** any other work | Section 1.1. The previous session's claims may be stale, wrong, or from a different machine |
| 6 | Append this session's entry to `06-SESSION-LOG.md` **before** the first commit | A session that dies mid-task still left its intent on disk |

Step 5 is not ceremony. It is the only mechanism that catches a stale handoff, and it costs one
command.

### 4.2 Session exit -- the definition of "handed off"

A phase is handed off only when all seven hold. A session that cannot satisfy one says so in the
log rather than leaving it implied.

1. `01-STATE.md` rewritten: built / partial / mocked / **not started**, with the verifying command
   for each claim, and an explicit statement of what a later phase must **not** assume is finished.
2. `03-INVARIANTS.md` updated for any new agreement, plus any trap this session discovered --
   **including ones caused by its own shortcuts.**
3. `04-INTERFACES.md` updated for any signature another phase will consume, with the frozen-at commit.
4. `05-ISSUES.md` updated: new problems, accepted risks, anything deferred with its reason and an
   owner phase.
5. `06-SESSION-LOG.md` appended with the narrative: what was attempted, what failed and why, what
   was learned, what was **not** verified.
6. `07-ARCHIVE/phase-NN/` receives a copy of the session log as it stood at phase end.
7. `git tag phase-NN-complete`, and `01-STATE.md` names that tag.

### 4.3 The evidence rule

From the `verification-before-completion` skill, applied to prose:

> **`01-STATE.md` records commands and observed output. It never records adjectives.**

| Do not write | Write instead |
|---|---|
| "Migrations apply cleanly" | `pnpm db:migrate` run twice; second reported no pending migrations |
| "Auth works" | The tampered-cookie test, by name, and its observed pass |
| "The guardrail is complete" | `pnpm test -- tests/guardrail` -> 53 passed |
| "Mostly done" | The specific items **not** done, named |

Verification-before-completion also forbids the inverse failure: expressing satisfaction before
running the check. A status line in `01-STATE.md` without a command behind it is a defect in the
handoff, not a shortcut.

### 4.4 The handoff template

Lives in `00-README.md`, so the instructions and the example cannot drift apart.

```markdown
## Session <NN> - <phase name> - <date>

**Phase:** <NN>   **Status:** complete | partial | blocked
**Spec docs read:** <list>   **Commit range:** <from>..<to>   **Tag:** <tag>

### Delivered (with evidence)
| Item | Evidence (command + observed result) |
|---|---|

### Not delivered, and why
- <item> -- <reason> -- <consequence for a later phase>

### Decisions taken
- <decision> -- <rationale> -- <files affected> -- <logged in 02-DECISIONS as D-nn>

### Invariants touched
- <invariant> -- honoured | changed | newly accepted risk

### Discovered traps for later phases
- <trap> -- which phase it bites -- what to do instead

### What I could not verify
- <claim> -- <why unverifiable> -- <what would settle it>
```

The last two sections are the ones that carry value forward. "What I could not verify" is what
stops a later session assuming a guarantee it does not have.

### 4.5 Continuity skills and what each contributes

No skill installation is required; all are already present in this session's catalog.

| Skill | Applied to |
|---|---|
| `planning-with-files` | The core pattern: context window is RAM, filesystem is disk; update after each phase; log **every** error with its resolution; never repeat a failed action verbatim; the five-question reboot test |
| `filesystem-context` | Dynamic discovery: `01-STATE.md` stays small and *points* at evidence instead of embedding it; large outputs are written to files and grepped, not pasted into prose |
| `context-agent` | The session-continuity concept: resume summary, pending items, decisions, files touched, errors resolved. **Its scripts are deliberately not used** -- they hard-code a different machine's path |
| `verification-before-completion` | Section 4.3. No status claim without a fresh command and its observed output |
| `technical-change-tracker` | The append-only revision-history shape, and an explicit `blocked` state for `05-ISSUES.md` rows |
| `agents-md` | Keeping `AGENTS.md` minimal: a three-line pointer rather than a second handoff document |
| `wiki-onboarding`, `wiki-page-writer` | Structure and evidence-based depth when authoring `01-STATE.md` |
| `documentation-templates` | Section shape; ATX headings; fenced blocks with language tags; ASCII only (repo rule) |
| `writing-plans` | The phase plans themselves: exact paths, exact commands, expected output, bite-sized steps |

---

## 5. Phase sequence

Same eight phases as `11-BUILD-PLAN.md` plus the reconciliation phase. Each now has an explicit
handoff boundary. Phase 0 creates the system; every later phase reads it on entry and updates it
on exit.

| Phase | Builds | Reads on entry | Must hand off |
|---|---|---|---|
| **0** | Env reconciliation, doc reconciliation, provider de-risking, **handoff scaffold** | all docs | The scaffold; the rulings; one verified live model call |
| **1** | Skeleton, schema, seed fixture, auth | `03`, `04` | **The seed fixture's exact shape** -- every later phase's tests depend on it |
| **2** | `src/lib/llm/`, storage, extraction, Analyst, ingest job | `04` | **`src/lib/llm/types.ts` and `schema.ts` frozen**; the test fixture set; the extraction capability |
| **3** | Guardrail + 53-case golden set | `03`, `04` | **`GuardrailDecision` shape and rule-id namespaces frozen** |
| **4** | Review, approval, state machine, gate rule G1 | `03` | **The direction of the student-visibility gate** |
| **5** | Student workspace, Map, checklist, Assistant | `04` | **SSE event order** and the citation shape |
| **6** | Queries, discussion, moderation, FAQ, analytics | `03`, `04` | The analytics fixtures and the `M4` two-stage rule |
| **7** | Smoke test, fallbacks, freeze, submission | `01`, `05` | Final freeze tag and the submission record |

### 5.1 Parallelism that survives the session split

- **Phases 2 and 3 are file-disjoint** except for one line in `src/lib/llm/types.ts` (the
  `AiCapability` enum). They can run in two concurrent sessions: **the Phase 2 session owns that
  file**, and Phase 3 requests the enum addition through `05-ISSUES.md` rather than editing it.
  This is exactly the kind of advisory-only boundary the team guidance warns about, so it is
  recorded rather than assumed.
- **Phase 6's discussion and query CRUD is file-disjoint from Phase 4** and may start as soon as
  Phase 1 lands, because it needs only auth and the schema.
- **Phase 3 must not wait for Phase 2.** `11` section 3 makes the same point: WP-08 is the
  highest-risk code and the one packet that must not be left until the last night.

---

## 6. Rulings required before Phase 1

Seven items are genuinely open or need a `DECIDED` ruling recorded. Phase 0 closes them and writes
each into `01-DECISIONS.md`. None widens scope.

| # | Question | Recommended ruling | Source of the gap |
|---|---|---|---|
| **A** | Attachment extraction runs *before* the guardrail preflight, but `04` section 4 says nothing reaches `src/lib/llm/` without passing the guardrail. The `AiCapability` enum also has no member for that call, so it has no thinking level and no budget `sessionId` | Add a sixth capability (e.g. `attachment_extraction`); restate the invariant as **"L0-L3 decisions run before any generation call; extraction is a classification-controlled call, counted separately and never used to ground another student's answer"**. Record as a new decision | `04` section 4 vs section 9.2 step 12; `05` section 6.4 |
| **B** | `06` section 10 item 8 says a later completion **overwrites** `elapsed_seconds`; D48, `06` section 7.3.2, `06` section 8.3 rule 8 and test T-24 all say the first interval stands | D48 wins. Correct item 8, which is the stale row | `06` section 6.12 vs section 10 item 8 |
| **C** | Is the Assignment Health headline floored at 5 contributors? | Yes -- D52 rules it. Mark item 5 resolved | `06` section 10 item 5 |
| **D** | May a private Query be anonymous? | No, always attributed -- D50 rules it. Mark item 6 resolved | `06` section 10 item 6 |
| **E** | Does an ambiguous request produce `CLARIFY` or `REFUSE`? | `CLARIFY` with a refusal-shaped payload; it never proceeds to a model answer; it counts as a refusal in the golden set. Mark item 7 resolved | `06` section 10 item 7 |
| **F** | Are discussion flags recorded against the reporter's anonymised identity? | Yes -- D54 rules it. Mark item 4 resolved | `06` section 10 item 4 |
| **G** | `11`'s route sketches disagree with `06` section 5.4 in about a dozen places | `06` section 5.4 owns paths (D51); `06` section 10 item 17 already holds the **full mapping** for every divergent path. Adopt it verbatim and reconcile `11` | `06` section 10 item 17 |
| **H** | Three undocumented specifics: `IngestionStatusResponse` is referenced 3 times and never defined; `07`'s published AI Usage Policy card cites a section that does not exist; `06`'s publish-blocker enum has no code for "milestone lacks a requirement link" | Define all three in Phase 0 as part of doc reconciliation. These are **gaps, not open questions** | `06` sections 5.4/5.5, `07` section 4.2 |
| **I** | Where does operator-facing seed/reset/fallback tooling live -- `app/scripts/` or `demo/`? | `app/scripts/` for anything `pnpm` runs; `demo/` for artefacts only. Recorded so two sessions do not create competing layouts | Not stated anywhere |

---

## 7. Cross-phase trap register

To be seeded into `03-INVARIANTS.md` in Phase 0. These are the cases where a later session,
working honestly from first principles, would produce a **working-looking but wrong** result.
Each row states what to record, not merely what to avoid.

| # | Trap | Bites | What to record instead |
|---|---|---|---|
| **T1** | Milestone average elapsed time is a **two-stage mean** -- the mean of per-student means -- not a mean over intervals. One student completing 20 items would otherwise dominate the milestone figure | Phase 6 | The formula, its rationale (`08` section 4.3), and the fixture that proves it (A15) |
| **T2** | The k-anonymity floor is applied **in the query**, and **suppression is contagious upward**: a suppressed bucket suppresses any total containing it. Complementary suppression additionally removes the smallest qualified bucket when exactly one is suppressed | Phase 6 | `HAVING count(distinct subject_ref) >= 5` in the query, plus the three propagation rules |
| **T3** | **Gate rule G1 lives in the query layer, not the view.** A student request for unapproved or unpublished content returns **404**, never an empty shell, never a silently filtered list | Phases 5, 6 | The three-part predicate and where it is enforced |
| **T4** | The Assistant endpoint is **SSE**, and `guardrail` is **always the first event**. A refusal emits **zero `token` events**. A client that receives `token` first must treat the stream as corrupt | Phase 5 | The event-order table and the corrupt-stream rule |
| **T5** | `04` section 5.7 says streaming is excluded from the MVP; `06` section 5.4 and section 5.5.9 define `text/event-stream` for exactly one route. **`06` wins** (D51) | Phase 5 | The conflict, the ruling, and the reason |
| **T6** | The `AiCapability` enum has no member for attachment extraction, so that call has no thinking level and no budget accounting; and `04`'s guardrail-preflight rule contradicts its own extraction order | Phases 2, 3 | Ruling A's resolution, and the authority that fixes it |
| **T7** | **Analytics cannot be backfilled.** `analytics_events` is written at the point of the event, by the feature that owns it -- not by the analytics module | Phases 5, 6 | The event-emission duty list: checklist transitions, assistant turns, query creation, post creation, FAQ views. A phase that skips emission produces a permanently under-counting view |
| **T8** | The **seed fixture is the load-bearing artefact of Phase 1**: 37 synthetic students, at least 4 approved milestones, one milestone above **both** averages, one bucket below 5 contributors, and the demo brief as a **text-layer** PDF | Phases 3, 4, 6, 7 | The exact counts and why each is there |
| **T9** | The guardrail golden set needs fixtures that do not exist until Phases 1-2: an approved policy, 5 approved milestones, chunked brief and rubric containing the word-count requirement and **no mention of concurrency**, and six attachment files including audio and video | Phase 3 | The fixture list, so Phase 3 either consumes it or creates it deliberately |
| **T10** | `06` section 10 item 8 contradicts D48 on re-open semantics. D48, `06` section 7.3.2, section 8.3 rule 8 and test T-24 agree with each other; item 8 is stale | Phases 1, 6 | The correct rule and the contradiction's location |
| **T11** | `--border-peer` is `#667085` (D65). `17` sections 3.2, 3.6, 11.5 and gate G7 still describe `#98A2B3` as current and failing; token-parity gate G4 passes either way, so nothing catches it | Any UI phase | The correct value, and a warning not to "fix" it back |
| **T12** | `06` section 5.4's **64 routes** are the only valid path vocabulary. Eleven other doc locations sketch different paths | All phases | The rule, plus the mapping reference in `06` section 10 item 17 |
| **T13** | A guardrail refusal is a **`200`**, not an error. It renders with the boundary treatment, never the error treatment | Phases 3, 5, 7 | The status-code rule and the UI consequence |
| **T14** | `ANON_ID_SECRET` rotation does **not** re-label existing posts. The display label is computed at read time from a persisted `display_number` via the single approved view | Phase 6 | D55, plus the view's role as the only author-label surface |
| **T15** | Analytics modules must **not** import identity-aware repositories (import-graph test), and no analytics SQL may contain an identity column outside `count(distinct subject_ref)` | Phase 6 | The two structural prohibitions |

---

## 8. Documents created and updated

| Action | File | When |
|---|---|---|
| This plan, written out | `docs/18-IMPLEMENTATION-PLAN.md` | On approval |
| Rows added for this file and the eight handoff paths | `docs/00-INDEX.md` | On approval |
| Handoff scaffold, 8 paths | `docs/handoff/**` | Phase 0 |
| Three-line pointer to `docs/handoff/00-README.md` | `AGENTS.md` section 4 | Phase 0 |
| Rulings A-I recorded | `docs/01-DECISIONS.md` | Phase 0 |
| Stale sections corrected: provider default, thinking-level count, guardrail ordering, item 8, item statuses, `IngestionStatusResponse`, the missing policy-card section, the missing blocker code, route reconciliation, WP-01 completion | `docs/04`, `docs/06`, `docs/07`, `docs/11`, `docs/14` | Phase 0 |

Nothing is created under `app/` until Phase 1.

---

## 9. Success criteria

The continuity goal succeeds if, at the freeze, a session that has never seen the original
conversation can:

1. Read `docs/handoff/00-README.md` and reach working state in under ten minutes.
2. State which phase is complete, **with the command that proves it**, without asking anyone.
3. Name the four things that must never be broken -- the guardrail, tutor approval, the verbatim
   brief, the refusal -- and where each is enforced.
4. Avoid **all fifteen** traps in section 7 without having to rediscover them.
5. Know exactly what is mocked, what is missing, and what a judge must be told.

The product goal is unchanged from `11-BUILD-PLAN.md` and `02-SCOPE.md`:

1. A prohibited request is refused with **zero model calls**, naming the assignment's own policy.
2. Nothing AI-generated becomes student-visible before a tutor approves it.
3. The official brief is shown **verbatim** and never paraphrased into the UI.
4. The whole loop runs offline under `LLM_PROVIDER=mock`, from a clean clone, in under ten minutes.

---

## 10. Related

| Doc | Relationship |
|---|---|
| [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) | The canonical work packets and their verification gates. This file sequences them and adds the continuity layer; it does not replace them |
| [`01-DECISIONS.md`](01-DECISIONS.md) | Wins over this file on every conflict |
| [`02-SCOPE.md`](02-SCOPE.md) | The committed MVP. Scope change control is section 6 there |
| `docs/handoff/00-README.md` | The entry point every session reads first (created in Phase 0) |
| `docs/handoff/03-INVARIANTS.md` | Where section 7's trap register is seeded (created in Phase 0) |
| [`16-VERIFICATION-REPORT.md`](16-VERIFICATION-REPORT.md) | The adversarial audit of the doc set, and the source of several rulings above. Local-only; not committed |
| [`AGENTS.md`](../AGENTS.md) | The constraints. Section 4.3 governs how completion is claimed; this plan's evidence rule applies it to handoff prose |

---

## 11. Authority and maintenance

- This file is subordinate to `AGENTS.md`, `01-DECISIONS.md` and `02-SCOPE.md`.
- Numbers are frozen. `18` is not reused or renumbered (`00-INDEX.md` section 5 rule 1).
- This file changes when the **phase sequence** changes, not when a phase's detail changes. Phase
  detail belongs in `docs/handoff/`, which is rewritten every session; this file should stay
  stable enough to be read once and trusted.
- If a phase finds this plan wrong, do not code around it: correct this file in the same commit
  and record the correction in `02-DECISIONS.md`.
