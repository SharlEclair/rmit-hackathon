# 15 -- Glossary

**Purpose.** One term, one meaning, everywhere -- DB columns, API fields, UI copy, docs, and the demo script. Drift here is how a project ends up with `Milestone`, `Task`, `Step`, and `Item` all meaning slightly different things.

**Rule.** If you need a new domain term, add it here first and then use it. If a term is listed as *do not use*, do not use it, even in a comment.

---

## 1. Canonical vocabulary

| Term | Definition | Not to be confused with | Do not use |
|---|---|---|---|
| **Assignment** | The central object. One unit of assessed work, containing official documents, an approved structure, milestones, checklist, FAQs, discussions, queries and analytics. | A *Course* (which contains assignments). | Project, task, exercise |
| **Course** | The university subject that groups assignments and enrolments. Called "subject" in some UI copy. | An *Assignment*. | Module, unit, class |
| **Official Assignment Brief** | The original document uploaded by the tutor. **Authoritative.** Always displayed verbatim, never paraphrased into the UI as if it were the brief. | The *Assignment Map* (which is interpretation). | Spec (in UI), summary, overview |
| **Requirement** | A specific thing the assignment officially asks for, expressed in the brief's own words. | A *Milestone* (a stage of work) or a *Checklist item* (a self-check). | Task, deliverable, objective |
| **Rubric** | The official marking criteria and their weightings. Authoritative, same tier as the brief. | The *Assignment Map*. | Marking guide (only if the tutor's source file says so) |
| **Assignment Map** | AI-generated structural/navigation view of the assignment, linking requirements -> rubric sections -> milestones -> checklist items. **Non-authoritative**, always visually distinguished from the brief, always labelled as interpretation. | The official brief. | Mind map, outline, structure diagram |
| **Milestone** | A larger conceptual stage of work within the assignment, e.g. "Milestone 3 -- API Implementation". Approved items are student-visible. | A *Requirement* (official) or a *Checklist item* (granular). | Phase, stage, sprint, step |
| **Checklist item** | A granular, self-checkable progress item under a milestone. Verbs are limited to *understand / identify / plan / verify / review / note*. | A *Milestone*. | Task, to-do, subtask, action item |
| **Assignment Map node** | A single element of the Assignment Map, carrying a link to its source location in the official document. | A *Requirement* record. | Node (unqualified), block |
| **AI Usage Policy** | The assignment-specific rules governing what the assistant may and may not help with. Extracted from the source materials, then **tutor-approved**. Enforced per assignment. | The guardrail *implementation*; the platform terms of use. | AI rules, guidelines, ToS |
| **Guardrail** (Policy Guard) | The independent layer that decides whether a student request is permitted, prohibited, or needs clarification, and that logs the decision. Runs without a live model call where possible. | The assistant's system prompt. | Filter, safety layer, moderation |
| **Verdict** | The guardrail's structured decision for one request: `ALLOW`, `ALLOW_WITH_SCOPE`, `CLARIFY`, `REFUSE`, `ESCALATE_TO_TUTOR`. | A *Moderation flag*. | Decision, result, label |
| **Prohibited request** | A student request that would cause the assistant to do, evaluate, debug, or plan the student's assessed work. | A *Moderation flag* (which is about discussion content). | Blocked message, banned prompt |
| **Derived effort** | Prohibited assistance delivered indirectly -- reworded, hypothetical, decomposed into steps, or "just checking". Prohibited exactly as directly as a plain request (D11). | A legitimate clarifying question. | Loophole, edge case, workaround |
| **AssignMate** | The student-facing AI coach. One conversational session per (student, assignment). | The *Assignment Analyst* or the *Insight Engine* -- internal capabilities, never shown to users. | Chatbot, bot, GPT, AI tutor |
| **Assignment Analyst** | The internal ingestion capability that reads uploaded tutor materials and proposes structure, milestones, checklist, FAQ candidates, AI policy, and ambiguity/contradiction findings. | The *AssignMate*. | Parser, extractor, ingester |
| **Discussion Moderator** | The internal capability that flags student discussion content. Advisory only -- it never deletes. | The *guardrail*. | Censor, filter |
| **Insight Engine** | The internal capability that computes cohort insight from behaviour. Deterministic: it makes no model call in the MVP (**D67**). | Analytics UI. | Analyzer, ML model |
| **Query** | A **private** student -> tutor thread. One student, one tutor (or tutor team). | A *Discussion* thread (public/anonymous). | Ticket, message, DM |
| **Discussion thread** | A **shared**, cohort-visible thread. Posts may be anonymous or attributed. | A *Query*. | Forum post, comment section |
| **Post** | One message in a discussion thread. | A *Query message*. | Comment, entry, reply (except as UI affordance) |
| **FAQ entry** | A tutor-**published** answer forming part of the assignment's official shared knowledge. Authoritative within tier T2. | A discussion answer. | Article, help doc |
| **Reply** *(verb, tutor action)* | Sending a **private** answer to one student's query. | **Publish**. | Respond, answer |
| **Publish** *(verb, tutor action)* | Promoting an answer into the official shared FAQ, visible to the whole cohort. Tutor-only. | **Reply**. | Share, make public, post |
| **Approval** | The tutor transition that makes AI-generated content student-visible. The trust boundary. | Editing. | Accept, confirm, sign-off |
| **Publication status** | The lifecycle state of any AI-generated artifact: `AI_GENERATED -> NEEDS_REVIEW -> EDITED -> APPROVED -> PUBLISHED`. | The assignment's own status. | Draft state, workflow stage |
| **Provenance** | The recorded origin of an AI artifact: model id, prompt version, source chunk references, and the generation timestamp. Retained through every status transition. | Confidence score. | Metadata, source |
| **Source chunk** | A retrieved, page-located fragment of an official document used as grounding for an AI output. | A *Requirement*. | Snippet, passage, excerpt |
| **Truth hierarchy** | The authority order (T1 - T5) the assistant resolves conflicts by. Lower tiers never override higher tiers. | The *Publication status*. | Priority, ranking, trust level |
| **Anonymous identity** | The stable per-(student, assignment) pseudonym shown instead of a name, displayed as `Anonymous Student #482`. | A user account. | Alias, nickname, handle |
| **Anonymous Student #N** | The **display format** for an anonymous identity. Always this exact shape -- one space, capital S, `#`, number. | -- | Anon #482, Student #482, Anonymous1 |
| **Cohort analytics** | Aggregate, k-anonymity-floored insight shown to tutors. Never per-student. | Individual progress (student-facing only). | Learning analytics, student tracking |
| **Insufficient data** | The aggregate state shown instead of a bucket with fewer than 5 contributing students. | Zero. | N/A, hidden, low sample |
| **Assignment Health** | The tutor-facing analytics view: average resolution rate, active students, count of potential difficulty areas, per-milestone table. | A generic chart dashboard. | Stats page, dashboard (unqualified) |
| **Potential difficulty area** | A milestone flagged because it has both above-cohort-average elapsed time **and** above-average question volume. Evidence only -- never a prescribed intervention. | A confirmed problem. | Problem area, bottleneck, hotspot |
| **Elapsed time** | Wall-clock time between a student starting and completing a checklist item. Idle time **counts**. Always labelled "elapsed time", never "time worked" or "time on task". | Active work time. | Duration, effort, time spent (in UI copy) |
| **Resolution rate** | Share of checklist items marked complete by a student, over approved items. | Assignment grade. | Completion (unqualified) |

---

## 2. Language rules

### In UI copy

| Write | Not |
|---|---|
| "Original assignment brief" | "Summary of the brief" |
| "Assignment Map (AI-generated interpretation)" | "Assignment structure" |
| "Official FAQ" | "Answers", "Wiki" |
| "Elapsed time" | "Time worked", "Time on task" |
| "Anonymous Student #482" | "Anonymous", "User 482" |
| "Ask your tutor privately" | "Message your tutor" |
| "Published by your tutor" | "Verified answer" |
| "We could not find this in your assignment documents" | "I don't know" |

Two rules that matter more than the rest:

1. **Never describe an AI output as official.** The word "official" is reserved for tutor-authored or source-document content.
2. **Never promise a guarantee the system does not provide.** If the docs say the guardrail is conservative, the UI must not say "this assistant is safe" -- say what it refuses to do.

### In code

| Identifier | Meaning |
|---|---|
| `truthTier` | `T1` - `T5`, per S3 below |
| `publicationStatus` | The lifecycle enum |
| `planning_level` / `planningLevel` | The semantic ceiling a checklist item is allowed to express (`understand`, `identify`, `plan`, `verify`, `review`, `note`) |
| `isAnonymised` | Whether a post is displayed under a pseudonym |
| `anonRef` | The `Anonymous Student #N` display value |
| `provenance` | The provenance object on an AI artifact |
| `groundingChunkIds` | Source chunk ids an AI output was grounded in |

---

## 3. Truth hierarchy shorthand (T1 - T5)

Used throughout `05-AI-GUARDRAILS.md`, `06-DATA-MODEL.md` and `04-TECH-ARCHITECTURE.md`. Full definition and the conflict-resolution procedure live in `06-DATA-MODEL.md` S2.

| Tier | Source | Authority |
|---|---|---|
| **T1** | Official assignment brief and rubric | Authoritative, verbatim |
| **T2** | Tutor-approved clarifications, official FAQs, approved AI Usage Policy | Authoritative as tutor interpretation |
| **T3** | Tutor-approved milestones and checklist items | Official structure, non-authoritative on requirements |
| **T4** | Student discussions and peer answers | Non-authoritative, never grounds an authoritative answer |
| **T5** | AI-generated interpretation (Assignment Map, FAQ candidates, ambiguity flags) | Advisory, requires approval before student-visible |

---

## 4. The review-lifecycle short form

```text
AI_GENERATED --> NEEDS_REVIEW --> EDITED --> APPROVED --> PUBLISHED
  |  |  |
  |  |  \-> student-visible
  |  \-> provenance retained
  \-> "AI generated -- requires tutor approval" badge in every UI state
```

Discarded candidates move to `REJECTED` and are retained for audit, not deleted.

---

## 5. Capability names are internal

`Assignment Analyst`, `Guardrail`, `Discussion Moderator`, and `Insight Engine` are architecture vocabulary. A student sees **one** thing: the AssignMate. A tutor sees capabilities as product features -- never as agents, models, or a pipeline diagram.
