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

**Phase:** 5   **Status:** complete
**Spec docs read:** `AGENTS.md`; `00-INDEX`; `01-DECISIONS`; `02-SCOPE`; `18-IMPLEMENTATION-PLAN`
(all); `06-DATA-MODEL` sections 3.4, 5.1-5.7, 5.5.3-5.5.10, 6, 7.3, 7.6; `07-UI-UX-SPEC` sections
2, 3.4-3.7, 4.1-4.7; `05-AI-GUARDRAILS` sections 1-3, 5-8, 12; `17-DESIGN-SYSTEM` sections 2, 3,
6, 11-13; `11-BUILD-PLAN` WP-07 and WP-09; `12-OPERATIONS`; all of `docs/handoff/**`
**Commit range:** `cd502a8`..`phase-05-complete`   **Tag:** `phase-05-complete`

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

---

### Session 05, completed -- what actually happened

**Status: complete.** The intent above was written before the first commit and was followed; this
section records the outcome, including the parts that changed.

| Item | Evidence (command + observed result) |
|---|---|
| The design layer rescued, audited and committed | `ebf5b46`: `tokens.css` (L1 + L2 + the four added tokens + `--shadow-overlay`), `typography/texture/motion/globals.css`, `fonts.ts`, 10 UI primitives, `check-design.mjs`, 12 component tests + the token-parity test. `pnpm lint` -> `design gates: ok (13 checks)` |
| The assistant layer rescued and committed | `51bbea7`: the six `features/assistant/` modules, `queries/assistant.ts`, the four assistant routes including the SSE stream, the Phase 5 contract block, 3 test files |
| Three defects fixed in the rescued tests | `be7e9c8`. The SSE encoding test expected one empty field on split; it is two (`"\n\n"` yields one empty field for the line ending and one for the blank line). `JSON.stringify` **does** escape a newline in the payload, so no forged event was possible -- only the expectation was wrong -- and the assertion now pins the whole array, which is stronger. Two unused imports removed. `proactive.test.ts` asserted `pageFrom` on a type that has no such field (vacuously true); replaced with the real property, `deepLink === null` for a checklist citation |
| The design gate corrected, then documented | `9fb22b4` (comment stripping before token resolution -- without it the parity check is **vacuous**, because a doc comment naming a token would satisfy it), `31f8f83`, `c56e9ec` |
| **D106, D107, D108 recorded**, and the two `06` corrections they authorise | `077b412`. `06` section 5.5.3's `viewerUrl` **removed**; `06` section 5.5.6's `reopenCount` added; `17` section 15's status line updated |
| The student query layer and the two list routes | `0c69d63`. `06` section 5.5.2's `{ items }` envelope adopted, replacing the rescued `{ courses }`/`{ assignments }` |
| The remaining six student routes and the SSE pacing | `7083ac3`, which is `9fb22b4`'s descendant by rebase-free split |
| **The D48 defects found by the live run, and the acceptance script** | `73044c7`. See "What failed" below |
| The student UI | `a121e5e`: 6 pages + 5 components + `server-session.ts` |
| The Assistant panel and the refusal panel | `e510831`; the SSE checks folded into the acceptance run |
| The tutor review page and the provenance badge -- Phase 4's I-44 debt | `928f182`; `scripts/verify-review.ts` -> **20/20** |

### Not delivered, and why

- **The Attachment UI** (`07` section 4.7.2 rule 5): the `+` picker, the upload chips and the
  client-side blocked-upload refusal. The server half is complete and refuses a non-`clear` upload with
  `VALIDATION_FAILED` and `details.uploadIds`. Recorded as **I-48**. No demo beat depends on it, and
  I-30 means the live classification path is unverified in any case.
- **The proactive notice wiring.** `GET .../assistant/proactive` and the builder exist; no milestone
  focus is supplied yet, so the panel receives `proactive: null` -- which `06` section 5.5.9 defines as
  "no proactive message is due", so the state is honest rather than a placeholder. O2's once-only
  guarantee is enforced by `UNIQUE (student_assignment_id, milestone_id)` and needs the focus to be
  exercised.
- **The design-system gates G1, G2, G3, G6, G7 and G10.** `check-design.mjs` implements G4a-d, G5a-c,
  G8a-b, G9 and the HEX/L1/DEF gates, and **names the rest as uncovered in its own output**. G1/G3/G6/G7
  need a browser and `pnpm test:e2e` does not exist; G2 is a component-tree scan that the script's author
  judged would need the route graph to avoid false positives. Reading `lint`'s `ok` as coverage of them
  would be wrong, which is why the script says so itself.
- **A live provider call.** Phase 5 made none: every acceptance check ran under `LLM_PROVIDER=mock`.
  That is deliberate -- the phase's claims are about the boundary, the gate and the wire format, and
  `mock` is deterministic and free.

### Decisions taken

- **D106** the font degradation path (mirrored from `17` section 15). **D107** the brief viewer renders
  the stored extraction and `viewerUrl` is removed, resolving **I-06**. **D108** `reopenCount` on the
  checklist payloads with the reopened state derived from it. Each is in `01-DECISIONS.md` with its
  authority and its consequences.
- Three implementation readings recorded in module headers rather than as rows: `findChecklistItemAssignmentId`
  is deliberately ungated (it feeds the gate, it does not read content); `listAssignmentCardsForStudent`
  takes no `isStudent` flag (the role is per course); the tab strip derives its active tab from
  `usePathname`.

### Invariants touched

- **I1 (the Assistant never does the assignment)** -- **honoured and now demonstrated on the wire**: the
  demo refusal is a `200` with zero token frames and zero provider calls, and the permitted turn is the
  only one that streams.
- **I2 (nothing AI-generated is student-visible before approval)** -- **honoured at three layers** now:
  the state machine (Phase 4), gate rule G1 (Phase 4), and C3's visible marker on the review page
  (`928f182`, asserted on rendered HTML).
- **I3 (the brief is verbatim)** -- **honoured under D107**: the viewer renders the document's own
  extracted text, never re-flowed or summarised. The honest limit is that it is not page-rasterised
  (**I-45**).
- **I4 (a refusal is a `200`)** -- **honoured and verified end to end**, including the client's
  corrupt-stream rule.
- **C2** -- `verbatimText`/`criteriaText` render as quotes, are never editable from the review page, and
  a `VERBATIM_MISMATCH` row cannot be approved there either.
- **C3** -- the badge decides its own label from `origin` and `publicationStatus`; no caller can pass an
  unmarked AI artifact.
- **C7** -- no key was read, printed or committed; the acceptance scripts mint sessions with
  `signSessionToken` and never read the demo password.
- **T7 (analytics are written at the point of the event)** -- **extended and checked on data**: the three
  checklist transitions and both assistant turn outcomes write their rows, and the acceptance run asserts
  the counts.
- **Newly accepted risks:** the Attachment UI (**I-48**); the six unimplemented design gates; the
  un-rasterised viewer (**I-45**); the proactive notice unexercised.

### Discovered traps for later phases

- **T33** -- not every table has `deleted_at`. `queries` and `ai_policy_rules` do not, and copying a
  sibling table's predicate produced two bare `500`s whose cause was only in the server log.
- **T34** -- D48 spans two statements, and fixing either alone leaves an item that can never be finished
  again. The full chain is in the register.
- **T35** -- a client component must not import a server module. `uiStateOf` had to move to a module with
  type-only imports, or the whole query layer would have entered the browser bundle -- building cleanly
  and failing only in the browser.
- **PowerShell 5.1 mangles a multi-line `-m` commit message** (new, and it is a *session* trap rather
  than a code one): the body's newlines are parsed as separate arguments and `git` fails with
  `Invalid path '/event: token'`. Use `git commit -F <file>`.
- **`Invoke-WebRequest` corrupts a JSON body captured inside a function**, so a PowerShell probe of these
  routes reported empty values while the routes were correct. The acceptance scripts are TypeScript with
  `fetch` for that reason.

### What I could not verify

- **The Attachment UI and the modality refusals from the picker** (**I-48**, **I-30**): the live
  classification path is unverified, and the picker does not exist, so no upload beat can be demoed.
- **The proactive notice.** The route and the builder exist; the once-only behaviour is a database
  constraint that no run has exercised, because no focus is supplied yet.
- **Design gates G1/G2/G3/G6/G7/G10.** No browser gate exists. Every UI claim in `07` about greyscale
  distinctness, badge truncation at three widths, computed focus rings and composited contrast is
  therefore **unverified**, and this handoff does not claim otherwise.
- **A live provider call.** None was made in Phase 5 (see "Not delivered").
- **The seeded cohort's own screens end to end.** The pages were fetched over HTTP and their key strings
  asserted; no browser rendered them, so layout, focus order and contrast are unchecked.
- **The two `500`s' full extent.** They were found on the routes the acceptance run exercises; another
  route with a copied predicate could still carry the same fault, which is why **T33** names the check
  rather than the two instances.

---

## Session 06 - Phase 6: the recognition layer - 2026-10-04

**Phase:** 6   **Status:** complete
**Spec docs read:** `AGENTS.md`; `00-INDEX`; `01-DECISIONS`; `02-SCOPE`; `18-IMPLEMENTATION-PLAN` (all);
`06-DATA-MODEL` sections 4.1-4.7, 5.4-5.7, 5.5.11-5.5.15, 7.4, 7.5, 7.6; `05-AI-GUARDRAILS` sections 9
(all), 10, 12; `07-UI-UX-SPEC` sections 5, 6; `08-ANALYTICS-SPEC` (all); `11-BUILD-PLAN` WP-10 and WP-11;
`12-OPERATIONS`; `17-DESIGN-SYSTEM`; all of `docs/handoff/**`
**Commit range:** `cd502a8`..`phase-06-complete`   **Tag:** `phase-06-complete`

### Delivered (with evidence)

| Item | Evidence (command + observed result) |
|---|---|
| **The anonymity contract, and its structural gates** | `ebf5b46`'s successor `c7787aa`: `features/discussion/anon-identity.ts` implements `06` section 4.2's derivation, and `tests/discussion/anon-identity.test.ts` **recomputes the formula independently** with its own `createHmac`, so a mis-transcribed literal (`mod 899`, `readUInt32LE`, a slice from byte 1) fails rather than producing a plausible wrong number. `tests/discussion/imports.test.ts` asserts A-ID-2 (one runtime file names the identity table), A-ID-6 (the analytics service never does, checked against the **migration files** because the suite has no database) and A-ID-5 (the `DiscussionAuthor` shape) |
| **WP-10 discussions**: 9 routes, student and tutor | `22a7e77`: create/read/reply/edit/delete/flag, tutor read, moderate, answer-review, promote-to-faq. `verify-discussion.ts` checks 1-7 |
| **WP-10 Queries**: 7 routes | `d5bf87f`: the private thread, with the tutor's reply **being** the `open -> answered` transition. Checks 8-12 |
| **WP-10 FAQ**: 4 routes plus promotion | `978694c`: the approve-then-publish chain, asserted in **both** intermediate states. Checks 13-19 |
| **WP-11 analytics** | `743ceaa`: `lib/db/queries/metrics.ts` and `features/analytics/service.ts`, with M4 as a mean of per-student means. `verify-analytics.ts` 13/13; `tests/analytics/difficulty.test.ts` 14 tests |
| **The Discussion Moderator** | `7fdd1d8` (the schema, resolving **I-49**), `de626d5` (the pass and its failure path), `50d01d7` (wired into post creation). 51 tests across three files |
| **Migration `0013`** | Widens `ck_moderation_flags_reason_code` for **D109**. `pnpm db:migrate` -> 13 applied, 0 pending; `verify-schema.ts` -> no drift |
| **Phase 6's acceptance run** | `194e69e`: `scripts/verify-discussion.ts`, 20 checks over HTTP. It found three of its own fixture defects before passing |

### Not delivered, and why

- **The Attachment UI** (**I-48**): still the `+` picker, chips and client-side blocked-upload refusal. The
  server half is complete and refuses a non-`clear` upload. No demo beat depends on it.
- **The proactive notice wiring.** Route and builder exist; no milestone focus is supplied, so the panel
  receives `proactive: null`, which `06` section 5.5.9 defines as "no proactive message is due".
- **The design-system gates G1/G2/G3/G6/G7/G10.** `check-design.mjs` names them as uncovered in its own
  output. Every claim in `07` about greyscale distinctness, badge truncation, computed focus rings and
  composited contrast remains **unverified**.
- **A mock fixture for `discussion_moderator`.** Deliberate: the mock's refusal is what makes binding
  rule 5's failure path exercisable offline. Recorded so a later session does not "fix" it by inventing one.
- **A live end-to-end moderation run on a genuinely flaggable post.** The happy path was verified against
  Gemini with a benign post (`{flags:[], overallSeverity:0}`, correctly no flag), and the failure path
  against the mock with a real database write, but no live run has classified content that *should* be
  flagged -- the paid key's cap (**I-36**) is the reason.

### Decisions taken

**D109** -- `moderation_flags.reason_code` admits both the student's six-value vocabulary and the
moderator's fourteen `MOD_*` codes, with `source` saying which applies; migration `0013` and the `06`/`05`
doc corrections are its other half. **D107**'s viewer limitation and **D106**/**D108** landed in Phase 5
and are unchanged. Three implementation readings are recorded in module headers rather than as rows: the
moderator's schema lives under `features/discussion/` (I-49's answer, following Phase 3's precedent);
`listPublishedFaqEntries` takes no `VisibleScope` because its callers are gated tutor routes; and the four
acceptance scripts are operator tooling rather than tests.

### Invariants touched

- **C4 (a tutor cannot see an anonymous author)** -- **honoured and now asserted at runtime**: the tutor
  payload carries the `Anonymous Student #<n>` label and none of the six identifying field names, and
  A-ID-2 makes the identity table reachable from exactly one module.
- **C5 (aggregate only)** -- **honoured with two floors**: a bucket below five contributors produces **no
  row** rather than a suppressed one, so absence is uniform, and the **median** needs eight because a
  median of five is the third-smallest and is close to disclosing one contributor's figure. The second
  floor was missed on the first pass (**I-51**, trap **T39**) and found only by the live run.
- **C3 (nothing AI-generated is student-visible before approval)** -- extended to the moderation surface:
  an AI flag is `source = 'ai'` with its model id and prompt version, `05` section 9.4 binding rule 4 keeps
  the student's view from disclosing that a model flagged anything, and binding rule 5 makes a moderator
  failure **visible** rather than a silent pass or a silent hide.
- **C1** -- unchanged; the moderator is a *classifier* and `05` section 9.5 keeps it separate from the
  Policy Guard as a **D12** requirement.
- **I2 / D99** -- **verified in both intermediate states**: `APPROVED` is a real status that remains
  invisible, and `PUBLISHED` is the threshold.
- **T7 (analytics at the point of the event)** -- held: the Query's `query_created` event is written in
  the thread's own transaction, and the Query status transition shares the message's statement.
- **Newly accepted risks:** the Attachment UI (**I-48**); the six unimplemented design gates; an
  unexercised live flaggable classification.

### Discovered traps for later phases

- **T38** -- a spec's *illustrative* query is not the metric's definition. `06` section 4.7.2's sample
  build query computes M4 as a flat `avg(duration_seconds)`, which `08` section 4.3 rejects and `08`
  section 9's A15 would fail.
- **T39** -- two k-anonymity floors exist and they are different numbers (5 contributors, 8 for a median).
  Implementing one and forgetting the other is a C5 disclosure.
- **T40** -- PowerShell treats `[` and `]` as wildcards, so `Remove-Item` on a bracket path is a silent
  no-op. It cost three commits to clear one file, because `git add app/` kept re-adding it.
- **T41** -- a `CHECK` constraint is a specification, and two normative documents can describe one column
  incompatibly without either looking wrong. Worse: the correct `catch` (binding rule 5's `mark`) then
  hid the defect, leaving a post visible and the queue empty.

### What I could not verify

- **A live, genuinely flaggable moderation classification.** See "Not delivered".
- **The Attachment UI's client-side refusals** (**I-48**, **I-30**).
- **Design gates G1/G2/G3/G6/G7/G10.** No browser gate exists.
- **The k-anonymity floors under real cohort volume.** The fixtures are small; the floor is asserted at
  4 and 5 contributors and by constraint, not at a realistic distribution.
- **The proactive notice's once-only behaviour.** It is a database constraint no run has exercised.

---

## Session 07 - Phase 7: smoke test, fallbacks, freeze, submission - 2026-10-04

**Phase:** 7   **Status:** code-complete and frozen; **four deliverables need a human and are not done**
**Spec docs read:** `AGENTS.md` section 7; `11-BUILD-PLAN` WP-12; `12-OPERATIONS`; `13-DEMO-STORY` (all);
`14-HACKATHON-SUBMISSION` (all); `hackathon info/info.md` (submission requirements); all of `docs/handoff/**`
**Commit range:** `195a5da`..`phase-07-freeze`   **Tag:** `phase-07-freeze`

### Delivered (with evidence)

| Item | Evidence (command + observed result) |
|---|---|
| **`pnpm demo:smoke`** | `app/scripts/smoke.ts`, 12 checks in the order a failure would hurt most. **11/12 pass** on this machine; the twelfth is the missing fallback recordings. It reports the active provider rather than asserting one (D90 makes offline supported), and it exits 78 rather than faking the HTTP checks when the server is down |
| **`demo/reset.ps1`** | Migrations, drift check, seed -- the run sheet's 11:30 command. It truncates nothing: the acceptance fixtures are additive and a `DROP` would take the audit trail |
| **The AI-use disclosure** | `14-HACKATHON-SUBMISSION` S5 item 2 and the twelve-row per-packet log, filled from the commit history rather than reconstructed. **Every packet is `Yes` for AI assistance**, with the human-correction column carrying the information |
| **The verified public repository** | An anonymous GitHub API fetch returns `private=false, visibility=public, default_branch=main`, closing the doubt recorded in **I-07** |
| **The feature freeze** | `git tag phase-07-freeze`, pushed, pointing at the current HEAD. The code is frozen; **nothing in the remaining work requires changing it** |
| **The T42 sweep** | Four docs still described a repository with no application: `14` S4.1/4.2, `11`'s header and R7, `12` S3.2, `18` S2. All four now keep the historical statement, state what supersedes it, and link to the live state |

### Not delivered, and why

- **The four fallback recordings.** A recording is a human operating the product. `demo/fallback/README.md`
  lists the beats, the naming convention and the reason each exists; the image-refusal recording is named as
  the priority because it is what makes beat 5's second half survivable.
- **`demo/assets/failing-code-screenshot.png`.** Must be captured from this project, and must extract
  *successfully* -- a placeholder produces `extractionStatus: failed` and the turn is refused **before** the
  guardrail classifies it.
- **The three rehearsals, the Devpost filing, and S5.3's per-member disclosure.** The first is performance,
  the second is the team's, and the third can only be stated by each member.

### Decisions taken

No new register row. **D109** was Phase 6's last. Phase 7's changes are corrections to documents that had
drifted from the repository, and each is recorded in the document itself rather than as a decision: the
superseding notes in `11`, `12` and `18`, and the `T42`/`T43` register entries.

### Invariants touched

- **C1, C2, C4, C5, C7** -- unchanged and unaffected; Phase 7 changed no application code.
- **`AGENTS.md` section 7's hackathon obligations** -- **advanced**: the AI-use disclosure is written
  (the obligation whose own warning is "do not reconstruct it the night before"), the repository is verified
  public, and the freeze is tagged.
- **Newly accepted risks:** the four missing fallback recordings; **beat 5's second half is not performable
  live** and depends on a recording that does not exist; the presentation is marked `AT RISK` in the
  requirement tracker for that reason.

### Discovered traps for later phases

- **T42** -- a claim about the repository, written into a file the repository contains, is stale on commit.
  Found in the demo story and then in four more documents.
- **T43** -- PowerShell 5.1 mangles a multi-line `git commit -m` **silently**: the message truncates at an
  escaped quote, PowerShell tries to execute the remainder, and git still exits 0. The same shell writes a
  UTF-8 BOM with `Set-Content`, which Next cannot parse in `package.json`.

### What I could not verify

- **Beat 5's second half end to end on a real screenshot.** The classifier is wired to the live provider and
  the modality and scan gates both work, but no real screenshot exists to classify.
- **The four acceptance runs on the demo machine.** They pass on this machine; `pnpm demo:smoke` exists to
  check the other one.
- **Anything requiring a rehearsal.**



---

## Session 08 - Looking at the product: four defects, two design laws, and one rename - 2026-10-04

**Phase:** 7 (and 5/6 UI completion)   **Status:** code-complete; remaining work is human-only
**HEAD at close:** `0cd4be2`   **Remote:** `SharlEclair/rmit-hackathon-demo`

### Why this session looked different

It was not a feature session. The instruction was to keep working toward the objective, and the
objective's feature list was already complete -- so the rounds were spent **opening the product and
looking at it**. Every finding below came from a browser, and none from reading a diff. That is worth
recording as a method rather than a coincidence: all four defects had survived `pnpm test`, `pnpm lint`
and four green acceptance runs, because none of those asserts what a page looks like.

### Four defects, in the order they matter

**I-60 -- the provider adapter discarded image bytes.** `src/lib/llm/gemini.ts`'s `inputText()` rendered
every non-system message through `textOf()`, which is
`content.map((part) => (part.type === 'text' ? part.text : ''))`. An `image` part therefore contributed
the empty string, and `dataBase64` appeared in `types.ts` and `mock.ts` and **nowhere in `gemini.ts`**.
The chain was verified rather than guessed: `extractAttachment` returned `{ text: '' }` and **not**
`null`, so `parseStructured` succeeded and the model genuinely answered with an empty transcription --
exactly what a prompt with no image attached produces. The fix took six rounds of live API discovery,
because the API's 400 responses were the only documentation of the accepted shape; the working form is
`input: { type, mime_type, data }` with a plain base64 string and the prompt in `system_instruction`.
**The adapter's own header explains why it was never caught:** every structured-array shape had been
tried and rejected, so it settled on the flat-text form, and images silently could not work.

**I-61 -- every attachment was refused, and this was the larger half.** `guardrail_scan_status` never
advanced from `pending`, because `attachStudentUpload`'s `scan` hook is declared and **no caller ever
supplies it**. Measured: a valid `text/plain` upload returned `201` with `extraction: "extracted"` and
`scan: "pending"`, and the following turn returned `400 VALIDATION_FAILED`. The seam's own comment
explains the deferral -- *"a permissive scanner here would be the C6 failure this path exists to
prevent"* -- and that reasoning is sound; the seam was simply never filled. The fix was **one predicate**,
because `answer.ts`'s `composeTurnText` already folds attachment excerpts into the turn that `decide()`
classifies. Verified on both halves, since passing only the first would be a C6 regression: a benign
attachment now returns `200`, and a prohibited one returns `200` with `REFUSE`,
`STUDENT_WORK_EDIT_REQUESTED`, rules `["P7"]` -- from text that existed only inside the file.

**I-63 -- three pages were genuinely unstyled, and two had a reason that had expired.** `/login`, `/`
and the checklist page carried **zero** `className` attributes while nine other pages carried 2-12 each.
Two of them documented why: *"the design tokens land with the first UI phase (D75)... a utility class
referencing a custom property that does not exist yet is a broken style, not a style."* That was correct
when written. D75 then landed, the comment did not, and **`I-44`'s closure is what made it invisible** --
the blocker the workaround existed for was fixed, leaving a false rationale rather than an obvious gap.
The checklist page was a **different** fault: it rendered `ChecklistItemRow` with no wrapper, and the
segment has no `layout.tsx`, so each tab supplies its own frame.

**I-62 -- the dev server serves stale code, and it cost four wrong conclusions.** `/api/health` returns a
`commit` field. It read `5c12f66` while the tree was at `a86a9cf`, and on three later occasions the served
build lagged the code by one or more commits. Each time the symptom looked like a product bug rather than
a stale build: a fixture filter that "did not work", a sidebar listing a draft it should not have, a card
whose shadow "had not changed". The last produced a **wrong report to the user** and then a second wrong
explanation of it. The guard is one line and is now the first thing in `01-STATE.md` section 6: compare
`/api/health`'s `commit` to `git rev-parse --short HEAD` before trusting anything.

### Two design laws relaxed, because enforcement had outrun the spec

`design-law.test.ts` banned `transition` and `opacity-` **outright**, citing `17` section 10.6. The
specification says something else: section 10.3 rule 1 **requires** a hover transition "at the `fast`
duration", and 10.2 defines an entrance using opacity. **A test stricter than its own source is worse than
no test**, because it launders a mistaken reading into a build failure. The assertion now enforces the
bound -- no keyframes, and any `transition` must name a motion token -- which matters more than the
duration, because `motion.css` caps at 150ms and resets to `0ms` under `prefers-reduced-motion`.

Elevation was then relaxed too, as **D111**: a card may lift on hover, because a card that cannot be told
apart from the page cannot be told to be clickable either. The narrowness is the point -- content-class
frames stay flat unqualified, and the test still refuses any shadow in `content-class-panel.tsx`.

Both were recorded as decisions with what did *not* change named explicitly: no gradients, no
glassmorphism, no backdrop blur, no card soup, no default component-library appearance. The direction
holds; only its enforcement was corrected. **Truncation was deliberately left refused** -- relaxing it
would undercut C2 rather than merely the aesthetic, since a document fact half-shown is the defect the
rule exists to prevent.

### Also delivered

- A **persistent left sidebar** for the student and tutor views: courses expandable, assignments nested
  and indented, a clear active state, one component for both roles with visibility narrowed in the SQL.
  It lives in the section `layout.tsx` files, which is the only place in the App Router that renders once
  and survives its children changing.
- **Section 4.3's containment** and section 4.1's 48px rhythm, verified on screen: the T5 Assignment
  Map's dashed frame sits inside the T1 viewer's solid frame, 16px in, so interpretation is visibly
  narrower than the brief it interprets.
- The **discussion composer and thread list**, which closed a gap the empty state had been advertising --
  "Ask the first question" with nothing to ask it in -- while the API and service were both already built
  and routed.
- A `<li>` nested inside `<li>` on the checklist page, which React reported as a hydration error.
- Fixture names: acceptance-run assignments and the demo states were leaking database identifiers into
  the sidebar, and now read as product content.
- The repository was **renamed** to `rmit-hackathon-demo`, and the live documents were swept so no
  clone URL points at the old name, with the three historical records left intact and I-07 annotated.

### Process failures worth recording

- **The issue register was corrupted twice by careless edits**, once leaving the I-62 row holding I-60's
  body. Both were rebuilt from the file rather than by re-editing, and the content verified per row.
- **A report was given to the user that was wrong**, then explained wrongly, both traceable to a stale
  served build. The correction is in the record rather than the correction alone.
- **A SQL comment blanked the student dashboard.** Reasoning was added inside a template literal as `--`
  lines (a TypeScript syntax error), then "fixed" to `//`, which is valid TypeScript and **invalid SQL**.
  The page returned HTTP 200 with a full RSC payload and rendered nothing, so it looked like a hydration
  fault. Reading the DOM -- `innerText.length === 0` alongside status 200 -- is what separated "no data"
  from "no render".
- **Four rounds produced findings about the previous round's method** rather than about the product.
  That is a signal to change approach, not to keep auditing.

### Not done, and why

The Discussions page **still** renders only the FAQ count rather than the answers, and has no thread
detail view, although `buildStudentDiscussion` returns `officialFaq` and `buildThreadDetail`/`createPost`
exist. **My Queries has never been inspected in a browser at all**, and given that Discussions was
half-built in exactly this way, it should be assumed to be as well until proven otherwise. Both are the
next session's first two items, in `01-STATE.md` section 5.

Phase 7's human-only items are unchanged: four fallback recordings, the screenshot asset, three
rehearsals, the Devpost filing, and section 5.3's per-member disclosure.

---

## Session 09 - The last two half-built student screens, and one environment defect - 2026-10-04

**Phase:** 7 follow-up (the three machine-doable items of session 08's section 5)   **Status:** complete
**Spec docs read:** `AGENTS.md`, `00-INDEX`, `07` sections 4.4, 4.5, 5.1-5.4, 6.1-6.5, `02-SCOPE` (MVP
boundary), `13-DEMO-STORY` beat 7, the whole handoff set
**Commit range:** `76568cd`..`bdb8bf3` (code and scripts), then the docs commit that carries this entry
**Tag:** none (`phase-07-freeze` still marks the freeze boundary; this session is after it)

### Delivered (with evidence)

| Item | Evidence (command + observed result) |
|---|---|
| **I-64 closed** -- the Official FAQ renders its answers | Live, hydrated browser: five entries with question and answer text and `Published by your tutor on 2026-09-28` / `2026-10-03` |
| **I-65 closed** -- thread detail and reply | `discussions/[threadId]/page.tsx` + `discussion-reply-composer.tsx`. Live: the composer answered `Your reply is posted.` and the reply appeared as the thread's third post |
| **I-66 closed** -- My Queries finished | `queries/page.tsx` + `queries/[queryId]/page.tsx` + `query-composer.tsx` + `query-thread-actions.tsx`. Live: `Send privately` created an `Open` thread; a follow-up message appended; `Flag Resolved` appeared only at `Answered` and the header moved to `Resolved` |
| The T2 marker's date is real | `publishedAt` added to `VisibleFaqEntry` and both readers; both builders now pass it through instead of hard-setting `null` |
| **T45 closed at its source** -- beat 7's "seeded thread" now exists | `app/scripts/demo-discussions.ts`, `pnpm demo:discussions`, step 5 of `demo/reset.ps1`. Ran twice: first run created three threads, second created none |
| Shared presentation helpers | `features/workspace/presentation.ts` + 7 tests; `pnpm test` -> **765 passed (49 files)**, from 758 in 48 |
| Gates | `pnpm typecheck` 0 errors; `pnpm lint` -> C8 ok, 13 design gates ok; `pnpm build` exit 0, both new routes listed |
| Four acceptance runs, live server | `verify-student` 18/18, `verify-review` 20/20, `verify-analytics` 13/13, `verify-discussion` 20/20 |

### Not delivered, and why

- **The dev-server hydration defect (I-68)** -- reproduced, diagnosed as far as the symptom, and
  deliberately **not** worked around. Two independent browsers fail to hydrate against `pnpm dev` on an
  **untouched** page (the login form posts natively; the Assistant's `Send` never enables beyond its
  initial disabled state), while the same build under `next start` hydrates and every control works. The
  cause is somewhere in Next 16.3.8's Turbopack dev client plus this environment (its HMR WebSocket
  answers `net::ERR_INVALID_HTTP_RESPONSE`), and a checked-in workaround would hide a decision the team
  still has to make. Consequence for a later session: **verify UI against the production build** until
  this is closed (trap **T44**).
- **The five human-only items** -- unchanged and out of scope by the user's own instruction: the four
  fallback recordings, `demo/assets/failing-code-screenshot.png`, the three rehearsals, the Devpost
  filing, and section 5.3's per-member disclosure.

### Decisions taken

- **The FAQ's publish date is read, not synthesized** -- `faq_entries.published_at` through
  `VisibleFaqEntry` -- because `07` section 6.1 rule 1 requires a dated marker and a placeholder would be
  a claim the product cannot substantiate -- `student-visibility.ts`, `features/faq/service.ts`,
  `features/discussion/service.ts`, `discussions/page.tsx` -- logged as **H6**.
- **The demo's seeded threads are a script, not the seed** -- `demo-discussions.ts` + `reset.ps1` step 5 --
  because D81 keeps `seed.ts` narrow and these rows exist for a screen rather than for a gate -- logged as
  **H7**.
- **A thread row shows the four fields of `07` section 6.1 rule 2 and the body moves to the detail view**
  -- because rendering the opening post in the row made the list look like the thread while the rest of it
  was unreachable -- logged as **H8**.
- **The register, the trap set and the handoff state were updated in this session rather than left to the
  next** -- `05-ISSUES.md` (I-64..I-67 resolved, I-68/I-69 opened), `03-INVARIANTS.md` (T44, T45),
  `02-DECISIONS.md` (H6-H8).

### Invariants touched

- **C4 and A-ID-5: honoured, and not weakened.** The thread-detail page renders `body === null` for a
  hidden or removed post rather than filtering, so the builder remains the only thing that decides who may
  read what, and the page adds no author field of its own. The new reply composer sends `{ body,
  parentPostId: null }` and never an author.
- **C3: honoured.** The reply path goes through the same `moderatorHookFor` the route already used; the
  live reply was moderated and rendered, so the composer reports the server's decision rather than
  optimistically rendering a post.
- **T3 (gate rule G1): honoured.** Both new pages run `loadWorkspace` before reading anything, and both
  check the addressed row's own assignment against the URL -- the same order the API routes use.
- **T35: honoured.** `features/workspace/presentation.ts` imports **types only** (`QueryStatusApi`), so
  the three client components that need it do not pull the query layer into the browser bundle.
- **T42: honoured.** No count from this session is quoted in `docs/**`; the session log quotes the test
  count only beside the command that produces it.

### Discovered traps for later phases

- **T44** -- a page can render correctly and be completely inert, and no acceptance run can tell -- bites
  any session that verifies UI in a browser, and every rehearsal -- verify against `next start`, and prove
  hydration before concluding a component is broken.
- **T45** -- a demo script's "setup requirement" is a claim about the database that nothing checks -- bites
  any beat whose script says a row "exists" -- turn each one into a command and run it from the reset
  script.

### What I could not verify

- **Whether I-68 has a product-side fix at all** -- I verified the symptom in two browsers and the
  contrast against production, and none of the three plausible causes (the failing HMR socket, the
  `instrumentation.ts` edge-runtime warnings, a client-runtime error) produced a console error to work
  from. **What would settle it**: a Turbopack dev run in a browser outside this environment, or a dev
  server started with the webpack bundler (`next dev --webpack`) to see whether the HMR path is the
  variable.
- **The demo under the dev server** -- all interaction evidence came from port 3100. If the team keeps
  `pnpm dev` as the run sheet's command, the rehearsal is the thing that has to establish it, and I-68
  says what to look for.
- **The tutor side of the new pages** -- out of scope here; the tutor Discussions and Queries screens are
  session 08's `buildTutorDiscussion`/`buildTutorQueryGroups` consumers and were not touched or opened.
