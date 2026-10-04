# 01 -- Live State

> **Read this first, and do not infer the build's state from anywhere else.** This file is rewritten at
> every session exit and is the authoritative answer to "what exists". `AGENTS.md` section 3 says the
> same and links here.

**Last session:** 09.
**Tag:** `phase-07-freeze` (points at `c4aede7`; it marks the freeze boundary, not the current tip).
**HEAD at session close:** `bdb8bf3` (this session's code and script commit; the handoff-docs commit
follows it, and the state file cannot quote the commit that contains it -- T42).
**Remote:** `origin` = `https://github.com/SharlEclair/rmit-hackathon-demo.git`. Session 09 is
**local only**: nothing has been pushed, and `git rev-list --count origin/main..HEAD` was 3 before this
session and is larger now. Confirm before pushing.

---

## 1. The one-paragraph version

The MVP is **feature-complete**. Session 09 closed the three machine-doable items session 08 left
(section 5 items 1-3 there) and a fourth it had not noticed: the demo story's beat 7 assumes a seeded
discussion thread that `seed.ts` never wrote. Discussions now renders its FAQ answers and has a thread
view with replies; My Queries has a list, a composer, a thread and its own `Flag Resolved`; the demo
reset produces the thread beat 7 opens on. What remains is **the five human-only items** and **one open
environment defect: I-68, the dev server does not hydrate**.

**If you have one session, do section 5's first item (I-68). It decides which command the demo runs.**

---

## 2. What exists, and the command that proves it

| Area | State | Evidence |
|---|---|---|
| Application | Next.js App Router under `app/`, frozen at `phase-07-freeze`, built on after it | `pnpm build` exit 0 |
| Student workspace | Brief viewer, Assignment Map, Checklist, AI policy card, Assistant + SSE | four acceptance runs |
| Tutor review screen | 55 artifacts, `AI GENERATED - REQUIRES TUTOR APPROVAL` badge, provenance, approve/reject | seen in a browser, session 08 |
| **Discussions (student)** | **FAQ answers rendered with the T2 treatment and a real date; thread list; thread detail with replies** | seen in a hydrated browser, session 09; `verify-discussion` 20/20 |
| **My Queries (student)** | **List, composer, thread view, follow-up message, `Flag Resolved`** | seen in a hydrated browser, session 09; `verify-discussion` 20/20 |
| Discussions / Queries (tutor) | Built in session 08 (`buildTutorDiscussion`, `buildTutorQueryGroups`); **never opened in a browser** | unverified |
| Analytics | assignment health, k-anonymity floors 5 and 8 | `verify-analytics` 13/13 |
| Navigation | persistent course/assignment sidebar, student and tutor | seen in a browser |
| Ingestion | S0-S8, provider adapter, budget counters | `pnpm demo:beats` 11/11 (session 07) |

### Gates and what each means

```
pnpm typecheck   -> 0 errors
pnpm lint        -> "C8 import/endpoint gate: ok" + "design gates: ok (13 checks)"
pnpm test        -> 765 passed (49 files)      # must pass with no network and no database
pnpm build       -> exit 0
pnpm db:migrate  -> 13 applied, 0 pending
verify-*.ts      -> need a LIVE server; these are HTTP runs and are deliberately NOT in pnpm test
```

Session 09 ran all four: `verify-student` 18/18, `verify-review` 20/20, `verify-analytics` 13/13,
`verify-discussion` 20/20.

---

## 3. Defects, open and closed

Full rows in `05-ISSUES.md`.

| ID | What it is | State |
|---|---|---|
| **I-68** | **Client components do not hydrate against `pnpm dev` in this environment.** Server output is complete; no React handler is attached (the untouched login form posts natively; the Assistant's `Send` never enables). The HMR WebSocket answers `ERR_INVALID_HTTP_RESPONSE`. | **OPEN -- highest priority.** Not caused by session 09 (it reproduces on a page the session did not touch) and explicitly not worked around. The same build under `next start` hydrates and works |
| **I-69** | The run sheet says `cd app; pnpm dev`; the browser evidence in session 09 came from `next start` on :3100. | **OPEN**, decided by I-68 |
| **I-64 / I-65 / I-66** | FAQ rendered a count and not the answers; no thread detail view; My Queries never inspected and a placeholder. | **FIXED**, verified in a hydrated browser |
| **I-60 / I-61 / I-62 / I-63** | Image bytes discarded by the adapter; every attachment refused; stale dev server; three unstyled pages. | FIXED / practice, session 08 |

---

## 4. Design-system state (session 08, unchanged since)

`17-DESIGN-SYSTEM.md` describes an **Institutional Editorial** direction whose point is that the product
must not look like an AI product. Two rules were relaxed in session 08, both recorded:

- **D110 -- motion.** The test banned `transition` and `opacity-` outright while the spec **requires** a
  hover transition at the `fast` duration and defines an entrance using opacity. The assertion now
  enforces the bound (no keyframes; any transition must name a motion token).
- **D111 -- a hover lift.** A card may rest on `--shadow-card` and lift to `--shadow-overlay` on hover
  only; content-class frames stay flat and the design-law test still refuses any shadow in
  `content-class-panel.tsx`.

Session 09 added interactive rows and forms; the 13 design gates and the design-law suite still pass.
**No gradients, no glassmorphism, no backdrop blur, no emoji chrome, and no truncation of document
facts.**

---

## 5. What to do next, in priority order

1. **Decide I-68.** Either diagnose why the Turbopack dev client never hydrates in this environment
   (its HMR socket fails with `ERR_INVALID_HTTP_RESPONSE`; `next dev --webpack` is the one-variable
   experiment) or change the run sheet to `pnpm build` + `pnpm exec next start`. Until then, **verify
   UI against the production build** -- trap **T44** carries the two one-line hydration probes.
2. **Open the tutor Discussions and Queries screens in a browser.** They were built in session 08 and
   have never been looked at, which is exactly how the two student screens came to be half-built.
3. **The five human-only items** -- the four fallback recordings, `demo/assets/failing-code-screenshot.png`,
   the three rehearsals, the Devpost filing, and section 5.3's per-member disclosure. None is
   machine-doable; see `14-HACKATHON-SUBMISSION.md` and `13-DEMO-STORY.md` section 12. **The user
   excluded all five from session 09 explicitly.**
4. **Re-verify the four acceptance runs** after any change to `src/lib/llm/`, the guardrail, or a route.
   They need a live server and are the only end-to-end evidence.

---

## 6. Environment, and the traps that will cost you time

**Fingerprint.** Windows PowerShell 5.1; Node `v24.15.0`; pnpm `12.4.2`; Postgres service
`postgresql-x64-18` on 5432, database `assignment_assistant`, 13 migrations; provider `gemini` with
`gemini-3.8-flash`; dev server at `http://localhost:3000`.

**Two ways to run it, and they are not equivalent (I-68).**

```powershell
# Development -- server output is correct, but the page DOES NOT HYDRATE in this environment.
Set-Location app; pnpm dev 2>&1 | Out-File -FilePath '.local\dev.log' -Encoding utf8   # run_in_background
(Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing).Content
git rev-parse --short HEAD     # the `commit` field must match this

# Production -- the same build, and the one to verify UI against and to rehearse from.
Set-Location app; pnpm build
pnpm exec next start -p 3100 2>&1 | Out-File -FilePath '.local\prod.log' -Encoding utf8 # run_in_background
```

**If the `commit` field disagrees with `git rev-parse`, restart.** That is I-62: a stale server reports
the previous commit's behaviour while looking like a live test, and it produced four wrong conclusions in
session 08. Session 09 found the dev server still serving `33cb300` and replaced it.

**Prove hydration before concluding a component is broken** (trap **T44**). Two one-line checks:
`Object.getOwnPropertyNames(document.querySelector('#some-input' ?? {})).filter(k => k.startsWith('__react')).length`
is non-zero on a hydrated page, and typing into a React-controlled input enables whatever it gates
(the Assistant's `Send` button is the convenient probe).

**Windows hazards, already recorded as traps `T40` and `T43`:**

- Any path containing `[` or `]` -- every `[assignmentId]` route -- needs `-LiteralPath`.
  `Remove-Item` on such a path **silently no-ops**, so a delete that "succeeded" left the file in place.
- Never use a multi-line `git commit -m`. PowerShell 5.1 mangles it, **git still exits 0**, and the
  message arrives truncated. Write the message to a file and use `git commit -F <file>`.
- Use `[System.IO.File]::WriteAllText($p, $t, [System.Text.UTF8Encoding]::new($false))`; `Set-Content`
  writes a BOM, which Next.js refuses to parse in `package.json`.
- Verify with `git ls-files` and `git log -1 --format=%B`, never with an exit code alone.

**A `--` or `//` comment inside a SQL template literal is a defect.** `--` is a TypeScript syntax error;
`//` is valid TypeScript and **invalid SQL**, so the query fails at runtime and the page renders nothing
while returning HTTP 200. This blanked the student dashboard in session 08.

**Sessions and probes.** `POST /api/auth/login` is rate-limited, so a repeatable probe should mint a
session with `signSessionToken` -- see `scripts/verify-*.ts`. A session cookie sent from PowerShell's
`Invoke-WebRequest -Headers @{Cookie=...}` is **not** delivered; use `fetch` from a `tsx` script. The
Assistant has a **12-call budget per session**, after which every turn returns `429` with no SSE frames
(I-54); clear it with `delete from llm_call_counters where scope_kind = 'assistant_session'`.

---

## 7. Accounts, fixtures, and demo state

| What | Value |
|---|---|
| Student account | `student@demo.rmit` / `demo1234` |
| Tutor account | `tutor@demo.rmit` / `demo1234` |
| Seeded cohort assignment | `9bcc22f0-61ba-49e0-870b-f85b57a86bfd` -- "Case Analysis and Design Proposal Report" |
| After-ingest demo state | `c890e50a-1f8b-4f5a-aa54-2879738f230d` -- "Case Analysis -- proposal awaiting review" |
| Real-content assignment (session 08) | `55f76b59-f06c-46c0-ad09-1b83820c7fa3` -- "Interactive Data Visualisation and Narrative Design" |
| Course | `0a8e65f8-c50b-4632-afbf-185e6e482155` (COSC2407) |

**`demo/reset.ps1` is now five steps:** migrations, schema drift, `pnpm db:seed`, `pnpm demo:state`, and
**`pnpm demo:discussions`** (session 09). The last one seeds three discussion threads into the demo
assignment -- one anonymous with a reply -- because `13-DEMO-STORY.md` beat 7 opens on a thread that the
seed does not write (trap **T45**). It is idempotent by thread title, so running a reset twice changes
nothing.

**Demo states come from `pnpm demo:state`.** It is idempotent **by title**, so renaming one of its
assignments in the database requires renaming the constant in `scripts/demo-state.ts` in the same breath,
or the next run inserts a **second** pair.

**Test fixtures are filtered out of the sidebar and the course count** by a name predicate
(`Review demo (%`, `Student workspace demo (%`, `Ingestion verification (%`, `Phase % fixture %`) in two
places that must agree: `loadSidebar` and `listCoursesForUser`. The acceptance runs create assignments and
never delete them -- by design, since deleting one would take the audit trail they produce -- so without
the exclusion the tree fills with test residue.

**A `dataviz` ingestion fixture exists**: `pnpm exec tsx scripts/ingest-once.ts --fixture dataviz`. Its
documents live in `app/.local/` (gitignored) because they mirror a real, currently-assessed piece of
coursework. **Do not commit them.**

**Publishing an ingested structure** for demo purposes is a two-step the product models deliberately:
`app/.local/publish-ingested.ts <assignmentId>` is a development helper that writes the same stamps the
review screen writes. It is not a product path and it does not bypass a rule.

---

## 8. Standing rules for the next session

- **Report evidence, not adjectives.** Quote the command and its output.
- **Do not push unless asked.** The repository is public. Session 09 committed locally and pushed
  nothing; confirm before pushing, and check `git rev-list --count origin/main..HEAD` first.
- **Look at the product.** The two defects session 09 found by looking were both invisible to every
  automated gate. Section 5 item 2 names the surfaces still unopened.
- **Verify UI against the production build until I-68 is closed** -- a page that renders correctly can be
  completely inert (trap **T44**).
- **A claim about the repository, written into a file the repository contains, is stale on commit**
  (trap `T42`). Never quote counts or shas from memory; quote the command that recomputes them.
