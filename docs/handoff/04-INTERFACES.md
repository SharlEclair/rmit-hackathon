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

---

## 6. Frozen in Phase 2 (WP-04, WP-05)

Frozen at the Phase 2 exit commit, tagged `phase-02-complete`. Same rules as section 3: a later phase
may **add**, but changing any of these means raising it in [`05-ISSUES.md`](05-ISSUES.md), recording
why in [`../../01-DECISIONS.md`](../../01-DECISIONS.md), and updating this file in the same commit.

`18` section 5 makes Phase 2 hand off "**`src/lib/llm/types.ts` and `schema.ts` frozen**; the test
fixture set; the extraction capability". All three are below.

### 6.1 The adapter contract (`app/src/lib/llm/`)

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| `LlmProviderId`, `AiCapability`, `LlmMessage`/`LlmContentPart`, `LlmRequest`, `LlmResponse`, `LlmUsage`, `LlmCapabilities`, `ModelValidationResult`, `LlmProvider`, `LlmErrorCode`, `LlmError`, `LlmCallLog` | `types.ts` | The `04` section 5.2 contract, reproduced. **`AiCapability` has six members**: `assignment_analyst`, `policy_guard`, `student_assistant`, `discussion_moderator`, `insight_engine`, `attachment_extraction` (D68). `insight_engine` **makes no call**: every adapter throws `CONFIG_INVALID` for it (D67). `LlmCallLog` is additive and carries decision fields only -- no request or response body (`04` section 10.1). | `04` section 5.2; **D67**, **D68**, **D89** |
| `resolveProvider(config)`, `createLlmClient(options)`, `getLlmClient()`, `resetLlmClient()`, `validateProviderConfiguration(config)` | `index.ts` | `resolveProvider` is pure (never reads `process.env`). `createLlmClient` wraps any provider with the budget check and call logging, and the mock is wrapped identically -- no capability special-cases `mock` (`04` section 5.8 rule 2). `getLlmClient()` is the only way to obtain a provider, so budget enforcement cannot be bypassed by calling an adapter directly. | `04` sections 5.1, 5.4, 5.6, 5.8 |
| `createGeminiProvider(deps)`, `thinkingKeyFor`, `GEMINI_KNOWN_MODEL_IDS`, `GEMINI_DEFAULT_BASE_URL` | `gemini.ts` | The default provider. `POST /v1beta/interactions`, `x-goog-api-key`, `{ model, system_instruction, input: <string>, store: false, generation_config }`, text from the last `model_output` step (D73, D89). `usage.outputTokens` includes thought tokens. `providerRequestId` is always `null`. Retry policy: one attempt, only for `429`/`5xx`/timeout. | **D73**, **D89**; `04` sections 5.3, 5.4, 5.7 |
| `createDeepseekProvider(deps)`, `DEEPSEEK_KNOWN_MODEL_IDS` | `deepseek.ts` | The documented alternative (D39). OpenAI-compatible `chat/completions`, bearer auth. **Schema enforcement there is prompt-level** (`response_format: json_object` plus the schema appended at the variable end); zod remains the contract. **No live call has been made through it.** | `04` section 5.3; **I-38** |
| `createMockProvider(deps)`, `mockResponseKey`, `registerMockResponse`, `resetMockResponses`, `MOCK_KNOWN_MODEL_IDS` | `mock.ts` | Offline, deterministic. An exact-response registry is consulted first, then a committed per-`systemPrefixId` template; an unmatched request returns `json: null` with `finishReason: 'content_filter'` -- a refusal, never an invented success (**D90**). **Phase 3 uses `registerMockResponse` to force any `guardrail_decision`**, which is `04` section 5.8 rule 5. | `04` section 5.8; **D90** |
| `STRUCTURED_SCHEMAS`, `parseStructured`, `toResponseFormat`, `PLANNING_LEVELS`, `POLICY_EFFECTS`, `POLICY_APPLIES_TO`, `AMBIGUITY_KINDS`, `AMBIGUITY_SEVERITIES`, the per-pass schemas and their inferred types | `schema.ts` | The structured-output contract. `parseStructured` **returns** `{ ok, value }` or `{ ok, issues }` and never throws or retries (D16). `toResponseFormat` emits the provider-facing hint (shape only; zod is the contract -- **D91**). **Every structured schema in the app belongs in this file.** | `04` section 5.2; **D16**, **D91** |
| `assembleMessages`, `systemPrefixId`, `renderGroundingChunks`, `parseGroundingChunks`, `renderStableJson`, `GroundingChunk`, `ParsedGroundingChunk` | `prompt.ts` | Block A/B in the `system` role, block C/D in the `user` role, variable content last (`04` section 5.5). Grounding chunks are numbered `[#N]` and that number is the only citation handle a model is given (**D93**). `parseGroundingChunks` is the mock's seam. | `04` section 5.5; **D93** |
| `BudgetStore`, `createPostgresBudgetStore`, `scopeKeyFor`, `scopeKindForCapability`, `maxCallsFromConfig`, `budgetExceeded` | `budget.ts` | The increment happens **before** the call. The scope key is prefixed by kind, so attachment extraction can never share the assistant session counter (D68). The store is injectable so `pnpm test` needs no database. | `04` section 5.6; **D68**, **D92** |
| `mapHttpStatus`, `maxAttempts`, `toLlmError`, `describeProviderError` | `errors.ts` | The `04` sections 5.4/5.7 tables in one place. `describeProviderError` reads one bounded `message` field and nothing else, so a provider body cannot carry a secret or student text into a log line. | `04` sections 5.4, 5.7; **C7** |
| `MOCK_TEMPLATES`, `buildStructurePass`, `buildMilestonesPass`, `buildFaqPass`, `buildPolicyPass`, `buildAmbiguityPass`, `buildAttachmentExtraction`, `MILESTONES_TEMPLATE_ID` | `fixtures/analyst-demo.ts` | The mock's committed templates, keyed by `<capability>-v<n>`. Each quotes only spans of the chunks the request carried, so the verbatim validator passes for the right reason. | **D90** |

### 6.2 Storage (`app/src/lib/storage/`)

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| `StorageObject`, `StorageDriver`, `StorageError`, `StorageErrorCode`, `assertValidKey`, `sourceStorageKey`, `uploadStorageKey` | `types.ts` | The `04` section 8 interface. Keys are validated (no `..`, no absolute path, no backslash, no NUL, bounded charset and length) and the resolved path is asserted to stay inside the root. Key builders take ids, never a user filename. | `04` section 8; `11` WP-04 |
| `LocalStorageDriver` | `local.ts` | Default driver. Atomic temp-then-rename writes; `contentHash` recomputed from the bytes actually read. `signedUrl` **throws `SIGNED_URL_UNSUPPORTED`**: no route serves document bytes yet (**I-06**), and inventing a path would break the 64-route vocabulary (T12). | `04` section 8; **I-06**, **T12** |
| `S3StorageDriver` | `s3.ts` | SigV4 in-process over `fetch`, no SDK. **Not exercised against a live endpoint**; only the signing arithmetic and key rejection are tested. | `04` section 8; **I-37** |
| `createStorageDriver(config)`, `getStorageDriver()`, `resetStorageDriver()` | `index.ts` | Driver selection from validated config, memoised. | `04` section 8 |

### 6.3 Extraction (`app/src/lib/extract/`)

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| `ExtractionResult`, `ExtractedPage`, `ExtractionError`, `ExtractionErrorCode`, `PDF_MIME`, `DOCX_MIME`, `PPTX_MIME`, `TEXT_MIME`, `MARKDOWN_MIME` | `types.ts`, `index.ts` | `extractDocument({ bytes, mimeType })` dispatches PDF / DOCX / PPTX / text / Markdown and throws `UNSUPPORTED_FORMAT` for anything else. `hasTextLayer: false` on a text-less PDF is the S3 "flag for tutor attention" outcome, not a crash. | `04` sections 3, 7 |
| `extractPdf`, `extractOoxml`, `extractPlainText` | `pdf.ts`, `ooxml.ts`, `plain.ts` | Verbatim extraction only -- no normalisation, no re-wording (C2). PDF page anchors per page; DOCX/PPTX have no pages and say so (`pageCount: null`). The ZIP reader verifies the **CRC-32** of every part it returns (**T28**). **Pass a copy of the bytes**: `pdfjs` detaches the buffer (**T27**). | `04` section 7; **T27**, **T28** |

### 6.4 Ingestion (`app/src/features/ingest/`, `app/src/features/uploads/`)

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| `runIngestion(input)`, `IngestionRunInput`, `IngestionRunResult`, `IngestionCounts`, `INGESTION_STAGES`, `resolveAnalystModelId`, `resolveMultimodalModelId` | `ingest/pipeline.ts` | S0-S8 as D60's job row. Returns a result and records failures on the job; it throws only for a caller error. Persists every artifact `AI_GENERATED` then promotes to `NEEDS_REVIEW` in one transaction, and writes one `audit_logs` row (counts and notes only). Never writes `analytics_events` (**T7**). | `04` section 7; **D60**, **D95** |
| `runAnalyst(input)`, `buildAnalystRequest(input)`, `selectGrounding(chunks)`, `extractAttachment(input)`, `AnalystProposal`, `AnalystInput`, `Grounded<T>`, `MAX_GROUNDING_CHUNKS`, `MAX_GROUNDING_CHARS` | `ingest/analyst.ts` | The five passes. Each resolves its own citations by index and refuses to persist an unresolvable one (**D93**). A schema-invalid pass is a recorded failure, not a retry (D16); a hard provider/config error aborts the run (**D95**). | `04` section 7 stage S6; **D16**, **D93**, **D95** |
| `ANALYST_PROMPT_VERSION`, `PASS_PREFIX_IDS`, `PASS_SCHEMA_NAMES`, `ANALYST_CAPABILITY`, `STATIC_PLATFORM_BLOCK`, `policyBlock`, `passInstruction` | `ingest/prompts/analyst.v1.ts` | The versioned prompt. **`PASS_PREFIX_IDS` values are also the mock's template keys**, so editing one in place silently changes what the offline path answers; a change is `v2`, never an edit. | `11` WP-05; **D90** |
| `checkChecklistItem`, `findImplementationVerb`, `isVerbatimSubstring`, `weightAppearsInText`, `findOverlappingRequirements`, `PLANNING_VERBS`, `IMPLEMENTATION_VERBS`, `IngestWarning`, `ValidationWarningCode` | `ingest/prompt-constraints.ts` | The deterministic constraints (D20, O1, I-2, `06` section 7.2.6). **Pure and offline**: Phase 4's review route recomputes the same warnings at read time with these functions, because `06` section 5.5.8 computes `ReviewArtifactResponse.validation` rather than storing it. | `06` sections 5.5.8, 7.2.5, 7.2.6, 7.2.10 |
| `chunkPages`, `normalisePageText`, `isHeading`, `ChunkCandidate`, `NormalisedPage`, `DEFAULT_TARGET_TOKENS`, `DEFAULT_OVERLAP_TOKENS`, `CHARS_PER_TOKEN` | `ingest/chunk.ts` | S4/S5. A single newline is an extractor artefact and becomes a space; a blank line is a paragraph and survives. Deterministic boundaries (`04` section 5.5 rule 1). `pageAnchors: false` nulls the page range for formats with no pages. | `04` sections 6.2, 7 |
| `attachStudentUpload(input)`, `AttachInput`, `AttachResult`, `AttachmentRefusal` | `uploads/attachments.ts` | O11 intake. Audio and video are refused with `UP5` before storage and before extraction; size and MIME are refused before the row exists. Extraction runs here under its own budget scope. **The guardrail scan is left `pending`** and the `scan` seam is Phase 3's (**D92**). | `04` sections 7, 9.2 step 12; **D68**, **D92** |

### 6.5 Database (`app/src/lib/db/`)

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| 35 tables, 2 views | `migrations/0002`-`0011` | `0011_ingestion_jobs.sql` adds `ingestion_jobs` and `llm_call_counters` and their two `updated_at` triggers. `06` section 7.8 specifies both. | `06` sections 7.8, 6.2; **D60**, **I-15** |
| `withTransaction(work)` | `transaction.ts` | The only way a feature opens a transaction without importing the driver. Every write in `persistProposal` is one transaction (trap T7's requirement, applied to the run). | `04` section 4; `handoff/01-STATE.md` section 5 item 4 |
| `insertQueuedJob`, `startJob`, `advanceJob`, `succeedJob`, `failJob`, `findLatestJob`, `findJobById`, `hasActiveJob`, `INGESTION_TOTAL_STAGES` | `queries/ingestions.ts` | The job lifecycle. The `INGESTION_IN_PROGRESS` guard is the partial unique index, so `insertQueuedJob` reports whether it won the race rather than asking a question first. | `06` sections 5.3, 7.8.1 |
| `consumeCall`, `readCounter`, `LlmScopeKind` | `queries/llm-budget.ts` | The increment and the ceiling check are one statement, so the ceiling holds under concurrency. | `04` section 5.6; `06` section 7.8.2 |
| `listSources`, `countSources`, `countChunksForSource`, `findSourceByContentHash`, `updateSourceExtraction`, `listT1Chunks`, `readStructureState`, `setCurrentStructure`, `markAssignmentIngesting`, `markAssignmentInReview`, `markAssignmentDraft`, `findAssignmentScope` | `queries/assignments.ts` | The ingestion reads and the assignment-scope read every assignment route needs. `listT1Chunks` ordering (brief, rubric, policy, then the rest, then chunk index) is part of the prompt, not a convenience: it is what keeps block C stable (`04` section 5.5). | `04` sections 5.5, 6; `06` section 5.2 rule 2 |
| `listApprovedPolicyRules`, `listApprovedMilestones`, `promoteStructureToNeedsReview` | `queries/structure.ts` | The approved-only reads the prompt uses, and transition 1 (`AI_GENERATED -> NEEDS_REVIEW`, `06` section 3.2) applied to every artifact of one structure plus the FAQ candidates the run inserted. | `06` sections 3.2, 7.2; `04` section 7 stage S8 |
| `insertAuditLog`, `NewAuditLog` | `queries/audit.ts` | The audit row. `before`/`after` are the writer's redaction duty (reading A12); Phase 2 writes counts and notes only. | `06` section 7.6.5 |
| `insertStudentUpload`, `findStudentUpload`, `updateUploadExtraction`, `updateUploadScan`, `readUploadExtractedText` | `queries/uploads.ts` | Every read filters by `student_id`; the extracted text has its own reader so it cannot leak into the response shape. | `06` sections 5.2 rule 4, 5.5.10, 7.3.6 |
| `findEnrolmentRole` | `queries/courses.ts` | Null means "not enrolled", which every route turns into `NOT_FOUND` rather than `FORBIDDEN_ROLE`. | `06` section 5.2 rule 2 |

### 6.6 API (`app/src/lib/api/`, the Phase 2 routes, `app/src/instrumentation.ts`)

| Interface | File | What it guarantees | Authority |
|---|---|---|---|
| `ErrorCode` (16 codes), `apiError`, `withRequestId`, `withRetryAfter`, `resolveRequestId`, `AUTH_ERROR_MESSAGES`, `PLATFORM_ERROR_MESSAGES`, `unauthenticated` | `lib/api/errors.ts` | The `06` section 5.3 envelope and status table, in one module. `ErrorCode` is now complete; the old `src/lib/auth/api-errors.ts` is deleted (**D94**, I-19). | `06` section 5.3; **D94** |
| `IngestionStatusResponse`, `StudentUploadResponse`, `AssignmentSourceResponse` | `lib/api/types.ts` | Three of `06`'s referenced-but-undefined response types (I-03), with no `storageKey`, no filename and no extracted text. | `06` sections 5.4, 5.5.8, 5.5.10; **I-03** |
| `POST /api/tutor/assignments/{id}/sources` | route | Multipart upload, O5/D57/D80 MIME set, size before type before storage. Records the source `pending`, never `extracted` (**D97**). | `06` section 5.4 |
| `POST|GET /api/tutor/assignments/{id}/ingest` | route | `POST` enqueues and returns **202** with the polling shape; the work runs under Next's `after()`, so the response is not held open for five model calls (D60). `NO_SOURCES` (422) and `INGESTION_IN_PROGRESS` (409) are decided by the database. `GET` with no run ever requested returns **404** (**I-39**). | `06` sections 5.4, 5.5.8; **D60** |
| `POST /api/student/uploads`, `GET /api/student/uploads/{uploadId}` | routes | O11 intake and status. The `GET` is owner-scoped in SQL, so another student's upload is indistinguishable from absent. | `06` sections 5.4, 5.5.10; **D92** |
| `register()` | `src/instrumentation.ts` | Startup provider probe (`04` section 5.4). Aborts with exit `78` when the provider is misconfigured and the rest of the config is valid; a wholly unconfigured checkout reports the variable names and continues, so `/api/health` stays reachable (D77's spirit -- see the file's own table). | `04` sections 5.4, 12; **D77** |

---

## 7. Frozen in Phase 4 (WP-06 and gate rule G1)

Frozen at the Phase 4 exit commit, tagged `phase-04-complete`. Same rules as section 3: a later phase
may **add**, but changing any of these means raising it in [`05-ISSUES.md`](05-ISSUES.md), recording
why in [`../../01-DECISIONS.md`](../../01-DECISIONS.md), and updating this file in the same commit.

`18` section 5 makes Phase 4 hand off "**the direction of the student-visibility gate**". It is below,
in `student-visibility.ts`; the state machine and the review contract travel with it because the gate
is only meaningful next to the transitions that decide what `PUBLISHED` means.

### 7.1 The state machine (`app/src/features/review/transitions.ts`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `PublicationStatus`, `ArtifactKind`, `ReviewAction`, `StampEffect`, `PermittedTransition`, `RefusedTransition`, `TransitionResult` | The tutor's half of `06` section 3.2: ten permitted `(from, action) -> to` rows, each carrying the transition number and the stamp effects it must apply. A refusal is a **value** (`ok: false`, `code: 'INVALID_STATE_TRANSITION'`) that names the status and the action, so no caller can mistake an exception for a pass. | `06` section 3.2; **D22**, **D53**, **D102** |
| `resolveTransition(from, action)` | The only decision function. Refuses `AI_GENERATED -> APPROVED` by name, refuses anything but `APPROVED -> PUBLISHED` for `publish`, and treats `REJECTED` as terminal. | `06` section 3.2; `11` WP-06 |
| `isStudentVisible(status)` | **The single student-visibility rule**: `PUBLISHED` and nothing else (**D99**, resolves I-21). A UI label only; the enforcement is section 7.2's SQL. | `06` sections 3.1, 3.4; **D99** |
| `permittedTransitions()`, `APPROVABLE_STATUSES`, `PUBLISHABLE_STATUS` | The whole table, and the status sets the two bulk actions act on, so a route does not restate them. | `06` sections 3.2, 5.4 |

### 7.2 Gate rule G1 (`app/src/lib/db/queries/student-visibility.ts`) -- the phase's handoff

| Interface | What it guarantees | Authority |
|---|---|---|
| `VisibleScope`, `findVisibleAssignmentScope(ex, assignmentId)` | The gate: `assignments.status = 'published'` **and** a current structure, resolved in one query. `null` for every failure, so a caller has one branch and cannot distinguish "not published" from "no structure" -- both are `NOT_FOUND`. Returns `courseId` so the caller can also check enrolment without a second read. | `06` section 3.4; trap **T3**; **D99** |
| `listVisibleRequirements`, `listVisibleRubricSections`, `listVisibleMilestones`, `listVisibleChecklistItems`, `listVisibleFaqEntries`, `listVisiblePolicyRules` | Every student-visible read, each taking a `VisibleScope` **and nothing else**. There is deliberately no `listVisibleX(assignmentId)`: a caller that could list by assignment id could list before checking the gate, and the empty-shell bug would come back. Each selects only `PUBLISHED` rows of the scope's structure (`faq_entries` has no `structure_id`, so it is assignment-scoped), and returns the Map's `sourceRef` fields for requirements and rubric sections. | `06` sections 3.4, 5.4, 5.5.5; trap **T3** |
| `guardStudentVisibleAssignment(request, requestId, assignmentId)` | `src/lib/auth/guards.ts`. Role, then G1, then enrolment on the assignment's course. **All three failures are `NOT_FOUND`**, so a student cannot use the difference to learn that another course's assignment exists. | `06` sections 3.4, 5.2 rule 2 |
| `guardTutorAssignment`, `guardTutorArtifact` | The tutor half: role, then the resource, then a tutor enrolment on its course. `guardTutorArtifact` resolves the artifact **first** and takes the assignment id from the artifact, so a tutor on course A cannot act on course B's artifact by pairing their own assignment id with a foreign artifact id. | `06` sections 5.2, 3.5 |

### 7.3 The review query layer (`app/src/lib/db/queries/review.ts`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `ReviewArtifactRow`, `listReviewArtifacts(ex, assignmentId, structureId)` | Every artifact of the current structure plus the assignment's FAQ entries, each with its payload, its cited chunk's text, its `revision`, and the structure's requirement quotes (for the overlap warning). O(n) queries, not O(7n). | `06` section 5.5.8 |
| `readAssignmentHeader`, `readPublicationCounts`, `readGateInputs`, `listAmbiguityFindings` | The bundle's remaining inputs. `readGateInputs` is the SQL half of the publish gate (sources, active job, milestones, milestones without a requirement link, approved policy rules, approved artifacts); the policy half is `computeGates`. | `06` sections 5.5.8, 7.2.8, 7.2.12 |
| `findReviewArtifact(ex, artifactId)` | One artifact by id across the seven tables. Seven statements rather than a `union`, because the payload columns differ per kind and a union would project every kind onto one row shape. | `06` section 5.5.8 |
| `writeRequirementNode`, `writeRubricSection`, `writeMilestone`, `writeChecklistItem`, `writeFaqEntry`, `writeAiPolicyRule`, `writeStructureStatus` | One literal UPDATE per kind, each setting its editable columns, the status, the four stamp columns through `case when <effect-flag>`, and `revision = revision + 1`, guarded by `where id = $id and ($expected = 0 or revision = $expected)` in the **same statement**. Table and column names are literals, never interpolated (trap T19's reason, and `structure.ts`'s own note). `expectedRevision = 0` means "no precondition" and is only legitimate for transition 9, whose guard column in `06` section 3.2 is `-`. | `06` sections 5.5.8, 3.2; **D98**, **T-19** |
| `approveAllReviewable`, `publishApprovedArtifacts`, `rejectArtifact`, `insertTutorArtifact`, `findMilestoneStructureId` | The bulk transitions and tutor authoring. `publishApprovedArtifacts` moves artifacts **before** setting `assignments.status = 'published'`, because that status is G1's third condition and the order is what makes a concurrent student read see a consistent state. `rejectArtifact` writes `REJECTED` and leaves `deleted_at` null (`06` section 3.7 keeps the row as evidence). `insertTutorArtifact` starts every row at `NEEDS_REVIEW`, and its `displayOrder: null` means "append", computed by a subselect in the insert. | `06` sections 3.2, 3.4, 3.7, 5.4 |

### 7.4 The review feature layer (`app/src/features/review/`)

| Interface | File | What it guarantees |
|---|---|---|
| `applyTutorTransition`, `rejectWithoutPrecondition`, `TransitionInput`, `ActionOutcome` | `actions.ts` | The ordering of the checks (state machine, then field immutability, then the policy rule code, then warning acknowledgement, then the write), the D53 no-op rule (a save that changes nothing writes nothing), and the audit row every mutating action writes. `ActionOutcome` carries the `ErrorCode` the route maps, so a route computes no status. |
| `EDITABLE_FIELDS`, `IMMUTABLE_FIELDS`, `refusedPayloadKeys`, `payloadChangesAnything`, `truthTierFor`, `validationFor`, `approvalAllowed`, `isAcknowledgable`, `derivePlanningLevel`, `TUTOR_AUTHORABLE_KINDS`, the six payload type guards | `artifacts.ts` | The pure rules. `verbatimText` and `criteriaText` are immutable (C2); a numeric column compared as a number is not a change; `planningLevel` follows the wording; validation is recomputed from the stored text. |
| `computeGates`, `PublishBlocker` | `gates.ts` | The four publish blockers and the three gate flags, pure, from the SQL inputs plus the artifacts' recomputed validation. |
| `checkPolicyRuleCode`, `isAssistantApplicable`, `isCapabilityRule` | `policy-rules.ts` | The AI Usage Policy write guard. **Takes the effect**, because `policyFromRows` requires a capability mapping only for `ALLOW`/`PROHIBIT` -- a guard stricter than the validator invents refusals (trap **T31**). |
| `inferReviewArtifact` | `mappers.ts` | Row -> `ReviewArtifactResponse`, recomputing the tier and the validation and falling back to `created_at` for a tutor-authored row's required `provenance.generatedAt`. |
| `buildReviewBundle`, `toSourceResponse` | `bundle.ts` | The whole `06` section 5.5.8 response, or `null` for a missing assignment. `ingestion: null` means no run was ever requested (**I-39**). |
| `computePublishOutcome` | `publish.ts` | The publish decision, reusing `computeGates`, and distinguishing "blocked" from the two non-blocker reasons (`ASSIGNMENT_NOT_IN_REVIEW`, `NOTHING_APPROVED`) so a refusal never sends the tutor to fix something that is not wrong. |

### 7.5 API and routes (`app/src/lib/api/`, `app/src/app/api/`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `ReviewBundleResponse`, `ReviewArtifactResponse`, `ValidationWarning`, `ValidationWarningCode`, `StructureArtifactPatchRequest`, `CreateArtifactRequest`, `ReviewCountsResponse`, `PublishBlocker`, `AmbiguityFindingResponse`, `AssignmentResponse`, `AssignmentMapResponse`, `AssignmentMapNodeResponse`, `AssignmentMapEdgeResponse` | `lib/api/types.ts` | The `06` section 5.4/5.5 shapes, defined when the routes that return them were built (I-03, I-41, **D103**). `AssignmentResponse` closes I-03's assignment case. |
| `StructurePayload`, `RequirementNodePayload`, `RubricSectionPayload`, `MilestonePayload`, `ChecklistItemPayload`, `FaqEntryPayload`, `AiPolicyRulePayload`, `ReviewArtifactPayload` | `lib/api/types.ts` | `06` section 5.5.8's payload union, complete: the four I-41 named, `RubricSectionPayload`, and a member for `kind: 'structure'` (**D103**). No payload carries a field a tutor may not change -- that is structural, not a validation rule. |
| `toIngestionStatusResponse` | `queries/ingestions.ts` | The `IngestionStatusResponse` mapping, exported from the module that owns `IngestionJobRow` so the ingest route and the review bundle cannot drift. |
| `listSources` gained `createdAt`; `AssignmentSourceSummary` gained the field | `queries/assignments.ts` | **Additive** to a Phase 2 signature. `AssignmentSourceResponse.createdAt` is required and the upload route could synthesise it for a row it had just written; the review bundle reads rows that already exist. |
| `isoTimestamp`, `isoTimestampRequired`, `nullableNumber`, `requiredNumber` | `lib/db/values.ts` | **New.** The driver returns a `timestamptz` as a `Date` **or** a string depending on its type cache, and `Number(...)` is already used for `bigint`/`numeric` for the same reason. Phase 4 hit the string case as a `500` on the review bundle's first live request, so a typed column is normalised at the boundary rather than trusted. Strict about type, silent about value (a bad value must never reach a log line, C7). |
| `GET /api/tutor/assignments/{assignmentId}/review` | route | The bundle. `NOT_FOUND` for an assignment the caller is not a tutor on. |
| `PATCH /api/tutor/structure-artifacts/{artifactId}` | route | `save` \| `approve` \| `reject` with `expectedRevision`, `acknowledgeWarnings` for a warning-bearing approval. Failure codes exactly `06` section 5.4's: `IMMUTABLE_FIELD`, `INVALID_STATE_TRANSITION`, `STALE_REVISION`, `VALIDATION_FAILED`. |
| `DELETE /api/tutor/structure-artifacts/{artifactId}` | route | Transition 9, **no revision precondition** (`06` section 5.4 gives this route no `STALE_REVISION`), `204`. The row is retained as `REJECTED`. |
| `POST /api/tutor/assignments/{assignmentId}/artifacts` | route | Tutor-authoring for a milestone, checklist item, FAQ entry or policy rule; `201` starting at `NEEDS_REVIEW`. An unmapped assistant-applicable rule code is `VALIDATION_FAILED` (**T22**/**T31**); a `structureId` that is not current is `INVALID_STATE_TRANSITION`; a checklist item's milestone must belong to the same structure. |
| `POST /api/tutor/assignments/{assignmentId}/approve` | route | Bulk transition 4/5. Reports how many moved. Approving is **not** publishing (**D99**). |
| `POST /api/tutor/assignments/{assignmentId}/publish` | route | Transition 7, the only action that makes content student-visible. `409 INVALID_STATE_TRANSITION` with `details.blockers` (or `details.reason`). Optional `{ artifactIds }` for the partial publish of `06` section 3.4. |
| `GET /api/student/assignments/{assignmentId}/structure` | route | The one student route Phase 4 ships, so WP-06's gate is verifiable over HTTP: the Assignment Map of `06` section 5.5.5, `404` for anything G1 hides. Phase 5 (WP-07) owns the rest of the workspace. |

### 7.6 The acceptance run and the two constraints a later phase will hit

1. **`app/scripts/verify-review.ts` is where WP-06's gate lives** (**D105**). It needs a running server
   and a migrated, seeded database, so it is a script rather than a test: `12` section 3.7 requires
   `pnpm test` to pass with no network and no database. It mints its own session with
   `signSessionToken` (the login route's own function) rather than reading the demo password. Eighteen
   checks; the report lands in `.local/phase4-review-verify.json`.
2. **`app/src/styles/tokens.css` declared no token, which is why Phase 4 built no page** (**I-44**).
   Phase 5 landed the token layer and then the page, so this constraint is now historical: see section 8.

---

## 8. Frozen in Phase 5 (WP-07 and WP-09)

Frozen at the Phase 5 exit commit, tagged `phase-05-complete`. Same rules as section 3: a later phase may
**add**, but changing any of these means raising it in [`05-ISSUES.md`](05-ISSUES.md), recording why in
[`../../01-DECISIONS.md`](../../01-DECISIONS.md), and updating this file in the same commit.

`18` section 5 makes Phase 5 hand off "**SSE event order** and the citation shape". Both are below, plus
the student-visibility surface the phase had to complete in order to render them at all.

### 8.1 The SSE event order and citation shape (`app/src/features/assistant/stream.ts`) -- the phase's handoff

| Interface | What it guarantees | Authority |
|---|---|---|
| `SseFrame`, `assistantStreamFrames`, `encodeSseFrame`, `guardrailEventFor`, `refusalPayloadFor`, `tokenFrames`, `TOKEN_FRAME_CHARS` | The order, stated once and asserted by a test rather than inferred from a route: **permitted turn** `guardrail` -> `token`* -> `citations` -> `message` -> `done`; **refusal turn** `guardrail` -> `message` -> `done`; **failed answer** `guardrail` -> `message` -> `error` -> `done`. `guardrail` is first, **always** (trap **T4**), and it carries the **persisted** decision -- a post-check trip or a schema failure replaces an initially-permitted verdict with `REFUSE`, so a client never waits for tokens that will not arrive. A refusal therefore emits **zero `token` frames**. Pure: no I/O, no clock. | `06` section 5.5.9; trap **T4**, **T5**; **I4**, **T13**; **D108**'s neighbour `D69` |
| `STREAM_PACING_MS` | **Transport pacing only.** Applied to `token` frames alone, so `guardrail` reaches the client immediately and `message`/`done`/`error` are never held behind cosmetics. It changes when a frame becomes readable, never its content or order. | `07` sections 2.1, 4.7.2 rule 4 |

**The client's half of the contract is frozen too, because a server order nobody honours is not a
contract.** `app/src/components/assistant-panel.tsx` tracks `seenGuardrail` and cancels the stream if a
`token` frame arrives first, discarding the partial text: `06` section 5.5.9 rule 1 requires exactly
that. Its frame parser is deliberately **independent** of the acceptance script's, so one bug cannot
satisfy both sides.

### 8.2 The student-visibility surface (`app/src/features/workspace/`, `app/src/lib/db/queries/student-workspace.ts`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `buildStudentWorkspace`, `buildBriefResponse`, `buildChecklistResponse`, `buildAiPolicyResponse`, `buildChecklistProgressResponse` | One builder per `06` section 5.5 response, so the workspace bootstrap cannot drift from the endpoints it summarises. Every read takes a `VisibleScope` -- there is **no** `(ex, assignmentId)` variant -- so nothing here can widen what a caller sees (trap **T3**). | `06` sections 5.5.3, 5.5.4, 5.5.6, 5.5.7; trap **T3** |
| `listPublishedSourceManifests`, `listBriefSections`, `listBriefPageText`, `listOwnChecklistProgress`, `readWorkspaceCounts`, `readWorkspaceHeader`, `readPolicyPublishedAt`, `findVisibleChecklistItem`, `findOwnChecklistProgress`, `findChecklistItemAssignmentId` | The student reads. `findChecklistItemAssignmentId` is **deliberately ungated and must stay that way**: a checklist transition addresses an item, so it needs the assignment id *before* gate G1 can run, and it returns one id and no content. Returning item text from it would be the T3 bug. | `06` sections 3.4, 5.4, 7.3; trap **T3** |
| `applyChecklistTransition` | The three transitions in one module, because they share a five-step order (resolve item -> gate -> rollup row -> write -> read back) and three copies is three places for the gate to be forgotten. `reopen` takes an optional `expectedReopenCount`; a mismatch is `INVALID_STATE_TRANSITION` rather than a silent double increment. | `06` sections 5.1, 5.1.1, 7.3.2; **D48**, **D108** |
| `uiStateOf`, `ChecklistItemUiState` | The API's three-value `state` mapped to the row component's four-value one, deriving `reopened` from `reopenCount`. It lives in `ui-state.ts` alone because a **client** component needs it and importing the bundle would put the query layer in the browser bundle. | `07` section 4.6 rule 6; **D48**, **D108** |
| `loadWorkspace`, `loadBrief`, `loadChecklist`, `loadCourses`, `loadCourseAssignments`, `requireStudentPage` | The pages' server-side loading. They read the query layer, not their own HTTP API: a `fetch` from a server component would need to forward the session cookie, run a second request inside the first, and put the URL contract between two halves of one process. | `07` sections 3.4, 3.5, 4.1-4.6 |
| `getServerSession`, `getStudentServerSession` | Session resolution for **server components**, which have no `NextRequest`. The order is `roles.ts`'s (`readSessionCookie` -> `verifySessionToken` -> `findUserProfileById` -> `listCourseMemberships`), so the page path cannot drift from the route path. Every failure is `null`; the role is read from the `users` row, never the token claim. | `04` section 9.1; `_shared.ts` |
| `loadReviewBundle`, `loadTutorCourses`, `loadTutorCourseAssignments`, `requireTutorPage` | The tutor pages' loading, applying the routes' own gate order to a page: assignment, then tutor enrolment on its course, all three answering `404`. | `06` section 5.2 rule 2 |

### 8.3 The provenance badge and the review surface (`app/src/components/`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `ArtifactProvenanceBadge`, `ArtifactProvenanceLine`, `ArtifactPageCitation` | **C3 made visible, and it decides rather than being told.** The badge is derived from `origin` and `publicationStatus`, so the three unapproved AI states all render the fixed pre-approval string and **no caller can pass one that does not**. A tutor-authored row is not labelled as AI output; an approved-but-unpublished row says so rather than borrowing the published label, because **D99** makes `PUBLISHED` the threshold. | C3, **I2**, **D99**; `07` section 2.2; `17` section 5.2 |
| `ReviewPanel` | The review surface's two rules: approving is not publishing (separate controls, no combined action), and a `VERBATIM_MISMATCH` row cannot be approved (C2 makes it unacknowledgeable), so the control is disabled and the card says why. Every write sends the row's `revision`, and the four refusal codes are reported as four different things. | **D99**, C2, **D102**; `06` sections 5.4, 5.5.8 |

### 8.4 The two acceptance runs, and what a later phase must know

1. **`app/scripts/verify-student.ts`** is Phase 5's run (**D107**'s neighbour `D105`'s pattern): **18
   checks** over HTTP against a running server and the seeded database, building its own published
   fixture so it depends on no seed state. It covers gate G1 in both directions, the whole workspace
   bootstrap, the brief manifest, the policy card, the checklist before any transition, `start` and its
   idempotency, `complete` and the **T7** analytics rows on data, the D48 no-op, `reopen` and its stale
   guard, re-completion, the **SSE refusal beat** (200, `guardrail` first, zero `token` frames), the
   permitted turn's token frames, and an unenrolled student's `NOT_FOUND`. Report:
   `.local/phase5-student-verify.json`.
2. **`app/scripts/verify-review.ts`** grew two checks (**20** now, was 18): the review page renders with
   the C3 marker on every unapproved AI artifact, and the page states that approving is not publishing.
   Both assert the **rendered HTML**, because a bundle can be correct while the page shows an unmarked
   artifact -- the failure C3 forbids.
3. **`pnpm test` still needs no network and no database** (`12` section 3.7), and still passes with no
   provider key. Every claim that needs either lives in one of the two scripts.

### 8.5 What a later phase must not assume

1. **The brief viewer is not page-rasterised** (**D107**). It renders `source_chunks.text` under the
   extractor's own headings and page ranges. It cannot reproduce the document's typography, and
   `viewerUrl` does not exist in any payload. Do not add one without a register change.
2. **`queries` has no `deleted_at`, and neither does `ai_policy_rules`.** A thread is closed by status;
   a policy rule is withdrawn by publication status. Both omissions cost a live `500` in Phase 5; check
   `information_schema.columns` before assuming a soft-delete column exists.
3. **`completeChecklistItem` guards on `state <> 'completed'`, not `completed_at is null`,** and
   assigns `completed_at`/`elapsed_seconds` through `coalesce`. The guard is D48's re-completion path and
   the `coalesce` is D48's first-interval rule; changing either breaks the round trip.
4. **The tab strip derives its active tab from `usePathname`.** A layout cannot read the request path in
   the App Router, so do not thread an `active` prop through the pages: four call sites is four chances
   to render the wrong tab as selected.
5. **`/student` and `/tutor` are page roots as well as API roots.** `src/app/student/**` and
   `src/app/tutor/**` are pages; `src/app/api/student/**` and `src/app/api/tutor/**` are the routes. The
   middleware protects both prefixes, and the pages still authorise independently.

---

## 9. Frozen in Phase 6 (WP-10 and WP-11)

Frozen at the Phase 6 exit commit, tagged `phase-06-complete`. Same rules as sections 3 and 8: a later
phase may **add**, but changing any of these means raising it in [`05-ISSUES.md`](05-ISSUES.md), recording
why in [`../../01-DECISIONS.md`](../../01-DECISIONS.md), and updating this file in the same commit.

`18` section 5 makes Phase 6 hand off **the anonymity contract's enforcement points** and **the analytics
aggregation shape**. Both are below, plus the three surfaces the phase had to build to reach them.

### 9.1 The anonymity contract (`app/src/features/discussion/anon-identity.ts`) -- the phase's handoff

| Interface | What it guarantees | Authority |
|---|---|---|
| `identityFor`, `findIdentityFor`, `identityMatches`, `displayLabelFor`, `candidateNumbers` | The derivation of `06` section 4.2, and its three non-obvious properties. **(a) The row is looked up by `(student_id, assignment_id)`, never re-derived from the HMAC**, so an `ANON_ID_SECRET` rotation cannot re-label an existing post (`06` section 4.2 fact 6, trap **T14**). **(b) The collision loop probes the numbers actually taken**, with `UNIQUE (assignment_id, display_number)` as the arbiter, so two concurrent first-posts cannot silently share a label. **(c)** The identity is created **lazily** -- on the first anonymous post, thread or flag, never for a student who only reads -- and is never deleted, so a later post cannot appear as a different person mid-discussion (`06` section 4.3). `candidateNumbers` is exported so the derivation's **order** is testable without a database | `06` sections 4.2, 4.3; A-ID-1..A-ID-8; **D26**, **D27**, **D55**; trap **T14** |
| `moderatorOutputSchema`, `MODERATOR_REASON_CODES`, `MODERATOR_CODE_SEVERITY`, `actionFor`, `moderatorFailureFallback` | The Discussion Moderator's contract. **Two combinator rules live in the schema rather than at a call site**: `overallSeverity` must equal the maximum flag severity, and a code's severity is a property of the code -- so a model filing `MOD_HARASSMENT` as severity 1 is a **validation failure**, not a silently corrected row. The reason-code **enum** is what makes `05` section 9.6's "an unknown `reasonCode` is a validation failure" true; the doc's `^MOD_[A-Z_]+$` pattern alone would accept `MOD_FOOBAR`. `moderatorFailureFallback` is `05` section 9.4 binding rule 5's outcome: severity 2, flagged, **visible** | `05` sections 9.2, 9.3, 9.4, 9.6; **D109**; `AGENTS.md` section 6 rule 4 |
| `moderatePost`, `statusForAction`, `applyModerationStatus`, `ModerationHook` | The pass, and **the rule that no path does nothing**: a provider error, a schema failure, a `content_filter` refusal and a timeout all land on severity 2 with a tutor note. `actionFor` cannot return a removal -- binding rule 1, "there is no severity that results in silent deletion". The hook takes the caller's `Executor` so the flag write joins the post's transaction, and a caller with no provider passes `null` **explicitly** rather than accidentally | `05` section 9.4 binding rules 1, 3, 5; `06` section 3.5 rule 4 |
| `buildModeratorRequest`, `moderatorJsonSchema`, `buildModeratorPrompt` | The provider-facing schema, **generated rather than added to the frozen `STRUCTURED_SCHEMAS`** (I-49). The prompt never truncates the post body -- a fragment could miss the sentence that matters, and binding rule 5's asymmetry makes that unacceptable -- and it asks for a tutor-facing description rather than a verdict on the person | **I-49**; trap **T30**; `04` section 5.5 |
| `tests/discussion/imports.test.ts` | The **structural** half of the contract. **A-ID-2**: exactly one runtime file names the identity table in executable code, and the Drizzle declaration's exemption is itself tested (the schema must contain no query against it). **A-ID-6**: the analytics service never names that table and never uses the `aa:anon:` domain, asserted against the **migration files** because the suite runs with no database. **A-ID-5**: `DiscussionAuthor` has exactly `isAnonymised` and `displayLabel` and none of the six forbidden identifiers | `06` section 4.4; A-ID-2, A-ID-5, A-ID-6 |

### 9.2 The discussion surface (`app/src/features/discussion/service.ts`, `app/src/lib/db/queries/discussions.ts`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `buildPostResponse`, `buildThreadResponse`, `buildStudentDiscussion`, `buildTutorDiscussion`, `buildThreadDetail` | **Anonymity is enforced as a shape, not a filter.** Every `DiscussionAuthor` is built in one function from the `discussion_author_display` view, so there is no intermediate object carrying an author id that a later filter could forget to strip (A-ID-5). `displayLabel` is present and **correct** -- A-ID-5 requires a tutor to see it; the forbidden thing is anything that resolves it to a person | A-ID-3, A-ID-5, **D55**; traps **T14**, **T3** |
| `createThread`, `createPost`, `editPost`, `deletePost`, `flagPost`, `promoteToFaq` | The transitions. A **reply adopts the thread's anonymity** rather than re-choosing it, because a later named reply would unmask every post before it. A peer's thread is `NOT_FOUND`, not `FORBIDDEN_ROLE` (`06` section 9.2's T-12). `promoteToFaq` refuses an unapproved answer, a root post and a removed one; `ck_faq_entries_peer_answer_source` is the schema refusing an unlinked peer answer even if those guards were deleted | `06` sections 5.5.13, 7.5.1, 7.5.2, 7.5.4; O8, **D28**, **D29**, **D50**, **D99** |
| `listThreads`, `listPosts`, `findThread`, `findPost`, `listModerationQueue`, `insertPost`, `insertThread`, `setPostStatus`, `setAcceptedAnswerStatus` | The reads and writes. **No read orders by an author column** -- there is no `orderBy: 'author'` option to pass, because A-ID-4 makes that a violation "even when the id is not returned". A tutor never edits: `setPostStatus` writes `status` and nothing else, which is what makes `editedByModerator` a truthful `false` | A-ID-3, A-ID-4; `07` section 6.2 rules 6, 8 |

### 9.3 The Query and FAQ surfaces (`app/src/features/queries/`, `app/src/features/faq/`, `app/src/lib/db/queries/query-threads.ts`, `faq.ts`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `listQueriesForStudent`, `listQueriesForTutor`, `listQueryMessages`, `setQueryStatus`, `findQueryScope`, `queryBelongsToStudent` | A Query is **always attributed** (D24, D50), which is why `listQueryMessages` may join `users` -- and why **nothing in the discussion feature imports anything from this one**. Ownership is filtered in SQL against the session's own id, so no route accepts a student id from the client | `06` sections 5.5.12, 5.2 rule 4; reading A1; **D50** |
| `openQuery`, `addStudentMessage`, `addTutorReply`, `resolveOwnQuery`, `publishReplyAsFaq` | The machine, one edge per actor: the **tutor's reply is the `open -> answered` transition**, written by the same statement that inserts the message (trap **T7**); only the asking student resolves, and only from `answered`; `closed` accepts nothing. `publishReplyAsFaq` copies the text rather than linking it, so a later edit withdraws the entry instead of changing it | `06` sections 7.4.1-7.4.4, 5.6; `07` section 5.4; **D24**, **D28**, O8 |
| `buildStudentFaq`, `buildTutorFaq`, `authorFaqEntry`, `editFaqEntry`, `faqResponseOf` | **The student read and the tutor read are different functions on purpose.** A student's is `listPublishedFaqEntries` (filtered in SQL); the tutor's is `listAllFaqEntries` (unfiltered). One function with an `isTutor` flag would move gate rule G1 into a boolean at the call site. A tutor-authored entry starts `NEEDS_REVIEW`; `APPROVED` remains invisible (**D99**); a `revision` mismatch is `409 STALE_REVISION` | `06` sections 5.5.3, 7.4.4, 5.2; **D98**, **D99**, **D109**; `07` section 5.5 |
| `listPublishedFaqEntries` (in `student-visibility.ts`) | The **one** FAQ read that takes no `VisibleScope`, for a tutor's own course. Its only callers are tutor routes that already ran `guardTutorAssignment`; requiring a scope would force them to fabricate one, and a fabricated scope is the argument a later reader trusts and reuses on a student path | `01-STATE.md` section 5 item 4; gate rule **G1** |

### 9.4 The analytics aggregation (`app/src/lib/db/queries/metrics.ts`, `app/src/features/analytics/service.ts`)

| Interface | What it guarantees | Authority |
|---|---|---|
| `refreshMilestoneMetrics`, `readMilestoneMetrics`, `refreshAssignmentMetrics`, `readAssignmentMetrics`, `listPublishedMilestones` | **M4 is a mean of per-student means, not a flat average.** The per-student mean is the inner `group by subject_ref` and is **never selected outward** -- `08` section 6 bullet 4 permits it only as an intermediate. The build **inserts, then the response reads back**, so "stored" and "computed" can differ visibly, which is the one defect a read model exists to expose. `contributor_count >= 5` is both a `having` and `ck_milestone_metrics_contributor_count`, so a small bucket is **absent** rather than suppressed. `MEDIAN_FLOOR` is **8**, above the k-anonymity floor | `06` section 4.7.2; `08` sections 4.3, 5.1; **D31**, **D32**; traps **T38**, **T39**; **I-50**, **I-51** |
| `detectDifficultyAreas`, `joinMilestones`, `milestoneResponseOf`, `windowFor`, `MARGIN_TIME`, `MARGIN_Q`, `MIN_ELIGIBLE_MILESTONES` | The two-condition rule, with **both margins as constants rather than environment variables**, because `08` section 5.1 note 4 requires that "a flag cannot be tuned away during a demo". The rule is **not evaluated below five eligible milestones** and says why. `insufficient_data` projects **every metric as `null`, never as zero** | `08` sections 5.1, 5.2; `06` section 5.5.11; **D34**, **D35** |
| `moderatorHookFor`, `readAssignmentTitle`, `viewerFor` (in `features/discussion/routes.ts`) | The route-side wiring. `moderatorHookFor` **never throws**: a fault outside `moderatePost`'s own conversion becomes `mark`, because binding rule 5 forbids both hiding and silence. `viewerFor` takes the **union** of the two guard scopes, because `VisibleScope` names the field `assignmentId` and `AssignmentScope` names it `id` | `05` section 9.4 binding rule 5; trap **T41** |

### 9.5 The four acceptance runs, and what a later phase must know

| Script | Checks | What it is for |
|---|---|---|
| `scripts/verify-student.ts` | **18** | Phase 5's workspace, gate G1 in both directions, the checklist round trip, the SSE refusal beat |
| `scripts/verify-review.ts` | **20** | Phase 4's review gate, plus the two page-rendering checks Phase 5 added |
| `scripts/verify-analytics.ts` | **13** | WP-11. Includes the **M4 discrimination** (`08` section 9's A15) on a fixture built so the two candidate formulas must differ by more than half |
| `scripts/verify-discussion.ts` | **20** | WP-10's anonymity at runtime, the Query machine, the FAQ chain in **both** intermediate states |

**None of them belongs in `pnpm test`.** `12` section 3.7 requires the suite to pass with no network and no
database, and all four need both by design (`app/scripts/` is operator tooling, **D72**). Each builds its
own fixture and mints its own session with `signSessionToken`, so none depends on seed state or a
published password.


