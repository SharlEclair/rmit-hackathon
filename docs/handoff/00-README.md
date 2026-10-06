# 00 -- Handoff README (read this first, every session)

**Purpose.** This directory is the project's durable memory. Each development session runs in a
separate context, so state lives on disk rather than in a conversation. This file is the entry
point: it states the read order, the exit protocol, and the evidence rule.

**Authority.** `AGENTS.md` > `docs/SPEC.md` > `01-STATE.md` > everything else in this directory.
Nothing here may weaken a constraint in `AGENTS.md`. Where a handoff file contradicts `SPEC.md`,
`SPEC.md` wins and the handoff file is the bug.

---

## 1. Read order on entry

A session does not begin with code. It begins with these steps, in order.

| # | Step | Why |
|---|---|---|
| 1 | `AGENTS.md`, then this file | Constraints and entry point |
| 2 | `docs/SPEC.md` | The complete implementation specification |
| 3 | `01-STATE.md` | What is actually built right now |
| 4 | `05-ISSUES.md` (open issues only) | Known defects to avoid re-hitting |
| 5 | **Re-verify before trusting.** Run `pnpm typecheck` and `pnpm test`. Compare against `01-STATE.md` environment fingerprint. | A previous session's claim may be stale |

Step 5 is not ceremony. It catches a stale handoff before you waste time acting on wrong assumptions.

---

## 2. Exit protocol -- a session is "done" when all five are true

1. `01-STATE.md` **rewritten**: lists exactly what now exists and the commands that prove each claim.
2. Any new open issue appended to `05-ISSUES.md` with an ID, description, and priority.
3. Any decision that is not obvious from the code appended to `02-DECISIONS.md`.
4. All changes committed with a meaningful message.
5. Pushed to `rmit-hackathon` remote, `new-version` branch.

A session that cannot satisfy one of these says so in `01-STATE.md` rather than leaving it implied.

---

## 3. The evidence rule

> `01-STATE.md` records commands and observed output. It never records adjectives.

| Do not write | Write instead |
|---|---|
| "Migrations apply cleanly" | `pnpm db:migrate` run twice; second reported 0 pending |
| "The page works" | Screenshot taken with the browser tool; all tabs clickable |
| "Auth works" | Login POST returns 200 with a session cookie |
| "Mostly done" | The specific items NOT done, named |

---

## 4. Files in this directory

| File | Question it answers | Updated how |
|---|---|---|
| `00-README.md` | Where do I start, and what is the protocol? | Rarely |
| `01-STATE.md` | What is actually built, and how do I prove it? | **Rewritten every session** |
| `02-DECISIONS.md` | Why is this the way it is? | Append-only |
| `03-INVARIANTS.md` | What must I not break? | Append-only |
| `04-INTERFACES.md` | What API signatures may I not change? | Append-only |
| `05-ISSUES.md` | What is known-broken right now? | Append-only |
| `06-SESSION-LOG.md` | What happened last time? | Append-only |
| `07-ARCHIVE/` | Session logs at phase end | Append-only |
