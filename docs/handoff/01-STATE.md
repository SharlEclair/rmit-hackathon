# 01 -- Current State

**Purpose.** What is actually built, what is not, and the command that proves each claim. **This
file is rewritten every session.** It records commands and observed output, never adjectives.

**Tag:** `phase-00-complete` (commit `3654c28`, **pushed** to `origin/main`)
**Last session:** 00, plus a post-phase follow-up (00b)
**Next phase:** **1 -- NOT STARTED.** The owner is starting Phase 1 in a separate chat window.

**Authority:** below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. Re-verify before trusting this file

```powershell
git log --oneline -3                 # expect 3654c28 (phase-00) at or near HEAD
git status --porcelain               # expect clean
git tag                              # expect phase-00-complete
git remote -v                        # origin https://github.com/SharlEclair/rmit-hackathon.git
Test-Path app                        # expect False  <-- Phase 1 has NOT started
Test-Path docs/fixtures              # expect False
Get-Service postgresql-x64-18 | Select-Object Status   # expect Running
node -v; pnpm -v                     # expect v24.x / 12.x
$PSVersionTable.PSVersion            # expect 5.1 (see 05-ISSUES I-09)
(Get-ChildItem docs/handoff).Name    # expect 8 entries
```

## 2. Environment fingerprint (observed, Session 00/00b)

| Fact | Observed value | How |
|---|---|---|
| Shell | **Windows PowerShell 5.1.26100.9549, Desktop** -- not `pwsh` 7 | `$PSVersionTable` |
| Node | `v24.15.0` | `node -v` |
| pnpm | `12.4.2` | `pnpm -v` |
| psql / Postgres | `18.6`; service `postgresql-x64-18` -> `Running`, native, port 5432 (**D66**) | `Get-Command psql`, `Get-Service` |
| Docker | client `29.4.3`; **daemon not running** | `docker info --format '{{.ServerVersion}}'` |
| Git | `origin` set; `phase-00-complete` = `3654c28`, pushed | `git push` -> `da00f71..3654c28 main -> main` |
| GitHub visibility | **PUBLIC** -- verified anonymously: HTTP 200, `"private": false`, `"visibility": "public"` | `web_fetch https://api.github.com/repos/SharlEclair/rmit-hackathon`. **I-07 resolved** |
| Gemini key | present in `.env` (length 53); `DEEPSEEK_API_KEY` empty | checked by **name and length only** |
| Live Gemini | reachable: `POST /v1beta/interactions` -> 200 (**D73**) | see section 4 |
| **Node runs `.ts` directly** | yes: a `.ts` file with a type annotation executed as `node file.ts` | probe in `%TEMP%` |
| **`node --test` finds `*.test.ts`** | yes: `a.test.ts` discovered and executed, 1 pass | probe in `%TEMP%`. A zero-dependency runner exists -- but see the `vitest` pin in section 5 |
| Registry at time of check | `next` 16.3.8, `react` 19.3.0, `tailwindcss` 4.3.3, `pg` 8.23.1, `eslint` 10.12.0 | `pnpm view <pkg> version` |

## 3. State of the build

| Area | State | Evidence |
|---|---|---|
| Repository + remote | **built**, public, Phase 0 pushed | `git log`, `git push` output |
| Documentation set (00-18) | **built**, reconciled in Phase 0 | `git show --stat phase-00-complete` |
| `docs/handoff/` scaffold | **built** (8 entries) | `Get-ChildItem docs/handoff` |
| `.env` provider contract | **reconciled -- local only, gitignored** | 5 x `LLM_THINKING_*`; `gemini` / `gemini-3.8-flash` |
| Spec extracts for Phase 1 | **prepared, local only** -- `.local/spec/` (gitignored) | section 7 |
| `app/` | **NOT STARTED** | `Test-Path app` -> `False` |
| `docs/fixtures/` | **NOT STARTED** | `Test-Path docs/fixtures` -> `False` |
| Schema / migrations / seed | **NOT STARTED** | no `app/` |
| Guardrail + 53 golden cases | **NOT STARTED** | no `app/` |
| Ingestion / Analyst / Assistant / analytics | **NOT STARTED** | no `app/` |
| Anything mocked | **nothing is mocked, because no code exists** | -- |

**Do not mark WP-01 complete.** Only its git half landed. See the status note in `11` WP-01.

## 4. Phase 0 evidence

| Deliverable | Evidence |
|---|---|
| Handoff scaffold, 8 paths | `git ls-tree -r phase-00-complete -- docs/handoff` -> 9 files (8 paths + the phase-00 archive) |
| Rulings A-I | [`../01-DECISIONS.md`](../01-DECISIONS.md) section I: **D68-D73** + the letter map |
| Provider call shape | **D73**; live probes recorded in [`02-DECISIONS.md`](02-DECISIONS.md) H1 |
| Live model call | `POST /v1beta/interactions` -> **200**, `steps: [thought, model_output]`, text `"ok"` |
| Structured output | same route + `response_format` -> **200**, `{"ok": true}` |
| `minimal` rejected | -> **400** `THINKING_LEVEL_MINIMAL is not supported` |
| Env reconciled | `.env` LLM_* read back: `gemini`, `gemini-3.8-flash`, 5 thinking levels |
| Specs corrected | 24 files, +1170/-89 in `3654c28`; route table still **64**; max decision id **73** |
| Trap register | [`03-INVARIANTS.md`](03-INVARIANTS.md) **T1-T19** |
| `AGENTS.md` pointer | three lines at the top of section 4 |

## 5. Phase 1 entry checklist (read this before writing a line)

1. **Stack pins are exact, and `latest` must never be installed blindly** (`04` section 2.2):
   `next` 16.3.8, `react`/`react-dom` 19.3.0, `tailwindcss` 4.3.3, `typescript` 7.0.2, `zod` 4.6.5,
   `vitest` 5.0.3, `tsx` 4.23.15, `drizzle-orm` 0.45.3, `drizzle-kit` (same 0.x line),
   `pdfjs-dist` 6.3.289, `react-pdf` 11.0.0, `@xyflow/react` 12.12.0, `mermaid` 12.1.0.
   The pin table does **not** name `eslint`; Phase 1 must choose it and record the choice.
2. **The query layer is Drizzle ORM 0.45.3 over the `postgres` driver** (`04` section 2.1, D37),
   with hand-readable SQL migrations under `src/lib/db/migrations/`. Prisma is rejected (2.1).
   Do not hand-roll a `pg` client instead.
3. **Tailwind is v4** (`04` section 2.2). But `17` section 6.3 expects `app/tailwind.config.ts` that
   *replaces* default theme keys and `app/src/styles/globals.css` importing four token files.
   Reconcile v4's CSS-first model with those paths, and record the resolution -- do not silently do
   one and document the other.
4. **Postgres is already provisioned** on 5432 and `DATABASE_URL` needs no change (**D66**). The
   app must not shell out to `psql` (`04` section 2.3 rule 2).
5. **WP-01 deliverables** (`11` WP-01): `app/package.json` (scripts `dev`, `build`, `start`,
   `typecheck`, `lint`, `test`, `db:migrate`, `db:seed`), `tsconfig.json` with `strict: true`, Next +
   PostCSS config, `app/.env.example`, `layout.tsx`/`page.tsx`, `api/health/route.ts` returning
   `{"ok":true,"db":"up","llmProvider":"<provider>","commit":"<sha>"}`, `src/lib/config.ts` as the
   **sole** `process.env` reader, `src/lib/db/client.ts`, `migrations/0001_baseline.sql`,
   `src/lib/db/migrate.ts`, `compose.yaml` (host port **5433**), `app/README.md`.
6. **The seed fixture is load-bearing** (trap **T8**): 37 synthetic students, >= 4 approved
   milestones, one milestone above **both** averages, one bucket below 5 contributors, and the demo
   brief as a **text-layer** PDF under `docs/fixtures/`.
7. **Emit `analytics_events` at the point of the event** from the first feature that touches it --
   analytics cannot be backfilled (trap **T7**).
8. **Write the guardrail and its 53-case golden set early** (WP-08 before WP-09, `11` section 3):
   it is the highest-risk code and it must pass with no network and no provider key.
9. A zero-dependency test runner is available (section 2), but `04` section 2.2 pins `vitest 5.0.3`.
   Use the pin unless a register row changes it.

## 6. What a later phase must NOT assume

1. **Do not assume `.env` is correct on a clean clone** -- it is gitignored; copy `.env.example`.
2. **Do not assume line numbers in the docs are stable.** Phase 0 moved many; cite headings.
3. **Do not assume a `*Response` type exists** because a route references it (I-03), the ingestion
   job table exists (I-15), or an artifact revision column exists (I-16).
4. **Do not assume `17`'s `--border-peer` is `#98A2B3`** -- it is `#667085` (D65, I-05, trap T11).
5. **Do not assume `pnpm typecheck`/`lint`/`test` exist** until WP-01 creates `package.json`.
6. **Do not assume the shell is PowerShell 7**; it is 5.1 (I-09).
7. **Do not treat `../16-VERIFICATION-REPORT.md` as current state** (I-14), and do not treat
   `.local/spec/` as normative (section 7).

## 7. Local-only preparation for Phase 1 -- `.local/spec/`

Prepared during the Phase 0 follow-up by reading the normative docs. **Gitignored** (`.gitignore`
line 40, `.local/`), so it does **not** survive a fresh clone and is **not** authoritative: where a
file and `docs/01`-`docs/18` disagree, the doc wins.

| File | Contents |
|---|---|
| `.local/spec/schema.md` | SQL-ready DDL for the **33 tables** in `06` sections 6-7, as `text`+`CHECK` enums (section 6.3), every index, the `search_tsv` generated column, `set_updated_at()` trigger, both views verbatim; the 15 migration-author ambiguities; the two circular FKs and the six tables needing `assignment_structures (id, assignment_id)` first |
| `.local/spec/api-contracts.md` | The 64-route index (R1-R64), `ApiErrorResponse` + the 16-code failure table with a retryable column, every defined request/response interface verbatim, the 11 undefined response types, the SSE protocol, and the route -> file-layout mapping |
| `.local/spec/guardrail.md` | The rule-id table, the decision pipeline, the structured decision contract, the four refusal templates, the logging denylist, the `UP1`-`UP5` upload sub-guard, and all **53** golden cases (G01-G53) with verdicts, rules and layers |

Regenerate rather than trust them if the docs have moved: they were extracted at `3654c28`.