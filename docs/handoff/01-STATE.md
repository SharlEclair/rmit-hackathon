# 01 -- Current State

**Purpose.** What is actually built, what is not, and the command that proves each claim. **This
file is rewritten every session.** It records commands and observed output, never adjectives.

**Tag:** `phase-06-complete` -- the Phase 6 exit commit. Phase 6's commits are `c7787aa` (the anonymity
contract and its structural gates, plus the first student routes), `22a7e77` (the post routes, the tutor
moderation surface and the FAQ promotion path), `d5bf87f` (the private Query thread), `978694c` (the FAQ
lifecycle), `743ceaa` (assignment health analytics), `7fdd1d8` (the Discussion Moderator's schema, I-49),
`de626d5` (the moderation pass), `50d01d7` (the moderator wired into post creation, D109), `8bcb3e4` and
`bf47b88` and `aa2c386` (the trap register and two route fixes), `087f9c2` (the `06`/`05` doc corrections)
and `194e69e` (Phase 6's acceptance run).
**Pushed:** see section 7. Tags run `phase-00` -> `phase-01` -> `phase-03` -> `phase-02` -> `phase-04` ->
`phase-05` -> `phase-06` -> `phase-07-freeze`, which is **not** the commit order (Phases 2 and 3 ran
concurrently).
**Last session:** 07.
**Next phase:** **none -- Phase 7 is the last phase in `18-IMPLEMENTATION-PLAN.md`.** Phases 0-7 are code-complete
and the feature set is frozen at `phase-07-freeze`. Phase 7 is a non-code phase and **four of its deliverables
need a human at a keyboard** and are not done: the fallback recordings, the screenshot asset, the three
rehearsals, and the Devpost filing. See section 3's Phase 7 rows for the exact state rather than a summary,
because "Phase 7 complete" would overstate it.

**Phase 7 note on `/compact`, carried from Phases 5 and 6:** the objective text asks for a `/compact` after
each of those phases. There is no compact tool available in this environment, so it was never run; the
handoff artefacts are written and pushed, which is what it was for. Recorded here so a later session does
not read the omission as a skipped step.

**Authority:** below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. Re-verify before trusting this file

```powershell
git log --oneline -1                 # expect the Phase 6 exit commit
git status --porcelain               # expect clean
git tag                              # expect phase-00..phase-06-complete
Test-Path app/src/lib/llm/types.ts                     # expect True (frozen in Phase 2)
Test-Path app/src/lib/guardrail/index.ts               # expect True (frozen in Phase 3)
Test-Path app/src/lib/db/queries/student-visibility.ts # expect True (gate rule G1)
Test-Path app/src/features/discussion/anon-identity.ts # expect True (the ONE reader of anon_identities)
Test-Path app/src/features/discussion/moderation.ts    # expect True (the moderation pass)
Test-Path app/src/lib/db/migrations/0013_moderation_reason_codes.sql  # expect True
Test-Path app/scripts/verify-discussion.ts             # expect True (Phase 6's acceptance run)
cd app
pnpm typecheck                       # expect no output, 0 errors
pnpm lint                            # expect "C8 import/endpoint gate: ok" THEN
                                     #        "design gates: ok (13 checks)", exit 0
pnpm test                            # expect 48 passed in 48 files, 757 tests, no network, no provider key
pnpm build                           # expect exit 0, "Compiled successfully"
pnpm db:migrate                      # expect "no pending migrations (13 already applied)"
pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts
                                     # expect "schema drift: none (35 tables, 471 columns)"
Get-Service postgresql-x64-18 | Select-Object Status   # expect Running
```

**All four acceptance runs need a running server** (`pnpm dev` in another terminal):

```powershell
cd app; pnpm exec tsx --env-file-if-exists=.env scripts/verify-student.ts    # expect 18/18
cd app; pnpm exec tsx --env-file-if-exists=.env scripts/verify-review.ts     # expect 20/20
cd app; pnpm exec tsx --env-file-if-exists=.env scripts/verify-analytics.ts  # expect 13/13
cd app; pnpm exec tsx --env-file-if-exists=.env scripts/verify-discussion.ts # expect 20/20
```

Reports land in `app/.local/phase{4,5,6}-*-verify.json`.

**PowerShell treats `[` and `]` as wildcards** (trap **T40**). Any `Remove-Item`, `Copy-Item`,
`Get-ChildItem` or `Test-Path` against a path under `app/src/app/**` must use `-LiteralPath`, or it
silently matches nothing -- which is how a removed route file survived on disk across three commits.

## 2. Environment fingerprint (observed, Session 06)

| Fact | Observed value | How |
|---|---|---|
| Shell | **Windows PowerShell 5.1** -- the tool name `pwsh` is misleading (I-09) | `$PSVersionTable` |
| Node / pnpm | `v24.15.0` / `12.4.2` | `node -v`, `pnpm -v` |
| Postgres | service `postgresql-x64-18` -> `Running`, native, port 5432 (**D66**) | `Get-Service` |
| Git | `main` = the Phase 6 exit commit; `origin` = `SharlEclair/rmit-hackathon`, public | `git log`, `git remote -v` |
| Registry pins | **no dependency was added in Phase 6** | `app/package.json` |
| Database | 35 base tables + 2 views, 471 columns, no drift; **13 migrations** | `scripts/verify-schema.ts` |
| Live LLM provider | the resolved `.env` provider is **`gemini`** with `gemini-3.8-flash`, not `mock` | a direct `getLlmClient().complete()` probe |

**That last row matters and cost time.** Phase 6's live probes assumed `LLM_PROVIDER=mock`; the resolved
provider is Gemini, so a request with `modelId: 'mock'` failed with `Model 'mock' not found`. The live
moderation path was therefore verified against Gemini (a valid `{flags:[], overallSeverity:0}` for a
benign post) and the **failure** path against the mock provider deliberately. Both halves are evidence;
neither alone is. Two shell traps also cost time and are recorded: PowerShell 5.1 mangles a multi-line
`git commit -m` (use `-F <file>`), and `Invoke-WebRequest`'s pipeline corrupts a captured JSON body (use a
Node or `tsx` probe).

## 3. State of the build

| Area | State | Evidence |
|---|---|---|
| Phases 0-1 (docs, skeleton, schema, seed, auth) | **built** | `pnpm db:migrate`, `pnpm test` |
| Phase 2: `src/lib/llm/`, `storage/`, `extract/`, `features/ingest/`, `features/uploads/` | **built and frozen** | Session 02 |
| Phase 2's **live** Analyst run | **VERIFIED in Phase 4** | `07-ARCHIVE/phase-04/` |
| Phase 3: `src/lib/guardrail/` + the 53-case golden set | **built and frozen** | `pnpm test -- tests/guardrail` |
| Phase 4: `features/review/`, migration `0012`, gate rule G1, the six tutor routes | **built** | `verify-review.ts` 20/20 |
| Phase 5: the design layer, `features/workspace/`, the 14 student routes, both UIs, the SSE stream | **built** | `verify-student.ts` 18/18 |
| **Phase 6: the anonymity contract, structurally gated** | **built** | `tests/discussion/imports.test.ts` (A-ID-2/5/6); `verify-discussion.ts` checks 1-5 |
| **Phase 6: WP-10 discussions** -- 9 routes, student and tutor | **built and exercised over HTTP** | `verify-discussion.ts` checks 1-7 |
| **Phase 6: WP-10 Queries** -- 7 routes, student and tutor | **built and exercised over HTTP** | `verify-discussion.ts` checks 8-12 |
| **Phase 6: WP-10 FAQ** -- 4 routes plus the promotion path | **built and exercised over HTTP** | `verify-discussion.ts` checks 13-19 |
| **Phase 6: WP-11 analytics** -- `milestone_metrics`, `assignment_metrics`, difficulty rule | **built** | `verify-analytics.ts` 13/13; `tests/analytics/` |
| **Phase 6: the Discussion Moderator** -- schema, prompt, service, wired into post creation | **built** | `tests/discussion/moderator-*.test.ts`, `moderation.test.ts` (51 tests); D109; migration `0013` |
| Phase 6: the design-system gates G1/G2/G3/G6/G7/G10 | **NOT IMPLEMENTED** | no browser gate; `check-design.mjs` names them as uncovered |
| Phase 6: the Attachment UI | **NOT STARTED, deliberately** | `05-ISSUES.md` **I-48** |
| Phase 6: the proactive notice wiring | **NOT STARTED** | route and builder exist; no milestone focus is supplied, so the panel receives `proactive: null` |
| **A mock fixture for `discussion_moderator`** | **NOT PRESENT, deliberately** | the mock's refusal is what makes binding rule 5's failure path exercisable offline |
| Anything mocked | **the `mock` provider is a first-class mode** | D90 |
| **Phase 7: the smoke test and the reset script** | **built and run** | `pnpm demo:smoke` -> **11/12**; `demo/reset.ps1` exists |
| **Phase 7: the AI-use disclosure** | **written, and the spoken version reconciled to it** | `14-HACKATHON-SUBMISSION.md` S5, with the per-packet log filled from the commit history |
| **Phase 7: the feature freeze** | **tagged** | `phase-07-freeze`, pushed, pointing at the current HEAD |
| Phase 7: the four fallback recordings | **NOT DONE -- needs a human** | `demo/fallback/` holds only a README; the smoke test reports the gap as a failing check |
| Phase 7: `demo/assets/failing-code-screenshot.png` | **NOT DONE -- needs a human** | `Test-Path demo/assets` -> False |
| Phase 7: the three rehearsals (one offline) | **NOT DONE -- needs a human** | `14-HACKATHON-SUBMISSION.md` S3's run sheet |
| Phase 7: the Devpost submission filed | **NOT DONE -- the team's** | S2's project URL is `TBD`; S5.3's per-member disclosure is unfilled |
| Phase 7: beat 5's second half performable live | **NOT POSSIBLE as built** | `13-DEMO-STORY.md` S6.2a: the attachment picker is I-48; the server-side refusal works, the UI does not offer it |

**48 route files** under `src/app/api` (26 student, 18 tutor, plus the public health and auth routes).

## 4. Session 06 evidence, condensed

Full evidence is in [`06-SESSION-LOG.md`](06-SESSION-LOG.md) Session 06.

| # | Claim | Command and observed result |
|---|---|---|
| 1 | **The repository is green, including a production build** | `pnpm typecheck` -> 0 errors; `pnpm lint` -> `C8 import/endpoint gate: ok` then `design gates: ok (13 checks)`, exit 0; `pnpm test` -> **48 passed in 48 files, 757 tests**; `pnpm build` -> exit 0, `Compiled successfully` |
| 2 | **The anonymity contract holds at runtime, not only in types** | `verify-discussion.ts` checks 1-5: an anonymous thread is labelled `Anonymous Student #<n>` from the persisted identity; a reply **adopts** the thread's anonymity rather than re-choosing it; the tutor payload contains none of `studentId`, `studentName`, `email`, `userId`, `anonIdentityId`, `subjectRef` -- while still carrying `displayLabel`, which A-ID-5 requires a tutor to have |
| 3 | **The Query machine has one edge per actor** | checks 8-12: always attributed (D24, D50); `409` when resolved before a tutor replies; the tutor's reply **is** the `open -> answered` transition; only the asking student resolves; a peer reading the thread gets `404 NOT_FOUND` rather than a refusal |
| 4 | **The FAQ chain, asserted in both intermediate states** | checks 13-19: `NEEDS_REVIEW` -> invisible; `APPROVED` -> **still invisible** (D99); `PUBLISHED` -> visible as T2; a stale `revision` -> `409 STALE_REVISION` (D98) |
| 5 | **M4 is a mean of per-student means, and the doc's sample query is not** | `verify-analytics.ts` checks 1-1c: five contributors, one completing 20 items at 600s and four completing 1 at 100s each -> stored `averageElapsedSeconds` **200**, where the flat `avg(duration_seconds)` would give **516.67**. Trap **T38** |
| 6 | **Both k-anonymity floors hold** | checks 2-3: a four-contributor bucket produces **no row at all** (absence is uniform, so 0 and 4 are indistinguishable); a five-contributor bucket has a mean and a **null** median, because `08` section 4.3's median floor is 8. Trap **T39**, I-51 |
| 7 | **The moderation failure path writes a real flag and leaves the post visible** | `moderation.test.ts` (12 tests) + a live probe: `action: mark`, `failure: CONTENT_FILTERED`, `flagsWritten: 1`, and a real row `source=ai severity=medium reason_code=MOD_INCIVILITY` with the tutor-facing note. `05` section 9.4 binding rule 5 |
| 8 | **The moderation happy path works against the live provider** | a direct `getLlmClient().complete()` probe returned `{"flags":[],"overallSeverity":0,"containsPersonalData":false}` for a benign post, and the post stayed visible with no flag |
| 9 | **The schema is undrifted, with one new migration** | `pnpm db:migrate` -> `13 already applied, 0 pending`; `verify-schema.ts` -> `schema drift: none (35 tables, 471 columns)`. `0013` widens `ck_moderation_flags_reason_code` (D109) |
| 10 | **Four acceptance runs, all green** | `verify-student.ts` 18/18; `verify-review.ts` 20/20; `verify-analytics.ts` 13/13; `verify-discussion.ts` 20/20 |

## 5. What a later phase must NOT assume

1. **`moderation_flags.reason_code` admits two vocabularies** (**D109**). The six generic values are the
   **student's**; the fourteen `MOD_*` codes are the **moderator's**. Read the `source` column. A writer
   using the wrong set fails the `CHECK`.
2. **The live provider is Gemini, not `mock`.** A request built with `modelId: 'mock'` against the live
   provider fails with a model-not-found error that reads like a configuration bug. Check
   `getConfig().llmProvider` before assuming either.
3. **A `catch` that converts a defect into a spec-mandated outcome is correct and hiding**
   (trap **T41**). `moderatorHookFor` returns `mark` on a fault because binding rule 5 requires it -- so a
   moderation defect leaves the post visible and the queue empty, which looks like working software.
4. **`student_checklist_progress` has no `assignment_id`.** It joins `student_assignments` (**I-50**).
   Trap **T36**'s neighbours in `lib/db/queries/questions.ts` were the same class of fault.
5. **Four defects of one class have now been found in fixture code**: a status set without its required
   stamp. `ck_milestones_approval`/`ck_milestones_published_at` (analytics fixture),
   `ck_assignments_published_at` (discussion fixture), `ck_faq_entries_approval`/
   `ck_faq_entries_published_by` (the FAQ write). Read `pg_constraint` before writing a status
   (**T37**).
6. **Gate rule G1's resolver joins `assignment_structures` on `is_current = true`.** An assignment marked
   `published` with no current structure resolves to `null`, so every student route answers `404` -- which
   is a correct `404` for a fixture that was built wrong.
7. **Do not add a `verify-*.ts` script to `pnpm test`.** `12` section 3.7 requires the suite to pass with
   no network and no database; the four acceptance runs need both by design (D72).
8. **`displayLabel` is not an identity leak.** A-ID-5 requires a tutor to see `Anonymous Student #880`;
   what must not appear is anything resolving that label to a person. A check that forbids `displayLabel`
   is testing the wrong thing.
9. **The mock provider refuses the moderator capability** (no template), returning
   `finishReason: content_filter`. That is deliberate and is what makes the failure path exercisable
   offline; do not "fix" it by inventing a fixture without also testing the refusal.
10. **`08` section 6.1's illustrative query is not implementable** (**I-50**), and **`06` section 4.7.2's
    sample build query computes M4 wrongly** (**T38**). Neither doc is normative SQL.
11. **`pnpm lint` runs `check-design.mjs` as well as the C8 gate.** A clean `eslint` run is not a clean
    `lint`.
12. **Do not trust `.local/`** as current (**I-14**). It holds four reports and several probes; they are
    diagnostics, not contracts.

## 6. Local-only preparation for the next session

| Path | Contents | Survives a clone? |
|---|---|---|
| `.local/phase6-discussion-verify.json` | Phase 6's 20-check HTTP report | **No** (gitignored) |
| `.local/phase6-analytics-verify.json` | WP-11's 13-check report, including the M4 discrimination | **No** |
| `.local/phase5-student-verify.json`, `.local/phase4-review-verify.json` | The two earlier runs | **No** |
| `.local/probe-*.mjs` | The manual probes: SSE frames, rendered-page strings, the C3 badge, the C4 anonymity read, the moderation paths | **No**, and **not normative** |
| `.local/dev-server-5.log` | The dev server's output, including the provider-mismatch error and the two `500`s that became T33 | **No** |

Regenerate rather than trust any of it; where a file and `docs/**` disagree, the doc wins.

## 7. Push state

`git push origin main` for each commit; the Phase 6 exit push is recorded in the session log's
**Commit range** and in this file's tag line. `git ls-remote` should show `refs/heads/main` and
`refs/tags/phase-06-complete` at the same commit, and an anonymous
`GET https://api.github.com/repos/SharlEclair/rmit-hackathon` must return `private: false`,
`visibility: public`, `default_branch: main` (**I-07** stays resolved).
`git rev-list --left-right --count origin/main...HEAD` reads `0  0`. **If it does not, the push is the
first thing to re-run** -- the hackathon's submission evidence is the public repository, not this
checkout (**I-08**).
