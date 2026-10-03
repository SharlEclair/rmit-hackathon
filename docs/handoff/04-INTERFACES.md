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

---

## 5. Frozen in Phase 3 (WP-08)

Frozen at commit `bf12a3e` (the golden-set commit; the engine landed at `7f4dd5a` and the contract
at `d9008e8`). Same rules as section 3: a later phase may **add**, but changing any of these means
raising it in [`05-ISSUES.md`](05-ISSUES.md), recording why in
[`../../01-DECISIONS.md`](../../01-DECISIONS.md), and updating this file in the same commit.

`docs/18-IMPLEMENTATION-PLAN.md` section 5 makes Phase 3 hand off "**`GuardrailDecision` shape and
rule-id namespaces frozen**". Both are in `types.ts` below, and the decision schema is the zod object
that produces the type, so the runtime check and the compile-time type cannot drift.

### 5.1 The contract (`app/src/lib/guardrail/types.ts`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `Verdict`, `VERDICTS`, `VERDICT_SEVERITY`, `moreRestrictive`, `mayGenerate` | The five verdicts and the severity order `REFUSE > ESCALATE_TO_TUTOR > CLARIFY > ALLOW_WITH_SCOPE > ALLOW`. `mayGenerate` is true for exactly `ALLOW` and `ALLOW_WITH_SCOPE`. | `05` section 3.1 |
| `ScopeToken`, `SCOPE_TOKENS`, `RefusalTemplateId`, `Confidence`, `DecisionLayer` | The five scope tokens, the four template ids (`T-REFUSE`, `T-SCOPE`, `T-CLARIFY`, `T-ESCALATE`), and `L1`/`L2`/`L3`/`L4`/`L5`/`PICKER`. | `05` sections 3.3.3, 10.1, 12.1 |
| `GuardrailDecision`, `GuardrailDecisionSchema`, `validateGuardrailDecision` | The `05` section 7.2 decision record, its strict schema, and the consistency table beneath it (which JSON Schema cannot express). A failure returns every problem; it never throws. | `05` sections 7.1, 7.2 |
| `KNOWN_RULE_IDS`, `isKnownRuleId` | Every rule id `05` defines, by namespace. **The schema's `pattern` is only half the rule**: section 7.1 rule 4 makes a rule id outside the known namespace a validation failure, so `P99` or `SYS_WHATEVER` is rejected even though it matches the prefix. | `05` sections 3.2.1, 7.1 |
| `SourceChunk`, `SessionState`, `DeclaredUpload`, `UploadClassification`, `AiUsagePolicyView`, `GuardrailLogRecord` | The inputs and the audit row, with no field that can carry student content (`GuardrailLogRecord` has `turnContentHash` and nothing else content-derived). | `05` section 8; `N4`; `C7` |

### 5.2 The entry point (`app/src/lib/guardrail/index.ts`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `decide(input, deps)` -> `DecideResult` | The only public entry. Runs the picker gate, extraction, L2, L1, L3, L4 in order and **never throws**: every failure is refusal-shaped, and a thrown module returns `SYS_GUARDRAIL_ERROR` with the message kept in `DecideResult.errors`. `DecideResult` also carries `layer`, `rendered`, `logRecord`, `frames`, `classifierCalls`, `extractionCalls`, `uploadClassifications`, `pickerRefusal`, `handedToClassifier`, and `warnings` (policy notes that are **not** failures). | `05` sections 3.2, 12.1, 12.2 |
| `SUPPORTED_UPLOAD_MIME_TYPES`, `gateUploads` | `image/png`, `image/jpeg`, `application/pdf`, `text/plain`, `text/markdown` are accepted; anything else is refused at the picker with `UP5`, **before extraction, before storage and before any session or message row**. | `05` section 6.4; **O11** |
| `UploadExtractorPort` | `attachment_extraction` one call per upload, returning `UP1`-`UP4` plus a confidence. It is a **port**: `src/lib/guardrail/` never imports `src/lib/storage/` or the adapter, so the picker's "zero adapter calls, zero storage writes" assertion holds structurally. | **D68**; `05` section 6.4 |

### 5.3 The pieces a later phase consumes directly

| Interface | File | What it guarantees |
|---|---|---|
| `GuardrailClassifierPort`, `ClassifierInput`, `classifyWithModel`, `applyConfidenceDowngrade`, `GUARDRAIL_PROMPT_VERSION` | `classifier.ts` | The L4 seam (**D87**). `classifier.ts` is the **only** file permitted to reach `src/lib/llm/`; at Phase 3 nothing does. Wire an adapter here: capability `policy_guard`, `systemPrefixId` = the port's `promptVersion`, `responseFormat` `json_schema`, `temperature: 0`, and return `LlmResponse.json` as untrusted `unknown`. A failed validation is `SYS_SCHEMA_INVALID` with **no retry**, and `confidence != "high"` on `ALLOW` becomes `CLARIFY`/`AMB4`. |
| `policyFromRows`, `validatePolicyView`, `overlayForView`, `capabilitiesForPolicyRuleCode`, `FLOOR_ALLOWED`, `FLOOR_PROHIBITED`, `PolicyRuleRow`, `PolicyOverlay` | `policy-source.ts` | `POL_APPROVED` / `POL_ABSENT` / `POL_INVALID` from published rows. The row-code to capability mapping is **D83**; an unmapped assistant-applicable code is `POL_INVALID` (**T22**). `PolicyRuleRow` is re-exported by `index.ts`, so a caller may import it from either. |
| `runPostCheck`, `PostCheckTrip`, `PostCheckResult` | `post-check.ts` | The seven trips of `05` section 3.2.3. **Phase 5 must call this on every generated answer** rather than re-deriving the checks; a trip replaces the answer with `T-REFUSE` and the second record's rules are `PostCheckResult.secondRecordRules`. The tripped answer is retained as `answerHash` only. |
| `renderDecision`, `renderRefusal`, `renderScoped`, `renderClarify`, `renderEscalate`, `policySentenceFromRuleText`, `wordCount` | `templates.ts` | `T-REFUSE`/`T-SCOPE`/`T-CLARIFY`/`T-ESCALATE` rendering, deterministic for a given decision and policy sentence (`R13`). **Phase 5 renders refusals with these; do not re-implement the wording** (**I-27**). |
| `buildGuardrailLogRecord`, `BuildLogInput`, `FORBIDDEN_LOG_FIELDS` | `log.ts` | The `05` section 8.1 row. The input type has no content field, so no path can log student text; `FORBIDDEN_LOG_FIELDS` is the list a test asserts against. |
| `evaluateDeterministic`, `RuleContext`, `RuleOutcome`, `LayerOneResult` | `rules.ts` | L1. `LayerOneResult.outcome === null` means "hand to L4", and `handedToClassifier` marks the one deliberate hand-off (`A5` asked about a term *in this assignment*, which `G22` makes a `MODEL` case). |
| `applyPolicyOverlay`, `resolveScope`, `capabilityForOutcome` | `policy.ts` | L2/L3. A policy can only restrict; an allowed outcome with no resolvable capability is refused rather than passed. L3 produces `SCOPE_LOCATE` for `UP2` and nothing else (**D85**). |
| `normaliseTurn`, `NormalisedTurn`, `GUARDRAIL_INPUT_CAP_CHARS`, `stemWord` | `normalise.ts` | L0. `raw` is never mutated; `hash` is the sha-256 of `raw`; `variants` are the `DE9` decodes (case-preserved) that L1 re-evaluates. |
| `REASON_CODES`, `sentenceForRule`, `platformRuleSentence` | `reasons.ts` | Machine reason codes and the per-rule platform sentence. `REFUSAL_COPY`, `refusalCopyFor`, `copyClassForRule`, `closingForClass` are in `refusal-copy.ts` (**D88**). |

### 5.4 Two constraints a later phase will hit

1. **The guardrail is offline by construction, and a test asserts it.** `tests/guardrail/imports.test.ts`
   reads every file in `src/lib/guardrail/` and fails if one imports the database, storage, a
   feature, a network module, or `node:*` other than `node:crypto` in the two hashing files. If you
   add an import there, the test is the reviewer.
2. **`pnpm test --coverage` was not run at Phase 3.** No coverage provider is installed; see
   **I-31**. The gate line exists in WP-08 and needs a dependency decision before it can be used.
