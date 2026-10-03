# 06 - Data Model and API Contracts

**Purpose.** The interface contract. This doc fixes what is stored, what may be read by whom, and what the HTTP surface looks like. If `app/` code and this doc disagree about an entity, a field, or an endpoint, one of them is a bug and this doc is the reference until it is amended.

**Normative parents.** [`../AGENTS.md`](../AGENTS.md) (constraints C1-C8), [`01-DECISIONS.md`](01-DECISIONS.md) (what we settled), [`15-GLOSSARY.md`](15-GLOSSARY.md) (vocabulary). If this doc contradicts them, they win.

**Audience and reading order.**

| You are | Read |
|---|---|
| Building the schema or migrations | 1, 2, 3, 4, 6, 7, 8 |
| Building API routes or the client | 1, 2, 3, 4 (rules only), 5 |
| Building the guardrail or Assistant | 2, 3, 4.7, 5.5.9, 5.5.10 |
| Building analytics | 2, 4.6, 4.7, 7.6, 8 |
| Writing UI | 2, 3.1, 5 (endpoint index + shapes) |
| Reviewing for privacy (C4, C5) | 4.3, 4.4, 4.5, 4.6, 4.7, 9 |

**Fixed vocabulary.** Only terms defined in [`15-GLOSSARY.md`](15-GLOSSARY.md) appear in this doc. Field and column names are not vocabulary; they are identifiers.

---

## 1. Purpose, scope, and invariants

### 1.1 What this doc owns

1. The T1-T5 truth hierarchy and the four conflict-resolution rules (section 2).
2. The `publicationStatus` state machine and the approval boundary (section 3).
3. The anonymous identity mechanism and its non-joinable guarantee (section 4).
4. The REST surface under `/api/` with request, response, and error contracts (section 5).
5. Database conventions (section 6) and every entity with its fields and constraints (section 7).

### 1.2 What this doc does not own

| Topic | Owner |
|---|---|
| Guardrail policy rules and the verdict decision procedure | [`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md) |
| Metric definitions, aggregation windows, thresholds | [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md) |
| Stack, provider adapter, retrieval pipeline | [`04-TECH-ARCHITECTURE.md`](04-TECH-ARCHITECTURE.md) |
| What is in scope at all | [`02-SCOPE.md`](02-SCOPE.md) |
| Screen layout and visual grammar | [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) |

### 1.3 Invariants the schema and API must enforce

Each invariant is stated so that a test can fail it. "Enforcement" names the mechanism, not an intention.

| ID | Invariant | Source | Enforcement |
|---|---|---|---|
| I-1 | The Assistant never produces an answer, code, evaluation, debug result, or solution step, including derived effort. | C1, D6, D11 | `guardrail_logs.verdict` is required for every student request; no assistant message can be persisted without a preceding `ALLOW`/`ALLOW_WITH_SCOPE` verdict (section 5.5.9). |
| I-2 | No official requirement is paraphrased and presented as the requirement. `requirement_nodes.verbatim_text` and `rubric_sections.criteria_text` are substrings of the cited `source_chunks.text`. | C2, D17 | Ingestion validator rejects non-substring text; the Assignment Map renders interpretation only in the AI-interpretation surface (section 2.2, section 7.2.5, section 7.2.6). |
| I-3 | No AI-generated artifact is student-visible before `PUBLISHED`. | C3, D21, D22 | Gate rule G1 (section 3.4). Every student read path filters on `publication_status = 'PUBLISHED'`. |
| I-4 | No tutor-facing query or response resolves the identity behind an anonymous post. | C4, D26 | Section 4.4 rules A-ID-1 to A-ID-8. |
| I-5 | Tutor analytics are aggregate only, with a k-anonymity floor of 5 contributing students. | C5, D31, D32 | Section 4.7. `milestone_metrics` has `CHECK (contributor_count >= 5)`; no analytics table has an identity column. |
| I-6 | Student uploads never bypass the guard, on any modality that ships. | C6, D10, O11 | `student_uploads.guardrail_scan_status` must be `clear` for an upload to be attached to an assistant request (section 5.6). MVP modalities are images (PNG/JPEG), PDF, and plain text; audio and video are refused at the picker (O11). |
| I-7 | No secret value is returned by an API, written to a log, or stored in a fixture. | C7 | Section 5.7 redaction list; `users.password_hash`, `storage_key`, `*_API_KEY` never serialised. |
| I-8 | Every AI call goes through the provider adapter. | C8, D39 | Not enforceable in the schema; enforced by lint (section 9, test T-14). |
| I-9 | Every AI-generated artifact carries provenance: model id, prompt version, generation timestamp, grounding chunk ids. | AGENTS section 4.2, D15 | `origin` + `provenance` + `grounding_chunk_ids` columns with CHECK constraints (section 7.2), retained through every status transition. |
| I-10 | Each assignment has its own AI Usage Policy, enforced per assignment, and it is tutor-approved before it constrains a student. No approved policy means the Assistant is unavailable, not permissive. | D9, D21, D47 | `ai_policy_rules` with `publication_status`; the guardrail reads only `PUBLISHED` rules and returns `REFUSE` with reason code `POL_ABSENT` when none exists (section 5.5.9, section 7.2.11). |
| I-11 | An LLM response that fails schema validation is a refusal, not a retry loop. | D16 | `LLM_OUTPUT_INVALID` (502) is surfaced as a refusal with verdict `REFUSE` and reason code `SCHEMA_VALIDATION_FAILED`; no retry-until-valid path exists (section 5.3). |
| I-12 | The Assistant may read a student's own private Query thread and never another student's. | O9 | `queries.student_id` is compared to the session user in the retrieval guard; no cross-student read path exists (section 5.2). |

---

## 2. Truth hierarchy

The hierarchy is the authority order used to resolve conflict and to decide what the Assistant may cite. It is cited by D14, D17, and O10; the operational guardrail procedure lives in [`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md).

### 2.1 The five tiers

| Tier | Source | Authority | Retrievable for grounding | Student-visible label | Example rows |
|---|---|---|---|---|---|
| **T1** | Official Assignment Brief and Rubric, as uploaded | Authoritative, verbatim, never paraphrased | Yes | "Original assignment brief" / "Official rubric" | `assignment_sources` (kind `brief`, `rubric`), `source_chunks`, the verbatim fields of `requirement_nodes` and `rubric_sections` |
| **T2** | Tutor-approved clarifications, published FAQ entries, approved AI Usage Policy | Authoritative as tutor interpretation | Yes | "Published by your tutor" | `faq_entries` with `publication_status = 'PUBLISHED'`, `ai_policy_rules` with `publication_status = 'PUBLISHED'` |
| **T3** | Tutor-approved milestones and checklist items | Official structure; not authoritative on what the assignment requires | Yes, as structure only | "Approved by your tutor" (structure), never as a requirement | `milestones`, `checklist_items` with `publication_status = 'PUBLISHED'` |
| **T4** | Student discussions and peer answers | Non-authoritative; never grounds an authoritative answer | **No** | "Peer discussion - not official guidance" | `discussion_threads`, `discussion_posts` |
| **T5** | AI-generated interpretation: Assignment Map, FAQ candidates, ambiguity findings, proposed milestones and checklist items before approval | Advisory; requires approval before student-visible | **No** | "AI-generated interpretation - not the official requirement" | `requirement_nodes.map_summary`, `rubric_sections.map_interpretation`, `ambiguity_findings`, `faq_entries` and `ai_policy_rules` not yet `PUBLISHED`, `milestones`/`checklist_items` not yet `PUBLISHED` |

Two rules that follow from the table:

1. **T4 is never in the retrieval set for an authoritative answer** (O10). A discussion thread may be linked from an assistant message as a pointer, labelled as peer content, but it is never cited as authority and never cited as a source chunk.
2. **T5 is never presented as a requirement.** The Assignment Map is T5 even after approval: approval makes it visible, it does not make it authoritative (D18). The Map is navigation, not requirement text.

### 2.2 Tier per artifact

The tier of most rows is fixed by artifact type. Approval promotes only the two artifact types where the tutor is adopting content as their own interpretation.

| Artifact | Tier before approval | Tier after `APPROVED`/`PUBLISHED` | Why |
|---|---|---|---|
| `assignment_sources`, `source_chunks` | T1 | T1 | The document is the document. |
| `requirement_nodes.verbatim_text`, `rubric_sections.criteria_text` | T1 | T1 | Copied verbatim from a T1 source chunk. |
| `requirement_nodes.map_summary`, `rubric_sections.map_interpretation` | T5 | T5 (displayable, still interpretation) | D18: navigation value without authority inflation. |
| `milestones`, `checklist_items` | T5 | T3 | The tutor adopts them as the official structure, not as requirements (D20). |
| `faq_entries` | T5 (candidate) | T2 | The tutor publishes their own interpretation (D24). |
| `ai_policy_rules` | T5 (candidate) | T2 | D9: the policy is tutor-approved data, not a global constant. |
| `ambiguity_findings` | T5 | T5 | Tutor-facing only; never student-facing (D23). |
| `discussion_posts`, `discussion_threads` | T4 | T4 | Peer content. |
| `assistant_messages` | Inherits the highest tier cited | Inherits | The message records `cited_tiers`. |

`truthTier` is **computed, never stored** for artifacts whose tier depends on approval. Storing it would create a second source of truth that can drift from `publication_status`. The computation is:

```text
tier(faq_entries)          = 'T2' if publication_status in ('APPROVED','PUBLISHED') else 'T5'
tier(ai_policy_rules)      = 'T2' if publication_status in ('APPROVED','PUBLISHED') else 'T5'
tier(milestones)           = 'T3' if publication_status in ('APPROVED','PUBLISHED') else 'T5'
tier(checklist_items)      = 'T3' if publication_status in ('APPROVED','PUBLISHED') else 'T5'
tier(requirement_nodes)    = 'T1' for verbatim_text, 'T5' for map_summary
tier(rubric_sections)      = 'T1' for criteria_text,  'T5' for map_interpretation
tier(ambiguity_findings)   = 'T5'
tier(discussion_posts)     = 'T4'
```

### 2.3 The four conflict-resolution rules

**R1 - Strict precedence.** A lower tier never overrides a higher tier. T1 governs T2, T2 governs T3, T3 governs T4, and T5 never overrides anything. Within one tier, the more recently published row wins. If two rows in the same tier disagree and neither is more recent, R3 applies.
*Enforcement:* the Assistant's context assembly orders sources by tier and refuses to emit a statement that contradicts a higher tier present in the context; the guardrail evaluates against the highest tier available ([`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md)).
*Test:* T-05 in section 9.

**R2 - No paraphrase promotion.** Paraphrase can never be the requirement. If an AI-generated or human-written interpretation disagrees with the T1 text it interprets, T1 governs, the interpretation is a defect, and the disagreement is recorded as an `ambiguity_findings` row (`kind = 'contradiction'`) for the tutor. The interpretation is never displayed in the official surface even when the tutor has approved it (C2, D17).
*Enforcement:* I-2 verbatim substring validator at ingestion; the UI renders `map_summary` and `map_interpretation` only inside the AI-interpretation surface with a link to the source page ([`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 2, section 4.2, section 4.3).
*Test:* T-06, T-07.

**R3 - Unresolved conflict is refused, not resolved by the model.** When two tiers are in conflict and neither has precedence under R1, the Assistant must not choose. It states that the assignment documents are inconsistent on that point, cites both locations, and offers to escalate to the tutor (verdict `ESCALATE_TO_TUTOR`). Detection at ingestion creates an `ambiguity_findings` row (D23: detect and locate only; the system never authors the clarification).
*Enforcement:* guardrail rule for conflicting-context detection; `ambiguity_findings` requires `excerpt_a`, and for `kind = 'contradiction'` also `excerpt_b` and at least one located page or section label.
*Test:* T-08.

**R4 - Citation obligation and tier floor.** Every claim about what the assignment requires must be grounded in at least one T1 or T2 source chunk, and the assistant message must record those chunk ids in `grounding_chunk_ids` and the tiers in `cited_tiers`. If the best available grounding is T3, T4, or T5, or if no chunk supports the claim, the Assistant answers with the fixed copy in [`15-GLOSSARY.md`](15-GLOSSARY.md) section 2 ("We could not find this in your assignment documents") and does not assert the requirement.
*Enforcement:* `assistant_messages.grounding_chunk_ids` and `cited_tiers` are populated on every non-refusal assistant message; a message with an empty `grounding_chunk_ids` may not contain requirement language; `guardrail_logs.cited_tiers` records the tiers evaluated.
*Test:* T-09, T-10.

### 2.4 Truth hierarchy is not publication status

The truth hierarchy is about authority. `publication_status` (section 3) is about lifecycle. A row can be `PUBLISHED` and still be T5 (the Assignment Map). A row can be T1 and have no `publication_status` at all (the uploaded brief). Do not use one as a substitute for the other.

---

## 3. Approval lifecycle

Implements D21, D22, and C3: AI generates, the tutor reviews and edits, the tutor approves, then the artifact is student-visible.

### 3.1 States

`publication_status` is a text column with a CHECK constraint (section 6.3). It exists on `assignment_structures`, `requirement_nodes`, `rubric_sections`, `milestones`, `checklist_items`, `faq_entries`, `ai_policy_rules`.

| Value | Meaning | Student-visible | Set by | Retained |
|---|---|---|---|---|
| `AI_GENERATED` | Produced by the Assignment Analyst, not yet presented to a tutor | No | Ingestion | Yes |
| `NEEDS_REVIEW` | In the tutor review queue, marked "AI generated - requires tutor approval" | No | Ingestion completes | Yes |
| `EDITED` | Tutor has changed at least one editable field and has not approved it. Recorded when and only when the tutor actually modifies content (D53); it is not a required step | No | Tutor save | Yes |
| `APPROVED` | Tutor has approved the content; it becomes visible to students only at publish | No (see G1) | Tutor approval | Yes |
| `PUBLISHED` | Approved and released to the assignment workspace | Yes | Tutor publish (bulk) | Yes |
| `REJECTED` | Discarded by the tutor | No | Tutor reject | Yes, for audit; never deleted |

### 3.2 Transitions

| # | From | To | Actor | Trigger | Guard | Side effects |
|---|---|---|---|---|---|---|
| 1 | - | `AI_GENERATED` | system | Analyst writes an artifact | `origin = 'ai'`, provenance complete | `audit_logs` row, action `artifact.generated` |
| 2 | `AI_GENERATED` | `NEEDS_REVIEW` | system | Ingestion run finishes for that artifact | Structure version is `is_current` | Artifact appears in `GET .../review` counts |
| 3 | `NEEDS_REVIEW` | `EDITED` | tutor | Any editable-field PATCH | `expectedRevision` matches (section 5.5.8) | `audit_logs` row with `before`/`after` (redacted per 7.6.5) |
| 4 | `NEEDS_REVIEW` | `APPROVED` | tutor | Approve without editing | Provenance intact; validation warnings absent or acknowledged. No intervening `EDITED` is required (D53) | `approved_by_user_id`, `approved_at` |
| 5 | `EDITED` | `APPROVED` | tutor | Approve after editing | Same as 4 | Same as 4 |
| 6 | `APPROVED` | `EDITED` | tutor | PATCH after approval, before publish | - | Cleared `approved_by_user_id`, `approved_at` |
| 7 | `APPROVED` | `PUBLISHED` | tutor | Publish the assignment | Assignment `status = 'in_review'`; AI Usage Policy has at least one `APPROVED` rule | `published_at`; assignment `status = 'published'` |
| 8 | `PUBLISHED` | `EDITED` | tutor | PATCH after publish | UI warns that saving hides the item until re-approval | Item leaves student-visible reads immediately (Gate rule G1) |
| 9 | `AI_GENERATED` / `NEEDS_REVIEW` / `EDITED` / `APPROVED` | `REJECTED` | tutor | Reject | - | Row retained; excluded from all student and retrieval reads |
| 10 | `REJECTED` | - | tutor | Re-add content | - | A new row is inserted; `REJECTED` is terminal for that row |

Transitions not in the table are refused with `INVALID_STATE_TRANSITION` (409). In particular: no artifact may move directly from `AI_GENERATED` to `APPROVED` (the tutor must see it in the review queue first), and nothing may move to `PUBLISHED` without `APPROVED`.

### 3.3 Regeneration and versioning

- `assignment_structures.version` increments on every ingestion run. At most one structure per assignment has `is_current = true` (partial unique index, section 7.2.4).
- A re-ingest inserts a new structure at `version + 1`, sets `is_current`, and leaves the previous structure and its children untouched with their statuses intact.
- Published artifacts of a superseded structure are not student-visible (G1 requires `is_current`). The UI states this before the tutor starts a re-ingest.
- Student progress is never destroyed by a re-ingest. `student_checklist_progress` references `checklist_items`; superseded items are retained, and the new structure's items start at `not_started`. A tutor-visible notice lists items that have no successor in the new version.

### 3.4 Gate rule G1 (student visibility)

A student-facing read returns an artifact only when all three hold:

```text
artifact.publication_status = 'PUBLISHED'
AND artifact.structure.is_current = true          (for structure-scoped artifacts)
AND assignments.status = 'published'
```

Every student endpoint in section 5 applies G1 in the query, not in the view layer. A student request for an assignment whose `status <> 'published'` returns `NOT_FOUND` (404), never an empty shell.

Publish is a bulk action: `POST /api/tutor/assignments/{assignmentId}/publish` moves every `APPROVED` artifact of the current structure to `PUBLISHED` and sets `assignments.status = 'published'`. Partial publish (a named subset) is supported through `POST .../approve` per artifact and `publish` with an explicit `artifactId` list; the default is all approved artifacts.

### 3.5 Tutor roles and permissions

Working default per O4. The model is deliberately flat so the MVP does not carry a permission matrix that no demo exercises.

| Capability | Tutor | Course owner (`enrollments.is_owner = true`) | Student |
|---|---|---|---|
| Read the assignment, its sources, and the review bundle | Yes | Yes | Published artifacts only |
| Create an assignment in the course | Yes | Yes | No |
| Upload or delete `assignment_sources` | Yes | Yes | No |
| Start an ingestion run | Yes | Yes | No |
| Edit or reject AI-generated artifacts | Yes | Yes | No |
| Approve artifacts | Yes | Yes | No |
| Publish the assignment | Yes | Yes | No |
| Archive the assignment | Yes | Yes | No |
| Reply to a Query | Yes | Yes | Own thread only |
| Publish a FAQ entry | Yes | Yes | No |
| Moderate a discussion post (approve, hide, remove) | Yes | Yes | No |
| Approve or reject a peer answer | Yes | Yes | No |
| Read Assignment Health | Yes | Yes | No |

Rules:

1. A tutor may act on an assignment if an `enrollments` row exists for that user with `role_in_course = 'tutor'` on the assignment's course. No per-assignment tutor assignment exists in the MVP.
2. `enrollments.is_owner` exists in the schema, is displayed nowhere, and grants no additional capability (O4). It is present so a later permission change is a query change, not a migration.
3. There is no `admin` role. `users.role` has exactly two values: `student`, `tutor`.
4. Every mutating tutor action writes an `audit_logs` row (section 7.6.5).
5. Cross-course access returns `NOT_FOUND` (404), not `FORBIDDEN_ROLE`, so the API does not confirm the existence of another course's resources.

### 3.6 `assignments.status` is a different field

`assignments.status` describes the assignment as a whole: `draft`, `ingesting`, `in_review`, `published`, `archived`. `publication_status` describes one artifact. They are never used interchangeably, and no API field named `status` is ambiguous between them: the assignment field is always `assignment.status`, the artifact field is always `publicationStatus`.

### 3.7 Why REJECTED rows are kept

Rejected artifacts are retained because the review history is evidence of the approval boundary working (D21) and because a rejected row can be the counter-example in a guardrail regression test. They are excluded from every student read, every retrieval set, and every analytics aggregate.

---

## 4. Anonymous identity

Implements D25, D26, D27 and C4. The mechanism exists so an anonymous post has continuity within one assignment and no linkability outside it.

### 4.1 Display contract

The display value is exactly `Anonymous Student #<n>`: one space, capital `S`, `#`, integer, no leading zero. `n` is an integer in `1..900`. The glossary defines this shape; the API field is `author.displayLabel` and the student-facing copy never uses "Anonymous" alone.

### 4.2 Pseudonym derivation

The pseudonym of a student for one assignment is an HMAC over the pair `(student_id, assignment_id)`, keyed by `ANON_ID_SECRET`. `ANON_ID_SECRET` is distinct from `AUTH_SECRET` and never appears in a response, a log, or a fixture (C7).

```text
key  = ANON_ID_SECRET (utf-8 bytes, 32 random bytes in base64 in .env)
msg0 = "aa:anon:v1|" + lower(student_id) + "|" + lower(assignment_id)
h0   = HMAC_SHA256(key, msg0)                      -- stored as anon_identities.pseudonym_hmac

-- candidate display number, deterministic from the HMAC
n0   = 1 + (uint32_be(h0[0:4]) mod 900)

-- collision resolution inside one assignment: deterministic probe order
for k = 1, 2, 3, ... :
    hk = HMAC_SHA256(key, msg0 + "|n" + str(k))
    nk = 1 + (uint32_be(hk[0:4]) mod 900)
    if nk is not taken for this assignment_id: choose nk; stop

display_number = the first nk not already used by another anon_identities row
                 of the same assignment_id (DB-enforced by UNIQUE)
```

Facts that follow, all of which the implementation must preserve:

1. **Deterministic.** The same `(student, assignment)` yields the same `h0` and therefore the same candidate number. The number is persisted, so it is stable even if a collision moved it.
2. **Unique within an assignment.** `UNIQUE (assignment_id, display_number)` is the enforcement; the probe loop is only how the value is chosen. With 900 values and a cohort of 37, an unresolvable collision is impossible for any realistic cohort size (900 >> cohort size), and the DB constraint makes the guarantee absolute regardless.
3. **Not linkable across assignments.** The message includes `assignment_id`, so the same student in two assignments gets two unrelated numbers.
4. **Domain-separated from analytics.** The analytics pseudonym uses prefix `aa:ana:v1|` (section 4.7.2). The two values are different by construction and must never be treated as interchangeable.
5. **Not reversible.** No table, index, or view maps a pseudonym back to a student. The only row that holds both is `anon_identities`.
6. **Lookup key.** The identity row is looked up by `(student_id, assignment_id)`, not by HMAC. `pseudonym_hmac` is stored for audit and reproducibility.

Operational note: [`.env.example`](../.env.example) previously said that changing `ANON_ID_SECRET` "re-labels every anonymous post". That was inaccurate and has been corrected. With the persisted lookup above, labels of existing identity rows do not change, because the number is stored and the row is found by `(student_id, assignment_id)`. Rotation affects only identities created after the rotation, so a student who has not posted yet gets a different number than they would have before. Treat `ANON_ID_SECRET` as permanent for the lifetime of an assignment. The same persisted reading is stated in `04` S11, `08` S1.3 and `12` S2.2, and recorded as **D55**.

### 4.3 Storage: `anon_identities` is the only mapping table

```sql
anon_identities (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references users (id) on delete restrict,
  assignment_id   uuid not null references assignments (id) on delete restrict,
  pseudonym_hmac  bytea not null,
  display_number  integer not null check (display_number between 1 and 900),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (student_id, assignment_id),
  unique (assignment_id, pseudonym_hmac),
  unique (assignment_id, display_number)
)
```

Additional rules:

1. Rows are **never deleted**. Deleting one would free its `display_number` and allow a later post by the same student to appear as a different person mid-discussion.
2. The table has no `deleted_at`, is excluded from every cascade, and its FKs are `ON DELETE RESTRICT`.
3. An identity row is created lazily: the first time the student posts anonymously, opens a thread anonymously, or flags a post (section 7.5.3). It is never created for a student who only reads.
4. Anonymous posts reference the identity row by id: `discussion_posts.author_anon_identity_id`. Anonymous threads and posts never store `author_user_id`, and attributed posts never store `author_anon_identity_id` (CHECK constraint, section 7.5.2).

### 4.4 Enforcing rule: no tutor-facing query can resolve an anonymous author

These rules are the enforceable form of C4 and D26. Each is checkable by reading a diff or running a test.

| ID | Rule | Violation example | Checked by |
|---|---|---|---|
| **A-ID-1** | `anon_identities` is the only table that contains both a student identifier and a pseudonym. No other table may hold a column that maps an anonymous post to a user. | Adding `discussion_posts.author_student_id` "for convenience". | Schema review + test T-01 (column allowlist per table). |
| **A-ID-2** | Exactly one module may read or write `anon_identities`: the anonymous identity service (`src/features/discussion/anon-identity.ts`). No other module may import it. | A tutor query module importing the identity service to "look up who posted". | Lint rule + test T-02 (import allowlist). |
| **A-ID-3** | Every tutor-facing discourse read path selects author labels from the view `discussion_author_display`, whose SELECT list contains no `student_id`, `display_name` for anonymous rows, `email`, or `user_id`. | Joining `anon_identities` directly in a tutor handler. | Test T-03: capture SQL issued by tutor handlers, assert it matches neither `anon_identities` nor `users` for discourse endpoints. |
| **A-ID-4** | A tutor-facing read path may not `SELECT`, `ORDER BY`, `GROUP BY`, or filter on any column whose value identifies the author of an anonymous post. Sorting by author id is a violation even when the id is not returned. | "Order threads by author for stability." | Test T-04: assert ORDER BY/GROUP BY column allowlist. |
| **A-ID-5** | No tutor response schema contains a field named `studentId`, `studentName`, `email`, `userId`, `anonIdentityId`, or `subjectRef`. `author` objects carry only `isAnonymised` and `displayLabel`. | Returning `anonIdentityId` so the client can "deduplicate". | Contract test T-11 over every tutor endpoint's JSON. |
| **A-ID-6** | `analytics_events` and `guardrail_logs` may not reference `anon_identities` or `users` by foreign key, and may not store a value derived from an author's pseudonym. | Adding `anon_identity_id` to an event "to join discussion activity". | Migration constraint check (section 7.6.1, section 7.6.2). |
| **A-ID-7** | Student own-post operations (edit, delete) resolve ownership by comparing `author_anon_identity_id` with the caller's identity row for that assignment. A missing identity row means "no anonymous posts", not "no permission to check". | Resolving ownership by `discussion_posts.author_user_id IS NULL`. | Handler review + test T-12. |
| **A-ID-8** | The identity service never returns a student id, and never accepts a pseudonym as input. Its two operations are `identityFor(studentId, assignmentId): {id, displayLabel}` and `displayLabelForPost(postId)`. | `resolveStudent(pseudonym)`. | API surface review of the service module. |

### 4.5 What each role sees

| Value | Student (own) | Student (other) | Tutor | API field |
|---|---|---|---|---|
| Anonymous post authorship | Knows their own post is theirs (an "Edit" affordance appears) | `Anonymous Student #482` | `Anonymous Student #482` | `author.displayLabel` |
| Attributed post authorship | Own display name | Their display name | Their display name | `author.displayLabel` with `author.isAnonymised = false` |
| Real name behind an anonymous post | Their own, obviously | Never | **Never**, in no UI, no API, no sort order, no export | No field exists |
| Flag reporter | Their own flag | Never | Never; the moderator queue shows the flag, not the reporter | `moderation_flags` has no tutor-facing reporter field |
| Per-student activity | Own progress only | No | **Never** | No tutor endpoint accepts a student identifier (section 5.4) |

The tutor-facing discussion view therefore shows continuity without identity: the same `displayLabel` across threads of one assignment tells the tutor "this is one person asking repeatedly", which is the intended signal, and tells them nothing more.

### 4.6 Privacy classes of tables

Every table belongs to exactly one class. The class determines what may read it.

| Class | Tables | Contains student identity | Reachable by tutor-facing reads | Notes |
|---|---|---|---|---|
| **Identity-bearing** | `users`, `enrollments`, `student_assignments`, `student_checklist_progress`, `assistant_sessions`, `assistant_messages`, `assistant_proactive_messages`, `student_uploads`, `queries`, `query_messages`, `audit_logs` | Yes | Partly, and only in the private-Query sense: a tutor reads a Query thread they are answering, which is D24 and O9. Never for aggregate insight. | `student_checklist_progress` and `student_assignments` are student-facing only; no tutor endpoint in section 5 returns them. |
| **Pseudonymous** | `anon_identities`, `discussion_threads`, `discussion_posts`, `moderation_flags` | A pseudonym, joined only inside `anon_identities` | Yes, via `discussion_author_display` only (A-ID-3) | `moderation_flags.reporter_anon_identity_id` stores a pseudonym, never a user id. |
| **Identity-free** | `courses`, `assignments`, `assignment_sources`, `source_chunks`, `assignment_structures`, `requirement_nodes`, `rubric_sections`, `requirement_rubric_links`, `milestone_requirement_links`, `milestones`, `checklist_items`, `ai_policy_rules`, `ambiguity_findings`, `faq_entries`, `analytics_events`, `milestone_metrics`, `assignment_metrics`, `guardrail_logs` | No | Yes | `analytics_events`, `milestone_metrics`, and `guardrail_logs` are the analytics and audit surface; see 4.7. |

`guardrail_logs` is identity-free by schema, not by convention: it has `subject_ref` (a one-way pseudonym with no reverse mapping) and an explicit column prohibition list (section 7.6.2). It is not exposed by any endpoint in the MVP.

### 4.7 Analytics identity-freedom

Implements C5, D31, D32 and the k-anonymity floor.

#### 4.7.1 The identity-free event table

`analytics_events` is the only raw fact table for cohort insight. It has **no** `student_id`, `user_id`, or `anon_identity_id` column, no free-text column, and no column that holds content, a filename, an IP address, or a user agent (section 7.6.1). Identity is replaced at write time by `subject_ref`:

```text
subject_ref = lower(hex(HMAC_SHA256(ANON_ID_SECRET,
                  "aa:ana:v1|" + lower(student_id) + "|" + lower(assignment_id))[0:16]))
```

`subject_ref` is 32 hex characters. It is one-way, there is no table that maps it back, and it is domain-separated from the discussion pseudonym, so a refusal count and a discussion post can never be correlated by value. The event emitter is the only writer and it runs where identity is available; it substitutes `subject_ref` before the insert and never stores the identity.

#### 4.7.2 The aggregation query shape that cannot select a student

`milestone_metrics` is built from `analytics_events` with this shape. The SELECT list is the entire identity surface analytics has.

```sql
-- Build milestone_metrics. Runs per assignment after an event batch, and on demand.
insert into milestone_metrics (
  assignment_id, milestone_id, window_start, window_end,
  contributor_count, started_count, completed_count, completion_rate,
  average_elapsed_seconds, median_elapsed_seconds,
  discussion_post_count, assistant_turn_count, question_count, difficulty_score, computed_at
)
select
  e.assignment_id,
  e.milestone_id,
  $1::timestamptz                                        as window_start,
  $2::timestamptz                                        as window_end,
  count(distinct e.subject_ref)                          as contributor_count,
  count(*) filter (where e.event_type = 'checklist_item_started')   as started_count,
  count(*) filter (where e.event_type = 'checklist_item_completed') as completed_count,
  round(
    count(*) filter (where e.event_type = 'checklist_item_completed')::numeric
    / nullif(count(*) filter (where e.event_type = 'checklist_item_started'), 0), 4
  )                                                      as completion_rate,
  round(avg(e.duration_seconds) filter (where e.event_type = 'checklist_item_completed'))
                                                         as average_elapsed_seconds,
  percentile_cont(0.5) within group (
    order by e.duration_seconds
  ) filter (where e.event_type = 'checklist_item_completed')  as median_elapsed_seconds,
  count(*) filter (where e.event_type = 'discussion_post_created') as discussion_post_count,
  count(*) filter (where e.event_type = 'assistant_message_sent')  as assistant_turn_count,
  null                                                   as question_count,   -- set by step 2 below
  null                                                   as difficulty_score,  -- set by the Insight Engine
  now()
from analytics_events e
where e.assignment_id = $3
  and e.milestone_id is not null
  and e.occurred_at >= $1
  and e.occurred_at <  $2
group by e.assignment_id, e.milestone_id
having count(distinct e.subject_ref) >= 5;                 -- k-anonymity floor (D32)
```

Why this shape cannot select a student:

1. Every referenced column is either a UUID that names an assignment or an artifact (`assignment_id`, `milestone_id`, `checklist_item_id`), a timestamp, an event type, a duration, or `subject_ref`.
2. `subject_ref` appears only inside `count(distinct ...)`. It is never selected, ordered by, grouped by, or returned. Even if it were selected, it is one-way and has no reverse mapping, so it names nobody.
3. `count(distinct e.subject_ref)` is the only place a contributor identity is touched, and the output is an integer.
4. The `having` clause means a bucket with fewer than five contributors produces **no row** rather than a suppressed row. Absence is uniform, so a reader cannot distinguish "0 students" from "4 students".

Question volume per milestone counts **tutor-directed questions only** (D49): private Queries plus discussion posts that received a moderation flag. Assistant turns are not question volume; they are counted separately as `assistant_turn_count` and reported as metric M6, because a chatty session measures confusion with the model rather than confusion with the assignment.

```sql
-- Question volume per milestone, tutor-directed only (D49). No identity column is selected.
select v.assignment_id, v.milestone_id, count(*) as question_count
from (
  select q.assignment_id, q.milestone_id
  from queries q
  where q.created_at >= $1 and q.created_at < $2
    and q.milestone_id is not null
  union all
  select dp.assignment_id, t.milestone_id
  from discussion_posts dp
  join discussion_threads t  on t.id = dp.thread_id
  join moderation_flags mf   on mf.target_kind = 'discussion_post' and mf.target_id = dp.id
  where dp.created_at >= $1 and dp.created_at < $2
    and t.milestone_id is not null
) v
group by v.assignment_id, v.milestone_id;
```

`count(*)` is the only aggregate in both branches and the grouping keys are an assignment and a milestone. There is no shape of this query that yields a student: the `queries.student_id` column is never in a SELECT list, a GROUP BY, or a WHERE clause, and the discussion branch joins by thread and flag, not by author.

The tutor-facing read is then trivial and cannot name a person:

```sql
select milestone_id, contributor_count, started_count, completed_count,
       completion_rate, average_elapsed_seconds, median_elapsed_seconds,
       discussion_post_count, assistant_turn_count, question_count, difficulty_score
from milestone_metrics
where assignment_id = $1 and window_start = $2;
```

A milestone in the response with no metrics row is rendered as the glossary state **Insufficient data** (`dataState: 'insufficient_data'`), never as zero (section 5.5.11).

#### 4.7.3 Column prohibitions

The following columns must never be added to any table in the identity-free class. A pull request that adds one of these is a design change, not a convenience:

```text
analytics_events, milestone_metrics, assignment_metrics, guardrail_logs:
  student_id, user_id, anon_identity_id, author_user_id, display_name, email,
  request_text, response_text, message_body, extracted_text, ip_address, user_agent,
  session_token, cookie, filename, original_filename
```

`milestone_metrics` carries `CHECK (contributor_count >= 5)` as a structural floor: even a hand-written INSERT cannot create a de-anonymising bucket. `assignment_metrics.active_count` carries `CHECK (active_count IS NULL OR active_count >= 5)` for the same reason. The floor applies to the Assignment Health headline as well as to per-milestone rows: below five contributing students the headline reports **Insufficient data** rather than a number (D52).

#### 4.7.4 Per-student progress is student-facing only

`student_checklist_progress` and `student_assignments` hold identity and are read only by the student's own endpoints. They are not read by any aggregate query: the metrics builder reads `analytics_events` for time and completion, and `queries` or `enrollments` with `count(*)` only. There is no tutor endpoint that accepts a student identifier, which a reviewer can confirm by scanning the path list in section 5.4.

---

## 5. API contracts

### 5.1 Conventions

**D51: this section is the single source of truth for route paths.** A path sketch in any other doc (for example the work-packet file layout in [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md)) is illustrative and must reconcile to section 5.4 before implementation. A new URL is added here first.

| Aspect | Rule |
|---|---|
| Style | REST-ish JSON under `/api/`, plural nouns, one resource per path segment, no verbs except the three state transitions listed in 5.1.1. |
| Versioning | Unversioned in the MVP. A breaking change after submission adds `/api/v2/`; existing paths are not reused with different semantics. |
| Content type | `application/json; charset=utf-8` for requests and responses; `multipart/form-data` for the two upload endpoints; `text/event-stream` for the assistant stream. |
| Field naming | JSON is `camelCase`; database is `snake_case`. The mapping is mechanical and bidirectional: one identifier, two spellings. `display_name` in the DB is `displayName` in JSON, `publication_status` is `publicationStatus`. Acronyms follow the same rule (`faq_entries` -> `faqEntries`). |
| Identifiers | UUID strings, lowercase, hyphenated. Never integers. |
| Timestamps | ISO 8601 with a `Z` suffix, UTC, millisecond precision (`2026-10-03T05:12:00.000Z`). Never local time, never a UNIX integer. |
| Durations | Integer seconds in a field whose name ends in `Seconds`. |
| Rates | Decimal `0..1` in a field whose name ends in `Rate` (0.71 = 71%). Percentages appear only in UI copy. |
| Money | Not applicable; no endpoint returns a price. |
| Null vs absent | A field that does not apply is `null`, not omitted, except in list items where the contract says "omitted". A zero is never used to mean "unknown". |
| Pagination | Cursor: `?limit=1..100` (default 20) and `?cursor=<opaque>`. Response: `{ "items": [...], "nextCursor": "..." \| null }`. Cursors are opaque; clients must not parse them. |
| Sorting | Default sort is documented per endpoint. Where a sort key is student-derived, A-ID-4 applies. |
| Request id | The server sets `x-request-id` on every response and echoes an inbound one. It is also the value in `audit_logs.request_id`. |
| Idempotency | `POST` is not idempotent in general. The three checklist transitions (start, complete, reopen) are idempotent: repeating them returns the current state with 200. |
| Caching | No endpoint is cacheable by a shared cache. Responses carry `Cache-Control: private, no-store` for anything containing student data. |

#### 5.1.1 The only verb-shaped paths

```text
POST /api/student/checklist-items/{itemId}/start
POST /api/student/checklist-items/{itemId}/complete
POST /api/student/checklist-items/{itemId}/reopen
POST /api/tutor/assignments/{assignmentId}/ingest
POST /api/tutor/assignments/{assignmentId}/approve
POST /api/tutor/assignments/{assignmentId}/publish
POST /api/tutor/assignments/{assignmentId}/archive
POST /api/tutor/queries/{queryId}/reply
POST /api/tutor/queries/{queryId}/publish
POST /api/tutor/discussion-posts/{postId}/moderate
POST /api/tutor/discussion-posts/{postId}/answer-review
POST /api/tutor/discussion-posts/{postId}/promote-to-faq
POST /api/student/discussion-posts/{postId}/flag
POST /api/student/queries/{queryId}/resolve
POST /api/student/assignments/{assignmentId}/assistant/messages
POST /api/student/assistant/proactive-messages/{noticeId}/dismiss
```

Each of these is a state transition or a side-effecting action on a resource, which is why a verb is clearer than a PATCH on a synthetic field. No other verb paths are permitted.

### 5.2 Roles and authorization

| Role in this doc | Meaning |
|---|---|
| `public` | No session required. |
| `authenticated` | Any valid session cookie, either role. |
| `student` | Session user has `users.role = 'student'` **and** an `enrollments` row with `role_in_course = 'student'` on the course that owns the addressed assignment. |
| `tutor` | Session user has `users.role = 'tutor'` **and** an `enrollments` row with `role_in_course = 'tutor'` on the course that owns the addressed assignment. |

Rules:

1. Session is an httpOnly cookie (D42). No bearer tokens, no API keys for user endpoints.
2. The role check and the enrollment check are separate; both must pass. A student enrolled in course A cannot read course B's assignment, and the response is `NOT_FOUND` (404), not `FORBIDDEN_ROLE` (403), so the API does not confirm that the other assignment exists.
3. `403 FORBIDDEN_ROLE` is returned only when the caller is authenticated, the resource is theirs to know about, and the role is wrong (for example a student calling `/api/tutor/...`).
4. Student-scoped resources (`student_assignments`, `student_checklist_progress`, `assistant_sessions`, `assistant_messages`, `student_uploads`, `queries`, `query_messages`) are filtered by `student_id = session.userId` in the query, never by a client-supplied student id. No endpoint accepts a student id from the client.
5. O9: the Assistant's retrieval may include the calling student's own Query thread, read-only, and never another student's.

### 5.3 Error contract

Every failure returns this envelope, with no exception:

```ts
interface ApiErrorResponse {
  error: {
    code: ErrorCode;            // stable, machine-readable, SCREAMING_SNAKE_CASE
    message: string;            // one sentence, safe to show a user, no stack, no SQL
    details?: Record<string, unknown>;  // validated field names, allowed values, retry hints
    requestId: string;
  };
}
```

`message` never contains: a SQL fragment, a stack trace, a file path, a secret, an internal hostname, or the content of another user's row (C7). `details` may contain `fields` for validation failures and never contains student content.

| Code | HTTP | Meaning | Retryable by client |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | No session, or the session cookie is invalid or expired. | After login |
| `FORBIDDEN_ROLE` | 403 | Authenticated but the wrong role for this endpoint. | No |
| `NOT_FOUND` | 404 | The resource does not exist, or the caller is not enrolled on its course. Deliberately indistinguishable. | No |
| `VALIDATION_FAILED` | 400 | Body or query failed schema validation. `details.fields[]` names each field. | After fixing |
| `IMMUTABLE_FIELD` | 409 | Attempt to edit a field the contract marks immutable (`verbatim_text`, `criteria_text`, `assignment_sources` content, a sent `query_messages` body). | No |
| `INVALID_STATE_TRANSITION` | 409 | A transition not in section 3.2, or an action on an artifact in the wrong status. | No |
| `STALE_REVISION` | 409 | `expectedRevision` does not match the stored revision; another tutor saved first. | After refetch |
| `INGESTION_IN_PROGRESS` | 409 | A second ingestion run was requested while one is running. | After it finishes |
| `NO_SOURCES` | 422 | Ingestion requested with zero `assignment_sources`. | After upload |
| `EXTRACTION_FAILED` | 422 | A source could not be read (corrupt file, unsupported encoding). `details.sourceId`. | After replacing the file |
| `UNSUPPORTED_FORMAT` | 415 | MIME type outside the supported set for the role: tutor sources per O5, student uploads per O11. `details.allowedFormats[]`. | After converting |
| `PAYLOAD_TOO_LARGE` | 413 | Upload exceeds `UPLOAD_MAX_BYTES` (default 25 MiB). `details.maxBytes`. | After shrinking |
| `RATE_LIMITED` | 429 | Budget exceeded. `Retry-After` header present. | Yes |
| `LLM_UNAVAILABLE` | 503 | The provider adapter could not be reached after its configured attempts. | Yes |
| `LLM_OUTPUT_INVALID` | 502 | Model output failed schema validation. Per D16 this is terminal for the request, surfaced to the student as a refusal with reason code `SCHEMA_VALIDATION_FAILED`. Never retried until valid. | No |
| `INTERNAL` | 500 | Anything else. The response body contains the code and the request id only. | No |

A guardrail refusal is **not** an error. It is a `200` response whose payload carries a verdict of `REFUSE`, `CLARIFY`, or `ESCALATE_TO_TUTOR` (section 5.5.9).

### 5.4 Endpoint index

Every path is listed with its role, purpose, and the failure codes it can return in addition to the table-wide ones. No path contains a student identifier (section 5.2 rule 4).

#### Authentication and courses

| Method | Path | Role | Purpose | Success | Failure codes |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | public | Email + password sign-in, sets the session cookie | 200 `SessionResponse` | `VALIDATION_FAILED`, `UNAUTHENTICATED`, `RATE_LIMITED` |
| POST | `/api/auth/logout` | authenticated | Clears the session cookie | 204 | `UNAUTHENTICATED` |
| GET | `/api/auth/session` | public | Current session and role, used by the shell to route | 200 `SessionResponse` | `UNAUTHENTICATED` |
| GET | `/api/courses` | student, tutor | Courses the caller is enrolled in, with assignment counts | 200 `CourseListResponse` | `UNAUTHENTICATED`, `FORBIDDEN_ROLE` |
| GET | `/api/courses/{courseId}` | student, tutor | Course detail, role-appropriate | 200 `CourseResponse` | `NOT_FOUND` |
| GET | `/api/courses/{courseId}/assignments` | student, tutor | Assignment cards for the course; students see published only (G1) | 200 `AssignmentListResponse` | `NOT_FOUND` |

#### Tutor: assignment ingestion and approval

| Method | Path | Role | Purpose | Success | Failure codes |
|---|---|---|---|---|---|
| POST | `/api/tutor/courses/{courseId}/assignments` | tutor | Create a draft assignment | 201 `AssignmentResponse` | `NOT_FOUND`, `VALIDATION_FAILED` |
| GET | `/api/tutor/assignments/{assignmentId}` | tutor | Assignment detail with review progress counts | 200 `AssignmentResponse` | `NOT_FOUND` |
| PATCH | `/api/tutor/assignments/{assignmentId}` | tutor | Edit title or due date | 200 `AssignmentResponse` | `NOT_FOUND`, `VALIDATION_FAILED`, `STALE_REVISION` |
| POST | `/api/tutor/assignments/{assignmentId}/sources` | tutor | Upload one source document (multipart) | 201 `AssignmentSourceResponse` | `UNSUPPORTED_FORMAT`, `PAYLOAD_TOO_LARGE`, `VALIDATION_FAILED` |
| DELETE | `/api/tutor/assignments/{assignmentId}/sources/{sourceId}` | tutor | Remove a source before publish | 204 | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| POST | `/api/tutor/assignments/{assignmentId}/ingest` | tutor | Start an Assignment Analyst run | 202 `IngestionStatusResponse` | `NO_SOURCES`, `INGESTION_IN_PROGRESS`, `LLM_UNAVAILABLE` |
| GET | `/api/tutor/assignments/{assignmentId}/ingest` | tutor | Poll ingestion status and stage | 200 `IngestionStatusResponse` | `NOT_FOUND` |
| GET | `/api/tutor/assignments/{assignmentId}/review` | tutor | The full review bundle: sources, artifacts, ambiguity findings, counts | 200 `ReviewBundleResponse` | `NOT_FOUND` |
| PATCH | `/api/tutor/structure-artifacts/{artifactId}` | tutor | Edit one artifact (see 5.5.8) | 200 `ReviewArtifactResponse` | `IMMUTABLE_FIELD`, `INVALID_STATE_TRANSITION`, `STALE_REVISION`, `VALIDATION_FAILED` |
| POST | `/api/tutor/assignments/{assignmentId}/artifacts` | tutor | Tutor-authored milestone, checklist item, FAQ entry, or policy rule | 201 `ReviewArtifactResponse` | `VALIDATION_FAILED`, `INVALID_STATE_TRANSITION` |
| DELETE | `/api/tutor/structure-artifacts/{artifactId}` | tutor | Reject or delete an artifact (see 3.2 rule 9) | 204 | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| POST | `/api/tutor/assignments/{assignmentId}/approve` | tutor | Approve one artifact or all `NEEDS_REVIEW`/`EDITED` artifacts | 200 `ReviewCountsResponse` | `INVALID_STATE_TRANSITION`, `VALIDATION_FAILED` |
| POST | `/api/tutor/assignments/{assignmentId}/publish` | tutor | Move `APPROVED` artifacts to `PUBLISHED`, set assignment `published` | 200 `AssignmentResponse` | `INVALID_STATE_TRANSITION` |
| POST | `/api/tutor/assignments/{assignmentId}/archive` | tutor | Archive the assignment; students lose access | 200 `AssignmentResponse` | `INVALID_STATE_TRANSITION` |
| GET | `/api/tutor/assignments/{assignmentId}/ambiguity-findings` | tutor | Ambiguity and contradiction findings | 200 `AmbiguityFindingListResponse` | `NOT_FOUND` |
| PATCH | `/api/tutor/ambiguity-findings/{findingId}` | tutor | Acknowledge, dismiss, or mark resolved by a clarification | 200 `AmbiguityFindingResponse` | `INVALID_STATE_TRANSITION`, `VALIDATION_FAILED` |

#### Tutor: queries, discussions, analytics

| Method | Path | Role | Purpose | Success | Failure codes |
|---|---|---|---|---|---|
| GET | `/api/tutor/assignments/{assignmentId}/queries` | tutor | Query threads grouped by approved Milestone | 200 `TutorQueryGroupListResponse` | `NOT_FOUND` |
| GET | `/api/tutor/queries/{queryId}` | tutor | One Query thread with messages | 200 `QueryThreadResponse` | `NOT_FOUND` |
| POST | `/api/tutor/queries/{queryId}/reply` | tutor | Private reply to the asking student (D24) | 201 `QueryMessageResponse` | `NOT_FOUND`, `VALIDATION_FAILED`, `IMMUTABLE_FIELD` |
| POST | `/api/tutor/queries/{queryId}/publish` | tutor | Publish a reply as a FAQ entry (D24) | 201 `FaqEntryResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| GET | `/api/tutor/assignments/{assignmentId}/faq-entries` | tutor | FAQ entries including candidates | 200 `FaqEntryListResponse` | `NOT_FOUND` |
| PATCH | `/api/tutor/faq-entries/{faqEntryId}` | tutor | Edit question or answer, reorder, or unpublish | 200 `FaqEntryResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION`, `STALE_REVISION` |
| DELETE | `/api/tutor/faq-entries/{faqEntryId}` | tutor | Reject a candidate or retire a published entry | 204 | `NOT_FOUND` |
| GET | `/api/tutor/assignments/{assignmentId}/discussions` | tutor | Official FAQ entries, threads, posts, moderation queue | 200 `TutorDiscussionResponse` | `NOT_FOUND` |
| POST | `/api/tutor/discussion-posts/{postId}/moderate` | tutor | `approve` (unhide), `hide_pending_review`, or `remove` | 200 `DiscussionPostResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| POST | `/api/tutor/discussion-posts/{postId}/answer-review` | tutor | Approve or reject a peer answer (D29) | 200 `DiscussionPostResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| POST | `/api/tutor/discussion-posts/{postId}/promote-to-faq` | tutor | Explicit promotion of a peer answer to the FAQ (D29, O8) | 201 `FaqEntryResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| GET | `/api/tutor/assignments/{assignmentId}/analytics` | tutor | Assignment Health: headline, milestone metrics, potential difficulty areas | 200 `AssignmentHealthResponse` | `NOT_FOUND` |
| GET | `/api/tutor/assignments/{assignmentId}/analytics/milestones/{milestoneId}` | tutor | One milestone metric row | 200 `MilestoneMetricResponse` | `NOT_FOUND` |

#### Student

| Method | Path | Role | Purpose | Success | Failure codes |
|---|---|---|---|---|---|
| GET | `/api/student/courses` | student | Enrolled courses | 200 `CourseListResponse` | `FORBIDDEN_ROLE` |
| GET | `/api/student/courses/{courseId}/assignments` | student | Published assignments in the course (G1) | 200 `AssignmentListResponse` | `NOT_FOUND` |
| GET | `/api/student/assignments/{assignmentId}` | student | Workspace bootstrap: brief, map, checklist, policy, counts | 200 `StudentWorkspaceResponse` | `NOT_FOUND` |
| GET | `/api/student/assignments/{assignmentId}/brief` | student | T1 documents and page-mapped viewer manifest | 200 `BriefResponse` | `NOT_FOUND` |
| GET | `/api/student/assignments/{assignmentId}/structure` | student | The Assignment Map graph (T5, labelled) | 200 `AssignmentMapResponse` | `NOT_FOUND` |
| GET | `/api/student/assignments/{assignmentId}/policy` | student | The published AI Usage Policy (T2) | 200 `AiPolicyResponse` | `NOT_FOUND` |
| GET | `/api/student/assignments/{assignmentId}/checklist` | student | Milestones, items, and own progress | 200 `ChecklistResponse` | `NOT_FOUND` |
| POST | `/api/student/checklist-items/{itemId}/start` | student | Start an item; records `started_at` | 200 `ChecklistProgressResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| POST | `/api/student/checklist-items/{itemId}/complete` | student | Complete an item; records `completed_at` and elapsed time | 200 `ChecklistProgressResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| POST | `/api/student/checklist-items/{itemId}/reopen` | student | Reopen a completed item | 200 `ChecklistProgressResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| GET | `/api/student/assignments/{assignmentId}/queries` | student | Own private Query threads | 200 `QueryListResponse` | `NOT_FOUND` |
| POST | `/api/student/assignments/{assignmentId}/queries` | student | Open a private Query | 201 `QueryThreadResponse` | `NOT_FOUND`, `VALIDATION_FAILED` |
| GET | `/api/student/queries/{queryId}` | student | Own Query thread with messages | 200 `QueryThreadResponse` | `NOT_FOUND` |
| POST | `/api/student/queries/{queryId}/messages` | student | Add a message to own Query | 201 `QueryMessageResponse` | `NOT_FOUND`, `VALIDATION_FAILED` |
| POST | `/api/student/queries/{queryId}/resolve` | student | Mark the Query resolved | 200 `QueryThreadResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| GET | `/api/student/assignments/{assignmentId}/discussions` | student | Threads with author labels, plus official FAQ entries | 200 `StudentDiscussionResponse` | `NOT_FOUND` |
| POST | `/api/student/assignments/{assignmentId}/discussion-threads` | student | Create a thread, anonymous or attributed | 201 `DiscussionThreadResponse` | `NOT_FOUND`, `VALIDATION_FAILED` |
| POST | `/api/student/discussion-threads/{threadId}/posts` | student | Reply, anonymous or attributed | 201 `DiscussionPostResponse` | `NOT_FOUND`, `VALIDATION_FAILED` |
| PATCH | `/api/student/discussion-posts/{postId}` | student | Edit own post | 200 `DiscussionPostResponse` | `NOT_FOUND`, `FORBIDDEN_ROLE`, `IMMUTABLE_FIELD` |
| DELETE | `/api/student/discussion-posts/{postId}` | student | Delete own post (soft delete) | 204 | `NOT_FOUND`, `FORBIDDEN_ROLE` |
| POST | `/api/student/discussion-posts/{postId}/flag` | student | Flag a post once (D30) | 201 `ModerationFlagResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| GET | `/api/student/assignments/{assignmentId}/faq-entries` | student | Published FAQ entries (T2) | 200 `FaqEntryListResponse` | `NOT_FOUND` |
| GET | `/api/student/assignments/{assignmentId}/assistant/session` | student | Own Assistant transcript for this assignment | 200 `AssistantSessionResponse` | `NOT_FOUND` |
| POST | `/api/student/assignments/{assignmentId}/assistant/messages` | student | Send a request; SSE stream, guardrail first | 200 `text/event-stream` | `NOT_FOUND`, `VALIDATION_FAILED`, `UNSUPPORTED_FORMAT`, `RATE_LIMITED`, `LLM_UNAVAILABLE`, `LLM_OUTPUT_INVALID` |
| GET | `/api/student/assignments/{assignmentId}/assistant/proactive` | student | The one permitted proactive message for a milestone (O2), or `null` | 200 `ProactiveMessageResponse` | `NOT_FOUND` |
| POST | `/api/student/assistant/proactive-messages/{noticeId}/dismiss` | student | Dismiss a proactive message | 200 `ProactiveMessageResponse` | `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| POST | `/api/student/uploads` | student | Upload a file for the Assistant (multipart); images, PDF, or plain text only (O11) | 201 `StudentUploadResponse` | `UNSUPPORTED_FORMAT`, `PAYLOAD_TOO_LARGE` |
| GET | `/api/student/uploads/{uploadId}` | student | Extraction and guardrail scan status for an own upload | 200 `StudentUploadResponse` | `NOT_FOUND` |
| GET | `/api/health` | public | Liveness and provider-configuration presence, never values | 200 `HealthResponse` | - |

### 5.5 Shapes

Type contracts. These are the shapes the client and the route handlers agree on; a field not listed does not exist in the response.

#### 5.5.1 Session

```ts
interface SessionResponse {
  user: {
    id: string;
    displayName: string;
    role: 'student' | 'tutor';
  };
  courses: Array<{ id: string; code: string; title: string; roleInCourse: 'student' | 'tutor' }>;
  redirectTo: string;   // role-appropriate landing path
}

// POST /api/auth/login request
interface LoginRequest { email: string; password: string; }
```

#### 5.5.2 Course and assignment lists

```ts
interface CourseListResponse {
  items: Array<{
    id: string; code: string; title: string; term: string;
    assignmentCount: number; roleInCourse: 'student' | 'tutor';
  }>;
}

interface AssignmentListResponse {
  items: Array<{
    id: string; title: string; status: AssignmentStatus;
    dueAt: string | null; publishedAt: string | null;
    checklistCompleted: number | null;   // null for tutors, and for students before publish
    checklistTotal: number | null;
    openQueryCount: number | null;       // students only
    needsReviewCount: number | null;     // tutors only (section 5.5.7)
  }>;
}

type AssignmentStatus = 'draft' | 'ingesting' | 'in_review' | 'published' | 'archived';
type PublicationStatus =
  | 'AI_GENERATED' | 'NEEDS_REVIEW' | 'EDITED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
type TruthTier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
type GuardrailVerdict =
  | 'ALLOW' | 'ALLOW_WITH_SCOPE' | 'CLARIFY' | 'REFUSE' | 'ESCALATE_TO_TUTOR';
```

#### 5.5.3 Student workspace bootstrap

```ts
interface StudentWorkspaceResponse {
  assignment: {
    id: string; title: string; courseCode: string; courseTitle: string;
    status: 'published'; dueAt: string | null; publishedAt: string;
  };
  brief: {
    sources: Array<{
      id: string; kind: 'brief' | 'rubric' | 'ai_policy' | 'marking_guide' | 'supplementary';
      title: string;             // derived from the filename, the document itself is verbatim
      mimeType: string; pageCount: number | null;
      viewerUrl: string;         // same-origin, session-scoped, no storage key exposed
    }>;
  };
  structure: AssignmentMapResponse | null;  // null when the Map is not published
  checklist: ChecklistResponse | null;
  policy: AiPolicyResponse;                 // available = false means no approved policy exists (D47)
  officialFaqCount: number;
  counts: {
    openQueries: number;
    queriesWithTutorReply: number;
    checklistCompleted: number;
    checklistTotal: number;
    resolutionRate: number;
  };
  dataState: 'ready' | 'not_published';
}
```

#### 5.5.4 Official brief (T1) and the page map

```ts
interface BriefResponse {
  assignmentId: string;
  documents: Array<{
    id: string;
    kind: 'brief' | 'rubric' | 'ai_policy' | 'marking_guide' | 'supplementary';
    mimeType: string;
    pageCount: number;
    truthTier: 'T1';
    sections: Array<{
      label: string;            // the document's own heading text, verbatim
      pageFrom: number; pageTo: number;
      sourceChunkIds: string[]; // grounding ids used by the Map's deep links
    }>;
  }>;
}
```

The viewer manifest is the only place page anchors are resolved. A Map node deep link is `#page=<n>` on this manifest (D43), and the viewer never renders rewritten text.

#### 5.5.5 Assignment Map graph (T5)

```ts
interface AssignmentMapResponse {
  assignmentId: string;
  structureId: string;
  generatedAt: string;
  label: 'AI-generated interpretation';       // fixed string; the UI must render it
  disclaimer: string;                         // fixed copy from 07-UI-UX-SPEC section 2
  nodes: Array<{
    id: string;
    kind: 'requirement' | 'rubric_section' | 'milestone' | 'checklist_item';
    title: string;
    mapSummary: string | null;                // T5, interpretation
    verbatimText: string | null;              // T1, requirements and rubric sections only
    truthTier: 'T1' | 'T3' | 'T5';
    sourceRef: {
      sourceId: string; pageFrom: number; pageTo: number;
      sectionLabel: string | null;
    } | null;
    progress?: { state: 'not_started' | 'in_progress' | 'completed' };  // students only
  }>;
  edges: Array<{
    from: string; to: string;
    kind: 'requirement_rubric' | 'requirement_milestone' | 'milestone_checklist_item' | 'rubric_milestone';
  }>;
}
```

Edge rendering rule: an edge is returned only when both endpoint nodes are `PUBLISHED`. `rubric_milestone` edges are derived through a shared requirement node (section 7.7, view `v_rubric_milestone_edges`).

#### 5.5.6 Checklist (T3) with own progress

```ts
interface ChecklistResponse {
  assignmentId: string;
  milestones: Array<{
    id: string; title: string; summary: string | null;
    displayOrder: number;
    publicationStatus: 'PUBLISHED';
    completionState: 'not_started' | 'in_progress' | 'completed';   // derived from items
    items: Array<{
      id: string; title: string; description: string | null;
      planningLevel: 'understand' | 'identify' | 'plan' | 'verify' | 'review' | 'note';
      displayOrder: number;
      state: 'not_started' | 'in_progress' | 'completed';
      startedAt: string | null;
      completedAt: string | null;
      elapsedSeconds: number | null;    // labelled "elapsed time" in the UI (D33)
    }>;
  }>;
  totals: { completed: number; total: number; resolutionRate: number };
}

interface ChecklistProgressResponse {
  itemId: string;
  state: 'not_started' | 'in_progress' | 'completed';
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number | null;
  totals: { completed: number; total: number; resolutionRate: number };
}
```

#### 5.5.7 AI Usage Policy (T2)

```ts
interface AiPolicyResponse {
  assignmentId: string;
  available: boolean;                                 // false = no approved rule is published (D47)
  publishedAt: string | null;
  truthTier: 'T2';
  rules: Array<{
    id: string;
    ruleCode: string;                                   // stable identifier, e.g. 'no_code_debugging'
    ruleText: string;                                   // tutor-approved wording, verbatim from the row
    effect: 'PROHIBIT' | 'ALLOW' | 'ESCALATE_TO_TUTOR' | 'CLARIFY';
    appliesTo: 'assistant' | 'uploads' | 'discussion' | 'all';
  }>;
}
```

`available = false` means no AI Usage Policy rule has been published for this assignment. Per D47 there is **no permissive fallback**: the guardrail returns `REFUSE` with reason code `POL_ABSENT` and the Assistant is presented as unavailable (see [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 4.7). Publish requires at least one approved rule (section 3.2 transition 7), so this state should be unreachable in practice; it exists because failing closed must be free.

#### 5.5.8 Tutor review bundle and artifact patching

```ts
// Ingestion status (tutor). The polling shape for the Postgres-backed job row that
// D60 makes the execution model: POST .../ingest enqueues and returns 202, and
// GET .../ingest polls this shape. `null` at the bundle level means no run has
// ever been requested. The job table and its stage enum are added by WP-04/WP-05
// (D60 builder note); this defines the response those routes return.
interface IngestionStatusResponse {
  jobId: string;
  assignmentId: string;
  status: ''queued'' | ''running'' | ''succeeded'' | ''failed'';
  stage: ''S0'' | ''S1'' | ''S2'' | ''S3'' | ''S4'' | ''S5'' | ''S6'' | ''S7'' | null;
  completedStages: number;      // S0-S7 = 8 stages today
  totalStages: number;
  startedAt: string;
  finishedAt: string | null;
  error: { code: string; message: string } | null;
}

interface ReviewBundleResponse {
  assignment: {
    id: string; title: string; status: AssignmentStatus;
    dueAt: string | null; currentStructureId: string | null;
  };
  ingestion: IngestionStatusResponse | null;
  sources: AssignmentSourceResponse[];
  counts: Record<PublicationStatus, number>;
  artifacts: Array<ReviewArtifactResponse>;
  ambiguityFindings: AmbiguityFindingResponse[];
  gates: {
    canIngest: boolean;
    canApprove: boolean;
    canPublish: boolean;
    publishBlockers: Array<'NO_POLICY_RULE_APPROVED' | 'NO_MILESTONE' | 'MILESTONE_WITHOUT_REQUIREMENT' | 'PENDING_VALIDATION_WARNINGS'>;
  };
}

interface ReviewArtifactResponse {
  id: string;
  kind: 'structure' | 'requirement_node' | 'rubric_section' | 'milestone'
      | 'checklist_item' | 'faq_entry' | 'ai_policy_rule';
  publicationStatus: PublicationStatus;
  truthTier: TruthTier;            // computed, section 2.2
  origin: 'ai' | 'tutor';
  provenance: {
    modelId: string | null; promptVersion: string | null;
    generatedAt: string; groundingChunkIds: string[];
  };
  revision: number;                // optimistic concurrency token
  payload: RequirementNodePayload | RubricSectionPayload | MilestonePayload
         | ChecklistItemPayload | FaqEntryPayload | AiPolicyRulePayload;
  validation: { ok: boolean; warnings: ValidationWarning[] };
}

interface ValidationWarning {
  code:
    | 'VERBATIM_MISMATCH'          // I-2: text is not a substring of the cited chunk
    | 'WEIGHT_NOT_FOUND'           // a rubric weight is not present in the source text
    | 'CHECKLIST_VERB_MISMATCH'    // O1: planning_level outside the allowed set
    | 'CHECKLIST_IMPERATIVE'       // D20: text names an implementation action
    | 'UNGROUNDED_ARTIFACT'        // no grounding chunk cited
    | 'OVERLAPPING_REQUIREMENT';   // two requirement nodes quote the same sentence
  message: string;
  sourceRef?: { sourceId: string; pageFrom: number; pageTo: number };
}

// PATCH /api/tutor/structure-artifacts/{artifactId}
interface StructureArtifactPatchRequest {
  expectedRevision: number;
  payload: Partial<RequirementNodePayload | RubricSectionPayload | MilestonePayload
                 | ChecklistItemPayload | FaqEntryPayload | AiPolicyRulePayload>;
  action: 'save' | 'approve' | 'reject';
  acknowledgeWarnings?: ValidationWarning['code'][];
}

interface RequirementNodePayload {
  title: string;
  verbatimText: string;        // immutable; a change is a new node
  mapSummary: string | null;   // editable, T5
  sourceChunkId: string;
  sourcePage: number | null;
  sourceSectionLabel: string | null;
  displayOrder: number;
}
```

`acknowledgeWarnings` is required to approve an artifact with warnings; the warnings stay attached to the artifact and appear in the audit row. A `VERBATIM_MISMATCH` cannot be acknowledged: it must be fixed or the node rejected (I-2).

#### 5.5.9 Assistant session, stream protocol, and refusal payload

```ts
interface AssistantSessionResponse {
  sessionId: string;
  assignmentId: string;
  messages: Array<
    | {
        id: string; role: 'student'; createdAt: string;
        body: string;
        verdict: GuardrailVerdict;
        reasonCode: string | null;
        policyRuleId: string | null;
        uploadIds: string[];
      }
    | {
        id: string; role: 'assistant'; createdAt: string;
        body: string;
        isProactive: boolean;
        citedTiers: TruthTier[];
        citations: AssistantCitation[];
      }
  >;
}

interface AssistantCitation {
  kind: 'source_chunk' | 'faq_entry' | 'milestone' | 'checklist_item' | 'requirement_node';
  id: string;
  label: string;                       // e.g. "Brief p.4, section 3.2"
  truthTier: TruthTier;
  deepLink: string | null;             // page link into the official viewer (D43)
}

// POST /api/student/assignments/{assignmentId}/assistant/messages request
interface AssistantRequest {
  body: string;                        // 1..4000 characters
  uploadIds?: string[];                // must all be guardrail_scan_status = 'clear'
  milestoneId?: string | null;         // optional focus, used for the proactive notice and citations
}

// SSE stream events, in this order. `guardrail` is always the first event.
// The payload is a transport projection of GuardrailDecision, which is owned by
// 05-AI-GUARDRAILS.md section 7.2. This doc does not redefine its field set.
// event: guardrail
interface GuardrailEvent {
  verdict: GuardrailVerdict;
  rules: string[];                     // cited rule ids, e.g. ['UP1','P5','DE5'] (05 section 3.2)
  reasonCode: string;                  // owned by 05: e.g. STUDENT_CODE_DIAGNOSIS_REQUESTED, POL_ABSENT
  deterministic: boolean;
  scope: 'SCOPE_LOCATE' | 'SCOPE_TERM' | 'SCOPE_RUBRIC' | 'SCOPE_POLICY' | 'SCOPE_PROGRESS' | null;
  clarifyingQuestion: string | null;
  policyRef: { policyId: string; version: number } | null;
  refusalTemplateId: 'T-REFUSE' | 'T-SCOPE' | 'T-CLARIFY' | 'T-ESCALATE' | null;
  citedTiers: TruthTier[];             // added by this layer: the tiers evaluated (R4)
  refusal: RefusalPayload | null;      // non-null for CLARIFY, REFUSE, ESCALATE_TO_TUTOR
}
// event: token        data: { text: string }             -- zero occurrences for a refusal
// event: citations    data: { citations: AssistantCitation[] }
// event: message      data: { messageId: string; createdAt: string }
// event: done         data: { usage: { inputTokens: number; outputTokens: number; latencyMs: number } }
// event: error        data: ApiErrorResponse['error']

interface RefusalPayload {
  verdict: 'CLARIFY' | 'REFUSE' | 'ESCALATE_TO_TUTOR';
  refusalTemplateId: 'T-REFUSE' | 'T-SCOPE' | 'T-CLARIFY' | 'T-ESCALATE';
  reasonCode: string;                  // 05's code, stored as assistant_messages.reason_code
  policyRuleId: string | null;         // ai_policy_rules.id, or null when no published rule applies
  policyRuleText: string | null;       // the tutor-approved rule, quoted; null only for POL_ABSENT
  whatICanHelpWith: string[];          // 2..4 items, from the approved policy and the fixed affordances
  escalation: { queryDraftUrl: string; milestoneId: string | null } | null;  // ESCALATE_TO_TUTOR only
  unavailable: boolean;               // true only for POL_ABSENT: the Assistant has no approved policy
}
```

`reasonCode` values are **not enumerated here**. [`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md) section 7.2 defines the field and section 3 defines the rule ids and codes (`STUDENT_CODE_DIAGNOSIS_REQUESTED` is the worked example there); this doc stores the string as `assistant_messages.reason_code` and `guardrail_logs.reason_code` and does not invent codes. Two codes matter to the interface: `POL_ABSENT` (no approved AI Usage Policy, D47) and `SCHEMA_VALIDATION_FAILED` (model output failed validation, D16).

Stream rules, each testable:

1. The `guardrail` event is emitted before any `token` event. A client that receives a `token` before a `guardrail` must treat the stream as corrupt and discard it.
2. A refusal emits `guardrail`, then `message`, then `done`, with zero `token` events.
3. A refusal never creates an `assistant_messages` row with `role = 'assistant'` unless `body` is non-empty; the refusal text is stored on the student's own message row as `reasonCode` plus the rendered refusal copy so the transcript is reproducible.
4. `ESCALATE_TO_TUTOR` never creates a Query. It returns a `queryDraftUrl`; creating the Query is a separate student action (D24 keeps the private thread student-initiated).
5. An upload with `guardrail_scan_status <> 'clear'` in `uploadIds` produces `VALIDATION_FAILED` (400) with `details.uploadIds`, not a partial send (C6, I-6).
6. When `LLM_OUTPUT_INVALID` occurs, the stream emits `error` with that code and the student row records verdict `REFUSE` and reason code `SCHEMA_VALIDATION_FAILED`. There is no retry until valid (D16).
7. When no approved AI Usage Policy rule exists, the verdict is `REFUSE` with reason code `POL_ABSENT`, `unavailable = true`, and no model call at all (D47). The client renders the unavailable state, not an empty-but-usable Assistant.

#### 5.5.10 Student uploads

```ts
interface StudentUploadResponse {
  id: string;
  kind: 'image' | 'pdf' | 'text';      // MVP modalities (O11); audio and video are refused at the picker
  mimeType: string;                    // image/png, image/jpeg, application/pdf, text/plain
  byteSize: number;
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'failed';
  guardrailScanStatus: 'pending' | 'clear' | 'blocked';
  guardrailReasonCode: string | null;
  createdAt: string;
}
```

The response never contains `storageKey`, the extracted text, or the original filename. The student sees a thumbnail or a document label generated from the upload id, and the refusal, when the scan blocked it. Audio and video are not selectable in the picker and the picker states that they are unavailable, rather than accepting a file and failing later (O11).

#### 5.5.11 Assignment Health (aggregate, k-anonymity floored)

```ts
interface AssignmentHealthResponse {
  assignmentId: string;
  window: { from: string; to: string };
  dataState: 'ready' | 'insufficient_data';
  headline: {
    enrolledCount: number;
    activeCount: number | null;              // null when < 5 (C5, D32)
    averageCompletionRate: number | null;
    potentialDifficultyAreaCount: number | null;
  };
  milestones: MilestoneMetricResponse[];
  potentialDifficultyAreas: Array<{
    milestoneId: string;
    milestoneTitle: string;
    reason: string;                          // evidence sentence, no prescription (D35)
    averageElapsedSeconds: number;
    questionCount: number;
    completionRate: number;
  }>;
  windowNote: string;                        // states the aggregation window in words
}

interface MilestoneMetricResponse {
  milestoneId: string;
  milestoneTitle: string;
  dataState: 'ready' | 'insufficient_data';
  contributorCount: number | null;
  startedCount: number | null;
  completedCount: number | null;
  completionRate: number | null;
  averageElapsedSeconds: number | null;
  medianElapsedSeconds: number | null;
  discussionPostCount: number | null;
  assistantTurnCount: number | null;   // metric M6, reported separately, never part of question volume (D49)
  questionCount: number | null;        // tutor-directed questions only (D49)
  difficultyScore: number | null;
}
```

Rules: when `dataState = 'insufficient_data'`, every metric field is `null` and the UI renders the glossary state **Insufficient data**. `questionCount` counts private Queries plus flagged discussion posts only; `assistantTurnCount` is the separate metric M6 (D49). No field in this response identifies a student, and no endpoint parameter selects one (A-ID-5, section 5.2 rule 4). `difficulty_score` is computed by the Insight Engine; its inputs and thresholds are owned by [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md).

#### 5.5.12 Queries (private threads)

```ts
interface QueryListResponse {
  items: Array<{
    id: string; subject: string | null; status: 'open' | 'answered' | 'resolved' | 'closed';
    milestoneId: string | null; createdAt: string; lastMessageAt: string | null;
    messageCount: number; hasTutorReply: boolean;
  }>;
}

interface QueryThreadResponse {
  id: string;
  assignmentId: string;
  subject: string | null;
  milestoneId: string | null;
  status: 'open' | 'answered' | 'resolved' | 'closed';
  createdAt: string;
  resolvedAt: string | null;
  messages: Array<{
    id: string; authorRole: 'student' | 'tutor'; authorDisplayName: string;
    body: string; createdAt: string;
    publishedAsFaqEntryId: string | null;    // set when a reply became an official FAQ entry (D24)
  }>;
}

interface TutorQueryGroupListResponse {
  grouping: 'milestone';                     // topic clustering is out of scope in the MVP (02 section 2.4)
  items: Array<{
    groupKey: string;
    label: string;                           // the approved Milestone title (T3)
    labelSource: 'milestone';
    truthTier: 'T3';
    queryCount: number;
    openCount: number;
    queries: QueryListResponse['items'];
  }>;
}
```

A tutor sees the asking student's display name on a Query thread: a private Query is **always attributed** (D24, D50). A student may be anonymous in a Discussion thread, never in a Query. Grouping is by approved Milestone; the AI topic-label treatment is not used in the MVP because topic clustering is out of scope (see section 10). Query threads carry no attachments in the MVP (02 section 5).

#### 5.5.13 Discussions

```ts
interface StudentDiscussionResponse {
  officialFaq: FaqEntryListResponse['items'];      // T2
  threads: DiscussionThreadResponse[];
}

interface DiscussionThreadResponse {
  id: string;
  title: string;
  milestoneId: string | null;
  status: 'open' | 'locked' | 'removed';
  postCount: number;
  lastPostAt: string | null;
  createdAt: string;
  author: { isAnonymised: boolean; displayLabel: string };   // A-ID-5
  isOwnThread: boolean;                                       // students only, resolved server-side
  posts: DiscussionPostResponse[];
}

interface DiscussionPostResponse {
  id: string;
  parentPostId: string | null;
  body: string;
  status: 'visible' | 'hidden_pending_review' | 'removed';
  acceptedAnswerStatus: 'none' | 'proposed' | 'approved' | 'rejected';
  author: { isAnonymised: boolean; displayLabel: string };
  createdAt: string;
  editedAt: string | null;
  isOwnPost: boolean;                                          // students only
  editedByModerator: boolean;                                  // tutors only
}

interface TutorDiscussionResponse {
  officialFaq: FaqEntryListResponse['items'];
  threads: DiscussionThreadResponse[];
  moderationQueue: ModerationFlagResponse[];                   // no reporter identity (4.4)
}
```

`body` is omitted (null) for a post with `status = 'hidden_pending_review'` when the caller is a student other than the author; the row shows "Hidden pending tutor review".

#### 5.5.14 Moderation flag

```ts
interface ModerationFlagResponse {
  id: string;
  targetKind: 'discussion_post' | 'query_message';
  targetId: string;
  source: 'ai' | 'student';
  severity: 'low' | 'medium' | 'high';
  reasonCode: 'HARASSMENT' | 'INAPPROPRIATE_CONTENT' | 'PERSONAL_INFORMATION'
            | 'PROHIBITED_ASSISTANCE' | 'SOLUTION_SHARING' | 'OTHER';
  status: 'open' | 'upheld' | 'dismissed';
  createdAt: string;
  reviewedAt: string | null;
}
```

The reporter is never named in a response (A-ID-5), and a student never sees a flag count (D30, O3).

### 5.6 Request limits

| Limit | Value | Enforced where | Error |
|---|---|---|---|
| Login attempts | 10 per IP per 10 minutes | Route handler, before the password comparison | `RATE_LIMITED` |
| Assistant requests | `LLM_MAX_CALLS_PER_SESSION` (12) per assistant session, plus 30 per hour per student | Guardrail pre-check; the counter is `assistant_sessions.llm_call_count` | `RATE_LIMITED` |
| Upload size | `UPLOAD_MAX_BYTES` (25 MiB) | Route handler before the storage write | `PAYLOAD_TOO_LARGE` |
| Tutor source files | 10 per assignment | Route handler | `VALIDATION_FAILED` |
| Student uploads per request | 5 | Request validation | `VALIDATION_FAILED` |
| `assistant_messages.body` | 4000 characters | Request validation | `VALIDATION_FAILED` |
| `discussion_posts.body` | 4000 characters | Request validation | `VALIDATION_FAILED` |
| `query_messages.body` | 8000 characters | Request validation | `VALIDATION_FAILED` |
| Discussion threads per assignment per student | 20 per hour | Route handler | `RATE_LIMITED` |

### 5.7 Logging rules at the API boundary

Implements C7, D15, and AGENTS section 6.5.

| Must be logged | Must never be logged |
|---|---|
| `requestId`, method, path template, status, duration | Session cookie value or `Authorization` header |
| Session user id and role, for tutor actions | Any student content: message bodies, post bodies, upload text, extracted document text |
| Guardrail verdict, reason code, cited policy rule id, prompt version | Secrets, `ANON_ID_SECRET`, `AUTH_SECRET`, provider API keys |
| Storage writes by key only | `storage_key` values in user-facing errors |
| Rate-limit events with the counter name | IP addresses in application logs beyond the rate limiter's own bucket key |

`guardrail_logs` is the durable form of the guardrail row; it stores no request or response text (section 7.6.2). A log line that needs a student's text to be useful is a defect, because the audit trail already lives in the row.

---

## 6. Database conventions

Postgres (D37). A typed query layer issues SQL; migrations are files in the repository and hand-edited databases are not a workflow (AGENTS section 5.3).

### 6.1 Naming

| Object | Convention | Example |
|---|---|---|
| Table | `snake_case`, plural | `assignment_sources` |
| Column | `snake_case`, singular | `publication_status` |
| Primary key | `id` | `id` |
| Foreign key | `<singular_referenced_table>_id` | `assignment_id` |
| Boolean | `is_` or a past participle | `is_current`, `is_anonymised`, `archived_at` |
| Timestamp | `_at` suffix, `timestamptz` | `published_at` |
| Duration in seconds | `_seconds` suffix, `integer` | `elapsed_seconds` |
| Rate | `_rate` suffix, `numeric` in `0..1` | `resolution_rate` |
| Enum-like | `text` + CHECK (6.3) | `status`, `publication_status` |
| Index | `idx_<table>_<columns>` | `idx_analytics_events_assignment_occurred` |
| Unique index | `uq_<table>_<columns>` | `uq_anon_identities_assignment_display_number` |
| Check constraint | `ck_<table>_<meaning>` | `ck_checklist_items_planning_level` |
| Foreign key | `fk_<table>_<referenced_table>` | `fk_sources_assignments` |
| View | `v_<purpose>` or a noun phrase describing what it exposes | `discussion_author_display` |
| Migration file | `NNNN_<short_description>.sql`, zero-padded, forward-only | `0007_add_ai_policy_rules.sql` |

### 6.2 Standard columns on every table

```sql
id          uuid primary key default gen_random_uuid(),
created_at  timestamptz not null default now(),
updated_at  timestamptz not null default now()
```

Rules:

1. `gen_random_uuid()` requires Postgres 13 or the `pgcrypto` extension. The first migration enables `pgcrypto` if the server is older than 13.
2. `updated_at` is set by the query layer on every UPDATE. A `set_updated_at()` trigger is added as a belt-and-braces measure for manual SQL.
3. `created_at` is never updated and never null.
4. Append-only tables (`analytics_events`, `guardrail_logs`, `audit_logs`) carry `updated_at` for uniformity and are never updated by application code.
5. No table uses a natural key as its primary key. `users.email` and `anon_identities.display_number` are unique but not primary.

### 6.3 Enum representation

Lifecycle states, verdicts, roles, and statuses are `text` columns with a named CHECK constraint, not Postgres `enum` types.

```sql
publication_status text not null default 'AI_GENERATED'
  constraint ck_publication_status check (publication_status in
    ('AI_GENERATED','NEEDS_REVIEW','EDITED','APPROVED','PUBLISHED','REJECTED'))
```

Rationale: adding a value is a one-line migration that replaces a CHECK; removing a value from a Postgres `enum` requires type surgery that is awkward to reverse during a 48-hour build. The values are frozen in this doc, so the looser mechanism costs nothing in contract clarity.

### 6.4 Foreign keys and delete behaviour

| Rule | Detail |
|---|---|
| Default | `ON DELETE RESTRICT`. Rows are removed deliberately, never as a side effect. |
| Exception 1 | Child rows owned entirely by a parent that is deleted before publish: `source_chunks` (owned by `assignment_sources`). This may be `ON DELETE CASCADE`, and only this. |
| Exception 2 | Nothing cascades from `users`, `courses`, or `assignments`. Deleting a user is out of scope for the MVP and would break the audit trail. |
| Composite integrity | Structure-scoped artifact tables carry both `structure_id` and `assignment_id`, with a composite FK `(structure_id, assignment_id) references assignment_structures (id, assignment_id)`, so an artifact cannot be attached to a structure of a different assignment. This requires `unique (id, assignment_id)` on `assignment_structures`. |
| Self-references | `requirement_nodes.parent_requirement_node_id` and `discussion_posts.parent_post_id` reference their own table with `ON DELETE RESTRICT` and a CHECK preventing self-reference. |
| Nullable FKs | A nullable FK means "not linked", never "unknown". Where the link is required for the row to mean anything, the constraint is `not null`. |
| Cross-class FKs | No FK may exist from an identity-free table (section 4.6) to an identity-bearing or pseudonymous table. This is invariant A-ID-6 and is checked in the schema review. |

### 6.5 Soft delete

| Table | Mechanism | Why |
|---|---|---|
| `discussion_posts`, `discussion_threads` | `deleted_at timestamptz` | A student deletes their own post (D28); the moderation and audit history must survive. Reads filter `deleted_at is null` except the moderator queue. |
| `assignment_sources` | `deleted_at timestamptz` | A tutor removes a file before publish. Chunks are deleted with it only while the assignment is not published. |
| `milestones`, `checklist_items`, `faq_entries` | `deleted_at timestamptz` | Student progress references items; a hard delete would orphan progress. |
| `anon_identities` | Not deleted. Ever. | Section 4.3 rule 1. |
| Everything else | No soft delete; use a `status` value (`REJECTED`, `archived`, `removed`). | Two mechanisms for the same idea is one too many. |

### 6.6 Indexes

Every index below exists for a stated query shape. No speculative indexes.

```sql
-- Authentication and enrolment lookups
uq_users_email                     unique (lower(email))
uq_enrollments_course_user         unique (course_id, user_id)
idx_enrollments_user               (user_id, role_in_course)

-- Assignment and source retrieval
idx_assignments_course_status      (course_id, status)
uq_assignment_structures_current   unique (assignment_id) where is_current
uq_assignment_structures_version   unique (assignment_id, version)
uq_structures_id_assignment        unique (id, assignment_id)
idx_assignment_sources_assignment  (assignment_id) where deleted_at is null
idx_source_chunks_source           (source_id, chunk_index)
idx_source_chunks_search_tsv        using gin (search_tsv)

-- Structure artifacts reviewed per assignment
idx_requirement_nodes_structure    (structure_id, display_order)
idx_rubric_sections_structure      (structure_id, display_order)
idx_milestones_structure           (structure_id, display_order) where deleted_at is null
idx_checklist_items_milestone      (milestone_id, display_order) where deleted_at is null
idx_ai_policy_rules_assignment     (assignment_id, publication_status)
idx_ambiguity_findings_assignment  (assignment_id, status)

-- Student work
uq_student_assignments             unique (assignment_id, student_id)
uq_progress_student_item           unique (student_assignment_id, checklist_item_id)
uq_assistant_sessions              unique (student_id, assignment_id)
idx_assistant_messages_session     (session_id, created_at)
uq_proactive_messages_item      unique (student_assignment_id, milestone_id)
idx_student_uploads_student        (student_id, assignment_id)

-- Communication
idx_queries_assignment_status      (assignment_id, status, last_message_at desc)
idx_query_messages_query           (query_id, created_at)
uq_faq_entries_display_order       unique (assignment_id, display_order) where deleted_at is null and publication_status = 'PUBLISHED'

-- Discussions
idx_discussion_threads_assignment  (assignment_id, last_post_at desc)
idx_discussion_posts_thread        (thread_id, created_at)
uq_moderation_flags_student_flag   unique (target_kind, target_id, reporter_anon_identity_id)
                                   where source = 'student'
idx_moderation_flags_queue         (assignment_id, status, severity)

-- Analytics and audit
idx_analytics_events_assignment    (assignment_id, milestone_id, occurred_at)
uq_milestone_metrics_window        unique (milestone_id, window_start, window_end)
uq_assignment_metrics_window       unique (assignment_id, window_start, window_end)
idx_guardrail_logs_assignment      (assignment_id, created_at)
idx_audit_logs_target              (target_table, target_id, created_at)
```

### 6.7 Migrations

1. Forward-only. A mistake is corrected by the next migration, not by an edit to a shipped one.
2. One logical change per file, and the change is reflected in this doc in the same commit (AGENTS section 4.3).
3. Destructive statements (`drop column`, `drop table`, narrowing a CHECK) require a note in the migration header explaining what was removed and why.
4. A migration that adds a table in one of the three privacy classes (section 4.6) must state the class in a SQL comment, because the class determines which modules may read it.

### 6.8 Retrieval

D38: retrieval starts as Postgres full-text search over `source_chunks`, with no separate vector database.

1. `source_chunks.search_tsv` is a stored generated column: `to_tsvector('english', text)`. Ingestion never writes it.
2. Chunking is page-anchored: `page_from`, `page_to`, and `section_label` come from the extractor, and `chunk_index` is per source and contiguous.
3. A retrieval hit returns the chunk text plus its page anchor, which is what makes R4 citations and D43 deep links possible.
4. `source_chunks.embedding` (`vector(1536)`) is **not** created by the base migration. It is added by an optional migration when the embedding upgrade is enabled, behind the same interface, and the retrieval path must work with the column absent.

### 6.9 Object storage

D41: local filesystem driver by default, S3-compatible driver behind the same interface.

1. The database stores `storage_key` (opaque, driver-relative) and never a URL.
2. `storage_key` is never returned by an API (I-7). Downloads go through a route that checks authorization and then streams.
3. Files are written before the row is inserted; a failed insert leaves an orphan and the cleanup job removes keys with no row.
4. A content hash (`content_hash`) is stored for `assignment_sources` so a re-upload of the same file is detected and offered as a duplicate rather than analysed twice.

### 6.10 Fixtures and demo data

D45: `archive/canvas-scraper/` is never imported by `app/`. D46: the demo inputs themselves - the text-layer brief PDF, the rubric, the AI-use policy document, and the cohort seed - live in `docs/fixtures/` (created by WP-02 in [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md)) and are committed, because a real text layer is what makes page anchors real. A seed fixture:

1. Contains no real student name, email, or Canvas identifier. Demo accounts are created with synthetic names, and no real student data exists anywhere in this project.
2. Runs through the same `publication_status` transitions as production data. There is no "internal testing" bypass for tutor approval (rejected-list item in `01-DECISIONS.md` section H).
3. Contains no secret and no value copied from `.env`.
4. Is deterministic: the same seed script produces the same cohort on any machine, and the interactive demo accounts are a small set (one tutor, one student) while the analytics cohort is synthetic and larger ([`02-SCOPE.md`](02-SCOPE.md) section 5).
5. Produces at least one milestone with fewer than 5 contributors and one at or above 5, so both the **Insufficient data** state and a real metric are demonstrable in the same demo run.
6. Is labelled in the interface: every analytics surface carries a visible demo-data marker ([`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 8), because the aggregation is real code over synthetic data and the presenter must be able to say so.

### 6.11 Provenance encoding

```sql
origin                text not null default 'ai'
                        constraint ck_origin check (origin in ('ai','tutor')),
provenance            jsonb
                        constraint ck_provenance_shape check (
                          origin <> 'ai' or (
                            provenance is not null
                            and provenance ? 'modelId'
                            and provenance ? 'promptVersion'
                            and provenance ? 'generatedAt'
                          )),
grounding_chunk_ids   uuid[] not null default '{}'
```

```json
{
  "modelId": "gemini-3.8-flash",
  "promptVersion": "ingest-structure@3",
  "generatedAt": "2026-10-03T05:12:00.000Z",
  "groundingChunkIds": ["0f5a...", "91c2..."]
}
```

`groundingChunkIds` appears both inside the provenance object and as the indexed `grounding_chunk_ids` column; the column is the queryable copy, the object is the payload that survives export. Provenance is retained through every status transition, including `REJECTED` (D22).

### 6.12 Time and elapsed time

1. All timestamps are `timestamptz` in UTC. The application never stores local time.
2. `elapsed_seconds` on `student_checklist_progress` is `completed_at - started_at` and **idle time counts** (D33). It is always labelled "elapsed time" in the UI, never "time worked" or "time on task".
3. Elapsed time is the first start-to-complete interval (D48). Reopening a completed item increments `reopen_count` and changes `last_state_changed_at`; it does not extend `elapsed_seconds`, and a later completion does not overwrite the first interval. Recording is intentionally simple; a reopen history table is out of scope.

---

## 7. Entities

**Standard columns.** Every table in this section also has `id`, `created_at`, and `updated_at` exactly as defined in section 6.2. The tables below list every other column. Where a column is itself `created_at`-like (for example `published_at`) it is listed explicitly.

**Conventions in the tables.** `FK` means a foreign key per section 6.4 unless a delete rule is stated. `class` refers to the privacy class in section 4.6. A `CHECK` listed in the Constraints column is a named constraint, not prose.

### 7.1 Identity and access

#### 7.1.1 `users`

Purpose: one human account, either a student or a tutor (glossary: no other kind exists in the MVP). Class: identity-bearing.

| Column | Type | Constraints |
|---|---|---|
| `email` | text | not null; `UNIQUE (lower(email))`; `CHECK (email = lower(email))`; length <= 320 |
| `display_name` | text | not null; `CHECK (length(display_name) between 1 and 120)`; shown to tutors on a private Query thread |
| `password_hash` | text | not null; argon2id; never selected by any query outside the auth module; never serialised (I-7) |
| `role` | text | not null; `CHECK (role in ('student','tutor'))` |
| `is_active` | boolean | not null default true; a false value fails login with `UNAUTHENTICATED` |
| `last_login_at` | timestamptz | null |

Invariants: `display_name` is a real name for a tutor and a synthetic demo name for a seeded student. It is never rendered next to an anonymous post (A-ID-3).

#### 7.1.2 `courses`

Purpose: the university subject that groups assignments and enrollments. Class: identity-free.

| Column | Type | Constraints |
|---|---|---|
| `code` | text | not null; unique; length <= 32; e.g. `COSC1234` |
| `title` | text | not null; length <= 200 |
| `term` | text | not null; length <= 40; e.g. `2026-S2` |
| `created_by_user_id` | uuid | null; FK `users (id)` |

#### 7.1.3 `enrollments`

Purpose: the access-control join between a user and a course. Class: identity-bearing.

| Column | Type | Constraints |
|---|---|---|
| `course_id` | uuid | not null; FK `courses (id)` |
| `user_id` | uuid | not null; FK `users (id)` |
| `role_in_course` | text | not null; `CHECK (role_in_course in ('student','tutor'))`; must equal `users.role` for the same user (checked by the query layer; a trigger is optional) |
| `is_owner` | boolean | not null default false; present for O4, displayed nowhere, grants nothing (section 3.5 rule 2) |

Invariants: `UNIQUE (course_id, user_id)`. Every authorization check in section 5.2 resolves through this table.

### 7.2 Assignment definition

#### 7.2.1 `assignments`

Purpose: the central object (D1). Class: identity-free.

| Column | Type | Constraints |
|---|---|---|
| `course_id` | uuid | not null; FK `courses (id)` |
| `title` | text | not null; `CHECK (length(title) between 1 and 200)` |
| `status` | text | not null default `'draft'`; `CHECK (status in ('draft','ingesting','in_review','published','archived'))` |
| `due_at` | timestamptz | null |
| `created_by_user_id` | uuid | not null; FK `users (id)` |
| `current_structure_id` | uuid | null; FK `assignment_structures (id)`; maintained alongside `is_current` |
| `published_at` | timestamptz | null; `CHECK (status <> 'published' or published_at is not null)` |
| `archived_at` | timestamptz | null; `CHECK (status <> 'archived' or archived_at is not null)` |

Invariants: `status` and `publication_status` are never interchangeable (section 3.6). A student read requires `status = 'published'` (G1).

#### 7.2.2 `assignment_sources`

Purpose: a tutor-uploaded source document; T1 material. Class: identity-free (uploader is a tutor, not a student; the tutor's own name is not analytics data).

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `uploaded_by_user_id` | uuid | not null; FK `users (id)` |
| `kind` | text | not null; `CHECK (kind in ('brief','rubric','ai_policy','marking_guide','supplementary'))` |
| `original_filename` | text | not null; length <= 255; displayed to the tutor only |
| `storage_key` | text | not null; unique; never returned by an API (I-7) |
| `mime_type` | text | not null; must be in the supported set for tutor uploads (O5): `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `...presentationml.presentation`, `image/png`, `image/jpeg` |
| `byte_size` | bigint | not null; `CHECK (byte_size > 0 and byte_size <= 26214400)` |
| `page_count` | integer | null; `CHECK (page_count is null or page_count >= 0)` |
| `content_hash` | text | not null; `CHECK (length(content_hash) = 64)`; SHA-256 of the stored bytes, used for duplicate detection |
| `extraction_status` | text | not null default `'pending'`; `CHECK (extraction_status in ('pending','extracting','extracted','failed'))` |
| `extraction_error` | text | null; length <= 500; a message safe to show a tutor, never a stack trace |
| `deleted_at` | timestamptz | null |

Invariants: at least one source with `kind = 'brief'` is required before publish. Supported formats and rejection behaviour are O5: an unsupported type is refused at upload with `UNSUPPORTED_FORMAT`, never silently accepted.

#### 7.2.3 `source_chunks`

Purpose: a retrieved, page-located fragment of a T1 document; the grounding unit for every AI artifact and every citation. Class: identity-free.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `source_id` | uuid | not null; FK `assignment_sources (id)` `ON DELETE CASCADE` |
| `chunk_index` | integer | not null; `CHECK (chunk_index >= 0)`; `UNIQUE (source_id, chunk_index)` |
| `text` | text | not null; `CHECK (length(text) > 0)`; verbatim extract, never rewritten |
| `page_from` | integer | null; `CHECK (page_from is null or page_from >= 1)` |
| `page_to` | integer | null; `CHECK (page_to is null or page_from is null or page_to >= page_from)` |
| `section_label` | text | null; length <= 200; the document's own heading text where the extractor found one |
| `char_count` | integer | not null; `CHECK (char_count > 0)` |
| `search_tsv` | tsvector | generated always as `to_tsvector('english', text)` stored; the name matches [`04-TECH-ARCHITECTURE.md`](04-TECH-ARCHITECTURE.md) section 6 |
| `embedding` | vector(1536) | **not present** in the base migration; added by the optional migration in 6.8 |

Invariants: this table is the only source of T1 text for the Map and for citations. Every `requirement_nodes.verbatim_text` must be a substring of the `text` of the chunk it cites (I-2, R2).

#### 7.2.4 `assignment_structures`

Purpose: one ingestion output version; the container every AI artifact hangs from. Class: identity-free. Tier: T5 while unapproved.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `version` | integer | not null; `CHECK (version >= 1)`; `UNIQUE (assignment_id, version)` |
| `is_current` | boolean | not null default false; partial unique index `UNIQUE (assignment_id) WHERE is_current` |
| `publication_status` | text | not null default `'AI_GENERATED'`; CHECK per 6.3 |
| `origin` | text | not null default `'ai'`; `CHECK (origin in ('ai','tutor'))` |
| `provenance` | jsonb | per 6.11 |
| `grounding_chunk_ids` | uuid[] | not null default `'{}'` |
| `approved_by_user_id` | uuid | null; FK `users (id)`; `CHECK (publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null)` |
| `approved_at` | timestamptz | null; same CHECK shape as above |
| `published_at` | timestamptz | null; `CHECK (publication_status <> 'PUBLISHED' or published_at is not null)` |

Invariants: `UNIQUE (id, assignment_id)` exists so child tables can hold a composite FK (6.4). Exactly one current structure per assignment (section 3.3).

#### 7.2.5 `requirement_nodes`

Purpose: an Assignment Map node of kind Requirement; the verbatim anchor that all other Map edges hang from (glossary: Requirement). Class: identity-free. Tier: `verbatim_text` is T1, `mapSummary` is T5.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; composite FK `(structure_id, assignment_id)` |
| `structure_id` | uuid | not null; FK `assignment_structures (id)` |
| `parent_requirement_node_id` | uuid | null; FK self; `CHECK (parent_requirement_node_id is null or parent_requirement_node_id <> id)` |
| `title` | text | not null; length <= 200; a label, not the requirement text |
| `verbatim_text` | text | not null; `CHECK (length(verbatim_text) between 1 and 2000)`; **immutable after insert** (`IMMUTABLE_FIELD` on PATCH); must be a substring of the cited chunk text (I-2) |
| `source_chunk_id` | uuid | not null; FK `source_chunks (id)` |
| `source_page` | integer | null; `CHECK (source_page is null or source_page >= 1)` |
| `source_section_label` | text | null; length <= 200 |
| `map_summary` | text | null; length <= 600; AI interpretation, T5, rendered only in the Map surface |
| `display_order` | integer | not null; `CHECK (display_order >= 0)`; `UNIQUE (structure_id, display_order)` |
| `publication_status` | text | not null default `'AI_GENERATED'`; CHECK per 6.3 |
| `origin` | text | not null default `'ai'`; `CHECK (origin in ('ai','tutor'))` |
| `provenance` | jsonb | per 6.11 |
| `grounding_chunk_ids` | uuid[] | not null default `'{}'` |
| `approved_by_user_id` | uuid | null; FK `users (id)` |
| `approved_at`, `published_at` | timestamptz | null; CHECKs per 7.2.4 |

#### 7.2.6 `rubric_sections`

Purpose: one official marking criterion with its weighting; T1 text plus an optional T5 interpretation. Class: identity-free.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; composite FK `(structure_id, assignment_id)` |
| `structure_id` | uuid | not null; FK `assignment_structures (id)` |
| `source_chunk_id` | uuid | not null; FK `source_chunks (id)` |
| `section_label` | text | not null; length <= 200; the document's own label |
| `criteria_text` | text | not null; length <= 4000; verbatim; immutable; substring check as I-2 |
| `weight_percent` | numeric(5,2) | null; `CHECK (weight_percent is null or (weight_percent >= 0 and weight_percent <= 100))`; when present the number must appear in the cited chunk text, else the artifact stays `NEEDS_REVIEW` with warning `WEIGHT_NOT_FOUND` |
| `page_from`, `page_to` | integer | null; same CHECK shape as `source_chunks` |
| `map_interpretation` | text | null; length <= 600; T5, Map surface only |
| `display_order` | integer | not null; `UNIQUE (structure_id, display_order)` |
| `publication_status`, `origin`, `provenance`, `grounding_chunk_ids`, `approved_by_user_id`, `approved_at`, `published_at` | - | as in 7.2.5 |

#### 7.2.7 `requirement_rubric_links`

Purpose: an Assignment Map edge from a Requirement to a Rubric section, AI-proposed or tutor-drawn. Class: identity-free. No `publication_status`: an edge is rendered only when both endpoints are `PUBLISHED` (section 5.5.5).

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `requirement_node_id` | uuid | not null; FK `requirement_nodes (id)` |
| `rubric_section_id` | uuid | not null; FK `rubric_sections (id)` |
| `created_by_user_id` | uuid | null; FK `users (id)`; null means AI-proposed |

Invariants: `UNIQUE (requirement_node_id, rubric_section_id)`.

#### 7.2.8 `milestone_requirement_links`

Purpose: an Assignment Map edge from a Requirement to a Milestone. Class: identity-free.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `requirement_node_id` | uuid | not null; FK `requirement_nodes (id)` |
| `milestone_id` | uuid | not null; FK `milestones (id)` |
| `created_by_user_id` | uuid | null; FK `users (id)`; null means AI-proposed |

Invariants: `UNIQUE (milestone_id, requirement_node_id)`. Every milestone has at least one requirement link before publish; a milestone with none is the publish blocker `MILESTONE_WITHOUT_REQUIREMENT` shown in the review bundle.

#### 7.2.9 `milestones`

Purpose: a larger conceptual stage of work (glossary: Milestone). Class: identity-free. Tier: T3 once published.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; composite FK `(structure_id, assignment_id)` |
| `structure_id` | uuid | not null; FK `assignment_structures (id)` |
| `title` | text | not null; length <= 160 |
| `summary` | text | null; length <= 600 |
| `display_order` | integer | not null; `CHECK (display_order >= 0)`; `UNIQUE (structure_id, display_order) WHERE deleted_at IS NULL` |
| `publication_status`, `origin`, `provenance`, `grounding_chunk_ids`, `approved_by_user_id`, `approved_at`, `published_at` | - | as in 7.2.5 |
| `deleted_at` | timestamptz | null |

Volume guidance (O1): 3 to 6 milestones per assignment. The validator warns above 6.

#### 7.2.10 `checklist_items`

Purpose: a granular, self-checkable progress item under a Milestone (glossary: Checklist item). Class: identity-free. Tier: T3 once published.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; composite FK `(structure_id, assignment_id)` |
| `structure_id` | uuid | not null; FK `assignment_structures (id)` |
| `milestone_id` | uuid | not null; FK `milestones (id)` |
| `title` | text | not null; `CHECK (length(title) between 3 and 160)` |
| `planning_level` | text | not null; `CHECK (planning_level in ('understand','identify','plan','verify','review','note'))` (O1) |
| `description` | text | null; length <= 600 |
| `display_order` | integer | not null; `UNIQUE (milestone_id, display_order) WHERE deleted_at IS NULL` |
| `publication_status`, `origin`, `provenance`, `grounding_chunk_ids`, `approved_by_user_id`, `approved_at`, `published_at` | - | as in 7.2.5 |
| `deleted_at` | timestamptz | null |

Invariants (D20, O1):

1. 3 to 6 items per milestone; the validator warns outside that range.
2. The validator rejects a title whose first word is not one of the six `planning_level` verbs and rejects any title containing an implementation-action verb (`implement`, `build`, `write`, `code`, `design`, `deploy`, `fix`, `debug`, `solve`). A rejected item is refused with warning `CHECKLIST_IMPERATIVE` and cannot be approved until fixed or rejected.
3. **Documented supersession.** [`docs/assignment_assistant_project_handoff.md`](assignment_assistant_project_handoff.md) section 11 shows example items including "Implement endpoints". D20 and O1 supersede that example: an item naming an implementation action is not a valid Checklist item. This doc and [`03-PRD.md`](03-PRD.md) record the supersession so nobody implements the old example.

#### 7.2.11 `ai_policy_rules`

Purpose: one rule of the assignment-specific AI Usage Policy (D9). Class: identity-free. Tier: T2 once published, T5 before.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; composite FK `(structure_id, assignment_id)` |
| `structure_id` | uuid | not null; FK `assignment_structures (id)` |
| `rule_code` | text | not null; `CHECK (rule_code ~ '^[a-z][a-z0-9_]{2,63}$')`; `UNIQUE (structure_id, rule_code)`; e.g. `no_code_debugging` |
| `rule_text` | text | not null; `CHECK (length(rule_text) between 10 and 600)`; tutor-approved wording; quoted verbatim in a refusal |
| `effect` | text | not null; `CHECK (effect in ('PROHIBIT','ALLOW','ESCALATE_TO_TUTOR','CLARIFY'))` |
| `applies_to` | text | not null; `CHECK (applies_to in ('assistant','uploads','discussion','all'))` |
| `source_chunk_id` | uuid | null; FK `source_chunks (id)`; the clause the rule was extracted from |
| `display_order` | integer | not null |
| `publication_status`, `origin`, `provenance`, `grounding_chunk_ids`, `approved_by_user_id`, `approved_at`, `published_at` | - | as in 7.2.5 |

Invariants: publish requires at least one `APPROVED` rule (section 3.2 transition 7). The guardrail reads only `PUBLISHED` rules; with none published it returns `REFUSE` with reason code `POL_ABSENT` and the Assistant is unavailable (D47). There is no permissive platform default. This should be unreachable in practice, because a student only sees a published assignment and publish requires an approved rule.

#### 7.2.12 `ambiguity_findings`

Purpose: a potential ambiguity or contradiction the Assignment Analyst located during ingestion. Class: identity-free. Tier: T5, tutor-facing only.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `structure_id` | uuid | not null; FK `assignment_structures (id)` |
| `source_id` | uuid | null; FK `assignment_sources (id)` |
| `kind` | text | not null; `CHECK (kind in ('ambiguity','contradiction'))` |
| `severity` | text | not null; `CHECK (severity in ('low','medium','high'))` |
| `title` | text | not null; length <= 200 |
| `description` | text | not null; length <= 1000; states what is unclear and where, in plain language |
| `located_page` | integer | null; `CHECK (located_page is null or located_page >= 1)` |
| `located_section_label` | text | null; length <= 200 |
| `excerpt_a` | text | not null; length <= 500; verbatim quote of the first location |
| `excerpt_b` | text | null; length <= 500; `CHECK (kind <> 'contradiction' or excerpt_b is not null)`; verbatim quote of the conflicting location |
| `source_chunk_ids` | uuid[] | not null; `CHECK (array_length(source_chunk_ids, 1) >= 1)` |
| `status` | text | not null default `'open'`; `CHECK (status in ('open','acknowledged','resolved_by_clarification','dismissed'))` |
| `resolution_faq_entry_id` | uuid | null; FK `faq_entries (id)`; `CHECK (status <> 'resolved_by_clarification' or resolution_faq_entry_id is not null)` |
| `resolved_by_user_id` | uuid | null; FK `users (id)` |
| `resolved_at` | timestamptz | null |
| `origin` | text | not null default `'ai'`; `CHECK (origin = 'ai')` |
| `provenance` | jsonb | per 6.11 |

Invariants (D23, C2): there is **no** `proposed_clarification` column and there must never be one. The system detects and locates; the tutor authors the clarification, and the only way a finding closes as resolved is by linking to a FAQ entry the tutor published. A finding is never student-visible, at any status.

### 7.3 Student work

#### 7.3.1 `student_assignments`

Purpose: the per-student rollup for one assignment; the student's own view of their progress. Class: identity-bearing, student-facing only (never read by a tutor endpoint).

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `student_id` | uuid | not null; FK `users (id)` |
| `first_opened_at` | timestamptz | null |
| `last_activity_at` | timestamptz | null |
| `completed_item_count` | integer | not null default 0; `CHECK (completed_item_count >= 0)` |
| `total_item_count` | integer | not null default 0; `CHECK (total_item_count >= 0)` |
| `resolution_rate` | numeric(5,4) | not null default 0; `CHECK (resolution_rate between 0 and 1)`; glossary: Resolution rate |

Invariants: `UNIQUE (assignment_id, student_id)`. `total_item_count` counts published Checklist items of the current structure. The row is created on first open, not on enrolment.

#### 7.3.2 `student_checklist_progress`

Purpose: per-student state and elapsed time for one Checklist item. Class: identity-bearing, student-facing only. Source of the student's own progress display and of the events in 7.6.1.

| Column | Type | Constraints |
|---|---|---|
| `student_assignment_id` | uuid | not null; FK `student_assignments (id)` |
| `student_id` | uuid | not null; FK `users (id)`; denormalised for the API's ownership filter; must equal the parent's `student_id` (enforced in the query layer) |
| `checklist_item_id` | uuid | not null; FK `checklist_items (id)` |
| `state` | text | not null default `'not_started'`; `CHECK (state in ('not_started','in_progress','completed'))` |
| `started_at` | timestamptz | null; the first start, immutable once set |
| `completed_at` | timestamptz | null; the **first** completion (D48), immutable once set |
| `elapsed_seconds` | integer | null; `CHECK (elapsed_seconds is null or elapsed_seconds >= 0)`; the first start-to-complete interval (D48) |
| `reopen_count` | integer | not null default 0; `CHECK (reopen_count >= 0)`; incremented on each reopen, adds nothing to `elapsed_seconds` |
| `last_state_changed_at` | timestamptz | not null default now(); the most recent transition, so a reopen is recorded without disturbing the metric |

Invariants: `UNIQUE (student_assignment_id, checklist_item_id)`; `CHECK (state <> 'in_progress' or started_at is not null)`; `CHECK (state <> 'completed' or (started_at is not null and completed_at is not null and elapsed_seconds is not null))`; `CHECK (completed_at is null or elapsed_seconds = round(extract(epoch from (completed_at - started_at)))::integer)`.

Per D48: elapsed time is the **first** start-to-complete interval. Re-opening a completed item sets `state = 'in_progress'`, increments `reopen_count`, and changes `last_state_changed_at`; it does not clear `completed_at` and does not add to `elapsed_seconds`. A later completion leaves `completed_at` and `elapsed_seconds` at their first values. Overwriting them would let a reopen days later report a multi-day elapsed time and would poison the D34 difficulty signal. No tutor endpoint reads this table (4.7.4).

#### 7.3.3 `assistant_sessions`

Purpose: the one conversational session per (student, assignment) (glossary: Assignment Assistant). Class: identity-bearing, student-facing only.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `student_id` | uuid | not null; FK `users (id)` |
| `subject_ref` | text | not null; `CHECK (subject_ref ~ '^[0-9a-f]{32}$')`; the analytics pseudonym from 4.7.1, used only inside `count(distinct ...)` and in `guardrail_logs` |
| `is_active` | boolean | not null default true |
| `message_count` | integer | not null default 0; `CHECK (message_count >= 0)` |
| `llm_call_count` | integer | not null default 0; `CHECK (llm_call_count >= 0)`; capped by `LLM_MAX_CALLS_PER_SESSION` (12) |
| `last_message_at` | timestamptz | null |

Invariants: `UNIQUE (student_id, assignment_id)`. The session is created on the first request or the first proactive notice.

#### 7.3.4 `assistant_messages`

Purpose: one turn in an assistant session, including the guardrail verdict on the student's turn. Class: identity-bearing, student-facing only; never returned to a tutor.

| Column | Type | Constraints |
|---|---|---|
| `session_id` | uuid | not null; FK `assistant_sessions (id)` |
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `role` | text | not null; `CHECK (role in ('student','assistant'))` |
| `is_proactive` | boolean | not null default false; `CHECK (not is_proactive or role = 'assistant')` |
| `body` | text | not null; `CHECK (length(body) <= 8000)`; never logged (5.7) |
| `verdict` | text | null; `CHECK (verdict is null or verdict in ('ALLOW','ALLOW_WITH_SCOPE','CLARIFY','REFUSE','ESCALATE_TO_TUTOR'))`; `CHECK ((role = 'student') = (verdict is not null))` |
| `reason_code` | text | null; required when `verdict in ('CLARIFY','REFUSE','ESCALATE_TO_TUTOR')` |
| `policy_rule_id` | uuid | null; FK `ai_policy_rules (id)`; null means no published rule applied. For `POL_ABSENT` the Assistant is unavailable (D47); there is no permissive default |
| `cited_tiers` | text[] | not null default `'{}'`; `CHECK (cited_tiers <@ array['T1','T2','T3','T4','T5'])` |
| `grounding_chunk_ids` | uuid[] | not null default `'{}'`; R4 requires it on any assistant message that asserts a requirement |
| `cited_faq_entry_ids` | uuid[] | not null default `'{}'` |
| `upload_ids` | uuid[] | not null default `'{}'`; every element must have `guardrail_scan_status = 'clear'` (I-6) |
| `model_id` | text | null |
| `prompt_version` | text | null |
| `latency_ms` | integer | null; `CHECK (latency_ms is null or latency_ms >= 0)` |
| `token_usage` | jsonb | null; shape `{"inputTokens":int,"outputTokens":int}` |
| `deleted_at` | timestamptz | null; set when the student clears their own transcript |

Invariants: an assistant message cannot be inserted unless the preceding student message in the same session has verdict `ALLOW` or `ALLOW_WITH_SCOPE`, or the message is a proactive notice built from published content only (I-1).

#### 7.3.5 `assistant_proactive_messages`

Purpose: the once-only record that the permitted proactive Assistant message for a milestone has been delivered (O2). Class: identity-bearing, student-facing only.

| Column | Type | Constraints |
|---|---|---|
| `student_assignment_id` | uuid | not null; FK `student_assignments (id)` |
| `milestone_id` | uuid | not null; FK `milestones (id)` |
| `assistant_message_id` | uuid | not null; FK `assistant_messages (id)` |
| `delivered_at` | timestamptz | not null default now() |
| `dismissed_at` | timestamptz | null |

Invariants: `UNIQUE (student_assignment_id, milestone_id)` is what makes "never repeated" a database guarantee rather than a UI convention. The message body is at most 3 bullets, each grounded in published content, and the sender is never the model on the fly: it is assembled from approved milestones, Checklist items, and FAQ entries (O2; [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 4.7).

#### 7.3.6 `student_uploads`

Purpose: a student file attached to an assistant request; multimodal input that must not become a route around C1. Class: identity-bearing, student-facing only.

| Column | Type | Constraints |
|---|---|---|
| `student_id` | uuid | not null; FK `users (id)` |
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `assistant_session_id` | uuid | null; FK `assistant_sessions (id)`; null until attached to a request |
| `kind` | text | not null; `CHECK (kind in ('image','pdf','text'))`; audio and video are out of the MVP (O11) |
| `original_filename` | text | not null; length <= 255; never returned (5.5.10) |
| `storage_key` | text | not null; unique; never returned (I-7) |
| `mime_type` | text | not null; must be in the student set (O11): `image/png`, `image/jpeg`, `application/pdf`, `text/plain` |
| `byte_size` | bigint | not null; `CHECK (byte_size > 0 and byte_size <= 26214400)` |
| `extraction_status` | text | not null default `'pending'`; `CHECK (extraction_status in ('pending','extracting','extracted','failed'))` |
| `extracted_text` | text | null; never logged, never returned to a tutor, never stored in `guardrail_logs` |
| `extraction_model_id` | text | null |
| `guardrail_scan_status` | text | not null default `'pending'`; `CHECK (guardrail_scan_status in ('pending','clear','blocked'))` |
| `guardrail_reason_code` | text | null; required when `guardrail_scan_status = 'blocked'` |
| `deleted_at` | timestamptz | null |

Invariants (C6, I-6): the request handler refuses `uploadIds` containing any upload whose `guardrail_scan_status <> 'clear'`. A blocked upload is retained so the student can see the refusal and so the audit trail has the row, but its content is never sent to the provider.

### 7.4 Queries and FAQ

Query threads are private and **always attributed**: a student may be anonymous in a Discussion thread, never in a private Query (D50).

#### 7.4.1 `queries`

Purpose: a private student-to-tutor thread (glossary: Query). Class: identity-bearing; readable by the asking student and by a tutor of the course (D24).

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `student_id` | uuid | not null; FK `users (id)`; the tutor sees this student's `display_name` because a Query is private, not anonymous (D24) |
| `milestone_id` | uuid | null; FK `milestones (id)`; the anchor used for question-volume aggregation |
| `requirement_node_id` | uuid | null; FK `requirement_nodes (id)` |
| `subject` | text | null; length <= 200 |
| `status` | text | not null default `'open'`; `CHECK (status in ('open','answered','resolved','closed'))` |
| `topic_label` | text | null; length <= 120; AI-proposed grouping label, T5 |
| `topic_label_source` | text | not null default `'ai'`; `CHECK (topic_label_source in ('ai','tutor'))` |
| `topic_confidence` | numeric(4,3) | null; `CHECK (topic_confidence is null or topic_confidence between 0 and 1)` |
| `grouping_model_id` | text | null |
| `grouping_prompt_version` | text | null |
| `message_count` | integer | not null default 0; `CHECK (message_count >= 0)` |
| `last_message_at` | timestamptz | null |
| `resolved_at` | timestamptz | null; `CHECK (status <> 'resolved' or resolved_at is not null)` |

Invariants: the grouping columns are **reserved and not populated in the MVP**. Topic clustering of student questions is out of scope ([`02-SCOPE.md`](02-SCOPE.md) section 2.4: the student picks a Milestone when posting), so `GET /api/tutor/assignments/{id}/queries` groups by Milestone only. The columns are specified so that [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md) metric M12 has a home and so enabling clustering later is not a migration. A tutor-set label, if the feature returns, is a grouping aid and is never an answer (not T2).

#### 7.4.2 `query_messages`

Purpose: one message in a private Query thread. Class: identity-bearing; readable by the asking student and a course tutor.

| Column | Type | Constraints |
|---|---|---|
| `query_id` | uuid | not null; FK `queries (id)` |
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `author_role` | text | not null; `CHECK (author_role in ('student','tutor'))` |
| `author_user_id` | uuid | not null; FK `users (id)` |
| `body` | text | not null; `CHECK (length(body) between 1 and 8000)`; immutable after send (`IMMUTABLE_FIELD` on PATCH) |
| `deleted_at` | timestamptz | null; a moderator may soft-delete; the author may not rewrite a sent message |

Invariants: a `tutor` message may be published as a FAQ entry, which is recorded on the new `faq_entries` row, not by mutating this one.

#### 7.4.3 Query attachments (not specified in the MVP)

Out of scope: [`02-SCOPE.md`](02-SCOPE.md) section 5 commits a private Query thread and tutor Reply as a flat thread view with **no attachments** (and no read receipts). No table, column, or endpoint is specified for Query attachments, and none may be scaffolded. A Query reply is text only.

#### 7.4.4 `faq_entries`

Purpose: a tutor-published answer forming the assignment's official shared knowledge (glossary: FAQ entry). Class: identity-free. Tier: T2 when `PUBLISHED`, T5 before.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `milestone_id` | uuid | null; FK `milestones (id)` |
| `question` | text | not null; `CHECK (length(question) between 5 and 500)` |
| `answer` | text | not null; `CHECK (length(answer) between 5 and 4000)` |
| `source_kind` | text | not null; `CHECK (source_kind in ('ai_candidate','query_reply','peer_answer','tutor_authored'))` |
| `source_query_id` | uuid | null; FK `queries (id)` |
| `source_query_message_id` | uuid | null; FK `query_messages (id)` |
| `source_discussion_post_id` | uuid | null; FK `discussion_posts (id)` |
| `published_by_user_id` | uuid | null; FK `users (id)`; `CHECK (publication_status <> 'PUBLISHED' or published_by_user_id is not null)` |
| `display_order` | integer | not null default 0 |
| `publication_status`, `origin`, `provenance`, `grounding_chunk_ids`, `approved_by_user_id`, `approved_at`, `published_at` | - | as in 7.2.5 |
| `deleted_at` | timestamptz | null |

Invariants: only a tutor can create or publish an entry (D24). `source_kind = 'peer_answer'` requires `source_discussion_post_id` and is only reachable through the explicit promotion action (D29, O8). There is no automatic promotion path in the API.

### 7.5 Discussions

#### 7.5.1 `discussion_threads`

Purpose: a shared, cohort-visible thread (glossary: Discussion thread). Class: pseudonymous.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `milestone_id` | uuid | null; FK `milestones (id)` |
| `title` | text | not null; `CHECK (length(title) between 5 and 200)` |
| `first_post_id` | uuid | null; unique; FK `discussion_posts (id)`; set when the opening post is inserted, so the thread's author is not duplicated as a column pair |
| `status` | text | not null default `'open'`; `CHECK (status in ('open','locked','removed'))` |
| `post_count` | integer | not null default 0; `CHECK (post_count >= 0)` |
| `last_post_at` | timestamptz | null |
| `deleted_at` | timestamptz | null |

#### 7.5.2 `discussion_posts`

Purpose: one Post in a Discussion thread; the object of the anonymity guarantee. Class: pseudonymous.

| Column | Type | Constraints |
|---|---|---|
| `thread_id` | uuid | not null; FK `discussion_threads (id)` |
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `parent_post_id` | uuid | null; FK self; `CHECK (parent_post_id is null or parent_post_id <> id)` |
| `author_user_id` | uuid | null; FK `users (id)`; set only for an attributed post |
| `author_anon_identity_id` | uuid | null; FK `anon_identities (id)`; set only for an anonymous post |
| `is_anonymised` | boolean | not null |
| `body` | text | not null; `CHECK (length(body) between 1 and 4000)` |
| `status` | text | not null default `'visible'`; `CHECK (status in ('visible','hidden_pending_review','removed'))` |
| `accepted_answer_status` | text | not null default `'none'`; `CHECK (accepted_answer_status in ('none','proposed','approved','rejected'))` |
| `answer_approved_by_user_id` | uuid | null; FK `users (id)`; `CHECK (accepted_answer_status <> 'approved' or answer_approved_by_user_id is not null)` |
| `answer_approved_at` | timestamptz | null |
| `edited_at` | timestamptz | null |
| `deleted_at` | timestamptz | null |

Invariants:

```sql
-- exactly one authorship path, and it must agree with is_anonymised
constraint ck_posts_author_xor check (
  (is_anonymised and author_anon_identity_id is not null and author_user_id is null)
  or
  (not is_anonymised and author_user_id is not null and author_anon_identity_id is null)
)
```

An anonymous post has no `author_user_id` at all, so no query over this table can name its author even before the identity table is considered. Own-post operations resolve through `author_anon_identity_id` (A-ID-7).

#### 7.5.3 `anon_identities`

Purpose: the only mapping between a student and a per-assignment pseudonym (section 4.3). Class: pseudonymous, and the most restricted table in the schema.

Full definition and rules are in section 4.3. Summary of constraints: `UNIQUE (student_id, assignment_id)`, `UNIQUE (assignment_id, pseudonym_hmac)`, `UNIQUE (assignment_id, display_number)`, `CHECK (display_number between 1 and 900)`, no `deleted_at`, FKs `ON DELETE RESTRICT`.

The display label is not stored. It is computed as `'Anonymous Student #' || display_number` and exposed as `author.displayLabel` (4.1).

#### 7.5.4 `moderation_flags`

Purpose: one AI or student flag against a Post or a Query message (O3, D30). Class: pseudonymous.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `target_kind` | text | not null; `CHECK (target_kind in ('discussion_post','query_message'))` |
| `target_id` | uuid | not null; resolved by the query layer against `target_kind`; a CHECK cannot express a polymorphic FK, so the delete rules are enforced in the query layer and covered by test T-13 |
| `source` | text | not null; `CHECK (source in ('ai','student'))` |
| `severity` | text | not null; `CHECK (severity in ('low','medium','high'))` |
| `reason_code` | text | not null; `CHECK (reason_code in ('HARASSMENT','INAPPROPRIATE_CONTENT','PERSONAL_INFORMATION','PROHIBITED_ASSISTANCE','SOLUTION_SHARING','OTHER'))` |
| `detail` | text | null; length <= 500; the flag explanation; never contains upload content |
| `reporter_anon_identity_id` | uuid | null; FK `anon_identities (id)`; `CHECK (source <> 'student' or reporter_anon_identity_id is not null)` |
| `ai_model_id` | text | null; `CHECK (source <> 'ai' or ai_model_id is not null)` |
| `ai_prompt_version` | text | null; `CHECK (source <> 'ai' or ai_prompt_version is not null)` |
| `status` | text | not null default `'open'`; `CHECK (status in ('open','upheld','dismissed'))` |
| `reviewed_by_user_id` | uuid | null; FK `users (id)`; `CHECK (status = 'open' or reviewed_by_user_id is not null)` |
| `reviewed_at` | timestamptz | null |
| `resolution_note` | text | null; length <= 500 |

Invariants: the reporter is stored as a pseudonym reference, never a user id (D54), so the moderator queue cannot resolve them (4.4, A-ID-5). One student flag per target: partial unique index on `(target_kind, target_id, reporter_anon_identity_id) WHERE source = 'student'` (D30, D54: one flag per (student, assignment) anonymous identity per post). AI flags are unlimited per target; a second AI flag on the same target updates the existing open flag instead of inserting a duplicate.

### 7.6 Analytics and audit

#### 7.6.1 `analytics_events`

Purpose: the single identity-free fact table for cohort insight (4.7.1). Class: identity-free. Append-only.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `subject_ref` | text | not null; `CHECK (subject_ref ~ '^[0-9a-f]{32}$')`; domain-separated HMAC from 4.7.1; no table maps it back |
| `event_type` | text | not null; `CHECK (event_type in ('session_started','checklist_item_started','checklist_item_completed','checklist_item_reopened','query_created','query_resolved','discussion_post_created','assistant_message_sent','assistant_request_refused','faq_viewed','brief_viewed','map_node_opened'))` |
| `milestone_id` | uuid | null; FK `milestones (id)` |
| `checklist_item_id` | uuid | null; FK `checklist_items (id)` |
| `duration_seconds` | integer | null; `CHECK (duration_seconds is null or duration_seconds >= 0)`; present on `checklist_item_completed` and `checklist_item_reopened` |
| `occurred_at` | timestamptz | not null default now() |
| `metadata` | jsonb | not null default `'{}'`; `CHECK (jsonb_typeof(metadata) = 'object')`; key allowlist: `source` (`ui`/`api`), `surface` (`workspace_tab`/`assistant`/`discussion`), `verdict`, `reasonCode`; no other key may be written (test T-15) |

Prohibited columns, permanently: `student_id`, `user_id`, `anon_identity_id`, `author_user_id`, `display_name`, `email`, `ip_address`, `user_agent`, `filename`, `body`, `text`, `extracted_text`, `session_token` (A-ID-6, 4.7.3).

#### 7.6.2 `guardrail_logs`

Purpose: the durable guardrail audit row required by D15 and AGENTS section 6.5: the decision, the rule cited, the prompt version. Class: identity-free, ops-facing; no MVP endpoint returns it.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `assistant_session_id` | uuid | null; FK `assistant_sessions (id)`; the opaque session id, not the student |
| `assistant_message_id` | uuid | null; FK `assistant_messages (id)` |
| `subject_ref` | text | not null; `CHECK (subject_ref ~ '^[0-9a-f]{32}$')`; same construction as 7.6.1 so refusal rates can be counted without identity |
| `verdict` | text | not null; `CHECK (verdict in ('ALLOW','ALLOW_WITH_SCOPE','CLARIFY','REFUSE','ESCALATE_TO_TUTOR'))` |
| `reason_code` | text | not null |
| `policy_rule_id` | uuid | null; FK `ai_policy_rules (id)`; null means no published rule applied, which for `POL_ABSENT` means the Assistant was unavailable (D47) |
| `cited_tiers` | text[] | not null default `'{}'`; `CHECK (cited_tiers <@ array['T1','T2','T3','T4','T5'])` |
| `model_id` | text | null |
| `prompt_version` | text | not null |
| `latency_ms` | integer | null; `CHECK (latency_ms is null or latency_ms >= 0)` |

Prohibited columns, permanently: `request_text`, `response_text`, `message_body`, `queue_position` derived from identity, `student_id`, `user_id`, `anon_identity_id`, `upload_id`, `extracted_text`, `ip_address`, `user_agent`, `cookie`. The guardrail decision is reproducible from `verdict` + `reason_code` + `policy_rule_id` + `prompt_version`; the text is not needed to audit it and must not be stored here (C7, AGENTS section 6.5).

#### 7.6.3 `milestone_metrics`

Purpose: the aggregate read model behind the tutor's per-milestone rows (5.5.11). Class: identity-free. Built by the query in 4.7.2.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `milestone_id` | uuid | not null; FK `milestones (id)` |
| `window_start` | timestamptz | not null |
| `window_end` | timestamptz | not null; `CHECK (window_end > window_start)` |
| `contributor_count` | integer | not null; **`CHECK (contributor_count >= 5)`** - the k-anonymity floor, enforced by the schema (D32, I-5) |
| `started_count` | integer | not null; `CHECK (started_count >= 0)` |
| `completed_count` | integer | not null; `CHECK (completed_count >= 0)` |
| `completion_rate` | numeric(5,4) | not null; `CHECK (completion_rate between 0 and 1)` |
| `average_elapsed_seconds` | integer | null; `CHECK (average_elapsed_seconds is null or average_elapsed_seconds >= 0)` |
| `median_elapsed_seconds` | numeric(10,2) | null; `CHECK (median_elapsed_seconds is null or median_elapsed_seconds >= 0)` |
| `question_count` | integer | not null default 0; tutor-directed questions only: private Queries plus flagged discussion posts (D49), from step 2 in 4.7.2 |
| `assistant_turn_count` | integer | not null default 0; metric M6, reported separately and never added to `question_count` (D49) |
| `discussion_post_count` | integer | not null default 0; all posts, not only flagged ones |
| `difficulty_score` | numeric(5,2) | null; set by the Insight Engine from `average_elapsed_seconds` and `question_count` together (D34); thresholds owned by [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md) |
| `computed_at` | timestamptz | not null |

Invariants: `UNIQUE (milestone_id, window_start, window_end)`. **There is no `is_suppressed` column and no row for a bucket below the floor.** Absence is uniform, so a reader cannot tell "0 contributors" from "4 contributors" (4.7.2). Every analytics number the tutor sees is either a row from this table or the **Insufficient data** state.

#### 7.6.4 `assignment_metrics`

Purpose: the Assignment Health headline row (5.5.11). Class: identity-free.

| Column | Type | Constraints |
|---|---|---|
| `assignment_id` | uuid | not null; FK `assignments (id)` |
| `window_start`, `window_end` | timestamptz | not null; `CHECK (window_end > window_start)` |
| `enrolled_count` | integer | not null; `CHECK (enrolled_count >= 0)`; an enrolment fact (`count(*)` over `enrollments`), not student activity |
| `active_count` | integer | null; `CHECK (active_count is null or active_count >= 5)`; null when fewer than 5 (D32) |
| `completed_item_count` | integer | null; `CHECK (completed_item_count is null or completed_item_count >= 0)` |
| `total_item_count` | integer | null |
| `average_completion_rate` | numeric(5,4) | null; `CHECK (average_completion_rate is null or average_completion_rate between 0 and 1)` |
| `question_count` | integer | null |
| `potential_difficulty_area_count` | integer | null; count only; the milestone detail is in `milestone_metrics` |
| `computed_at` | timestamptz | not null |

Invariants: `UNIQUE (assignment_id, window_start, window_end)`. `CHECK (enrolled_count >= 5 or (active_count is null and average_completion_rate is null))` - a tiny cohort suppresses activity metrics at assignment level too, because the k-anonymity floor applies to the Assignment Health headline and not only to per-milestone rows (D52).

#### 7.6.5 `audit_logs`

Purpose: the record of every state transition and tutor mutation, including publication status changes (section 3, section 3.5 rule 4). Class: identity-bearing (the actor). No MVP endpoint returns it.

| Column | Type | Constraints |
|---|---|---|
| `actor_user_id` | uuid | null; FK `users (id)`; null for a system transition |
| `actor_role` | text | null; `CHECK (actor_role is null or actor_role in ('student','tutor','system'))` |
| `action` | text | not null; `CHECK (length(action) between 3 and 80)`; dotted verb, e.g. `artifact.approved`, `assignment.published` |
| `target_table` | text | not null; `CHECK (length(target_table) between 3 and 64)` |
| `target_id` | uuid | null |
| `before` | jsonb | null; redacted per the list below |
| `after` | jsonb | null; redacted per the list below |
| `request_id` | text | null; the `x-request-id` of the request that caused the transition |

Redaction rule for `before` and `after`. Permitted: the artifact's own fields for `faq_entries`, `milestones`, `checklist_items`, `ai_policy_rules`, `requirement_nodes.map_summary`, `rubric_sections.map_interpretation`, `ambiguity_findings.status`, and `publication_status` transitions. Prohibited, without exception: `discussion_posts.body`, `query_messages.body`, `assistant_messages.body`, `student_uploads.extracted_text`, `users.password_hash`, any secret, any `storage_key`, any student identity attached to a discussion object.

### 7.7 Views

Two views exist. Both are read-only and both are load-bearing for an invariant.

```sql
-- A-ID-3: the only author-label surface a tutor-facing query may read.
create view discussion_author_display as
select dp.id                as post_id,
       dp.thread_id         as thread_id,
       dp.is_anonymised     as is_anonymised,
       case when dp.is_anonymised
            then 'Anonymous Student #' || ai.display_number::text
            else u.display_name
       end                  as display_label
from discussion_posts dp
left join anon_identities ai on ai.id = dp.author_anon_identity_id
left join users u           on u.id  = dp.author_user_id;

-- Derived Assignment Map edges: rubric section -> milestone through a shared requirement.
-- Not stored, because every Map edge must be anchored on a requirement (D14, D19).
create view v_rubric_milestone_edges as
select rrl.assignment_id      as assignment_id,
       rrl.rubric_section_id  as rubric_section_id,
       mrl.milestone_id       as milestone_id
from requirement_rubric_links rrl
join milestone_requirement_links mrl
  on mrl.requirement_node_id = rrl.requirement_node_id;
```

`discussion_author_display` exposes `display_label` and nothing else about the author. It never selects `student_id`, and for an anonymous post the `users` join cannot match because `author_user_id` is null by constraint. A tutor-facing handler that needs an author label must read this view (A-ID-3); a tutor-facing handler that reads `anon_identities` directly is a defect with a test attached.

---

## 8. Relationships

### 8.1 Shape

```text
users ---< enrollments >--- courses ---< assignments ---< assignment_sources ---< source_chunks
                                            |                                            |
                                            |                                            |  (grounding)
                                            +--< assignment_structures (is_current)       |
                                            |        |                                   |
                                            |        +--< requirement_nodes >-----------+-- (verbatim source)
                                            |        |        |
                                            |        |        +--< requirement_rubric_links >-- rubric_sections
                                            |        |        +--< milestone_requirement_links >--+
                                            |        |                                            |
                                            |        +--< milestones <-----------------------------+
                                            |        |        |
                                            |        |        +--< checklist_items
                                            |        |
                                            |        +--< ai_policy_rules
                                            |        +--< ambiguity_findings ---- (resolved by) ---> faq_entries
                                            |
                                            +--< faq_entries
                                            +--< queries ---< query_messages
                                            |        |
                                            |        +-- (published as) --> faq_entries
                                            |
                                            +--< discussion_threads ---< discussion_posts >--- anon_identities
                                            |                                  |
                                            |                                  +-- (promoted to) --> faq_entries
                                            |
                                            +--< moderation_flags
                                            +--< analytics_events (identity-free, subject_ref only)
                                            +--< milestone_metrics, assignment_metrics (derived)

users ---< student_assignments ---< student_checklist_progress >--- checklist_items
              |                |
              |                +--< assistant_proactive_messages
              +--< assistant_sessions ---< assistant_messages
              |                |
              |                +--< student_uploads
              +--< queries (student_id)
              +--< discussion_posts (author_user_id, attributed posts only)
              +--< anon_identities (never joined to a tutor-facing read)
```

### 8.2 Relationship rules

| Parent | Child | Cardinality | Delete rule | Invariant |
|---|---|---|---|---|
| `courses` | `assignments` | 1:N | RESTRICT | Every assignment belongs to exactly one course. |
| `courses` | `enrollments` | 1:N | RESTRICT | Access control is per course (section 5.2). |
| `users` | `enrollments` | 1:N | RESTRICT | A user may be enrolled in many courses with one role each. |
| `assignments` | `assignment_sources` | 1:N | RESTRICT | At least one `brief` source is required before publish. |
| `assignment_sources` | `source_chunks` | 1:N | CASCADE (before publish only) | Chunks are page-located fragments of their source. |
| `assignments` | `assignment_structures` | 1:N | RESTRICT | One `is_current` version; older versions are retained. |
| `assignment_structures` | `requirement_nodes`, `rubric_sections`, `milestones`, `checklist_items`, `ai_policy_rules`, `ambiguity_findings` | 1:N | RESTRICT | Composite FK `(structure_id, assignment_id)` prevents cross-assignment attachment. |
| `requirement_nodes` | `requirement_rubric_links` | 1:N | RESTRICT | Both endpoints must be `PUBLISHED` for the edge to render. |
| `milestones` | `milestone_requirement_links` | 1:N | RESTRICT | A milestone with no requirement link blocks publish. |
| `milestones` | `checklist_items` | 1:N | RESTRICT | An item belongs to exactly one milestone (3 to 6 per D20/O1). |
| `assignments` | `queries` | 1:N | RESTRICT | A Query belongs to one assignment and one student. |
| `queries` | `query_messages` | 1:N | RESTRICT | Messages are immutable after send. No attachments (02 section 5). |
| `queries` | `faq_entries` | 1:N | RESTRICT | A published answer records its source Query. |
| `assignments` | `discussion_threads` | 1:N | RESTRICT | Threads are cohort-visible within one assignment. |
| `discussion_threads` | `discussion_posts` | 1:N | RESTRICT | A post belongs to one thread; replies point at a parent post. |
| `anon_identities` | `discussion_posts`, `discussion_threads` (via `first_post_id`), `moderation_flags` | 1:N | RESTRICT | The identity row is never deleted (section 4.3). |
| `assignments` | `faq_entries` | 1:N | RESTRICT | Only a tutor publishes (D24). |
| `assignments` | `analytics_events` | 1:N | RESTRICT | Events are append-only and identity-free. |
| `milestones` | `milestone_metrics` | 1:N | RESTRICT | One row per window; absent means **Insufficient data**. |
| `assignments` | `student_assignments` | 1:N | RESTRICT | One row per (assignment, student). |
| `student_assignments` | `student_checklist_progress`, `assistant_proactive_messages` | 1:N | RESTRICT | Progress and proactive notices hang from the student's own assignment row. |
| `checklist_items` | `student_checklist_progress` | 1:N | RESTRICT | Progress references the item, so items are soft-deleted only. |
| `users` | `student_uploads` | 1:N | RESTRICT | An upload belongs to the student who sent it. |

Insert-order note: `discussion_threads.first_post_id` and `discussion_posts.thread_id` are mutually referential. The insert order is thread, then opening post, then update `first_post_id`, wrapped in one transaction; the FK on `first_post_id` is declared `DEFERRABLE INITIALLY DEFERRED` so a single-statement insert path also works.

### 8.3 Cross-cutting integrity rules

Numbered so another doc can cite one rule without restating it. Each is enforced somewhere already named in this doc; the citation is the pointer, and the enforcement is the guarantee.

| # | Rule | Enforced by |
|---|---|---|
| 1 | No foreign key crosses a privacy class: nothing in the identity-free class references an identity-bearing or pseudonymous row (A-ID-6). | Section 4.6, section 6.4 |
| 2 | A lower truth tier never overrides a higher one, and a conflict with no precedence is refused rather than resolved by the model (R1, R3). | Section 2.3 |
| 3 | Verbatim fields are immutable and must be substrings of the source chunk they cite (R2, I-2). | Section 7.2.5, test T-06 |
| 4 | A student-facing read returns only `PUBLISHED` artifacts of the current structure of a published assignment (Gate rule G1). | Section 3.4 |
| 5 | A row in `APPROVED` or `PUBLISHED` must carry its approval stamp and, for `PUBLISHED`, its publish timestamp. | Section 7.2.4 CHECK constraints |
| 6 | An anonymous post has exactly one authorship path, and it is not a user id. | Section 7.5.2 CHECK constraint |
| 7 | An aggregate bucket below five contributors produces no row at all, so absence is uniform (D32). | Section 4.7.2, section 7.6.3 |
| 8 | Elapsed time is the **first** start-to-complete interval. Re-opening a completed item increments `reopen_count` and changes `last_state_changed_at`; it does not extend `elapsed_seconds` (D48). | Section 6.12 rule 3, section 7.3.2, test T-24 |
| 9 | Question volume counts tutor-directed questions only (private Queries plus flagged discussion posts). Assistant turns are metric M6, reported separately, and are never folded into question volume (D49). | Section 4.7.2, section 7.6.3 |
| 10 | Adding a column to an identity-free table is a decision, not an edit. This applies to `analytics_events`, `milestone_metrics`, `assignment_metrics`, and `guardrail_logs`. | Section 4.7.3, section 7.6.2, section 9.3 gate 2 |

---

## 9. Enforcement checklist

Nothing in this doc is a guarantee until something fails when it is violated. This section is the list of mechanisms and tests that make the contract real. It is written to be read next to [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md).

### 9.1 Guaranteed by the schema alone

| Guarantee | Mechanism |
|---|---|
| No anonymous post names its author | `ck_posts_author_xor` (7.5.2): an anonymous post has a null `author_user_id`. |
| No cross-assignment artifact attachment | Composite FK `(structure_id, assignment_id)`. |
| No de-anonymising aggregate bucket | `CHECK (contributor_count >= 5)` on `milestone_metrics`; `CHECK (active_count is null or active_count >= 5)` on `assignment_metrics`. |
| No missing approval stamp | `CHECK (publication_status not in ('APPROVED','PUBLISHED') or approved_by_user_id is not null)` on every artifact table. |
| No AI artifact without provenance | `ck_provenance_shape` requires `modelId`, `promptVersion`, `generatedAt` when `origin = 'ai'`. |
| One current structure per assignment | Partial unique index `uq_assignment_structures_current`. |
| One proactive notice per milestone per student | `UNIQUE (student_assignment_id, milestone_id)`. |
| One student flag per post | Partial unique index on `moderation_flags`. |
| Duration cannot contradict its timestamps | `CHECK (completed_at is null or elapsed_seconds = round(extract(epoch from (completed_at - started_at)))::integer)`, where `completed_at` is the first completion (D48). |
| Tier values cannot drift | `CHECK (cited_tiers <@ array['T1','T2','T3','T4','T5'])`; tiers are computed, never stored (2.2). |

### 9.2 Tests the build must ship

Tests live in `tests/data-model/` and `tests/privacy/` and run under `pnpm test` (AGENTS section 4.3). Each test states what it would catch.

| ID | Test | Catches |
|---|---|---|
| T-01 | For every table, assert the column set matches this doc's 7.x tables exactly. | A column added "for convenience", including any prohibited analytics column. |
| T-02 | Assert `anon_identities` is referenced by exactly one source module. | A second reader of the identity table. |
| T-03 | Issue every tutor endpoint against a fixture with two anonymous posts; capture the SQL; assert no statement matches `anon_identities` or `users` in a discourse path. | A-ID-3 violation. |
| T-04 | Assert no tutor query orders by or groups by an author-derived column. | A-ID-4: deanonymisation by sort order. |
| T-05 | Feed the assistant two contexts where a T1 excerpt and a T5 summary disagree; assert the answer follows T1 and the disagreement is flagged. | R1 violation. |
| T-06 | Attempt to approve a `requirement_nodes` row whose `verbatim_text` is not a substring of its cited chunk; assert the rejection and `VERBATIM_MISMATCH`. | I-2, R2. |
| T-07 | Render the Assignment Map and assert the fixed non-authoritative label and the source page link are present on every node. | C2, D18 regressions. |
| T-08 | Present two conflicting T1 passages; assert verdict `ESCALATE_TO_TUTOR` and no chosen answer. | R3 violation. |
| T-09 | Assert every non-refusal assistant message has non-empty `grounding_chunk_ids` and `cited_tiers`. | R4 violation. |
| T-10 | Ask a question with no supporting chunk; assert the fixed "We could not find this in your assignment documents" copy and no assertion. | R4, glossary copy rule. |
| T-11 | For every tutor endpoint response, assert no key matches `studentId`, `studentName`, `email`, `userId`, `anonIdentityId`, or `subjectRef`. | A-ID-5 violation. |
| T-12 | Edit and delete own anonymous post; then attempt the same as another student and as a tutor; assert 200, then `NOT_FOUND`. | A-ID-7 violation. |
| T-13 | Delete a flagged target row; assert the moderation flag is refused (RESTRICT) and the queue never points at a missing row. | Polymorphic `target_id` integrity (7.5.4). |
| T-14 | Lint: no provider SDK import outside `src/lib/llm/`. | C8, I-8. |
| T-15 | Assert `analytics_events.metadata` keys are a subset of the allowlist, over the whole fixture run. | Identity or content leaking into metadata. |
| T-16 | Assert no analytics module's SQL contains `student_id`, `user_id`, or `anon_identity_id` outside a `count(distinct ...)` over `subject_ref`. | I-5, A-ID-6. |
| T-17 | Run the full ingestion on the demo fixture and assert every AI artifact starts at `AI_GENERATED` or `NEEDS_REVIEW` and none is student-visible. | C3, I-3. |
| T-18 | Publish, then edit a published FAQ entry; assert the entry leaves student-visible reads until re-approved (transition 8). | Gate rule G1, transition 8. |
| T-19 | Two concurrent artifact PATCHes with the same `expectedRevision`; assert one succeeds and one gets `STALE_REVISION`. | Lost-update bug. |
| T-20 | Attempt an assistant request referencing a `blocked` upload; assert `VALIDATION_FAILED` and no provider call. | C6, I-6. |
| T-21 | Assert no response body, log line, or fixture contains a value from `.env`, and `storage_key` and `password_hash` appear in no response schema. | C7, I-7. |
| T-22 | Assert the ambiguity findings flow has no write path that sets a clarification text on a finding, and that resolution requires a linked FAQ entry. | D23 regression. |
| T-23 | Publish an assignment with no approved `ai_policy_rules` row (bypass the UI gate in a fixture), then send an assistant request: assert verdict `REFUSE`, reason code `POL_ABSENT`, zero provider calls, and `policy.available = false` on the student policy read. | D47 regression, and any fail-open fallback. |
| T-24 | Start an item, complete it, reopen it, wait, and complete it again: assert `elapsed_seconds` still equals the first interval, `reopen_count` is 1, and `last_state_changed_at` moved. | D48 regression. |
| T-25 | Build `milestone_metrics` for a window with assistant sessions but no Queries: assert `question_count = 0`, `assistant_turn_count > 0`, and no difficulty area is signalled on assistant turns alone. | D49 regression. |
| T-26 | Assert the picker and the upload endpoint accept only `image/png`, `image/jpeg`, `application/pdf`, `text/plain` and refuse audio and video with `UNSUPPORTED_FORMAT`, never accepting and then failing later. | O11 scope and C6. |

### 9.3 Review gates for a pull request that touches this contract

1. Does the change add or rename a table, column, or endpoint? If yes, this doc changes in the same commit (00-INDEX section 5 rule 3).
2. Does the change add a column to a table in the identity-free class? If yes, section 4.7.3 applies and the change needs an explicit decision row in [`01-DECISIONS.md`](01-DECISIONS.md).
3. Does the change add a path under `/api/`? It must appear in the section 5.4 index with a role and its failure codes.
4. Does the change add a `publication_status` transition? It must appear in section 3.2 with a guard and side effects.
5. Does the change add a domain term? It goes in [`15-GLOSSARY.md`](15-GLOSSARY.md) first.
6. Does the change print or return student content in a log, an error, or a metrics row? Reject.

---

## 10. Ambiguities, deviations, and open items

Recorded per AGENTS section 8: when a doc is wrong or silent, say so rather than coding around it. Each item states the finding, the reading this doc adopted, and what the Lead should do.

| # | Finding | Reading adopted here | Action |
|---|---|---|---|
| 1 | [`docs/assignment_assistant_project_handoff.md`](assignment_assistant_project_handoff.md) section 11 shows checklist examples containing "Implement endpoints". D20 restricts Checklist item verbs to understand / identify / plan / verify / review / note, and O1 repeats it. | D20 and O1 win over the handoff example. `checklist_items.planning_level` has a six-value CHECK and the validator rejects implementation imperatives (7.2.10). | The supersession is recorded in 7.2.10 and in [`03-PRD.md`](03-PRD.md). No further action. |
| 2 | [`.env.example`](../.env.example) previously said changing `ANON_ID_SECRET` "re-labels every anonymous post". With a persisted `(student_id, assignment_id)` lookup, existing labels do not change (4.2). | Persisted mapping wins; the number must be stable, and uniqueness within an assignment requires storage. Rotating the secret affects only identities created after the rotation. | **Resolved:** `.env.example` has been corrected, and the persisted reading is now recorded as **D55** and applied in `04` S11, `08` S1.3 and `12` S2.2. No change to this contract. |
| 3 | D22 lists the lifecycle as `AI_GENERATED -> NEEDS_REVIEW -> EDITED -> APPROVED -> PUBLISHED`, which reads as if editing is mandatory. D21 says "review, edit, approve" with edit implied, not required. | `NEEDS_REVIEW -> APPROVED` is permitted with no intervening `EDITED`; `EDITED` is recorded when and only when the tutor modifies content. | **Resolved by D53** (transition 4, section 3.1). |
| 4 | D30 says "one flag per user per post". In an anonymous-post design the reporter cannot be stored as a user id without creating an identity join on a discourse table. | The reporter is stored as their per-(student, assignment) anonymous identity, so `UNIQUE (target_kind, target_id, reporter_anon_identity_id)` implements the rule and the moderator queue still cannot resolve the reporter. | **Resolved by D54:** discussion flags are recorded against the reporter''s anonymised identity -- one flag per (student, assignment) anonymous identity per post. The middle column stands as written. |
| 5 | D32 floors aggregate buckets at five contributors. It does not say whether the Assignment Health headline is also floored. | Applied to `active_count`, `average_completion_rate`, and the milestone rows, and to the whole headline when fewer than five students are enrolled. | **Resolved by D52:** the floor applies to the Assignment Health headline figures too, not only to per-milestone rows; below five contributors the headline reports `insufficient data` rather than a number. `08` owns the final wording. |
| 6 | No decision states whether a private Query is ever anonymous. D24 calls a Query a private student-to-tutor thread; D25 attaches anonymity to student posts; the handoff section 21 says "student name, where appropriate / if not anonymous", which is ambiguous for Queries. | A Query is always attributed: the tutor answering needs to know who asked, and anonymity is the Discussion thread mechanism (D25). If a student wants to ask a sensitive question without their name, that is a Discussion. | **Resolved by D50:** a private Query is always attributed, never anonymous. The middle column stands and sections 5.5.12 and 7.4.1 do not change. |
| 7 | D8 says ambiguous requests default to refusal with a safe alternative, but the glossary defines both `CLARIFY` and `REFUSE`. | An ambiguous request produces `CLARIFY` with a refusal-shaped payload; it never proceeds to a model answer. `CLARIFY` counts as a refusal for the purposes of the golden set. | **Resolved by D69:** `CLARIFY` is a refusal-shaped outcome -- it carries a refusal-shaped payload, returns `200`, never proceeds to a model answer, and counts as a refusal in the golden set. The middle column stands. |
| 8 | D48 settles reopening a completed Checklist item: it does not reset elapsed time. This row previously read that a later completion overwrites `elapsed_seconds`, which was stale. | Reopen keeps `started_at` and `completed_at` at their first values, increments `reopen_count`, and changes `last_state_changed_at`; elapsed time is the **first** start-to-complete interval and a later completion does not overwrite it (D48, 6.12 rule 3, 7.3.2, 8.3 rule 8, T-24). | **Resolved by D48.** Corrected here; the superseded reading was "a later completion overwrites `completed_at` and `elapsed_seconds`". |
| 9 | No decision sets a retention period for `student_uploads` and `assistant_messages`. | Both have `deleted_at`; nothing is auto-deleted. Retention beyond the demo is unaddressed. | Add a decision row before any real deployment. |
| 10 | O6 says the MVP scope is committed in [`02-SCOPE.md`](02-SCOPE.md), which did not exist when this doc was written. | This doc defines the full contract and assumes 02 trims features rather than tables; a trimmed feature leaves its table unused, which is cheaper than a destructive migration mid-hackathon. | Re-read 02 when it lands and mark any wholly unused table here. |
| 11 | No decision fixes demo fixture shape, but D32's floor of five makes a small fixture untestable. | Fixtures follow [`02-SCOPE.md`](02-SCOPE.md) section 5 and D46: a deterministic synthetic cohort, a small set of interactive demo accounts, committed inputs in `docs/fixtures/`, and at least one below-floor milestone so both a real metric and the **Insufficient data** state are demonstrable (6.10). | Confirm with the demo owner ([`13-DEMO-STORY.md`](13-DEMO-STORY.md)). |
| 12 | The decisions register has no entry for how `discussion_threads` records its author, and the thread/post pair is mutually referential. | `first_post_id` plus a deferrable FK (8.2 note), rather than duplicating the anonymity columns on the thread. | Implementation detail; no decision needed. |
| 13 | [`02-SCOPE.md`](02-SCOPE.md) section 2.4 previously narrowed ingested formats to "PDF (text layer) and plain text / Markdown" and rejected DOCX and PPTX. O5 in the register, [`04-TECH-ARCHITECTURE.md`](04-TECH-ARCHITECTURE.md) section 6, and 02 section 2.4 as it now reads all accept PDF, DOCX, PPTX, PNG/JPEG, plus plain text and Markdown. | O5 (the register) governs, confirmed by **D57**: tutor formats are PDF, DOCX, PPTX, PNG/JPEG, plus plain text and Markdown, with a scanned PDF flagged for tutor attention rather than guessed (7.2.2). | **Resolved:** 02 section 2.4 now states the O5 set and does not narrow it, and `10`, `11` and `12` have been corrected to stop rejecting DOCX/PPTX. |
| 14 | [`02-SCOPE.md`](02-SCOPE.md) section 2.4 commits a "page-rasterised in-app viewer; no annotation, no search-within-document, no download controls", which is narrower than handoff section 9. | 02 governs the viewer. [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) section 4.2 has no download, print, annotation, or in-document search control; page navigation and the Map-to-page deep link (CV-4, D43) remain. | No action; recorded so the UI is not "improved" back into a conflict with 02. |
| 15 | 02 section 5 commits a flat Query thread with no attachments. This doc previously specified a `query_attachments` entity from handoff section 21. | Removed. No table, column, or endpoint exists for Query attachments (7.4.3), and the `messages[].attachments` field is gone from the response contract. | No action; handoff section 21 is superseded by 02. |
| 16 | 02 section 2.4 commits "no AI clustering of query topics". [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md) nonetheless expects `queries.topic_label` for metric M12. | The grouping columns stay in the schema as **reserved and unpopulated** in the MVP (7.4.1); the tutor Queries tab groups by approved Milestone only; `TutorQueryGroupListResponse.grouping` has one value (5.5.12). | Confirm with 08. If clustering is wanted, it is a scope change requiring a decision row. |
| 17 | [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) sketches route files as `/api/assignments/...`, `/api/milestones/...`, `/api/progress`, `/api/assistant`, `/api/queries/*`, `/api/discussions/*`, `/api/faq/*`, `/api/analytics`, which does not match the role-scoped paths in section 5.4. | Section 5.4 is the URL contract; 11's names are work-packet file sketches. Mapping: `/api/assignments/*` -> `/api/tutor/assignments/*` and `/api/student/assignments/*`; `/api/assignments/[id]/documents` -> `/api/tutor/assignments/{id}/sources`; `/api/assignments/[id]/ingest` -> `POST|GET /api/tutor/assignments/{id}/ingest`; `/api/assignments/[id]/artifacts/[artifactId]` -> `PATCH /api/tutor/structure-artifacts/{artifactId}` and `POST /api/tutor/assignments/{id}/artifacts`; `/api/assignments/[id]/policy` -> the `ai_policy_rule` artifact endpoints plus `GET /api/student/assignments/{id}/policy`; `/api/progress` -> the three `/api/student/checklist-items/{itemId}/{start|complete|reopen}` transitions; `/api/assistant` -> `POST /api/student/assignments/{id}/assistant/messages`; `/api/queries/*` -> `/api/tutor/queries/*` and `/api/student/queries/*`; `/api/discussions/*` -> `/api/student/discussion-threads|discussion-posts/*` and `/api/tutor/discussion-posts/*`; `/api/faq/*` -> `/api/tutor/faq-entries/*` and `GET /api/student/assignments/{id}/faq-entries`; `/api/analytics` -> `GET /api/tutor/assignments/{id}/analytics`; `/api/milestones/*` -> **no standalone route exists**: an unapproved milestone is deliberately not addressable, so the assertion lands on `GET /api/student/assignments/{id}` and `.../structure` and must be `NOT_FOUND`; `/api/assignments/:id/assistant/messages` -> `POST /api/student/assignments/{assignmentId}/assistant/messages` (`04` section 9.2 step 1). **Every** divergent sketch is now accounted for: the ten in `11` plus that one in `04`. (The remaining `11` sketches -- `/api/health` and `/api/auth/*` -- already matched.) The earlier "about a dozen places" overstated the verified count. | **Resolved by D70.** `11` is reconciled to section 5.4 and the mapping above is complete, including `04` section 9.2 step 1. Route file layout under `app/src/app/api/` follows the URL contract. |
| 18 | [`04-TECH-ARCHITECTURE.md`](04-TECH-ARCHITECTURE.md) section 6 previously said student upload formats are "specified but not shipped in the MVP (O11)". O11 has since been reversed: images, PDF, and plain text are IN; audio and video are OUT. | The reversed O11 governs: `student_uploads.kind` is `image | pdf | text` (7.3.6) and the picker offers those three (5.5.10). | **Resolved:** the 04 update has landed, and the remaining audio/video mentions in `04` S3 and `12` S2.3 have been removed so that only images, PDFs and plain text reach the adapter. No change to this contract. |
| 19 | [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md) asks for a discussion topic-label column on `discussion_threads` or a derived topic table, and for an index on `student_checklist_progress (assignment_id, milestone_id, completed_at)`. | Neither is specified. Topic labelling is out of scope (item 16), and analytics reads `analytics_events`, never `student_checklist_progress`, so `assignment_id` and `milestone_id` are deliberately absent from that table (7.3.2, 4.7.4). | Confirm with 08; its own fallback ("grouping runs on `queries` only") is the MVP behaviour, and M12's discussion half is post-MVP. |
| 20 | Column naming differences with [`04-TECH-ARCHITECTURE.md`](04-TECH-ARCHITECTURE.md) section 6 (`search_tsv`, `content_hash`) and with [`08-ANALYTICS-SPEC.md`](08-ANALYTICS-SPEC.md) (`checklist_items.text` for `title`, `faq_entries.title` for `question`). | This doc is authoritative on names: `source_chunks.search_tsv`, `assignment_sources.content_hash`, `checklist_items.title`, `faq_entries.question` and `faq_entries.answer`. The 04 names already match and are cited in 6.8 and 7.2.2; the 08 names are shorthand for the same columns. | No action beyond this note; implementers should read field names from section 7. |
| 21 | [`05-AI-GUARDRAILS.md`](05-AI-GUARDRAILS.md) section 7.2 Table A previously described `guardrail_logs.policy_rule_id = null` as "the platform default applied", which D47 supersedes. | `null` means no published rule applied; the `POL_ABSENT` row records the unavailable state (7.6.2). | **Resolved:** the 05 correction has been applied in `05` S8.1; the field now reads as no approved policy, `REFUSE` / `POL_ABSENT`, with no permissive default. |



