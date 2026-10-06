# AssignMate -- Technical Specification (v2)

> **Single source of truth.** This document supersedes all docs numbered `00` through `18`.
> The frozen originals (`docs/project idea.md`, `docs/assignment_assistant_project_handoff.md`)
> remain authoritative on product intent. This file translates that intent into buildable tasks.
>
> **LLM Provider:** DeepSeek v4.1 Flash (`deepseek` in config). The adapter already exists at
> `src/lib/llm/deepseek.ts`. Set `LLM_PROVIDER=deepseek` and `DEEPSEEK_API_KEY=...` in `.env`.

---

## 1. What AssignMate Is

An AI-native assignment workspace for university students and tutors.

**Core loop:**
1. Tutor uploads assignment files (PDF, DOCX, PPTX, images).
2. AI analyzes them and generates: structure, milestones, checklist, FAQ candidates, ambiguity flags, AI usage rules.
3. Tutor reviews and approves everything before students see it.
4. Students work through the assignment using: the original brief viewer, the AI-generated map, checklist, private queries, anonymous discussions, and a constrained AI coach.
5. Tutor sees aggregate cohort analytics -- time per milestone, question volume, difficulty signals.

**The one rule everything else is subordinate to:**
> The AI must never do the assignment for the student.

---

## 2. Absolute Constraints (never weaken)

| ID | Rule |
|---|---|
| C1 | The Assistant never generates answers, code, or solution steps; never debugs or evaluates student work. |
| C2 | Official assignment requirements are never paraphrased as requirements. Show the original document. |
| C3 | Nothing AI-generated is student-facing until a tutor approves it. Always label it `AI generated -- requires tutor approval`. |
| C4 | Tutors cannot see who is behind an anonymous post. |
| C5 | Tutor analytics are aggregate only. No per-student identification or individual histories. |
| C6 | Student uploads (text / image / audio / video / PDF) do not bypass C1. Same guard, all modalities. |
| C7 | Secrets (API keys, `.env`) are never committed, logged, or returned in API responses. |
| C8 | Every LLM call goes through `src/lib/llm/`. No vendor SDK imported anywhere else. |

---

## 3. What Already Exists (do not rebuild)

| Area | Location | State |
|---|---|---|
| Auth (login, session, role) | `src/lib/auth/`, `src/app/(auth)/` | Built, working |
| DB schema + migrations | `src/lib/db/schema.ts`, `src/lib/db/migrations/` | 13 migrations applied |
| LLM adapter (Gemini + DeepSeek + mock) | `src/lib/llm/` | Built; switch via `LLM_PROVIDER` env |
| Guardrail policy layer | `src/lib/guardrail/` | Built; pure/testable; default is REFUSE |
| Ingestion pipeline (S0-S8) | `src/features/assignment/` | Built; CLI only, no upload UI |
| Student workspace | `src/app/student/assignments/[assignmentId]/` | `page.tsx`, `checklist/`, `discussions/`, `queries/` -- all built |
| Tutor review screen | `src/app/tutor/assignments/[assignmentId]/review/` | Built (55-row artifact table) |
| Tutor dashboard + course list | `src/app/tutor/` | Built |
| Brief text viewer | Inside student workspace | Built as plain text/markdown; NOT a PDF viewer |
| Navigation sidebar | Both tutor and student | Built |

**Confirmed missing (the v2 build target):**

| Missing | Route to create |
|---|---|
| Tutor assignment hub (Queries / Discussions / Analysis tabs) | `src/app/tutor/assignments/[assignmentId]/page.tsx` |
| Tutor file upload + ingestion UI | `src/app/tutor/assignments/new/page.tsx` |
| Proactive assistant on milestone entry | Mount the `ProactiveAssistant` component (currently `null` in `layout.tsx`) |
| Modern design system | Replace `globals.css` styles; remove `design-law.test.ts` restrictions |

---

## 4. Routes (complete map)

### Tutor routes
```
/tutor                                              -- dashboard (course cards)
/tutor/courses/[courseId]                           -- assignments list + FAB to add
/tutor/assignments/new                              -- upload page (v2 BUILD)
/tutor/assignments/[assignmentId]                   -- hub: Queries / Discussions / Analysis (v2 BUILD)
/tutor/assignments/[assignmentId]/review            -- existing artifact review table (keep as-is)
```

### Student routes
```
/student                                            -- dashboard (course cards)
/student/courses/[courseId]                         -- assignments list
/student/assignments/[assignmentId]                 -- main workspace: Assignment/Info tab (default)
/student/assignments/[assignmentId]/checklist       -- milestone + checklist tab
/student/assignments/[assignmentId]/discussions     -- FAQs + discussion threads
/student/assignments/[assignmentId]/queries         -- private tutor queries
```

### API routes (already exist -- do not restructure)
```
POST /api/auth/login
POST /api/auth/logout
GET  /api/assignments/[id]
GET  /api/assignments/[id]/structure
GET  /api/assignments/[id]/checklist
GET  /api/assignments/[id]/discussions
GET  /api/assignments/[id]/queries
POST /api/assignments/[id]/queries
POST /api/assignments/[id]/discussions
GET  /api/tutor/assignments/[id]/queries
GET  /api/tutor/assignments/[id]/discussions
GET  /api/tutor/assignments/[id]/analytics
POST /api/assistant/[assignmentId]          -- SSE streaming
POST /api/assignments                       -- create assignment (ingestion trigger)
```

---

## 5. Tutor Assignment Hub -- `/tutor/assignments/[assignmentId]/page.tsx`

This page is the main missing piece. Build it as a tab container with three tabs.

### Tab 1: Queries

What tutors see:
- Questions grouped by topic/milestone (AI-clustered or milestone-bucketed).
- Each group is a collapsible section showing the count and topic label.
- Inside a group: individual query cards.

Each query card contains:
- Student name (non-anonymous queries only) + timestamp.
- The question text.
- A reply input field.
- **Reply** button (private, student only) and **Publish to FAQ** button (adds to assignment FAQs).

Wire to: `GET /api/tutor/assignments/[id]/queries` (service: `buildTutorQueryGroups` -- already exists in features layer).

### Tab 2: Discussions

Two sections:
1. **Official FAQs** -- tutor-published answers. Show each as a card with the Q and A.
2. **Student Threads** -- list of discussion threads. Each row shows title, reply count, and a moderation status badge (`OK` / `NEEDS_REVIEW` / `HIDDEN`).
   - Clicking a thread opens a detail panel with all posts.
   - Tutor can approve a student reply (makes it a "verified answer"), remove a post, or publish the thread as an FAQ.

Wire to: `GET /api/tutor/assignments/[id]/discussions` (service: `buildTutorDiscussion` -- already exists).

### Tab 3: Analysis

Show aggregate cohort metrics. Do NOT show any per-student data.

Metrics to display:
- Table: Milestone | Avg time | Completion % | Question count -- already returned by `GET /api/tutor/assignments/[id]/analytics`.
- Difficulty signal cards: surface milestones with high avg-time AND high question-count as an alert card reading "Potential difficulty detected -- [Milestone name]."
- Common question topic list (top 5 topics by volume).

**Remove the k-anonymity floor.** Show data even if N < 5. The original spec just says "aggregate only," not "refuse to display."

---

## 6. Tutor Upload Page -- `/tutor/assignments/new/page.tsx`

Build a two-stage page:

**Stage 1 -- Upload**
- Assignment title text input.
- File dropzone accepting PDF, DOCX, PPTX, images.
- Multiple files supported.
- A clear label list per file type: "Assignment spec", "Rubric", "AI usage guidelines", "Supplementary material."
- Submit button calls `POST /api/assignments` with a multipart form.

**Stage 2 -- Processing**
- Show a progress indicator with named stages:
  - `Extracting text...`
  - `Analyzing structure...`
  - `Identifying milestones...`
  - `Detecting ambiguities...`
  - `Done -- review ready`
- Poll `GET /api/assignments/[id]` for status (the assignment's `status` and `ingestion_jobs` progress).
- On completion, redirect to `/tutor/assignments/[id]/review`.

The ingestion pipeline (S0-S8) already handles the backend. This page is purely the missing UI wrapper.

---

## 7. Student Brief Viewer -- upgrade

Currently: raw text chunks in a `<div>`.

Target: Use `react-pdf` (`pdfjs-dist`) to render the original PDF verbatim when the source file is a PDF. Fall back to the existing text rendering for other types.

The PDF is the source of truth (C2). The Assignment Map below it is supplementary, clearly labeled "AI-generated navigation -- not authoritative."

---

## 8. Proactive Assistant

When a student opens the Checklist tab and the current milestone changes, show a dismissible card:

```
You're starting [Milestone Name].
Before you begin, here are 3 things the assignment specifically requires:
  • [Requirement 1 from official brief]
  • [Requirement 2 from official brief]
  • [Requirement 3 from official brief]
```

Implementation:
- In `src/app/student/assignments/[assignmentId]/layout.tsx`, the `ProactiveAssistant` is currently `null` (hardcoded). Mount the actual component.
- The component detects milestone change via the checklist's current milestone state.
- Calls the assistant with a constrained prompt: "Given milestone [X] of assignment [Y], list 3 specific things the assignment brief requires the student to consider before starting. Do not provide implementation guidance."
- The guardrail applies normally.

---

## 9. Design System

Remove all restrictions from `design-law.test.ts`. Delete the file entirely.

Replace with this aesthetic:

```css
/* Typography */
font-family: 'Inter', 'Plus Jakarta Sans', system-ui, sans-serif;

/* Color palette (CSS custom properties in globals.css) */
--color-bg:        #0f1117;    /* near-black */
--color-surface:   #1a1d27;    /* card background */
--color-border:    #2d3142;    /* subtle border */
--color-primary:   #6c63ff;    /* indigo accent */
--color-success:   #22c55e;    /* green */
--color-warning:   #f59e0b;    /* amber */
--color-danger:    #ef4444;    /* red */
--color-text:      #e2e8f0;    /* near-white */
--color-text-muted:#8892a4;    /* secondary text */
```

Card pattern (use everywhere):
```tsx
<div className="rounded-xl border border-border bg-surface p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
```

Tab pattern:
```tsx
<div className="flex border-b border-border">
  <button className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary">Active</button>
  <button className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text">Inactive</button>
</div>
```

Rules:
- Smooth transitions are allowed: `transition-all duration-200`.
- Soft shadows are allowed: `shadow-sm`, `shadow-md`.
- Gradients are allowed on accent elements (e.g., headers, hero sections).
- No linting rule may fail a build for aesthetic reasons.

---

## 10. AI Constraints (corrected)

The following DeepSeek-invented constraints are **removed**:

| Removed constraint | Replacement |
|---|---|
| k-anonymity floor of 5 (blank analytics if N < 5) | Show data when N >= 1. Aggregate only -- no student names. |
| 12-call LLM hard cap per session (HTTP 429) | Remove the budget counter from the assistant session scope. Retain budget counting for ingestion only to control cost. |
| Audio/video file rejection at the student upload picker | Accept all modalities (text, image, audio, video, PDF). The guardrail applies to all. |
| AI question clustering via `GROUP BY` milestone dropdown only | Cluster by topic label returned from the ingestion analysis; fall back to milestone grouping if no topic labels exist. |
| `design-law.test.ts` build-failing aesthetic rules | Delete the file. |
| HMAC pseudonym engine for anonymous identities | Keep the `identityFor` module in `anon-identity.ts`. It works, generates an ID, and is verified. Do not remove it, but there is no need to write a new complex identity system. |

---

## 11. Data Model (key tables -- for reference)

Schema lives in `src/lib/db/schema.ts` + migration files. Do not change the schema unless a v2 feature requires it. These are the tables you will query most:

| Table | Purpose |
|---|---|
| `users` | All users (role: `tutor` or `student`) |
| `courses`, `enrollments` | Course membership |
| `assignments` | One per assignment; has `status`, `published_at` |
| `assignment_structures` | AI-generated structure; tutor approval tracked here |
| `milestones`, `checklist_items` | Approved milestone + task tree |
| `student_checklist_progress` | Per-student progress + elapsed time |
| `queries` | Private tutor queries; has `status`, `message_count`, and `resolved_at` |
| `discussion_threads`, `discussion_posts` | Anonymous-capable discussion |
| `anon_identities` | Maps (user_id, assignment_id) to display alias |
| `faqs` | Published FAQ entries |
| `llm_call_logs` | Audit log for every LLM call |
| `source_chunks` | Extracted text chunks from ingested files |

---

## 12. LLM Provider Setup (DeepSeek v4.1 Flash)

The DeepSeek adapter is already at `src/lib/llm/deepseek.ts`.

Set in `.env`:
```
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
LLM_MODEL_ID=deepseek-chat          # DeepSeek v4.1 Flash model ID
```

The adapter uses the DeepSeek chat API with OpenAI-compatible JSON. No code changes are needed in `deepseek.ts` unless the model ID differs.

Verify the config is loaded: `pnpm exec tsx scripts/verify-provider.ts` (or check startup logs for `provider=deepseek model=deepseek-chat`).

---

## 13. Build & Verification

```powershell
# From /app
pnpm typecheck      # must exit 0
pnpm lint           # must exit 0
pnpm test           # must pass with no network, no DB (765 tests currently)
pnpm build          # must exit 0

# With a live DB and server running:
pnpm db:migrate
pnpm db:seed
pnpm exec next start -p 3100    # use production build; dev hydration is broken (I-68)
```

Visual verification: after every new page, open it in the browser and confirm:
1. It renders (not blank, not an error).
2. All tabs, forms, and interactive controls are functional.
3. No hydration issues (React event handlers attached).

A page that renders correctly in the server response but is inert (no React handlers) is the known I-68 pattern -- always test with `pnpm build` + `next start`, not `pnpm dev`.

---

## 14. Windows PowerShell Hazards

These have caused failures before. Memorize them:

- Use `;` not `&&` to chain commands.
- Paths with `[` or `]` (e.g., `[assignmentId]`) require `-LiteralPath` in `Remove-Item` / `Get-Item`.
- Multi-line `git commit -m` mangles the message. Write to a file and use `git commit -F <file>`.
- Use `[System.IO.File]::WriteAllText($p, $t, [System.Text.UTF8Encoding]::new($false))` instead of `Set-Content` (BOM issue).
- `--` or `//` inside a SQL template literal is a TypeScript/SQL syntax error. Use `/* comment */` only.

---

## 15. Session Protocol

At the start of every session:
1. Read `AGENTS.md` and this file.
2. Read `docs/handoff/01-STATE.md` (current build state).
3. Verify the environment: `pnpm typecheck`, `pnpm test`, `git rev-parse --short HEAD`.

At the end of every session:
1. Rewrite `docs/handoff/01-STATE.md` with what now exists and the commands that prove it.
2. Commit all changes with a meaningful message.
3. Push to `rmit-hackathon` remote, `new-version` branch.
