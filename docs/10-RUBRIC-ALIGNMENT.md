# 10 -- Rubric Alignment

**Purpose.** Map every in-scope feature to the criterion it earns marks under, name the evidence a judge will actually see, and state honestly where this project is weak and what the team must do about it.

**Source of the rubric.** [`hackathon info/info.md`](../hackathon%20info/info.md), "Rubric". Six criteria, 50 points total. The band descriptors below are quoted from that file.

**Rule.** No claim of a score. This document does not predict what judges will award; it identifies what a judge would need to see for each band, and whether the plan delivers it. Anything not in [`02-SCOPE.md`](02-SCOPE.md) S2 or S3 earns nothing here, because it will not exist.

---

## 1. Score map at a glance

| Criterion | Max | Landed by | Confidence | Honest read |
|---|---:|---|---|---|
| Problem Relevance | 10 | S3 | High | The strongest criterion. An unglamorous, universally recognisable problem, argued with one piece of field evidence. |
| Desirability & Impact | 10 | S4 | Medium-high | Strong for students, weaker for tutors at MVP scope because the aggregate signal runs on synthetic cohort data. |
| Solution & Creativity | 8 | S5 | Medium | The guardrail and the truth hierarchy are genuinely non-obvious. The rest is a well-shaped product, not a novel one. |
| Design (UI/UX) | 8 | S6 | Medium | Achievable, but this is where a small team with a weekend loses points. Needs a real design pass, not a component library. |
| Functionality | 9 | S7 | Medium-low | The single largest risk. End-to-end or nothing: a broken loop drops this criterion to Developing regardless of how good the code is. |
| Presentation | 5 | S8 | High | Cheapest 5 points on the sheet. A rehearsed five-minute refusal demo is worth more per hour than any feature built on Sunday morning. |
| **Total** | **50** | | | |

### What the team can control, ranked by points-per-hour

1. **Presentation (5)** -- rehearsal, not construction. Highest return.
2. **Functionality (9)** -- gated by the WP-12 smoke test and the offline rehearsal, not by new features.
3. **Design (8)** -- a coherent, small, consistent design language over a few screens. Cheap if decided early, expensive if retrofitted.
4. **Solution & Creativity (8)** -- framing, mostly. The creative work is already designed; it has to be *explained*.
5. **Problem Relevance (10) and Desirability (10)** -- mostly earned by the argument and the demo story. Already drafted in [`09-PROBLEM-AND-RATIONALE.md`](09-PROBLEM-AND-RATIONALE.md).

---

## 2. How to read the tables

Each criterion section has three parts:

- **Band descriptors** -- quoted from the official rubric, so the target is the hackathon's language, not ours.
- **Feature-to-evidence map** -- feature, where it lives, and the observable thing a judge sees.
- **What top marks require** -- the specific, checkable difference between a Good band and an Excellent band for this project, and whether the plan delivers it.

---

## 3. Problem Relevance -- 10 points

| Band | Descriptor |
|---|---|
| **9-10 Excellent** | Addresses a clear, genuine and important problem faced by individuals involved in education. Strong understanding of the problem and its context. |
| 7-8 Good | Addresses a genuine educational problem with good relevance. |
| 5-6 Satisfactory | Problem is relevant, but its importance or understanding could be clearer. |

| Feature / artefact | Where | Evidence the judge sees |
|---|---|---|
| The harm is stated for both user groups, separately | [`09-PROBLEM-AND-RATIONALE.md`](09-PROBLEM-AND-RATIONALE.md) S2 | Two tables naming specific harms for students and for tutors, not one generic "students struggle". |
| The gap is named in one sentence | `09` S1 | "The thing with the authority cannot answer, and the things that can answer have none." |
| Existing channels are analysed, not dismissed | `09` S3 | Six-row table: LMS, email, office hours, static FAQ, general assistant, generic "AI tutor" wrapper -- each with what it is good at *and* why it fails. |
| The problem is evidenced, not asserted | `09` S6, `archive/canvas-scraper/` (retired research) | A real Canvas topic: 33 live posts, 12 root questions from 10 distinct authors, 16 staff-authored posts, integrity-gate verified. |
| The evidence's limits are stated before a judge finds them | `09` S6.2, S6.4 | An explicit list of what the observation does *not* prove, and what data is absent. |
| Every design decision traces back to a harm | `09` S4 | An eleven-row table mapping each decision to the harm it addresses and why the obvious alternative is worse. |

**Strongest single artefact:** the choice to publish the limits of the Canvas evidence (`09` S6.2) alongside the measurement. It is the difference between "we think this is a problem" and "we measured a shape of this problem once and we know exactly how much that is worth". Handled honestly, it raises the credibility of every other claim in the pitch.

### What top marks require

> A judge awarding 9-10 needs to believe the team understands the problem *better than the average team that picked education*. That means naming a mechanism, not a symptom.

- "Students hesitate to ask questions" is a symptom. **"The authoritative artefact is not interactive and the interactive channels are not authoritative, so authority and channel never meet"** is a mechanism. The pitch must say the second thing.
- The context must include the tutor, not just the student. Half the product exists because the tutor cannot see the cohort. This is the difference between a study tool and an education product.
- **Where it could slip to 7-8:** if the presentation spends its problem time on academic integrity alone. Integrity is one harm among five; the argument is about the support gap, of which integrity risk is a consequence.

---

## 4. Desirability & Impact -- 10 points

| Band | Descriptor |
|---|---|
| **9-10 Excellent** | Highly appealing to individuals involved in education with clear potential to meaningfully improve their experience or solve the identified problem. |
| 7-8 Good | Strong educational appeal and likely to provide useful benefits. |
| 5-6 Satisfactory | Some clear value, though adoption or impact may be limited. |

| Feature / artefact | Where | Evidence the judge sees |
|---|---|---|
| A student can get an authoritative answer without asking a person | Assistant grounded in T1-T3 approved content (WP-09) | Asking "what does the rubric reward here?" and getting an answer that quotes the assignment, not a general explanation. |
| Asking is cheap and safe | Anonymous discussion with a stable pseudonym (WP-10, D25) | A post appears as `Anonymous Student #482`; a follow-up post gets the same pseudonym. |
| AI use rules are discoverable in-context | Per-assignment AI Usage Policy, tutor-approved (WP-06, D9) | The policy is on screen in the workspace, and the Assistant cites it when refusing. |
| The tutor gets value without new work | Review-and-approve flow (WP-06, D21) | The tutor edits and approves an AI proposal instead of authoring a workbook. |
| The tutor's scarce time is addressed | Assignment Health with a difficulty signal (WP-11, D34) | One milestone named as slow *and* heavily questioned, with the two inputs visible. |
| Impact is bounded honestly in the pitch | [`02-SCOPE.md`](02-SCOPE.md) S5, [`12-OPERATIONS.md`](12-OPERATIONS.md) S4 | The demo-data marker on analytics; the offline provider stated out loud. |
| The product is not a research project to adopt | One deployable, Postgres, small retrieval (D36-D38) | The team can state the deployment shape in one sentence. |

### What top marks require

> A judge awarding 9-10 must believe people would *want* this, and that it would change something for them. The demo has to show a person being helped, not a system working.

- The refusal beat is simultaneously the creativity pitch and the desirability pitch: it is the moment a student is told "no, and here is what I can do", which is what a responsible institution actually wants.
- **Where it could slip:** the tutor-side impact. The aggregate signal is the weakest evidence in the demo, because it runs on a seeded synthetic cohort ([`02-SCOPE.md`](02-SCOPE.md) S5). Present it as a working mechanism fed by demo data, not as an outcome. Saying "this is how the signal is computed; here is the data we fed it" is credible. Saying "this is what your cohort will look like" is not, and a judge who asks one follow-up question will find that out.
- **Compensating move:** state who the buyer and the user are. Students are users; the institution and the tutor are adopters. One sentence on the adoption path is worth more here than another feature.

---

## 5. Solution & Creativity -- 8 points

| Band | Descriptor |
|---|---|
| **7-8 Excellent** | Highly creative or innovative approach that solves the problem effectively. Demonstrates strong thought beyond obvious solutions. |
| 5-6 Good | Good solution with some originality or creative features. |
| 3-4 Sensible | Sensible solution but relatively conventional or lacking differentiation. |

The risk on this criterion is specific and predictable: **a judge who has seen four "AI study assistant" projects will pattern-match this one to them**, so the differentiation has to be demonstrated on screen rather than asserted in narration.

| Non-obvious idea | Where | Why it is not the obvious solution |
|---|---|---|
| The unit of policy is the **assignment**, not the platform | `05`, D9 | Every teacher has different AI rules. A global policy is wrong for nearly everyone. |
| The guardrail is an **independent, deterministic-first layer**, not a prompt clause | `05` S3-8, D7 | A prompt clause cannot be unit-tested. This one runs offline and is covered by a golden set that includes laundering attempts. |
| **Derived effort** is prohibited -- rephrasing, hypotheticals, "just check my approach", decomposition into steps | `05` S4, D11 | These are the shapes a request takes when someone is trying to stay inside the rule. Catching only the blunt request catches nothing. |
| Explicit **truth hierarchy** T1-T5, with lower tiers unable to override higher ones | `06` S2, D14 | Prevents a student discussion post from silently becoming the requirement. Most products have no concept of this. |
| The **refusal is the product**, not a limitation | `13` S6 | The market's default is maximum helpfulness. Here, helpfulness is deliberately bounded and the boundary is the differentiator. |
| **Approval as a state machine** with retained provenance | `06` S3, D22 | Turns "the tutor checked it" from a convention into an enumerable, testable transition set. |
| **The Map is non-authoritative on purpose** | `07` S4.3, D18 | Interpretation and authority are rendered as visually different objects. |
| Anonymous discussion **feeds official knowledge** only through tutor publication | D24, O8 | Peer help increases without granting students authority, and without auto-promotion. |
| Difficulty is a **conjunction** (slow *and* heavily questioned) | `08` S5, D34 | A single metric is data; the conjunction is a decision. |

### What top marks require

> "Strong thought beyond obvious solutions" is demonstrated by naming the design *you rejected*, because that shows the thought was a choice.

- In the pitch, say the rejected alternative out loud: *"the obvious build is a chatbot with a nicer system prompt. We rejected that because you cannot demonstrate that a system prompt refuses, and because a platform-wide AI policy is wrong for every assignment that differs from the average."*
- The guardrail golden set is the concrete proof of "thought beyond the obvious": 53 cases (`05` S11), all executing, including a request laundered inside a quoted assignment sentence, running with no network.
- **Where it could slip to 5-6:** if the pitch leads with ingestion and the workspace. Those are the table stakes. The refusal, the per-assignment policy, and the truth hierarchy are the creative content, and they should be the first three things a judge hears after the problem.

---

## 6. Design (UI/UX) -- 8 points

| Band | Descriptor |
|---|---|
| **7-8 Excellent** | Highly intuitive, visually clear and easy to navigate. Design strongly supports the solution. |
| 5-6 Good | Clear and usable design with only minor UX issues. |
| 3-4 Satisfactory | Generally understandable and usable, but has noticeable design/UX issues. |

This is the criterion most likely to be under-served by a small team that spends its time on the guardrail. It is recoverable, but only with an explicit design decision made early and held.

| Design requirement | Where | Evidence the judge sees |
|---|---|---|
| Authority is legible at a glance | `07` S4.2-4.3, C2, D17-D18 | The brief and the Assignment Map look like different classes of object. The Map carries `Assignment Map (AI-generated interpretation)`. |
| Approval status is always visible | `07` S2.5 and S7.3, C3 | The `AI generated - requires tutor approval` badge in every pre-approval state. |
| One AI surface, not five | `07` S4.7, D13 | A single assistant panel reachable from every workspace tab. No agent names, no pipeline diagram, no model picker. |
| Vocabulary is consistent across UI and docs | `15-GLOSSARY.md` | "Elapsed time" everywhere, never "time worked". `Anonymous Student #482`, exactly that shape. |
| Empty and error states exist | `07`, `12` S8 | A rejected upload names the accepted formats. `Insufficient data` appears instead of a misleading number. |
| The refusal is designed, not an error | `13` S6, `05` S10 | The refusal names the policy, offers the safe alternative, and looks intentional. |
| A deliberate visual language, not defaults | `07`, `AGENTS.md` S5.1 | Tailwind plus a small owned primitive set. No component library that imposes its own design language. |
| Three or four screens done properly beat twelve done poorly | [`02-SCOPE.md`](02-SCOPE.md) S2 | Review, Workspace, Assistant, Assignment Health. |

### What top marks require

> "Design strongly supports the solution" means the visual hierarchy encodes the product's argument. Here the argument is **authority**: official versus interpretation, approved versus proposed, evidence versus conclusion.

- A judge should be able to tell, from a screenshot alone and with no explanation, which text is the official brief and which is the AI's interpretation. If they cannot, the design is not carrying its weight (C2).
- Consistency is scored faster than beauty. One spacing scale, one type scale, two accent colours, one card shape. Inconsistency reads as unfinished, and unfinished reads as 3-4 regardless of how good the best screen is.
- **Where it could slip:** a dozen half-styled screens. Fix by cutting screens, not by styling faster -- which is exactly what [`02-SCOPE.md`](02-SCOPE.md) S3's cut order is for.
- **Cheap wins:** the empty state, the loading state during ingestion, and the provenance badge. All three are highly visible in a demo and all three are small.

---

## 7. Functionality -- 9 points

| Band | Descriptor |
|---|---|
| **8-9 Excellent** | Core solution works reliably end-to-end and successfully demonstrates the intended experience. |
| 6-7 Good | Core functionality works with only minor issues or limitations. |
| 4-5 Satisfactory | Main concept works but some functionality is incomplete or unreliable. |
| 2-3 Developing | Partially functional; significant parts are incomplete or require workarounds. |

This criterion punishes breadth harder than it punishes ambition. A working five-step loop outscores an eight-step loop with two broken steps, because the band descriptor is about the *core solution working end-to-end*.

| Loop step | Feature | Reliability evidence |
|---|---|---|
| 1 | Tutor uploads the brief, rubric and AI policy (WP-04) | Works with `LLM_PROVIDER=mock`, i.e. with the network off |
| 2 | Ingestion proposes structure, milestones, checklist, FAQ candidates, policy, one ambiguity flag (WP-04, WP-05) | Schema-validated; a validation failure is a visible refusal, never a silent bad state (D16) |
| 3 | Tutor reviews, edits and approves (WP-06) | The transition state machine is unit-tested, including illegal transitions |
| 4 | Student reads the verbatim brief and navigates the Map (WP-07) | The document viewer renders the original; nothing re-authors it |
| 5 | Checklist starts, elapsed time accrues (WP-07) | Unit-tested, including idle-inclusive elapsed time (D33) |
| 6 | **Assistant refuses a prohibited request and answers a permitted one** (WP-08, WP-09) | Handled by deterministic code before any model call; the golden set runs offline |
| 7 | Anonymous discussion, tutor moderation, FAQ publication (WP-10) | Endpoint tests assert no identity leak |
| 8 | Tutor sees aggregate insight and one difficulty area (WP-11) | Unit-tested, including the k-anonymity floor and the conjunction rule |

### What top marks require

> "Works reliably" and "end-to-end" are both load-bearing. Reliability is demonstrated by the thing working twice in a row, in front of the judge, on a network nobody controls.

- The gate is `pnpm demo:smoke` passing from a clean clone on the venue network, with the offline configuration rehearsed ([`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) WP-12).
- The reliability claim that matters most is the one about the guardrail: **the refusal is deterministic and runs without a model call.** Say that out loud. It converts "we hope the AI refuses" into "the refusal is code, and here is its test suite".
- **Where it could slip to 4-5:** one broken step. A judge who sees a spinner that never resolves or a 500 on stage discounts the whole build. This is why the fallback table in [`13-DEMO-STORY.md`](13-DEMO-STORY.md) S12 has an entry for every beat that can fail, and why the fallbacks are recorded on Saturday rather than Sunday morning.
- **Honest limitation to state before a judge finds it:** analytics runs on a seeded synthetic cohort, and student audio and video uploads are out of scope under O11 ([`02-SCOPE.md`](02-SCOPE.md) S5). Both are stated, not hidden, and both have a reason.

---

## 8. Presentation -- 5 points

| Band | Descriptor |
|---|---|
| **5 Excellent** | Exceptionally clear and engaging explanation of the problem, solution, demo and impact. |
| 4 Good | Clear and effective presentation covering the important elements. |
| 3 Satisfactory | Understandable presentation but some elements lack clarity or polish. |

Note that this criterion names **four** things: problem, solution, demo, and impact. A pitch that spends all five minutes in the demo caps itself at 4 no matter how good the demo is.

| Required element | Where it is prepared | Time |
|---|---|---|
| Problem | [`13-DEMO-STORY.md`](13-DEMO-STORY.md) S2 beat 1; `09` S8 | 45 s |
| Solution | `13` beats 2 and 4 | Demonstrated, not described |
| Demo | `13` beats 2-7 | ~3 min |
| Impact | `13` beat 8 | 25 s |
| AI-use disclosure, said aloud | [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) S5 | 20 s, and it is a requirement, not a courtesy |
| The rejected alternative | `13` beat 4 speaker notes | 1 sentence |

### What top marks require

> "Exceptionally clear and engaging" is a rehearsal property. It is acquired by running the script three times, not by writing it once.

- The pitch must answer a question the judges did not have to ask. The three that matter: *what happens when a student asks it to do the assignment* (refusal beat), *how do you know it refused rather than got lucky* (deterministic guardrail plus golden set), and *how did you use AI* (disclosure, said aloud).
- Language discipline: no "revolutionise", no "seamlessly", no "leverage". Plain sentences about what the thing does.
- **Cheapest 5 points on the sheet.** Three rehearsals of a four-minute script is roughly ninety minutes of work, and it protects the Functionality score at the same time.

---

## 9. Feature-to-criterion matrix

A feature earns marks under more than one criterion. This is the full mapping, so nothing built goes unclaimed and nothing claimed is unbuilt.

| Feature (from [`02-SCOPE.md`](02-SCOPE.md)) | Relevance | Desirability | Creativity | Design | Functionality | Presentation |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Tutor upload and ingestion | | x | x | | x | x |
| Tutor review and approval (C3) | x | x | x | x | x | x |
| Per-assignment AI Usage Policy (D9) | x | x | x | x | x | x |
| Guardrail with golden set (D7, D8, D11) | | x | **x** | | **x** | **x** |
| The refusal path (C1) | x | **x** | **x** | x | x | **x** |
| Verbatim brief viewer (C2, D17) | x | x | x | **x** | x | x |
| Assignment Map, labelled non-authoritative (D18) | | x | x | **x** | x | x |
| Map node to source page (CV-4, D43) | | x | x | x | | **x** |
| Checklist and elapsed time (D19, D33) | | x | | x | x | |
| Anonymous discussion (D25-D27) | x | **x** | x | x | x | x |
| Private Query, and Reply vs Publish (D24) | x | x | x | x | x | x |
| FAQ publication (D24) | | x | x | | x | x |
| Assignment Health and difficulty signal (D31-D35) | x | x | x | x | x | x |
| Truth hierarchy (D14) | | | **x** | | x | x |
| Approval state machine with provenance (D22) | | x | x | | **x** | |
| Demo-data marker and offline provider honesty | | x | | x | | **x** |

Bold marks the criterion a feature most contributes to. Note the pattern: **the guardrail, the refusal, the per-assignment policy and the truth hierarchy carry Creativity and Functionality at the same time.** They are the highest-value code in the repository and they are also the riskiest, which is why [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) gives the guardrail its own packet, an offline test gate, and a warning against leaving it to Saturday night.

---

## 10. Honest weaknesses and how to compensate

| Weakness | Why it is real | Compensation |
|---|---|---|
| **No real cohort data.** Analytics runs on a seeded synthetic cohort of 37 students generated by the seed script. | Two days, no ethics approval, no real users. | Say it first. Show the aggregation, the k-anonymity floor and the conjunction rule as working code over labelled demo data. Present the *mechanism*, never an outcome. |
| **No deployment.** The MVP assumes a long-lived Node server ([`12-OPERATIONS.md`](12-OPERATIONS.md) S5). | Not a judging criterion, and the venue network is a risk. | One rehearsed local run and a recorded fallback. Do not spend Saturday night on hosting. |
| **Student audio and video uploads are not supported.** Image, PDF and plain-text uploads are in scope (O11); audio and video are refused at the picker. | Transcode-and-process is the expensive half of multimodal intake. | Frame it as a deliberate boundary with a reason, and show the refusal at the picker if asked. C6 still binds the shipped request path, so pasted code and pasted drafts are guarded identically. |
| **The rehearsed demo will not exercise DOCX/PPTX ingestion, and a scanned PDF with no text layer is not parsed.** | DOCX and PPTX are accepted and extracted (`04` S6, **D57**), but the demo path uses a text-layer PDF only ([`02-SCOPE.md`](02-SCOPE.md) S2.4), and a scanned PDF with no text layer is flagged for tutor attention rather than guessed at. | Name the accepted formats (PDF, DOCX, PPTX, PNG/JPEG, plain text, Markdown), show the text-layer PDF path, and show the flag rather than a guess. Framing: an explicit supported-format contract with an honest limit, not a silent failure. |
| **A judge may pattern-match this to "another AI study assistant".** | The category is crowded. | Lead the pitch with the refusal and the per-assignment policy. Never present the workspace as the innovation; it is the delivery mechanism. |
| **Design will be thin if the weekend goes badly.** | Small team, high-risk guardrail work. | Decide the visual language in WP-01 and style screens as they are built. Cut screens before cutting consistency ([`02-SCOPE.md`](02-SCOPE.md) S3). |
| **The rubric rewards breadth and this plan is narrow by design.** | Only one loop is built. | Breadth is not a criterion. "Core solution works reliably end-to-end" is the Functionality descriptor, and it is 9 points. Narrow and working beats broad and broken. |
| **Presentation time is capped and there are four required elements.** | Problem, solution, demo, impact, plus the AI disclosure. | The timed script in [`13-DEMO-STORY.md`](13-DEMO-STORY.md) exists precisely so nothing is cut by accident, and the cut order is pre-decided. |
| **One piece of field evidence, from one discussion topic.** | No sampling, no interviews, no survey. | Publish the limits ([`09-PROBLEM-AND-RATIONALE.md`](09-PROBLEM-AND-RATIONALE.md) S6.2). A judge who is told the sample size trusts the rest; a judge who discovers it does not. |

---

## 11. The three things a judge must remember

If a judge retains only three sentences from the pitch, these are the ones that map to the most points:

1. **"The AI refuses, on purpose, because that is what the assignment's own policy says."** -- Creativity, Desirability, Presentation, and the whole ethical core (C1).
2. **"The refusal is code, not a prompt, and it runs without a model call."** -- Functionality and Creativity, and it is the answer to the obvious follow-up question.
3. **"The original brief is never paraphrased. Interpretation is a different object on screen."** -- Problem Relevance, Design, and constraint C2.

---

## 12. Related

| Doc | Relationship |
|---|---|
| [`02-SCOPE.md`](02-SCOPE.md) | The only features that can earn marks. S5 is the honesty contract for S7 of this doc. |
| [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) | The packets that produce the evidence in S3-S8. |
| [`13-DEMO-STORY.md`](13-DEMO-STORY.md) | How S8 is actually delivered in five minutes. |
| [`09-PROBLEM-AND-RATIONALE.md`](09-PROBLEM-AND-RATIONALE.md) | The substance behind S3 and S4. |
| [`14-HACKATHON-SUBMISSION.md`](14-HACKATHON-SUBMISSION.md) | The AI-use disclosure, which the rubric's presentation requirement specifically asks for. |
| `hackathon info/info.md` | The official rubric, quoted in each band table. |
