# app/ -- Assignment Assistant

The single Next.js (App Router) deployable: the UI and the JSON API are the same process
(D36, `04` S2). `app/` is self-contained (D44).

**Read first:** [`../docs/12-OPERATIONS.md`](../docs/12-OPERATIONS.md) is the operational
runbook this file summarises. Where the two disagree, `12` wins.

## Requirements

| Tool | Version on the development machine |
|---|---|
| Node.js | v24.15.0 |
| pnpm | 12.4.2 |
| Postgres | 18.6, native Windows service `postgresql-x64-18`, port 5432 (path C, D66) |

`gh`, `vercel` and `wrangler` are **not** installed; the deploy path must not need them.
Docker is optional (path A fallback only).

## First run

```bash
cd app
cp ../.env.example .env     # .env is gitignored at every depth. Never commit it (C7).
pnpm install
pnpm db:migrate             # idempotent; safe to re-run
pnpm db:seed                # synthetic demo cohort (no real personal data)
pnpm dev                    # http://localhost:3000
```

Then:

```bash
curl -s http://localhost:3000/api/health
# {"ok":true,"db":"up","llmProvider":"gemini","commit":"<sha>"}
```

`.env` is read by exactly one module: `src/lib/config.ts`. If a variable is missing or
invalid, that module either throws `ConfigError` (fatal) or records a *degraded* problem
that makes `/api/health` report `ok: false` -- see decision **D77** in
[`../docs/01-DECISIONS.md`](../docs/01-DECISIONS.md). No variable value is ever printed.

## Quality gates

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # vitest run -- must pass with no network access (12 S3.7)
```

## Database

`pnpm db:migrate` applies the committed SQL files in `src/lib/db/migrations/` in ascending
order and records each in the `schema_migrations` ledger.

- Migration files are **immutable once applied**: the runner stores a SHA-256 and refuses to
  continue if a file's bytes change. Add a new migration instead.
- To escape that during development, reset the database -- do **not** delete the ledger row:

  ```sql
  drop schema public cascade;
  create schema public;
  ```

- `pnpm start` first runs `tsx src/lib/db/migrate.ts --check`, which aborts with exit code 78
  when the applied head does not match the repository head (`04` S5.4).

**Decision D74:** the SQL files are the source of truth and the runner applies them;
`drizzle-kit` is pinned for `check`/`generate` but is not the runner. Rationale in
[`../docs/01-DECISIONS.md`](../docs/01-DECISIONS.md) section J.

Path A (containers) is a fallback and maps host port **5433**, not 5432, because the native
service owns 5432 (`12` S3.4). Using it means changing `DATABASE_URL` too.

## Postgres without a local install

See `12` S3.5: any hosted Postgres works; put its pooled connection string in
`DATABASE_URL` and skip `compose.yaml` entirely.

## Layout

```text
src/app/            routes: (auth)/, (tutor)/, (student)/, api/
src/components/     presentational only, no data fetching
src/features/       feature logic per domain
src/lib/llm/        the ONLY place a vendor SDK may be imported (C8)
src/lib/guardrail/  pure policy layer, no network (D7)
src/lib/db/         schema, typed queries, migrations
src/lib/auth/       session + role resolution
src/styles/         globals.css and the token files (17 S6.2)
tests/              unit + the guardrail golden set
```

No vector database, no message queue, no second service, no Canvas/LMS integration
(D38, D45, `04` S2). Do not scaffold any of them.
