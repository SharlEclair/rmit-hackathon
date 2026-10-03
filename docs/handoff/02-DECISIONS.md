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
