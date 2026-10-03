# 02 -- Handoff Decision Log

**Purpose.** The append-only log of decisions taken *during implementation sessions*, so a later
session can see why the code is the way it is without re-deriving it.

**Relationship to the register.** [`../01-DECISIONS.md`](../01-DECISIONS.md) is authoritative for
product and architecture decisions (`D<n>`). This file records **session-level** decisions
(`H<n>`) and normally cites a register row rather than replacing it. Where the two conflict, the
register wins and this file is the bug.

**Rule.** Append only. Never rewrite an entry; supersede it with a new one.

---

## H1 -- Phase 0: the provider call shape is the Interactions API (2026-10-03)

**Decision.** The Gemini adapter calls `POST {LLM_BASE_URL or https://generativelanguage.googleapis.com}/v1beta/interactions`
with header `x-goog-api-key` and body `{ model, input, store: false, generation_config.thinking_level, response_format? }`.
Text is read from the terminal `model_output` step of `steps[]`; `thought` steps are skipped.
`store: false` is mandatory. The legacy `:generateContent` shape is a documented fallback only.

**Register row.** `D73`.

**Evidence (live, not documentary).** Three HTTP calls made with `curl.exe` from the repository
root, key read from `.env` by name and never printed:

| Probe | Observed |
|---|---|
| Text turn, `thinking_level: low`, `store: false` | HTTP 200; `status: "completed"`; `steps` = `[thought, model_output]`; `model_output.content[0].text` = `"ok"`; `total_thought_tokens` = 69 |
| Structured output via `response_format: {type: "text", mime_type: "application/json", schema}` | HTTP 200; `model_output` text was exactly `{"ok": true}` |
| `thinking_level: "minimal"` | HTTP 400, `"Thinking level THINKING_LEVEL_MINIMAL is not supported for this model."` |
| Unknown body field | HTTP 400, `"Unknown parameter 'nonsense_field'."` (envelope `{error:{message,code}}`) |

**Why it needed a live call.** Google's documentation had moved to the Interactions API and
labelled `generateContent` legacy, which left the call shape genuinely unsettled. Reading the docs
alone would not have caught the `usage` field being snake_case (`total_thought_tokens`) rather than
the legacy camelCase `usageMetadata`.

**Consequences for Phase 2.** The adapter must read usage from `usage`, not `usageMetadata`; must
skip `thought` steps when assembling output; must send `store: false`; must treat a 400
`invalid_request` as a configuration error, not a retryable one.

## H2 -- Phase 0: attachment extraction is a fifth thinking level, not a share of the guardrail's (2026-10-03)

**Decision.** `LLM_THINKING_EXTRACTION` defaults to `low`; `attachment_extraction` gets its own
budget counter.

**Register row.** `D68`.

**Rationale.** Sharing `LLM_THINKING_GUARDRAIL` would have coupled two capabilities the register
keeps separate (D12) and hidden the extraction call inside the guardrail's budget. The cost is one
environment variable in five places (`.env.example`, `.env`, `04` section 11, `12` section 2.3,
and the boot-validation step).

## H3 -- Phase 0: the `.env` reconciliation is a write to an untracked local file (2026-10-03)

**Decision.** `.env` was rewritten only in the provider/model block and the thinking-level list.
Secrets were preserved byte-for-byte and checked by name and length afterwards (`AUTH_SECRET` 44,
`ANON_ID_SECRET` 44, `GEMINI_API_KEY` 53, `DEEPSEEK_API_KEY` empty).

**Register row.** None -- operational, not architectural.

**Why it is logged.** `.env` is gitignored, so this change leaves no trace in history. A later
session that clones fresh will not get it, and `01-STATE.md` must therefore say so explicitly
rather than implying that a clean clone boots on Gemini.

## H4 -- Phase 1: the migration-author readings for schema ambiguities A1-A15 (2026-10-04)

**Decision.** Twelve of the fifteen ambiguities that `.local/spec/schema.md` section 8 flagged were
resolved as follows. `A1` is void and `A2` is register row **D80**; neither is repeated here.

| # | Item | Reading taken | Why |
|---|---|---|---|
| `A1` | `queries` privacy class | **VOID -- no decision needed.** `06` section 4.6 already lists `queries` and `query_messages` under **Identity-bearing**, which is what D50 requires. The extract's claim that 4.6 says "Pseudonymous" is wrong, and it also contradicted the extract's own section 2.4 header and its table of contents. | Re-checked against `docs/06` before acting. See the trust note in `../01-DECISIONS.md` section J. |
| `A2` | `assignment_sources.mime_type` supported set | Accept **D57**'s wider set (adds `text/plain`, `text/markdown`). | Register row **D80**; `06` section 7.2.2 corrected in the same commit. |
| `A3` | `approved_at` CHECK shape | Literal replication of the shape `06` states for `approved_by_user_id`: `approved_at is null or publication_status in ('APPROVED','PUBLISHED')`. | `06` says "same CHECK shape as above". Inventing a different one (coupling `approved_at` to `approved_by_user_id`) is a schema change the doc does not authorise. |
| `A4` | `ai_policy_rules.display_order` uniqueness | **No** unique constraint and **no** `>= 0` check. The omission is preserved and commented. | Every sibling artifact table carries both, so the omission is either deliberate or a gap in `06`. Section 7 is normative on names and `06` section 9.3 gate 1 says a column or constraint change means `06` changes too. A migration may not silently add one. Recorded in `05-ISSUES.md` as a low-severity open item for whichever phase touches the policy editor. |
| `A5` | `ambiguity_findings` scope | Plain `structure_id` FK per `06` section 7.2.12; no composite FK, no `grounding_chunk_ids`, no approval stamps. | Section 7.2.12 is the definition; section 8.2's list is a summary of structure-scoped children and is the less specific source. `06` section 7.2.12 is also explicit that there is **no** `proposed_clarification` column and must never be one (D23, C2). |
| `A6` | `assistant_messages.reason_code`, `student_uploads.guardrail_reason_code` "required when" | Encoded as **CHECK constraints**. | The condition is a comparison between columns of the same row, so the database can enforce it. `06` section 6.3's posture is CHECK-based, and a handler-only rule is a rule the next handler forgets. |
| `A7` | `faq_entries` `source_kind = 'peer_answer'` | CHECK: `source_kind <> 'peer_answer' or source_discussion_post_id is not null`. | Same reasoning as `A6`. It also protects O8: the link to the originating post is what makes "an approved student answer is not auto-published" auditable. |
| `A8` | `expectedRevision` storage | **Not invented.** No revision column was added to any artifact table. | Handoff **I-16** is explicitly open with owner Phase 2/4 and says "Either a revision column is added (a `06` change) or the contract is amended. Do not implement a PATCH route that silently ignores `expectedRevision`." Adding seven columns is a `06` change, and a migration is immutable once applied, so deferring costs one later migration. A comment marks the spot. |
| `A9` | `discussion_threads.first_post_id` delete rule | `ON DELETE SET NULL`. | The column is nullable (it must be, to break the cycle), so a thread without a first post is representable. `RESTRICT` would block a legitimate hard delete of a `removed` post, and soft delete (`06` section 6.5) is the product path, so there is no cascade to preserve. The FK stays `DEFERRABLE INITIALLY DEFERRED` per section 8.2's insert-order note. |
| `A10` | Whether soft-deleted rows still count | Denormalised counters (`post_count`, `total_item_count`) exclude rows with `deleted_at is not null`. Posts whose `status` is `removed` or `hidden_pending_review` are **not** deleted and stay counted. | `milestones` and `checklist_items` use partial uniques on `deleted_at is null`, so soft delete means "not part of the live structure". A `removed` post is a moderation outcome, not a deletion, and the moderator's queue still has to account for it. |
| `A11` | `set_updated_at()` body and coverage | Body is `new.updated_at := now(); return new;`, attached to **every** table including the append-only ones (`analytics_events`, `guardrail_logs`, `audit_logs`). | `06` section 6.2 rule 2 names the function but never gives its body, and says the trigger is "belt-and-braces for manual SQL". The append-only tables carry `updated_at` "for uniformity and are never updated by application code" (6.2 rule 4), so the trigger is a no-op there and including it keeps the rule uniform. Labeled DERIVED in the migration, per the extract's own instruction. |
| `A12` | `audit_logs.before`/`after` redaction | **Application code.** No CHECK on their contents. | A CHECK cannot inspect nested JSON semantics, so the permitted/prohibited lists in `06` section 7.6.5 are a writer obligation. The migration carries a comment saying so. |
| `A13` | Migration file split and numbering | Ten files, `0001` baseline then `0002`-`0010` by domain group, with views and triggers last. | Recorded with the register as **D74** for the mechanism; the split itself is in the migration headers. Both circular FKs are resolved by `ALTER TABLE ... ADD CONSTRAINT` after both sides exist (`06` section 8.2). |
| `A14` | `source_chunks.embedding` optional migration | **Confirmed separate and non-default.** The path `app/src/lib/db/migrations/optional/` is reserved and the runner does not scan it. No embedding migration is shipped and nothing in the default chain references `vector`. | D38 rejects embeddings and retrieval is `tsvector`, so shipping an unused migration would be scaffolding a rejected feature. Reserving the path satisfies `06` section 6.8 rule 4 without doing that. |
| `A15` | `assistant_messages.token_usage` shape | CHECK `jsonb_typeof(token_usage) = 'object'` added. | `analytics_events.metadata` carries a `jsonb_typeof = 'object'` check, so this is the doc's own convention applied symmetrically; the JSONB shape is otherwise unchecked while the column is read by the budget accounting. |

**Register rows cited.** `D50`, `D57`, `D80`, `D74`, `D23`, `D38`, `I-16`.

**How these were verified.** The migration was applied to Postgres 18.6 from a clean schema
(`drop schema public cascade; create schema public`) and then re-run to prove idempotency; the
table, view, index, trigger and constraint counts were read back from `information_schema` and
`pg_catalog` rather than asserted. The exact counts are in `../01-STATE.md`.

## H5 -- Phase 3: the guardrail readings that are not register rows (2026-10-04)

**Decision.** Six readings taken while implementing `05-AI-GUARDRAILS.md`. The ones that change a
contract are register rows **D83**-**D88**; these are the implementation readings that change no
contract, recorded here so a later session does not re-derive them.

| # | Item | Reading taken | Why |
|---|---|---|---|
| `B1` | `05` section 12.1's module layout lists nine files; the implementation has eleven | Two additions, both named as WP-08 deliverables: `log.ts` (the `05` section 8 audit row) and `refusal-copy.ts` (WP-08's "refusal wording, per rule class"). `05` section 12.1 is a layout, not a closed list, and the additions import nothing (asserted by `tests/guardrail/imports.test.ts`) | Register row **D88** covers the copy file's path; the layout list in `05` section 12.1 was extended in the same change so the doc is not left describing a smaller module than exists |
| `B2` | `05` section 3.2.2's H-table defines `H13`-`H16` as the allowed side, but section 11.6 marks **eighteen** allowed cases `DET` | L1 grew allowed detectors for `A1`, `A2`, `A6`, `A7`, `A9` and the `A4` fact-lookup shape beside `H13`-`H16` | A case whose `Layer` column says `DET` cannot reach L4, so the "allowed" half of L1 must be complete for the golden set. The H-table is a summary; section 11.6 is the acceptance contract |
| `B3` | `H2`'s trigger is written per pattern ("(my\|our\|this) (code\|...) + (correct\|wrong\|...)"), but `G01` splits the artefact and the diagnosis across two sentences | H2 evaluates the whole operative request, not clause by clause, and removes the matched artefact phrase before testing predicates | `G01` ("Here is my code for Milestone 3. What is wrong with it?") is the canonical case and the demo beat; a per-clause rule misses it. Removing the phrase first is what stops "the working implementation" (`working` in `P4`'s list) and "the best way to approach" (`best`) from being refused as evaluations -- the false positives that `G49`, `G45` and `G16` caught |
| `B4` | `H2`'s predicate list matches document-check phrases ("check the assignment's AI policy") | Content rules run on the text before a permission boundary ("if I can / whether I can / to see if"), and document-check phrases are removed from the clause first | `G29` is `ALLOW`/`A3`: the act named is the *student's* and the question is about the policy. The carve-out is bounded -- with no such boundary the full turn is used, so "Is AI allowed to write my code?" is still refused by H1 |
| `B5` | `H11`/`H12` are written as terminal rules in the ordered list | They are evaluated as **session signals**, and their rule ids are merged into whatever the content chain produced, with the more restrictive verdict winning | `H11`'s own row says "original rule id **+ DE12**", which presupposes that another rule also matched. Without the merge, `DE12` is lost whenever the new turn is caught by H1 as well |
| `B6` | `DE9` names "another language, base64, leetspeak, or split across characters" | Base64 and leetspeak are decoded and re-evaluated through the full refusing chain; **non-English text is not detectable deterministically** and remains L4's job | `DE9`'s own text says "same rule as the decoded request". A decoded variant can only *add* a refusal, and the `DE9` frame id is recorded only when a variant is what produced the outcome -- a turn containing the digit `4` decodes to something under the leet map, and recording that as an encoding attack was a false positive found by `G49`. Non-English coverage is a known gap, not a claim |

**Register rows cited.** `D83`, `D84`, `D85`, `D86`, `D87`, `D88`, `D47`, `D68`, `D69`, `N1`-`N12`.

**How these were verified.** `pnpm test -- tests/guardrail` -> 232 tests in 9 files, all passing,
in 1.44 s with no network and no provider key; the 53 golden cases of `05` section 11.6 execute with
no skip list and no `MODALITY` marker. The exact counts and commands are in `../01-STATE.md`.
