# 09 -- Problem and Rationale

**Purpose.** The judge-facing argument for why this problem is real, who it hurts, why the existing tools do not fix it, and what evidence in this repository supports the claim. Written to be read aloud in ninety seconds or read carefully in five minutes.

**Rule this doc obeys.** Nothing here is invented. Every factual claim is labelled with its evidence class in S7. Where the repository has no measurement, the claim is stated as a design judgement and marked as such.

---

## 1. The argument in one paragraph

A university assignment is a specification with a marking scheme attached, written once and read by hundreds of people who are each working alone. The specification is authoritative but not interactive: it cannot answer the question a student actually has. The support channels around it are interactive but not authoritative, or not safe, or both. So students either ask nothing -- and lose marks to a misreading -- or they ask a general-purpose AI, which will happily write the code and thereby convert a clarification problem into an academic integrity problem. Meanwhile the tutor, who could resolve most of it in one sentence, cannot see where the confusion is concentrated until the marks come in. **The gap is not intelligence. It is authority plus channel: nobody can answer a student's question with the assignment's own rules in hand, in a place where asking is cheap.**

AssignMate closes that gap by making the assignment itself the object, constraining the AI to the assignment's own AI policy, and turning the questions students ask into aggregate insight for the tutor. The single constraint that shapes everything else:

> **The AI must never do the assignment for the student.**

---

## 2. Who is harmed, and how

### 2.1 Students

| Harm | How it happens | Why it persists |
|---|---|---|
| Silent misreading of the brief | A requirement is ambiguous or terse. The student does not ask, guesses, and loses marks on work they did correctly by their own reading. | The question feels too obvious to ask, and there is no low-cost channel to ask it in. |
| Fear of asking | The question is specific to their situation, or would reveal that they are behind. | A public forum post is attributed. An email to the tutor is not anonymous and takes a day. |
| Not knowing what AI use is permitted | Every unit has different rules, often buried in a section of the brief or an announcement. | "Is AI allowed for this?" has no canonical answer the student can find in ten seconds. |
| Being helped too much by a generic assistant | A general-purpose model writes the code, debugs the loop, or produces the answer. | Generic assistants have no notion of an assignment's rules, so the default is to comply. The student may not even register that this crossed a line until it is a misconduct matter. |
| Untraceable requirement drift | The student works from a summary -- a friend's notes, a forum paraphrase, a model's recap -- and treats it as the requirement. | Nothing in the current toolchain marks the difference between the brief and someone's interpretation of it. |

### 2.2 Tutors

| Harm | How it happens | Why it persists |
|---|---|---|
| Repetition | The same clarification is asked independently by many students, and answered independently each time. | Answers live in inboxes and forum threads; nothing accumulates. |
| Invisibility of confusion | The tutor discovers that a requirement was ambiguous after marking, when the cohort has already gone the wrong way. | No tool aggregates where students spend time and where they ask questions, per assignment stage. |
| Answering at the wrong altitude | Questions arrive mixed: some need a one-line clarification, some need a private conversation. | One channel is expected to serve both, so the tutor handles each from scratch. |
| Unscalable office hours | A tutor's time is the scarce resource and it is consumed re-explaining settled points. | Repetitive questions are indistinguishable from genuinely new ones until they have been read. |

### 2.3 The institution

Academic integrity is the institution's exposure, and it is currently enforced by policy text plus detection after the fact. A tool that makes the permitted use of AI explicit and enforced per assignment moves some of that from post-hoc detection to in-product boundary. That is a design intent, not a measured outcome (S7).

---

## 3. Why existing tools do not fix it

| Existing channel | What it is good at | Why it fails here |
|---|---|---|
| **The LMS (Canvas and equivalents)** | Storing and distributing the brief. Enrolment. Grades. | It is a document repository with a discussion forum attached. It has no model of the assignment's structure, no per-assignment AI policy, and no way for a student to ask a question and get an answer grounded in the brief. Canvas discussion is a general forum: it is where the questions pile up (see S6), not where they get resolved at scale. |
| **Email to the tutor** | Private, personal, appropriate for circumstances. | Not anonymous, not searchable, not shared. One student's answer helps one student. Latency of a day or more. |
| **Office hours** | The highest-bandwidth channel that exists. | The scarcest. Does not scale to a cohort, and arrives too late for a student who is already stuck at 1 AM. |
| **A FAQ document or announcement** | Authoritative and durable once written. | Written after the confusion is discovered, not before. Static. Nobody reads it until they already have the problem. |
| **A general-purpose AI assistant** | Instant, patient, never judges the question. | Two failures, both structural. It has no authoritative knowledge of *this* assignment's brief, rubric, or tutor interpretation, so it answers from the general case; and it has no notion of the assignment's AI rules, so it will do the work. The second failure is the one that turns a study aid into a misconduct risk. |
| **A generic "AI tutor" wrapper** | Better-placed answers than a raw chatbot. | Still no authority hierarchy, no tutor approval boundary, and no aggregate view for the tutor. It makes the student side friendlier without changing who holds the truth or how the tutor sees the cohort. |

The pattern across all six: **the channels that can answer are not authoritative, and the artefact that is authoritative cannot answer.** AssignMate exists to close exactly that gap, and it does so with the assignment as the object rather than a chat window as the object (D1, D2).

---

## 4. Why this shape of solution follows from the problem

Each design decision traces to a harm in S2 and a failure in S3. This is the argument a judge should hear, in the order they should hear it.

| Design decision | Harm it addresses | Why the obvious alternative is worse |
|---|---|---|
| The assignment is the central object (D1) | Requirement drift; "is AI allowed for this?" | A chat window has no scope. The moment the object is a conversation, every answer loses its authority and its boundaries. |
| Official documents shown **verbatim**, never paraphrased into the UI (C2, D17) | Requirement drift | Summarising the brief is the single most tempting shortcut in this product, and it converts an authoritative document into a fabricated one. |
| An **independent guardrail** that decides from real rules, with a fail-closed default (D7, D8) | Being helped too much; not knowing what is permitted | A prompt clause is unverifiable and untestable. You cannot demonstrate that a system prompt refuses, only that it refused once. |
| The per-assignment **AI Usage Policy** is data, extracted and tutor-approved (D9) | "Is AI allowed for this?" | A platform-wide rule is wrong for every assignment that differs from the average, which is all of them. |
| **Derived effort is prohibited** -- rephrasing, hypotheticals, "just check my approach", step-by-step decomposition (D11) | Being helped too much | These are precisely the shapes the request takes when a student is trying not to violate the rule but still wants the answer. A rule that only catches the blunt request catches nothing. |
| **Tutor approval is the trust boundary** (C3, D21) | Silent hallucination becoming course policy | Auto-publishing model output makes the institution responsible for text no human read. |
| **Anonymous discussion** with a stable pseudonym (D25) | Fear of asking | Attribution is what suppresses the question. A one-off anonymous post would suppress follow-up instead. |
| **Private query** distinct from **public discussion** (D24) | Fear of asking; answering at the wrong altitude | One channel forces every question public, or every question private and therefore unshared. |
| **Aggregate-only analytics** with a k-anonymity floor (D31, D32) | Invisibility of confusion | Per-student dashboards are the obvious analytics feature and they destroy the anonymity that makes the question channel work. The two features cannot coexist. |
| **Difficulty detection combines time and question volume** (D34) | Invisibility of confusion | "Average time: 47 minutes" is data. A milestone that is both slow *and* heavily questioned is a decision. |
| Analytics surface evidence and stop (D35) | Answering at the wrong altitude | Recommending the intervention substitutes the system's judgement for the tutor's. |

### The one sentence the whole design protects

> **The AI must never do the assignment for the student.**

Everything above is a consequence of it. A feature that improves helpfulness while weakening that constraint is rejected, not traded off (`AGENTS.md` S1). This is why the refusal is presented as a capability rather than an apology, and why it is the centrepiece of the demo ([`13-DEMO-STORY.md`](13-DEMO-STORY.md) S4).

---

## 5. Why now

Three things make this buildable at all in a weekend, and make it more than a slide:

1. **Per-assignment policy enforcement is newly cheap.** A model with structured output and a long context can read a brief, a rubric and a policy document and propose a structure that a tutor can review in minutes. Two years ago this was a research project; now it is one prompt and a schema.
2. **The reviewer is in the loop by design, so the model does not have to be right.** The system proposes; the tutor approves. That removes the accuracy bar that would otherwise make a model-generated course artefact irresponsible.
3. **The retrieval problem is small.** An assignment is tens of pages, not a corpus. Postgres full-text is enough (D38), which removes an entire service from the build.

---

## 6. Evidence available in this repository

Everything in this section is verifiable from the repository. Read the provenance table in S7 before quoting any number.

### 6.1 The `archive/canvas-scraper` measurement (retired research)

During the design phase a read-only Canvas discussion scraper was built to answer one question: **what do real student assignment questions actually look like?** It is retired prior work, not part of the product (D45), and is never imported by the app (D44). Its output is the closest thing to field data this project has.

Source: [`archive/canvas-scraper/README.md`](../archive/canvas-scraper/README.md), [`archive/canvas-scraper/out/topic-3205287.meta.json`](../archive/canvas-scraper/out/topic-3205287.meta.json), and `archive/canvas-scraper/out/topic-3205287.md`.

| Measurement | Value | Where it comes from |
|---|---:|---|
| Course id / discussion topic id | 157398 / 3205287 | `meta.json` |
| Topic title | `Assignment 1 Part A Questions` | `meta.json` |
| Authoritative post count (`discussion_subentry_count`) | 33 | Canvas API field |
| Live posts captured | 33 | `meta.json` `stats.live_posts` |
| Deleted posts (tombstoned, reconciled) | 1 | `meta.json` `stats.deleted` |
| **Root questions** (`is_root: true`) | **12** | `meta.json` `stats.roots` |
| Replies | 21 | `meta.json` `stats.replies` |
| Distinct authors | 10 | `meta.json` `stats.distinct_authors` |
| Maximum reply depth | 2 | `meta.json` `stats.max_depth` |
| Authors classified as staff (`teacher`) | 16 posts | `meta.json` `stats.author_roles` (this breakdown totals 34, so it includes the deleted post) |
| Authors classified as `student` | 12 posts | `meta.json` `stats.author_roles` |
| Authors unresolved (`unknown`) | 6 posts | `meta.json` `stats.author_roles` |
| Integrity gate result | `ALL CHECKS PASSED -- 33 live posts, 34 records` | `archive/canvas-scraper/README.md` S5 |
| Offline test suite | 28 tests | `archive/canvas-scraper/README.md` S3 |
| Credential values written to output | 0, enforced by verification check 8 | `archive/canvas-scraper/README.md` S4-5 |

**What this measures, stated precisely.** One discussion topic, in one enrolled course, titled "Assignment 1 Part A Questions", containing 12 separate root posts and 21 replies, from 10 distinct authors, with 16 of the 33 live posts carrying the `teacher` role. The full post text is in `archive/canvas-scraper/out/topic-3205287.md` and is readable by anyone with repository access.

### 6.2 What that observation supports

| Reading | Supported? | How strongly |
|---|---|---|
| Students ask assignment-structure questions in bulk, in one place, in a thread dedicated to one assignment part | **Yes** | Directly measured. A single topic accumulated 33 posts. |
| The same topic area generates many separate root questions rather than one thread with deep discussion | **Yes, for this topic** | Measured shape: 12 roots against 21 replies, maximum depth 2. A shape of many questions and shallow threading is what appears here. |
| Staff answer substantially in the public thread | **Yes, for this topic** | 16 of 33 live posts are from authors classified `teacher`. |
| Staff involvement is uneven or identity resolution is incomplete | **Yes** | 6 posts are attributed to authors the scraper could not classify; two active answerers are recorded as unresolvable in the scraper README, and they are tagged `unknown` rather than dropped. Any "answers only" filter must treat `unknown` as include, or it discards real answers. |
| This proves the problem exists at RMIT across all units | **No, and this doc does not claim it.** | One topic is not a sample. It is one observation, treated as a design input, not as a statistic. |
| Students avoided asking out of fear | **No.** | Not measurable from post metadata. The fear-of-asking claim in S2.1 is a qualitative claim (S7). |
| Questions were frequently ambiguous or under-specified | **No.** | The post text exists, but no content analysis was performed and no count is reported here. |

### 6.3 Why the observation matters anyway

It is one concrete instance of the exact shape the product is built for: **a dedicated thread, one assignment part, a dozen separate questions, an active tutor presence, and a shallow reply structure.** It is also a demonstration that the questions are concentrated by assignment stage -- the thread is named for Part A, not for the course. If the confusion were diffuse, per-assignment structure would buy nothing. This one observation says it is not diffuse.

Treat it as a design input with a sample size of one, and say so when presenting it. Presenting a single thread as a cohort study is the kind of exaggeration that loses a judge's trust on the first question.

### 6.4 Evidence that is not in this repository

The following would strengthen the argument and do not exist here. They are listed so nobody presents them as if they do, and so a teammate who has a legitimate source can add them properly:

- Any cohort size, failure rate, drop-out rate, question-response time, or marks distribution.
- Any survey of student hesitation, or any interview data.
- Any comparison against a control group or a pilot.
- Any Canvas statistic beyond topic 3205287.
- Any external research citation. Nothing outside this repository was consulted for this document. **If a claim cannot be sourced from a file in this repository, it is written here as a design judgement or left out.**

---

## 7. Provenance of every claim

| Claim class | Definition | Where it appears | How to verify |
|---|---|---|---|
| **FACT (repository)** | Directly readable from a file in this repository | S6.1 counts; S3 descriptions of what an LMS is | Open the cited file |
| **MEASURED (single observation)** | Counted, but from one topic with no sampling | S6.1, S6.2 | `archive/canvas-scraper/out/topic-3205287.meta.json`; re-run `python verify.py --course 157398 --topic 3205287` |
| **QUALITATIVE / DESIGN JUDGEMENT** | A reasoned inference about behaviour, not measured here | S2 (all harms), S3 (why tools fail), S4 (why this shape), S5 | Read the reasoning; it is stated as an inference, not as data |
| **INTENT** | What the product is designed to do, not what has been observed | S2.3, S5.1 | [`02-SCOPE.md`](02-SCOPE.md) for what is built; this is a claim about design, not outcome |
| **NOT CLAIMED** | Explicitly absent | S6.4 | Absence is the verification |

The frozen inputs -- `docs/project idea.md` (the problem statement), `docs/assignment_assistant_project_handoff.md` (S52-53 current workflows, S65 value proposition, S66 risks) and `hackathon info/info.md` (the theme, "Innovating Education") -- are the origin of the argument in S2 through S4. They are the team's own prior reasoning, and this document is a judge-facing restatement of it, not new evidence.

---

## 8. How to say this in ninety seconds

For the opening of the pitch (`13-DEMO-STORY.md` S2, beat 1), the short version:

> A tutor writes one assignment brief. Three hundred students read it alone, at night, and every one of them has the same handful of questions. The brief cannot answer them -- it is a PDF. The forum can, but posting there costs something. So students either guess, or they paste the brief into a general-purpose AI, which will happily write the code for them and turn an ambiguity into a misconduct case. The tutor finds out which parts were confusing when the marks come in.
>
> That is the gap: the thing with the authority cannot answer, and the things that can answer have none. AssignMate makes the assignment itself the thing you work inside -- the original brief, kept verbatim; a tutor-approved structure; an anonymous place to ask; and an AI that reads this assignment's own rules and refuses the rest. The refusal is the feature.

---

## 9. Related

| Doc | Relationship |
|---|---|
| [`02-SCOPE.md`](02-SCOPE.md) | What is actually being built out of this argument. |
| [`10-RUBRIC-ALIGNMENT.md`](10-RUBRIC-ALIGNMENT.md) | How this argument scores against Problem Relevance and Desirability & Impact. |
| [`13-DEMO-STORY.md`](13-DEMO-STORY.md) | The five-minute version of S8, with the refusal beat. |
| `docs/project idea.md` | Frozen origin of S2 and S3. |
| `docs/assignment_assistant_project_handoff.md` | Frozen origin of S4 and S5; S63 (wow moments), S65 (value proposition), S66 (risks). |
| `archive/canvas-scraper/README.md` | The measurement cited in S6, and its stated limits. |
| `hackathon info/info.md` | The theme the argument is pitched against. |
