# 03 -- Invariants and Cross-Phase Traps

**Purpose.** Two jobs. (1) The agreements no session may break. (2) The traps where a later session,
working honestly from first principles, would produce a **working-looking but wrong** result.

**Status.** Seeded in Phase 0 from [`../18-IMPLEMENTATION-PLAN.md`](../18-IMPLEMENTATION-PLAN.md)
section 7. Append-only. Never renumber; never reuse a retired `T` or `I` number.

**Authority.** Below `AGENTS.md`, [`../01-DECISIONS.md`](../01-DECISIONS.md) and
[`../02-SCOPE.md`](../02-SCOPE.md). If this file contradicts the register, this file is the bug.

---

## 1. The four things that must never be broken

| # | Invariant | Where it is enforced | If it breaks |
|---|---|---|---|
| **I1** | The Assistant never does the assignment. A prohibited request is refused with **zero model calls**, citing the assignment's own policy. | `AGENTS.md` C1, [`../05-AI-GUARDRAILS.md`](../05-AI-GUARDRAILS.md), `src/lib/guardrail/` (Phase 3) + the golden set | The product's only defensible claim is gone. A demo that answers once is unrecoverable |
| **I2** | Nothing AI-generated is student-visible until a tutor **approves** it. AI output is labelled until then. | `AGENTS.md` C3, D21/D22, the approval state machine (Phase 4) | A hallucination silently becomes course policy |
| **I3** | The official brief is shown **verbatim** and is never paraphrased into the UI as the requirement. | `AGENTS.md` C2, D17, the document viewer + ingestion provenance (Phases 1, 5) | A model summary is presented as the assessment requirement |
| **I4** | A guardrail refusal is a **`200`** carrying a refusal-shaped payload, rendered with the boundary treatment -- never the error treatment, and never a partial answer. | D8, [`../06-DATA-MODEL.md`](../06-DATA-MODEL.md) section 5, Phases 3, 5, 7 | Refusal reads as a system fault, so the safest path looks broken |

## 2. Standing agreements

1. **No vendor SDK outside `src/lib/llm/`** (`AGENTS.md` C8). Every model call goes through the adapter.
2. **Refuse-by-default.** An unparseable or missing policy decision must never read as `ALLOW`.
3. **Structured output only.** A response that fails schema validation is a refusal, not a retry loop (D16).
4. **Secrets never appear** in code, logs, fixtures, commit messages, or API responses (`AGENTS.md` C7).
5. **Analytics are aggregate-only** (D31), the k-anonymity floor of 5 is applied **in the SQL** (D32, D52),
   and analytics modules may not import identity-aware repositories (T15).
6. **Anonymity.** No `user_id` reaches any tutor-facing post surface (C4, D26). The author label is
   computed at read time from a persisted `display_number` through the single approved view (D55, T14).
7. **Route paths.** [`../06-DATA-MODEL.md`](../06-DATA-MODEL.md) section 5.4 is the only valid path
   vocabulary: **64 routes** (D51, D58, T12).
8. **Provenance on every AI-produced artifact**: model, prompt version, source chunks.
9. **The doc changes in the same commit as the behaviour it describes** (`AGENTS.md` section 4.3,
   [`../00-INDEX.md`](../00-INDEX.md) section 5 rule 3).
10. **The provider call shape is settled**: Interactions API, `store: false` (D73). Do not re-derive it.

## 3. Cross-phase trap register

Each row states **what to record**, not merely what to avoid. When a session discovers a new trap,
append it with the next `T` number and name the phase it bites.

| # | Trap | Bites | What to record instead |
|---|---|---|---|
| **T1** | Milestone average elapsed time is a **two-stage mean** -- the mean of per-student means -- not a mean over intervals | Phase 6 | The formula, its rationale (`08` section 4.3), and fixture A15 that proves it |
| **T2** | The k-anonymity floor is applied **in the query**, and suppression is contagious upward. Complementary suppression additionally removes the smallest qualified bucket when exactly one is suppressed | Phase 6 | `HAVING count(distinct subject_ref) >= 5`, plus the three propagation rules |
| **T3** | **Gate rule G1 lives in the query layer, not the view.** A student request for unapproved or unpublished content returns **404** -- never an empty shell, never a silently filtered list | Phases 5, 6 | The three-part predicate and where it is enforced |
| **T4** | The Assistant endpoint is **SSE**, and `guardrail` is **always the first event**. A refusal emits **zero `token` events**; a client that receives `token` first must treat the stream as corrupt | Phase 5 | The event-order table and the corrupt-stream rule |
| **T5** | `04` section 5.7 says streaming is excluded from the MVP; `06` sections 5.4/5.5.9 define `text/event-stream` for exactly one route. **`06` wins** (D51) | Phase 5 | The conflict, the ruling, and the reason |
| **T6** | The `AiCapability` enum had no member for attachment extraction, so that call had no thinking level and no budget accounting; and `04`'s guardrail-preflight rule contradicted its own extraction order | Phases 2, 3 | **D68**: the sixth member `attachment_extraction`, `LLM_THINKING_EXTRACTION`, and the restated invariant |
| **T7** | **Analytics cannot be backfilled.** `analytics_events` is written at the point of the event, by the feature that owns it -- not by the analytics module | Phases 5, 6 | The event-emission duty list: checklist transitions, assistant turns, query creation, post creation, FAQ views |
| **T8** | The **seed fixture is the load-bearing artefact of Phase 1**: 37 synthetic students, at least 4 approved milestones, one milestone above **both** averages, one bucket below 5 contributors, and the demo brief as a **text-layer** PDF | Phases 3, 4, 6, 7 | The exact counts and why each is there |
| **T9** | The guardrail golden set needs fixtures that do not exist until Phases 1-2 | Phase 3 | The fixture list (approved policy, 5 approved milestones, chunked brief and rubric containing the word-count requirement and **no mention of concurrency**, six attachment files including audio and video) |
| **T10** | `06` section 10 item 8 contradicted D48 on re-open semantics. D48, `06` section 7.3.2, section 8.3 rule 8 and test T-24 agree; item 8 was stale | Phases 1, 6 | The correct rule (first interval stands) and the fact that item 8 was corrected in Phase 0 |
| **T11** | `--border-peer` is `#667085` (D65). `17` sections 3.2/3.6/11.5 and gate G7 described `#98A2B3` as current and failing, and token-parity gate G4 passed either way, so nothing caught it | Any UI phase | The correct value, and a warning not to "fix" it back |
| **T12** | `06` section 5.4's **64 routes** are the only valid path vocabulary; eleven other doc locations sketch different paths | All phases | The rule, plus the mapping in `06` section 10 item 17 (adopted by D70) |
| **T13** | A guardrail refusal is a **`200`**, not an error. It renders with the boundary treatment, never the error treatment | Phases 3, 5, 7 | The status-code rule and the UI consequence (see I4) |
| **T14** | `ANON_ID_SECRET` rotation does **not** re-label existing posts. The label is computed at read time from a persisted `display_number` via the single approved view | Phase 6 | D55, plus the view's role as the only author-label surface |
| **T15** | Analytics modules must **not** import identity-aware repositories (import-graph test), and no analytics SQL may contain an identity column outside `count(distinct subject_ref)` | Phase 6 | The two structural prohibitions |
| **T16** | **Extraction timing.** `04` section 9.2 step 12 said extraction ran inline inside the assistant request; `06` models it as a persisted per-upload state (`extractionStatus`, `guardrailScanStatus`) that must be terminal *before* the upload can be attached, and stream rule 5 rejects an upload whose scan is not `clear` | Phases 2, 5 | **D68**: extraction is capability `attachment_extraction`, runs at **upload**, and the assistant turn only ever consumes a terminal, scan-cleared upload. Do not re-derive the inline reading from the old step-12 wording |
| **T17** | **`.gitignore` silently excluded this directory.** The rule `*-session-*.md` (line 27) predates the handoff design and matched `06-SESSION-LOG.md` case-insensitively on Windows, so a committed scaffold would have lost the session log on every clone -- and `07-ARCHIVE/phase-00/` with it | Any session that trusts the scaffold, and the hackathon's history-as-evidence rule | **Fixed in Phase 0:** `.gitignore` ends with an explicit `!docs/handoff/*.md` / `!docs/handoff/07-ARCHIVE/**` exception. Do not rename the file to dodge the pattern -- the name is fixed by `18` section 3.1 and `00-INDEX` |
