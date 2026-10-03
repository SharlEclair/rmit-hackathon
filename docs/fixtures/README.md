# `docs/fixtures/` -- the committed demo fixtures

These four files are the **committed demo inputs** for the Assignment Assistant. They are the
load-bearing artefact of Phase 1 (WP-02): every later phase's tests read them, and
`docs/handoff/03-INVARIANTS.md` trap **T8** is the reason they are committed rather than generated
on demand.

| File | What it is | Consumed by |
|---|---|---|
| `demo-brief.pdf` | The assignment brief, as a **text-layer** PDF, 4 pages, A4 | WP-04 ingestion (extract + page-anchored chunking), WP-07 document viewer and Map page anchors, WP-08/09 guardrail grounding |
| `demo-rubric.pdf` | The marking rubric for the same assignment, as a text-layer PDF, 3 pages, A4 | WP-04 ingestion (`rubric_sections`), WP-09 "what does the rubric reward" answer |
| `demo-ai-policy.md` | The assignment's AI-use policy **source document** | WP-05 `policy-draft` -> `ai_policy_rules`, WP-08 `policy-source` -> enforceable guardrail rules |
| `cohort-seed.json` | The reproducible synthetic-cohort seed: 37 students, 5 milestones, seeded activity | WP-02 `generate.ts` (demo state), WP-11 analytics and the D34 difficulty signal |

Decision **D46** places them here, in `docs/`, rather than in `app/`: they are reviewable as demo
inputs and they stay inside the hackathon's public-repository requirement. `docs/06-DATA-MODEL.md`
section 6.10 records the rules a fixture must obey.

---

## 1. Regenerating

```powershell
# from the repository root
node app/scripts/make-fixtures.mjs

# or from app/
node scripts/make-fixtures.mjs
```

Both invocations write all four files into `docs/fixtures/`. The generator resolves that directory
from its own location, so the working directory does not matter.

There is nothing to install. `app/scripts/make-fixtures.mjs` imports **only** Node built-ins
(`node:fs`, `node:path`, `node:url`). No PDF library is used and none may be added: the PDFs are
written byte by byte as valid PDF 1.4.

### Regeneration is byte-identical

A second run produces the same bytes. This is a requirement, not a nicety -- WP-02's acceptance
criteria say the seed is deterministic and `docs/06-DATA-MODEL.md` section 6.10 rule 4 says the same
script must produce the same cohort on any machine. To prove it:

```powershell
node app/scripts/make-fixtures.mjs
Get-FileHash -Algorithm SHA256 docs/fixtures/demo-brief.pdf, docs/fixtures/demo-rubric.pdf, `
  docs/fixtures/demo-ai-policy.md, docs/fixtures/cohort-seed.json | Format-Table Hash, Path
node app/scripts/make-fixtures.mjs
Get-FileHash -Algorithm SHA256 docs/fixtures/demo-brief.pdf, docs/fixtures/demo-rubric.pdf, `
  docs/fixtures/demo-ai-policy.md, docs/fixtures/cohort-seed.json | Format-Table Hash, Path
# the two hash sets must match, filename for filename
```

The hashes observed when these fixtures were committed, for four consecutive runs including one
launched from `app/` instead of the repository root:

| File | SHA256 | Bytes |
|---|---|---:|
| `demo-brief.pdf` | `9FE88B18AFBA806B3B40EB0074E19B13886362A40C2F6F1D5DC897B37659E4DA` | 12661 |
| `demo-rubric.pdf` | `31E26BB92F711FA936FEE8567BF55032CAF588C100D1C84C26183D648F31338D` | 9553 |
| `demo-ai-policy.md` | `4A97AF58F79921B3B26A21C2979903AD43AC53B0C7913BCBC988AF7627DAA95A` | 9037 |
| `cohort-seed.json` | `AFE508AD1E2DDD747BD1A6BBD340E5A8D7A1974DF7461F1ED8DDB9AC0A48F34D` | 44792 |

If a regeneration produces a different hash, one of the determinism rules below has been broken --
most likely a `Date`, a `Math.random()`, a `toLocaleString()`, or a change to the order in which the
generator's PRNG draws are consumed (see section 5).

What makes that true:

- no `Date`, no timestamps, no clock reads anywhere in the generator;
- no `Math.random()`, no `crypto.randomUUID()` -- one PRNG, `xorshift32`, one fixed seed constant
  (`0x5eed1234`, recorded in `cohort-seed.json` as `generation.prng`);
- no locale-dependent formatting: no `toLocaleString`, no `Intl`, no `toFixed` on a value that
  depends on a locale; every string is built with explicit ASCII;
- LF line endings for `demo-ai-policy.md` and `cohort-seed.json`; the PDFs are assembled from
  `latin1` buffers with the byte order fixed in code;
- `cohort-seed.json` is `JSON.stringify(..., null, 2)` with the key insertion order fixed by the
  generator's source order, so it does not depend on object-key iteration in a way that varies.

---

## 2. `demo-brief.pdf` -- the assignment brief

**The assignment is fictitious.** Topic: a written **Case Analysis and Design Proposal Report** for
**COSC2407 Digital Systems Design** (RMIT University Vietnam, term 2026-S2), weighted 40%,
due Friday 23 October 2026 at 23:59 local time. The case is a university student
wellbeing check-in service whose use has fallen away six weeks after release; the student analyses
it and proposes a conceptual response.

### What the brief is required to contain, and where

| Requirement | Where it appears | Why |
|---|---|---|
| An explicit **word count requirement** | "Word count .......... **1,800 words**"; Section 4, *"The report body is 1,800 words. This is a stated requirement of the assessment and not a suggestion or a target."* | Trap **T9**: the golden set needs the word-count requirement visible in the extracted text. |
| Assessment name, course code, due date, task description | The header table and Section 2 | Makes the fixture a plausible assessment rather than lorem ipsum. |
| Required sections / deliverables | Section 3, Parts A-E plus reference list and appendix | Gives ingestion real structure to propose a Map and milestones from. |
| **No** mention of concurrency, threading, parallelism, race conditions or asynchronous programming | Nowhere. Verified over the extracted text -- see section 6 | Trap **T9**. The word must not be smuggled in, in any form, including inside a heading or a rubric example. |
| No solution steps | The brief states *what* is assessed, never *how*. It says in terms: *"This document states what is assessed and what you must submit. It does not tell you how to produce any part of the report."* | Constraint **C1** applies to the fixture too: if the source document contained solution steps, the Assistant would have legitimate solution material to ground on. |

### PDF properties

- PDF 1.4. One `/Catalog`, one `/Pages` tree, four `/Page` objects, `/MediaBox [0 0 595 842]`
  (A4) on every page.
- One font resource: `/F1` -> `/Type1` `/Helvetica` with `/Encoding /WinAnsiEncoding`.
- Every content stream uses `BT /F1 <size> Tf <x> <y> Td (<text>) Tj ET`, is **uncompressed** (no
  `/Filter`), and carries a non-zero `/Length`.
- A correct `xref` table and `trailer` with `/Size`, `/Root` and `/Info`.
- The footer on every page says the content is a synthetic demo fixture.

### Why the text layer is real and inspectable

`docs/04-TECH-ARCHITECTURE.md` D43 makes a Map node's link back to its source **page** a product
feature, so a single-page or image-only PDF cannot exercise it. Extracting with the pinned
extractor must yield **4** pages for the brief and **3** for the rubric.

The streams are uncompressed deliberately: if extraction is ever in doubt, the text layer is
visible with `Select-String` over the raw file, with no PDF tool in the loop.

---

## 3. `demo-rubric.pdf` -- the marking rubric

Five criteria, rendered as text lines in a criterion / weight / pass-standard / distinction-standard
table, plus a weight summary. **The weights sum to 100** and the file states the total.

| # | Criterion | Weight |
|---|---|---:|
| 1 | Problem framing | 20 |
| 2 | Design rationale (Part B) | 25 |
| 3 | Stakeholder and needs analysis | 20 |
| 4 | Risks, ethics, and conclusion | 25 |
| 5 | Communication, referencing, and assessment compliance | 10 |
| | **Total** | **100** |

Criterion 5 is also where the word-count requirement is enforced (1,620 to 1,980 words), which
keeps the brief and the rubric consistent on the same number.

---

## 4. `demo-ai-policy.md` -- the AI-use policy source document

The document a tutor would upload, from which the per-assignment AI Usage Policy is extracted
(**D9**: policy is per-assignment data, not a platform constant). It is written as policy prose a
university would actually publish: sections, numbered clauses, defined terms, and an explicit list
of permitted and prohibited uses.

Every clause is phrased so an implementer can turn it into a rule. The two the guardrail needs
first:

- **Allowed:** section 4.2 -- a student may ask an AI tool to explain a sentence in the brief, in
  plain language, or to explain what a rubric criterion is asking for.
- **Prohibited:** section 3.1 -- generative AI must never produce the answer to this assessment:
  the analysis, the Part B design rationale, the reasoning, or any step-by-step decomposition that
  would lead a reader to the answer.

Section **3.1** is the statement of **C1** in the fixture's own words, and section **3.1** plus
**6.2** are the clauses a `PROHIBIT` rule is extracted from. Section **3.2** (no AI evaluation of
student work), **3.3** (no AI-authored sentences in the submission) and **3.5** (do not disclose
another person's work) each become a separate rule. Section **5** states the mandatory disclosure,
which is what the demo's AI-use beat refers to.

The policy deliberately names the boundary as being **on the request, not the format** (section 6.4)
because that is the claim the image half of demo beat 5 tests (`docs/13-DEMO-STORY.md` section 6.2,
C6).

---

## 5. `cohort-seed.json` -- the synthetic cohort

Read this file as the source of truth for the demo cohort. It is deliberately hand-auditable: it
carries not only the generated rows but the algorithm, the seed constant, and the aggregates the
analytics phases are expected to compute from them.

### What it asserts, and how to check it by eye

| Assertion | Field to read |
|---|---|
| **37 synthetic students** | `cohort.syntheticStudentCount`, and `students.length` |
| **>= 4 approved milestones** | `milestones[*].publicationStatus` -- all five are `APPROVED` |
| **Exactly one milestone above BOTH cohort averages** | `difficultySignal.aboveBothCohortAverages` (one entry), `difficultySignal.assertedExactlyOne`, and the booleans in `difficultySignal.perMilestone` |
| **At least one bucket below the k-anonymity floor of 5** | `kAnonymityExercises.belowFloor` and `cohortAggregates.suppressedMilestoneKeys` |
| **A fixed PRNG seed constant and the algorithm** | `generation.prng.seedConstant` = `1592594996` (`0x5eed1234`), `generation.prng.algorithm` = `xorshift32`, plus `generation.drawOrder` |
| **No real personal data** | `containsRealPersonalData: false`, `syntheticDataStatement`, and the rows themselves |

### The milestone buckets

Eligibility for the difficulty rule is the k-anonymity floor on **both** inputs, so the cohort
baselines are computed over eligible milestones only (`docs/08-ANALYTICS-SPEC.md` section 5.1
rule 5). A suppressed bucket is never a baseline and can never be flagged.

| Key | Milestone | Contributors | Eligible | Mean elapsed time | Questions | Question rate |
|---|---|---:|---|---:|---:|---:|
| M1 | Understanding the brief and the assessment requirements | 10 | yes | 2609 s | 4 | 0.400 |
| M2 | Reading the case pack and locating the evidence | **3** | **no -- below the floor** | 2116 s | 2 | 0.667 |
| M3 | Design rationale for Part B -- explaining your own decisions | 20 | yes | **5755 s** | **18** | **0.900** |
| M4 | Stakeholder and needs analysis | 14 | yes | 2304 s | 6 | 0.429 |
| M5 | Risks, ethics, referencing and final submission | 18 | yes | 2753 s | 6 | 0.333 |

Cohort means over the four eligible milestones: elapsed time **3355 s**, question rate **0.5155**.
With `MARGIN_TIME = MARGIN_Q = 0.10` (`docs/08` section 5.1):

- threshold elapsed time = **3691 s**; M3 at 5755 s is the only milestone above it;
- threshold question rate = **0.5670**; M3 at 0.900 is the only *eligible* milestone above it.

So **M3 is the one milestone above both averages** (D34), and M2 -- which has the second-highest
question rate but only three contributors -- is correctly **not** a candidate. That is the
interesting case to demo: the milestone that looks busiest per student is suppressed rather than
flagged, which is exactly what the floor is for.

### Why 37 students, and why the shape is what it is

- 37 is fixed by `docs/handoff/01-STATE.md` section 5 item 6 and trap **T8**.
- A cohort this size makes the k-anonymity floor a **live** constraint, not a theoretical one: with
  a floor of 5, a bucket of 3 is a person, not a statistic (`docs/01-DECISIONS.md` D32).
- One bucket sits **below** the floor (M2, 3 contributors) and four sit **at or above** it, so a
  single demo run shows both an `Insufficient data` cell and a real metric.
- The two-stage mean is used for elapsed time, not a mean over intervals
  (`docs/08` section 4.3, trap **T1**). `cohort-seed.json` records the seeded per-student intervals
  as well as the resulting mean, so the two-stage computation can be checked from the file alone.

### Determinism of the seed

`generation.drawOrder` states the order in which the PRNG is consumed: milestone by `displayOrder`,
student by `index`, intervals in order, then the single question draw. Change that order and you
change the cohort -- which is why it is written down in the file rather than left implicit in the
generator.

The seed values in the file are **not** recomputed by the application at runtime. WP-02's
`generate.ts` reads them and writes the demo state; WP-11's aggregation then computes the metrics
from the resulting events. `cohort-seed.json` carries the expected aggregates so the two can be
reconciled without a second PRNG implementation.

---

## 6. Verification

### Extracting the text layer

```powershell
# a throwaway script in the OS temp dir, never in the repo
node "$env:TEMP\extract.mjs"
```

with the pinned extractor `app/node_modules/pdfjs-dist/legacy/build/pdf.mjs` (`pdfjs-dist@6.3.289`),
calling `getDocument({ url })` then `getPage(p)` / `getTextContent()` per page. Expected:

| Check | Brief | Rubric |
|---|---|---|
| `doc.numPages` | `4` (`>= 3`) | `3` (`>= 2`) |
| `1,800 words` present in the extracted text | yes | n/a |
| `/concurren/i` matches | **no match** | **no match** |

pdfjs may print `Warning: UnknownErrorException: Ensure that the standardFontDataUrl API parameter
is provided` on stderr. That is a standard-font *rendering* warning, not an extraction failure: the
page count and the text both come back correctly, which is all this fixture promises. Nothing in
the app renders these two files as raster images.

### Checking the cohort seed

```powershell
node -e "const s=require('./docs/fixtures/cohort-seed.json');console.log(s.students.length, s.milestones.filter(m=>m.publicationStatus==='APPROVED').length, JSON.stringify(s.difficultySignal.aboveBothCohortAverages), JSON.stringify(s.kAnonymityExercises.belowFloor))"
```

(use `JSON.parse(readFileSync(...))` under an ESM-only context). Expected: `37`, `5`, `["M3"]`,
and one below-floor bucket, `M2` with 3 contributors.

### What has **not** been verified here

- No app code consumes these fixtures yet. WP-04's ingestion gate, WP-07's viewer, WP-08's golden
  set and WP-11's analytics are unbuilt, so "the fixture works" means "the fixture extracts and
  parses", not "the pipeline runs".
- The PDFs are not checked against a second extractor or a desktop reader. `pdfjs-dist@6.3.289` is
  the pinned extractor for this project, and it is the only one the acceptance criteria name.
- `cohort-seed.json` is validated as JSON and audited against the WP-02 acceptance criteria. It is
  not yet validated against the migration's `CHECK` constraints, because those migrations do not
  exist yet.

---

## 7. Constraints these fixtures obey

| Constraint | How |
|---|---|
| **C1** -- the AI never produces the assignment's answer, code, or solution steps | The brief contains no solution material to ground on; the AI policy states the prohibition as section 3.1. |
| **C2** -- official requirements are never paraphrased and presented as the requirement | The PDFs are the requirement and are stored verbatim; nothing in these fixtures offers a paraphrase layer. |
| **C7** -- no secrets, no real personal data | No credential appears in any fixture; every cohort name is `Demo Student NN`, every address is on `student.demo.rmit`, every identifier begins with `synthetic-`. |
| **D9** -- per-assignment AI policy, from the source document | `demo-ai-policy.md` is the source; the rules are extracted and tutor-approved, never hard-coded. |
| **D32** -- k-anonymity floor of 5, applied in the query | `cohort-seed.json` ships one bucket below the floor so suppression is exercised, and records the rule. |
| **D34** -- difficulty needs above-average time **and** above-average questions | The seed guarantees exactly one such milestone (M3) and records the arithmetic. |
| **D46** -- fixture material lives in `docs/fixtures/` | All four files are here, and committed. |
| **T8, T9** | The counts in section 5, and the word-count-with-no-concurrency rule in section 2. |
