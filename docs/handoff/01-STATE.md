# 01 -- Current State

**Purpose.** What is actually built, what is not, and the command that proves each claim. **This
file is rewritten every session.** It records commands and observed output, never adjectives.

**Tag:** `phase-03-complete` -- the Phase 3 exit commit, which adds `07-ARCHIVE/phase-03/`. The
packet commits it contains are `d9008e8` (the frozen contract, reason codes and L0), `7f4dd5a`
(L1-L5, the policy overlay and `decide()`) and `bf12a3e` (the 53-case golden set, the unit suites
and the upload fixtures). **Not pushed** at the time of writing: `origin/main` is still at the
Phase 1 push (`9dccd0f..49c10e1`), so a later session must push -- see section 8.

**Last session:** 03
**Concurrent session detected:** yes. A second session implementing **Phase 2** (WP-04/WP-05:
`src/lib/llm/`, `src/lib/storage/`, `src/lib/extract/`, `src/features/ingest/`, migration
`0011_ingestion_jobs.sql`, and the `I-19` relocation of the error envelope) was writing in the same
working directory throughout this session, exactly as `18` section 5.1 plans. Its files are
**uncommitted in the working tree** as this file is written and its own exit documents are not yet
written. Phase 3 therefore claims nothing about Phase 2's completeness, and neither session's
repo-wide gates were green at the same moment (**I-34**, trap **T26**).

**Authority:** below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. Re-verify before trusting this file

```powershell
git log --oneline -1                 # expect a commit after bf12a3e (the exit documents)
git status --porcelain               # expect modified files from the concurrent Phase 2 session
git tag                              # expect phase-00-complete, phase-01-complete, phase-03-complete
Test-Path app/src/lib/guardrail/index.ts   # expect True
cd app
pnpm test -- tests/guardrail         # expect 232 passed in 9 files, no network, no provider key
pnpm exec eslint src/lib/guardrail tests/guardrail scripts/make-guardrail-fixtures.mjs
                                     # expect exit 0, no output
node scripts/check-c8.mjs            # expect "C8 import/endpoint gate: ok"
```

The guardrail's own gate is the first command. The second and third are the **scoped** lint and C8
checks: `pnpm lint` and `pnpm typecheck` are repo-wide, and at the Phase 3 boundary both were red
because of files the concurrent Phase 2 session owns (**I-34**). Run them, but read the filenames:
`src/features/ingest/chunk.ts` (`no-control-regex`, `no-misleading-character-class`) and
`src/features/ingest/analyst.ts` (`TS1354`, `TS2353`, `TS2339`) are **not** Phase 3's.

The Phase 1 fixtures and database assertions still hold and are unchanged:

```powershell
cd app; pnpm db:migrate              # expect "no pending migrations (10 already applied)"
$env:PGPASSWORD='password'
psql -U user -h localhost -p 5432 -d assignment_assistant -tAc "select count(*) from users where role='student'"
# expect 37
psql -U user -h localhost -p 5432 -d assignment_assistant -tAc "select count(*) from ai_policy_rules"
# expect 9
Remove-Item Env:PGPASSWORD
```

## 2. Environment fingerprint (observed, Session 03)

| Fact | Observed value | How |
|---|---|---|
| Shell | **Windows PowerShell 5.1.26100.9549** -- not `pwsh` 7 | `$PSVersionTable` |
| Node | `v24.15.0` | `node -v` |
| pnpm | `12.4.2` | `pnpm -v` |
| Vitest | `5.0.3`; **config load needs a piped child process**, which the DSH workspace sandbox denies as `spawn EPERM` (Vite runs `net use` on Windows) | `pnpm test` |
| Postgres | `18.6`, service `postgresql-x64-18` running, 10 migrations applied (D66) | `pnpm db:migrate` |
| Git | `main` at `bf12a3e` **before** the exit docs; tags `phase-00`, `phase-01`, `phase-03` | `git log`, `git tag` |
| Full suite at the boundary | `pnpm test` -> **464 passed in 22 files** (232 of them `tests/guardrail`; the rest are Phase 1's and the concurrent Phase 2 session's) | `pnpm test` |

## 3. State of the build

| Area | State | Evidence |
|---|---|---|
| Guardrail engine: `types`, `reasons`, `refusal-copy`, `normalise`, `rules`, `policy-source`, `policy`, `classifier`, `post-check`, `templates`, `log`, `index` | **built** (WP-08) | `pnpm typecheck` reports no error under `src/lib/guardrail/`; `pnpm exec eslint src/lib/guardrail` -> exit 0; `tests/guardrail/imports.test.ts` asserts the purity and single-entry import graph |
| The 53-case golden set (G01-G53) | **built, 53/53 executing** | `pnpm test -- tests/guardrail` -> 232 passed; `tests/guardrail/golden-set.test.ts` asserts section 11.5's distribution and that no `MODALITY` marker or skip exists |
| Layer semantics as call counts (`DET`, `DET+EXTRACT`, `MODEL`, `PICKER`) | **built** | The runner asserts zero/one extraction and classifier calls per case; `MODEL` cases run against pinned mock outputs, so the suite needs no provider |
| Refusal rendering (`T-REFUSE`/`T-SCOPE`/`T-CLARIFY`/`T-ESCALATE`) | **built** | `templates.test.ts` byte-pins `G01`'s refusal and checks `R1`/`R2`/`R3`/`R9`/`R11`/`R13` over every refusal-shaped rendering |
| `policy-source.ts` against the **seeded** policy rows | **built** | `policy.test.ts`: the nine `PUBLISHED` rows of `golden/policy.demo-rows.json` (read back from Postgres with `psql`) yield `POL_APPROVED` with `explain_terminology`, `interpret_rubric`, `locate_source`, `quote_source_verbatim` |
| Upload fixtures + hash verification | **built** | 6 real attachments, byte-identical across two generator runs, and verified **from a fresh clone** (`git clone --no-hardlinks`): all 6 match `manifest.json`, and the cloned PDF reads back 364 chars through `pdfjs-dist@6.3.289` |
| L4 provider wiring | **NOT WIRED, by design** | `GuardrailClassifierPort` is declared in `classifier.ts` and no guardrail file imports `src/lib/llm/` (**D87**). The adapter wrapper is a later phase's change; `tests/guardrail/imports.test.ts` asserts nothing imports it today |
| Live `UP1`-`UP4` classification of real attachments | **NOT VERIFIED** | The codes are recorded in `docs/fixtures/attachments/manifest.json` and asserted by hash (**I-30**) |
| `pnpm test --coverage` (WP-08's second gate line) | **NOT RUNNABLE** | No coverage provider installed -- `Test-Path app/node_modules/@vitest/coverage-v8` -> `False` (**I-31**) |
| Phase 2 (`src/lib/llm/`, `storage`, `extract`, `features/ingest`, `0011_ingestion_jobs.sql`, `I-19`) | **in progress in a concurrent session; uncommitted at this boundary** | `git status --porcelain` lists those paths as modified/untracked. **Phase 3 verified none of it.** Its own tests were passing when the full suite was last run (464 total) and its lint was not (**I-34**) |
| Phase 4+ (review/approval, G1 gate, student surfaces, Assistant route, analytics) | **NOT STARTED** | No `(tutor)`/`(student)` page, no review state machine, no Assistant route, `milestone_metrics`/`assignment_metrics` still deliberately empty |

## 4. Phase 3 evidence, condensed

Full evidence is in [`06-SESSION-LOG.md`](06-SESSION-LOG.md) Session 03. The five checks worth
quoting here, because each one is a claim a later phase depends on:

| Claim | Command and observed result |
|---|---|
| The golden set executes in full, offline | `pnpm test -- tests/guardrail` -> **232 passed (9 files), 1.44 s**, with no network and no provider key. The 53 cases split 30 `REFUSE` / 15 `ALLOW` / 2 `ALLOW_WITH_SCOPE` / 3 `CLARIFY` / 3 `ESCALATE_TO_TUTOR`, matching `05` section 11.5's own table |
| No path from a student turn to a classifier call skips L1-L3 | Every `DET` case asserts **zero** classifier calls, and its assertion fails loudly if the port is consulted; the runner counts calls rather than comparing verdicts only |
| Refusal text cannot hallucinate or leak | `templates.test.ts`: `G01`'s `T-REFUSE` output is byte-pinned, and `R1`/`R2`/`R3`/`R9`/`R11`/`R13` hold for all 36 refusal-shaped cases |
| A policy can only restrict | `policy.test.ts` drives `decide()` twice with the same turn: a view whose `permitted` omits `explain_terminology` returns `REFUSE`/`POL_RESTRICT`; the full view returns `ALLOW`/`A5`. `FLOOR_PROHIBITED` is a subset of `effectiveProhibited` for every view tested, including one with `prohibited: []` |
| The committed binaries survive a clone (trap T20) | `git clone --no-hardlinks` to a temp directory: all 6 attachments byte-identical to `manifest.json`, and the cloned `shared-solution.pdf` extracted 364 characters through the pinned `pdfjs-dist@6.3.289` |

## 5. Phase 3 entry checklist -- read this before writing a line

1. **`decide()` is the only public entry** (`src/lib/guardrail/index.ts`). `05` section 12.1's
   purity rule is asserted by `tests/guardrail/imports.test.ts`; adding an import of the database,
   storage, a feature or a network module to any guardrail file fails that test.
2. **`classifier.ts` is the only file allowed to reach `src/lib/llm/`**, and at this boundary it does
   not: the seam is `GuardrailClassifierPort` (**D87**). Wire the adapter here, keep `responseFormat`
   `json_schema`, `temperature: 0`, and return `LlmResponse.json` as untrusted `unknown`.
3. **Validate, then trust.** A decision that fails `validateGuardrailDecision` is `SYS_SCHEMA_INVALID`
   and the model is **not** re-asked (`N3`, D16). `KNOWN_RULE_IDS` is the half of that check the JSON
   Schema cannot express.
4. **A new `ai_policy_rules.rule_code` needs a mapping** in `CAPABILITIES_BY_RULE_CODE`
   (`policy-source.ts`) or the assignment's policy becomes `POL_INVALID` and the assistant refuses
   everything for it (**D83**, trap **T22**). WP-05 must emit codes from that table.
5. **Do not add content to the log row.** `GuardrailLogRecord` has `turnContentHash` and nothing else
   content-derived; `log.test.ts` asserts it behaviourally over the refusing golden cases.
6. **Do not invent a second refusal wording.** Phase 5 renders refusals with `renderDecision()`;
   `R13` is a byte-equality guarantee and the canonical string is pinned in
   `tests/guardrail/templates.test.ts` (**I-27**).
7. **Drip detection is session-relative.** `H11`/`H12` need prior turns in `SessionState`; with an
   empty session they never fire, which is what keeps `G09`/`G16`/`G48` out of L1 (their `Layer`
   column requires L4). Do not "fix" that by making them content rules.
8. **`pnpm test --coverage` is unusable** until a coverage provider is added (**I-31**), and
   `pnpm test` needs the Vite config load to spawn a child process: under the DSH `workspace-write`
   sandbox that fails with `spawn EPERM`. Run it with the file sandbox at full access, or expect the
   gate to be unreadable.
9. **The full suite includes a concurrent session's tests.** 232 of the 464 passing tests were
   Phase 3's; a Phase 3 change that breaks `tests/extract/` or `tests/storage/` is a real conflict,
   but a red `pnpm lint` from `src/features/ingest/` is not Phase 3's (**I-34**).

## 6. What a later phase must NOT assume

1. **Do not assume the L4 path has ever run against a provider.** No adapter is wired to
   `GuardrailClassifierPort`; the `MODEL` cases run against pinned mock outputs. The first live
   classifier call happens when Phase 5 wires it.
2. **Do not assume the real extractor classifies the upload fixtures.** The `UP` codes are recorded
   in a manifest and verified by hash (**I-30**). Point the harness's `UploadExtractorPort` at the
   real extractor before claiming "the guardrail classifies attachments".
3. **Do not assume a refusal reaches a client.** `decide()` returns a `200`-shaped decision plus
   rendered text; no route serves it, and `I4`/`T13` (a refusal is a `200` with the boundary
   treatment) is therefore still unexercised at the HTTP layer.
4. **Do not assume `pnpm lint` is green.** It was red at this boundary for files Phase 2 owns
   (**I-34**). Re-run it after both sessions stop before quoting it as evidence.
5. **Do not treat the upload-scoped ALLOW rules in the demo policy as inert by accident.** `4.4`
   (mechanical editing) is deliberately excluded from the assistant's permitted set, because
   admitting it would widen the platform floor (**I-33**). Fixing that is a floor amendment, not a
   mapping edit.
6. **The Phase 1 cautions still stand** -- `src/lib/storage/` was exercised by Phase 2's driver but
   nothing in `src/lib/guardrail/` touches it; `assignment_sources.storage_key` is still the seed's
   convention; session revocation still does not exist (**D79**, **I-20**); `expectedRevision` still
   has no storage (**I-16**).

## 7. Files Phase 3 added, and who may change them

| Path | Owner from here |
|---|---|
| `app/src/lib/guardrail/**` | Phase 5 may **add** the adapter wrapper at the `classifier.ts` seam; anything else is an interface change (04-INTERFACES section 5) |
| `app/tests/guardrail/**` | Any phase that changes guardrail behaviour must add or update a case (`N5`); case ids are never renumbered (`05` section 11.7) |
| `app/scripts/make-guardrail-fixtures.mjs`, `docs/fixtures/attachments/**` | Phase 2/5 when the real extractor is pointed at them; regenerate rather than hand-edit |
| `app/tests/guardrail/golden/policy.demo-rows.json` | Whoever regenerates the seeded policy. It is a **copy** of the nine `PUBLISHED` rows read with `psql`; if the seed changes, this fixture and `policy.test.ts`'s expectations change with it |

## 8. Before submission

`origin/main` does **not** have Phase 3: the last push was Phase 1's
(`9dccd0f..49c10e1`). The Lead must push `main` and the `phase-03-complete` tag, and must push the
concurrent Phase 2 session's work once that session has written its own exit documents -- the two
sessions' commits are interleaved in one branch.
