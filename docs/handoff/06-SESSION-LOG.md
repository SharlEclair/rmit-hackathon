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