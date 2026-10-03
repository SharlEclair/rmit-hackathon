# 01 -- Current State

**Purpose.** What is actually built, what is not, and the command that proves each claim. **This
file is rewritten every session.** It records commands and observed output, never adjectives.

**Tag:** `phase-00-complete`   **Last session:** 00 (Phase 0, 2026-10-04)   **Next phase:** 1

**Authority:** below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. Re-verify before trusting this file

Run this block and compare. Report any divergence to the user **before** doing other work.

```powershell
git log --oneline -1                 # expect the phase-00-complete commit
git remote -v                        # origin https://github.com/SharlEclair/rmit-hackathon.git
Test-Path app                        # expect False
Test-Path docs/fixtures              # expect False
Get-Service postgresql-x64-18 | Select-Object Status   # expect Running
node -v; pnpm -v                     # expect v24.x / 12.x
$PSVersionTable.PSVersion            # expect 5.1 (see 05-ISSUES I-09)
(Get-ChildItem docs/handoff).Name    # expect 8 entries
```

## 2. Environment fingerprint (observed in Session 00)

| Fact | Observed value | How |
|---|---|---|
| Shell | **Windows PowerShell 5.1.26100.9549, Desktop edition** | `$PSVersionTable` |
| OS | Windows (win32) | -- |
| Node | `v24.15.0` | `node -v` |
| pnpm | `12.4.2` | `pnpm -v` |
| psql | `18.6` at `C:\Program Files\PostgreSQL\18\bin\psql.exe` | `Get-Command psql` |
| Postgres | service `postgresql-x64-18` -> `Running`, native, port 5432 (path C, **D66**) | `Get-Service` |
| Docker | client `29.4.3`; **daemon not running** (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`) | `docker info --format '{{.ServerVersion}}'` |
| Git remote | `origin https://github.com/SharlEclair/rmit-hackathon.git` | `git remote -v` |
| Git HEAD before Phase 0 | `da00f71` (7 commits, all 2026-10-04, spanning ~38 minutes) | `git log --oneline` |
| GitHub public visibility | **NOT readable anonymously** -- `404` from both the web URL and `api.github.com` | `web_fetch` / anonymous GET. See 05-ISSUES I-07 |
| Gemini key | present in `.env` (length 53). `DEEPSEEK_API_KEY` present but empty | checked by **name and length only**; no value read or logged |
| `gh`, `vercel` | not installed (per `18` section 2; **not re-verified in Session 00**) | -- |
| Live Gemini reachability | **verified**: `POST /v1beta/interactions` -> HTTP 200, `status: "completed"`, text `"ok"` | see section 4 |

## 3. State of the build

| Area | State | Evidence |
|---|---|---|
| Repository + remote | **built** | `.git`, 7 commits pre-Phase-0, `origin` set |
| Documentation set (00-18) | **built**, and reconciled in Phase 0 | `git show --stat phase-00-complete` |
| `docs/handoff/` scaffold | **built** (8 entries) | `Get-ChildItem docs/handoff` |
| `.env` provider contract | **reconciled -- local only, gitignored** | `LLM_PROVIDER="gemini"`, `LLM_MODEL_REASONING="gemini-3.8-flash"`, 5 x `LLM_THINKING_*` |
| `app/` | **NOT STARTED** | `Test-Path app` -> `False` |
| `docs/fixtures/` | **NOT STARTED** | `Test-Path docs/fixtures` -> `False` |
| Database schema / migrations | **NOT STARTED** | no `app/` |
| Guardrail + golden set | **NOT STARTED** | no `app/` |
| Ingestion / Analyst | **NOT STARTED** | no `app/` |
| Assistant / SSE route | **NOT STARTED** | no `app/` |
| Analytics | **NOT STARTED** | no `app/` |
| Anything mocked | **nothing is mocked, because no code exists** | -- |

**Do not mark WP-01 complete.** Only its git half landed; see the status note in
[`../11-BUILD-PLAN.md`](../11-BUILD-PLAN.md) WP-01.

## 4. Phase 0 evidence

| Deliverable | Evidence (command + observed result) |
|---|---|
| Handoff scaffold, 8 paths | `Get-ChildItem docs/handoff` -> `00-README`, `01-STATE`, `02`-`06`, `07-ARCHIVE` |
| Rulings A-I recorded | `../01-DECISIONS.md` section I -> rows **D68-D73** plus the A-I letter mapping |
| Provider call shape settled | `../01-DECISIONS.md` **D73**, `02-DECISIONS.md` H1 |
| One verified live model call | `POST https://generativelanguage.googleapis.com/v1beta/interactions`, body `{"model":"gemini-3.8-flash","input":"Reply with the single word: ok","store":false,"generation_config":{"thinking_level":"low"}}`, header `x-goog-api-key` -> **HTTP 200**, `status: "completed"`, `steps: [thought, model_output]`, text `"ok"`, `total_thought_tokens: 69` |
| Structured output verified | same endpoint + `"response_format":{"type":"text","mime_type":"application/json","schema":{...}}` -> HTTP 200, `model_output` text `{"ok": true}` |
| `minimal` level rejected | same endpoint + `"thinking_level":"minimal"` -> HTTP 400, `THINKING_LEVEL_MINIMAL is not supported for this model` |
| Env reconciled | `.env` LLM_* lines now `gemini` / `gemini-3.8-flash` / 5 thinking levels; secret keys verified present by length |
| `.env.example` extended | `LLM_THINKING_EXTRACTION="low"` (D68); capability list no longer says "all five" |
| Stale specs corrected | `04` (22 edits), `06` (11), `07` (9), `11` (14), `12` (6), `14` (12), `01`, `02`, `03`, `05`, `00-INDEX`, `18`; see the phase-00 commit diff |
| AGENTS.md pointer | section 4 carries the three-line pointer to `00-README.md`; doc range now `00`-`18` + `handoff/**` |
| Tag | `git tag` lists `phase-00-complete` |

## 5. What a later phase must NOT assume

1. **Do not assume `.env` is correct on a clean clone.** It is gitignored; a fresh clone gets only
   `.env.example`. Copy it and set `GEMINI_API_KEY`.
2. **Do not assume the GitHub remote is publicly readable** -- it is not, as of Session 00 (I-07).
3. **Do not assume a `*Response` type exists** just because a route references it. Only
   `IngestionStatusResponse` was added in Phase 0 (I-03).
4. **Do not assume the ingestion job table or stage enum exists** (I-04).
5. **Do not assume `17`'s `--border-peer` is `#98A2B3`** -- the value is `#667085` (D65, I-05, trap T11).
6. **Do not assume line numbers in the docs are stable** -- Phase 0 moved many. Cite section
   headings, not line numbers.
7. **Do not assume `pnpm typecheck`, `pnpm lint` or `pnpm test` exist** -- there is no `package.json`.
8. **Do not assume the shell is PowerShell 7**; it is 5.1 (I-09).
9. **Do not treat `../16-VERIFICATION-REPORT.md` as current state**; it is a point-in-time audit (I-14).
