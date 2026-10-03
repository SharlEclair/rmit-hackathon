# 06 -- Session Log

**Purpose.** Append-only narrative, one entry per implementation session. Written in the shape of
the handoff template in [`00-README.md`](00-README.md). A session appends its entry **before** the
first commit, so a session that dies mid-task still left its intent on disk.

---

## Session 00 - Phase 0: reconciliation, de-risking and handoff scaffold - 2026-10-04

**Phase:** 0   **Status:** complete
**Spec docs read:** `AGENTS.md`, `00-INDEX`, `01-DECISIONS`, `18-IMPLEMENTATION-PLAN` (all), plus
`02`, `03`, `04`, `05`, `06`, `07`, `11`, `12`, `14` by targeted region
**Commit range:** `da00f71`..`phase-00-complete`   **Tag:** `phase-00-complete`

### Delivered (with evidence)

| Item | Evidence (command + observed result) |
|---|---|
| The eight-path handoff scaffold | `Get-ChildItem docs/handoff` -> 8 entries |
| Rulings A-I in the register | `01-DECISIONS.md` section I: **D68**-D73 + the A-I letter map |
| Provider call shape settled | **D73**; three live HTTP probes (200, 200, 400) recorded in `02-DECISIONS.md` H1 |
| Env reconciled to D61/D62 | `.env` LLM_* lines read back: `gemini`, `gemini-3.8-flash`, 5 thinking levels |
| Stale specs corrected | `git show --stat phase-00-complete` (12 docs + `AGENTS.md` + `.env.example`) |
| Trap register seeded | `03-INVARIANTS.md` section 3, T1-T16 |
| `.gitignore` conflict resolved | Line 27's `*-session-*.md` was silently ignoring `06-SESSION-LOG.md`; `git check-ignore -v` confirmed it, and an explicit `!docs/handoff/*.md` exception was added. Both the log and `07-ARCHIVE/phase-00/` now stage (trap **T17**) |
| Three Phase 0 gaps closed | `IngestionStatusResponse` defined; `MILESTONE_WITHOUT_REQUIREMENT` added; `07` policy card section created (D71) |

### Not delivered, and why

- **`app/` and everything in it** -- Phase 0 is a reconciliation phase by design (D-scope: nothing
  is created under `app/` until Phase 1). Consequence: every product phase remains unstarted.
- **`docs/fixtures/`** -- owned by WP-02. Consequence: WP-04's verification gate cannot run today.
- **A decision on serving source-document bytes to the viewer** -- found while reconciling routes
  (`07` line 1407 named a "document stream" that no route provides). Recorded as I-06 rather than
  invented, because adding a route is a `06` section 5.4 change that should be made against a real
  viewer requirement.
- **Definitions for the ~10 other undefined `*Response` types** -- recorded as I-03. Defining them
  in Phase 0 would have been net-new API design with no consumer to validate it.
- **A fix for `17`'s `#98A2B3` occurrences** -- recorded as I-05 (trap T11). `07`, the owner of the
  value, is already correct.

### Decisions taken

- `attachment_extraction` is a sixth capability, runs at **upload**, gets `LLM_THINKING_EXTRACTION`
  and its own budget counter -- D68 -- `04`, `06`, `.env.example`, `12` -- logged as **D68**.
- `CLARIFY` is a refusal-shaped outcome that never produces a model answer -- **D69** -- `06`, `07`.
- `06` section 10 item 17 adopted as the authoritative path mapping and completed with the two
  un-mapped sketches -- **D70** -- `04`, `06`, `11`.
- The three documentation gaps closed -- **D71** -- `06`, `07`.
- Operator tooling lives in `app/scripts/`, artefacts in `demo/` -- **D72** -- `04`, `11`, `12`.
- The adapter uses the Interactions API with `store: false` -- **D73** -- `04`, `12`, `.env.example`.

### Invariants touched

- **I1 (the guardrail / zero model calls on a refusal)** -- honoured, and the surrounding wording
  was **strengthened**: the old invariant ("no code path to `src/lib/llm/` that does not pass the
  guardrail") was *false* as written, because extraction preceded the L0-L3 decision. It now reads
  as L0-L3-before-any-generation, with extraction named as the one classification-controlled call
  that is counted separately (D68).
- **I4 (a refusal is a 200)** -- honoured; `CLARIFY` was classified as a refusal for golden-set
  purposes (D69), and `07`'s duplicate rule numbering was fixed so the rule is citable.
- Everything else: honoured, unchanged.

### Discovered traps for later phases

- **T16 (new)** -- extraction timing. `04` section 9.2 step 12 said extraction ran inline "in the
  same request"; `06` models it as a persisted per-upload state that must be terminal *before* the
  assistant request. Consequence for Phase 2/5: build extraction into the upload path, not the
  assistant turn. Not covered by the plan's original T1-T15.
- **I-06** -- the brief viewer has no byte-serving route. Bites Phase 5.
- **I-09** -- the shell is PowerShell 5.1, not 7. Two concrete failure modes cost time this session
  and will cost more without the notes in `05-ISSUES.md`.
- **I-07** -- the repository is not publicly readable. This is a *submission* risk, not a code risk.
- **T17 (new)** -- .gitignore was silently dropping the session log from every clone. Fixed here, but the general lesson is that a file existing locally is not evidence that it is committed: run git check-ignore -v on any new deliverable path.

### What I could not verify

- **Public visibility of the GitHub remote.** An anonymous fetch returns 404, which does not
  distinguish "private" from "not pushed to a public repo". Settled by a human checking the GitHub
  visibility setting (I-07).
- **Whether `gh`/`vercel` are still absent.** `18` section 2 says so; Session 00 did not re-check.
- **Anything about `app/` behaviour.** It does not exist. No typecheck, lint, test, migration or
  boot claim in this log is backed by a run, and none is made.
- **The Gemini key's quota remaining.** One 200 and one 400 prove reachability and shape, not
  headroom for a build session. The `429` path is therefore untested.
- **Cost.** Three live calls were made; token usage came back (`total_thought_tokens: 69` for a
  one-token answer at `low`), but no billing figure was checked.
