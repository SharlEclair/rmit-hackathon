# 12 -- Operations

**Purpose.** How this project is configured, run, seeded, deployed, kept secret-clean, and recovered when it breaks at 2 AM. Written to be followed literally.

**Scope.** Everything from `app/` outward: environment, database, storage, model provider, deploy, secrets, failure modes.

**Status.** No application code exists yet. Every command below becomes live with WP-01 ([`11-BUILD-PLAN.md`](11-BUILD-PLAN.md)). Nothing here claims to have been executed.

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
| `LLM_PROVIDER` | **Yes** | `mock` | One of `deepseek`, `gemini`, `mock`. |
| `LLM_MODEL_REASONING` | **Yes** | `deepseek-flash` | The default model for every AI capability. A 1M-context model with JSON output, tool calls and vision, so one model covers ingestion, guardrail classification, assistant responses, moderation, and image-bearing uploads. Do not invent model ids; an unknown id is an HTTP 400 at runtime. |
| `LLM_MODEL_MULTIMODAL` | No | *(empty)* | Optional separate model for uploads carrying images or PDFs -- the shipped attachment set (**O11**). Empty means reuse `LLM_MODEL_REASONING`, which is correct for `deepseek-flash`. Never consulted for audio or video, which the picker refuses before the adapter. |
| `DEEPSEEK_API_KEY` | Only when `LLM_PROVIDER=deepseek` | *(empty)* | Set only the key matching the selected provider. |
| `GEMINI_API_KEY` | Only when `LLM_PROVIDER=gemini` | *(empty)* | Set only the key matching the selected provider. |
| `LLM_BASE_URL` | No | *(empty)* | Overrides the provider base URL for proxies or self-hosted gateways. |
| `LLM_MAX_CALLS_PER_SESSION` | No | `12` | Hard ceiling on model calls per assistant session. A runaway retry loop must fail loudly rather than quietly burn the budget. |

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

Known **not** installed: Postgres server (nothing listening on `127.0.0.1:5432`), `psql`, `gh`, `vercel`, `wrangler`.

Two consequences that shape everything below:

1. **There is no local Postgres on this machine today.** Use path A (containers) or path B (hosted). Do not write instructions that assume a local server.
2. **`gh` and `vercel` do not exist.** Do not run `gh repo create` or `vercel deploy`. Use git remotes and the web UI (S3.2, S5).

### 3.2 Repository bootstrap (WP-01, do this first)

The repository is **not yet a git repository** -- there is no `.git` directory. Creating it is a real task with a deadline attached: the hackathon scores visible progress, and the AI-use disclosure must be reconstructable from history (`AGENTS.md` S7).

```bash
# 1. From the repository root
git init
git add .gitignore .env.example AGENTS.md CONTRIBUTING.md README.md docs "hackathon info" archive
git status --porcelain          # MUST NOT list .env, cookies.txt, .storage/, archive/canvas-scraper/out/
git commit -m "chore(repo): initial commit of the design doc set and frozen inputs"

# 2. Create the public repository in the GitHub web UI (no gh CLI available).
#    Then, with the URL GitHub shows you:
git remote add origin https://github.com/<owner>/<repo>.git
git branch -M main
git push -u origin main

# 3. Verify
git remote -v
```

If any secret appears in `git status --porcelain`, stop and fix `.gitignore` before committing. Rotating a leaked credential is cheaper than cleaning history.

### 3.3 Postgres, path A: containers (primary)

```bash
# Ensure Docker Desktop is running first; the daemon is not started by default.
docker info >/dev/null 2>&1 || echo "Start Docker Desktop before continuing"

docker compose up -d postgres      # compose file added by WP-01
docker compose ps                  # postgres must be healthy before migrating
```

`app/compose.yaml` (added by WP-01) should define one service:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: assignment_assistant
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d assignment_assistant"]
      interval: 5s
      retries: 10
volumes:
  pgdata:
```

Matching `.env` value: `DATABASE_URL="postgresql://user:password@localhost:5432/assignment_assistant"`.

### 3.4 Postgres, path B: hosted free tier (zero-install fallback)

Use this when Docker Desktop will not start, or when a teammate needs a database without installing anything. Supabase and Neon both issue a Postgres connection string on a free tier. Put it in `DATABASE_URL` and skip S3.3 entirely.

Two things to know about hosted Postgres:

- Use the **pooled** connection string if the provider offers one. Serverless deploys open many short-lived connections.
- If the connection string requires TLS, keep the `?sslmode=require` parameter the provider gives you. Do not strip it.

Never commit the connection string. It contains a password.

### 3.5 Install, migrate, seed, run

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

### 3.6 Quality gates

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

**`mock` is the default in `.env.example` for two reasons:** it lets a new teammate walk the entire product loop in under five minutes with no accounts, and it is the demo's offline safety net.

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

With this configuration the demo has exactly one external dependency: Postgres. If the model provider is available on the day, switch to `deepseek` for the live-ingestion beat **only after** a full run-through has passed, and keep the `mock` configuration in a second terminal ready to swap in.

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

Stop `pnpm dev` or `pnpm start` and `docker compose down` (not `down -v`; that discards the seeded volume). The database schema and the fixture survive a container stop.

---

## 8. Failure modes

Ordered roughly by how likely each is to appear during the weekend or during judging.

| # | Symptom | Likely cause | Action |
|---|---|---|---|
| F1 | App boots, every screen 500s | `DATABASE_URL` unset or pointing at a stopped database | `docker compose ps`; if path B, check the provider dashboard. `/api/health` reports `db` state without crashing. |
| F2 | `docker compose up` fails: endpoint not found | Docker Desktop is not running -- the daemon does not start by default on this machine | Start Docker Desktop, or switch to the hosted Postgres in S3.4. Do not spend more than 10 minutes on the daemon. |
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
| F16 | Seeding twice duplicates the fixture | The seed is not idempotent | It must be: re-running produces identical state (WP-02). Reset with `docker compose down -v` then `up -d` while developing, but fix the seed. |
| F17 | Elapsed time shows a negative or absurd value | Timestamps compared across timezones, or the start was never recorded | Store timestamps as `timestamptz`, compare in UTC, and label the metric "elapsed time" (D33). |
| F18 | A secret appears in a log line or an error page | A debug log or an unhandled error echoing config | Remove it, confirm the value is not in the repository, and rotate if it was committed (C7, S6.2 rule 8). |
| F19 | The venue has no usable wifi | Reality | It does not matter: `mock` plus local Postgres plus the recorded fallbacks. Rehearse this case before Sunday. |
| F20 | A judge asks how a screen was produced and the answer is unclear | The provenance badge or the demo-data marker is missing | Fix the screen. Every AI artifact carries its status, and every synthetic-data screen says so ([`02-SCOPE.md`](02-SCOPE.md) S5). |

---

## 9. Backup, restore and reset

Three separate things, with three different costs:

| Need | Command | Effect |
|---|---|---|
| Restore the **seeded demo state** | `pnpm db:seed` (after `demo/reset.sh`) | Idempotent re-seed. Fast. Use this before every rehearsal. |
| Snapshot the **database** before a risky change | `docker compose exec postgres pg_dump -U user assignment_assistant > /tmp/demo.sql` | A file you can restore with `psql < /tmp/demo.sql`. Do this once on Saturday evening, before the last sprint. |
| Full reset | `docker compose down -v && docker compose up -d && pnpm db:migrate && pnpm db:seed` | Destroys the volume. Takes minutes. Keep it as the escape hatch of last resort, and time it once so you know what it costs. |

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
