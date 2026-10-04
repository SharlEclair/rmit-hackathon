# 12 -- Operations

**Purpose.** How this project is configured, run, seeded, deployed, kept secret-clean, and recovered when it breaks at 2 AM. Written to be followed literally.

**Scope.** Everything from `app/` outward: environment, database, storage, model provider, deploy, secrets, failure modes.

**Status.** No application code exists yet. Every command below becomes live with WP-01 ([`11-BUILD-PLAN.md`](11-BUILD-PLAN.md)), with one exception: the native local Postgres in S3.3 **has** been executed and verified on this machine, and its evidence is recorded there. Nothing else here claims to have been executed.

> **Superseded at the Phase 7 freeze.** Every command below is now live and has been executed: migrations
> (13 applied), the seed, the drift check, the four acceptance runs, `pnpm demo:smoke` (11/12) and
> `pnpm demo:beats` (11/11). The repository is **public** -- verified by an anonymous GitHub API fetch,
> which closes the visibility to-do in S3.2 and shows that the HTTP 404 recorded there was the
> private-repository response. Live state: [`handoff/01-STATE.md`](handoff/01-STATE.md) section 3.
>
> **One operational note that is new rather than superseded:** `LLM_MAX_CALLS_PER_SESSION` is **12**, counted
> per `assistant_session` in `llm_call_counters`. A rehearsal that tries several Assistant questions on one
> session exhausts it, after which every turn returns **`429` with no SSE frames at all** -- which reads as
> a broken server. Neither the seed nor `demo/reset.ps1` clears those counters, so a rehearsal plan needs a
> step for it. Recorded as **I-54**.

**Binding constraints.** C7 (secrets are never committed, logged, or returned in an API response) and C8 (every LLM call goes through the provider adapter). Both are in [`AGENTS.md`](../AGENTS.md) S2 and neither is negotiable for convenience.

---

## 1. What the app is, operationally

| Property | Value |
|---|---|
| One deployable | Next.js App Router, UI and API route handlers in the same process (D36). No separate backend, no queue, no worker. |
| Database | Postgres, one instance, migrations as files in the repo (D37) |
| Storage | Local filesystem by default; S3-compatible driver behind the same interface (D41) |
| Model access | Through `app/src/lib/llm/` only. Provider selected by `LLM_PROVIDER` at runtime, never hard-coded (D39, C8) |
| Offline mode | `LLM_PROVIDER=mock` -- the whole product loop is walkable with no API key and no network |
| Separate, not imported | `archive/canvas-scraper/` is **retired prior work**: it stays independent, is never imported by `app/` (D44), and is neither required nor used by the app. The app must start with `CANVAS_*` unset. |

---

## 2. Environment variables

The single source of truth is [`.env.example`](../.env.example) at the repository root. This table reproduces it exactly. **If the two ever disagree, `.env.example` wins and this table is the bug.**

Copy it once:

```bash
# Repository root
cp .env.example .env
```

`app/` reads configuration through `app/src/lib/config.ts`. That module is the only place `process.env` is read, it validates at boot, and it fails loudly on a missing required value rather than starting in a half-configured state.

### 2.1 Database

| Variable | Required | Template default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://user:password@localhost:5432/assignment_assistant` | Any Postgres works: local, containerised, Supabase, Neon. |

### 2.2 Auth and anonymity

| Variable | Required | Template default | Notes |
|---|---|---|---|
| `AUTH_SECRET` | **Yes** | `replace-me-with-32-bytes-of-randomness` | Session signing key. Generate: `openssl rand -base64 32`. |
| `ANON_ID_SECRET` | **Yes** | `replace-me-with-32-bytes-of-randomness` | HMAC key for per-(student, assignment) pseudonyms (D27). Must differ from `AUTH_SECRET`. The pseudonym number is persisted, so rotating it does **not** re-label existing posts; only identities created after the rotation get different numbers (**D55**). |

Rotating `ANON_ID_SECRET` mid-assignment does not change the label of any post that already exists, but it does change the number assigned to any identity created afterwards, so treat it as fixed for the duration: rotate it only between assignments (**D55**, `06` S4.2).

### 2.3 Model provider

| Variable | Required | Template default | Notes |
|---|---|---|---|
| `LLM_PROVIDER` | **Yes** | `gemini` | One of `gemini`, `deepseek`, `mock`. `gemini` is the project default (**D61**). |
| `LLM_MODEL_REASONING` | **Yes** | `gemini-3.8-flash` | The default model for every AI capability (**D62**). One model covers ingestion, guardrail classification, assistant responses, moderation, and image- and PDF-bearing uploads: it accepts text, image, video, audio and PDF input with a 1,048,576-token input limit, and supports structured outputs and thinking levels. Do not invent model ids; an unknown id fails at startup validation. |
| `LLM_MODEL_MULTIMODAL` | No | *(empty)* | Optional separate model for uploads carrying images or PDFs -- the shipped attachment set (**O11**). Empty means reuse `LLM_MODEL_REASONING`, which is correct for `gemini-3.8-flash` because it is natively multimodal. Never consulted for audio or video, which the picker refuses before the adapter. |
| `LLM_THINKING_GUARDRAIL` | Only when `LLM_PROVIDER=gemini` | `low` | Thinking level for the policy guard: `low`, `medium` or `high`. `minimal` is not supported by `gemini-3.8-flash` and returns an error. |
| `LLM_THINKING_ASSISTANT` | Only when `LLM_PROVIDER=gemini` | `medium` | Thinking level for grounded assistant answers. |
| `LLM_THINKING_ANALYST` | Only when `LLM_PROVIDER=gemini` | `high` | Thinking level for assignment ingestion; highest because quality there bounds everything downstream. |
| `LLM_THINKING_MODERATOR` | Only when `LLM_PROVIDER=gemini` | `low` | Thinking level for discussion moderation (advisory only, **D28**). |
| `LLM_THINKING_EXTRACTION` | Only when `LLM_PROVIDER=gemini` | `low` | Thinking level for attachment extraction, which runs once per upload as a classification-controlled call (**D68**). Floor setting for the same reason as the guardrail. |
| `DEEPSEEK_API_KEY` | Only when `LLM_PROVIDER=deepseek` | *(empty)* | Set only the key matching the selected provider. |
| `GEMINI_API_KEY` | Only when `LLM_PROVIDER=gemini` | *(empty)* | Set only the key matching the selected provider. |
| `LLM_BASE_URL` | No | *(empty)* | Overrides the provider base URL for proxies or self-hosted gateways. |
| `LLM_MAX_CALLS_PER_SESSION` | No | `12` | Hard ceiling on model calls per assistant session. A runaway retry loop must fail loudly rather than quietly burn the budget. |

**The provider account, and what bounds spending.** The project's Gemini key is a **paid Tier 1 key with
a provider-side monthly spend cap of 5 AUD** (Phase 4, 2026-10-04; handoff **I-36**). The free tier's
20-requests-per-day ceiling no longer applies, so the binding constraint is money rather than quota.
Three controls bound a runaway, in the order they bite:

1. **The provider's monthly cap.** It is outside this repository and is the only control that holds when
   the code is wrong; it is also a hard stop rather than a warning, so a spend cap that is reached fails
   a live run the way a quota does. Periodically check the remaining budget before a rehearsal.
2. **`LLM_MAX_CALLS_PER_SESSION`**, enforced through `llm_call_counters` and incremented **before** the
   call is issued (`04` section 5.6, **D68**). Five Analyst passes plus retries fit inside the default;
   an image extraction has its own scope key and never shares the assistant session counter.
3. **`LLM_PROVIDER=mock`**, which is the offline default and the mode every `pnpm test` run uses. It
   makes no network call at all, so a rehearsal costs nothing.

Measured cost, so a rehearsal budget is arithmetic rather than a guess: one live five-pass ingestion run
against the demo fixture costs roughly **0.15 AUD**, because a pass must fit its thinking plus its body
and the analyst pass runs at `high` (**D104** showed ~42,000 output tokens for the structure pass alone).
That is about 30 live runs per month inside the cap. `04` section 5.4's per-minute limit still applies
and is why `AnalystInput.paceMs` exists (**D96**) -- pace a live run rather than issuing five passes back
to back.

### 2.4 Object storage

| Variable | Required | Template default | Notes |
|---|---|---|---|
| `STORAGE_DRIVER` | No | `local` | `local` or `s3`. |
| `STORAGE_LOCAL_DIR` | No | `./.storage` | Used when `STORAGE_DRIVER=local`. Must be gitignored. |
| `S3_ENDPOINT` | Only when `STORAGE_DRIVER=s3` | *(empty)* | |
| `S3_REGION` | Only when `STORAGE_DRIVER=s3` | *(empty)* | |
| `S3_BUCKET` | Only when `STORAGE_DRIVER=s3` | *(empty)* | |
| `S3_ACCESS_KEY_ID` | Only when `STORAGE_DRIVER=s3` | *(empty)* | Secret. Never logged. |
| `S3_SECRET_ACCESS_KEY` | Only when `STORAGE_DRIVER=s3` | *(empty)* | Secret. Never logged. |
| `UPLOAD_MAX_BYTES` | No | `26214400` | 25 MiB. An oversized upload is rejected with a message naming the limit, never silently truncated. |

### 2.5 Canvas (retired research; NOT required and NOT used by the app)

| Variable | Required | Template default | Notes |
|---|---|---|---|
| `CANVAS_BASE_URL` | No | `https://rmit.instructure.com` | Verified against the live RMIT Canvas REST API during design research. |
| `CANVAS_TOKEN` | No | *(empty)* | Secret. |
| `CANVAS_COOKIE_FILE` | No | *(empty)* | Path to a Netscape cookie file. Secret; gitignored. |

**The app must work with all three unset** (D45). These exist only for the retired tool in `archive/canvas-scraper/`, which is **not required by, and not used by, the app** and is never imported by `app/` (D44). Setting them changes nothing in the application.

### 2.6 Application

| Variable | Required | Template default | Notes |
|---|---|---|---|
| `NODE_ENV` | No | `development` | |
| `APP_BASE_URL` | No | `http://localhost:3000` | Used for absolute links. Set to the deployed URL in production. |

### 2.7 Minimum viable `.env`

This is what the demo actually needs. Everything else can stay at its template value.

```bash
DATABASE_URL="postgresql://.../assignment_assistant"
AUTH_SECRET="<openssl rand -base64 32>"
ANON_ID_SECRET="<different 32 bytes>"
LLM_PROVIDER="mock"          # no API key needed at all
```

---

## 3. Local development

### 3.1 Prerequisites

Verified installed on the development machine:

| Tool | Version |
|---|---|
| Node.js | v24.15.0 |
| npm | 11.12.1 |
| pnpm | installed |
| Python | 3.13.2 (used by `archive/canvas-scraper/`, not by `app/`) |
| uv | installed |
| git | installed |
| Docker CLI + Compose | v5.1.4 -- **the daemon is not running by default** |
| Postgres | 18.6, native Windows service `postgresql-x64-18`, listening on port 5432 (path C, S3.3) |

Known **not** installed: `gh`, `vercel`, `wrangler`. Postgres **is** installed and already provisioned -- see path C (S3.3). `psql.exe` sits in `C:\Program Files\PostgreSQL\18\bin` and is on the user `PATH`; a process that was already running when `PATH` was edited (an open terminal, VS Code, an agent shell) will not see it until that process restarts.

Three consequences that shape everything below:

1. **A local Postgres exists and is the primary path.** Path C (S3.3) is provisioned and verified. Path A (containers, S3.4) and path B (hosted, S3.5) are retained as fallbacks.
2. **Path A must not map host port 5432.** The native service owns that port, so the original `"5432:5432"` mapping fails with "port is already allocated". The compose file in S3.4 maps `"5433:5432"` instead, and using path A therefore also changes `DATABASE_URL`.
3. **`gh` and `vercel` do not exist.** Do not run `gh repo create` or `vercel deploy`. Use git remotes and the web UI (S3.2, S5).

### 3.2 Repository bootstrap (WP-01 -- already done; verify, do not re-run)

The repository **is** under version control: `origin` is `https://github.com/SharlEclair/rmit-hackathon-demo.git`, history stands at 7 commits (HEAD `da00f71`), and `origin/main` is pushed. Steps 1 and 2 in the block below are **already executed**; do not re-run `git init` or re-add `origin`. **Public visibility of the remote is not verified** -- an anonymous fetch of the repository URL returns HTTP 404 -- so confirming the GitHub visibility setting is a live to-do. The deadline attached to this section is unchanged: the hackathon scores visible progress, and the AI-use disclosure must be reconstructable from history (`AGENTS.md` S7).

> **Superseded at the Phase 7 freeze.** **Public visibility is now verified**: an anonymous GitHub API
> fetch returns `private=false, visibility=public, default_branch=main`, so the to-do above is closed and
> the 404 it records was the private-repository response rather than a misconfigured remote. The commit
> count and HEAD in the paragraph above are also stale; `git log --format=%ad --date=short | sort -u`
> returning a single date is the durable form of the claim, not a count (`handoff/03-INVARIANTS.md` T42).

```bash
# 1. Already executed in WP-01 -- verify, do not re-run.
git log --oneline -1             # expect da00f71
git add .gitignore .env.example AGENTS.md CONTRIBUTING.md README.md docs "hackathon info" archive
git status --porcelain          # MUST NOT list .env, cookies.txt, .storage/, archive/canvas-scraper/out/
git commit -m "chore(repo): initial commit of the design doc set and frozen inputs"

# 2. The remote already exists (anonymous fetch returns 404, so confirm it is public):
git remote -v                    # origin https://github.com/SharlEclair/rmit-hackathon-demo.git

# 3. Verify
git remote -v
```

If any secret appears in `git status --porcelain`, stop and fix `.gitignore` before committing. Rotating a leaked credential is cheaper than cleaning history.

### 3.3 Postgres, path C: native local install (primary -- already provisioned)

This is the path in use on the development machine (**D66**). It has been executed and verified; the evidence is at the end of this section.

The server came from the PostgreSQL 18 Windows installer and runs as the Windows service `postgresql-x64-18` on port 5432. **Stack Builder was skipped deliberately.** None of its add-ons are used: no PostGIS (there is no spatial data anywhere in the model), no pgBouncer (one local instance, one app process), no pgAgent (**D60** runs ingestion as an app-polled job row, not a database scheduler), no psqlODBC (the app reaches the database through the `postgres` driver via Drizzle, `04` S2.1). `pgvector` does not apply in the MVP at all: **D38** rejects embeddings and retrieval is `tsvector` full-text.

The role and database match `.env.example` exactly, so no `DATABASE_URL` change is needed. Put the statements in a file and drive `psql -f`:

```sql
-- pg-setup.sql
CREATE ROLE "user" LOGIN PASSWORD 'password';
CREATE DATABASE assignment_assistant OWNER "user";
```

```bash
psql -U postgres -h localhost -p 5432 -v ON_ERROR_STOP=1 -f pg-setup.sql
```

**PowerShell caveat, which is the real trap on this machine.** Windows PowerShell 5.1 strips embedded double quotes when it builds the command line for a native executable, so `-c 'CREATE ROLE "user" ...'` reaches `psql` as `CREATE ROLE user ...` and fails with `syntax error at or near "user"`. `user` is a reserved word in SQL, so those quotes are not optional. Two ways around it:

- Use `psql -f file.sql`. A `.sql` file is untouched by shell quoting. This is what was used here, and it is the recommended form.
- Or avoid double-quoted identifiers inside `-c` entirely.

The verification commands in [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) happen to be safe as written: they use only single-quoted SQL string literals inside the double-quoted shell argument, so no double-quoted identifier is ever passed through. Do not "improve" them by adding one.

Verified on this machine:

```text
CREATE ROLE
CREATE DATABASE
PostgreSQL 18.6 on x86_64-windows, compiled by msvc-19.44.35229, 64-bit
CREATE TABLE / INSERT 0 1 / DROP TABLE          # create-table probe in the public schema
id: 7350a429-2c87-443d-8937-c7ff16ea124d        # gen_random_uuid(), no extension needed
```

Two consequences worth knowing:

1. `gen_random_uuid()` works on the stock install, so the `pgcrypto` note in [`06-DATA-MODEL.md`](06-DATA-MODEL.md) does not trigger on this server. Keeping that branch in the first migration is still correct, because path A pins `postgres:16-alpine` and path B may be any hosted version; on path C it is simply a no-op.
2. The probe confirms the `user` role can create tables in `public`. That is **not** automatic on Postgres 15+; it works here because the database owner owns that schema. Migrations run as `user`, so this is load-bearing.

Two operational cautions:

- The service binds `0.0.0.0:5432`, so it is reachable from the local network, not only from `localhost`. On a shared or untrusted network, set `listen_addresses = 'localhost'` in `postgresql.conf` or tighten `pg_hba.conf`.
- The local superuser password is a weak, human-chosen value, and the `user` role password is the same literal that already appears in `.env.example`. Treat both as local development credentials only (C7): never reuse them for a deployed database, and never write the superuser password to a committed file.

### 3.4 Postgres, path A: containers (fallback)

```bash
# Path A only. Path C (S3.3) is primary and needs no Docker at all.
# Ensure Docker Desktop is running first; the daemon is not started by default.
docker info >/dev/null 2>&1 || echo "Start Docker Desktop before continuing"

docker compose up -d postgres      # compose file added by WP-01
docker compose ps                  # postgres must be healthy before migrating
```

`app/compose.yaml` (added by WP-01) defines one service. **The host port is 5433, not 5432**, because the native service from path C already owns 5432; the original `"5432:5432"` mapping fails with "port is already allocated":

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: assignment_assistant
    ports: ["5433:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d assignment_assistant"]
      interval: 5s
      retries: 10
volumes:
  pgdata:
```

Matching `.env` value for this path: `DATABASE_URL="postgresql://user:password@localhost:5433/assignment_assistant"`. Note the port. The `.env.example` default stays on 5432 because that is path C's port.

The image is pinned to `postgres:16-alpine` while path C runs 18.6. Both satisfy **D37** and neither needs `pgcrypto`: `gen_random_uuid()` is built in from Postgres 13, and the schema names no other version-specific feature.

### 3.5 Postgres, path B: hosted free tier (zero-install fallback)

Use this when Docker Desktop will not start and path C is unavailable to whoever is running the app, or when a teammate needs a database without installing anything. Supabase and Neon both issue a Postgres connection string on a free tier. Put it in `DATABASE_URL` and skip path A (S3.4) entirely.

Two things to know about hosted Postgres:

- Use the **pooled** connection string if the provider offers one. Serverless deploys open many short-lived connections.
- If the connection string requires TLS, keep the `?sslmode=require` parameter the provider gives you. Do not strip it.

Never commit the connection string. It contains a password.

### 3.6 Install, migrate, seed, run

```bash
cd app
pnpm install
pnpm db:migrate        # idempotent; safe to re-run
pnpm db:seed           # loads the demo assignment and the synthetic cohort
pnpm dev               # http://localhost:3000
```

Seeded demo accounts:

| Role | Credentials |
|---|---|
| Tutor | `tutor@demo.rmit` / `demo1234` |
| Student | `student@demo.rmit` / `demo1234` |

These are demo fixtures in the seed script, not real accounts. They must never be reused for anything else, and the seed must not create them in a production database.

### 3.7 Quality gates

```bash
cd app
pnpm typecheck         # tsc --noEmit
pnpm lint              # eslint
pnpm test              # vitest run, including the guardrail golden set
```

`pnpm test` must pass with **no network access**. If it does not, the guardrail has a hidden dependency on a live model call, which violates `AGENTS.md` S6.2.

---

## 4. The `mock` provider

`LLM_PROVIDER=mock` is a first-class configuration, not a test stub bolted on.

| Property | Behaviour |
|---|---|
| Required credentials | None. `DEEPSEEK_API_KEY=""` and `GEMINI_API_KEY=""` are correct. |
| Network | None. Works with the venue wifi down, the provider rate-limited, or a key that expired. |
| Determinism | Fixed seed constant, so the same input produces the same output on every machine. |
| Coverage | Ingestion proposals, assistant responses for the scripted demo questions, and advisory moderation flags. |
| Realism | The fixture is hand-authored to be plausible, not minimal. It is good enough to demo against. |
| Honesty | The UI states that the offline provider is active. The presenter says so. See [`02-SCOPE.md`](02-SCOPE.md) S5. |
| Guardrail | Unchanged. The deterministic policy layer runs the same real rules and the same golden set in both modes (D7). Only the optional model-assisted classification is absent. |
| Schema discipline | `mock` output is validated against the same schemas as live output. A mock that bypasses validation would hide the failures it exists to prevent (D16). |

**`gemini` is the default in `.env.example` (D61); `mock` is the offline fallback for two reasons:** it lets a new teammate walk the entire product loop in under five minutes with no accounts, and it is the demo''s safety net when the network is hostile.

---

## 5. Deployment

**The MVP assumes a long-lived Node server, not a serverless target.** This is a constraint, not a preference.

| Target | Works? | Why |
|---|---|---|
| Local `pnpm dev` / `pnpm start` | **Yes -- the default** | The demo path. Zero external dependencies beyond Postgres, and `mock` removes even that risk from the model side. |
| Any long-lived Node host (container, VM, PaaS with a persistent process) | **Yes** | Local filesystem storage keeps working, so `STORAGE_DRIVER=local` is fine. |
| Serverless (per-invocation filesystem) | **Only with `STORAGE_DRIVER=s3`** | The local filesystem is ephemeral between invocations. Uploaded briefs would vanish. If you deploy serverless, the S3 variables become required and the storage driver becomes a deployment decision the implementer must respect, not an afterthought. |

Documented deploy path, for the one attempt WP-12 budgets:

```bash
cd app
pnpm build
pnpm start            # production server; requires DATABASE_URL and secrets
```

Whatever host is chosen, `APP_BASE_URL` must be set to the deployed origin, and `NODE_ENV=production` must be set so the session cookie is issued with `Secure`.

### 5.1 Deployment is not a judging criterion

The judging rubric scores Problem Relevance, Desirability, Solution & Creativity, Design, Functionality and Presentation. None of them score infrastructure. A deployed URL is a convenience for a judge who wants to click something; a rehearsed local demo is the deliverable. Do not spend Saturday night on deployment plumbing that the rubric does not read.

### 5.2 Deploy verification checklist

- [ ] `DATABASE_URL` points at a database whose schema is migrated.
- [ ] `AUTH_SECRET` and `ANON_ID_SECRET` are set to distinct random values, not the template strings.
- [ ] `NODE_ENV=production` and `APP_BASE_URL` are set.
- [ ] Sign-in works, and the session cookie is `httpOnly` and `Secure`.
- [ ] The demo fixture is seeded.
- [ ] `STORAGE_DRIVER=s3` if and only if the host has an ephemeral filesystem.
- [ ] A signed-in page renders after a cold start (proves the database is reachable, not cached).

---

## 6. Secrets and data handling

Constraint **C7**: secrets are never committed, never logged, and never returned in an API response.

### 6.1 The list

| Secret | Where it lives | Never |
|---|---|---|
| `DATABASE_URL` (contains a password) | `.env` | committed, logged, or echoed in an error page |
| `AUTH_SECRET` | `.env` | logged, or exposed to the client bundle |
| `ANON_ID_SECRET` | `.env` | logged, returned by an API, or derivable from a displayed pseudonym |
| `DEEPSEEK_API_KEY`, `GEMINI_API_KEY` | `.env` | logged, or included in a client-side env var |
| `CANVAS_TOKEN`, `CANVAS_COOKIE_FILE` | `.env` / `cookies.txt` | committed; `cookies.txt` is already gitignored |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `.env` | logged |
| Uploaded documents and student uploads | object storage | logged in plaintext, or committed |

### 6.2 Rules

1. **`.env.example` is the only tracked environment file.** It contains placeholders and empty strings, never a real value. It is also the contract the environment table in S2 reproduces, so it is changed deliberately and never to hold a real secret "temporarily".
2. **Run `git status --porcelain` before every `git add -A`.** Two seconds, once per commit.
3. **Never log a secret.** No `console.log(process.env)`, ever, including "just while debugging". Log the variable *name* and whether it is set, never the value.
4. **Never return a secret in an API response.** Not in an error body, not in a debug endpoint, not in a `/api/health` payload.
5. **Client-exposed variables are a separate namespace.** If a value must reach the browser, it belongs in a `NEXT_PUBLIC_*` variable and it must not be a secret. There is no such variable in this project today.
6. **Model call logging** records the rule id, the prompt version and the decision. It does not record student content in plaintext (`AGENTS.md` S6.5).
7. **Error reporting to a third party is out of scope.** No error-tracking SDK. A stack trace in the server log is enough for a weekend, and it keeps student content inside the system.
8. **If a secret reaches a commit: rotate it first, clean history second.** A rotated credential in a public repository is an inconvenience. An unrotated one is an incident.

### 6.3 `.gitignore` coverage to verify in WP-01

```text
.env
.env.*
!.env.example
cookies.txt
.storage/
node_modules/
.next/
out/
*.log
```

`archive/canvas-scraper/.gitignore` separately covers `archive/canvas-scraper/out/`.

---

## 7. Demo-day operations

### 7.1 Configuration to freeze before the demo

```bash
LLM_PROVIDER="mock"          # the offline safety net
STORAGE_DRIVER="local"
NODE_ENV="production"
APP_BASE_URL="http://localhost:3000"
```

With this configuration the demo has exactly one external dependency: Postgres. If the model provider is available on the day, switch to `gemini` (the default provider, **D61**) for the live-ingestion beat **only after** a full run-through has passed, and keep the `mock` configuration in a second terminal ready to swap in.

### 7.2 Pre-demo checklist

- [ ] `pnpm db:seed` run within the last hour, so the seeded timestamps are recent.
- [ ] `pnpm demo:smoke` exits 0.
- [ ] The demo script has been run twice, once with the network off.
- [ ] Fallback screenshots and the fallback video exist as files and open ([`13-DEMO-STORY.md`](13-DEMO-STORY.md) S12).
- [ ] The browser is at a known state: correct tabs, no stale session, zoom set, notifications off.
- [ ] The laptop is on mains power, and sleep is disabled.
- [ ] `demo/reset.sh` restores the seeded state and has been timed.
- [ ] The API key is not visible in any open terminal or editor tab.

### 7.3 Graceful shutdown

Stop `pnpm dev` or `pnpm start`. If you used path A, also `docker compose down` (not `down -v`; that discards the seeded volume) -- the schema and the fixture survive a container stop. On path C the database is a Windows service, so it keeps running; stop it only deliberately (`Stop-Service postgresql-x64-18`), because the app cannot boot without it.

---

## 8. Failure modes

Ordered roughly by how likely each is to appear during the weekend or during judging.

| # | Symptom | Likely cause | Action |
|---|---|---|---|
| F1 | App boots, every screen 500s | `DATABASE_URL` unset or pointing at a stopped database | `Get-Service postgresql-x64-18` on path C, or `docker compose ps` on path A; if path B, check the provider dashboard. `/api/health` reports `db` state without crashing. |
| F2 | `docker compose up` fails: endpoint not found | Docker Desktop is not running -- the daemon does not start by default on this machine | This is precisely why path C (S3.3) is primary: it needs no daemon. Otherwise start Docker Desktop, or use the hosted Postgres in S3.5. Do not spend more than 10 minutes on the daemon. |
| F3 | Model call times out, 401s, or 429s | Provider outage, expired or unset key, rate limit, venue network | Set `LLM_PROVIDER=mock` and restart. The whole loop is walkable offline. This is the single most likely demo-day failure and the mitigation is one environment variable. |
| F4 | Ingestion returns a proposal but every milestone is empty | Structured output failed schema validation | This is a refusal by design (D16). Check the server log for the validation error and the prompt version. Do not add a retry loop. |
| F5 | Ingestion loops or the bill spikes | A retry loop around a failing model call | `LLM_MAX_CALLS_PER_SESSION` should have failed loudly first. If it did not, that is a defect in WP-04; the cap is not optional. |
| F6 | Guardrail test suite fails or hangs in CI | A test made a network call | The guardrail must run without a network (`AGENTS.md` S6.2). Find the call, remove it; the model is an enhancement, not the only layer. |
| F7 | Assistant answers a prohibited question | A rule gap, not a prompt gap | Add a golden case first, then fix the rule. Never fix a refusal by editing the system prompt. |
| F8 | Tutor sees a real name behind an anonymous post | An endpoint returns `author_id` or joined user data | Treat as an incident (C4, D26). Fix the query layer, not the template, and add the endpoint to `tests/api/no-identity-leak.test.ts`. |
| F9 | Analytics renders a value for a tiny bucket | The k-anonymity floor was bypassed (D32) | Show `Insufficient data`. The floor is a privacy control, not a display preference. |
| F10 | Upload rejected: "unsupported format" | A file outside O5's set: PDF, DOCX, PPTX, PNG/JPEG, plain text, Markdown | Expected (**O5**, **D57**). The message names the accepted formats. DOCX and PPTX are accepted and extracted, so they do not trigger this; a scanned PDF with no text layer is flagged for tutor attention rather than guessed at (`02` S2.4). |
| F11 | Student cannot sign in after a server restart | Session token was stored in memory | Sessions are stateless and signed with `AUTH_SECRET` (WP-03). A restart must not sign anyone out. |
| F12 | Uploads disappear after a redeploy | `STORAGE_DRIVER=local` on an ephemeral filesystem | Switch to `s3`, or move to a long-lived host (S5). |
| F13 | Port 3000 already in use | A stale `pnpm dev` | Kill the process, or run `pnpm dev --port 3001` and update `APP_BASE_URL` to match. |
| F14 | An "Insufficient data" cell where a value is expected | The seeded cohort for that milestone is below 5 contributors | Working as designed (D32). Regenerate the fixture with a different seed constant if the demo needs a populated cell; do not hand-edit rows. |
| F15 | `pnpm db:migrate` fails on a fresh database | A migration assumes a table a later migration creates | Migrations must apply in filename order from empty. Fix the ordering; never patch a live database by hand (D37). |
| F16 | Seeding twice duplicates the fixture | The seed is not idempotent | It must be: re-running produces identical state (WP-02). On path A reset with `docker compose down -v` then `up -d`; on path C use the `dropdb`/`createdb` sequence in S9. Either way, fix the seed. |
| F17 | Elapsed time shows a negative or absurd value | Timestamps compared across timezones, or the start was never recorded | Store timestamps as `timestamptz`, compare in UTC, and label the metric "elapsed time" (D33). |
| F18 | A secret appears in a log line or an error page | A debug log or an unhandled error echoing config | Remove it, confirm the value is not in the repository, and rotate if it was committed (C7, S6.2 rule 8). |
| F19 | The venue has no usable wifi | Reality | It does not matter: `mock` plus local Postgres plus the recorded fallbacks. Rehearse this case before Sunday. |
| F20 | A judge asks how a screen was produced and the answer is unclear | The provenance badge or the demo-data marker is missing | Fix the screen. Every AI artifact carries its status, and every synthetic-data screen says so ([`02-SCOPE.md`](02-SCOPE.md) S5). |
| F21 | `docker compose up -d postgres` fails: "port is already allocated" | The native Postgres service from path C holds host port 5432 | Expected on this machine, not a defect. Use path C (S3.3). Otherwise keep the compose file's `"5433:5432"` mapping (S3.4) and point `DATABASE_URL` at port 5433. |

---

## 9. Backup, restore and reset

Three separate things, with three different costs:

| Need | Command | Effect |
|---|---|---|
| Restore the **seeded demo state** | `pnpm db:seed` (after `demo/reset.sh`) | Idempotent re-seed. Fast. Use this before every rehearsal. |
| Snapshot the **database** before a risky change | `docker compose exec postgres pg_dump -U user assignment_assistant > /tmp/demo.sql` | A file you can restore with `psql < /tmp/demo.sql`. Do this once on Saturday evening, before the last sprint. |
| Full reset | `docker compose down -v && docker compose up -d && pnpm db:migrate && pnpm db:seed` | Destroys the volume. Takes minutes. Keep it as the escape hatch of last resort, and time it once so you know what it costs. |

On path C (the primary path) the `docker compose` commands in that table do not apply. The equivalents, with `pg_dump.exe`, `dropdb.exe` and `createdb.exe` in `C:\Program Files\PostgreSQL\18\bin`:

```bash
# Snapshot, same purpose as the compose pg_dump above
pg_dump -U user -h localhost -p 5432 assignment_assistant > demo.sql

# Full reset: drop, recreate, migrate, seed
dropdb -U user -h localhost -p 5432 assignment_assistant
createdb -U user -h localhost -p 5432 -O user assignment_assistant
pnpm db:migrate && pnpm db:seed
```

`dropdb` and `createdb` prompt for the role password, or read it from `PGPASSWORD`. Never put that value in a committed script. Do not use `pg_dump` output as the demo's source of truth: the idempotent seed is, and it costs nothing to re-run.

On path B (hosted Postgres), `pg_dump` needs `psql`/`pg_dump` installed. If they are not available, do not improvise a dump at 2 AM: rely on the idempotent seed, which is what the demo path actually depends on.

---

## 10. Related

| Doc | Relationship |
|---|---|
| [`.env.example`](../.env.example) | The environment contract. S2 reproduces it; it wins on conflict. |
| [`02-SCOPE.md`](02-SCOPE.md) | Which capabilities exist to operate. S5 is what the demo actually shows. |
| [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) | WP-01 creates the repository and the toolchain; WP-12 owns the demo hardening this doc supports. |
| [`13-DEMO-STORY.md`](13-DEMO-STORY.md) | S7 here is the operations half of the demo checklist there. |
| [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) | The submission requirements that the git history created here is evidence for. |
| `archive/canvas-scraper/README.md` | The archived, retired tool that owns the `CANVAS_*` variables. Not required by, and not used by, the app; not an app dependency (D44). |
