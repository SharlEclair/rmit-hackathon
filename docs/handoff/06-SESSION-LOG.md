# 06 -- Session Log

**Purpose.** Append-only narrative, one entry per implementation session. Written in the shape of
the handoff template in [`00-README.md`](00-README.md). A session appends its entry **before** the
first commit, so a session that dies mid-task still left its intent on disk.

---

## Session 00 - Phase 0: reconciliation, de-risking and handoff scaffold - 2026-10-04

**Phase:** 0   **Status:** complete
**Spec docs read:** `AGENTS.md`, `00-INDEX`, `01-DECISIONS`, `18-IMPLEMENTATION-PLAN` (all), plus
`02`, `03`, `04`, `05`, `06`, `07`, `11`, `12`, `14` by targeted region
**Commit range:** `da00f71`..`phase-00-complete`   **Tag:** `phase-00-complete`

### Delivered (with evidence)

| Item | Evidence (command + observed result) |
|---|---|
| The eight-path handoff scaffold | `Get-ChildItem docs/handoff` -> 8 entries |
| Rulings A-I in the register | `01-DECISIONS.md` section I: **D68**-D73 + the A-I letter map |
| Provider call shape settled | **D73**; three live HTTP probes (200, 200, 400) recorded in `02-DECISIONS.md` H1 |
| Env reconciled to D61/D62 | `.env` LLM_* lines read back: `gemini`, `gemini-3.8-flash`, 5 thinking levels |
| Stale specs corrected | `git show --stat phase-00-complete` (12 docs + `AGENTS.md` + `.env.example`) |
| Trap register seeded | `03-INVARIANTS.md` section 3, T1-T16 |
| `.gitignore` conflict resolved | Line 27's `*-session-*.md` was silently ignoring `06-SESSION-LOG.md`; `git check-ignore -v` confirmed it, and an explicit `!docs/handoff/*.md` exception was added. Both the log and `07-ARCHIVE/phase-00/` now stage (trap **T17**) |
| Three Phase 0 gaps closed | `IngestionStatusResponse` defined; `MILESTONE_WITHOUT_REQUIREMENT` added; `07` policy card section created (D71) |

### Not delivered, and why

- **`app/` and everything in it** -- Phase 0 is a reconciliation phase by design (D-scope: nothing
  is created under `app/` until Phase 1). Consequence: every product phase remains unstarted.
- **`docs/fixtures/`** -- owned by WP-02. Consequence: WP-04's verification gate cannot run today.
- **A decision on serving source-document bytes to the viewer** -- found while reconciling routes
  (`07` line 1407 named a "document stream" that no route provides). Recorded as I-06 rather than
  invented, because adding a route is a `06` section 5.4 change that should be made against a real
  viewer requirement.
- **Definitions for the ~10 other undefined `*Response` types** -- recorded as I-03. Defining them
  in Phase 0 would have been net-new API design with no consumer to validate it.
- **A fix for `17`'s `#98A2B3` occurrences** -- recorded as I-05 (trap T11). `07`, the owner of the
  value, is already correct.

### Decisions taken

- `attachment_extraction` is a sixth capability, runs at **upload**, gets `LLM_THINKING_EXTRACTION`
  and its own budget counter -- D68 -- `04`, `06`, `.env.example`, `12` -- logged as **D68**.
- `CLARIFY` is a refusal-shaped outcome that never produces a model answer -- **D69** -- `06`, `07`.
- `06` section 10 item 17 adopted as the authoritative path mapping and completed with the two
  un-mapped sketches -- **D70** -- `04`, `06`, `11`.
- The three documentation gaps closed -- **D71** -- `06`, `07`.
- Operator tooling lives in `app/scripts/`, artefacts in `demo/` -- **D72** -- `04`, `11`, `12`.
- The adapter uses the Interactions API with `store: false` -- **D73** -- `04`, `12`, `.env.example`.

### Invariants touched

- **I1 (the guardrail / zero model calls on a refusal)** -- honoured, and the surrounding wording
  was **strengthened**: the old invariant ("no code path to `src/lib/llm/` that does not pass the
  guardrail") was *false* as written, because extraction preceded the L0-L3 decision. It now reads
  as L0-L3-before-any-generation, with extraction named as the one classification-controlled call
  that is counted separately (D68).
- **I4 (a refusal is a 200)** -- honoured; `CLARIFY` was classified as a refusal for golden-set
  purposes (D69), and `07`'s duplicate rule numbering was fixed so the rule is citable.
- Everything else: honoured, unchanged.

### Discovered traps for later phases

- **T16 (new)** -- extraction timing. `04` section 9.2 step 12 said extraction ran inline "in the
  same request"; `06` models it as a persisted per-upload state that must be terminal *before* the
  assistant request. Consequence for Phase 2/5: build extraction into the upload path, not the
  assistant turn. Not covered by the plan's original T1-T15.
- **I-06** -- the brief viewer has no byte-serving route. Bites Phase 5.
- **I-09** -- the shell is PowerShell 5.1, not 7. Two concrete failure modes cost time this session
  and will cost more without the notes in `05-ISSUES.md`.
- **I-07** -- the repository is not publicly readable. This is a *submission* risk, not a code risk.
- **T17 (new)** -- .gitignore was silently dropping the session log from every clone. Fixed here, but the general lesson is that a file existing locally is not evidence that it is committed: run git check-ignore -v on any new deliverable path.

### What I could not verify

- **Public visibility of the GitHub remote.** An anonymous fetch returns 404, which does not
  distinguish "private" from "not pushed to a public repo". Settled by a human checking the GitHub
  visibility setting (I-07).
- **Whether `gh`/`vercel` are still absent.** `18` section 2 says so; Session 00 did not re-check.
- **Anything about `app/` behaviour.** It does not exist. No typecheck, lint, test, migration or
  boot claim in this log is backed by a run, and none is made.
- **The Gemini key's quota remaining.** One 200 and one 400 prove reachability and shape, not
  headroom for a build session. The `429` path is therefore untested.
- **Cost.** Three live calls were made; token usage came back (`total_thought_tokens: 69` for a
  one-token answer at `low`), but no billing figure was checked.

## Session 00b - Phase 0 follow-up: public repo verified, Phase 1 specs extracted - 2026-10-04

**Phase:** 0 (follow-up)   **Status:** complete
**Spec docs read:** `01`, `04` sections 2-3, `11` WP-01, `06`, `05`, `17` (targeted)
**Commit range:** `3654c28`..this commit   **Tag:** none (no phase boundary crossed)

### Delivered (with evidence)

| Item | Evidence |
|---|---|
| Phase 0 pushed to the public remote | `git push origin main` -> `da00f71..3654c28  main -> main` |
| I-07 resolved | anonymous `GET api.github.com/repos/SharlEclair/rmit-hackathon` -> HTTP 200, `"private": false`, `"visibility": "public"` |
| Runtime facts recorded | Node 24.15 executes `.ts` directly and `node --test` discovers `*.test.ts` (both probed); registry: next 16.3.8, react 19.3.0, tailwind 4.3.3, eslint 10.12.0 |
| Phase 1 spec extracts prepared | `.local/spec/{schema.md,api-contracts.md,guardrail.md}` -- 33 tables, the 64-route index, the 53 golden cases. Gitignored, local-only, derived (not normative) |

### Not delivered, and why

- **No `app/` code and no Phase 1 work** -- the owner is starting Phase 1 in a separate chat window.
  Verified afterwards: `Test-Path app` -> `False`.

### Decisions taken

- **None.** No register row was added; nothing here changed product or architecture behaviour.

### Invariants touched

- **All honoured, unchanged.** This follow-up added documentation and read-only extracts only.

### Discovered traps for later phases

- **T18** -- the schema's two circular foreign keys and the required creation order.
- **T19** -- `06` section 6.3's `text`+`CHECK` enums are normative over `CREATE TYPE`; three
  `UNIQUE ... WHERE deleted_at IS NULL` specs are partial unique indexes; `embedding` stays a
  separate migration.
- **I-15/I-16/I-17** -- the ingestion-job table is still undefined, `expectedRevision` has no column
  to live in, and `assignment_sources.mime_type`'s CHECK contradicted **D57**.

### What I could not verify

- **That the spec extracts are complete.** They were produced by three read-only passes over
  `docs/05`, `docs/06` and `docs/17` and spot-checked, but no one has executed them, and they are
  gitignored so they cannot be reviewed from a clone. Anything a Phase 1 session takes from
  `.local/spec/` must be checked against the normative doc first.
- **That no Phase 1 artefact exists.** Verified `app/` absent, but a future session should re-run
  section 1 of `01-STATE.md` rather than trust this line.

---

## Session 01 - Phase 1: skeleton, schema, demo fixture and auth - 2026-10-04

**Phase:** 1   **Status:** in progress (entry written before the first commit, per
[`00-README.md`](00-README.md) step 6)
**Spec docs read:** `AGENTS.md`, `00-INDEX`, `01-DECISIONS` (sections F, I), `18` (sections 1-7),
`handoff/00`-`handoff/06`, `04` sections 2-3, 5.3-5.4, 9, 11-12, `11` WP-01..WP-03, `12` sections
2-4, `06` section 5.4/5.5.8, `17` section 6, `.local/spec/schema.md` (sections 0-8)
**Commit range:** `9dccd0f`..this session   **Tag:** `phase-01-complete` (on exit)

### Entry re-verification (protocol step 5)

Ran `01-STATE.md` section 1 before any work. **One benign divergence:**

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| `git log --oneline -3` | 3654c28 near HEAD | `9dccd0f`, `3654c28`, `da00f71` | **divergence, benign** -- `9dccd0f` is the Session 00b follow-up recorded in this log |
| `git status --porcelain` | clean | empty | match |
| `git tag` | `phase-00-complete` | `phase-00-complete` | match |
| `git remote -v` | origin = SharlEclair/rmit-hackathon | match | match |
| `Test-Path app` | False | False | match |
| `Test-Path docs/fixtures` | False | False | match |
| `Get-Service postgresql-x64-18` | Running | Running | match |
| `node -v` / `pnpm -v` | v24.x / 12.x | v24.15.0 / 12.4.2 | match |
| `$PSVersionTable` | 5.1 | 5.1.26100.9549 | match |
| `(Get-ChildItem docs/handoff).Name` | 8 entries | 8 | match |
| `psql ... select count(*) from information_schema.tables` | (not previously recorded) | **0 tables in `public`** | new fact: schema is genuinely unstarted |

### Planned scope (declared before work, per the phase plan)

Phase 1 is **WP-01 + WP-02 + WP-03** (`18` section 5): walking skeleton, data model and demo
fixture, authentication. Not in scope: the LLM adapter (WP-04/WP-05), the guardrail (WP-08), and
every student/tutor surface.

### Divergences found on entry and their resolutions

1. **Migrations: `drizzle-kit` vs a committed-file runner.** `04` section 2.1 says migrations are
   "generated by drizzle-kit", and section 2.3 rule 2 says `pnpm db:migrate` runs "drizzle-kit";
   `11` WP-01 requires `app/src/lib/db/migrate.ts` as a "Migration runner over
   `app/src/lib/db/migrations/*.sql`" plus a committed `0001_baseline.sql`. Recorded as **D74**
   rather than silently implemented one way.
2. **Tailwind v4 vs `app/tailwind.config.ts`.** `04` section 2.2 pins `tailwindcss 4.3.3` (CSS-first
   `@theme`), while `17` sections 4.6/6.3 expects a config file that *replaces* default theme keys
   and `src/styles/globals.css` importing four token files. The reconciliation `01-STATE.md` section
   5 item 3 demanded is recorded as **D75**.
3. **`HealthResponse` is referenced and never defined (`06` section 5.4, I-03).** WP-01 builds the
   route that returns it, so it is defined here (**D76**) and added to `06` section 5.5 in the same
   commit, per standing agreement 9.
4. **No lint stack survives the `typescript 7.0.2` pin.** Every package in the `typescript-eslint`
   family **aborts on import** when the installed TypeScript major is >= 7, so `eslint-config-next`
   cannot load; and `@babel/eslint-parser` supports `eslint ^7 || ^8 || ^9` only, so eslint 10 is
   also unusable. Recorded as **D78** with the chosen stack and the rejected alternatives.
5. **`04` section 9.1's "server-side session row" has no table.** `06` defines no session entity
   anywhere, and WP-03's own acceptance criterion requires a stateless token that survives a
   restart. Recorded as **D79**.
6. **`.local/spec/schema.md` is wrong on ambiguity `A1`.** It claims `06` section 4.6 classifies
   `queries` as pseudonymous; 4.6 classifies it as **identity-bearing**, which is what D50 requires.
   The extract contradicts itself here as well. A1 is void. This is the second time a `.local/spec/`
   claim was wrong on re-check, so a trust note was added to `01-DECISIONS.md` section J. `A2` was
   genuine and became **D80** (`06` section 7.2.2 corrected to match D57).

### WP-01 -- delivered, with evidence

| Item | Evidence (command + observed result) |
|---|---|
| 26-file `app/` tree | `git show --stat 9c84ef8` -- `app/package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.env.example`, `README.md`, `compose.yaml`, `pnpm-workspace.yaml`, `scripts/check-c8.mjs`, `src/app/{layout,page}.tsx`, `src/app/api/health/route.ts`, `src/lib/config.ts`, `src/lib/api/types.ts`, `src/lib/db/{client,migrate}.ts`, `src/lib/db/migrations/0001_baseline.sql`, five files under `src/styles/` |
| `pnpm typecheck` passes | no `error TS` line; `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` all on |
| `pnpm lint` passes | `eslint .` clean, then `check-c8.mjs` -> `C8 import/endpoint gate: ok` |
| `pnpm db:migrate` applies then no-ops | run 1 -> `apply 0001_baseline` / `1 applied, 0 already applied`; run 2 -> `skip 0001_baseline (already applied)` / `no pending migrations (1 already applied)`; ledger read back with `psql ... select version, name from schema_migrations` -> one row, `0001 | baseline` |
| Migration-head guard aborts | with a pending `0002_probe.sql` present, `tsx ... migrate.ts --check` -> `MIGRATION_HEAD_MISMATCH: 1 migration(s) not applied: 0002_probe`, exit code **78** |
| Checksum immutability guard fires | after appending one comment line to the applied `0001_baseline.sql`, `pnpm db:migrate` -> `migration 0001_baseline.sql changed after it was applied (checksum mismatch)`, exit code 1. File restored and the runner then reported `no pending migrations` again |
| `pnpm dev` serves the skeleton | `/` -> HTTP 200; the stylesheet link resolves and the CSS asset is served, 5935 bytes (Tailwind v4 + `@config` + the four token imports all compile) |
| `/api/health` reports up | `{"ok":true,"db":"up","llmProvider":"gemini","commit":"9dccd0f"}` |
| `db: "down"` without crashing (WP-01 acceptance) | with `DATABASE_URL` removed from the local `.env`, `/api/health` -> `{"ok":false,"db":"down","llmProvider":"gemini","commit":"9dccd0f"}` and `/` still returned HTTP 200 from the same live process. `.env` restored afterwards |
| `pnpm build` compiles | `Compiled successfully in 7.8s`; routes `/` (dynamic), `/api/health` (dynamic), `/_not-found` (static) |
| `pnpm start` runs the head check then serves | `migration head matches (1 applied)`, then `/api/health` -> `{"ok":true,"db":"up",...}` and `/` -> 200 (`04` section 5.4, last line) |
| `.env`, `node_modules`, `.next` are untracked | `git status --porcelain --untracked-files=all` for `app/` lists exactly the 26 intended files; `git check-ignore -v` resolves `app/.env` to `.gitignore:10`, `app/node_modules` to `.gitignore:55`, `app/.next` to `.gitignore:57` |

### WP-01 -- decisions and their rejections

- **D74** migrations: rejected `drizzle-kit` as the runner, because its journal cannot express
  `text` + named `CHECK` (section 6.3), the two circular FKs (section 8.2), the partial unique
  indexes, the `DO` block or the two views without the SQL being hand-edited anyway.
- **D75** Tailwind: rejected dropping `app/tailwind.config.ts` in favour of pure `@theme`, because
  `17` sections 6.2/6.3 and `components.json` both name that path and gate G5 inspects it.
  Token *values* are deliberately not seeded: `17` section 6.1 rule 2 forbids inventing a value.
- **D78** lint: rejected pinning `typescript` back to 6.x (7.0.2 is available, so `04` section 2.2
  rule 3 does not permit moving the pin) and rejected installing a second, older TypeScript for the
  linter alone (two compilers can disagree about the same code). Cost paid: no type-aware lint
  rules. Compensating control: `tsc --noEmit` with `strict` plus the two unused-symbol flags.
- **D77** `DATABASE_URL`: the one place `04` section 11's "a missing required variable aborts" is
  relaxed, because WP-01's acceptance criterion cannot be satisfied otherwise. Recorded rather than
  implemented silently.

### WP-01 -- what was added beyond the packet's file list, and why

- `app/pnpm-workspace.yaml` -- pnpm 12 no longer reads `package.json`'s `pnpm` field, and it refuses
  to install at all until `esbuild` and `unrs-resolver` build scripts are explicitly allowed. Both
  names carry a reason in the file, because that setting grants install-time code execution in a
  public repository.
- `app/scripts/check-c8.mjs` -- `04` section 5.9 requires **two** C8 checks, and the second one (a
  raw provider endpoint or bearer header outside `src/lib/llm/`) is not expressible as an ESLint
  rule. Wired into `pnpm lint`.
- `pdfjs-dist@6.3.289` added to `app/package.json` -- the pinned extractor, added early so the
  demo fixture's "text-layer PDF" claim (trap **T8**) can be verified with the real reader rather
  than asserted. WP-04 needs the same package.
- `app/src/lib/api/types.ts` -- the home for the response types I-03 says to define when their route
  is built.

### WP-02 -- delivered, with evidence

Work split into three independent tracks (fixtures, data layer, seed) because they touch disjoint
files. Each was verified by a command, and the load-bearing claims were then re-verified by the
Lead against the database rather than accepted from the track's own report.

| Item | Evidence (command + observed result) |
|---|---|
| 10 migrations, 33 tables, 2 views, 33 triggers | `drop schema public cascade` / `create schema public`, then `pnpm db:migrate` -> `apply 0001_baseline` ... `apply 0010_updated_at_triggers` / `10 applied, 0 already applied`. Read back: 33 project tables plus the runner's `schema_migrations` (34 base tables), 2 views, 33 `trg_*_updated_at` triggers, 8 partial indexes, **0** `CREATE TYPE` enums |
| Both circular FKs resolved (T18) | `select conname from pg_constraint where conname in ('fk_assignments_current_structure','fk_discussion_threads_first_post')` -> both present; `fk_discussion_threads_first_post` is `condeferrable=t, condeferred=t, confdeltype=n` (ON DELETE SET NULL, reading A9) |
| `schema.ts` has not drifted from the SQL | `pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts` -> `schema drift: none (33 tables, 444 columns)`. **This gate caught its own bug first:** it counted the two views as tables and failed on a correct schema; the query now joins `information_schema.tables` and filters `BASE_TYPE` |
| The fixtures are real text-layer PDFs (T8/T9) | `pdfjs-dist@6.3.289` on `docs/fixtures/demo-brief.pdf` -> 4 pages, 7788 extracted chars, contains the word-count requirement, `/concurren/i` absent; `demo-rubric.pdf` -> 3 pages, 5214 chars, no concurrency wording. Re-checked from a **fresh clone**, which is the only check that catches T20 (below) |
| Fixtures are deterministic | three runs of `node app/scripts/make-fixtures.mjs`, two from the repository root and one from `app/`, produced byte-identical outputs (SHA-256 per file) |
| Cohort shape matches T8 | 37 students, 5 milestones, `M3` the only milestone above **both** thresholds, `M2` with 3 contributors (below the floor of 5) |
| **Trap T1 proven from the database, not from the fixture** | Per-student `avg` then `avg` of those, recomputed in SQL: `2609.067 / 2116.333 / 5755.138 / 2303.500 / 2752.833` seconds against `cohort-seed.json`'s `2609.0667 / 2116.3333 / 5755.1375 / 2303.5 / 2752.8333`. Identical for all five. Contributors 10 / 3 / 20 / 14 / 18 |
| Question volume matches D49 and the oracle | `queries` per milestone -> `4 / 2 / 18 / 6 / 6`; flagged discussion posts -> **0**, so the totals are the Query half alone and the fixture's `seededQuestionCount` values hold exactly |
| Analytics identity is one-way and complete | 503 events, all with `subject_ref ~ '^[0-9a-f]{32}$'` (503/503 well-formed), 20 distinct subjects, event types `checklist_item_started/completed/reopened` and `query_created` only |
| No identity column can have leaked into analytics | `information_schema` reports **0** of the 13 column names on the prohibition list (A-ID-6) |
| Provenance on every AI row | `count(*) filter (where origin='ai' and provenance is null)` -> 0 on `milestones`, `checklist_items`, `requirement_nodes`, `rubric_sections` and `ai_policy_rules` |
| Gate G1 now shows a student content | `milestones` PUBLISHED joined through the current structure and the published assignment -> **5** (it was **0** before the D81 correction) |
| Sources built from the committed PDFs | `assignment_sources` -> brief `application/pdf` 4 pages 12661 bytes 26 chunks; rubric `application/pdf` 3 pages 9553 bytes 24 chunks; ai_policy `text/markdown` 9037 bytes 39 chunks; all `extraction_status='extracted'` |
| The derived Map edge view returns rows | `select count(*) from v_rubric_milestone_edges` -> 15 |
| **Seed idempotency, database-wide** | `pnpm db:seed` run 1 -> `TOTAL 570 / 0`; run 2 -> `TOTAL 0 / 570`. A single JSON object of **every** base table's row count was captured before and after; the two are identical (`1546689934` both times) |
| Metrics are not seeded (D67, T7) | `milestone_metrics` and `assignment_metrics` both 0 rows -- WP-11 computes them from `analytics_events` |
| `tests/db` exists and passes | `pnpm test -- tests/db` -> 15 passed. It is **static** by design: `12` section 3.7 requires `pnpm test` to pass with no network, so a DB-backed suite would break the gate on a reviewer's machine. It encodes T18 and T19 as assertions over the committed SQL |

### WP-02 -- the six defects this session found, and where each is recorded

| # | Defect | Recorded as |
|---|---|---|
| 1 | `11` WP-02's gate queried `milestones.status`, a column that does not exist | **I-18** (resolved) |
| 2 | `11` WP-02's acceptance called `publication_status` a Postgres enum, contradicting `06` section 6.3 and trap T19 | corrected in `11` |
| 3 | The gate's "at least 4 **approved** milestones" is the wrong predicate: G1 needs PUBLISHED, and the seeded state was half-published -- a `published` assignment with six artifact kinds PUBLISHED and its milestones only APPROVED | **D81**, **I-21** (resolved) |
| 4 | `.local/spec/schema.md` ambiguity A1 asserted a `06` section 4.6 classification that 4.6 does not make | trust note in `01-DECISIONS.md` section J; corrected in `0006_queries_faq.sql` |
| 5 | The demo fixture's activity was claimed (by this session) to predate publication. **It does not:** `events_before_publish` = 0 | **I-22**, withdrawn with the query that disproves it |
| 6 | The "37 synthetic students" contract can only hold if the interactive demo account is one of the 37 | **D82**, remainder in **I-23** |

### WP-03 -- delivered, with evidence

| Item | Evidence (command + observed result) |
|---|---|
| Unit tests | `pnpm test -- tests/auth` -> 37 passed in 2 files (27 session, 10 password) |
| The gate, run live against `pnpm dev` + Postgres, with the **seeded** accounts | See the table below |
| Middleware redirect observed without following it | `/tutor` and `/student` with no cookie, `-MaximumRedirection 0` -> **307** each |
| A valid session reaches a protected route | `/tutor` with a real tutor cookie, `-MaximumRedirection 0` -> **404** (no `(tutor)` page exists yet), i.e. the gate passes a valid session through rather than over-blocking |
| Logout | `POST /api/auth/logout` with a real cookie jar -> **204**, and the session is then **401** |
| Tamper rejection | last-char flipped, first-char flipped, truncated, and empty token -> **401**, **401**, **401**, **401** |
| Rate limit | an 11th attempt from one IP -> **429** with `Retry-After: 600`, enforced before the password comparison |
| Anti-enumeration | a wrong password and an unknown email both -> identical `401 UNAUTHENTICATED` with the same message |
| Cookie attributes | `aa_session` present, `HttpOnly=True`, `Secure=False` in development, expiry exactly 12 h after issue |

### The auth harness bug that cost a round trip (recorded in I-09)

The first live run reported `logout -> 401` and `/tutor -> 200`, both of which look like product
defects and neither was. **PowerShell 5.1 silently drops a `Cookie` header passed through
`Invoke-WebRequest -Headers`, and `Invoke-WebRequest` follows a `307` automatically.** Re-running
with `-WebSession` (a real cookie jar) and `-MaximumRedirection 0` produced 204 and 307. Appended to
`05-ISSUES.md` **I-09** so the next session does not repeat it.

### Decisions taken

- Migrations are `NNNN_<slug>.sql` applied by `src/lib/db/migrate.ts` with a checksum ledger --
  **D74** -- `04`, `11`, `06` -- recorded because `04` section 2.1/2.3 and `11` WP-01 disagree.
- Tailwind v4 CSS-first with `@config` -- **D75** -- `04` section 2.2, `17` sections 4.6/6.2/6.3.
- `HealthResponse` defined -- **D76** -- `06` section 5.5.15, closing half of I-03.
- `DATABASE_URL` absence is degraded, not fatal -- **D77** -- `04` sections 5.4, 11.
- The lint stack is eslint 9 + `@babel/eslint-parser` -- **D78**.
- The session is a stateless signed token; revocation is absent -- **D79**.
- `assignment_sources.mime_type` accepts D57's full set -- **D80** -- `06` section 7.2.2 corrected.
- The seeded demo assignment is fully PUBLISHED and the gate predicate accepts both -- **D81**.
- The 37-student cohort includes the interactive demo account -- **D82**.
- Twelve migration-author readings for `06`'s silent points -- **H4** in `02-DECISIONS.md`.

### Invariants touched

- **I1 (the guardrail never does the assignment)** -- honoured; untouched. Phase 1 wrote no model
  call and no assistant path.
- **I2 (nothing AI-generated is student-visible until a tutor approves it)** -- honoured, and
  **strengthened rather than weakened** by D81: the seed's structure is PUBLISHED, which is reachable
  only through APPROVED (`06` section 3.2 transition 7), and the approval stamps survive the publish.
  The `AI generated - requires tutor approval` badge is a WP-06 deliverable and does not exist yet.
- **I3 (the brief is verbatim)** -- honoured: `source_chunks.text` is the extractor's own output,
  never rewritten, and the view/UI that would paraphrase it does not exist yet.
- **I4 (a refusal is a 200)** -- not exercised; the assistant route is Phase 5's.
- **C7 (secrets)** -- honoured and actively checked: `git diff --cached` was scanned before every
  commit; no key-shaped string is staged; `.gitattributes` was corrected so the lockfile is diffable
  and therefore reviewable again (a `-diff` attribute would have blinded that check); the only
  credential in the tree is `DEMO_PASSWORD = 'demo1234'`, which `12` section 3.6 publishes.
- **Newly accepted risk:** session revocation has no storage -- **I-20**.

### Discovered traps for later phases

- **T20 (new)** -- a missing `.gitattributes` silently corrupted the committed PDFs. This session
  caused it, found it, and fixed it; the clue was git's own "LF will be replaced by CRLF" warning on
  a `.pdf`. A working-tree hash proves nothing here, because the conversion happens on the way into
  the object store. Verified with a fresh clone.
- **T21 (new)** -- a verification gate quoted from a doc can name a nonexistent column. It bit twice
  in one packet (`milestones.status`, and `.local/spec`'s A1). Run a gate before trusting it.
- **Vitest does not read `tsconfig.json` paths** -- every test that transitively imports `@/...`
  failed to resolve until the alias was added to `app/vitest.config.ts`. Fixed here; recorded in
  `04-INTERFACES.md` section 4.
- **Every `typescript-eslint` package aborts on `typescript` >= 7**, and `@babel/eslint-parser` is
  incompatible with eslint 10. A phase that wants a type-aware lint rule must change the pin and
  re-verify, not add a plugin.
- **PowerShell 5.1 drops a `-Headers` `Cookie` and follows redirects** -- I-09.
- **A "37 students" count and an interactive demo account cannot both be literal** unless the account
  is one of the 37 -- **D82**.
- **The demo fixture cannot discriminate T1's two-stage mean from a flat mean** -- **I-24**; WP-11's
  test must supply the discriminating case.

### Not delivered, and why

- **Any LLM call, the storage driver, and any ingestion pipeline** -- WP-04/WP-05, by design. The
  seed writes fixture bytes straight to `STORAGE_LOCAL_DIR`, because `src/lib/storage/` does not
  exist yet. **Consequence:** a later phase must not assume the storage interface has ever been
  exercised, and `assignment_sources.storage_key` values are `sources/<kind>/<sha256>` rather than
  anything the future driver produces.
- **The guardrail and its 53-case golden set** -- WP-08, Phase 3, by design. It is the highest-risk
  packet and the plan's own instruction is that it must not wait.
- **`app/tests` coverage of the ingestion and analytics behaviour** -- `tests/db` is static, so the
  validator rules that cannot be `CHECK`s (the requirement-substring rule, `CHECKLIST_IMPERATIVE`,
  `WEIGHT_NOT_FOUND`) are satisfied by construction and checked by hand, not by a test.
- **The five undefined response types other than `HealthResponse`** -- still **I-03**, each to be
  defined when its route is built.
- **`ingestion_jobs`** -- still absent and still **I-15**; D60/D71 assign it to WP-04/WP-05. The seed
  creates no row for it.
- **`app/src/lib/auth/api-errors.ts` was not relocated to `src/lib/api/`** -- **I-19**, reassigned to
  Phase 2 with the reason recorded.

### What I could not verify

- **The Gemini path at runtime.** Phase 1 made no provider call. `LLM_PROVIDER=gemini` is validated
  by `config.ts` and reported by `/api/health`, but no adapter exists, so nothing has exercised the
  key, the `03`-style thinking levels, or the D73 call shape since Phase 0's three probes.
- **`pnpm start` in production.** The migration-head check and the served response were verified
  locally, but not with `NODE_ENV=production`, so the `Secure` cookie attribute and the production
  abort behaviour are asserted by unit test and code reading only.
- **Any surface other than `/`, `/login` and the three auth routes.** No `(tutor)` or `(student)`
  page exists, so the middleware's pass-through was verified by observing a `404` rather than a
  rendered page, and `FORBIDDEN_ROLE` has no live route to return it from.
- **The seed against a *second* Postgres version.** Everything was verified on 18.6 (D66). Path A
  pins `postgres:16-alpine` and is untested.
- **That the batch of `.local/spec/` extracts is complete.** Two of its claims were wrong on
  re-check (A1, and the "the doc's CHECK includes plain text" claim); the rest were taken as
  reported. Anything a Phase 2 session takes from `.local/spec/` must be checked against `docs/**`.
- **Cost.** No model call was made, so no billing figure exists. Phase 0's three probes remain the
  only spend on record.
- **The full acceptance-criteria checklists** in `11` WP-01/02/03. Each packet's *verification gate*
  was run; the individual checkboxes were not all re-walked one by one, and the ones that were are
  named in this entry rather than marked in `11`.

---

## Session 02 - Phase 2 (provider adapter, storage, extraction, Assignment Analyst) - 2026-10-04

**Phase:** 2   **Status:** complete, with one item unverified (the live provider run -- **I-35**)
**Spec docs read:** `AGENTS.md`, `00-INDEX`, `handoff/00-README`, `handoff/01`-`06`, `18` S5/S7,
`11` WP-04/WP-05, `04` (full), `06` S3/S5.3/S5.4/S5.5.8/S5.5.10/S6/S7, `05` S6, `.env.example`
**Commit range:** <from>..<to>   **Tag:** <tag>

### Re-verification on entry (`00-README.md` step 5)

| Claim in `01-STATE.md` | Command and observed result | Verdict |
|---|---|---|
| HEAD is the Phase 1 seed commit | `git log --oneline -1` -> `61c2a04 docs(handoff): correct 01-STATE after the Phase 1 push` | **Diverges from the literal line, explained by the same file**: the tag section already records a post-tag correction commit. Not a stale handoff |
| `git status --porcelain` clean; two tags | `git status --porcelain` -> empty; `git tag` -> `phase-00-complete`, `phase-01-complete` | Confirmed |
| `app/` and the fixtures exist | `Test-Path app` -> `True`; `Test-Path docs/fixtures/demo-brief.pdf` -> `True` | Confirmed |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | no `error TS`; `C8 import/endpoint gate: ok`; `Test Files 3 passed (3) / Tests 52 passed (52)` | Confirmed |
| Migrations idempotent; no schema drift | `pnpm db:migrate` -> `no pending migrations (10 already applied)`; `verify-schema.ts` -> `schema drift: none (33 tables, 444 columns)` | Confirmed |
| Seed counts | 37 students, 5 APPROVED/PUBLISHED milestones, 69 chunks | Confirmed |
| Shell / Node / pnpm / Postgres | PowerShell 5.1.26100.9549, node v24.15.0, pnpm 12.4.2, service `postgresql-x64-18` Running | Confirmed |

One stale line found and reported rather than fixed in place: `01-STATE.md` section 1's verification
block still expects `git log --oneline -1` -> `3a47eaf`, while the file's own **Tag** paragraph
explains that a correction commit lands after the tag. The block is corrected in this session's
rewrite.

### Intent for this session

Implement Phase 2 as `18` section 5 defines it -- `src/lib/llm/`, `src/lib/storage/`, extraction,
the Assignment Analyst and the ingestion job (WP-04 + WP-05) -- and freeze
`src/lib/llm/types.ts`, `src/lib/llm/schema.ts` and the `AiCapability` union for Phase 3, which is
file-disjoint and must not wait.

Explicitly in scope, from the register rather than from the plan's summary:

- **T6 / D68**: six `AiCapability` members including `attachment_extraction`; extraction runs at
  upload, `LLM_THINKING_EXTRACTION`, its own budget counter.
- **D73**: the Gemini call shape is `POST {base}/v1beta/interactions`, `x-goog-api-key`,
  `store: false`, `generation_config.thinking_level`, `steps[]` -> `model_output`.
- **D60 / I-15**: a Postgres-backed `ingestion_jobs` row plus `POST`/`GET .../ingest`, and the
  `06` table definition D60's builder note demands.
- **I-19**: relocate the house error envelope to `src/lib/api/errors.ts` and widen `ErrorCode`.
- **T7**: analytics event emission stays with the feature that owns the event; this phase emits none
  for checklist/assistant/queries/posts, but the ingestion job must not write metrics.
- **I-21 / D81**: the seed's fully-PUBLISHED state is left alone.
- **T20**: any new binary fixture lands in `.gitattributes` before it is committed.

Out of scope by construction: the guardrail (Phase 3), review/approval (Phase 4), any student- or
tutor-facing page, and `expectedRevision` storage (**I-16**).

### Outcome -- delivered, with evidence

| Item | Evidence (command + observed result) |
|---|---|
| `app/src/lib/llm/` (11 files) | `types.ts` (the frozen `04` S5.2 contract, six capabilities), `errors.ts`, `schema.ts` (frozen; 6 structured schemas), `prompt.ts`, `gemini.ts`, `deepseek.ts`, `mock.ts`, `budget.ts`, `fixtures/analyst-demo.ts`, `index.ts` |
| The call shape works live (D73, D89) | `POST /v1beta/interactions` with `input: <string>` + `system_instruction` -> **HTTP 200**, `status: "completed"`, a `thought` step and a `model_output` step; `input: [{role, content}]` -> **400** "use step_list input format instead of turn_list"; `input: [{role, parts}]` -> **400** "Unknown parameter 'parts'"; a structured call -> **200** whose `model_output` text was exactly `{"ok": true}`; `nullable: true` accepted (**200**) |
| `app/src/lib/storage/` (4 files, driver-delegated) | `pnpm exec vitest run tests/storage` -> **2 files, 80 passed** (local 54, s3 26). Key validation rejects `../escape`, `/abs`, `a/../../b`, `a\\b`, NUL and space; local `signedUrl` throws `SIGNED_URL_UNSUPPORTED` (I-06, T12) |
| `app/src/lib/extract/` (5 files + 3 test files) | `pnpm exec vitest run tests/extract` -> **3 files, 38 passed**. `demo-brief.pdf` -> 4 pages, 7787 chars, `hasTextLayer: true`, `/concurren/i` absent (T9 holds). DOCX/PPTX read from a hand-built zip with real deflate; **CRC-32 verified** per read entry (T28) |
| Migration `0011` + the two new tables | `pnpm db:migrate` -> `apply 0011_ingestion_jobs` / `1 applied, 10 already applied`; `scripts/verify-schema.ts` -> `schema drift: none (35 tables, 464 columns)`; `tests/db/migrations.test.ts` updated for 35 tables and passing |
| Offline ingestion end to end (WP-04's gate) | `LLM_PROVIDER=mock pnpm exec tsx scripts/ingest-once.ts --fixture demo` -> `ok: true`, `status: succeeded`, `stage: S7`, counts `sources 2 / chunks 19 / requirements 12 / rubricSections 4 / milestones 6 / checklistItems 18 / faqEntries 3 / policyRules 3 / findings 1` |
| The run's database state (SQL, on the run above) | `assignments.status = in_review`; `source_chunks` 19 with **0 null page anchors** and range **1..4**; `ingestion_jobs` `succeeded/S7/8`; 12 requirements with **0** missing provenance; 6 milestone-requirement links; **0** checklist items matching an implementation verb; **0** student-visible artifacts; `milestone_metrics` **0 rows** (T7, D67); `llm_call_counters` 1 scope (the ingestion run); `audit_logs` 1 row |
| The whole non-guardrail suite | `pnpm exec vitest run tests/llm tests/ingest tests/extract tests/storage tests/auth tests/db` -> **13 files, 232 tests, all passed** |
| Typecheck and lint on Phase 2's own files | `pnpm exec tsc --noEmit` -> **0 errors outside `src/lib/guardrail/**`**; `pnpm exec eslint <all Phase 2 paths>` -> exit 0; `node scripts/check-c8.mjs` -> `C8 import/endpoint gate: ok` |
| Routes and startup validation | `src/app/api/tutor/assignments/[assignmentId]/{sources,ingest}/route.ts`, `src/app/api/student/uploads/{route.ts,[uploadId]/route.ts}`, `src/instrumentation.ts`; all typecheck and lint clean. **Not exercised over HTTP**: no browser round trip was run (see "What I could not verify") |
| I-19 closed | `src/lib/auth/api-errors.ts` deleted, four importers re-pointed, `ErrorCode` widened to the sixteen codes of `06` S5.3 (**D94**) |

### Outcome -- the three doc-vs-reality corrections this phase made

1. `11` WP-04's gate asserted `assignments.status = 'AI_GENERATED'`. That value is **not in the
   column's CHECK** (`06` S7.2.1) and is a `publication_status`, not an assignment status
   (`06` S3.6) -- a T21-class gate that cannot run. Corrected to `in_review`, and `min(page)`/
   `max(page)` to `page_from`/`page_to`.
2. `11` WP-04's gate uploaded "through the UI", which does not exist until WP-06/WP-07. The gate now
   drives the same rows through `scripts/ingest-once.ts`.
3. `tests/db/migrations.test.ts` asserted `create table ingestion_jobs` must **not** exist. That was
   correct at Phase 1 and is now the stale side: `06` S7.8 defines the table and D60 assigns it to
   WP-04/WP-05. The assertion is inverted with a comment recording why.

### Decisions taken

- **D89** Gemini adapter calls the Interactions REST shape with `fetch`; no vendor SDK.
- **D90** the mock is exact-key registry first, committed per-prompt templates second, refusal on a miss.
- **D91** the provider-facing JSON schema is a hint; the zod schema is the contract (bounds dropped).
- **D92** attachment extraction at upload for all three modalities, and the guardrail scan left `pending`.
- **D93** grounding by position (`sourceChunkRef`), resolved by the pipeline; an unresolvable cite is dropped.
- **D94** the error envelope moves to `src/lib/api/errors.ts`; `ErrorCode` complete (closes I-19).
- **D95** per-pass provider failure continues the run; a budget/config error aborts; two failed passes fail it.
- **D96** Analyst pacing is the caller's (`paceMs`), not a hidden adapter sleep.
- **D97** two narrower-than-schema typings widened (`publishedByUserId`, `NewAssignmentSource.extractionStatus`).

### Invariants touched

- **I1 (the Assistant never does the assignment)** -- honoured, untouched: Phase 2 built no assistant
  path. The Analyst prompt states the prohibition and `prompt-constraints.ts` rejects an
  implementation-shaped checklist item (0 of 18 in the verified run).
- **I2 (nothing AI-generated is student-visible before approval)** -- honoured and **verified on
  data**: every artifact was inserted `AI_GENERATED` and promoted to `NEEDS_REVIEW` in one
  transaction (transition 1, `06` S3.2), and `select count(*) from milestones where
  publication_status in ('APPROVED','PUBLISHED')` for the new assignment returned **0**.
- **I3 (the brief is verbatim)** -- honoured: `source_chunks.text` is the extractor's output after
  S4 normalisation only, and every requirement's `verbatimText` is checked against the chunk it
  cites before it is written (`VERBATIM_MISMATCH` otherwise, D93).
- **I4 (a refusal is a 200)** -- not exercised; the assistant route is Phase 5's.
- **C6 (uploads are not a route around C1)** -- honoured by **failing closed**: an upload's scan
  status stays `pending` because Phase 2 has no policy engine, so no attachment can join a turn yet
  (D92). Audio and video are refused with `UP5` before storage and before extraction.
- **C7 (secrets)** -- honoured: no key is logged, returned or committed; `describeProviderError`
  reads one bounded `message` field and nothing else; the live probes read the key from `app/.env`
  and printed responses only (the probe scripts live in gitignored `.local/`).
- **C8 (no vendor SDK outside `src/lib/llm/`)** -- honoured trivially: no vendor SDK is installed
  anywhere (D89). `node scripts/check-c8.mjs` -> `ok`.
- **T7 (analytics are written at the point of the event)** -- honoured: the pipeline writes no
  `analytics_events` row and no metric row; verified as `milestone_metrics` 0 rows for the new
  assignment.

### Discovered traps for later phases

- **T27 (new)** -- `pdfjs` transfers (detaches) the buffer it is handed, so a retry on the same
  array fails with a detached-ArrayBuffer error that looks like a corrupt PDF. Pass a copy.
- **T28 (new)** -- deflate has no integrity check: a flipped byte inside a DOCX/PPTX part decodes to
  *different* text, which would have become T1 ground truth. The ZIP reader now verifies CRC-32 on
  every part it returns. Found by the extraction work, fixed in the same session.
- **T29 (new)** -- the seed and the pipeline are two writers of `source_chunks`, and
  `extraction_status = 'extracted'` is not evidence that chunks exist; the pipeline decides from the
  chunk count. Do not "unify" the seed onto the pipeline.
- **T30 (new)** -- the provider's structured-output subset is opaque and its refusal names no field;
  a minimal provider schema plus a strict zod contract is the only workable arrangement (D91).
- **Free-tier ceiling (I-36)** -- 20 requests/day, not just a per-minute limit. Roughly four live
  ingestion runs per day, and the startup probe spends one.

### Not delivered, and why

- **A live, complete Analyst proposal** -- the structured call was refused with a 400 and the daily
  quota ran out before the schema fix could be confirmed (**I-35**). Consequence: WP-05's
  human-readable acceptance ("read the checklist items aloud") has not happened, and Phase 4 should
  not treat the live path as proven.
- **`expectedRevision` storage** -- still absent, deliberately (**I-16**); no PATCH route was added.
- **A guardrail-supplied upload scan** -- Phase 3's; the attachment path therefore cannot complete
  end to end yet (**D92**).
- **`AssignmentResponse` / `ReviewBundleResponse` / the four artifact payloads** -- Phase 4's
  (**I-41**).
- **Any HTTP-level exercise of the four new routes** -- they typecheck, lint and share their
  repository calls with the script that was run end to end, but no multipart request was issued.
  Reason: reaching them needs a live session cookie and there is no `(tutor)` page to upload from;
  issuing one by hand was judged lower value than the schema work that blocked the live path.

### What I could not verify

- **The live structured call.** One `400 invalid_request` before the quota ran out; the minimised
  schema (**D91**) is unconfirmed. `scripts/ingest-once.ts --pace-ms 14000` against `gemini`
  settles it.
- **Any route over HTTP.** No request was sent to `/api/tutor/assignments/*/sources`,
  `.../ingest` or `/api/student/uploads`; the paths they share with the verified script are the
  repository and pipeline layers.
- **The S3 driver against a real endpoint** (**I-37**) and **the DeepSeek adapter at all** (**I-38**).
- **Cost.** The live work spent a handful of small calls plus the probes; the free-tier quota was
  exhausted, and no billing figure exists because there is no billing account.
- **`pnpm test` repo-wide as a single green run.** It is green for 13 non-guardrail files (232
  tests); at the time of writing `src/lib/guardrail/**` and `tests/guardrail/**` are a concurrent
  Phase 3 session's in-flight work, so the repo-wide command was red for files this session does not
  own (**I-34**, T26). The Lead must re-run it once both sessions stop.
- **Whether the provider schema would be accepted at all keyword-by-keyword.** The keyword probe
  confirmed only `nullable` (accepted) before the quota ran out; `baseline-nested-array`,
  `minmaxlength`, `enum`, `numeric-bounds` and `minmaxitems` were 503/429. The minimisation in D91
  is therefore a reasoned reduction, not a measured one.

---

## Session 03 - Phase 3 (the guardrail policy layer and the 53-case golden set) - 2026-10-04

**Phase:** 3   **Status:** complete
**Spec docs read:** `AGENTS.md`, `00-INDEX`, `handoff/00-README`, `handoff/01`-`06`, `18` S5/S5.1/S7,
`11` WP-08 (and S6.2's file-ownership table), `05` (full, 1247 lines), `04` S4/S5.3/S5.4/S9.2,
`06` S5/S7.2.11, `01-DECISIONS.md` sections F/H/I/J, `.env.example`
**Commit range:** `61c2a04..bf12a3e`   **Tag:** `phase-03-complete` (applied to the exit commit that
carries this entry)

### Re-verification on entry (`00-README.md` step 5)

| Claim in `01-STATE.md` | Command and observed result | Verdict |
|---|---|---|
| HEAD is the Phase 1 exit commit | `git log --oneline -1` -> `61c2a04`, not the literal `3a47eaf` | **Diverges from the literal line, explained by the same file** (the post-tag correction commit it documents). Session 02 recorded the same divergence |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | clean; `C8 import/endpoint gate: ok`; `52 passed in 3 files` | Confirmed **before** the concurrent session began writing |
| Migrations idempotent; seeded counts | `no pending migrations (10 already applied)`; 37 students, 5 APPROVED/PUBLISHED milestones, **9** `ai_policy_rules` | Confirmed |
| `src/lib/llm/`, `storage`, extraction, the guardrail do not exist | `Test-Path` on each -> `False` | Confirmed at entry. **The first three became true mid-session**: a concurrent Phase 2 session created them in the same working tree |
| Shell / Node / pnpm | PowerShell 5.1, node v24.15.0, pnpm 12.4.2 | Confirmed |

**One environmental divergence, reported rather than worked around.** `pnpm test` failed at entry
with `Error: spawn EPERM` from Vite's `optimizeSafeRealPathSync`, which runs `exec("net use")` on
Windows. The DSH `workspace-write` sandbox denies piped `child_process` stdio, so the failure was the
sandbox, not the suite: `node -e` with the same `exec` reproduced the `EPERM` directly. The same
command under a full-access file sandbox produced `52 passed (52)`. Recorded in section 3 of
`01-STATE.md` as an operational note for the next session. No repository change was made for it.

### Delivered (with evidence)

| Item | Evidence (command + observed result) |
|---|---|
| Twelve guardrail modules, `decide()` the only public entry | `pnpm typecheck` -> no `error TS` under `src/lib/guardrail/`; `pnpm exec eslint src/lib/guardrail` -> exit 0; `node scripts/check-c8.mjs` -> `C8 import/endpoint gate: ok` |
| **All 53 golden cases execute and pass** | `pnpm test -- tests/guardrail` -> **232 passed in 9 files**, 1.44 s, no network, no provider key. The runner asserts `05` section 11.5's own distribution: 30 `REFUSE`, 15 `ALLOW`, 2 `ALLOW_WITH_SCOPE`, 3 `CLARIFY`, 3 `ESCALATE_TO_TUTOR`; no `MODALITY` marker and no skip list |
| The layer semantics are proven by **call counts**, not by verdict comparison | Every `DET` case asserts zero classifier calls; every `DET+EXTRACT` case exactly one extraction call and zero classifier calls; every `MODEL` case exactly one classifier call; every `PICKER` case zero of either. `tests/guardrail/golden-set.test.ts` |
| Refusals cannot hallucinate, leak internals, or drift | `templates.test.ts`: `G01`'s `T-REFUSE` string is byte-pinned; `R1`, `R2`, `R3`, `R9`, `R11`, `R13` hold for all 36 refusal-shaped cases; two cases citing the same primary rule render byte-identically |
| The policy is data, and can only restrict | `policy.test.ts` drives `decide()` with the same turn twice: a view omitting `explain_terminology` -> `REFUSE`/`POL_RESTRICT`; the full view -> `ALLOW`/`A5`. `FLOOR_PROHIBITED` is a subset of `effectiveProhibited` even for a view with `prohibited: []` |
| The **seeded** demo policy maps cleanly (the live path) | `policy.test.ts` + `golden/policy.demo-rows.json` (the nine `PUBLISHED` rows read back with `psql`): `POL_APPROVED`, permitted = `explain_terminology`, `interpret_rubric`, `locate_source`, `quote_source_verbatim`; the two `uploads`-scoped rows become warnings, not capabilities |
| Six real upload fixtures, deterministic, hash-verified | `node app/scripts/make-guardrail-fixtures.mjs` twice -> byte-identical (PNG chunk CRCs verified, `IDAT` inflating to exactly `h*(1+3w)`); `git clone --no-hardlinks` -> all 6 byte-identical to `manifest.json` and the cloned PDF read back **364 chars** through `pdfjs-dist@6.3.289` (**trap T20**) |
| The guardrail is offline by construction | `tests/guardrail/imports.test.ts` reads every file and fails on an import of `node:fs`/network/the DB/storage/a feature; `node:crypto` appears in exactly `normalise.ts` and `post-check.ts`, both for hashing |
| No content in any decision or log row | `log.test.ts` asserts structurally (`FORBIDDEN_LOG_FIELDS`) and behaviourally over every refusing golden case: the serialised decision and log row do not contain the turn |

### Defects this session found in its own work, and how each is recorded

| # | Defect | Found by | Recorded as |
|---|---|---|---|
| 1 | `ai_policy_rules.rule_code` is free-form in `06` but the guardrail computes with `05`'s closed capability vocabulary, so something must map them, and an unmapped assistant-applicable code refuses **everything** for that assignment | implementing `policy-source.ts` | **D83**, trap **T22**, **I-27**-adjacent owner note for WP-05 |
| 2 | `ESC3`/`ESC4` are required by `G31`/`G46` but the heuristic table never defines them | tracing the golden set | **D84**, trap **T23**, **I-32** |
| 3 | `05` section 10.3's worked refusals do not byte-match section 10.1's template | writing `templates.ts` | trap **T24**, **I-29** |
| 4 | Decoding base64 from the casefolded match string silently destroys mixed-case encodings, and recording a `DE9` frame merely because a variant *existed* made every turn containing the digit `4` an "encoding attack" | `G49` failed on the false `DE9`, and the base64 unit test failed on a lowercased decode | trap **T25**; both halves now asserted in `normalise.test.ts`/`rules.test.ts` |
| 5 | A per-clause `H2` missed the canonical request `G01` ("my code ... what is wrong with it?"), and evaluating predicates over the whole phrase turned `working`/`best` into evaluations (`G45`, `G49`, `G16`) | the golden set, on the first run | `handoff/02-DECISIONS.md` **H5** `B3` |
| 6 | Requiring a *capability* mapping for an `ESCALATE_TO_TUTOR` rule made the **seeded demo policy** `POL_INVALID` | `policy.test.ts` | fixed in `policyFromRows`; the failure mode is why the seeded rows are a committed fixture |

### Decisions taken

- **D83** the `rule_code` to capability mapping, with an unmapped assistant-applicable code a hard
  `POL_INVALID`. **D84** `ESC3`/`ESC4` defined. **D85** L3 produces only `UP2 -> SCOPE_LOCATE`; the
  other four scope tokens arrive with L4. **D86** the golden set's data files and runner.
  **D87** the L4 seam is `GuardrailClassifierPort`, not an import of `src/lib/llm/`.
  **D88** refusal copy lives in `src/lib/guardrail/refusal-copy.ts` + `reasons.ts`, not WP-08's
  `src/features/assistant/` path.
- Six implementation readings that change no contract: `handoff/02-DECISIONS.md` **H5** `B1`-`B6`.

### Invariants touched

- **I1 (the Assistant never does the assignment)** -- **honoured and now enforced**. A prohibited
  request is refused by L1 with the rule cited and **zero adapter calls**; 30 of the 53 cases prove
  it, and the `DET` assertions fail if the classifier is consulted.
- **I2 (nothing AI-generated is student-visible before approval)** -- untouched; L1-L3 read only
  `PUBLISHED` policy rules and `T1`-`T3` sources.
- **I3 (the brief is verbatim)** -- honoured: `H8` refuses a paraphrase request (`P9`), and `A4`
  locate/quote is the allowed twin (`G17` vs `G20`/`G33`).
- **I4 (a refusal is a `200`, not an error)** -- **partially exercised**: `decide()` returns a
  decision with `200`-shaped refusal payloads and no error status, but no HTTP route serves it, so
  the status code itself is still Phase 5's to verify.
- **C7 (secrets, no content in logs)** -- honoured and structurally asserted: the log row's type has
  no content field, and no fixture, test or log line contains student text or a secret.
- **N1-N12 (`05` section 2)** -- honoured; N5 is met by the 53 cases plus the per-case POST variant.
- **Newly accepted risk:** the live `UP1`-`UP4` classification of real attachments is unverified
  because no provider is wired (**I-30**); the coverage gate line is unrunnable (**I-31**).

### Discovered traps for later phases

- **T22** a new `ai_policy_rules.rule_code` with no mapping disables the assistant for its
  assignment. **T23** a rule id can be cited by a golden case while the spec never defines it
  (`ESC3`/`ESC4`) -- the case is the contract, the table is the summary. **T24** `05` section 10.3's
  worked refusals do not match section 10.1's template. **T25** base64 must be decoded from the
  case-preserved string, and a `DE9` frame is only real when a decoded variant produced the refusal.
  **T26** a concurrently-running phase makes the repo-wide gates unreadable as evidence, so name the
  failing files and their owner instead of reporting "lint fails".
- **`session 02` ran concurrently.** Phase 3 never imported, read for decisions, or edited its files,
  and claims nothing about its completeness.

### Not delivered, and why

- **The adapter wired to L4.** `GuardrailClassifierPort` is declared and unwired (**D87**), because
  `src/lib/llm/` is Phase 2's and `18` section 5.1 says Phase 3 must not wait for it. **Consequence:**
  the `MODEL` cases prove the *seam* is a genuine enhancement, not that a live model classifies
  correctly.
- **`pnpm test --coverage`.** WP-08's second gate line; no coverage provider is installed and adding
  one is a dependency decision (**I-31**).
- **Live attachment classification.** The `UP` codes are recorded in a manifest (**I-30**).
- **Any HTTP route that serves a decision.** Phase 5's. So `I4`/`T13`'s status-code half stays open.
- **The `R5`/`R6` wording that `05` section 10.3 shows.** Implemented as 10.1's template, recorded as
  **I-29**.

### What I could not verify

- **A live provider call at L4.** None was made: no adapter is wired, so the classifier's behaviour
  against a real model -- including whether it returns schema-valid JSON at all -- is unverified.
  What would settle it: the Phase 5 wrapper, then `pnpm test -- tests/guardrail` with the real
  adapter behind the port.
- **That a real vision/PDF extractor returns the recorded `UP` codes.** The fixtures are real files
  and their hashes are checked, but the codes come from the manifest. What would settle it: point
  `harness.ts`'s extractor at Phase 2's `src/lib/extract/`.
- **The refusal's rendering in a browser.** No UI exists, so `R9`'s word budget and `R13`'s
  byte-equality are asserted on strings, not on a rendered component.
- **`pnpm lint` and `pnpm typecheck` repo-wide.** Both were red at this boundary because of files the
  concurrent Phase 2 session owns (**I-34**). The scoped commands were clean. What would settle it:
  re-run both after the sessions stop.
- **This session's own files under the DSH sandbox's default mode.** Every gate was run with the file
  sandbox at full access, because Vite's config load spawns a child process; whether a
  `workspace-write` reviewer can run `pnpm test` at all is unverified.
- **The full acceptance-criteria checklist of `11` WP-08.** The verification gate and the golden set
  were run; the per-item checkboxes were not all re-walked one by one. The two items that are
  genuinely not satisfied are named above (coverage; live classification), and the status note added
  to `11` WP-08 says so.

---

## Session 04 - Phase 4 (review, approval, state machine, gate rule G1) - 2026-10-04

**Phase:** 4   **Status:** complete, with WP-06's review page and provenance badge **not delivered**
(recorded in `11` WP-06's status note and `05-ISSUES.md` I-44, with the reason)
**Commit range:** `36a3598..0a72123` -- `a509dbd` (the approval boundary), `1077faa` (the live path), `0a72123` (the exit documents)
**Tag:** `phase-04-complete`
**Spec docs read:** `AGENTS.md`, `00-INDEX`, `handoff/00-README`, `handoff/01`-`06`, `18` S5/S5.1,
`11` WP-06 (and S6.2's file-ownership table), `01-DECISIONS.md` (full), `06`
S2/S3.1-S3.7/S5.4/S5.5.7/S5.5.8/S7.2/S8.3/S9.2/S10, `07` S2.2/S2.3/S2.5/S2.6/S7.3/S7.4, `17`
S2/S3/S6/S12, `12` S2.3, `.env.example`

### Intent for this session

Implement Phase 4 as `18` section 5 defines it -- WP-06's review and approval boundary plus gate rule
G1 -- and freeze **the direction of the student-visibility gate** together with the state machine:

- **D22 / `06` S3.2**: the ten legal `publication_status` transitions in one module, and every other
  transition refused with `INVALID_STATE_TRANSITION` (409).
- **I2 / C3**: nothing AI-generated is student-visible before approval; the edit-after-publish
  transition (8) must take an item out of student-visible reads immediately.
- **T3 / `06` S3.4**: gate rule G1 is a **query-layer** predicate -- `PUBLISHED` **and**
  `structure.is_current` **and** `assignments.status = 'published'` -- and an unpublished resource
  named by a student is `404`, never an empty shell.
- **I-16**: `expectedRevision` gets its storage. `06` S5.5.8's `ReviewArtifactResponse.revision` and
  `StructureArtifactPatchRequest.expectedRevision` require a column that no table has, so Phase 4
  adds it (migration `0012`) and records the `06` S7.2 change in the same commit (I-16's own two
  options; this is the one the contract already assumes).
- **I-41**: define `MilestonePayload`, `ChecklistItemPayload`, `FaqEntryPayload` and
  `AiPolicyRulePayload` when the route that returns them is built.
- **I-39**: the review bundle carries `ingestion: null` for "no run ever requested"; the `GET
  .../ingest` route keeps returning 404.
- **I-21 / D81**: one visibility rule, not two. The threshold is **`PUBLISHED`** (G1, D21, `06`
  S3.1); WP-06's gate wording that treats `APPROVED` as the threshold is the stale side and is
  corrected in `11` in this change.
- **T22 / D83**: the policy editor may only offer rule codes that `CAPABILITIES_BY_RULE_CODE` maps,
  and the review bundle surfaces an unmapped code as a `POL_INVALID` risk rather than letting it
  disable the assignment's Assistant silently.

Out of scope by construction: the student workspace routes other than the G1 structure read Phase 4
needs to prove the gate (Phase 5); queries, discussions, moderation, FAQ publishing and analytics
(Phase 6); the analytics event emission list (T7, Phase 5/6); and any new model call (Phase 4 makes
none).

### Re-verification on entry (`00-README.md` step 5)

| Claim in `01-STATE.md` | Command and observed result | Verdict |
|---|---|---|
| HEAD is the Phase 2 exit commit, after `1498e53` | `git log --oneline -1` -> `36a3598 docs(handoff): name the Phase 2 commits and the push in 01-STATE` | **Diverges from the literal line, explained by the same file**: its own tag paragraph names `36a3598` as the post-tag correction commit. Sessions 02 and 03 recorded the same class of divergence |
| `git status --porcelain` clean; four tags | empty; `phase-00-complete`, `phase-01-complete`, `phase-02-complete`, `phase-03-complete` | Confirmed |
| Frozen files present | `Test-Path app/src/lib/llm/types.ts` -> `True`; `app/src/lib/guardrail/index.ts` -> `True`; `migrations/0011_ingestion_jobs.sql` -> `True`; `app/scripts/ingest-once.ts` -> `True` | Confirmed |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | 0 errors; `C8 import/endpoint gate: ok`, exit 0; **22 files, 464 tests passed**, 4.23 s, no network, no provider key | Confirmed |
| Migrations idempotent; no schema drift | `pnpm db:migrate` -> `no pending migrations (11 already applied)`; `verify-schema.ts` -> `schema drift: none (35 tables, 464 columns)` | Confirmed |
| Seeded counts | 37 `role='student'` rows; 5 milestones `in ('APPROVED','PUBLISHED')` | Confirmed |
| Shell / Node / pnpm | node `v24.15.0`, pnpm `12.4.2` | Confirmed |

No stale claim was found that changes what this session may rely on.

### Delivered (with evidence)

| Item | Evidence (command + observed result) |
|---|---|
| The approval state machine, in one pure module | `app/src/features/review/transitions.ts`: ten permitted `(from, action) -> to` rows, each with its transition number and stamp effects; `resolveTransition` refuses `AI_GENERATED -> APPROVED` by name, permits nothing but `APPROVED -> PUBLISHED` for publish, and treats `REJECTED` as terminal. `pnpm exec vitest run tests/review` -> 16 tests |
| The revision token the `06` S5.5.8 contract required (**I-16** closed, **D98**) | `pnpm db:migrate` -> `apply 0012_artifact_revision`; `1 applied, 11 already applied`; `pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts` -> `schema drift: none (35 tables, 471 columns)`; `tests/db/migrations.test.ts` -> 15 passed with the Phase 1 "no revision column" assertion inverted |
| Gate rule G1 in the query layer (**T3**, **D99**), the phase's handoff | `student-visibility.ts`: `findVisibleAssignmentScope` resolves `assignments.status = 'published'` and a current structure in one query, and the six `listVisible*` functions take a `VisibleScope` so they cannot be called before the gate. Verified over HTTP: `scripts/verify-review.ts` steps 1, 6, 8, 9 |
| The six tutor routes and one student route | `GET .../review`, `PATCH|DELETE /api/tutor/structure-artifacts/{artifactId}`, `POST .../artifacts`, `POST .../approve`, `POST .../publish`, `GET /api/student/assignments/{assignmentId}/structure`. All exercised over HTTP by `scripts/verify-review.ts` -> **18/18 passed** |
| The review contract, completed where the docs were silent | `06` S5.5.8's payload union is seven members (`StructurePayload` added), `AssignmentResponse` defined, `ValidationWarning` and `ReviewArtifactResponse` typed: **I-03**, **I-41** closed (**D103**). `06` S7.2.4-7.2.11 and 7.4.4 carry `revision` |
| The D53 no-op rule and the immutability of T1 fields | `tests/review/artifacts.test.ts`: 40 tests, including that a save identical to the stored row is not a change (and that `"25.00"` equals `25`), and that `verbatimText`/`criteriaText` are refused (step 12 over HTTP: `409 IMMUTABLE_FIELD fields=["verbatimText"]`) |
| The publish gates | step 4 `canPublish false blockers ["NO_POLICY_RULE_APPROVED"]`; step 7 `200 published`; step 17 `409 reason=ASSIGNMENT_NOT_IN_REVIEW` |
| **The live Analyst run, which Phase 2 could not do** (**I-35** closed) | `pnpm exec tsx --env-file-if-exists=.env scripts/ingest-once.ts --fixture demo --pace-ms 14000` -> `ok: true`, `status: succeeded`, `stage: S7`, counts `sources 2 / chunks 24 / requirements 24 / rubricSections 5 / milestones 5 / checklistItems 28 / faqEntries 8 / policyRules 5 / findings 4`, notes clean. The assignment is `in_review` with 0 approved artifacts, 0 `analytics_events`, 0 `milestone_metrics`, and 24/24 requirement nodes verbatim-substring their cited chunk |
| The truncation that replaced the old 400, measured and fixed (**D104**, **T32**) | one structure pass per ceiling: 8,192 -> `outputTokens` 8,178, body cut, `json: null`; 32,768 -> 32,754, still cut; **65,536 -> `finishReason=stop` at 41,555 / 43,258, `parseStructured ok? yes`**; 32,768 at `low` thinking -> `stop` at 2,378. `ANALYST_DEFAULT_MAX_OUTPUT_TOKENS` exported and pinned by a test in `tests/ingest/analyst.test.ts` |
| The whole repository green | `pnpm typecheck` -> 0 errors; `pnpm lint` -> `C8 import/endpoint gate: ok`, exit 0; `pnpm test` -> **24 passed in 24 files, 521 tests**, no network, no provider key |

### Defects this session found in its own work, and how each is recorded

| # | Defect | Found by | Recorded as |
|---|---|---|---|
| 1 | **The policy-code write guard was stricter than the read-time validator**, refusing `route_uncertain_requests_to_tutor` -- the seeded demo policy's own escalation rule, which `policyFromRows` accepts because `ESCALATE_TO_TUTOR`/`CLARIFY` rules need no capability mapping | the acceptance script's own step, which had chosen that code as a "mapped" example and got a `400` | **T31**; `checkPolicyRuleCode` now takes the effect and defers to `isCapabilityRule()`; `tests/review/artifacts.test.ts` pins both directions |
| 2 | **`row.created_at.toISOString is not a function`** -- the driver returned a `timestamptz` as a string, so the review bundle's first live request was a `500` | the acceptance script's first run | `src/lib/db/values.ts` normalises timestamps and `numeric`/`bigint` at the query boundary; recorded in `01-STATE.md` section 2 |
| 3 | **The acceptance script read a stale `expectedRevision`** (captured before approve and publish, both of which bump it) and reported `409` where it expected `200` | the script's first run -- and the `409` was *correct* behaviour, so the script was the defect | the script re-reads the bundle after publish; the sequence is commented as the T-19 race |
| 4 | **The acceptance script's node count and audit count were wrong** (3 Map nodes, not 4; the fixture has no FAQ row; the audit assertion counted rows rather than actions) | the script's first run | the script asserts the three published nodes, the two edges, and the three audit *actions* |
| 5 | **`payloadChangesAnything` compared numeric columns as strings**, so `"25.00"` against `25` looked like a change -- which would have moved an `APPROVED` artifact to `EDITED`, cleared its stamp and hidden it from students on a no-op save | a unit test, before any HTTP run | `sameValue` compares number-like pairs numerically; the test that caught it is kept |

### Decisions taken

- **D98** `revision` added to the seven lifecycle-bearing tables; I-16 closed by adding the column, with
  the guard in the SQL. **D99** one visibility rule, `PUBLISHED`, enforced in the query layer; I-21
  resolved, `11` WP-06 corrected. **D100** the review validation is recomputed at read time, never
  stored. **D101** the policy rule-code guard, at write time, naming the code. **D102** a no-op save is
  not an edit; `planningLevel` follows the wording. **D103** the payload union completed and
  `AssignmentResponse` defined. **D104** the Analyst output ceiling, measured. **D105** the acceptance
  run is `app/scripts/verify-review.ts`.
- Six implementation readings that change no contract are recorded in the module headers: a repeated
  save stays `EDITED`; leaving `APPROVED`/`PUBLISHED` clears the stamps (and `published_at` for
  transition 8); `expectedRevision = 0` means no precondition and is only legitimate for transition 9;
  a tutor-authored artifact starts at `NEEDS_REVIEW`; `truthTierFor` reports the artifact's
  authoritative field where `06` S2.2 gives two tiers to one artifact; a tutor row's required
  `provenance.generatedAt` falls back to `created_at`.

### Invariants touched

- **I1 (the Assistant never does the assignment)** -- untouched; Phase 4 makes no model call of any
  kind, and the phase's own acceptance run proves it can run with `LLM_PROVIDER=mock`.
- **I2 (nothing AI-generated is student-visible before approval)** -- **honoured and now enforced at two
  layers**: the state machine decides what `PUBLISHED` means, and gate rule G1 decides what a student
  read may return. Verified on data: the live run's assignment is `in_review` with 0 approved
  artifacts, and the acceptance script shows `NEEDS_REVIEW` -> `404`, `APPROVED` -> **still `404`**,
  `PUBLISHED` -> `200`, edited-after-publish -> gone.
- **I3 (the brief is verbatim)** -- honoured: `verbatimText`/`criteriaText` are immutable through the
  API (`409 IMMUTABLE_FIELD`, C2), a `VERBATIM_MISMATCH` cannot be acknowledged, and the read-time
  validation re-derives the check from the stored text.
- **I4 (a refusal is a `200`)** -- untouched: Phase 4's refusals are error codes, not guardrail
  refusals. The assistant route is Phase 5's.
- **C7 (secrets, no content in logs)** -- honoured: no key is read, printed or committed; the acceptance
  script mints a session from `config.authSecret` with `signSessionToken` rather than reading the demo
  password; the audit rows carry status, revision and **field names**, never document or student
  content.
- **T7 (analytics are written at the point of the event)** -- honoured: Phase 4 writes no
  `analytics_events` row, verified as 0 for the live run's assignment.
- **Newly accepted risks:** the review page and the provenance badge are not built (**I-44**); the
  design-system gates G4-G10 do not exist; a truncated model response is still reported as
  `LLM_OUTPUT_INVALID` with no truncation signal (**I-42**).

### Discovered traps for later phases

- **T31 (new)** -- a write-time guard stricter than the read-time validator is a second, wrong
  definition of validity. Found by this session's own acceptance run. Test the accepting direction, not
  just the refusing one.
- **T32 (new)** -- thinking tokens are billed as output, so an output ceiling must fit thinking *plus*
  the body, and hitting it is reported as `LLM_OUTPUT_INVALID` (and as `finishReason: content_filter`,
  which is not a content-policy refusal).
- **The driver returns `timestamptz` as a string here.** Not a numbered trap yet because `values.ts`
  handles it; if a third site needs it, promote it to a trap rather than adding a fourth `toISOString()`
  call.
- **`tokens.css` is empty** (**I-44**), so no screen renders correctly and no design gate exists to
  catch it. This is the first work item of any UI phase.

### Not delivered, and why

- **WP-06's review page and `ai-provenance-badge.tsx`.** `app/src/styles/tokens.css` declares no token,
  so every Tailwind colour key resolves to an undefined custom property and a page built today would
  render wrong against a layer that must be designed, not guessed (**I-44**). Building the page first
  would also mean writing the design-system gates (G4-G10) after the fact, against values they exist to
  check. Consequence for Phase 5: the boundary is complete and HTTP-verified, but there is no screen
  that shows it.
- **The design-system gates.** No `check-design.mjs`, no `pnpm test:e2e`, so G1-G10 (`17` S12) are
  unimplemented. Their absence is why I-44's ordering matters.
- **`I-42`'s truncation signal.** The ceiling is fixed, so the outcome is right; the *diagnosis* is
  still thin, and that changes Phase 2's adapter and pipeline, which is not this phase's to move.
- **`I-43`'s doc-vs-code divergence.** The pipeline persists a non-verbatim rubric section with its
  warning; the Phase 2 log said `VERBATIM_MISMATCH` artifacts are dropped. Phase 4's boundary refuses to
  approve it, which is the correct behaviour, so this is a docs-and-ingestion question for WP-05.
- **A live model call by Phase 4 itself.** Deliberate: reviewing, approving and publishing are
  deterministic, and the acceptance run proves the whole gate works under `mock`.

### What I could not verify

- **The `01-STATE.md` "not verified live" items that remain.** The milestone, policy, FAQ and ambiguity
  passes are proven only by the run succeeding; their per-pass output was not read line by line, and
  `attachment_extraction` on a real image was not exercised (**I-30**).
- **The live run's cost in AUD.** No billing figure was read (the key and the provider console are out
  of bounds). The ~0.15 AUD per run in `12` S2.3 is arithmetic from the run's own token counts against
  the model's published price, not an invoice.
- **A fresh clone's behaviour.** `.gitattributes` (T20) and the PDF fixtures were not re-cloned this
  session; Phase 3's clone verification is the standing evidence.
- **Any rendered screen.** No browser was opened, because there is nothing correct to render yet
  (**I-44**). Every UI claim in `07` remains unverified.
- **The full acceptance-criteria checklist of `11` WP-06.** The gate and the six criteria were walked;
  the two that are genuinely not satisfied (the badge, the page) are named in its status note rather
  than left implied.

---

## Session 05 - Phase 5 (student workspace, Map, checklist, AI Usage Policy and the Assistant) - 2026-10-04

**Phase:** 5   **Status:** in progress (entry written **before** the first commit, per `00-README.md`
section 1 step 6)
**Spec docs read:** `AGENTS.md`; `00-INDEX`; `01-DECISIONS`; `02-SCOPE`; `18-IMPLEMENTATION-PLAN`
(all); `06-DATA-MODEL` sections 3.4, 5.1-5.7, 5.5.3-5.5.10, 6, 7.3, 7.6; `07-UI-UX-SPEC` sections
2, 3.4-3.7, 4.1-4.7; `05-AI-GUARDRAILS` sections 1-3, 5-8, 12; `17-DESIGN-SYSTEM` sections 2, 3,
6, 11-13; `11-BUILD-PLAN` WP-07 and WP-09; `12-OPERATIONS`; all of `docs/handoff/**`
**Commit range:** `cd502a8`..**Tag:** `phase-05-complete` (planned)

### Environment divergence found at session start (reported before any work)

`00-README.md` step 5 requires this and it caught something real, so it is recorded first.

| Divergence | Observed | Expected by `01-STATE.md` |
|---|---|---|
| **Phase 5 is not unstarted.** The working tree carries an interrupted prior session's Phase 5 work | `git status --porcelain` -> 7 modified (`src/lib/api/types.ts`, the five `src/styles/*.css`, `tests/guardrail/imports.test.ts`) + 8 untracked (`src/components/ui/{badge,content-class-panel,empty-state,fixed-strings,theme-scope}.tsx`, `src/lib/guardrail/classifier-port.ts`, `src/lib/utils.ts`, `src/styles/fonts.ts`) | `01-STATE.md` section 3 line "Phase 5 ... **NOT STARTED**" |
| The handoff names no such work anywhere | grep of `docs/handoff/**` for the new filenames returns nothing | `00-README.md` section 4 expects the exit protocol to have recorded it |

**The baseline is nonetheless green with that work in place**, which is why it is being rescued rather
than reverted: `pnpm typecheck` -> 0 errors; `pnpm lint` -> `C8 import/endpoint gate: ok`, exit 0;
`pnpm test` -> **24 files passed, 521 tests passed**, exit 0, no network and no provider key.

### Session intent (recorded before the first commit)

1. Append this entry, so a session that dies mid-task still left its intent on disk.
2. Audit the rescured uncommitted work against its specs, correct it, and commit it as the **first**
   Phase 5 commit, labelled as rescured work rather than presenting it as this session's own.
3. `I-44`'s ordered design work: finish L1/L2 in `tokens.css`, keep the **D106** font degradation path
   (the seven woff2 binaries are absent and are not invented), and write `scripts/check-design.mjs`
   implementing `17` section 12's static gates.
4. Then the phase proper: the student query layer, `features/assistant/`, the student routes
   including the SSE assistant stream, and the student UI.
5. Exit with all seven handoff artefacts, `git tag phase-05-complete`, and a push.
