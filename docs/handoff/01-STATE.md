# 01 -- Current State

**Purpose.** What is actually built, what is not, and the command that proves each claim. **This
file is rewritten every session.** It records commands and observed output, never adjectives.

**Tag:** `phase-05-complete` -- the Phase 5 exit commit. Phase 5's commits are `ebf5b46` (the rescued
design layer: tokens, primitives, `check-design.mjs`), `51bbea7` (the rescued assistant layer: the six
feature modules, the four assistant routes, the contract block), `f8e814b` (the session entry and the
stale-state divergence), `be7e9c8` (the stream/proactive tests and three defects fixed in them),
`31f8f83` and `9fb22b4` and `c56e9ec` (design-gate corrections and documentation), `0c69d63` (the
workspace query layer and the course/assignment routes), `077b412` (D106-D108 and the `06`
corrections), `a121e5e` (the student UI), `73044c7` (the D48 fixes and the acceptance run), `e510831`
(the Assistant panel) and `928f182` (the tutor review page and the provenance badge).
**Pushed:** see section 7. The tag order is `phase-00` -> `phase-01` -> `phase-03` -> `phase-02` ->
`phase-04` -> `phase-05`, and it is **not** the commit order (Phases 2 and 3 ran concurrently).
**Last session:** 05.
**Next phase:** **6 -- queries, discussion, moderation, FAQ, analytics.** Phases 0-5 are complete;
Phases 6-7 are unstarted. **Phase 5 delivered WP-07 and WP-09 in full and paid Phase 4's I-44 debt**;
what it deliberately did **not** build is listed in section 4 and `05-ISSUES.md` I-48.

**Authority:** below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. Re-verify before trusting this file

```powershell
git log --oneline -1                 # expect the Phase 5 exit commit
git status --porcelain               # expect clean
git tag                              # expect phase-00..phase-05-complete
Test-Path app/src/lib/llm/types.ts                     # expect True (frozen in Phase 2)
Test-Path app/src/lib/guardrail/index.ts               # expect True (frozen in Phase 3)
Test-Path app/src/lib/db/queries/student-visibility.ts # expect True (gate rule G1)
Test-Path app/scripts/check-design.mjs                 # expect True (G4 parity, 13 checks)
Test-Path app/scripts/verify-student.ts                # expect True (Phase 5's acceptance run)
Test-Path app/src/app/student/page.tsx                 # expect True (the dashboard)
Test-Path app/src/app/tutor/assignments                 # expect True (the review page's parent)
cd app
pnpm typecheck                       # expect no output, 0 errors (the whole app)
pnpm lint                            # expect "C8 import/endpoint gate: ok" THEN
                                     #        "design gates: ok (13 checks)", exit 0
pnpm test                            # expect 42 passed in 42 files, 676 tests, no network, no provider key
pnpm build                           # expect exit 0, "Compiled successfully"
pnpm db:migrate                      # expect "no pending migrations (12 already applied)"
pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts
                                     # expect "schema drift: none (35 tables, 471 columns)"
node -v; pnpm -v                     # expect v24.x / 12.x
Get-Service postgresql-x64-18 | Select-Object Status   # expect Running
```

**The two acceptance runs need a running server** (two terminals each):

```powershell
cd app; pnpm dev                                                        # terminal 1
cd app; pnpm exec tsx --env-file-if-exists=.env scripts/verify-student.ts   # terminal 2
# expect 18/18 passed, report at app/.local/phase5-student-verify.json
cd app; pnpm exec tsx --env-file-if-exists=.env scripts/verify-review.ts    # terminal 2
# expect 20/20 passed, report at app/.local/phase4-review-verify.json
```

The database assertions need `PGPASSWORD` and the local role:

```powershell
$env:PGPASSWORD='password'
psql -U user -h localhost -p 5432 -d assignment_assistant -tAc "select count(*) from users where role='student'"
# expect 37
psql -U user -h localhost -p 5432 -d assignment_assistant -tAc "select count(*) from milestones where publication_status='PUBLISHED'"
# expect 5 for the seeded demo assignment (9bcc22f0...). Other published assignments are verification
# fixtures with no milestones; scope any count by assignment_id.
psql -U user -h localhost -p 5432 -d assignment_assistant -tAc "select count(*) from checklist_items where publication_status='PUBLISHED'"
# expect 17
Remove-Item Env:PGPASSWORD
```

**`queries` has no `deleted_at`, and neither does `ai_policy_rules`** (trap **T33**). A soft-delete
predicate on either fails with a bare `500`.

## 2. Environment fingerprint (observed, Session 05)

| Fact | Observed value | How |
|---|---|---|
| Shell | **Windows PowerShell 5.1** -- the tool name `pwsh` is misleading (I-09) | `$PSVersionTable` |
| Node / pnpm | `v24.15.0` / `12.4.2` | `node -v`, `pnpm -v` |
| Postgres | service `postgresql-x64-18` -> `Running`, native, port 5432 (**D66**) | `Get-Service` |
| Git | `main` = the Phase 5 exit commit; `origin` = `SharlEclair/rmit-hackathon`, public | `git log`, `git remote -v` |
| Tags | `phase-00` .. `phase-05-complete` | `git tag` |
| Registry pins | **no dependency was added in Phase 5** | `app/package.json` |
| Database | 35 base tables + 2 views, 471 columns, no drift | `scripts/verify-schema.ts` |
| Model provider account | paid Tier 1 Gemini key, 5 AUD monthly cap (I-36). **Phase 5 made no live provider call**: every acceptance check ran under `LLM_PROVIDER=mock` | the two acceptance runs |

**Two shell traps that cost time and are now recorded.** (a) PowerShell 5.1 mangles a multi-line
`-m` commit message: the body's newlines are parsed as separate arguments and `git` fails with
`Invalid path '/event: token'`. Write the message to a file and use `git commit -F <file>`; Phase 5 did
this for every commit. (b) `Invoke-WebRequest`'s output pipeline corrupts a JSON body captured inside a
function, so a PowerShell probe of these routes reported empty values while the routes were correct.
The acceptance runs are TypeScript scripts using `fetch` for that reason.

## 3. State of the build

| Area | State | Evidence |
|---|---|---|
| Phases 0-1 (docs, skeleton, schema, seed, auth) | **built** | Sessions 00-01; `pnpm db:migrate`, `pnpm test` |
| Phase 2: `src/lib/llm/`, `storage/`, `extract/`, `features/ingest/`, `features/uploads/` | **built and frozen** | Session 02 |
| Phase 2: the **live** Analyst run | **VERIFIED in Phase 4** | Section 4 of `07-ARCHIVE/phase-04/` |
| Phase 3: `src/lib/guardrail/` + the 53-case golden set | **built and frozen** | `pnpm test -- tests/guardrail` |
| Phase 4: `features/review/`, migration `0012`, gate rule G1, the six tutor routes | **built** | Session 04; `scripts/verify-review.ts` |
| Phase 4: the tutor **review page** and the provenance badge | **BUILT IN PHASE 5** -- the I-44 debt | section 4; `scripts/verify-review.ts` checks 4b/4c |
| Phase 5: the design layer -- tokens, 10 UI primitives, `check-design.mjs` | **built** | `pnpm lint` -> `design gates: ok (13 checks)`; `tests/design/`, `tests/components/` (12 files) |
| Phase 5: `features/workspace/` -- the query layer, the builders, the transitions | **built** | `tests/workspace/`; `scripts/verify-student.ts` |
| Phase 5: the **14 student routes** (`06` section 5.4) | **built and exercised over HTTP** | `scripts/verify-student.ts` 18/18 |
| Phase 5: the **student UI** -- dashboard, course page, the four workspace tabs | **built and rendered** | section 4; all 7 pages return `200` with a real session |
| Phase 5: the **Assistant panel and the refusal panel** | **built; the stream verified end to end** | section 4 item 6 |
| Phase 5: the **tutor UI** -- dashboard, course page, review page | **built and rendered** | section 4 item 7 |
| Phase 5: the design-system gates G1/G2/G3/G6/G7/G10 | **NOT IMPLEMENTED** | no `pnpm test:e2e` and no browser dependency; `check-design.mjs` names them as uncovered |
| Phase 5: the Attachment UI (`+` picker, chips, blocked-upload refusal) | **NOT STARTED, deliberately** | `05-ISSUES.md` **I-48** |
| Phase 5: the proactive notice wiring | **NOT STARTED** | the route and the builder exist (`assistant/proactive`); no milestone focus is supplied yet, so the panel receives `proactive: null` |
| Phase 6: queries, discussion, moderation, FAQ, analytics | **NOT STARTED** | `milestone_metrics` and `assignment_metrics` are deliberately empty (D67, T7) |
| Anything mocked | **the `mock` provider only** | `LLM_PROVIDER=mock` is a first-class mode (D90) |

## 4. Session 05 evidence, condensed

Full evidence is in [`06-SESSION-LOG.md`](06-SESSION-LOG.md) Session 05.

| # | Claim | Command and observed result |
|---|---|---|
| 1 | **The repository is green, including a production build** | `pnpm typecheck` -> 0 errors; `pnpm lint` -> `C8 import/endpoint gate: ok` then `design gates: ok (13 checks)`, exit 0, **0 warnings**; `pnpm test` -> **42 passed in 42 files, 676 tests**; `pnpm build` -> exit 0, `Compiled successfully`, every one of the 21 new page/route paths in the route list |
| 2 | **Gate rule G1 is enforced in the query layer and answers `404`** | `scripts/verify-student.ts` checks 1-2: the fixture assignment is `200` to its enrolled student; an unknown one is `404 NOT_FOUND`; check 15: an unenrolled student is `404`, and the check **creates its own outsider** rather than skipping (a check that never runs is not a check) |
| 3 | **The workspace bootstrap is complete against `06` section 5.5.3** | check 3: header matches the fixture, `status published`, 1 source, 3 Map nodes, 1 milestone, `checklistTotal` 1, `dataState ready`. Live against the seeded assignment: 5 milestones, 17 items, 9 policy rules, 4 FAQ entries, 39 Map nodes, 59 edges |
| 4 | **The brief is a manifest plus the stored extraction, and carries no `viewerUrl`** (**D107**) | check 4: 1 document, 1 section, 1 page whose text is non-empty, `viewerUrl` **absent**. The page renders the document's own text with `whitespace-pre-wrap` and React's escaping; no `dangerouslySetInnerHTML` anywhere |
| 5 | **The Checklist round trip obeys D48 and writes its analytics rows** (**T34**) | checks 6-11: `start` is idempotent and does not reset `startedAt`; `complete` records a non-negative interval; the **T7** rows exist on data (`started 1, completed 1`); a repeat `complete` keeps the first interval and writes **no** second event; `reopen` returns the row to `in_progress` with `reopenCount 1` and the same interval; a **stale `expectedReopenCount` is `409 INVALID_STATE_TRANSITION`**; re-completion keeps the first interval |
| 6 | **The Assistant stream obeys the event order, and the refusal is a `200`** (**I4**, **T4**, **T13**) | checks 13-15: *"Here is my code, tell me what to change."* -> `200`, events `guardrail -> message -> done`, **0 token frames**, verdict `REFUSE`, rules `["P6"]`, template `T-REFUSE`, 3 help items. A debug request -> `REFUSE`, rules `["P5","P4"]`, 0 tokens. A permitted question -> `200`, `guardrail` then **21 token frames** then `citations`, `message`, `done`. The first case is `11` WP-09's own gate |
| 7 | **C3's badge reaches a rendered screen** | `scripts/verify-review.ts` checks 4b/4c -> **20/20**: the review page renders with `Review queue`, `Approve`, and `AI generated - requires tutor approval`; the page states that approving is not publishing. Asserted on the **rendered HTML**, not the bundle. Live: an `in_review` assignment with **47 `NEEDS_REVIEW` artifacts** renders the marker on every one |
| 8 | **Both UIs render with a real session and the seeded database** | all 7 student pages and 3 tutor pages return `200`; the checklist renders 5 milestones and 17 items as `0 of 17 complete`; an anonymous `/student` is `307` to `/login?next=%2Fstudent`; and **the strings "time worked" and "time on task" appear on no rendered page** (WP-07's acceptance criterion) |
| 9 | **The design gate is a real gate, not a formality** | `node scripts/check-design.mjs` -> 13 `ok` lines including `G4a 24 tokens`, `G4b 22 primitives`, `G4c 5 additions`, `G4d 3 stacks`, and `DEF 59 declared custom properties cover the config and the stylesheets`. It fails on a hex literal outside `tokens.css`, an undeclared token, and an L2 token neither `07` nor `17` names |
| 10 | **The schema is unchanged and undrifted** | `pnpm db:migrate` -> `no pending migrations (12 already applied)`; `verify-schema.ts` -> `schema drift: none (35 tables, 471 columns)`. Phase 5 added **no migration** |

## 5. What a later phase must NOT assume

1. **The brief viewer is not page-rasterised** (**D107**, I-45). It cannot reproduce the document's
   typography, and `viewerUrl` exists in no payload. Do not add one without a register change.
2. **`queries` and `ai_policy_rules` have no `deleted_at`** (**T33**). Check
   `information_schema.columns` before copying a soft-delete predicate from a sibling table.
3. **D48 spans two statements** (**T34**). `reopen` sets `state = 'in_progress'`; `complete` guards on
   `state <> 'completed'` and uses `coalesce` for `completed_at`/`elapsed_seconds`. Do not "simplify"
   either; the round trip is what makes the first interval survive.
4. **Do not add a `listVisible*(assignmentId)` variant** (`01-STATE.md`'s standing rule, kept from
   Phase 4). The `VisibleScope` argument is what makes T3 impossible.
5. **Do not import a server module from a client component** (**T35**). A pure helper that a client
   needs belongs in a module with type-only imports (`features/workspace/ui-state.ts`), and the server
   module re-exports it rather than the client importing the server one.
6. **Do not thread an `active` prop into the tab strip.** It derives the active tab from
   `usePathname`, because a layout cannot read the request path and four call sites is four chances to
   render the wrong tab as selected.
7. **A guardrail refusal is a `200`** (I4, T13). The panel renders it in the T5 content class with no
   `role="alert"`; the error path is only for `LLM_UNAVAILABLE` and a corrupt stream.
8. **The design-system gates G2/G6/G7/G10 are not implemented**, and `check-design.mjs` says so in its
   own output. Do not read its `ok` as coverage of them; G1/G3 need a browser.
9. **Do not assume `APPROVED` is student-visible.** The threshold is `PUBLISHED` (**D99**), kept from
   Phase 4 and now stated on the review page itself.
10. **Do not expect a live provider call to be free.** The account is paid Tier 1 with a 5 AUD monthly
    cap; Phase 5 made none, and both acceptance runs use `mock`.
11. **Do not trust `.local/`** as current (**I-14**). It holds both runs' reports and the probes; they
    are diagnostics, not contracts.
12. **`pnpm lint` now runs `check-design.mjs` as well as the C8 gate.** A clean `eslint` run is not a
    clean `lint`.

## 6. Local-only preparation for the next session

| Path | Contents | Survives a clone? |
|---|---|---|
| `.local/phase5-student-verify.json` | Phase 5's 18-check HTTP report: every expected and observed value | **No** (gitignored) |
| `.local/phase4-review-verify.json` | Phase 4's report, now 20 checks (4b/4c are Phase 5's) | **No** |
| `.local/probe-sse.mjs`, `probe-ui*.mjs`, `probe-tutor.mjs` | The manual probes: the SSE frame dump, the rendered-page string checks, the C3 badge check | **No**, and **not normative** |
| `.local/commit-*.txt` | The commit messages, written to a file because PowerShell 5.1 mangles `-m` | **No** |
| `.local/dev-server-5.log` | The dev server's output, including the two `500`s that became **T33** | **No** |
| `.local/build.log` | The production build's output, including the pre-existing `instrumentation.ts` Edge warnings | **No** |

Regenerate rather than trust any of it; where a file and `docs/**` disagree, the doc wins.

## 7. Push state

`git push origin main` for each commit; the Phase 5 exit push is recorded in the session log's
**Commit range** and in this file's tag line. `git ls-remote` should show `refs/heads/main` and
`refs/tags/phase-05-complete` at the same commit, and an anonymous
`GET https://api.github.com/repos/SharlEclair/rmit-hackathon` must return `private: false`,
`visibility: public`, `default_branch: main` (**I-07** stays resolved).
`git rev-list --left-right --count origin/main...HEAD` reads `0  0`. **If it does not, the push is the
first thing to re-run** -- the hackathon's submission evidence is the public repository, not this
checkout (**I-08**).
