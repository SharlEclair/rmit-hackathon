# 01 -- Current State

**Purpose.** What is actually built, what is not, and the command that proves each claim. **This
file is rewritten every session.** It records commands and observed output, never adjectives.

**Tag:** `phase-01-complete` -- Phase 1's final commit, which adds `07-ARCHIVE/phase-01/`. The
packet commits it contains are `9c84ef8` (WP-01 skeleton), `9d4c16d` (fixtures), `f5360a5` (schema),
`e16cfa5` (auth), `0ba949f` (the `pdfjs-dist` pin), `3a47eaf` (seed) and `593499a` (these exit
documents). **Not pushed** at the time of writing: `origin/main` is 7 commits behind `main`.
**Last session:** 01
**Next phase:** **2 -- NOT STARTED.** `src/lib/llm/`, `src/lib/storage/`, extraction and the
ingestion job are Phase 2's; the guardrail (WP-08, Phase 3) is file-disjoint and must not wait.

**Authority:** below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. Re-verify before trusting this file

```powershell
git log --oneline -1                 # expect 3a47eaf (phase-01 wp-A..wp-C)
git status --porcelain               # expect clean
git tag                              # expect phase-00-complete and phase-01-complete
Test-Path app                        # expect True
Test-Path docs/fixtures/demo-brief.pdf   # expect True
cd app; pnpm typecheck               # expect no output
pnpm lint                            # expect "C8 import/endpoint gate: ok"
pnpm test                            # expect 52 passed in 3 files
pnpm db:migrate                      # expect "no pending migrations (10 already applied)"
pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts   # expect "schema drift: none (33 tables, 444 columns)"
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
# expect 5
Remove-Item Env:PGPASSWORD
```

## 2. Environment fingerprint (observed, Session 01)

| Fact | Observed value | How |
|---|---|---|
| Shell | **Windows PowerShell 5.1.26100.9549** -- not `pwsh` 7 | `$PSVersionTable` |
| Node | `v24.15.0` | `node -v` |
| pnpm | `12.4.2` | `pnpm -v` |
| psql / Postgres | `18.6`; service `postgresql-x64-18` -> `Running`, native, port 5432 (**D66**) | `psql --version`, `Get-Service` |
| Docker | client present; **daemon not running** | not re-checked this session |
| Git | `main` = `3a47eaf`, 16 commits; `origin` = `SharlEclair/rmit-hackathon`, public, **7 commits behind** | `git rev-list --count`, `git rev-list --left-right --count origin/main...HEAD` |
| Tags | `phase-00-complete`, `phase-01-complete` | `git tag` |
| Repository visibility | PUBLIC (verified in Phase 0 and Session 00b) | not re-checked this session |
| Registry pins as installed | `next` 16.3.8, `react`/`react-dom` 19.3.0, `tailwindcss` 4.3.3, `typescript` 7.0.2, `zod` 4.6.5, `vitest` 5.0.3, `tsx` 4.23.15, `drizzle-orm` 0.45.3, `drizzle-kit` 0.31.11, `postgres` 3.4.9, `pdfjs-dist` 6.3.289, `eslint` 9.39.5, `@babel/eslint-parser` 7.29.9, `@node-rs/argon2` 2.2.1 | `app/package.json` |
| Database | empty before Phase 1; now 34 base tables (33 project + `schema_migrations`), 2 views, 33 triggers, 8 partial indexes, 444 columns | `information_schema`, `scripts/verify-schema.ts` |
| Seeded state | 38 users (37 students + 1 tutor), 1 course, 1 assignment, 3 sources, 69 chunks, 5 milestones, 17 checklist items, 233 progress rows, 36 queries, 503 analytics events | `pnpm db:seed` summary, `psql` |

## 3. State of the build

| Area | State | Evidence |
|---|---|---|
| `app/` skeleton (WP-01) | **built** | `pnpm typecheck` clean; `pnpm lint` clean; `pnpm build` compiles; `/api/health` -> `{"ok":true,"db":"up",...}` |
| `/api/health` degraded path | **built** | with `DATABASE_URL` removed from `.env`: `{"ok":false,"db":"down",...}` and `/` still 200 from the same process |
| `docs/fixtures/` (WP-02) | **built** | 5 files; `pdfjs-dist@6.3.289` extracts 4 and 3 pages; three generator runs byte-identical |
| Schema: 33 tables, 2 views, 33 triggers, 8 partial indexes | **built** | `pnpm db:migrate` from a dropped schema -> `10 applied`; second run -> `no pending migrations`. `verify-schema.ts` -> no drift across 33 tables / 444 columns |
| Seed: deterministic cohort (WP-02) | **built** | `pnpm db:seed` run 1 -> `TOTAL 570 / 0`; run 2 -> `TOTAL 0 / 570`; whole-database row counts identical. T8's shape verified: 37 students, 5 milestones, M3 above both thresholds, M2 with 3 contributors |
| Auth (WP-03) | **built** | `pnpm test -- tests/auth` -> 37 passed; live: login 200 with an `HttpOnly; SameSite=Lax; Max-Age=43200` cookie, wrong password and unknown email both identical 401, `/tutor` -> 307 without a cookie and 404 with one, logout 204 then 401, four tamper shapes -> 401, 11th attempt -> 429 |
| `tests/db` | **built** (static) | `pnpm test -- tests/db` -> 15 passed. It asserts traps T18/T19 over the committed SQL and needs no database |
| Design tokens | **paths only** | the five `src/styles/*.css` files and `tailwind.config.ts` exist and compile; the token **values** are `07`/`17`'s and land with the first UI phase (**D75**) |
| `src/lib/llm/` (the adapter) | **NOT STARTED** | does not exist. No provider call has been made since Phase 0's three probes |
| `src/lib/storage/` | **NOT STARTED** | does not exist. The seed writes fixture bytes to `STORAGE_LOCAL_DIR` directly |
| Extraction / chunking pipeline | **NOT STARTED** | the seed chunks the PDFs with an ad-hoc path; WP-04 owns the real one |
| Guardrail + 53 golden cases (WP-08) | **NOT STARTED** | Phase 3's, and file-disjoint from Phase 2 |
| Review/approval state machine (WP-06) | **NOT STARTED** | no state machine exists; the seed sets statuses directly |
| Student/tutor surfaces | **NOT STARTED** | no `(tutor)` or `(student)` page exists. `/login` is the only page |
| Analytics computation (WP-11) | **NOT STARTED** | `milestone_metrics` and `assignment_metrics` are deliberately empty (D67, T7) |
| Ingestion job table (I-15) | **NOT STARTED** | still absent; D60/D71 assign it to WP-04/WP-05 |
| `expectedRevision` storage (I-16) | **NOT STARTED** | no revision column exists, deliberately (A8) |
| Anything mocked | **nothing is mocked** | the seed is fixture data, not a mock; no adapter exists to mock |

**WP-01, WP-02 and WP-03 are complete**, each against its own verification gate. Do not mark the KANBAN
checkboxes in `11` wholesale: the gates were run, the per-item acceptance lists were not all walked
one by one (see section 7 of [`06-SESSION-LOG.md`](06-SESSION-LOG.md) Session 01, "What I could not
verify").

## 4. Phase 1 evidence, condensed

Full evidence is in [`06-SESSION-LOG.md`](06-SESSION-LOG.md) Session 01. The four checks worth
quoting here, because each one is a claim a later phase depends on:

| Claim | Command and observed result |
|---|---|
| Migrations apply from nothing and are idempotent | `drop schema public cascade` + `create schema public` -> `pnpm db:migrate` -> `apply 0001_baseline` ... `apply 0010_updated_at_triggers` / `10 applied, 0 already applied`; second run -> `no pending migrations (10 already applied)` |
| The seed is idempotent database-wide | run 1 `TOTAL 570 / 0`; run 2 `TOTAL 0 / 570`; every base table's row count identical between the two |
| Trap T1 holds in the seeded data | per-student mean then mean of means, recomputed in SQL -> `2609.067 / 2116.333 / 5755.138 / 2303.500 / 2752.833` seconds, matching `docs/fixtures/cohort-seed.json` for all five milestones |
| Gate G1 shows a student content | `milestones` PUBLISHED joined through the current structure and the published assignment -> **5**. Before the D81 correction it was **0**, while 233 completed items sat under those milestones |

## 5. Phase 1 entry checklist (read this before writing a line)

1. **`.env` is gitignored and `app/.env` is what the app reads.** Copy the root `.env.example`.
   Scripts need `--env-file-if-exists=.env`; Next loads it itself. A fresh clone has **no** `.env`
   and **no** seeded data.
2. **`app/src/lib/config.ts` is the only module that reads `process.env`.** Do not add a second
   reader. Add a variable to `.env.example` **and** `04` section 11 in the same change.
3. **The SQL migrations are the schema of record**, not `schema.ts`. After any change to either,
   run `pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts`. **Migrations are
   immutable once applied** -- the runner stores a SHA-256 and refuses a changed file. Escape by
   resetting the database, never by editing the ledger.
4. **`src/lib/db/queries/**` is the only place SQL may live.** Features call repository functions.
   Every write takes a transaction, because trap T7 requires the event and the state change it
   describes to commit together.
5. **`tsconfig.json` is at the future pin set**: `strict`, `noUnusedLocals`, `noUnusedParameters`,
   `noUncheckedIndexedAccess`. `tsc --noEmit` owns unused-symbol checking, because no
   `typescript-eslint` package can load under `typescript 7.0.2` (**D78**).
6. **Vitest does not read `tsconfig.json` paths.** The `@/*` alias is in `app/vitest.config.ts`
   (**D78**'s neighbour); a test that fails to resolve `@/...` transitively is this, not a bug in
   the module under test.
7. **`pnpm test` must pass with no network.** Keep DB-backed checks in `scripts/` (as
   `verify-schema.ts` does), not in `tests/`, unless you are willing to make the suite
   environment-dependent.
8. **Do not seed `milestone_metrics` or `assignment_metrics`.** They are computed from
   `analytics_events` by WP-11's deterministic refresh (D67); a seeded copy is a second source of
   truth.
9. **Phase 2 owns `src/lib/llm/types.ts` and its `AiCapability` union** (`04-INTERFACES.md` section
   1). Phase 3 must request an enum change through `05-ISSUES.md` rather than editing it.
10. **Phase 2 also owns `I-19`**: relocate the house error envelope from `src/lib/auth/api-errors.ts`
    to `src/lib/api/errors.ts` before a second phase imports the wrong path.

## 6. What a later phase must NOT assume

1. **Do not assume the storage interface has ever been exercised.** `src/lib/storage/` does not
   exist. The seed writes to `STORAGE_LOCAL_DIR` directly, and `assignment_sources.storage_key`
   values are `sources/<kind>/<sha256>`, which is the seed's convention and not a driver's output.
2. **Do not assume any provider call works.** No adapter exists; the last live call was Phase 0's.
   `LLM_PROVIDER=gemini` is validated by config only.
3. **Do not assume a student-visible surface exists.** There is no `(tutor)` or `(student)` page, so
   `FORBIDDEN_ROLE` has never been returned by a live route and the middleware's pass-through was
   observed as a `404`, not a rendered page.
4. **Do not assume the design tokens have values.** The files exist; `tokens.css` is deliberately
   empty of declarations (D75). Seeding a value there is a `07` amendment, not a Phase 2 shortcut.
5. **Do not assume session revocation exists.** It does not, and there is no table to add it to
   (**D79**, **I-20**). A token stays valid until it expires.
6. **Do not trust a gate query's column name (T21).** `11` WP-02's gate asked for
   `milestones.status`, which does not exist, and `.local/spec/schema.md`'s ambiguity A1 asserted a
   classification `06` section 4.6 does not make. Run it and check the schema before concluding the
   work is wrong.
7. **Do not treat `.local/spec/` as normative**, and do not treat `../16-VERIFICATION-REPORT.md` as
   current state (**I-14**).
8. **Do not assume a fresh clone's `.storage/` is populated.** It is gitignored; the seed writes it.
9. **Do not expect `cohort-seed.json`'s 37th student to be seeded** -- it is not (**I-23**), because
   the interactive `student@demo.rmit` occupies that slot (**D82**).
10. **Do not expect the fixture to discriminate trap T1** -- it numerically cannot (**I-24**).

## 7. Local-only preparation for Phase 2

| Path | Contents | Survives a clone? |
|---|---|---|
| `.local/spec/schema.md` | SQL-ready DDL for the 33 tables, the index inventory, both views, the pseudonym derivation, and 15 ambiguities | **No** (`.local/` is gitignored). Two of its claims were wrong on re-check |
| `.local/spec/api-contracts.md` | The 64-route index, the error table, the defined request/response interfaces, the SSE protocol | **No** |
| `.local/spec/guardrail.md` | The rule-id table, the decision pipeline, the 53 golden cases | **No** |
| `.local/verify-*.sql`, `.local/verify-*.mjs` | The Lead's own verification queries and extraction checks from this session | **No** |

Regenerate rather than trust any of it; where a file and `docs/**` disagree, the doc wins.
