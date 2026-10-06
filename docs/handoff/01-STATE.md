# 01 -- Live State

> **Read this first, and do not infer the build's state from anywhere else.** This file is rewritten at
> every session exit and is the authoritative answer to "what exists".

**Session:** v2-start (new branch `new-version` on `https://github.com/SharlEclair/rmit-hackathon`).
**LLM Provider:** DeepSeek v4.1 Flash (`LLM_PROVIDER=deepseek`).
**Remote:** `origin` = `rmit-hackathon-demo` (old repo, frozen). `rmit-hackathon` remote = new repo.
**Branch:** `new-version` on `https://github.com/SharlEclair/rmit-hackathon`.

---

## 1. One-paragraph version

The v1 codebase is feature-complete but had major gaps: the Tutor Assignment Hub
(`/tutor/assignments/[assignmentId]/page.tsx`) was never built, the ingestion UI was CLI-only,
the design system was artificially locked to an austere style, and DeepSeek invented several
constraints (k-anonymity floor of 5, 12-call LLM cap, audio/video rejection) that are now
removed. v2 begins from the same `app/` code, switches the LLM provider to DeepSeek v4.1 Flash,
and targets the missing surfaces listed in section 3.

---

## 2. What exists (verified at current session)

| Area | State | Evidence |
|---|---|---|
| Auth (login, session, role) | Built, working | `pnpm test -- tests/auth` pass |
| DB schema (13 migrations) | Applied | `pnpm db:migrate` -- 0 pending |
| LLM adapter (Gemini + DeepSeek + mock) | Built | `src/lib/llm/` |
| Guardrail policy layer | Built | `pnpm test -- tests/guardrail` pass |
| Ingestion pipeline (S0-S8) | Built & UI-integrated | `POST /api/assignments` + background `after()` execution |
| **Tutor Upload UI** | Built, working | `/tutor/assignments/new` with drag-and-drop & live stepper polling |
| **Tutor Assignment Hub** | Built, working | `/tutor/assignments/[id]` with Queries, Discussions/Moderation, and Cohort Analysis tabs |
| **PDF brief viewer** | Upgraded, working | `/student/assignments/[id]` renders authoritative PDF viewer via `/raw` stream with text fallback |
| **Proactive assistant** | Mounted, working | `ProactiveAssistant` mounted in student layout observing milestone transitions |
| **Modern design system** | Implemented | Dark sleek palette, Inter typography, 200ms transitions, `design-law.test.ts` removed |
| Student workspace (4 tabs) | Built | Verified in Next.js production build |
| Tutor review screen | Built (artifact table) | Verified in Next.js production build |
| Navigation sidebar | Built | Verified in Next.js production build |
| `pnpm build` | Exit 0 | Verified (Next.js Turbopack build succeeds) |
| `pnpm lint` | 0 errors, 0 warnings | Verified (`eslint` + `check-c8.mjs` pass) |
| `pnpm test` | 748 passed (48 files) | Verified with Vitest |

---

## 3. Completed v2 build targets

| Feature | Route / Components | Status |
|---|---|---|
| **Tutor Upload UI** | `src/app/tutor/assignments/new/page.tsx`, `new-assignment-form.tsx` | Complete |
| **Assignment Ingestion API** | `src/app/api/assignments/route.ts`, `[assignmentId]/route.ts` | Complete |
| **Tutor Assignment Hub** | `src/app/tutor/assignments/[assignmentId]/page.tsx`, `tutor-assignment-hub.tsx` | Complete |
| **PDF Brief Viewer** | `src/components/pdf-viewer.tsx`, `document-viewer.tsx`, `api/student/.../raw/route.ts` | Complete |
| **Proactive Assistant** | `src/components/proactive-assistant.tsx`, `student/.../layout.tsx` | Complete |
| **Modern Design System** | `globals.css`, `tailwind.config.ts`, `design-law.test.ts` deleted | Complete |

---

## 4. Removed constraints (no longer enforced)

| Constraint | Status |
|---|---|
| k-anonymity floor of 5 (blank analytics) | Removed. Show data for N >= 1. |
| 12-call LLM hard cap per assistant session | Removed. Budget retained for ingestion only. |
| Audio/video rejection at student upload picker | Removed. All modalities accepted. |
| `design-law.test.ts` aesthetic build failures | File to be deleted. |
| HMAC pseudonym engine enforced by CHECK constraints | Keep it. The logic works and is verified. Do not remove or attempt to rewrite it. |

---

## 5. Open defects carried from v1

| ID | Description | Priority |
|---|---|---|
| **I-68** | Dev server (`pnpm dev`) does not hydrate in this environment. Use `pnpm build` + `pnpm exec next start -p 3100` for all UI verification. | High -- affects all development |
| **I-69** | Run sheet must say `next start`, not `pnpm dev`. | Follows I-68 |

---

## 6. Environment fingerprint

```
OS:       Windows 11, PowerShell 5.1
Node:     v24.15.0
pnpm:     12.4.2
Postgres: postgresql-x64-18 on 5432, database: assignment_assistant, 13 migrations
Provider: deepseek (LLM_PROVIDER=deepseek), model: deepseek-chat
Dev URL:  http://localhost:3000  (DO NOT USE -- I-68)
Prod URL: http://localhost:3100  (pnpm build + next start)
```

---

## 7. Accounts and fixtures

| What | Value |
|---|---|
| Student account | `student@demo.rmit` / `demo1234` |
| Tutor account | `tutor@demo.rmit` / `demo1234` |
| Demo assignment | `9bcc22f0-61ba-49e0-870b-f85b57a86bfd` -- "Case Analysis and Design Proposal Report" |
| Course | `0a8e65f8-c50b-4632-afbf-185e6e482155` (COSC2407) |

Demo reset: `demo/reset.ps1` (migrations -> schema -> seed -> demo-state -> discussions).

---

## 8. What to do next (priority order)

1. **Switch provider to DeepSeek.** Set `LLM_PROVIDER=deepseek` and `DEEPSEEK_API_KEY` in `.env`. Verify: `pnpm exec tsx scripts/verify-provider.ts` or check startup logs.
2. **Build the Tutor Assignment Hub** (`/tutor/assignments/[assignmentId]/page.tsx`) -- see `docs/SPEC.md` section 5.
3. **Build the Tutor Upload UI** (`/tutor/assignments/new/page.tsx`) -- see `docs/SPEC.md` section 6.
4. **Upgrade the brief viewer** to `react-pdf` -- see `docs/SPEC.md` section 7.
5. **Mount the Proactive Assistant** -- see `docs/SPEC.md` section 8.
6. **Apply new design system** -- see `docs/SPEC.md` section 9. Delete `design-law.test.ts`.

---

## 9. Standing rules

- **Report evidence, not adjectives.** Quote the command and its output.
- **Verify UI against `pnpm build` + `next start`**, not `pnpm dev` (I-68).
- **Do not push unless asked.** Confirm with `git rev-list --count origin/main..HEAD` first.
- **Use `;` not `&&` in PowerShell.**
