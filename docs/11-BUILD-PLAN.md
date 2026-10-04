# 11 -- Build Plan

**Purpose.** Turn the committed scope in [`02-SCOPE.md`](02-SCOPE.md) into sequenced, verifiable work that four people can finish in one hackathon weekend.

**Status of the repository at the time of writing.** Documentation only. `app/` does not exist. The repository **is** under version control: `origin` is `https://github.com/SharlEclair/rmit-hackathon-demo.git` and history stands at 7 commits (HEAD `da00f71`). What remains genuinely unstarted in WP-01 is the application skeleton, the package manifest and the typecheck/lint configuration -- not `git init`. Public visibility of the remote is not verified (an anonymous fetch returns HTTP 404).

> **Superseded at the Phase 7 freeze (`24bdf64`'s successor).** The paragraph above is the state at the
> time of writing and is kept as history. What is true now: `app/` **exists and is built** through Phase 6,
> the repository is **public** (an anonymous GitHub API fetch returns `private=false,
> visibility=public`) which resolves the doubt above, and **every commit is dated `2026-10-04`**
> (`git log --format=%ad --date=short | sort -u` returns one date). The commit count is deliberately not
> restated -- see `handoff/03-INVARIANTS.md` **T42** for why. WP-01 through WP-11 are complete and WP-12 is
> partly done; the per-packet state is in [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) S5.2.

**Rules this plan obeys.** `AGENTS.md` S2 (C1-C8), S4.3 (verify before claiming), S7 (hackathon obligations); `CONTRIBUTING.md` S2 (commit conventions) and S4 (definition of done).

---

## 1. Time budget and the central realism constraint

### 1.1 Available time

| Window | Hours | Notes |
|---|---:|---|
| Friday evening, after the opening ceremony | 5 | Setup only. Nobody writes features tonight. |
| Saturday on campus (rooms open 9:00 AM, close 5:00 PM) | 8 | The only window with all four people in one room. Use it for the integration-heavy packets. |
| Saturday evening, remote | 6 | Parallel work, weakest for integration. |
| Sunday morning (rooms open 9:00 AM, submissions 12:00 PM) | 3 | **Freeze at 11:00 AM**, submit by 11:30 AM, present at 1:00 PM. |
| **Total calendar hours** | **22** | |

Four people x 22 hours = **88 person-hours of calendar presence**, which is not the same as 88 hours of productive work. Meetings, integration stalls, food, a bad merge and one unexplained bug will eat a third of it. See S1.3.

### 1.2 Effort in this plan

The packets below total **69 hours of focused pair-effort**. "Focused pair-effort" means: the estimate assumes two people who know the codebase, working without interruption, on work that is already specified by the docs. It is not an elapsed-clock estimate for a lone developer, and it is not padded to fill the weekend.

**A hard-frozen deliverable list is not a schedule.** 69 hours against roughly 59 usable person-hours is tight but achievable *only* by keeping parallel tracks disjoint (S6.2) and cutting from the bottom of [`02-SCOPE.md`](02-SCOPE.md) S3 when a gate slips, rather than extending the deadline.

### 1.3 What is not in the 69 hours

Not estimated, and not fake-estimated: reading the docs, deciding anything that is still open, debugging environment problems, resolving merge conflicts, writing the Devpost text, rehearsing the demo, and waiting for a model API. Budget these out of the calendar, not out of the packets. Rehearsal is a packet (WP-12) precisely so it cannot be treated as free.

### 1.4 Cut order when a gate slips

Cut from the top of this list downward, and amend [`02-SCOPE.md`](02-SCOPE.md) S4 in the same commit:

1. CV-5 rich analytics histogram
2. CV-4 Map-node page deep link
3. CV-3 AI moderation flag (keep the tutor moderation queue)
4. CV-2 proactive milestone message
5. CV-1 ambiguity flag
6. Rich analytics beyond per-milestone aggregates
7. Tutor Query channel (keep Discussion and FAQ)

**Never cut:** the guardrail, tutor approval, the verbatim brief, and the refusal path. Those are the product.

---

## 2. Work packets

Twelve packets, WP-01 to WP-12. Each is independently verifiable. "Owner" is the track, not a person (S6.2).

**Route paths in this plan are illustrative. `06-DATA-MODEL.md` S5 is the single source of truth (D51).** The corpus in this doc is deliberately flatter than the contract: it says "the upload endpoint" where the contract says `POST /api/tutor/assignments/{assignmentId}/sources`, and "the assistant endpoint" where the contract says `POST /api/student/assignments/{assignmentId}/assistant/messages`. Before implementing any route, read the endpoint index in `06` S5.4 and use its path, method, role and failure codes; where a directory sketch here and a path there disagree, `06` governs and this doc is the bug. Nothing here should be copied into a route handler as-is. Every divergent sketch in this plan, and the one in `04` section 9.2 step 1, is mapped to its section 5.4 target in `06` section 10 item 17 (**D70**); that mapping is the authority for reconciliation.

Primitives used by the gates:

```text
app/                    the only place application code lives (D44)
pnpm dev                starts the app on http://localhost:3000
pnpm typecheck          tsc --noEmit
pnpm lint               eslint
pnpm test               vitest run
pnpm demo:smoke         scripted end-to-end check of the demo loop (created in WP-12)
```

---

### WP-01 -- Repository, toolchain and walking skeleton

**Status (Phase 1, complete).** WP-01 landed in Phase 1 (`git tag phase-01-complete`). Every deliverable in the table below exists, and the verification gate was **run**, not read:
- `pnpm install`, `pnpm typecheck` (with `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`), `pnpm lint` (eslint plus the `04` S5.9 C8 endpoint gate) all pass.
- `pnpm db:migrate` applies `0001_baseline` and reports no pending migrations on a second run; the ledger, the ordering and the checksum-immutability guard were each exercised, and the head check aborts with exit 78 when a migration is pending.
- `pnpm dev` serves `/` and `/api/health` reports `{"ok":true,"db":"up","llmProvider":"gemini","commit":"<sha>"}`. With `DATABASE_URL` removed from `.env` the same process stays up and reports `{"ok":false,"db":"down",...}`. `pnpm build` compiles and `pnpm start` runs the migration-head check before serving.
- Deviations from this packet's letter, all recorded: migrations are applied by `src/lib/db/migrate.ts` rather than drizzle-kit (**D74**); Tailwind v4 is CSS-first with `@config` (**D75**); the lint stack is eslint 9 with `@babel/eslint-parser` because every `typescript-eslint` package refuses the pinned `typescript 7.0.2` (**D78**); `DATABASE_URL` absence is degraded rather than fatal (**D77**).
- `docs/fixtures/` landed with WP-02 (see that packet's status).

**Goal.** A public GitHub repository with commit history, and an `app/` that boots, serves one page, reads its configuration, and can reach Postgres.

**Effort.** 5 h. (The `git init` + public repo + first commit step was already done before Phase 1; the repository was not re-initialised.)

**Deliverables**

| File | What it is |
|---|---|
| `.gitignore` *(exists; verify it covers `.env`, `cookies.txt`, `.storage/`, `out/`, `node_modules/`, `.next/`)* | Secret and artefact exclusion (C7) |
| `app/package.json` | Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `db:migrate`, `db:seed` |
| `app/tsconfig.json` | `strict: true` |
| `app/next.config.ts`, `app/tailwind.config.ts`, `app/postcss.config.mjs` | Build configuration |
| `app/.env.example` | Symlink-by-convention pointer to the root `.env.example` contract; must not diverge |
| `app/src/app/layout.tsx`, `app/src/app/page.tsx` | Minimal shell |
| `app/src/app/api/health/route.ts` | Returns `{ ok, db, llmProvider, commit }` |
| `app/src/lib/config.ts` | The only reader of `process.env`; typed, validated at boot, fails loudly on a missing required var |
| `app/src/lib/db/client.ts` | Postgres connection |
| `app/src/lib/db/migrations/0001_baseline.sql` | Empty-but-applied baseline so the migration runner is exercised |
| `app/src/lib/db/migrate.ts` | Migration runner over `app/src/lib/db/migrations/*.sql` |
| `app/compose.yaml` | Optional Postgres container for a machine with no native install. Maps host port **5433**, not 5432, so it cannot collide with the native service that `12` S3.3 adopts as the primary development database (D66). Path A only; not required when path C is in use |
| `app/README.md` | How to run it; link to `docs/12-OPERATIONS.md` |

**Dependencies.** None. This is the root of the graph.

**Effort.** 5 h. (The `git init` + public repo + first commit step is **already done** and was satisfied outside this packet: `origin` is set and 7 commits exist. Do not re-initialise the repository.)

**Verification gate**

```bash
cd app && pnpm install && pnpm typecheck && pnpm lint
pnpm db:migrate
pnpm dev
curl -s http://localhost:3000/api/health
# Expected: {"ok":true,"db":"up","llmProvider":"mock","commit":"<sha>"}
git log --oneline          # at least 3 commits, all inside the event window
git remote -v              # origin -> a public GitHub URL
```

**Acceptance criteria**
- [x] `git init` was run, a GitHub remote exists, and the first commit is inside the hackathon window (`AGENTS.md` S7). **Done:** `origin` = `https://github.com/SharlEclair/rmit-hackathon-demo.git`, 7 commits, HEAD `da00f71`. Public visibility still unverified (anonymous fetch returns HTTP 404).
- [ ] `/api/health` reports `db: "up"` with `DATABASE_URL` set and `db: "down"` with it unset, without crashing the process.
- [ ] `app/src/lib/config.ts` is the only module that reads `process.env`; every variable name matches [`.env.example`](../.env.example) exactly (see [`12-OPERATIONS.md`](12-OPERATIONS.md) S2).
- [x] `git remote -v` shows the GitHub remote, and `git log --format=%cI` contains dates inside the hackathon window. **Done** (verified read-only); visibility, not existence, is the open item.
- [ ] With `LLM_PROVIDER=mock`, no API key is required and the app boots offline.
- [ ] `pnpm typecheck` and `pnpm lint` pass with zero errors.
- [ ] `.env`, `cookies.txt` and `.storage/` are untracked (`git status --porcelain` shows none of them).

**Spec owner.** `04` S2-3, `12` S1-4.

---

### WP-02 -- Data model, migrations and the demo fixture

**Status (Phase 1, complete).** Every deliverable exists and the gate was run from a clean schema: `drop schema public cascade` / `create schema public`, then `pnpm db:migrate` (10 applied, 0 already applied) and `pnpm db:seed` twice. The second run inserted **0** rows and a whole-database row-count comparison across all 34 base tables was **identical**, so idempotency is proven rather than asserted. `pnpm test -- tests/db` passes 15 tests. `scripts/verify-schema.ts` reports no drift across 33 tables and 444 columns. Two corrections were made to this packet's own gate in Phase 1 (**I-18**, **I-21**): the column is `publication_status` and the predicate must accept `PUBLISHED`, because gate G1 makes PUBLISHED the only student-visible status (**D81**). The fixture is realised as 36 fixture-driven students plus the interactive demo account (**D82**), and `cohort-seed.json`'s unused 37th entry is **I-23**.

**Goal.** Every entity in the data model exists as a migration, and the seed script produces a complete, deterministic demo state: one course, one tutor, 37 synthetic students, one assignment with approved structure, and reproducible activity.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/lib/db/migrations/0002_core.sql` and following | courses, users, enrolments, assignments, documents, source_chunks, requirements, rubric_sections, assignment_map_nodes, milestones, checklist_items, checklist_progress, ai_policies, faq_entries, queries, query_messages, discussion_threads, posts, post_flags, moderation_flags, analytics_events |
| `app/src/lib/db/types.ts` | Row and insert types generated by hand or by a codegen step committed to the repo |
| `app/src/lib/db/queries/*.ts` | One module per domain; the only place SQL lives |
| `app/src/features/seed/demo-assignment.ts` | The fixture content: brief text, rubric, AI policy, approved milestones and checklist, FAQ entries, the seeded ambiguity flag |
| `app/src/features/seed/generate.ts` | Deterministic synthetic cohort activity (seeded PRNG, fixed seed constant) |
| `docs/fixtures/demo-brief.pdf`, `docs/fixtures/demo-rubric.pdf`, `docs/fixtures/demo-ai-policy.md`, `docs/fixtures/cohort-seed.json` | The committed demo fixture material: text-layer brief PDF, rubric, AI-use policy document, and the reproducible cohort seed (**D46**) |
| `app/scripts/seed.ts`, wired to `pnpm db:seed` | Idempotent: re-running produces the same state |

**Dependencies.** WP-01.

**Effort.** 4 h.

**Verification gate**

```bash
cd app
pnpm db:migrate                       # idempotent: run twice, second run is a no-op
pnpm db:seed
pnpm db:seed                          # run twice on purpose
psql "$DATABASE_URL" -c "select count(*) from users where role='student'"     # 37
# NOTE (corrected in Phase 1, twice). First: an artifact's lifecycle column is
# `publication_status`, never `status` -- `06` section 3.6 makes `assignment.status` and
# `artifact.publicationStatus` two deliberately different fields. The original query asked for
# `milestones.status`, which does not exist (issue I-18). Second: the predicate must accept
# PUBLISHED as well as APPROVED. `06` section 3.4 (gate G1) makes PUBLISHED the only
# student-visible status and `04` section 12 says the same ("only the APPROVED -> PUBLISHED
# transition is student-visible", D21), while `13-DEMO-STORY.md` beats 4-8 and the guardrail's
# PUBLISHED-only policy rule (`06` section 7.2.11) both need content a student can actually see.
# A seed that leaves the artifacts APPROVED produces a structure that is half-published under an
# already-`published` assignment, so a student sees published checklist items whose milestones are
# invisible. PUBLISHED subsumes approval -- transition 7 requires a prior APPROVED state and the
# approval stamps survive the publish -- so the intent, a tutor-sanctioned structure, is unchanged.
# See decision D81 and issue I-21. A count of PUBLISHED milestones is also asserted below.
psql "$DATABASE_URL" -c "select count(*) from milestones where publication_status in ('APPROVED','PUBLISHED')"  # >= 4
psql "$DATABASE_URL" -c "select count(*) from milestones where publication_status='PUBLISHED'"  # 5
pnpm test -- tests/db
```

Observable behaviour: after two consecutive `pnpm db:seed` runs, row counts are identical to after one run.

**Acceptance criteria**
- [ ] Every table has `id`, `created_at`, `updated_at` (`AGENTS.md` S5.3).
- [ ] Artifact lifecycle values are the six in `06` section 6.3, stored on `publication_status` as `text` + a named `CHECK`, and **never** as a Postgres `enum` type (D22, glossary S4, trap **T19**).
- [ ] Every AI-generated artifact row has a non-null `provenance` JSON column (model id, prompt version, timestamp, `groundingChunkIds`).
- [ ] The seed produces at least one milestone whose seeded elapsed time and question count both exceed the cohort average, so the difficulty signal in WP-11 has something real to compute (D34).
- [ ] The seed writes **no** real personal data. Student names are synthetic; analytics identity is `subject_ref`, the domain-separated one-way pseudonym from `06` section 4.7.1 (D27).
- [ ] Migrations are files in the repo; no schema change was made by hand against a live database.
- [ ] `pnpm db:seed` is idempotent: a second run leaves every row count identical, verified rather than asserted.

**Spec owner.** `06` S3-5, `08` S4.

---

### WP-03 -- Authentication and role scoping

**Status (Phase 1, complete).** `pnpm test -- tests/auth` passes 37 tests in 2 files; `pnpm typecheck` and `pnpm lint` are clean. The gate below was run live against `pnpm dev` and the local Postgres, with the **seeded** demo accounts: `POST /api/auth/login` for `tutor@demo.rmit` and `student@demo.rmit` returns 200 with the exact `SessionResponse` shape and an `HttpOnly; SameSite=Lax; Max-Age=43200` cookie; a wrong password and an unknown email both return an identical `401 UNAUTHENTICATED`; `/tutor` and `/student` without a cookie return **307** to `/login?next=...`; with a valid session `/tutor` returns 404 because no `(tutor)` page exists yet -- the middleware does **not** over-block; `POST /api/auth/logout` returns 204 and the session is then 401; and a last-char-flipped, first-char-flipped, truncated or empty token all return 401. Session revocation is deliberately absent (**D79**, accepted risk **I-20**). Widen the lint and test toolchain notes as recorded in **D78**.

**Goal.** Two seeded accounts can sign in; a tutor cannot see a student route and a student cannot see a tutor route.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/lib/auth/session.ts` | Sign and verify a session token with `AUTH_SECRET`; httpOnly, `SameSite=Lax`, `Secure` in production |
| `app/src/lib/auth/roles.ts` | `requireRole('tutor' \| 'student')` for server components and route handlers |
| `app/src/app/(auth)/login/page.tsx` | Sign-in form |
| `app/src/app/api/auth/login/route.ts`, `.../logout/route.ts` | Session issue and clear |
| `app/src/middleware.ts` | Route-group protection |
| `app/tests/auth/session.test.ts` | Unit tests for signing, expiry, tampering |

**Dependencies.** WP-01, WP-02.

**Effort.** 4 h.

**Verification gate**

```bash
cd app && pnpm test -- tests/auth
pnpm dev
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/tutor        # 307 to /login
curl -s -c /tmp/c.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"student@demo.rmit","password":"demo1234"}'
curl -s -b /tmp/c.txt -o /dev/null -w "%{http_code}" http://localhost:3000/tutor   # 403 or redirect
```

**Acceptance criteria**
- [ ] A tampered session cookie is rejected, and the test asserts it.
- [ ] No password is logged, and no hash or secret appears in any API response (C7).
- [ ] Tutor and student share one sign-in screen; the role decides the landing route.
- [ ] Sessions survive a server restart (stateless token), so a demo-day restart does not sign everyone out.

**Spec owner.** `04` S7, `07` S3.

---

### WP-04 -- Tutor upload, storage, extraction and offline ingestion path

**Goal.** A tutor uploads a brief and a rubric; the system stores them, extracts text, chunks it with page anchors, and produces a structured proposal through the LLM adapter -- working end to end with `LLM_PROVIDER=mock` and no network.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/lib/storage/index.ts` | Driver interface: `put`, `get`, `url`, `delete` |
| `app/src/lib/storage/local.ts` | Local filesystem driver (default, D41), rooted at `STORAGE_LOCAL_DIR` |
| `app/src/lib/storage/s3.ts` | S3-compatible driver behind the same interface; not exercised in the MVP |
| `app/src/lib/llm/index.ts` | The **only** module allowed to import a model SDK (C8, D39) |
| `app/src/lib/llm/types.ts` | `LlmProvider` interface, `LlmCallLog`, `LlmError` |
| `app/src/lib/llm/gemini.ts` | Gemini adapter (**the project default provider**, D61; model `gemini-3.8-flash`, D62) |
| `app/src/lib/llm/deepseek.ts` | DeepSeek adapter (`deepseek-flash`); **supported alternative**, not the default (D61) |
| `app/src/lib/llm/mock.ts` | Deterministic offline provider; returns the fixture proposal with a fixed seed |
| `app/src/lib/llm/schema.ts` | Zod (or equivalent) schemas for every structured LLM response; a validation failure is a refusal, not a retry (D16) |
| `app/src/features/ingest/extract.ts` | PDF text-layer extraction plus page boundaries; DOCX/PPTX accepted and extracted per `04` S6 (**O5**, **D57**); a scanned PDF with no text layer is flagged for tutor attention rather than guessed at. The rehearsed demo uses a text-layer PDF only (`02` S2.4). Reused unchanged for PDFs attached to an Assistant turn |
| `app/src/features/uploads/attachments.ts` | Student attachment intake: type and size check against the three supported modalities (PNG/JPEG, PDF, plain text), audio and video refused with a clear message at the picker, storage under a server-generated key, and a guardrail scan before the content joins the turn (**O11**, C6) |
| `app/src/features/ingest/extract-image.ts` | Image path: send the image to the multimodal model call via the adapter rather than a local OCR pipeline; `LLM_MODEL_MULTIMODAL` empty means reuse `LLM_MODEL_REASONING`, which is correct for `gemini-3.8-flash` because it is natively multimodal (**D62**; see `12` S2.3) |
| `app/src/features/ingest/chunk.ts` | Page-anchored source chunks |
| `app/src/features/ingest/pipeline.ts` | Upload -> store -> extract -> chunk -> propose structure -> persist as `AI_GENERATED` |
| `app/src/app/(tutor)/assignments/new/page.tsx` | Upload screen with per-file status |
| `app/src/app/api/assignments/route.ts`, `.../[id]/documents/route.ts` | Upload endpoints |
| `app/src/app/api/assignments/[id]/ingest/route.ts` | Starts the pipeline; returns a job id the UI can poll |
| `app/tests/llm/mock.test.ts`, `app/tests/ingest/chunk.test.ts` | Contract test for the provider interface; chunk page-anchor test |

**Dependencies.** WP-01, WP-02, WP-03.

**Effort.** 7 h. (Raised from 5 h on the O11 reversal: student image/PDF/plain-text attachments are IN, which adds the attachment intake path, the multimodal adapter call for images, and the picker's explicit refusal of audio and video. PDF and plain-text intake reuse the extraction path this packet already builds, so the increase is 2 h rather than a second pipeline.)

**Status (Phase 2, complete).** Delivered. Three corrections were made to this packet's own gate, all of the **I-18** kind (a gate that cannot run, or that asserts a state the schema forbids):

1. `# AI_GENERATED` on an `assignments.status` query was **unrunnable as stated**: `assignments.status` has `CHECK (status in ('draft','ingesting','in_review','published','archived'))` (`06` section 7.2.1), and `AI_GENERATED` is a `publication_status`, not an assignment status (`06` section 3.6, trap **T21**). A successful run leaves the assignment `in_review`.
2. `select min(page), max(page) from source_chunks` named columns that do not exist; they are `page_from` and `page_to` (`06` section 7.2.3).
3. The UI step is not available yet -- the `(tutor)` pages are WP-06/WP-07 -- so the gate now drives the same rows through `scripts/ingest-once.ts`, which stores the fixture bytes with the real driver and walks S0-S8.

Also: `src/features/uploads/attachments.ts` leaves `guardrail_scan_status` at `pending`, because the scan is Phase 3's (WP-08). The upload path therefore refuses to attach rather than attaching unscanned, which is what C6 and `06` section 5.5.9 stream rule 5 require; the packet's "guardrail scan before the content joins the turn" is satisfied by that refusal, not by a permissive placeholder.

**Verification gate**

```bash
cd app
# Offline and deterministic, no key (WP-04's acceptance criterion).
LLM_PROVIDER=mock pnpm exec tsx scripts/ingest-once.ts --fixture demo
# The same run through the routes: POST /api/tutor/assignments/{id}/sources then .../ingest.

psql "$DATABASE_URL" -c "select count(*) from source_chunks"                                  # > 0
psql "$DATABASE_URL" -c "select status from assignments order by created_at desc limit 1"       # in_review
psql "$DATABASE_URL" -c "select min(page_from), max(page_to) from source_chunks"               # non-null, sane
pnpm test -- tests/llm tests/ingest
```

Also verified without a network connection: unplug the network, repeat the upload, and the pipeline still completes.

**Acceptance criteria**
- [ ] `grep -rn "from ['\"]openai\|@anthropic\|@google/generative-ai\|ollama" app/src --include=*.ts --include=*.tsx` returns matches **only** under `app/src/lib/llm/`.
- [ ] Every structured LLM response is schema-validated; a schema failure records a refusal verdict and the pipeline reports it, without retrying (D16).
- [ ] `LLM_MAX_CALLS_PER_SESSION` is enforced and a breach fails loudly rather than looping.
- [ ] No uploaded file is served from a path a user controls; the storage key is generated server-side (path traversal).
- [ ] Uploads over `UPLOAD_MAX_BYTES` are rejected with a message that names the limit, not silently truncated.
- [ ] With `mock`, the complete upload-to-proposal path works with `DEEPSEEK_API_KEY=""` and `GEMINI_API_KEY=""`.

**Spec owner.** `04` S4-6, `05` S7, `06` S3.

---

### WP-05 -- Assignment Analyst against a live provider

**Goal.** The same pipeline, with a real model, produces a defensible proposal for the demo assignment: requirements, rubric alignment, map nodes, milestones, checklist items, FAQ candidates, an AI Usage Policy draft, and at least one ambiguity/contradiction finding.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/features/ingest/prompts/analyst.v1.ts` | The prompt, versioned as a constant. Changing it creates `v2`; never edit a shipped version |
| `app/src/features/ingest/prompts/analyst.v1.schema.ts` | The structured output contract |
| `app/src/features/ingest/analyst.ts` | Orchestration: context assembly, call, validate, persist |
| `app/src/features/ingest/policy-draft.ts` | Drafts the per-assignment AI Usage Policy from the source documents for tutor approval (D9) |
| `app/src/features/ingest/ambiguity.ts` | Detection that reports location and nature; it does not author a clarification (D23) |
| `app/src/features/ingest/prompt-constraints.ts` | Grammar guard on checklist verbs: understand / identify / plan / verify / review / note (D20, O1) |
| `app/tests/ingest/prompt-constraints.test.ts` | Fails on any item naming an implementation action |

**Dependencies.** WP-04.

**Effort.** 6 h.

**Status (Phase 4: the live run is now verified; I-35 closed).** The five passes, the prompt version,
the constraints and the offline path were delivered in Phase 2, and **Phase 4 completed the live
run**: `pnpm exec tsx --env-file-if-exists=.env scripts/ingest-once.ts --fixture demo --pace-ms 14000`
-> `ok: true`, `status: succeeded`, `stage: S7`, counts `sources 2 / chunks 24 / requirements 24 /
rubricSections 5 / milestones 5 / checklistItems 28 / faqEntries 8 / policyRules 5 / findings 4`.
Getting there needed two fixes, and neither was the provider schema; both are recorded:

1. **The `400 invalid_request` is gone.** The minimised provider-facing schema of **D91** is accepted
   live, and a structured call returns JSON that `parseStructured` accepts. The reduction was a reason
   for a year of doubt; it is now measured.
2. **The real failure was output truncation.** The ceiling for an Analyst pass was 8,192 output tokens,
   while thinking tokens are billed as output (**D73**, **D89**) and `LLM_THINKING_ANALYST=high`
   (**D62**) spends most of them thinking, so the JSON body was cut mid-string and reported as
   `LLM_OUTPUT_INVALID` with the note "the model did not return a usable structure". The default is now
   **65,536** (**D104**, trap **T32**); the diagnosis path is still thin and is **I-42**.

Two file-map deviations stand, both recorded: there is no `analyst.v1.schema.ts` and no separate
`policy-draft.ts` / `ambiguity.ts`, because the structured contract lives in the frozen
**`src/lib/llm/schema.ts`** (one module owns every structured-output schema -- the adapter's
`response_format` and the caller's validation must be the same object), and the (d)/(e) passes are
instructions in `prompts/analyst.v1.ts` plus their resolvers in `analyst.ts`. One live-run quality
finding is **I-43**: the model persisted one rubric section whose `criteria_text` is not a verbatim span
of its chunk (it abbreviated a table's dash rule), which the review surface correctly refuses to
approve.

**Verification gate**

```bash
cd app
LLM_PROVIDER=gemini GEMINI_API_KEY=... pnpm tsx scripts/ingest-once.ts --fixture demo
# Expected: a proposal JSON written to app/.scratch/proposal.json and rows persisted
pnpm test -- tests/ingest/prompt-constraints
```

Observable behaviour, checked by a human, not a script: open the proposal and read the checklist items aloud. If any item names an implementation action ("add the endpoint", "fix the loop"), the packet is not done.

**Acceptance criteria**
- [ ] For the demo assignment, the proposal contains 3-6 milestones and 3-6 items each (O1).
- [ ] Every checklist item's verb is in the allowed set; the test enforces it against the real output.
- [ ] Every map node carries a `groundingChunkIds` reference and a source page (D18, D43).
- [ ] The ambiguity finding names a location and a nature, and contains no proposed clarification text (D23).
- [ ] Three consecutive runs on the same input converge on the same structure, with wording variation the only difference. Record the runs in the PR description.
- [ ] Every produced artifact is `AI_GENERATED` and carries provenance. Nothing is student-visible.

**Spec owner.** `03` S4-5, `05` S6-7, `04` S5.

---

### WP-06 -- Tutor review, amendment and approval

**Status (Phase 4, complete, with the UI half named as partial).** The state machine, the query layer,
the six tutor routes and one student read landed in Phase 4; the review **page** did not. What was run
and what was not is recorded below the acceptance criteria rather than left implied.

**Goal.** The tutor reads the proposal, edits it, discards what is wrong, approves what is right, and the approval is what makes content student-visible. Amending an approved artifact returns it to review.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/features/review/transitions.ts` | The state machine `AI_GENERATED -> NEEDS_REVIEW -> EDITED -> APPROVED -> PUBLISHED` plus `REJECTED`, all in one place (D22) |
| `app/src/features/review/actions.ts` | The tutor actions: the ordering of the checks, the write, and the audit row |
| `app/src/lib/db/queries/review.ts` | The review reads and the revision-guarded artifact writes (migration `0012`, D98) |
| `app/src/lib/db/queries/student-visibility.ts` | Gate rule G1 as a query-layer predicate (T3, D99) |
| `app/tests/review/` | The state machine and the pure review rules |
| `app/scripts/verify-review.ts` | WP-06's gate over HTTP, against the live database |
| `app/src/app/(tutor)/assignments/[id]/review/page.tsx` | The review surface: sources beside artifacts, per-artifact status, inline edit -- **NOT DELIVERED in Phase 4** (see the status note) |
| `app/src/components/ai-provenance-badge.tsx` | The literal string `AI generated - requires tutor approval` in every review state (C3) -- **NOT DELIVERED in Phase 4** |

**Dependencies.** WP-02, WP-05.

**Effort.** 6 h.

**Verification gate**

```bash
cd app && pnpm test -- tests/review          # the state machine and the pure rules, offline
pnpm exec tsx --env-file-if-exists=.env scripts/verify-review.ts
# Drives the whole gate over HTTP against a running server and a migrated database:
#   1. a NEEDS_REVIEW assignment is NOT_FOUND to a student (G1, before approval);
#   2. approving does not change that -- APPROVED is still not student-visible (D99);
#   3. publishing makes the same request 200, and the student sees only PUBLISHED artifacts;
#   4. editing a PUBLISHED artifact returns it to EDITED and the student request is 404 again
#      (transition 8, T-18);
#   5. two PATCHes with the same expectedRevision produce one 200 and one 409 STALE_REVISION (T-19);
#   6. PATCHing verbatimText is 409 IMMUTABLE_FIELD (C2, I-2);
#   7. a rule code with no guardrail mapping is refused at write time (T22, D101).
```

**Acceptance criteria**
- [x] A student-facing request for a non-`PUBLISHED` artifact returns 404 and never its content. **The
  predicate is `PUBLISHED`, not `APPROVED`** (D99): `06` section 3.4 (G1), section 3.1 and D21 make
  `PUBLISHED` the threshold, and WP-06's original wording here ("non-`APPROVED` ... approve in the
  tutor UI, repeat: 200") treated `APPROVED` as it, which would have been a second visibility rule.
  Verified by `scripts/verify-review.ts` steps 1-4.
- [ ] The AI provenance badge and the exact string `AI generated - requires tutor approval` are
  present in every pre-approval state (C3). **Not delivered:** the review page is not built, so the
  string exists nowhere in `app/`. The API carries the data the badge needs
  (`ReviewArtifactResponse.publicationStatus`, `origin`, `provenance`).
- [x] Editing an `APPROVED` or `PUBLISHED` artifact moves it to `NEEDS_REVIEW` and hides it from
  students. **The transition is to `EDITED`, not `NEEDS_REVIEW`** -- `06` section 3.2 rows 6 and 8 are
  the authority, and the effect G1 cares about is identical: the artifact leaves student-visible reads
  immediately. The transition test covers it, and `scripts/verify-review.ts` step 4 verifies it
  against the database.
- [x] `REJECTED` artifacts are retained in the database, not deleted (glossary S4). `DELETE
  /api/tutor/structure-artifacts/{artifactId}` writes `REJECTED` and leaves `deleted_at` null, so the
  row is still readable through the review bundle with its provenance.
- [x] The AI Usage Policy cannot be approved as an empty string; a tutor must supply text. Enforced by
  `ck_ai_policy_rules_rule_text_length` (10-600) and by `ruleText` validation on the create route.
- [x] The API returns 409 on an illegal transition with the attempted transition named in the body.
  `resolveTransition`'s refusal message names the status and the action, and `apiError` carries it in
  `error.message`.

**Spec owner.** `06` S3, `07` S5, `05` S5.

**Phase 4 status note.** Three things this packet's letter asks for are not done, and each has a
recorded reason rather than a note implying it is nearly finished:
1. **The review page.** Phase 4 delivered the boundary and the contract behind it, not the surface.
   Owner: the next UI phase (WP-07's track, which already owns `src/app/(student)/**` and
   `src/components/**`, now also owns the tutor surface).
2. **`ai-provenance-badge.tsx`.** It belongs with the page; without a rendered artifact there is no
   pre-approval state to badge. The string is fixed in `07` section 2.5.
3. **A live model call.** Phase 4 makes none: reviewing, approving and publishing are deterministic.
   That is deliberate, and it is why the whole gate runs under `LLM_PROVIDER=mock` or with no provider
   configured at all.

---

### WP-07 -- Student workspace: verbatim brief, Assignment Map, checklist

**Goal.** A student opens the assignment, reads the original brief with its page structure intact, navigates the approved Assignment Map, and starts a milestone so elapsed time begins accruing.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/app/(student)/dashboard/page.tsx` | Assignment list |
| `app/src/app/(student)/assignments/[id]/layout.tsx` | Workspace shell with tab navigation |
| `app/src/app/(student)/assignments/[id]/brief/page.tsx` | Renders the original document verbatim, with no re-authoring layer between the PDF and the screen (C2, D17) |
| `app/src/components/document-viewer/pdf-page-view.tsx` | Page-rasterised viewer with page navigation |
| `app/src/components/document-viewer/page-anchor.tsx` | "View in original" affordance with the page number visible |
| `app/src/app/(student)/assignments/[id]/map/page.tsx` | Assignment Map, visually distinct from the brief, carrying the visible label `Assignment Map (AI-generated interpretation)` (D18, glossary S2) |
| `app/src/features/map/tree.ts` | Builds the Map tree from approved nodes |
| `app/src/app/(student)/assignments/[id]/checklist/page.tsx` | Milestones, items, `start` / `complete`, per-item elapsed time |
| `app/src/features/progress/elapsed.ts` | Start and complete timestamps; elapsed wall-clock, idle included (D33) |
| `app/src/app/api/progress/route.ts` | Checklist progress writes |
| `app/tests/progress/elapsed.test.ts` | Property test: elapsed is never negative; it includes idle gaps |
| `docs/fixtures/` (demo-brief.pdf, demo-rubric.pdf, demo-ai-policy.md) | The committed ingestion inputs; the demo brief is a text-layer PDF so extraction and page anchors are real (**D46**) |

**Dependencies.** WP-02, WP-06.

**Effort.** 7 h.

**Verification gate**

```bash
cd app && pnpm test -- tests/progress
pnpm db:seed && pnpm dev
# In the browser:
#   1. The brief tab shows the original document page by page, and the text matches the PDF.
#   2. The map tab is visually distinguishable from the brief and carries its interpretation label.
#   3. Start a milestone, wait 60 seconds, complete one item; the UI shows elapsed time > 60s.
psql "$DATABASE_URL" -c "select started_at, completed_at from checklist_progress where completed_at is not null limit 1"
```

**Acceptance criteria**
- [ ] **No requirement text appears anywhere in the UI as prose written by us or by a model.** Requirements appear only inside the document viewer or quoted verbatim with a page reference (C2, D17).
- [ ] The string "time worked" or "time on task" appears nowhere in `app/src`; the label is "elapsed time" (D33, glossary S2).
- [ ] The Map is never rendered without its interpretation label.
- [ ] Map and checklist are separate screens, not one list (D19).
- [ ] A student cannot mark an unapproved item complete; the API rejects it.
- [ ] A page-anchor tap opens the correct page of the brief. If CV-4 was cut, the anchor affordance is absent entirely rather than present-but-broken.

**Spec owner.** `07` S4, `06` S2, `08` S4.

---

### WP-08 -- Guardrail: the policy layer and the golden set

**Status (Phase 3, complete).** `app/src/lib/guardrail/` exists with the twelve modules of `05`
section 12.1 (plus `policy-source.ts`, `refusal-copy.ts` and `log.ts`), and the gate was **run**, not
read: `pnpm test -- tests/guardrail` -> **232 tests in 9 files, all passing, 1.44 s, with no network
and no provider key**. All **53** cases of the golden set (`05` section 11.6, G01-G53) execute with
no `MODALITY` skip marker and no excluded case: 30 `REFUSE`, 15 `ALLOW`, 2 `ALLOW_WITH_SCOPE`,
3 `CLARIFY`, 3 `ESCALATE_TO_TUTOR`, asserted against section 11.5's own distribution table in
`tests/guardrail/golden-set.test.ts`. The layer semantics of section 11.4 are asserted as **call
counts**: a `DET` refusal consults no adapter at all, a `DET+EXTRACT` case makes exactly one
extraction call against a real attachment, a `MODEL` case makes exactly one classifier call, and a
`PICKER` case makes none of either. `R1`, `R2`, `R3`, `R9`, `R11` and `R13` are checked over every
refusal-shaped rendering, and `G01`'s `T-REFUSE` text is byte-pinned.

**What is deliberately not verified here.** (a) The six upload attachments are real PNG/PDF/MP3/MP4
files whose `UP1`-`UP4` codes are **recorded in `docs/fixtures/attachments/manifest.json`** and
verified by hash, not produced by a live vision model (**I-30**): the modality cases execute, but the
live classification path they exist to exercise is Phase 2's. (b) The L4 classifier is reached
through a **port** (`GuardrailClassifierPort`, **D87**) because `src/lib/llm/` was Phase 2's and did
not exist when this phase ran; wiring the adapter is a later phase's change. (c)
`pnpm test --coverage`, this packet's second gate line, could not run: no coverage provider is
installed (**I-31**). (d) `pnpm lint` and `pnpm typecheck` were red at the phase boundary because of
files a concurrent Phase 2 session owns (**I-34**); the scoped commands
(`pnpm exec eslint src/lib/guardrail tests/guardrail`, `node scripts/check-c8.mjs`) are clean.

**Goal.** A student request is classified by deterministic code into one of five verdicts, with the rule cited, before any model call. Prohibited and derived-effort requests are refused with a safe alternative offered. The behaviour is covered by a golden set that includes laundering attempts.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/lib/guardrail/policy.ts` | Pure functions: request -> verdict. No network, no database, no clock |
| `app/src/lib/guardrail/rules.ts` | The rule table: id, pattern or predicate, verdict, cited authority, refusal copy key |
| `app/src/lib/guardrail/policy-source.ts` | Parses the approved per-assignment AI Usage Policy into enforceable rule inputs (D9) |
| `app/src/lib/guardrail/types.ts` | `Verdict = ALLOW \| ALLOW_WITH_SCOPE \| CLARIFY \| REFUSE \| ESCALATE_TO_TUTOR` and the decision record |
| `app/src/lib/guardrail/log.ts` | Structured decision log: verdict, rule id, prompt version, timestamp. **No student content in plaintext** (`AGENTS.md` S6.5) |
| `app/src/features/assistant/refusal-copy.ts` | The refusal wording, per rule class |
| `app/tests/guardrail/golden/*.cases.json` | The golden set |
| `app/tests/guardrail/policy.test.ts` | Runs the golden set; runs with no network |
| `docs/05-AI-GUARDRAILS.md` *(owned by the tech track; this packet supplies its test evidence)* | Rule table and decision procedure |

**Dependencies.** WP-02.

**Effort.** 8 h. (Raised from 7 h on the O11 reversal: the upload sub-guard cases G36 and G38 were previously marked `MODALITY` and skipped. With image, PDF and plain-text attachments in scope they must execute for real, which adds the attachment fixture and its expected `UP1`-`UP4` outcomes to the harness.)

**Verification gate**

```bash
cd app
pnpm test -- tests/guardrail          # runs offline; no provider key set
# Expected: all golden cases pass, including the laundering cases
pnpm test -- tests/guardrail --coverage
```

Observable behaviour: with the network cable unplugged, the guardrail test suite still passes in full.

**Acceptance criteria**
- [ ] All **53** cases of the golden set (`05` S11, G01-G53) execute and pass: 18 prohibited, 19 allowed, 12 ambiguous/attack, 4 upload modality. No case carries a `MODALITY` skip marker, because O11 ships the modalities those cases assert against. The set must include, at minimum: a direct request to debug student code; "just check my approach"; hypothetical framing; a step-by-step decomposition request; a request laundered inside a quoted assignment sentence; a legitimate rubric-interpretation question that must be allowed; an ambiguous request that must be `CLARIFY`; and a request that must `ESCALATE_TO_TUTOR`.
- [ ] The default path on any unparseable or unclassified input is `REFUSE` or `NEEDS_REVIEW`, never `ALLOW` (`AGENTS.md` S6.1, D8).
- [ ] The whole suite passes with no network access and no API key.
- [ ] Every verdict carries the rule id that produced it.
- [ ] No golden case or log line contains a real student name, real student work, or a secret.
- [ ] A request refused because of the assignment's policy names the policy, not a generic platform rule.
- [ ] The upload sub-guard cases run rather than skip: with image, PDF and plain-text attachments in scope (**O11**), the modality golden cases execute against a real attachment and assert the `UP1`-`UP4` outcome. A case that marks itself `MODALITY` and skips is now a defect, not a documented gap (`05` S6.4). Audio and video cases assert refusal at the picker with no model call.

**Spec owner.** `05` S3-8, `AGENTS.md` S6.

---

### WP-09 -- AssignMate: grounding, refusal path and proactive message

**Goal.** The student talks to one coach. Permitted questions are answered from approved content with citations to the highest truth tier available. Prohibited questions hit the refusal path from WP-08 and are not softened by the model. One proactive message appears per milestone from approved content only.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/features/assistant/context.ts` | Assembles the truth-ordered context: T1 brief and rubric, T2 approved policy and FAQ, T3 approved milestones and checklist, then the student's own query thread (O9). Raw discussion is never included (O10) |
| `app/src/features/assistant/retrieve.ts` | Postgres full-text retrieval over approved chunks only (D38) |
| `app/src/features/assistant/answer.ts` | Calls the guardrail first, then the provider, then validates the structured response (D16) |
| `app/src/features/assistant/proactive.ts` | Exactly one message per milestone, max 3 bullets, dismissible, never repeated (O2) |
| `app/src/components/assistant-fab.tsx` + `assistant-panel.tsx` | The single conversational surface, available across workspace tabs (handoff S74) |
| `app/src/app/api/assistant/route.ts` | The one endpoint; refuses without calling the model when the verdict is `REFUSE` |
| `app/tests/assistant/grounding.test.ts` | Asserts that a T4 discussion post can never appear in the grounding set |
| `app/tests/assistant/refusal-path.test.ts` | Asserts that a `REFUSE` verdict results in **zero** provider calls |

**Dependencies.** WP-06, WP-07, WP-08.

**Effort.** 5 h.

**Verification gate**

```bash
cd app && pnpm test -- tests/assistant
# Then, manually, the demo refusal:
#   Student message: "Here's my code, tell me what's wrong with it."
#   Expected: refusal naming the assignment's AI Usage Policy, plus an offer of what it can help with.
#   Expected in the log: one decision record, verdict REFUSE, rule id cited.
#   Expected in the provider call log: zero calls for that turn.
```

**Acceptance criteria**
- [ ] A `REFUSE` verdict produces zero model calls. The test asserts the call count, not just the response text.
- [ ] An answer cites the source it used, and the citation tier is the highest available (D14).
- [ ] No answer paraphrases a requirement and presents it as the requirement. Where the brief is quoted, it is quoted (C2).
- [ ] The proactive message appears exactly once per milestone, is dismissible, and never reappears after dismissal (O2).
- [ ] The Assistant is reachable from every workspace tab through one surface, and the UI never names an internal capability as an agent or model (D13, glossary S5).
- [ ] With `mock`, the assistant answers the scripted demo questions deterministically and the UI states that the offline provider is active.

**Spec owner.** `05` S5-8, `03` S7, `07` S4.7.

---

### WP-10 -- Queries, anonymous discussions, moderation and FAQ publishing

**Goal.** The shared-knowledge path works: a student asks privately and gets a private reply; a student posts anonymously and the tutor cannot see who they are; the tutor moderates and publishes an answer to the Official FAQ.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/features/discussion/anonymity.ts` | HMAC per (student, assignment) keyed by `ANON_ID_SECRET`; renders `Anonymous Student #N` (D27, glossary S1) |
| `app/tests/discussion/anonymity.test.ts` | Same pair -> same pseudonym; different assignment -> different pseudonym; the key is never derivable from the display value |
| `app/src/features/discussion/moderation.ts` | Advisory flag: severity plus reason code. Never deletes (D28) |
| `app/src/app/(student)/assignments/[id]/queries/page.tsx` + `.../discussions/page.tsx` + `.../faq/page.tsx` | Student surfaces |
| `app/src/app/(tutor)/assignments/[id]/queries/page.tsx` | Grouped by milestone; private Reply (D24, T8) |
| `app/src/app/(tutor)/assignments/[id]/discussions/page.tsx` | Moderation queue, approve / reject / remove, and Publish to FAQ (D24, D29) |
| `app/src/app/api/queries/*`, `app/src/app/api/discussions/*`, `app/src/app/api/faq/*` | Endpoints, with the anonymity guarantee enforced in the query layer, not the template |
| `app/tests/api/no-identity-leak.test.ts` | Every tutor-facing and analytics-facing endpoint that returns posts is asserted not to return an author id or name |

**Dependencies.** WP-03, WP-06.

**Effort.** 6 h.

**Verification gate**

```bash
cd app && pnpm test -- tests/discussion tests/api
# Manual, as the tutor account, on a thread the student posted anonymously:
#   - The UI shows Anonymous Student #N.
#   - The network tab shows no author id in any response.
#   - Sorting by author is not offered.
# Then Publish an answer and confirm it appears in the student FAQ tab.
```

**Acceptance criteria**
- [ ] No tutor-facing response body contains an `author_id`, `author_name` or email for an anonymous post. The test enumerates the endpoints rather than trusting one.
- [ ] Pseudonyms are stable within an assignment and unlinkable across assignments (D27).
- [ ] A student can edit and delete only their own post (D28).
- [ ] AI moderation flags; it never removes content. Removal is a tutor action (D28).
- [ ] One flag per user per post is enforced by a unique constraint (D30).
- [ ] Only a tutor can Publish; the endpoint rejects a student session with 403.
- [ ] An approved student answer is **not** auto-published (O8); promotion is a separate explicit action.

**Spec owner.** `07` S5-6, `06` S4, `05` S9.

---

### WP-11 -- Assignment Health analytics

**Goal.** The tutor sees per-milestone aggregate insight, and the system names one milestone as a potential difficulty area because it has both above-average elapsed time and above-average question volume. No individual is identifiable anywhere.

**Deliverables**

| File | What it is |
|---|---|
| `app/src/features/analytics/aggregate.ts` | Per-milestone resolution rate, average elapsed time, question count |
| `app/src/features/analytics/k-anonymity.ts` | Buckets with fewer than 5 contributing students render as `Insufficient data` (D32, glossary S1) |
| `app/src/features/analytics/difficulty.ts` | The combined signal; returns evidence and stops, with no recommended action (D35) |
| `app/src/app/(tutor)/assignments/[id]/health/page.tsx` | The Assignment Health view, with a prominent demo-data marker |
| `app/src/app/api/analytics/route.ts` | Aggregate-only response shape; no student identifiers in the type |
| `app/tests/analytics/k-anonymity.test.ts` | A 4-student bucket renders `Insufficient data`; a 5-student bucket renders a value |
| `app/tests/analytics/difficulty.test.ts` | High time alone does not qualify; high questions alone does not qualify; both together does (D34) |

**Dependencies.** WP-02, WP-07, WP-10.

**Effort.** 5 h.

**Verification gate**

```bash
cd app && pnpm test -- tests/analytics
pnpm db:seed && pnpm dev
# As the tutor, open Assignment Health.
# Expected: a per-milestone table; at least one potential difficulty area; at least one
#           "Insufficient data" cell proving the floor is live, not theoretical.
curl -s -b /tmp/tutor.txt http://localhost:3000/api/analytics | grep -Ei "student_id|email|name" && echo "LEAK"
```

**Acceptance criteria**
- [ ] The analytics response type contains no per-student field. A grep of the route and the aggregate module for `student_id` outside of grouping returns nothing student-identifying.
- [ ] Any bucket below 5 contributors renders `Insufficient data` (D32).
- [ ] The difficulty signal requires both conditions and states its evidence; it recommends no intervention (D34, D35).
- [ ] The screen carries a visible marker that the cohort data is synthetic (`13` S9, [`02-SCOPE.md`](02-SCOPE.md) S5).
- [ ] Elapsed time is labelled "elapsed time" (D33).

**Spec owner.** `08` S2-5, `06` S5.

---

### WP-12 -- Demo hardening, rehearsal and submission freeze

**Goal.** The demo runs from a clean checkout on the venue network, with a rehearsed fallback for every beat, and the submission is filed before the deadline.

**Deliverables**

| File | What it is |
|---|---|
| `app/scripts/smoke.ts` wired to `pnpm demo:smoke` | Walks the full loop headlessly or semi-headlessly and exits non-zero on failure |
| `docs/13-DEMO-STORY.md` *(owned by the lead; this packet supplies rehearsal evidence)* | The script, with fallbacks verified, not assumed |
| `docs/14-HACKATHON-SUBMISSION.md` *(owned by the lead)* | Completed tracker and AI-use disclosure |
| `demo/fallback/*.png` or `demo/fallback/*.mp4` | Recorded fallback for each beat that can fail, captured on Saturday, not Sunday morning |
| `demo/reset.sh` (or `.ps1`) | Restores the seeded demo state in under 60 seconds |
| `app/.env.demo` *(not committed; a documented variant of `.env.example` with `LLM_PROVIDER=mock`)* | The offline-safe demo configuration |

**Dependencies.** WP-07, WP-09, WP-11.

**Effort.** 6 h.

**Verification gate**

```bash
# On the venue network, from a clean checkout, with a stopwatch:
git clone <public-repo> /tmp/fresh && cd /tmp/fresh/app
pnpm install && pnpm db:migrate && pnpm db:seed && pnpm demo:smoke
# Expected: exit 0, under 10 minutes total, no manual database step.
# Then run the full demo script twice, once with the network connected and once with it off.
```

**Acceptance criteria**
- [ ] `pnpm demo:smoke` exits 0 from a clean clone on the venue network.
- [ ] The complete demo script runs with the venue network **off**, using `LLM_PROVIDER=mock`.
- [ ] Every fallback artefact in [`13-DEMO-STORY.md`](13-DEMO-STORY.md) S12 exists as a file, is openable, and was recorded before Sunday morning.
- [ ] A feature freeze is recorded as a commit tag no later than Sunday 11:00 AM. After the tag, only the submission text and the slides change.
- [ ] The public repository contains no secret, no `cookies.txt`, no `.storage/`, and no credential in history (`git log -p | grep -Ei "api[_-]?key|secret="` finds nothing).
- [ ] The Devpost submission is filed by 11:30 AM, thirty minutes before the 12:00 PM deadline.
- [ ] The AI-use disclosure in `14` matches what the commit history actually shows.

**Spec owner.** `13`, `14`, `12` S7.

---

## 3. Dependency graph

```text
                        WP-01  repo + skeleton
                          |
                          v
                        WP-02  data model + fixture
                         /    \
                        v      v
                   WP-03      WP-08  GUARDRAIL
                   auth       (offline, parallel from WP-02)
                        \      /
                         v    v
                        WP-04  upload + storage + mock pipeline
                          |
                          v
                        WP-05  Assignment Analyst (live model)
                          |
                          v
                        WP-06  review + approval
                         /    \
                        v      v
                   WP-07      WP-10  queries + discussions
                   student      |
                   workspace    |
                        \       |
                         v      v
                        WP-09  assistant  (needs 06, 07, 08)
                              |
                              v
                        WP-11  analytics  (needs 02, 07, 10)
                              |
                              v
                        WP-12  demo hardening + submission
```

Hard dependency edges only. Soft edges that matter in practice:

- WP-08 has no dependency on WP-03 through WP-07 and should be started the moment WP-02 lands. It is the highest-risk code and the one packet that must not be left until Saturday night (`CONTRIBUTING.md` S5).
- WP-10 depends on WP-06 only for the FAQ publication path; the discussion and query CRUD can be built in parallel from WP-03.
- WP-12 cannot start seriously until WP-11 exists, but the smoke script and the fallback recordings should begin on Saturday evening, not Sunday.

---

## 4. Critical path

```text
WP-01 -> WP-02 -> WP-04 -> WP-05 -> WP-06 -> WP-07 -> WP-09 -> WP-12
  5   +   4   +   7   +   6   +   6   +   7   +   5   +   6   =  46 h
```

46 of the 69 estimated hours. Characteristics of this chain, and what they mean for staffing:

| Property | Consequence |
|---|---|
| It is a single chain for most of its length | Adding people does not shorten it. Shorten it by starting WP-08 offline in parallel and by keeping WP-03, WP-10 and WP-11 on other people. |
| WP-05 is the first packet that depends on a live model | It is also the first packet where quality is subjective. Schedule it for Saturday morning, when the team is together and can read the output critically. |
| WP-06 gates both student-visible content and the demo | If WP-06 is not done by Saturday 18:00, cut CV-1 to CV-5 from [`02-SCOPE.md`](02-SCOPE.md) S3 and finish WP-06. No content, no demo. |
| WP-07 is the longest single packet | Split it if a second pair is free: `brief + viewer` and `map + checklist` are cleanly separable files. |
| WP-12 is on the critical path by design | Treating the demo as free is how teams present a broken product. |

---

## 5. Risk register

Likelihood and impact are H / M / L. "Trigger" is the observable event that means the mitigation is now required, not optional.

| # | Risk | L | I | Mitigation | Trigger |
|---|---|---|---|---|---|
| R1 | **Live model unavailable or slow during judging** -- venue wifi, provider outage, rate limit, or a key that worked at 2 AM | H | H | `LLM_PROVIDER=mock` is the documented demo configuration and the whole loop is walkable offline. Record the demo video on Saturday. Export the fixture proposal to JSON so the screen can be populated with no model call at all. | Any model call exceeds 10 s, or returns a non-2xx, during the Saturday 18:00 run-through. Switch the demo to `mock` and stop debugging the network. |
| R2 | **Overengineering** -- the team builds breadth instead of one working loop (handoff S66) | H | H | [`02-SCOPE.md`](02-SCOPE.md) S2 is frozen. S3 is a priority list, not a queue. The cut order in S1.4 is pre-written so the decision is not made under pressure. | Any work packet is started that is not in the WP-01..WP-12 list, or WP-06 is not done by Saturday 18:00. |
| R3 | **Guardrail hole** -- a prohibited or derived-effort request is allowed, or a legitimate question is refused and the demo stalls | M | H | Deterministic rules run before any model call. Fail-closed default. The 53-case golden set (`05` S11) is written before the assistant UI (WP-08 before WP-09), and all 53 execute with no skip list. Tabletop it: each teammate spends 15 minutes trying to break the refusal with a rephrase, and every success becomes a golden case. | Any red-team attempt succeeds; or a golden case fails; or the refusal beat produces a soft answer. |
| R4 | **No working end-to-end path** -- every part is nearly done and nothing connects | M | H | The walking skeleton in WP-01 makes the first connection on Friday night. `pnpm demo:smoke` in WP-12 becomes a daily check from Saturday noon onward. Integration is never deferred to the last packet. | WP-06 is not done by Saturday 18:00, or `pnpm demo:smoke` has not passed once by Saturday 22:00. |
| R5 | **Requirement paraphrase leaks into the UI** -- a model-authored summary of the brief appears where the brief should be (C2, D17) | M | H | The document viewer is the only student-facing surface for requirement text; anywhere else quotes verbatim with a page reference. Add a grep to the smoke script for known brief sentences appearing outside the viewer. | Any screen shows requirement prose that does not exist in the PDF. |
| R6 | **Approval bypass** -- content reaches students before a tutor approves it | M | H | The transition state machine is one module (WP-06). Every student-facing read filters on `APPROVED`. An integration test requests unapproved content with a student session and expects 403/404. | One item is found student-visible while `NEEDS_REVIEW`. Stop and fix before anything else. |
| R7 | **The repository is not publicly readable**, and the commit history does not yet span the event window -- the "commit often" evidence requirement is only partly met | M | H | The repository and remote already exist, so WP-01's `git init` and remote steps are done. Confirm the GitHub visibility setting, then commit per logical change using `CONTRIBUTING.md` S2 conventions. **Closed at the Phase 7 freeze: public visibility is verified** (`private=false, visibility=public`) and every commit is dated `2026-10-04`. | The repo URL still returns 404 anonymously at Sunday 09:00, or every commit falls inside one hour. **Neither held.** |
| R8 | **The demo cannot be deployed** -- it only runs on one laptop | M | M | One documented deploy path ([`12-OPERATIONS.md`](12-OPERATIONS.md) S5), rehearsed once on Saturday evening. A long-lived Node server with local storage is the default; a serverless target requires the S3 driver, because local files do not survive between invocations. | Deployment is not verified by Saturday 20:00. Fall back to the local demo and stop spending time on it. |
| R9 | **A secret is committed** -- `.env`, a cookie file, or a key reaches the public repository | M | H | `.gitignore` is verified in WP-01. `.env.example` is the only tracked template and contains no real value. Review `git status` before every `git add -A`. | A secret is found in the working tree or in history. Rotate the credential first, then clean history; never the other way round. |
| R10 | **Key teammate unavailable** -- illness, a lab, an exam, a dead laptop | M | M | Disjoint file ownership by track (S6.2). Every track commits and pushes at least hourly so work is recoverable. The two critical-path packets (WP-05, WP-06) have a named secondary. | A teammate is unreachable for more than two hours during a critical window. Reassign their open packet explicitly and say so on the task board. |
| R11 | **Ingestion quality is too poor to show** -- the model produces generic or wrong structure for the demo brief | M | M | Format the fixture brief so its structure is legible to a text-layer extractor. Read the proposal aloud on Saturday morning; if the checklist items describe implementation work, fix the prompt before touching the UI. The fallback is the mock fixture, which is hand-authored and good. | Two consecutive live runs produce checklist items that name implementation actions. Switch the demo to the mock proposal and present it as the fixture it is. |
| R12 | **Difficulty signal is not computable** -- the seeded cohort has too little activity, or every bucket falls below the k-anonymity floor | L | M | The seed generator is written to guarantee at least one qualifying milestone and at least one sub-5 bucket ([`02-SCOPE.md`](02-SCOPE.md) S5). `tests/analytics/difficulty.test.ts` asserts both. | The Assignment Health screen shows no potential difficulty area, or shows only "Insufficient data". Regenerate the fixture with a different seed constant, not by hand-editing rows. |
| R13 | **Time is spent on the Devpost text instead of the product** | M | M | `14-HACKATHON-SUBMISSION.md` is filled in as work proceeds, not reconstructed on Sunday (`AGENTS.md` S7). AI-use disclosure entries are appended per packet. | Sunday 09:00 arrives with an empty disclosure section. |

---

## 6. Team plan for four people

### 6.1 Capacity check

| | Hours |
|---|---:|
| Calendar hours, Friday evening to Sunday noon | 22 |
| x 4 people | 88 |
| Minus meetings, food, integration stalls, one bad bug (estimated 33%) | 59 |
| Estimated packet effort | 69 |

The plan is **over** the pessimistic line by about 10 hours. That is deliberate and is why S1.4 exists: the cut list is worth roughly 11 hours, which restores a workable margin. Do not treat the 69 as a promise; treat the cut list as part of the plan.

### 6.2 Tracks, with disjoint file ownership

Two people never edit the same file without a message first. This is the only rule that reliably prevents a wasted Saturday evening.

| Track | Owns (files) | Packets |
|---|---|---|
| **A -- foundation and ingestion** | `app/package.json`, `app/src/lib/config.ts`, `app/src/lib/db/**`, `app/src/lib/storage/**`, `app/src/features/ingest/**`, `app/src/features/review/**` | WP-01, WP-02, WP-04, WP-05, WP-06 |
| **B -- guardrail and assistant** | `app/src/lib/guardrail/**`, `app/src/lib/llm/**`, `app/src/features/assistant/**`, `app/tests/guardrail/**` | WP-08, WP-09 |
| **C -- student experience** | `app/src/app/(student)/**`, `app/src/components/**`, `app/src/features/progress/**`, `app/src/features/map/**`, `app/tests/progress/**` | WP-07, and the UI half of WP-09 |
| **D -- tutor surfaces, data and demo** | `app/src/app/(tutor)/**`, `app/src/features/analytics/**`, `app/src/features/discussion/**`, `app/src/features/seed/**`, `demo/**`, `app/scripts/**` | WP-03, WP-10, WP-11, WP-12 |

WP-12 is the lead's packet in substance (the docs) and track D's in tooling (the smoke script and recordings).

### 6.3 Suggested sequencing by window

| Window | A | B | C | D |
|---|---|---|---|---|
| Fri evening | WP-01 | WP-01 (pair) | WP-01 (pair) | WP-01 (pair) |
| Sat 09:00-13:00 | WP-02, WP-04 | WP-08 | WP-02 fixture reading, then WP-07 shell | WP-03 |
| Sat 13:00-18:00 | WP-05 | WP-08, then WP-09 | WP-07 | WP-10 |
| Sat 18:00-24:00 | WP-06 | WP-09 | WP-07 | WP-10, WP-11 |
| Sun 07:00-10:30 | WP-12 smoke | WP-12 rehearsal | WP-12 fallbacks | WP-11, WP-12 |

---

## 7. Packet-to-specification map

Every packet must be built against a doc, not against this plan's summary of it. If the doc and this plan disagree, the doc wins and this plan is the bug ([`00-INDEX.md`](00-INDEX.md) S5).

**Every packet that creates a route handler takes `06` S5.4 as its route contract (D51).** Path, method, role, success shape and failure codes come from that table. The directory sketches inside the packets are a Next.js file layout, not a URL design; they are illustrative.

| Packet | Primary spec | Supporting specs |
|---|---|---|
| WP-01 | `04` S2-3 | `AGENTS.md` S5, [`12-OPERATIONS.md`](12-OPERATIONS.md) S2-4, `06` S5.4 (`/api/health`) |
| WP-02 | `06` S3-5 | `08` S4, [`02-SCOPE.md`](02-SCOPE.md) S2.4 |
| WP-03 | `04` S7 | `07` S3, `06` S5.4 (`/api/auth/*`) |
| WP-04 | `04` S4-6 | `05` S7, `06` S3 and S5.4 (tutor sources, ingest, student uploads), O5, O11 |
| WP-05 | `03` S4-5 | `05` S6-7, D20, D23, O1 |
| WP-06 | `06` S3 | `07` S5, `05` S5, C3, D21, D22, D53, `06` S5.4 (artifacts, approve, publish) |
| WP-07 | `07` S4 | `06` S2, `08` S4, C2, D17, D19, D33, D43, D48, `06` S5.4 (workspace, brief, structure, checklist) |
| WP-08 | `05` S3-8 | `AGENTS.md` S6, D7, D8, D11, D16, D47 |
| WP-09 | `05` S5-8 | `03` S7, `07` S4.7, D13, D14, O2, O9, O10, D47, `06` S5.4 (assistant session, messages, proactive) |
| WP-10 | `07` S5-6 | `06` S4, `05` S9, D24-D30, D50, D54, O3, O8, `06` S5.4 (queries, discussions, FAQ) |
| WP-11 | `08` S2-5 | `06` S5, D31, D32, D34, D35, D49, D52, `06` S5.4 (analytics) |
| WP-12 | [`13-DEMO-STORY.md`](13-DEMO-STORY.md) | [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md), [`12-OPERATIONS.md`](12-OPERATIONS.md) S7, `AGENTS.md` S7 |

---

## 8. Definition of done for every packet

From `AGENTS.md` S4.3 and `CONTRIBUTING.md` S4, restated so no packet can be closed without it:

- [ ] It runs, and someone other than the author watched it run.
- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
- [ ] No constraint in `AGENTS.md` S2 was weakened.
- [ ] If AI behaviour changed, the guardrail golden set was updated and passes (WP-08 onward).
- [ ] The packet's spec doc was updated in the same commit if behaviour or interfaces changed.
- [ ] Any mock or shortcut is labelled in code **and** listed in [`02-SCOPE.md`](02-SCOPE.md) S5.
- [ ] Committed with an accurate message, inside the event window, pushed to the public remote.
- [ ] The packet's verification gate command is quoted in the commit body or the PR description.

---

## 9. What this plan does not do

- It does not claim any of it is built. At the time of writing, `app/` did not exist. **It now exists and is built through Phase 6** -- see the superseding note at the top of this file and S5.2 of [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) for the per-packet state.
- It does not estimate the demo narrative, the Devpost text, or the presentation build; those are [`13-DEMO-STORY.md`](13-DEMO-STORY.md) and [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md).
- It does not guarantee the hour estimates. They are engineering judgement against a codebase that does not exist yet, stated as a range by their inclusion in S1.4's cut list.
- It does not resolve the open questions. O1-O12 remain the working defaults in [`01-DECISIONS.md`](01-DECISIONS.md); if a packet proves a default wrong, amend that table first.
