# 13 -- Demo Story

**Purpose.** A five-minute live demo script that can be performed by two people, on a laptop, on a network nobody controls. Timed to the second, with the exact words, the screen state, and a fallback for every beat that can fail.

**Authorities.** Wow moments prioritised from the handoff S63 (Wow #1 upload to workspace, #2 AI that refuses, #3 Assignment Map, #4 cohort intelligence). Demo flow candidate from handoff S62. Only features in [`02-SCOPE.md`](02-SCOPE.md) S2 and S3 appear on screen.

**Setup assumed.** The demo runs with the configuration in [`12-OPERATIONS.md`](12-OPERATIONS.md) S7.1. Both pre-seeded demo states exist in the database before the presentation starts.

---

## 1. The five-minute shape

| Beat | Time | Screen | Purpose |
|---|---:|---|---|
| 0. Setup | before the clock | Two tabs, pre-seeded | Nothing on stage is typed for the first time |
| 1. Problem | 0:00-0:45 | Title slide, then the brief PDF | Earn Problem Relevance |
| 2. Upload to workspace | 0:45-1:40 | Tutor: new assignment, then review | Wow #2 (upload) |
| 3. Approval | 1:40-2:00 | Tutor: the approve action | Prove the trust boundary (C3) |
| 4. Student workspace | 2:00-2:35 | Student: brief, then Map, then the source page | Wow #3 (Map) |
| **5. The refusal -- text, then an image** | **2:35-3:23** | **Student: Assistant** | **Wow #1 (refusal). The most important moment in the demo.** |
| 6. A legitimate question | 3:23-3:43 | Student: Assistant | Proves the coach is useful, not just restrictive |
| 7. Ask safely, share the answer | 3:43-4:27 | Student: Discussion, then Tutor: Publish, then FAQ | Wow #4 (anonymous knowledge) |
| 8. Cohort insight and close | 4:27-5:00 | Tutor: Assignment Health, then the closing slide | Impact, and the AI-use disclosure |

Total spoken content is 5:00. Nobody speaks over the end. There is no "and finally".

Beat 5 is 48 seconds and splits internally: 22 seconds for the text refusal, 26 for the image refusal that follows it. The other beats are unchanged from the original timing except beat 7, which was trimmed from 50 seconds to 44 to pay for the addition ([`02-SCOPE.md`](02-SCOPE.md) S2.2 S6a).

**Two people, two jobs.** The **narrator** never touches the keyboard. The **driver** never speaks except the three scripted assistant strings in beats 5 and 6 (two questions and the image-turn line). If one person does both, the pacing collapses and a failed click becomes a monologue about a failed click.

**One scripted acknowledgement of a fallback.** Beat 5 has a second half, and it can fail independently of the first. If the attachment path does not work live, the narrator says so out loud -- "the attachment does not want to cooperate, so I will show you the recorded one" -- rather than silently skipping it. Announcing a fallback costs four seconds and looks like composure. Skipping it looks like the feature does not exist.

---

## 2. Beat 1 -- Problem (0:00-0:45)

**Screen.** Title slide: "Assignment Assistant". Then cut immediately to the assignment brief PDF, full screen, and scroll it slowly for the rest of the beat. Do not show the product yet.

**Say, nearly verbatim:**

> One tutor writes one assignment brief. Three hundred students read it alone, at night, and every one of them has the same handful of questions.
>
> This document is the authority. It is also a PDF, so it cannot answer anything.
>
> The places that *can* answer are not safe places to ask, or they are not authoritative, or they take a day. So students guess -- or they paste this brief into a general-purpose AI, which will happily write the code for them, and turn an ambiguity into a misconduct case.
>
> The tutor finds out which parts were confusing when the marks come in. Every unit at every university already has this problem. It is not a tooling gap, it is a gap between authority and channel.
>
> We made the assignment itself the thing you work inside.

**Audience should notice.** It is the assignment on screen, not a chat window. That is deliberate and it is the first thing the pitch says about the product (D1).

**Setup requirement.** The brief PDF is open at page 3 or later, not page 1, so the scroll has somewhere to go.

**Fallback.** If the PDF does not render, the same beat works over the frozen brief file in a text editor: scroll it and say "this is the original document; that is the point". If the projector is not working, deliver the beat from the narrative slide. **This beat has no product dependency and cannot fail on technical grounds.**

---

## 3. Beat 2 -- Upload to workspace (0:45-1:40)

**Screen.** Switch to the tutor tab. New assignment screen. The driver drags `docs/fixtures/demo-brief.pdf` (brief + rubric) and the AI policy document into the upload zone. The upload completes, the ingestion state appears, and the review screen opens.

**Say:**

> A tutor uploads three documents: the brief, the rubric, and the AI usage policy for this assignment.
>
> What comes back is a proposal. Not a summary -- a proposal, marked as a proposal. [point at the AI-generated badge] Every artifact here carries that badge until a human approves it.
>
> Structure, milestones, a checklist, FAQ candidates, an AI usage policy drafted from the document, and one thing we think is a contradiction in the brief.
>
> And here is the part that matters more than any of it: none of this is the requirement. The requirement is still that PDF. What you are looking at is interpretation, and the product says so on the screen.

**Audience should notice.** The provenance badge, and the deliberate separation between the official document and the AI's interpretation of it. This is constraint C2 rendered as UI.

**Setup requirement.** Both demo states are pre-seeded ([`02-SCOPE.md`](02-SCOPE.md) S5): `state-1-before-ingest` and `state-2-after-ingest`. The narration above runs over whichever state is live.

> **Where those two states come from, and what was broken at the Phase 7 rehearsal.** D81 assigns them to
> WP-12 rather than to the seed: "**the demo's pre-approval states are not this seed's job** ... WP-12's
> `demo/reset.sh` is what produces them". **`demo/reset.ps1` was not producing them**, so this beat had
> almost nothing to show: the seeded assignment carries **54 `PUBLISHED` artifacts against 1
> `NEEDS_REVIEW`**, and the badge that is this beat's whole point rendered for almost nothing (**I-56**).
>
> `pnpm demo:state` now creates both states beside the seeded one, and it is step 4 of `demo/reset.ps1`.
> Verified: state 2 renders **55 `NEEDS_REVIEW` artifacts with the `AI generated - requires tutor approval`
> badge present**, where the seeded assignment still fails that check; state 1 is a `draft` with no current
> structure, so gate rule G1 hides it and a student request returns `404`.
>
> **Which assignment to open depends on the beat.** Beats 2 and 3 open `Demo state 2 -- after ingest
> (proposal awaiting review)`. Beats 4-8 open the seeded cohort assignment, `Case Analysis and Design
> Proposal Report`, because gate rule G1 makes `PUBLISHED` the only student-visible status.

**Fallback.** See S9, scenario 2 and scenario 3. The pre-seeded after-ingest state is the fallback, and the narration adapts to it with one changed sentence: *"this was generated a moment ago; here is the proposal."*

---

## 4. Beat 3 -- Approval (1:40-2:00)

**Screen.** Review screen. The driver edits one checklist item's wording, discards one candidate, and clicks Approve. The badge changes state on screen.

**Say:**

> The tutor edits what is wrong, throws away what is not useful, and approves the rest. Until that approval happens, nothing here is visible to a student. That is not a setting -- it is the only transition that makes content student-facing, and it is one state machine in one module, which means we can test it.

**Audience should notice.** That "approve" is a real state transition with a visible effect, not a button that says thank you. This is constraint C3 and it is worth Functionality marks (S7, [`10-RUBRIC-ALIGNMENT.md`](10-RUBRIC-ALIGNMENT.md)).

**Fallback.** If the edit or discard interaction misbehaves, approve without editing and say: *"the edit is the same state machine; I'll take the approval path."* Never debug on stage.

---

## 5. Beat 4 -- The student workspace (2:00-2:35)

**Screen.** Switch to the student tab. Brief tab: the original document, page-anchored. Then the Map tab. Then click one Map node and land on the cited page of the brief.

**Say:**

> The student's workspace starts with the original document, page by page, unedited. Nothing here is a summary.
>
> Next to it is the Assignment Map -- and notice it does not look like the brief, because it is not the brief. It is labelled as interpretation.
>
> Watch this. [click a Map node] That node came from this page. The rubric section, the milestone, the checklist item, and the sentence in the original document that produced all three are one object.

**Audience should notice.** The moment the Map node lands on the exact source page. **This is Wow #3** and it is the cheapest visual proof in the whole demo that interpretation and authority are different objects (D18, D43, CV-4).

**Fallback.** If CV-4 was cut, do not click. Stay on the Map tab, point at the source-page indicator on each node, and say: *"each node records the page it came from; the deep link is the next increment."* Saying that is better than a broken click. If the Map does not render, use the pre-seeded Map screenshot and narrate over it.

---

## 6. Beat 5 -- THE REFUSAL (2:35-3:23)

**This is the single most important moment in the demo.** It is Wow #1 (handoff S63), it is the product's ethical core (C1), and it is the point on which Solution & Creativity turns. Slow down. Do not fill the silence while the response streams.

The beat has two halves on one screen, 48 seconds total: the pasted-code refusal, then the same request arriving as an image. **The pasted-code half is the canonical beat and does not change** -- it is what the team rehearsed. The image half exists to land one sentence: *the policy binds regardless of how the work is presented* (`05` S6.4, D10, C6).

### 6.1 First half -- text refusal (0:00-0:22)

**Screen.** Student tab, Assistant panel open, milestone active. The driver types exactly:

```text
Here's my code. Tell me what's wrong with it.
```

**The expected response, and what to point at:**

```text
I can't inspect or modify your implementation under this assignment's AI policy.

Part B asks you to explain your design decisions, so the explanation has to be yours.

I can help with: interpreting the requirement you're working on, what the rubric
rewards here, or planning your own next steps.
```

**Say, after the response has landed:**

> That is the product. A general-purpose assistant answers that question; it writes the fix, and that is the exact moment an ambiguity becomes an academic integrity case. This one read this assignment's policy and refused -- and offered what it *can* do instead.

### 6.2 Second half -- the same request as an image (0:22-0:48)

**Screen.** Same panel. The driver clicks `+`, attaches `demo/assets/failing-code-screenshot.png`, and types:

```text
Same thing, but here is a screenshot instead.
```

The upload is accepted -- it is a permitted modality -- and the guardrail classifies it `UP1`. **The request is refused anyway.** Do not rush the transition; the audience needs to see that the chip uploaded cleanly before the refusal lands.

**The expected response:**

```text
I cannot inspect or fix your implementation under this assignment's AI Usage Policy.

What I can help with: understanding what the requirement asks for, finding the
exact wording in the brief, and suggesting questions you can ask yourself before
you continue. You can also ask your tutor privately.
```

**Say, and then stop talking:**

> Same request. Different format. Same answer.
>
> This is the part that matters most about the design. The guardrail is not a filter on text -- it classifies what a file *contains*. A screenshot of your own code is your work, and uploading it does not change what the assistant is allowed to do with it.
>
> [switch to the terminal] Two refusals, two turns, zero model calls. It is code with a test suite, not a hopeful prompt. And it names *this* assignment's policy, so turn on a different assignment and the boundary moves -- because the policy is data, not a prompt.

**Audience should notice, in order:** the refusal; that it cites *this assignment's* policy; that the image was accepted but the request was still refused; and that the guardrail is a tested code path, not a hopeful prompt.

**Setup requirements**
1. The terminal is already open, showing the guardrail decision log from the pre-run, with both verdicts, the rule ids (`P5`, `UP1`) and the model-call counter at zero. Do not run anything live in this beat unless the run has been rehearsed and is fast.
2. `demo/assets/failing-code-screenshot.png` exists locally: a screenshot of a code editor showing an error, taken on this project, with nothing confidential visible. Capture it on Saturday.
3. The attachment path is exercised in rehearsal. If it has not been, the second half is cut (see S11) and the beat runs as text only.

### 6.2a Blockers verified at the Phase 7 freeze -- read before promising this beat

Measured on the live system, not inferred. **The capability is real and the server side is complete; three
things outside the code are missing, and all three are demo-day prerequisites rather than defects.**

| What | State | Evidence |
|---|---|---|
| **The `+` picker and the chip UI** | **ABSENT.** `07` section 4.7.2 rule 5 specifies the control; `07-UI-UX-SPEC`'s panel has no such component, and handoff **I-48** records the whole Attachment UI as deliberately unbuilt | `app/src/components/assistant-panel.tsx` has no file input; a `grep` for a picker finds none |
| **The server-side modality refusal** | **WORKS, and is better than the script assumes.** A `.wav` upload is refused `415 UNSUPPORTED_FORMAT` with `details.rule = "UP5"` and the allowed list -- before storage and before any extraction | live `POST /api/student/uploads` with `audio/wav` |
| **The server-side guardrail scan gate** | **WORKS and fails closed.** An upload whose extraction failed (`extractionStatus: failed`) is refused entry to an Assistant turn: `400 VALIDATION_FAILED`, `details.uploadIds`, *"One or more attachments have not passed the guardrail scan and cannot be sent."* A malformed image cannot reach the model | live `POST .../assistant/messages` with that upload id |
| **The classifier reaches a live model** | **WIRED.** `createGuardrailClassifierPort` defaults to `getLlmClient()`, so a real screenshot is classified by the real vision path | `src/lib/guardrail/classifier-port.ts:160` |
| **`demo/assets/failing-code-screenshot.png`** | **ABSENT.** `demo/assets/` does not exist | `Test-Path demo/assets` -> False |

**What this means for the beat, stated plainly.** Without the picker there is no way to attach a file *on
camera*, so beat 5's second half cannot be performed live through the UI. The two options are (a) capture
the recording the fallback already prescribes, or (b) narrate the second turn while showing the guardrail
log, whose two classifications (`P5` and `UP1`) are real. **Option (a) is preferred** and is what S12
scenario 4 already says; the honest sentence is *"the attachment is not cooperating, so I will show you the
recorded version."*

**Do not** resolve this by uploading through a REST client on stage. It would work, and it would read as a
product with no upload button -- which is worse than the stated fallback, because the audience would
correctly conclude that the interface cannot do the thing being narrated.

**The image asset is not optional.** Because the scan gate fails closed, a screenshot must extract
*successfully* for the classifier to see it: a placeholder or a tiny malformed PNG produces
`extractionStatus: failed` and the turn is refused **before** the guardrail classifies it -- a `400`, not
the `UP1` refusal the beat is about. That refusal is the correct behaviour (it is C6 doing its job), but it
is the *wrong refusal* for this beat, which is why S12 scenario 3's rule about refusing "for the wrong
reason" applies here too.

**Fallback, first half.** See S12, scenario 3. If the live assistant is unavailable, the refusal is the one beat that must still happen: show the recorded response and the guardrail log, and say plainly *"this was recorded on the live system ten minutes ago; here is its decision log."* Honesty costs nothing here and the beat survives.

**Fallback, second half.** See S12, scenario 4. If the attachment path fails live, say so and fall back to the text-only refusal that has just landed: *"the attachment is not cooperating, so I will show you the recorded version."* Then either play the recorded image refusal or drop to the guardrail log and say: *"the second turn is classified `UP1` -- the same rule as the text turn -- and both refused with no model call."* **The second half must never be skipped silently.** A quiet omission reads as a feature that does not exist; a stated fallback reads as a feature that exists and is being demonstrated carefully.

---

## 7. Beat 6 -- A legitimate question (3:23-3:43)

> **THE TYPED QUESTION WAS CHANGED AT THE PHASE 7 REHEARSAL, AND THIS BEAT IS NOW `AT RISK`.**
>
> The scripted question was `What does the rubric actually reward in Part B?`. **That question does not
> produce an answer** -- measured twice on fresh sessions, it returns `ESCALATE_TO_TUTOR` with
> `["RET_NO_MATCH","ESC4"]`, the documented response to a retrieval miss.
>
> **The permitted path itself works, and that is the useful half of the finding.** Across 13 diverse
> questions, **9 answered** with `ALLOW`/`POLICY_APPROVED` and 2-10 citations each. The failures fall into
> two clean classes:
>
> | Class | Examples | Result |
> |---|---|---|
> | **Works** -- definitional and procedural | `"What is a design rationale?"`, `"What does APA 7 mean?"`, `"What do I do first?"`, `"How do I submit my assignment?"`, `"Show me the section headings in the brief."`, `"Can you help me find the exact wording in the brief?"` | `ALLOW`, 10-34 token frames, 2-10 citations |
> | **Fails** -- "where/what at *this* assignment" facts | `"What is the deadline?"`, `"Where do I upload my report?"`, `"Can you suggest questions I can ask myself?"` | `ESCALATE_TO_TUTOR` `SOURCES_SILENT_ON_ASSIGNMENT_FACT` |
>
> **The content is present** -- the rubric holds 17 chunks, 21 mentioning rubric, weight, per cent or "Part
> B" -- so this is a **retrieval-matching** limitation, not a missing document.
>
> **Two cautions recorded rather than hidden.** First, an earlier revision of this note named
> `"What is the word count?"` as a verified answer; a five-run measurement showed it refused
> `DERIVED_EFFORT_REFUSED` on the `DE12` post-check **5 out of 5**, so the single success that produced that
> claim was the fluke. **One successful call is not evidence a path works.** Second, the beat must be
> rehearsed **on a fresh session or under `LLM_PROVIDER=mock`**: the Assistant's budget is
> **12 calls per session** (`LLM_MAX_CALLS_PER_SESSION`), and once spent every turn returns `429` with **no
> SSE frames at all** -- indistinguishable from a broken server (**I-54**). Change the question below only
> to another from the working row above, never back to the original.
>
> Changing the *product* was rejected at the freeze: retrieval thresholds are Phase 2 code, the freeze says
> docs and slides only, and a threshold tuned to make one demo question work is exactly the change that
> breaks others.

**Screen.** Same Assistant panel, so the refusal is still visible above the new turn. That adjacency is the point: do not clear the transcript. The driver types the second scripted question.

**Say, as the driver types:**

> So is it useless? No. Same milestone, different question.

**Typed** (changed -- see the note above; the original abstract phrasing escalates to a tutor):

```text
How do I submit my assignment?
```

**The answer quotes the brief and cites the page.** Point at the citation.

**Say:**

> It answers, and it cites the source. It answers from the highest-authority document available and it shows
> you where in the original that came from. Refuses the work, answers the assignment.

**Audience should notice.** The contrast with the previous beat, on the same screen, a few seconds apart. Refusal and usefulness are not opposites here; that is the whole design.

**Fallback, and it is no longer optional.** Open the pre-seeded Assistant transcript for this question and
narrate over the citation. The citation is the point of the beat, not the live call. **Rehearse the fallback
as the primary path at least once**, because retrieval is the least predictable component in the demo and
this beat is the only place its output is on screen.

---

## 8. Beat 7 -- Ask safely, and share the answer (3:43-4:27)

> **Measured stable at the Phase 7 rehearsal.** Five runs each: the tutor's discussion read returned `200`
> with 9 threads and **no identifying field** every time, the Query list returned `grouping: "milestone"`
> with 6 groups every time, and both shapes were identical across runs. Beat 7 needs no special handling --
> unlike beat 6, whose question must be chosen from a measured list (**I-53**, **I-55**).

**Screen.** Switch to the student's Discussions tab. A thread exists, posted as `Anonymous Student #482`. The driver posts a short reply. Then switch to the tutor tab, Discussions: the same thread, still `Anonymous Student #482`, with no name anywhere, and the driver clicks Publish.

**Say** (44 seconds -- the narration below is trimmed to the two sentences the beat is worth; do not add to it, this is the beat that absorbs the image half of beat 5):

> A student asks something they would not raise in a tute -- anonymously. Their display name is a pseudonym, stable for this assignment, and the tutor side cannot see who they are. Not hidden in the UI: the query behind this screen does not return an author identifier at all.
>
> The tutor publishes the answer. That is the only path by which a student's question becomes official cohort knowledge.

**Audience should notice.** Both screens show the same pseudonym, and the tutor's screen shows nothing else. This is constraint C4, and D26 is absolute on purpose.

**Setup requirement.** The anonymous thread and its reply are pre-seeded. The driver posts the reply only if the run-through proved it lands quickly; otherwise the seeded reply is on screen and the narration is past tense about it.

**Fallback.** If Discussion interactions fail, show the seeded thread in both tabs and say: *"this thread was created by the seeded student account; the point is what the tutor's screen does and does not return."* If Publish fails, show the already-published FAQ entry and say the same. **The guarantee is the visual, not the interaction.**

---

## 9. Beat 8 -- Cohort insight and close (4:27-5:00)

> **Measured stable at the Phase 7 rehearsal.** Five runs: analytics returned `200` with **ready=4,
> insufficient=1, belowFloor=0** and no identity field on every run. The single `insufficient_data` row is
> the below-floor milestone, which is the k-anonymity floor working rather than a gap -- and it is worth
> pointing at on screen, because it is the floor made visible (**I-55**).

**Screen.** Tutor tab, Assignment Health. Point at one row: a milestone with above-average elapsed time and above-average question volume, flagged as a potential difficulty area. Point at an `Insufficient data` cell. Then cut to the closing slide.

**Say:**

> Last screen. The tutor sees the per-milestone resolution rate, elapsed time, and question volume -- aggregate only, never a student. Milestones with fewer than five students show "insufficient data", because a bucket of three is a person, not a statistic.
>
> This milestone is flagged because it is both slow and heavily questioned. Not slow alone, not busy alone: both. We are not telling the tutor what to do about it. We are telling them where to look.
>
> That is the loop. Upload once, approve once, and the cohort's confusion becomes something the tutor can see.
>
> And to be clear about how this was built: generative AI was used heavily in the design phase and in writing the documentation, and it is used at runtime inside a guardrail we wrote and can test. The disclosure is in the repository, and it says exactly what was AI-assisted and what was not. Thank you.

**Audience should notice.** The two-input signal (not a bare chart), the k-anonymity floor with a visible example, and the disclosure said out loud rather than buried in the Devpost text.

**Fallback.** If the analytics page fails, use the pre-seeded screenshot. If the cohort data looks empty, the narration becomes: *"the aggregate and the floor are real code over demo data; the cohort here is seeded."* **Say it before a judge can ask.**

---

## 10. Wow moments, prioritised

From handoff S63, reordered by value to this pitch rather than by build order:

| Rank | Wow (handoff S63) | Beat | Why it is ranked here |
|---:|---|---|---|
| 1 | **Wow #2 -- AI that refuses to help** | 5 | It is the whole product in one exchange, it is the emotional peak, it is un-copyable by a generic chatbot, and it carries Creativity, Desirability and Functionality at once. Beat 5 runs it twice -- once as text, once as an uploaded image -- which makes the point that the boundary is on the request, not the format. |
| 2 | Wow #1 -- Upload becomes an intelligent workspace | 2 | Proves the product exists, not just the idea. Strong, but every AI product can demo ingestion. |
| 3 | Wow #3 -- Assignment Map back to the source page | 4 | Visually the most satisfying ten seconds, and the clearest proof of C2. Ranked below upload because it depends on CV-4 landing. |
| 4 | Wow #4 -- Cohort intelligence | 8 | The strongest tutor-side moment, weakened at MVP scope by synthetic cohort data ([`02-SCOPE.md`](02-SCOPE.md) S5). |

Only four moments. There is no fifth. A fifth would cost the refusal beat its space, and the refusal beat is worth more than everything else combined. The image half of beat 5 is not a fifth wow moment -- it is a second proof of the first one.

---

## 11. If you are running long: what to cut, in order

Decide the cut from the stage, not in advance, using the clock. Cut from the top down.

| Order | Cut | Cost | Recovery |
|---:|---|---|---|
| 1 | The student reply post in beat 7; show the seeded thread instead | 10 s | None. The guarantee is visible either way. |
| 2 | The edit-and-discard interaction in beat 3; go straight to Approve | 15 s | One sentence: "the edit path is the same state machine." |
| 3 | **Beat 5's second half, the image refusal** -- run text only | 26 s | Say: "the same request as an image classifies the same way; the policy binds the content, not the format." Then move on. **Announce it.** A silent drop reads as a missing feature. |
| 4 | Beat 6, the legitimate question | 20 s | Fold into the close: "it also answers permitted questions, citing the source." **Do not cut this if there is any other option** -- without it, the pitch says the AI only refuses. |
| 5 | Beat 1, down to two sentences | 20 s | "One brief, three hundred students, each reading it alone. It cannot answer, and the places that can answer are not safe or not authoritative." |
| 6 | Beat 7, entirely | 44 s | Say in the close: "there is also anonymous discussion, and only a tutor can publish an answer into the official FAQ." Weaker, but the refusal has already landed. |

Cut 1 and 2 first, then 3. The image half is worth more than the reply post or the edit-and-discard interaction, so it is ranked below them -- but it is worth less than the legitimate-question beat, which is why it sits above cut 4.

**Never cut, under any time pressure:** beat 5's **first half** (the text refusal), beat 3 (approval), the verbatim-brief moment in beat 4, and the AI-use disclosure sentence in beat 8.

### The sixty-second version

If the judges cut the slot without warning: beat 1 compressed to two sentences, beat 5's first half exactly as scripted with the recorded response, beat 4's Map-to-page click, and the disclosure sentence. Nothing else. The refusal is the demo.

---

## 12. Fallback table

Every beat that can fail, what to do, and what to say. **Rehearse the fallbacks, not just the script** -- a fallback discovered on stage is just a failure with extra steps.

| # | If this fails | Do this | Say this |
|---|---|---|---|
| 1 | Venue wifi, model provider, or both | The demo runs with `LLM_PROVIDER=mock`: the whole loop works offline. The pre-seeded states mean ingestion need not be run at all. | "We are running the offline provider so the venue network cannot take the demo down. The loop is identical; only the model is substituted." |
| 2 | The app will not start | Fall back to the recorded video for beats 2-7, and narrate live over it. Keep beats 1 and 8 live. | "I'll walk you through it on a recording from ten minutes ago rather than burn your time." |
| 3 | The Assistant refuses for the *wrong* reason, or gives a soft answer | Do not re-ask on stage. Show the recorded refusal plus the guardrail decision log. | "Let me show you the same request against the recorded run, with its decision log." |
| 3b | **Beat 6's permitted question refuses, escalates or fails schema (`I-53`)** | **This is the expected case, not an edge case.** Run beat 6 from the pre-seeded transcript and narrate over the citation. Do not retype the question on stage. | "Let me show you this one from the seeded run, so the citation is on screen." |
| 4 | **The image half of beat 5 fails live** -- the picker, the upload, the scan, or the response | Say so, then fall back to the text refusal that has just landed. Either play the recorded image refusal (`demo/fallback/refusal-image.mp4`) or point at the guardrail log and read the two classifications off it. | "The attachment is not cooperating, so I will show you the recorded version." Then: "the second turn classifies as `UP1` -- the same rule as the text turn -- and both refused with no model call." **Never skip this silently**; the acknowledgement is scripted in S1. |
| 5 | The Assistant answers a prohibited question (guardrail hole) | Stop the beat. Show the golden set instead. | "That is the bug this test suite exists to catch -- and it just earned a new case." Honesty scores better than a cover-up a judge can see through. |
| 6 | Ingestion times out or returns nothing | Switch to the pre-seeded after-ingest state. | "This proposal was generated a moment ago; here it is." |
| 7 | The Map node deep link does not land on the page | Stay on the Map, point at the node's source-page indicator. | "Each node records the page it came from. The deep link is the next increment." |
| 8 | The PDF viewer does not render | Show the frozen brief file in a text editor, scrolled slowly. | "This is the original document. That is the entire point of the beat." |
| 9 | Publish to FAQ fails | Show the already-published FAQ entry. | "This entry was published by the tutor a moment ago; publishing is the only path to official knowledge." |
| 10 | Assignment Health fails to load | Show the pre-seeded screenshot of the same view. | "Here is the same screen from the seeded run." |
| 11 | The projector dies | Deliver beats 1, 5 and 8 from memory and the recorded video. The refusal works as a spoken story. | Keep the exact refusal wording. Do not improvise it. |
| 12 | The laptop dies | Second laptop, second cloned copy, pre-seeded, with the recording on it. Nothing on stage depends on one machine. | "Switching machines -- thirty seconds." |
| 13 | A judge asks "did you build this today?" | Answer precisely. | "The application was written during the event; the commit history is in the repository. The design documents and the Canvas research predate it, and the disclosure says which is which." |
| 14 | A live question during the demo | Do not answer mid-beat. | "Good question -- I'll take it at the end so I don't lose your place." |
| 15 | You overrun at 3:40 and beat 7 has not started | Cut beat 7. Go to beat 8. | Nothing. Just go. |

### Four fallbacks that must be pre-recorded on Saturday

Not Sunday morning. Files, not intentions:

1. **`demo/fallback/full-loop.mp4`** -- a screen recording of beats 2 through 7, on the live system, in one take.
2. **`demo/fallback/refusal.png`** or `.mp4` -- the text refusal exchange plus the guardrail decision log showing verdict, rule id, and zero model calls.
3. **`demo/fallback/refusal-image.mp4`** -- the image half of beat 5 on the live system: the chip uploading, the `UP1` classification, the refusal. This is the newest beat and therefore the one most likely to fail unrehearsed.
4. **`demo/fallback/health.png`** -- the Assignment Health view with the difficulty-area row and an `Insufficient data` cell visible.

**Status at the Phase 7 freeze: `AT RISK`. None of the four exists.** `demo/fallback/` holds only
`README.md`, which lists the beats and the naming convention. `pnpm demo:smoke` reports the missing
recordings as a **failing** check rather than a warning, deliberately: a smoke test that shrugged at a
missing fallback would hide the one thing it exists for.

**Number 3 is the one to worry about**, because section 6.2a records that its live half cannot be performed
through the UI at all -- there is no `+` picker (I-48). A recording of it therefore requires the upload to
be exercised by some other means on a real screenshot, and the recording is *the* artefact that makes the
beat survivable. If only one of the four gets captured, capture this one.

---

## 13. Pre-demo checklist

- [ ] `demo/reset.sh` run; both seeded states present and verified.
- [ ] `pnpm demo:smoke` exits 0.
- [ ] The full script rehearsed three times. Twice by the same pair, once with the network off.
- [ ] Every fallback file in S12 opens, on the demo machine, without a network.
- [ ] Second laptop has the repo cloned, seeded, and the recording copied locally.
- [ ] Terminal pre-opened with the guardrail decision log from the pre-run visible.
- [ ] Browser at a known state: two tabs, correct sessions, 100% zoom, notifications off, no stale modals.
- [ ] Mains power connected, sleep disabled, second charger in the bag.
- [ ] The exact **three** typed strings copied to a text file and to the clipboard -- the two questions and the image-turn line -- so nothing is typed from memory under pressure.
- [ ] `demo/assets/failing-code-screenshot.png` exists locally and contains nothing confidential.
- [ ] The attachment path in beat 5 has been exercised in rehearsal at least twice, including once with the network off. If it has not, cut the second half and say so (S11, cut 3).
- [ ] `demo/fallback/refusal-image.mp4` recorded and verified openable offline.
- [ ] One person has read the whole script aloud once, to check the words are sayable.

---

## 14. Questions we should expect

Answer briefly and honestly. Each answer below is one or two sentences, and each is true of the design: no answer here claims that code exists yet.

| Question | Answer |
|---|---|
| "Is this just ChatGPT with a system prompt?" | No. The policy decision is a deterministic layer that runs before any model call, and it is covered by a golden set that runs offline. A system prompt cannot be unit-tested. |
| "Who decides what AI use is allowed?" | The tutor, per assignment. The system drafts a policy from the uploaded documents; the tutor approves or edits it. It is data, not a platform rule. |
| "What stops the model from leaking the answer anyway?" | Structured output only, refusal by default on anything unparseable, and a decision log that cites the rule. If a request is refused, no model call is made at all. |
| "Where is the real cohort data?" | There isn't any. The analytics run over a seeded synthetic cohort, and every screen says so. The aggregation, the k-anonymity floor and the difficulty signal are real code. |
| "Would a university actually adopt this?" | The adopter is the unit or the school, not the student. The tutor's cost is one review pass per assignment; the student's cost is nothing. That is the adoption story and it has not been tested. |
| "How do you know students ask anonymously?" | Constraint C4 is enforced in the query layer: the tutor-facing responses do not return an author identifier. There is a test that enumerates the endpoints. |
| "What did AI do here?" | See S15 below and [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) S5. Answer it in full, without hedging. |
| "You showed the same refusal twice -- is that two features?" | No, one feature and one point: the policy is enforced on the request, not the format. Text and an image of the student's own work classify the same way, and both refuse with no model call. |
| "What is not built?" | Student audio and video uploads (refused at the picker), Canvas/LMS integration (excluded by decision, D45/D59, not deferred), and deployment. Image, PDF and plain-text uploads are in scope. All of these are listed with reasons in the scope document. |

---

## 15. The AI-use disclosure, said aloud

The hackathon requires an explanation of **how and why** generative AI was used, in the Devpost submission **and** in the presentation (`hackathon info/info.md`). Beat 8 closes with it. The full written version is in [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) S5.

**These two sentences must not disagree, and an earlier version of this one did.** It said the AI "wrote the
design documentation and the build plan", which directly contradicts S5.1's *"What we did not use AI for"*:
the product decisions, the priority order and the scope cuts are the team's own and predate the hackathon.
The written version is the normative one -- it is what a judge reads -- so this is written to say exactly
what S5.1 says and nothing more. If either changes, change the other in the same commit.

The spoken version, twenty seconds, five sentences:

> Generative AI was used in three places. It organised our own pre-hackathon design thinking into the
> documentation set you have seen, under a working agreement that constrains what it is allowed to write --
> the product decisions, the scope cuts and the refusal-as-feature stance are ours and predate the event. It
> wrote the application during the event; every commit in the repository is dated today, and beside it are a
> numbered decisions register and a register of the traps the AI fell into, so its work is checkable against
> a written contract rather than taken on trust. It runs inside the product, but only behind a guardrail we
> wrote, which refuses by default and can be tested without a model call. And every phase ended with an
> executed command rather than a claim: type-check, lint, the unit suite, a production build and four
> end-to-end acceptance runs. The full disclosure, including what was AI-assisted and what was not, is in the
> repository.

**The spoken version names the registers rather than their sizes, and that is T42 applied to this script.**
An earlier revision said "109 decisions, 41 traps"; the count was 42 by the time it was committed, and the
revision that said 42 was already wrong too. The durable claim is that the registers **exist, are dated, and
are in the repository** -- all three survive any further commit. If a judge asks for the totals, count them
live rather than quoting a file:

```powershell
Select-String docs/01-DECISIONS.md -Pattern '^\| D\d+ \|' | Measure-Object            # decisions
Select-String docs/handoff/03-INVARIANTS.md -Pattern '^\| \*\*T\d+\*\*' | Measure-Object  # traps
git log --format=%ad --date=short | Sort-Object -Unique                               # event-window proof
```

---

## 16. Related

| Doc | Relationship |
|---|---|
| [`02-SCOPE.md`](02-SCOPE.md) | Only S2 and S3 features appear on screen. S5 is what may be claimed about them. |
| [`10-RUBRIC-ALIGNMENT.md`](10-RUBRIC-ALIGNMENT.md) S8 | Why this script is structured around problem, solution, demo and impact. |
| [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) WP-12 | The packet that produces the smoke test, the fallbacks and the rehearsal evidence. |
| [`12-OPERATIONS.md`](12-OPERATIONS.md) S7 | The operations checklist this script assumes. |
| [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) | The AI-use disclosure the presentation must state aloud. |
| `docs/assignment_assistant_project_handoff.md` S62-63 | The original demo flow candidate and the four wow moments. |
