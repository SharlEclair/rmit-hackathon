# 01 -- Current State

**Purpose.** What is actually built, what is not, and the command that proves each claim. **This
file is rewritten every session.** It records commands and observed output, never adjectives.

**Tag:** `phase-02-complete` -- the Phase 2 exit commit `6062aff` (the exit documents), which adds
`07-ARCHIVE/phase-02/`. The four packet commits are `4b51e55` (the adapter), `d77958c` (storage and
extraction), `8e62fa7` (the Analyst, the ingestion job and upload intake) and `6062aff` (the exit
documents), branched from `98072ae` -- **after** `phase-03-complete`, because Phases 2 and 3 ran
concurrently (`18` section 5.1) and Phase 3 pushed first. The tag order is therefore **not** the
commit order: `phase-03-complete` is an ancestor of `phase-02-complete`. **Pushed:** `git push origin
main` -> `98072ae..6062aff  main -> main`, and `git push origin phase-02-complete` -> `* [new tag]`,
so `git rev-list --left-right --count origin/main...HEAD` is `0  0`.
**Last session:** 02 and 03 (concurrent; both complete, and both are in this file because the state
below is the state of the *repository*, not of one session).
**Next phase:** **4 -- review, approval, state machine, gate rule G1.** Phases 0, 1, 2 and 3 are
complete; Phases 4-7 are unstarted.

**Authority:** below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. Re-verify before trusting this file

```powershell
git log --oneline -1                 # expect the Phase 2 exit commit, after 1498e53
git status --porcelain               # expect clean
git tag                              # expect phase-00-complete, phase-01-complete, phase-03-complete, phase-02-complete
Test-Path app/src/lib/llm/types.ts            # expect True (frozen in Phase 2)
Test-Path app/src/lib/guardrail/index.ts      # expect True (frozen in Phase 3)
Test-Path app/src/lib/db/migrations/0011_ingestion_jobs.sql   # expect True
Test-Path app/scripts/ingest-once.ts          # expect True
cd app
pnpm typecheck                       # expect no output, 0 errors (the whole app, both phases)
pnpm lint                            # expect "C8 import/endpoint gate: ok", exit 0
pnpm test                            # expect 22 passed in 22 files, 464 tests, no network, no provider key
pnpm db:migrate                      # expect "no pending migrations (11 already applied)"
pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts
                                     # expect "schema drift: none (35 tables, 464 columns)"
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
# expect 5 -- the seeded demo milestones. The three verification ingestion runs added their own
# milestones, but every one of them is NEEDS_REVIEW: nothing AI-generated was approved or published,
# which is the point (I2).
Remove-Item Env:PGPASSWORD
```

Note that `source_chunks` is no longer 69: each verification run wrote its own 19 chunks for its own
assignment, so scope any chunk query by `assignment_id`.

## 2. Environment fingerprint (observed, Session 02)

| Fact | Observed value | How |
|---|---|---|
| Shell | **Windows PowerShell 5.1.26100.9549** -- not `pwsh` 7 | `$PSVersionTable` |
| Node / pnpm / psql | `v24.15.0` / `12.4.2` / `18.6` | `node -v`, `pnpm -v`, `psql --version` |
| Postgres | service `postgresql-x64-18` -> `Running`, native, port 5432 (**D66**) | `Get-Service` |
| Docker | client present; **daemon not running** | not re-checked |
| Git | `main` = the Phase 2 exit commit; `origin` = `SharlEclair/rmit-hackathon`, public | `git log`, `git remote -v` |
| Tags | `phase-00-complete`, `phase-01-complete`, `phase-03-complete`, `phase-02-complete` | `git tag` |
| Registry pins as installed | unchanged from Phase 1; **no dependency was added in Phase 2** | `app/package.json` |
| Database | 35 base tables (34 project + `schema_migrations`), 2 views, 35 `trg_*_updated_at` triggers, 8 partial indexes, 464 columns | `information_schema`, `scripts/verify-schema.ts` |
| Seeded state | unchanged from Phase 1 (37 students, 1 tutor, 5 milestones, 69 chunks, 503 analytics events) | `pnpm db:seed` is idempotent |

## 3. State of the build

| Area | State | Evidence |
|---|---|---|
| Phases 0-1 (docs, skeleton, schema, seed, auth) | **built** | see the Phase 0/1 entries in `06-SESSION-LOG.md`; `pnpm db:migrate`, `pnpm test` |
| Phase 2: `src/lib/llm/` -- the provider adapter | **built and frozen** | 11 files; `tests/llm` -> 37 tests; live call shape verified (D89); `insight_engine` refuses on every provider (D67) |
| Phase 2: `src/lib/storage/` | **built** | 4 files; `tests/storage` -> 80 tests; **S3 driver never called against a live endpoint** (**I-37**) |
| Phase 2: `src/lib/extract/` | **built** | 5 files; `tests/extract` -> 38 tests; PDF/DOCX/PPTX/text; CRC-32 verified (T28) |
| Phase 2: `src/features/ingest/` -- the Analyst | **built; live run NOT verified** | 5 passes + prompts + constraints + pipeline; offline end-to-end run `ok: true`, `stage: S7`; **live structured call returned 400 and the free-tier quota ran out** (**I-35**) |
| Phase 2: `src/features/uploads/` | **built; sealed by design** | O11 intake with `UP5` at the picker; the guardrail scan stays `pending`, so no upload can attach yet (**D92**) |
| Phase 2: `ingestion_jobs`, `llm_call_counters` (migration `0011`) | **built** | `pnpm db:migrate` applied it; `verify-schema.ts` -> no drift at 35 tables / 464 columns; `06` section 7.8 is the spec |
| Phase 2 routes + `src/instrumentation.ts` | **built; not exercised over HTTP** | typecheck, lint and the shared repository/pipeline layers are verified; no multipart request was issued (**section 6**) |
| Phase 3: `src/lib/guardrail/` + the 53-case golden set | **built (Phase 3's session; not verified by Phase 2)** | `pnpm test` repo-wide -> 464 passed in 22 files, which includes `tests/guardrail`. Phase 3's own evidence is in the Session 03 entry |
| Phase 4: review, approval, state machine, gate G1 | **NOT STARTED** | no state machine exists; the seed sets statuses directly; `ReviewBundleResponse` has no route |
| Phase 5: student workspace, Map, checklist, Assistant | **NOT STARTED** | no `(student)` page; the SSE route does not exist |
| Phase 6: queries, discussion, moderation, FAQ, analytics | **NOT STARTED** | `milestone_metrics` and `assignment_metrics` are deliberately empty (D67, T7) |
| `expectedRevision` storage | **NOT STARTED**, deliberately | no revision column (A8, **I-16**) |
| Anything mocked | **the `mock` provider only** | `LLM_PROVIDER=mock` is a first-class mode (D90), not a stub in the UI; no other layer is faked |

**Every phase's verification gate has been run and the results are quoted in section 4 or in the
session log.** The per-item acceptance checklists in `11` were not all re-walked one by one; the ones
that were are named rather than ticked.

## 4. Session 02 evidence, condensed

Full evidence is in [`06-SESSION-LOG.md`](06-SESSION-LOG.md) Session 02. The claims a later phase
depends on:

| Claim | Command and observed result |
|---|---|
| The whole repo is green after both concurrent sessions | `pnpm typecheck` -> **0 errors** (the whole app, including guardrail); `pnpm lint` -> `C8 import/endpoint gate: ok`, exit 0; `pnpm test` -> **22 passed in 22 files, 464 tests**, no network, no provider key |
| Migration `0011` applies and the schema mirror follows it | `pnpm db:migrate` -> `apply 0011_ingestion_jobs`; second run -> `no pending migrations (11 already applied)`; `pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts` -> `schema drift: none (35 tables, 464 columns)` |
| The offline ingestion loop works end to end (WP-04's gate) | `LLM_PROVIDER=mock pnpm exec tsx scripts/ingest-once.ts --fixture demo` -> `ok: true`, `status: succeeded`, `stage: S7`, counts `sources 2 / chunks 19 / requirements 12 / rubricSections 4 / milestones 6 / checklistItems 18 / faqEntries 3 / policyRules 3 / findings 1`. Run twice, same counts |
| Nothing AI-generated is student-visible | same run, then SQL: `assignments.status = in_review`; artifacts `NEEDS_REVIEW`; `select count(*) from milestones where assignment_id='<run>' and publication_status in ('APPROVED','PUBLISHED')` -> **0** |
| Provenance is on every artifact | SQL: `count(*) from requirement_nodes where assignment_id='<run>' and provenance is null` -> **0** |
| Page anchors are real | SQL: `source_chunks` 19, `count(*) ... where page_from is null or page_to is null` -> **0**, `min(page_from)..max(page_to)` -> **1..4** |
| The O1 grammar guard bites | SQL: `checklist_items` 18, `count(*) ... where title ~* '\y(implement\|build\|write\|code\|design\|deploy\|fix\|debug\|solve)\y'` -> **0** |
| The pipeline writes no metrics and no analytics | SQL: `milestone_metrics` for the run -> **0 rows**; the pipeline writes no `analytics_events` (T7) |
| The budget counter works | SQL: `llm_call_counters` -> 1 row for the run (`ingestion_run:<jobId>` at 5 calls, `max_calls` 12) |
| The job row is the execution model | SQL: `ingestion_jobs` -> `succeeded / S7 / completed_stages 8`; one `audit_logs` row with counts and notes |
| The provider call shape works live (D73, D89) | `POST /v1beta/interactions` with `input: <string>` + `system_instruction` -> **200** with a `thought` step and a `model_output` step; `input: [{role, content}]` -> **400** "use step_list input format instead of turn_list"; `input: [{role, parts}]` -> **400** "Unknown parameter 'parts'"; structured output -> **200** with `{"ok": true}`; `nullable: true` -> **200** |
| The provider schema is a hint, zod is the contract | `tests/llm/schema.test.ts` -> the emitted provider schema contains `type/properties/required/items/enum/nullable` and none of `minLength/maxLength/minItems/maxItems/minimum/maximum`; a payload outside a dropped bound is still refused by `parseStructured` |

## 5. What a later phase must NOT assume

1. **Do not assume a live model call succeeds for a structured request.** It has not been proven
   since the schema change (**I-35**), and the free tier allows only 20 requests/day (**I-36**).
   Anything you must demonstrate must work under `LLM_PROVIDER=mock` first.
2. **Do not assume the new routes have been exercised over HTTP.** `/api/tutor/assignments/*/sources`,
   `.../ingest`, `/api/student/uploads` and `/api/student/uploads/{id}` typecheck, lint and share
   their repository and pipeline layers with the verified script -- no request has been sent to them.
3. **Do not assume the attachment path completes.** `guardrail_scan_status` stays `pending` until
   Phase 3's guardrail is wired to the `scan` seam (D92). The correct behaviour today is a refusal.
4. **Do not assume the S3 driver or the DeepSeek adapter work.** Neither has been called
   (**I-37**, **I-38**).
5. **Do not edit `src/lib/llm/types.ts` or `src/lib/llm/schema.ts`.** Frozen at Phase 2; a
   structured schema belongs in `schema.ts`, and a new capability goes through `05-ISSUES.md`
   (`handoff/04-INTERFACES.md` section 6, `03-INVARIANTS.md` section 2 items 11-12).
6. **Do not expect a stage `S8`.** The job enum is `S0`-`S7`; persistence is the transition to
   `succeeded`, and `ck_ingestion_jobs_succeeded_stage` requires `stage = 'S7'` (`06` section 7.8.1).
7. **Do not unify the seed onto the pipeline** (T29). The seed's chunker is Phase 1's verified
   evidence; the pipeline decides what extraction it owes from the chunk count, not from
   `extraction_status`.
8. **Do not pass the same `Uint8Array` to `extractDocument` twice** (T27). `pdfjs` detaches it.
9. **Do not assume `11` WP-04's old gate text is runnable.** It asserted an `assignments.status`
   value that the CHECK forbids and columns that do not exist; both are corrected in `11`.
10. **Do not read `01-STATE.md`'s tag list as a commit order.** `phase-03-complete` is an ancestor of
    `phase-02-complete`.
11. **Do not trust `.local/` or `../16-VERIFICATION-REPORT.md`** as current (**I-14**), and re-check
    any `.local/spec/` claim against `docs/**`.
12. **Do not expect `signedUrl` to work on the `local` driver.** It throws
    `SIGNED_URL_UNSUPPORTED` and no route serves document bytes yet (**I-06**, T12).

## 6. Local-only preparation for the next session

| Path | Contents | Survives a clone? |
|---|---|---|
| `.local/phase2-proposal-mock.json` | The offline run's full report: sources, page counts, counts, notes, job row | **No** (gitignored) |
| `.local/phase2-proposal-live.json` | The failed live run's report, including the provider's 400 message | **No** |
| `.local/probe-*.mts`, `.local/probe-*.mjs` | The live probes: call shape, structured output, the keyword isolation (nullable accepted; the rest 503/429) | **No** |
| `.local/spec/` | Phase 0/1's derived extracts -- **not normative** | **No** |

Regenerate rather than trust any of it; where a file and `docs/**` disagree, the doc wins.
