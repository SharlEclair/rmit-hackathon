# Fallback recordings

`11-BUILD-PLAN.md` WP-12 requires "a recorded fallback for every beat that can fail, captured on
Saturday", and `14-HACKATHON-SUBMISSION.md` section 3 checks for them at 09:00 and again at 11:30 on
submission day. This directory is where they live.

**Status: `AT RISK` -- no recording is present yet.** `pnpm demo:smoke` reports this as a failing check
rather than a warning, on purpose: a smoke test that shrugged at a missing fallback would be hiding the
one thing it exists to catch. Nothing in this repository can capture a recording, because a recording is a
human operating the product; what this file provides is the list, the naming convention, and the reason
each one exists.

## The convention

One file per beat, named `<NN>-<beat>.png` or `<NN>-<beat>.mp4`, numbered in the order the beats appear in
`13-DEMO-STORY.md` section 12. The number is what makes a fallback findable *during* a presentation, when
nobody is reading filenames carefully.

## The beats that need one

Each row is a beat whose failure is plausible on the venue network. The distinction that matters is
**which failures a fallback can cover**: an offline failure is what a recording is for, but a wrong
*answer* is not -- a recording of a refusal beat proves the refusal, and a recording of a wrong answer
would be a recording of a bug.

| Beat | Why it can fail | What the fallback is |
|---|---|---|
| The Assistant refusing a "do my assignment" request | Needs a live provider unless `LLM_PROVIDER=mock` | A short recording of the refusal, **or** the mock provider, which needs no recording at all |
| The Assistant answering a permitted question, with citations | Needs a live provider and retrieval | A recording of the streamed answer with its citation panel |
| The ingestion run producing a proposed structure | Needs a live provider; the slowest beat | A recording of the run, plus the fact that the run's own audit row exists afterwards |
| The tutor approving and publishing | Needs only the database | No fallback needed: it is offline by construction |
| The student checklist round trip | Needs only the database | No fallback needed (**D48**'s round trip is proven by `verify-student.ts` check 6-11) |
| The analytics panel | Deterministic SQL (**D67**), no model call | No fallback needed |

**The strongest fallback is not a recording.** Four of the six beats need no model call at all, and the
two that do work end to end under `LLM_PROVIDER=mock` -- which is a supported mode rather than a stub
(D90), and is how all four acceptance runs are verified. So the rehearsal the run sheet calls "network
**off**" at 09:30 is a rehearsal of the real product, not of a slideshow. The recordings exist for the case
where the *demo machine's* provider key is unavailable but the operator still wants a live provider path
on screen.
