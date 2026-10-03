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
