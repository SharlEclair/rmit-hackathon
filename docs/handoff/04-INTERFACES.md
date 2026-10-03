# 04 -- Frozen Interfaces

**Purpose.** The signatures another phase will consume, with the commit they were frozen at. A
session may **add** rows. Changing a frozen signature means: raise it in
[`05-ISSUES.md`](05-ISSUES.md), record why in [`02-DECISIONS.md`](02-DECISIONS.md), then update
this file in the same commit.

**Status at `phase-00-complete`: NOTHING IS FROZEN.** Phase 0 wrote no application code, so there
is no signature to protect yet. This file exists so that the first session that freezes something
has an obvious place to write it.

---

## 1. Declared-frozen-at-a-phase targets

These are the interfaces the phase plan expects to become frozen, and the phase that owns the
freeze. They are listed here so no session freezes them by accident, and so Phase 2 knows what it
is on the hook for.

| Interface | Frozen at | Authority | What it must contain |
|---|---|---|---|
| `AiCapability` union | Phase 2 | `04` sections 4, 5.3; **D68** | Six members: `assignment_analyst`, `policy_guard`, `student_assistant`, `discussion_moderator`, `insight_engine`, `attachment_extraction` |
| Provider adapter call shape | Phase 2 | `04` section 5; **D73** | `POST {base}/v1beta/interactions`; `x-goog-api-key`; `store: false`; `generation_config.thinking_level`; `response_format` for structured output; parse `steps[]` -> `model_output` |
| `GuardrailDecision` and the rule-id namespaces | Phase 3 | `05` sections 7.2, 5 | Verdicts `ALLOW` / `REFUSE` / `CLARIFY` / `ESCALATE_TO_TUTOR` / `NEEDS_REVIEW`; a 200 response for a refusal; refusal-shaped payload for `CLARIFY` (**D69**) |
| Student-visibility gate G1 direction | Phase 4 | `06` section 3.4; trap **T3** | Enforced in the query layer; a named unpublished resource is `NOT_FOUND`, never an empty shell |
| SSE event order + citation shape | Phase 5 | `06` section 5.5.9; trap **T4** | `guardrail` first, always; zero `token` events on a refusal; `token`, `citations`, `message`, `done`/`error` |
| `IngestionStatusResponse` | Phase 2 (WP-04/WP-05) | `06` section 5.5.8; **D71** | Defined in Phase 0; the **job table and stage enum** it polls are still owed by WP-04/WP-05 (**D60** builder note) |

## 2. Interfaces already fixed by the register (not by this file)

Some signatures cannot move without a register change, so they are effectively frozen now:

- **Route paths:** [`../06-DATA-MODEL.md`](../06-DATA-MODEL.md) section 5.4 -- the 64 routes. The
  only valid vocabulary (**D51**, **D58**, **D70**).
- **Anonymous author label:** `Anonymous Student #<n>`, computed at read time from a persisted
  `display_number` through the single view `discussion_author_display` (**D55**, trap **T14**).
- **Environment variable names:** [`.env.example`](../../.env.example) is the contract; `12`
  section 2.3 reproduces it and defers to it.

## 3. Frozen in Phase 1 (WP-01)

Frozen at commit `9c84ef8` (WP-01). A later phase may **add**, but changing any of these means:
raise it in [`05-ISSUES.md`](05-ISSUES.md), record why in [`02-DECISIONS.md`](02-DECISIONS.md),
then update this file in the same commit.

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| `HealthResponse` | `app/src/lib/api/types.ts` | `{ ok, db: 'up'\|'down', llmProvider, commit }`; HTTP `200` always; no secret. `db: 'down'` also means "`DATABASE_URL` unset", without the process dying. | **D76**, WP-01; `06` section 5.5.15 |
| `AppConfig`, `ConfigProblem`, `readConfig`, `getConfig`, `getConfigRead`, `ConfigError`, `EXIT_CONFIG` | `app/src/lib/config.ts` | **The only module that reads `process.env`.** Two problem severities: `fatal` (throws `ConfigError`, CLI exit `78`) and `degraded` (`/api/health` reports `ok: false`). Reports variable **names** only, never values (C7). | **D77**, WP-01; `04` sections 5.4, 11 |
| `LlmThinkingKey`, `LlmThinkingLevels` | `app/src/lib/config.ts` | Thinking levels keyed by **env var** (`guardrail`, `assistant`, `analyst`, `moderator`, `extraction`), deliberately **not** by `AiCapability`. Do not key it by capability: that union is Phase 2's to freeze. | **D77**; `04` sections 5.3, 11; **D68** |
| `getSql`, `getDb`, `probeDatabase`, `closeDb` | `app/src/lib/db/client.ts` | The only Postgres driver surface. Nothing outside `src/lib/db/` imports the driver (`04` section 4, property 2). `probeDatabase` never throws. | `04` sections 2.1, 4; D37 |
| `MigrationFile`, `MigrateResult`, `migrationHead`, `listMigrations`, `migrationsDir`, `migrate` | `app/src/lib/db/migrate.ts` | Files are `NNNN_<slug>.sql` under `src/lib/db/migrations/`, forward-only, **immutable once applied** (SHA-256 in the `schema_migrations` ledger), each in its own transaction. `migrate()` is idempotent. | **D74**; `06` section 6.7; `11` WP-01 |
| `pnpm lint` also runs the C8 endpoint gate | `app/scripts/check-c8.mjs` | Fails if a provider hostname or an inline `Authorization: Bearer` appears under `src/` outside `src/lib/llm/`. | **D78**; `04` section 5.9 check 2 |

**Not frozen, deliberately.** `expectedRevision` still has no storage; do not add a PATCH route that
silently ignores it (`05-ISSUES.md` **I-16**, owner Phase 2/4).

## 4. Frozen in Phase 1 (WP-02 and WP-03)

Frozen at commit `3a47eaf`. Same rules as section 3.

### 4.1 Schema and query layer (WP-02)

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| 33 tables, 2 views | `app/src/lib/db/migrations/0002`-`0010` | The SQL files are the **schema of record**. Enum-ish columns are `text` + a named `CHECK`, never `CREATE TYPE`; the soft-delete uniques are partial indexes; `source_chunks.embedding` is not in the chain. | **D74**, **D80**, **D81**; `06` sections 6.3, 6.7; traps **T18**, **T19** |
| `schema.ts`, `types.ts` | `app/src/lib/db/` | Typed queries only. `schema.ts` declares **no foreign keys**, deliberately, so Drizzle cannot lose `DEFERRABLE` or the composite shape. `types.ts` exports `XxxRow`/`NewXxxRow` per table. Do not treat either as the schema of record. | **D74**; `04` section 2.1 |
| `verify-schema.ts` | `app/scripts/verify-schema.ts` | Fails when a table or column exists in the SQL and not in `schema.ts`, or vice versa. Run it after any migration or `schema.ts` edit: `pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts`. **Views are excluded on purpose** -- they are not in `schema.ts`. | **D74** |
| `src/lib/db/queries/**` | `app/src/lib/db/queries/` | The **only** place SQL lives. One module per domain: `courses` (users, courses, enrolments), `assignments` (assignments, sources, chunks), `structure`, `students`, `questions`, `analytics`. Every write takes a transaction, so an event and the state change it describes commit together (trap **T7**). | `11` WP-02 |

### 4.2 Auth (WP-03)

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| `signSessionToken`, `verifySessionToken`, `SESSION_LIFETIME_MS`, cookie helpers | `app/src/lib/auth/session.ts` | `verifySessionToken` returns `null` for **every** failure and never throws on attacker input. 12-hour lifetime; a token claiming longer is refused. **Imports no project module**, so it stays unit-testable with no environment. | **D79**; `04` section 9.1 |
| `getSession`, `requireSession`, `requireRole`, `buildSessionResponse`, `AuthError` | `app/src/lib/auth/roles.ts` | The authoritative role comes from the `users` row on every request; the cookie claim is never an authorisation. `getSession` returns `null` rather than throwing, so a database outage is not an authentication bypass. | `04` section 9.1 |
| `SessionResponse`, `LoginRequest` | `app/src/lib/auth/roles.ts` + `06` section 5.5.1 | One materialisation of the contract. Field names are not negotiable. | `06` section 5.5.1 |
| `hashPassword`, `verifyPassword` | `app/src/lib/auth/password.ts` | argon2id. Algorithm and version are literals because `@node-rs/argon2`'s ambient const enums are unreadable under `isolatedModules`; the test asserts the encoded prefix. | `04` section 9.1 |
| `apiError`, `withRequestId`, `withRetryAfter`, `resolveRequestId`, `ErrorCode` | `app/src/lib/auth/api-errors.ts` | The `06` section 5.3 envelope. **Wrong home** -- relocate to `src/lib/api/errors.ts`; see **I-19**, owner Phase 2. Widen `ErrorCode` to the sixteen codes when you do. | `06` section 5.3; **I-19** |
| `SESSION_COOKIE_NAME`, `*_LANDING_PATH`, `LOGIN_PATH`, `PROTECTED_PATH_PREFIXES` | `app/src/lib/auth/_shared.ts` | Zero imports, so the edge-runtime middleware and the server modules cannot drift on the cookie name or the landing paths. | WP-03 |
| Middleware behaviour | `app/src/middleware.ts` | A **cheap presence/shape check only**. It never grants access. `/student` and `/tutor` without a cookie are `307` to `/login?next=...`; a forged cookie-shaped string reaches the route and is refused by `requireRole`. Do not rely on this file for authorisation. | `04` section 9.1, WP-03 |

**Two toolchain constraints a later phase will hit.**
1. **Vitest does not read `tsconfig.json` paths.** Phase 1 added the `@/*` alias to
   `app/vitest.config.ts`. Before that, any test loading a module that imported `@/...` failed to
   resolve, and it failed transitively. Keep the alias.
2. **Every `typescript-eslint` package aborts on `typescript` >= 7.** Add a lint rule that needs
   type information only by changing the pin, and change it in one commit (**D78**).
