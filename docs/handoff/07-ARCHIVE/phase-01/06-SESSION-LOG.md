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