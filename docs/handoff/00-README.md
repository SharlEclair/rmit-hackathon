# 00 -- Handoff README (read this first, every session)

**Purpose.** This directory is the project's durable memory. Each phase of
[`../18-IMPLEMENTATION-PLAN.md`](../18-IMPLEMENTATION-PLAN.md) runs in a **separate chat session**,
so state lives on disk rather than in a conversation. This file is the entry point: it states the
read order, the exit protocol, the evidence rule, and the handoff template.

**Authority.** `AGENTS.md` > [`../01-DECISIONS.md`](../01-DECISIONS.md) >
[`../02-SCOPE.md`](../02-SCOPE.md) > lower-numbered doc > **this directory**. Nothing here may
weaken a constraint in `AGENTS.md`. Where a handoff file contradicts the register, the register
wins and the handoff file is the bug.

**Phase sequence:** [`../18-IMPLEMENTATION-PLAN.md`](../18-IMPLEMENTATION-PLAN.md) section 5.

---

## 1. Read order on entry

A session does not begin with code. It begins with these steps, in order.

| # | Step | Why |
|---|---|---|
| 1 | `AGENTS.md`, `../00-INDEX.md`, then this file | Constraints and entry point |
| 2 | `01-STATE.md`, `03-INVARIANTS.md`, `04-INTERFACES.md` | Where we are; what must not break; what must not be re-shaped |
| 3 | `05-ISSUES.md` and the **last two** entries of `06-SESSION-LOG.md` | Open problems and immediate history |
| 4 | The phase's own spec docs (named per phase in `../18-IMPLEMENTATION-PLAN.md` section 5) | The actual requirements, never the plan's summary of them |
| 5 | **Re-verify before trusting.** Run the verification block in `01-STATE.md` and compare it to the environment fingerprint. Report any divergence to the user **before** any other work | A previous session's claim may be stale, wrong, or from another machine |
| 6 | Append this session's entry to `06-SESSION-LOG.md` **before** the first commit | A session that dies mid-task still left its intent on disk |

Step 5 is not ceremony. It is the only mechanism that catches a stale handoff, and it costs one
command. [`../18-IMPLEMENTATION-PLAN.md`](../18-IMPLEMENTATION-PLAN.md) section 1.1 records the
planning session that trusted a handoff and was wrong.

## 2. Exit protocol -- "handed off" means all seven

1. `01-STATE.md` **rewritten**: built / partial / mocked / not started, with the verifying command
   for each claim, and an explicit statement of what a later phase must **not** assume finished.
2. `03-INVARIANTS.md` updated for any new agreement, plus any trap this session discovered --
   **including traps caused by its own shortcuts.**
3. `04-INTERFACES.md` updated for any signature another phase will consume, with the frozen-at commit.
4. `05-ISSUES.md` updated: new problems, accepted risks, deferrals with reason and owner phase.
5. `06-SESSION-LOG.md` appended with the narrative: what was attempted, what failed and why, what
   was learned, and what was **not** verified.
6. `07-ARCHIVE/phase-NN/` receives a copy of the session log as it stood at phase end.
7. `git tag phase-NN-complete`, and `01-STATE.md` names that tag.

A session that cannot satisfy one of the seven says so in the log rather than leaving it implied.

## 3. The evidence rule

> `01-STATE.md` records commands and observed output. It never records adjectives.

| Do not write | Write instead |
|---|---|
| "Migrations apply cleanly" | `pnpm db:migrate` run twice; second reported no pending migrations |
| "Auth works" | The tampered-cookie test, by name, and its observed pass |
| "The guardrail is complete" | `pnpm test -- tests/guardrail` -> 53 passed |
| "Mostly done" | The specific items **not** done, named |

Expressing satisfaction before running the check is also a failure. A status line without a command
behind it is a defect in the handoff, not a shortcut.

## 4. Handoff template

Copy this shape into `06-SESSION-LOG.md` and fill it in. The last two sections are the ones that
carry value forward -- "what I could not verify" is what stops a later session assuming a guarantee
it does not have.

```markdown
## Session <NN> - <phase name> - <date>

**Phase:** <NN>   **Status:** complete | partial | blocked
**Spec docs read:** <list>   **Commit range:** <from>..<to>   **Tag:** <tag>

### Delivered (with evidence)
| Item | Evidence (command + observed result) |
|---|---|

### Not delivered, and why
- <item> -- <reason> -- <consequence for a later phase>

### Decisions taken
- <decision> -- <rationale> -- <files affected> -- logged as <id>

### Invariants touched
- <invariant> -- honoured | changed | newly accepted risk

### Discovered traps for later phases
- <trap> -- which phase it bites -- what to do instead

### What I could not verify
- <claim> -- <why unverifiable> -- <what would settle it>
```

## 5. Files in this directory

| File | Question it answers | Written how |
|---|---|---|
| `00-README.md` | Where do I start, and what is the protocol? | Rarely |
| `01-STATE.md` | What is actually built, and how do I prove it? | **Rewritten every session** |
| `02-DECISIONS.md` | Why is this the way it is? | Append-only |
| `03-INVARIANTS.md` | What must I not break, and what must I not re-derive? | Append-only |
| `04-INTERFACES.md` | What signatures may I not change? | Append-only |
| `05-ISSUES.md` | What is known-broken right now? | Append-only |
| `06-SESSION-LOG.md` | What happened last time, and what failed? | Append-only |
| `07-ARCHIVE/` | What did the log look like at each phase end? | Append-only |
