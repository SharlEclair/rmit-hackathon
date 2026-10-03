# 01 -- Current State

**Purpose.** What is actually built, what is not, and the command that proves each claim. **This
file is rewritten every session.** It records commands and observed output, never adjectives.

**Tag:** `phase-04-complete` -- the Phase 4 exit commit. Phase 4's three code commits are `a509dbd`
(the approval boundary, the revision token and gate rule G1), `1077faa` (the Analyst output ceiling
and the live-path evidence) and the exit commit that carries this file. **Pushed:** see section 7;
the tag order is `phase-00-complete` -> `phase-01-complete` -> `phase-03-complete` -> `phase-02-complete`
-> `phase-04-complete`, and it is **not** the commit order (Phases 2 and 3 ran concurrently).
**Last session:** 04.
**Next phase:** **5 -- student workspace, Map, checklist, Assistant.** Phases 0-4 are complete;
Phases 5-7 are unstarted. **Phase 4 delivered WP-06's boundary, contract and routes but not its review
page** -- see section 4 item 8 and `05-ISSUES.md` I-44 for why, and what to do first.

**Authority:** below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. Re-verify before trusting this file

```powershell
git log --oneline -1                 # expect the Phase 4 exit commit, after 1077faa
git status --porcelain               # expect clean
git tag                              # expect phase-00..phase-04-complete
Test-Path app/src/lib/llm/types.ts            # expect True (frozen in Phase 2)
Test-Path app/src/lib/guardrail/index.ts      # expect True (frozen in Phase 3)
Test-Path app/src/lib/db/migrations/0012_artifact_revision.sql   # expect True (Phase 4)
Test-Path app/src/lib/db/queries/student-visibility.ts            # expect True (gate rule G1)
Test-Path app/scripts/verify-review.ts        # expect True (Phase 4's acceptance run)
cd app
pnpm typecheck                       # expect no output, 0 errors (the whole app)
pnpm lint                            # expect "C8 import/endpoint gate: ok", exit 0
pnpm test                            # expect 24 passed in 24 files, 521 tests, no network, no provider key
pnpm db:migrate                      # expect "no pending migrations (12 already applied)"
pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts
                                     # expect "schema drift: none (35 tables, 471 columns)"
$PSVersionTable.PSVersion            # expect 5.1 (see 05-ISSUES I-09)
node -v; pnpm -v                     # expect v24.x / 12.x
Get-Service postgresql-x64-18 | Select-Object Status   # expect Running
```

The database assertions need `PGPASSWORD` and the local role:

```powershell
$env:PGPASSWORD='password'
psql -U user -h localhost -p 5432 -d assignment_assistant -tAc "select count(*) from users where role='student'"
# expect 37
psql -U user -h localhost -p 5432 -d assignment_assistant -tAc "select count(*) from milestones where publication_status in ('APPROVED','PUBLISHED')"
# expect 5 -- the seeded demo milestones. The verification ingestion runs added their own milestones,
# every one of them NEEDS_REVIEW or APPROVED: nothing AI-generated was published, which is the point (I2).
psql -U user -h localhost -p 5432 -d assignment_assistant -tAc "select column_name from information_schema.columns where table_name='milestones' and column_name='revision'"
# expect revision
Remove-Item Env:PGPASSWORD
```

Scope any chunk query by `assignment_id`: every verification run writes its own chunks.

**The HTTP-level gate needs a running server** (two terminals):

```powershell
cd app; pnpm dev                                        # terminal 1
cd app; pnpm exec tsx --env-file-if-exists=.env scripts/verify-review.ts   # terminal 2
# expect 18/18 passed, report at app/.local/phase4-review-verify.json
```

## 2. Environment fingerprint (observed, Session 04)

| Fact | Observed value | How |
|---|---|---|
| Shell | **Windows PowerShell 5.1** -- the tool name `pwsh` is misleading (I-09) | `$PSVersionTable` |
| Node / pnpm / psql | `v24.15.0` / `12.4.2` / `18.6` | `node -v`, `pnpm -v` |
| Postgres | service `postgresql-x64-18` -> `Running`, native, port 5432 (**D66**) | `Get-Service` |
| Git | `main` = the Phase 4 exit commit; `origin` = `SharlEclair/rmit-hackathon`, public | `git log`, `git remote -v` |
| Tags | `phase-00` .. `phase-04-complete` | `git tag` |
| Registry pins | unchanged from Phase 1; **no dependency was added in Phase 4** | `app/package.json` |
| Database | 35 base tables + 2 views, 35 `trg_*_updated_at` triggers, **471 columns** (464 + 7 `revision`) | `information_schema`, `scripts/verify-schema.ts` |
| Model provider account | **paid Tier 1 Gemini key with a provider-side monthly spend cap of 5 AUD** (Phase 4; `12` section 2.3, **I-36**). The free tier's 20-requests-per-day cap no longer applies. Measured cost: ~0.15 AUD per live five-pass ingestion run | the live runs in section 4; the key itself is never read, printed or committed (C7) |

**A driver caveat that cost a `500` and is now handled.** The `postgres` driver returned a
`timestamptz` as a **string** in this environment, not a `Date`, and `row.created_at.toISOString()`
threw on the review bundle's first live request. `src/lib/db/values.ts` now normalises timestamps and
`numeric`/`bigint` at the query boundary, because the driver's type parsing is not a contract this
code may assume (`Number(row.byte_size)` in Phase 2 was the same lesson).

## 3. State of the build

| Area | State | Evidence |
|---|---|---|
| Phases 0-1 (docs, skeleton, schema, seed, auth) | **built** | see Sessions 00-01 in `06-SESSION-LOG.md`; `pnpm db:migrate`, `pnpm test` |
| Phase 2: `src/lib/llm/`, `storage/`, `extract/`, `features/ingest/`, `features/uploads/` | **built and frozen** | Sessions 02; `pnpm test -- tests/llm tests/ingest tests/extract tests/storage tests/auth tests/db` |
| Phase 2: the **live** Analyst run | **VERIFIED in Phase 4** | section 4 item 1: `ok: true`, `stage: S7`, 24 requirements / 5 rubric sections / 5 milestones / 28 checklist items / 8 FAQ entries / 5 policy rules / 4 findings. Closes **I-35** |
| Phase 3: `src/lib/guardrail/` + the 53-case golden set | **built and frozen** | `pnpm test` repo-wide; Session 03 |
| Phase 4: `features/review/` -- the approval state machine and the action layer | **built** | `pnpm test -- tests/review` -> 56 tests; section 4 items 2-3 |
| Phase 4: migration `0012` + `revision` on the seven artifact tables | **built** | `pnpm db:migrate` applied it; `verify-schema.ts` -> no drift at 35 tables / 471 columns; **D98** closes I-16 |
| Phase 4: gate rule G1 in the query layer + the one student route | **built and verified over HTTP** | section 4 items 4-6; **D99** resolves I-21 |
| Phase 4: the six tutor routes (review, patch, delete, create, approve, publish) | **built and exercised over HTTP** | section 4; `scripts/verify-review.ts` 18/18 |
| Phase 4: the tutor **review page** and the provenance badge | **NOT STARTED, deliberately** | `05-ISSUES.md` **I-44**: `app/src/styles/tokens.css` is empty, so every Tailwind colour key resolves to an undefined custom property and no screen can render correctly. `11` WP-06's status note names the gap and the order that avoids rework |
| Phase 4: the design-system gates (`17` section 12, G4-G10) | **NOT STARTED** | no `check-design.mjs`, no `pnpm test:e2e`. Owner: the next UI phase, with I-44 |
| Phase 5: student workspace, Map (rest), checklist, Assistant | **NOT STARTED** | only `.../structure` exists (Phase 4's). No `(student)` page; the SSE route does not exist |
| Phase 6: queries, discussion, moderation, FAQ, analytics | **NOT STARTED** | `milestone_metrics` and `assignment_metrics` are deliberately empty (D67, T7) |
| Anything mocked | **the `mock` provider only** | `LLM_PROVIDER=mock` is a first-class mode (D90); no other layer is faked |

## 4. Session 04 evidence, condensed

Full evidence is in [`06-SESSION-LOG.md`](06-SESSION-LOG.md) Session 04.

| # | Claim | Command and observed result |
|---|---|---|
| 1 | The live five-pass ingestion works end to end | `pnpm exec tsx --env-file-if-exists=.env scripts/ingest-once.ts --fixture demo --pace-ms 14000` -> `ok: true`, `status: succeeded`, `stage: S7`, `sources 2 / chunks 24 / requirements 24 / rubricSections 5 / milestones 5 / checklistItems 28 / faqEntries 8 / policyRules 5 / findings 4`, notes clean. Then SQL: `assignments.status = in_review`; 24/24 requirement nodes verbatim-substring their chunk; 0 missing provenance; 0 checklist items with an implementation verb; 0 milestones approved or published; 0 `analytics_events`; 0 `milestone_metrics`; 4 ambiguity findings. **Closes I-35** |
| 2 | The minimised provider schema is accepted live, and the old `400` is gone | `.local/probe-json-shape.mts` (1 call): `provider=gemini`, `finishReason=stop`, `json===null? no`, valid schema-shaped JSON. A second probe over the real 24-chunk fixture: `parseStructured ok? yes` |
| 3 | The truncation that replaced it is fixed and measured | one structure pass per ceiling: 8,192 -> `outputTokens` 8,178, body cut, `json: null`; 32,768 -> 32,754, still cut; **65,536 -> `stop` at 41,555 / 43,258, JSON parsed and zod passed**; 32,768 at `low` thinking -> `stop` at 2,378. **D104**, trap **T32**, `I-42` for the remaining diagnosis gap |
| 4 | Gate rule G1 is enforced in the query layer and answers `404` | `scripts/verify-review.ts` steps 1 and 6: a `NEEDS_REVIEW` assignment is `404` to a student, and **after approve-all it is still `404`** -- the assertion that makes **D99** real (an `APPROVED` threshold passes every other step and fails this one) |
| 5 | Publish is the only action that makes content visible, and the gate holds | step 7 `200 published`; step 8 `200` with 3 nodes, 2 edges, `label=AI-generated interpretation`; step 4 (in the script's first run) `canPublish false, blockers ["NO_POLICY_RULE_APPROVED"]` |
| 6 | Editing a published artifact withdraws it immediately (transition 8, T-18) | step 9: `200 status=EDITED milestoneStillVisible=false requirementVisible=true` |
| 7 | Optimistic concurrency works (T-19) and the code is exact | steps 10-11: two concurrent PATCHes at one revision -> `[200,409]`, and the refusal is `STALE_REVISION` |
| 8 | C2 is enforceable through the API | step 12: `409 IMMUTABLE_FIELD fields=["verbatimText"]` |
| 9 | The policy write guard refuses an unmapped capability rule and accepts an escalation rule | steps 13-16: `400 VALIDATION_FAILED` naming `no_vibes_based_grading`; `201 NEEDS_REVIEW` for a mapped `ALLOW` code **and** for `route_uncertain_requests_to_tutor`, which has no mapping at all. The second acceptance is **T31**: my first guard refused it, which was the guard being stricter than `policyFromRows` |
| 10 | Every mutating action audits, and the state machine's refusal names the transition | step 18 `["artifact.approved_all","assignment.published","artifact.edited","artifact.edited"]`; step 19 `409 ... message=Cannot approve an artifact in PUBLISHED: it is already approved.` |
| 11 | The revision token stores and guards | `pnpm db:migrate` -> `apply 0012_artifact_revision`; `1 applied, 11 already applied`; `verify-schema.ts` -> `schema drift: none (35 tables, 471 columns)`; `tests/db/migrations.test.ts` inverted the Phase 1 "no revision column" assertion and passes (15 tests) |
| 12 | The whole repository is green | `pnpm typecheck` -> **0 errors**; `pnpm lint` -> `C8 import/endpoint gate: ok`, exit 0; `pnpm test` -> **24 passed in 24 files, 521 tests**, no network, no provider key |
| 13 | The review contract is complete where it was not | `06` section 5.5.8's payload union is now seven members (`StructurePayload` added) and `AssignmentResponse` is defined -- I-03, I-41 closed (**D103**) |

## 5. What a later phase must NOT assume

1. **Do not assume `APPROVED` is student-visible.** It is not: the threshold is `PUBLISHED`, in one
   place (**D99**). `isStudentVisible()` is the UI statement; `findVisibleAssignmentScope` + the
   `listVisible*` functions are the enforcement (`06` section 3.4, trap T3).
2. **Do not add a `listVisible*(assignmentId)` variant.** The `VisibleScope` argument is what makes it
   impossible to read student content before the gate is resolved; removing it reintroduces T3.
3. **Do not assume the review page exists.** It does not, and neither does any design-system gate.
   `app/src/styles/tokens.css` declares **no token**, so a page built today renders against undefined
   CSS variables. Read **I-44** before starting any UI work: the order is tokens, then G4 parity, then
   the font decision, then the page.
4. **Do not assume a live `LLM_PROVIDER=gemini` run is free or repeatable.** The account is paid Tier 1
   with a 5 AUD monthly cap; a five-pass run is ~0.15 AUD. `pnpm test` never calls a provider and must
   keep passing with no key. **I-42** is still open: a truncated response is reported as
   `LLM_OUTPUT_INVALID`, and no pass failure carries a truncation signal.
5. **Do not lower `ANALYST_DEFAULT_MAX_OUTPUT_TOKENS` back to 8,192.** Thinking is billed as output
   (D73/D89), so the ceiling must fit thinking *plus* body; 8,192 truncated the live structure pass
   (**D104**, trap T32, `tests/ingest/analyst.test.ts` pins it).
6. **Do not edit `src/lib/llm/types.ts` or `src/lib/llm/schema.ts`.** Frozen at Phase 2; a structured
   schema belongs in `schema.ts`, and a new capability goes through `05-ISSUES.md`.
7. **Do not expect a stage `S8`**, and do not unify the seed onto the pipeline (T29).
8. **Do not pass the same `Uint8Array` to `extractDocument` twice** (T27). `pdfjs` detaches it.
9. **Do not assume a write-time guard may be stricter than the read-time validator** (**T31**). Prove
   the thing you are protecting rejects it too, and test the accepting direction as well.
10. **Do not trust `.local/` or `../16-VERIFICATION-REPORT.md`** as current (**I-14**). The probe
    scripts and reports there are diagnostics, not contracts.
11. **Do not read `01-STATE.md`'s tag list as a commit order**; `phase-03-complete` is an ancestor of
    `phase-02-complete`.
12. **Do not expect `signedUrl` to work on the `local` driver** (**I-06**, T12), and do not expect a
    `revision` on any table other than the seven lifecycle-bearing ones.

## 6. Local-only preparation for the next session

| Path | Contents | Survives a clone? |
|---|---|---|
| `.local/phase4-review-verify.json` | The 19-step HTTP acceptance report: every expected and observed value | **No** (gitignored) |
| `.local/probe-json-shape.mts`, `.local/probe-structure-pass.mts` | The two live probes: response shape, and the truncation measurements | **No** |
| `.local/proposal.json` | The live run's report, overwritten by each run | **No** |
| `.local/dev-server.log` | The dev server's output, including the `500` that led to `values.ts` | **No** |
| `.local/phase2-*.json`, `.local/probe-*.mjs`, `.local/spec/` | Phase 0-2 material -- **not normative** | **No** |

Regenerate rather than trust any of it; where a file and `docs/**` disagree, the doc wins.

## 7. Push state

`git push origin main` and `git push origin phase-04-complete` were run at the Phase 4 exit; the
observed result is in the Session 04 entry. `git rev-list --left-right --count origin/main...HEAD`
should read `0  0`. **If it does not, the push is the first thing to re-run** -- the hackathon's
submission evidence is the public repository, not this checkout (**I-08**).
