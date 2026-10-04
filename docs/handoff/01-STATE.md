# 01 -- Live State

> **Read this first, and do not infer the build's state from anywhere else.** This file is rewritten at
> every session exit and is the authoritative answer to "what exists". `AGENTS.md` section 3 says the
> same and links here.

**Last session:** 08.
**Tag:** `phase-07-freeze` (points at `c4aede7`; it marks the freeze boundary, not the current tip).
**HEAD at session close:** `0cd4be2`.
**Remote:** `origin` = `https://github.com/SharlEclair/rmit-hackathon-demo.git`. The repository was
**renamed** from `rmit-hackathon` mid-session; all history and eight tags are on the new name.

---

## 1. The one-paragraph version

Phases 0-7 are **code-complete** and the feature set is frozen. Session 08 was not a feature session: it
was spent **looking at the running product** rather than at the diff, and that is where every finding came
from. It closed four real defects (two functionally serious), relaxed two design rules that the
enforcement had made stricter than their own specification, and left the remaining Phase 7 work where it
has always been -- human-only.

**If you have one session, do section 5's first item.**

---

## 2. What exists, and the command that proves it

| Area | State | Evidence |
|---|---|---|
| Application | Next.js App Router under `app/`, frozen at `phase-07-freeze` | `pnpm build` exit 0 |
| Student workspace | Brief viewer, Assignment Map, Checklist, AI policy card, Assistant + SSE | four acceptance runs |
| Tutor review screen | 55 artifacts, `AI GENERATED - REQUIRES TUTOR APPROVAL` badge, provenance, approve/reject | seen in a browser, session 08 |
| Discussions | composer + thread list (session 08); **no thread detail, no FAQ answer list** | POST 201; list renders |
| Queries | **never inspected in a browser** -- likely the same half-built state as Discussions | unverified |
| Analytics | assignment health, k-anonymity floors 5 and 8 | `verify-analytics` 13/13 |
| Navigation | persistent course/assignment sidebar, student and tutor | seen in a browser |
| Ingestion | S0-S8, provider adapter, budget counters | `pnpm demo:beats` 11/11 |

### Gates and what each means

```
pnpm typecheck   -> 0 errors
pnpm lint        -> "C8 import/endpoint gate: ok" + "design gates: ok (13 checks)"
pnpm test        -> 758 passed (48 files)      # must pass with no network and no database
pnpm build       -> exit 0
pnpm db:migrate  -> 13 applied, 0 pending
verify-*.ts      -> need a LIVE server; these are HTTP runs and are deliberately NOT in pnpm test
```

---

## 3. Defects found in session 08

Full rows in `05-ISSUES.md`. In the order they matter:

| ID | What it was | State |
|---|---|---|
| **I-60** | The Gemini adapter **discarded image bytes**. `inputText()` rendered parts with `part.type === 'text' ? part.text : ''`, so an image contributed nothing and the base64 never left the process. | **FIXED**, verified live |
| **I-61** | Every attachment was **refused**, text as well as images: `guardrail_scan_status` never left `pending`, because the `scan` seam Phase 2 left for Phase 3 was never supplied by any caller. | **FIXED**, verified on both halves |
| **I-62** | The dev server serves **stale code** after edits. `/api/health` exposes the serving commit. It bit session 08 **four times**, each time producing a wrong conclusion. | **A practice, not a fix** -- section 6 |
| **I-63** | Three user-facing pages were genuinely unstyled. Two carried a comment explaining why they were bare; the tokens landed and the comments did not. | **FIXED** |

**Still open, and found the same way:** the Discussions page renders only the FAQ **count**, not the
answers, and has no thread detail view. See section 5.

---

## 4. Design-system changes, and why they are not vandalism

`17-DESIGN-SYSTEM.md` is normative and describes an **Institutional Editorial** direction whose point is
that the product must not look like an AI product -- because a reader who thinks it does will reasonably
conclude the brief-versus-interpretation distinction is cosmetic.

Two rules were relaxed, both recorded as decisions:

- **D110 -- motion.** The *test* banned `transition` and `opacity-` outright. The *spec* **requires** a
  hover transition at the `fast` duration (section 10.3 rule 1) and defines an entrance using opacity
  (10.2). The test was stricter than its own source, so every hover in the product snapped. The assertion
  now enforces the **bound** -- no keyframes, and any transition must name a motion token -- instead of
  the absence.
- **D111 -- a hover lift.** Elevation was reserved for overlays. A card may now rest on `--shadow-card`
  and lift to `--shadow-overlay`, **on hover only**, because a card that cannot be told apart from the
  page cannot be told to be clickable either. Content-class frames stay flat, unqualified, and the
  design-law test still refuses any shadow in `content-class-panel.tsx`.

**What did NOT change:** no gradients, no glassmorphism, no backdrop blur, no card soup, no default
component-library appearance, no emoji chrome, and **no truncation of document facts** (section 2.4 rule
7 -- relaxing that would undercut C2, not just the aesthetic).

---

## 5. What to do next, in priority order

1. **Finish the Discussions page.** The Official FAQ section renders *"5 official answers have been
   published"* -- the count, not the answers -- although `buildStudentDiscussion` **already returns**
   `officialFaq`. There is also no thread detail view, so a student sees a title and the first post but
   cannot open a thread or reply, although `buildThreadDetail` and `createPost` exist in
   `features/discussion/service.ts`. Bounded work against a built backend.
2. **Inspect My Queries in a browser.** Never looked at. Discussions was half-built in exactly this way,
   so assume the same until proven otherwise: check whether the list renders, whether a Query opens, and
   whether a student can send a message.
3. **Re-verify the four acceptance runs** after any change to `src/lib/llm/`, the guardrail, or a route.
   They are the only end-to-end evidence and need a live server.
4. **Phase 7's human items** -- the four fallback recordings, `demo/assets/failing-code-screenshot.png`,
   the three rehearsals, the Devpost filing, and section 5.3's per-member disclosure. None is
   machine-doable; see `14-HACKATHON-SUBMISSION.md` and `13-DEMO-STORY.md` section 12.

---

## 6. Environment, and the traps that will cost you time

**Fingerprint.** Windows PowerShell 5.1; Node `v24.15.0`; pnpm `12.4.2`; Postgres service
`postgresql-x64-18` on 5432, database `assignment_assistant`, 13 migrations; provider `gemini` with
`gemini-3.8-flash`; dev server at `http://localhost:3000`.

**Start the server as a managed background job, then check its commit before trusting anything:**

```powershell
Set-Location app; pnpm dev 2>&1 | Out-File -FilePath '.local\dev.log' -Encoding utf8   # run_in_background
(Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing).Content
git rev-parse --short HEAD     # the `commit` field must match this
```

If they disagree, **restart**. A stale server reports the previous commit's behaviour while looking like a
live test. That is I-62, and it produced four wrong conclusions in session 08.

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
while returning HTTP 200. This blanked the student dashboard in session 08. Put the reasoning above the
function, at the JavaScript level.

**Sessions and probes.** `POST /api/auth/login` is rate-limited, so a repeatable probe should mint a
session with `signSessionToken` -- see `scripts/verify-*.ts`. The Assistant has a **12-call budget per
session**, after which every turn returns `429` **with no SSE frames at all** (I-54); clear it with
`delete from llm_call_counters where scope_kind = 'assistant_session'`.

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

**Demo states come from `pnpm demo:state`**, step 4 of `demo/reset.ps1`. It is idempotent **by title**, so
renaming one of its assignments in the database requires renaming the constant in `scripts/demo-state.ts`
in the same breath, or the next run inserts a **second** pair.

**Test fixtures are filtered out of the sidebar and the course count** by a name predicate
(`Review demo (%`, `Student workspace demo (%`, `Ingestion verification (%`, `Phase % fixture %`) in two
places that must agree: `loadSidebar` and `listCoursesForUser`. The acceptance runs create assignments and
never delete them -- by design, since deleting one would take the audit trail they produce -- so without
the exclusion the tree fills with test residue.

**Session 08 added a `dataviz` ingestion fixture:**
`pnpm exec tsx scripts/ingest-once.ts --fixture dataviz`. Its documents live in `app/.local/`
(gitignored) because they mirror a real, currently-assessed piece of coursework. **Do not commit them.**
The context folder at `C:\Users\91704\Downloads\Data Science\Sem 3\Data Viz\Ass 3\context v2` contains
**published textbook chapters** and the student's own assessed drafts -- ingesting the former is what the
product's own policy section 3.5 forbids, and publishing the latter misrepresents prior work as
submission-time material.

**Publishing an ingested structure** for demo purposes is a two-step the product models deliberately:
`app/.local/publish-ingested.ts <assignmentId>` is a development helper that writes the same stamps the
review screen writes. It is not a product path and it does not bypass a rule.

---

## 8. Standing rules for the next session

- **Report evidence, not adjectives.** Quote the command and its output.
- **Do not push unless asked.** The repository is public. Session 08 was asked to keep changes local for
  part of its run and then asked to add them to the renamed repository, so **confirm which** before
  pushing. Check `git rev-list --count origin/main..HEAD` first -- some commits may still be unpushed.
- **Look at the product.** Every finding in session 08 came from opening a page, and none from reading a
  diff. The untested surfaces are named in section 5.
- **A claim about the repository, written into a file the repository contains, is stale on commit**
  (trap `T42`). Never quote counts or shas from memory; quote the command that recomputes them.
