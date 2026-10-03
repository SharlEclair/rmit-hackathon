# 08 - Analytics Spec

**Purpose.** Specify tutor-facing cohort analytics precisely enough to implement and test: every metric as a formula with named inputs, the aggregation windows, the k-anonymity floor and its exact suppression behaviour, the potential-difficulty rule, the topic-grouping approach, the Assignment Health view, and an explicit statement of what must never be computed or displayed. This doc owns D3, D31-D35 and the enforcement point for C5.

**Read with.** `01-DECISIONS.md` D31-D35. `04-TECH-ARCHITECTURE.md` for the route and query-layer shape. `05-AI-GUARDRAILS.md` section 9 for moderation, which analytics deliberately excludes. `06-DATA-MODEL.md` for the physical schema; table and column names here are the interface expectation.

**Status.** Implementation-ready specification. No application source is written here.

---

## 1. Purpose, scope, and inputs

Analytics exist to answer one tutor question:

> Where is the cohort spending time and asking questions, and what evidence supports that?

Analytics do **not** answer "which student is struggling". That question is out of scope by decision (D31), and the answer is deliberately made unavailable rather than merely discouraged.

### 1.1 What analytics is allowed to be

| In scope | Out of scope |
|---|---|
| Aggregate patterns across the enrolled cohort | Any per-student figure, list, or history |
| Per-milestone elapsed time, resolution, question volume | Individual progress views (student-facing only) |
| Topic grouping of tutor-directed questions | Assistant conversation content |
| Potential difficulty areas, with evidence | Prescribed interventions (D35) |
| Assignment Health as one view | A generic chart dashboard |

### 1.2 Inputs

| Input | Source | Notes |
|---|---|---|
| Checklist progress events | `student_checklist_progress` transitions: start, complete, re-open (via `analytics_events` for aggregates) | The only source of elapsed time. |
| Question events | Private `queries` (thread creation) and flagged `discussion_posts` (D49) | Tutor-directed questions only. |
| Assistant turn counts | `guardrail_logs`, `assistant_sessions` | Counted separately (M6). Never used for topic grouping, never used in the difficulty rule. |
| Approved structure | `milestones`, `checklist_items` | Only `APPROVED` or `PUBLISHED` items participate. |
| Enrolment | `enrollments` | Denominator only; never a displayed row. |
| Publication metadata | Assignment publish timestamp | Defines the default window. |

### 1.3 The subject key (how aggregation stays possible without identity joins)

Analytics never joins to `users`. Every analytics event stores a `subject_ref` instead of a student id. The construction is owned by `06-DATA-MODEL.md` section 4.7.1:

```text
subject_ref = lower(hex(HMAC_SHA256(ANON_ID_SECRET, <domain-separated message>)))
```

It is 32 hex characters (`CHECK (subject_ref ~ '^[0-9a-f]{32}$')`), one-way with no reverse mapping, and **domain-separated** from the discussion pseudonym, so a refusal count and a discussion post can never be correlated by value.

Consequences, stated so nobody is surprised later:

1. Distinct-student counting works normally (`COUNT(DISTINCT subject_ref)`).
2. `subject_ref` is used only inside `count(distinct ...)`. It is never selected, ordered by, grouped by, or returned, so an analytics query physically cannot return a name, an email, or a user id.
3. `ANON_ID_SECRET` rotation does **not** re-label existing anonymous posts: the pseudonym number is persisted per (student, assignment), so only identities created after the rotation get different numbers (`06` S4.2, **D55**). It does split analytics continuity from that point, because `subject_ref` is derived rather than stored, so events recorded after a rotation hash to a different value. `.env.example` documents the secret as permanent for the duration of an assignment; this is a second reason for that rule.
4. A student's own progress view reads `student_checklist_progress` (keyed by user), not `analytics_events`. Analytics is a separate, aggregate-only surface.

---

## 2. What must never be computed

Owner of D31. This section is a hard specification, not a preference. Anything listed here is a defect if it exists in a query, an API payload, a cached object, an export, or a UI state - including a debug build.

### 2.1 Never computed

| # | Never | Why it is specifically dangerous |
|---|---|---|
| 1 | Per-student rows of any kind: progress, time, completion, question counts | The core of D31. A per-student analytics table becomes a surveillance product. |
| 2 | Per-student elapsed time, including "average time for this student" | Arithmetic on a 1-student bucket is exact identification by definition. |
| 3 | Grouping or partitioning analytics by `subject_ref` or `anonRef` | A stable pseudonym plus grouping reconstructs an activity history while appearing anonymous. |
| 4 | Sorting analytics by anything derived from identity (first, last, name, id, pseudonym) | Sorting is a join with extra steps; it discloses ordinal information. |
| 5 | Lists of who has not started, who is behind, who has not asked anything | Negative lists are the most requested and the most harmful; they single out individuals by elimination. |
| 6 | Last-active or last-seen timestamps for an individual | A single timestamp is an identity attribute. |
| 7 | Any join from an analytics query to `users`, `enrollments` (beyond the denominator), `anon_identities`, `discussion_author_display`, or `sessions` | The join is how identity leaks back in after the API was designed to prevent it. `06-DATA-MODEL.md` A-ID-6 makes it structurally impossible for `analytics_events` to reference them. |
| 8 | Drill-down from an aggregate to a person | The affordance is the feature; if it exists, D31 is broken regardless of intent. |
| 9 | Per-student exports, CSV or otherwise | An export escapes the product's controls permanently. |
| 10 | Prediction of an individual's outcome, risk score, or grade | Prediction requires per-student features and produces an unappealable label. |
| 11 | Cross-assignment analytics for one student | Links behaviour between units, which the anonymity design deliberately prevents (D27). |
| 12 | Analytics derived from assistant conversation content, uploads, or private query bodies | Private by construction (O9). Counts are permitted (M6); text is not. |
| 13 | Analytics derived from moderation flags or severities | Would create pressure to self-censor and would leak moderation into metrics (05 section 9). |
| 14 | Any aggregate bucket below the k-anonymity floor, including as a count | See section 3. |
| 15 | True min, max, or range of elapsed time for a milestone | The extremes are usually one identifiable person. |

### 2.2 Never displayed

Even when a value is computed internally for a valid aggregate, these must not appear:

1. A student name, email, user id, or `anonRef` anywhere in an analytics view.
2. The count of students behind a suppressed bucket, or a hint that the number is small.
3. A per-student column, row, tooltip, hover state, or accessibility label.
4. A chart whose series or colour encodes a person.
5. A "students who need help" call to action.
6. Percentages that cannot be traced to a named metric id in section 6.

### 2.3 Enforcement points

| Point | Rule |
|---|---|
| API response types | The analytics response types contain no `userId`, `studentId`, `subjectRef`, `anonRef`, `email`, or `name` field. This is a type-level guarantee, not a convention. |
| Repository layer | `src/features/analytics/` may not import the identity-aware repositories. A test asserts the import graph. |
| Query review | Every analytics SQL query must select from aggregate CTEs only, and must contain no `GROUP BY` on a subject column that reaches the response. |
| Export | An export formatter accepts only the aggregate response type. There is no generic table export in the analytics surface. |
| Drill-down affordance | "View related questions" navigates to the Queries tab with `(assignmentId, milestoneId, window)` only. It passes no subject identifier and never filters by one. |
| Discussion lists inside analytics | Related discussion posts render the normal `anonRef` pseudonym, and the list must **not** group or collect posts by `anonRef`, because grouping is per-student activity reconstruction under a pseudonym. |
| Cache keys | `(assignmentId, window, milestoneId)` only. No key may contain a subject identifier. |

---

## 3. k-anonymity and suppression

Owner of D32. The floor exists because small buckets de-anonymise by arithmetic: in a 37-student cohort, "average time 47 minutes" in a bucket of 2 students plus a known roster is often enough to tell whose time it was.

### 3.1 Definitions

| Term | Definition |
|---|---|
| Enrolled cohort size `N_enrolled` | Distinct students enrolled in the assignment's course and enrolled in the assignment. |
| Contributing student | A distinct `subject_ref` with at least one qualifying event for the bucket and window. |
| Bucket | The unit of aggregation: one metric, one milestone (or the assignment total), one window, one filter set. |
| Qualified bucket | A bucket with `contributingStudents >= K`. |
| k-anonymity floor `K` | **5.** A constant, not configuration. Changing it is a decision-register change, not an environment variable. |

### 3.2 The floor rule

```text
if contributingStudents(bucket) >= 5  -> value is computed and reported
if contributingStudents(bucket) <  5  -> the bucket is SUPPRESSED
```

For metrics that count questions rather than students (M5, M6), the contributing-student condition still applies: a milestone whose questions all came from 2 students is suppressed even when the question count is 40.

For school-level rate metrics (M1, M3), the floor applies to the number of students with at least one qualifying event for that metric, not to the number of items.

### 3.3 Exact suppression behaviour

A suppressed bucket:

| Behaviour | Specification |
|---|---|
| Displayed text | The literal string `insufficient data`, lower case, no trailing colon, no parentheses, no number. |
| Value | Not computed, or computed and discarded inside the query layer. Never returned. |
| Count | Not returned. The API field is absent, not zero, not null-with-a-number-elsewhere. |
| Percentage | Not returned. |
| Chart rendering | The bar, point, or segment is rendered as a hatched or empty placeholder labelled `insufficient data`. It must not be rendered as zero, and must not be omitted silently. |
| Sorting | A suppressed row sorts after all qualified rows in the milestone table, in a stable order by milestone order. Its position must not encode the value. |
| Aggregates that include it | Any total that includes a suppressed bucket is itself suppressed. Suppression is contagious upward. |
| Accessibility | The screen-reader label says the same string. No hidden count in `aria-label`, `title`, or a tooltip. |
| Tooltip | A tooltip may say "Fewer than 5 students contributed to this measure." It must not say how many. |
| Hover, URL, or state | No query parameter, hidden field, or local state may carry the suppressed value. |

`insufficient data` is the exact phrase already defined in `15-GLOSSARY.md`. Zero (a real, computed zero with >= 5 contributing students) is displayed as `0`, and the two states must be visually distinguishable.

### 3.4 Complementary suppression

Suppression of one bucket can be undone by the buckets around it. If a milestone group shows a total plus per-milestone values and only one milestone is suppressed, its value can be derived by subtraction.

Rule:

```text
1. Compute all buckets in the group.
2. Suppress every bucket below K.
3. If a group total is displayed beside per-bucket values and exactly one
   bucket is suppressed, additionally suppress the smallest qualified
   bucket in that group (complementary suppression).
4. If fewer than two qualified buckets remain after step 3, suppress the
   group total as well and show only unqualified rows.
5. Re-check: never display a group total and per-bucket values such that a
   suppressed value is derivable by subtraction, by complement, or by
   division.
```

Worked example, milestone group with 4 milestones and a displayed assignment total:

| Milestone | Contributing students | Raw value | Displayed |
|---|---|---|---|
| Requirements | 31 | 18m | `18m` |
| Database Design | 22 | 47m | `47m` |
| API Design | 3 | 72m | `insufficient data` |
| Testing | 4 | 9m | `insufficient data` (direct suppression) |

Two buckets are suppressed, so no single suppression is derivable from the total. If only API Design had been below K, Testing (the smallest qualified bucket) would also be suppressed, and the assignment total would be suppressed too if fewer than two qualified buckets remained.

### 3.5 Rounding and inversion rules

| Value kind | Rounding | Why |
|---|---|---|
| Elapsed time | Nearest whole minute | Rounded minutes cannot be inverted to a start timestamp. |
| Rates and percentages | Nearest whole percent | Cross-multiplying raw counts out of a rounded percent is unreliable. |
| Counts (questions) | Exact, but only in qualified buckets | Question counts are the tutor's main signal. |
| Cohort sizes | Exact `N_enrolled` | The roster size is not a secret from the tutor, and it is needed to read the rates. |

Additional inversion bans: no true min or max of elapsed time (section 2.1 item 15); no percentile beyond p25/p50/p75, and those only when `contributingStudents >= 8`; no bucket whose complement is smaller than `K`.

### 3.6 Small-cohort edge rules

| Case | Rule |
|---|---|
| `N_enrolled < 5` | The whole Assignment Health view shows `insufficient data` with an explanatory line. No metric is computed. |
| Active-students metric | Displayed only when `active >= 5` **and** (`N_enrolled - active >= 5` or `N_enrolled - active == 0`). Otherwise suppressed, because a cohort of 37 with 36 active identifies the one non-participant by elimination. |
| Single-milestone cohort | A milestone whose contributing students equal `N_enrolled` and whose question count is 1 is suppressed: one question plus a known roster can identify the asker in a small cohort. |
| Rate with zero completions | A qualified bucket with zero completions displays `0%` and `0` completions. It is a real measurement, not missing data. |
| No events at all in the window | Every metric in that window shows `insufficient data`; the view states that no activity was recorded in the window. |

### 3.7 Filters that are allowed

Analytics filters are limited to: assignment, milestone, window, and topic group. Filtering by anything that reduces a bucket toward an individual - student, pseudonym, tutorial group of fewer than 5 students, submission status of one person - is not offered, and the API rejects unknown filter keys rather than ignoring them.

---

## 4. Elapsed time semantics

Owner of D33.

### 4.1 Definition

**Elapsed time** is wall-clock time between a student starting and completing a checklist item. It is `completed_at - started_at` for that (student, item) pair. Idle time counts. The UI always says "elapsed time" and never "time worked" or "time on task" (`15-GLOSSARY.md`).

### 4.2 Event rules

| Situation | Rule |
|---|---|
| Start | The first `started` transition for (subject, item). Later visits do not reset it. |
| Complete | The `completed` transition closes the interval. |
| Re-open after complete | **D48 rule:** a re-open does not create a second interval. The first start-to-complete interval stands, `completed_at` is not moved, `reopen_count` increments, and no elapsed time is added. Rationale: overwriting lets an item re-opened days later report a multi-day "elapsed time" and would poison the D34 difficulty signal. D48 resolves the earlier conflict with `06-DATA-MODEL.md` section 8.3 item 8 (latest completion overwrites) in favour of this rule, and names `08` normative because D33 owns the metric definition. |
| Never started, completed directly | An item can be marked complete without an explicit start. Then `started_at` is taken as the earlier of the first `milestone_entered` event and the completion event. If neither exists, the interval is excluded from time metrics and counted in `excludedIntervals`. |
| Item started but never completed | Excluded from elapsed-time metrics, included in resolution-rate denominators. |
| Clock skew and backdating | Server-received timestamps only. A negative interval is clamped to 0 and counted in `excludedIntervals`. |
| Runaway interval | An interval longer than 8 hours is capped at 8 hours for the metric and counted in `cappedIntervals`. A student leaving a tab open overnight must not distort a cohort average. |
| Item unapproved after completion | Progress rows are retained for the student's own view; the item leaves the metric set once it is no longer approved. |
| Milestone moved | `milestone_id` is captured on the progress row at completion time, so a later re-structure does not retroactively move history. |

### 4.3 Two-stage aggregation (so one student cannot dominate)

A milestone with many items would otherwise let one student's 20 items outweigh another student's 2.

```text
perStudentMean(s, m)   = mean( elapsedTime(i, s) for i in items(m) completed by s )
milestoneMeanTime(m)   = mean( perStudentMean(s, m) for s in qualified students of m )
milestoneMedianTime(m) = median( perStudentMean(s, m) for s in qualified students of m )
```

`milestoneMeanTime` is M4 and is what the milestone table displays. `milestoneMedianTime` is available when `contributingStudents >= 8`. Per-item averages may be computed internally for diagnostics but are never displayed, because a per-item average across students is trivially confounded by which students completed it.

### 4.4 Labelling rules

| Where | Text |
|---|---|
| Column header | `Elapsed time` |
| Tooltip | `Time between starting and completing an item. Idle time is included.` |
| Never | `Time worked`, `Time on task`, `Active time`, `Effort` |

---

## 5. Difficulty detection

Owner of D34. Metric ids referenced here are defined in section 6.

### 5.1 The rule

A milestone is a **potential difficulty area** when **both** conditions hold in the same window:

```text
CONDITION A - above-average elapsed time
   milestoneMeanTime(m) > cohortMeanTime * (1 + MARGIN_TIME)
   where cohortMeanTime = mean( milestoneMeanTime(x) ) over ELIGIBLE milestones x
         ELIGIBLE      = qualified bucket (contributingStudents >= 5)
         MARGIN_TIME   = 0.10

CONDITION B - above-average question volume per student
   questionRate(m) > cohortQuestionRate * (1 + MARGIN_Q)
   where questionRate(m)     = questions(m) / activeStudentsInMilestone(m)
         cohortQuestionRate  = mean( questionRate(x) ) over ELIGIBLE milestones x
         MARGIN_Q            = 0.10

potentialDifficultyArea(m) = CONDITION A AND CONDITION B,
                             and m itself must be an ELIGIBLE milestone
                             for both time and question inputs
```

Design notes that are part of the spec:

1. **Both conditions, not either.** `M4` alone is data; the pair is a decision-support signal (D34, handoff 50.5).
2. **Per-student normalisation for questions.** A milestone that simply has more students passing through it would otherwise always look difficult. `questionRate` divides by the students active in that milestone.
3. **Tutor-directed questions only (D49).** `questions(m)` counts private Queries (thread creation) plus flagged discussion posts whose context milestone is `m`. Assistant turns are **not** question volume: they are excluded from this rule and reported separately as M6. D49 makes this a decision, not an interpretation, because assistant turns measure confusion with the model rather than confusion with the assignment, and a single chatty session could otherwise manufacture a false cohort difficulty signal. If the rule is ever revised, the register changes first and the fixture numbers are recomputed.
4. **The margin prevents noise flags.** Without it, a cohort where one milestone is 30 seconds above average and one question busier would be flagged. `MARGIN_TIME = 0.10` and `MARGIN_Q = 0.10` are working defaults; they are constants in code, not environment variables, so a flag cannot be tuned away during a demo.
5. **Eligibility is strict.** A milestone that is suppressed for either input cannot be flagged, and the view says why.
6. **Window consistency.** Both conditions are evaluated in the same window. Mixing a 7-day question window with an all-time time window is a bug.

### 5.2 Baselines, ranking, and edge cases

| Case | Behaviour |
|---|---|
| Fewer than 5 eligible milestones | The rule is not evaluated. The panel shows `insufficient data` with "not enough milestones with sufficient activity to compare". |
| Fewer than 2 eligible milestones | Same as above; a cohort rate over one value is meaningless. |
| Every milestone flagged | Displayed as-is, capped to the top 3 in the highlighted panel, with the full list in the table. If everything is flagged, the honest reading is that the whole assignment is heavy, and the view must not hide that. |
| Ties | Rank order: descending by `min(percentileOf(M4), percentileOf(questionRate))`, then descending by `M4`, then ascending by milestone order. Never by anything identity-derived. |
| Suppressed milestone | Cannot be flagged. Remains in the table as `insufficient data`. |
| Zero questions overall | Condition B fails for every milestone; no flags. The view states that no questions were recorded in the window. |
| Missing time data | Condition A cannot be evaluated; the milestone is not flagged even if questions are high. It is marked "time data insufficient" in the table. |

### 5.3 Evidence, not prescription

Owner of D35. The difficulty panel presents evidence and stops.

| The panel shows | The panel never shows |
|---|---|
| The milestone name | "You should add a lecture on this" |
| `Average elapsed time: 72m (cohort 41m)` | "Students need more scaffolding" |
| `Questions per student: 1.9 (cohort 0.7)` | "Consider rewriting requirement 4" |
| `Resolution rate: 54% (cohort 78%)` | "This requirement is badly written" |
| `Top topics: Authentication, Endpoint requirements, Validation` | A ranked list of students who asked |
| `Evidence only - the system does not prescribe an intervention.` | Any imperatives at all |

Binding rules:

1. Every number in the panel carries its cohort baseline in the same line, so the tutor can judge magnitude rather than trust a flag.
2. The panel's copy is fixed and contains no verbs directed at the tutor other than descriptive ones. A template with an action verb is a defect.
3. The panel links to related questions (`View related questions`) with `(assignmentId, milestoneId, window)` and nothing else.
4. The word "problem" is not used. The glossary term is `potential difficulty area`, and a flag is not a confirmed problem.
5. If a tutor wants a recommendation, that is a conversation with their teaching team, not a product output.

---

## 6. Metric catalogue

Every metric: id, named inputs, formula, window, floor, suppression behaviour. `K = 5` throughout. All values are computed in the analytics query layer and rounded per section 3.5.

Named inputs used below:

```text
N_enrolled              enrolled cohort size for the assignment
A                       set of contributing students (>= 1 qualifying event in window)
items(m)                approved checklist items in milestone m
completed(s, m)         items in items(m) completed by s in the window
Q(m)                    tutor-directed questions with context milestone m in the window:
                       a private Query thread creation, or a flagged discussion post (D49)
Qa(s, m)                students with >= 1 qualifying event in milestone m in the window
M4(m)                   milestoneMeanTime(m), section 4.3
E                       set of eligible milestones (qualified for both inputs)
```

| Id | Metric | Formula | Window | Floor | Display |
|---|---|---|---|---|---|
| `M1` | Assignment resolution rate | `mean over s in A of ( sum_m completed(s,m) / sum_m items(m) )` | Default | `abs(A) >= K` | Percent, nearest whole |
| `M2` | Active students | `abs(A)` | Default | `>= K` and (`N_enrolled - abs(A) >= K` or `== 0`) | Count, plus `N_enrolled` |
| `M3` | Milestone resolution rate | `mean over s in Qa(m) of ( completed(s,m) / items(m) )` | Default | `abs(Qa(m)) >= K` | Percent |
| `M4` | Milestone average elapsed time | `milestoneMeanTime(m)`, section 4.3 | Default | `abs(Qa(m)) >= K` and `>= K` completed intervals | Minutes |
| `M5` | Milestone question volume | `abs(Q(m))` | Default | `>= K` distinct student askers | Count |
| `M6` | Milestone assistant question volume | count of assistant turns with verdict `ALLOW`, `ALLOW_WITH_SCOPE`, or `CLARIFY` and context milestone `m` | Default | `>= K` distinct students | Count, separate column, never in the difficulty rule |
| `M7` | Question rate per active student | `abs(Q(m)) / abs(Qa(m))` | Default | `abs(Qa(m)) >= K` | One decimal |
| `M8` | Potential difficulty area | section 5.1 | Default | milestone eligible for M4 and M5 | Boolean plus evidence lines |
| `M9` | Topic distribution | section 7 | Default | per-topic `>= K` distinct students | Topic label plus count |
| `M10` | Elapsed time distribution | p25, p50, p75 over `perStudentMean(s, m)` | Default | `abs(Qa(m)) >= 8` | Minutes, optional Tier 2 |
| `M11` | Non-start rate | `(N_enrolled - abs(A)) / N_enrolled` | Default | `N_enrolled - abs(A) >= K` | Percent, optional |
| `M12` | FAQ coverage | `questions(m) in topics that have a published FAQ, after that FAQ's publish time / all questions(m)` | Default | `abs(Q(m)) >= K` and askers `>= K` | Percent, optional Tier 2 |

Rules that apply to every row:

1. A metric with no entry in the Display column is a defect: the UI must not invent a presentation.
2. A metric whose floor is unmet is suppressed per section 3.3, including its count.
3. Optional metrics (`M10`, `M11`, `M12`) are computed only if the assignment is eligible; their absence from the view is not an error state.
4. No metric may be computed per student, even as an intermediate that is later aggregated, except `perStudentMean(s, m)`, which is an internal step of M4 and M10 and never leaves the query layer.
5. **`M6` is deliberately excluded from `M8`.** D49 sets this: difficulty question volume is tutor-directed only. If that changes, the decision register changes first and the golden fixtures are recomputed.

### 6.1 Illustrative query shape for M3-M5

Specification-level pseudocode, not application code:

```sql
WITH eligible AS (
  SELECT c.milestone_id, c.subject_ref, COUNT(*) AS items_done
  FROM checklist_progress c
  JOIN checklist_items i ON i.id = c.checklist_item_id AND i.publication_status IN ('APPROVED','PUBLISHED')
  WHERE c.assignment_id = $1 AND c.completed_at >= $2
  GROUP BY c.milestone_id, c.subject_ref
),
res AS (
  SELECT milestone_id,
         AVG(items_done::numeric / NULLIF(total_items, 0)) AS resolution_rate,
         COUNT(DISTINCT subject_ref)                        AS contributors
  FROM eligible JOIN milestone_item_totals USING (milestone_id)
  GROUP BY milestone_id
)
SELECT milestone_id, resolution_rate, contributors
FROM res
WHERE contributors >= 5;   -- below 5 the row is not returned at all
```

Note what the query does not do: it never joins `users`, never selects a subject identifier into the result, and never returns a row below the floor. The suppression is in the query, not only in the UI, so a future client cannot render what it never received.

---

## 7. Question topic grouping

Purpose: turn a milestone's question list into "the cohort keeps asking about Authentication, Endpoint requirements, Validation" without exposing who asked what.

### 7.1 Input boundary

Only **tutor-directed questions** (D49): private query thread titles and bodies, and flagged discussion posts. Assistant conversation content is never an input. Uploads are never an input. Private query **bodies** are read for topic extraction only, in an aggregate pipeline, and are never returned to the analytics surface. Discussion-derived labels are subject to the storage gap noted in section 10.

### 7.2 Pipeline

```text
1. SELECT questions for (assignment, milestone, window)          -- no subject column
2. NORMALISE   NFKC, strip zero-width, collapse whitespace, lowercase for matching
3. REDACT      remove emails, phone numbers, URLs with tokens, student ids,
               staff names, and any string matching the PII patterns used by the
               guardrail normaliser (05 section 3.2, L0)
4. DETERMINISTIC MATCH (always runs)
     a. exact/near match against approved FAQ titles          -> assign topic
     b. match against milestone vocabulary from approved items -> assign topic
     c. match against a curated topic lexicon (auth, testing, deployment,
        documentation, requirements, data model, tooling, submission) -> assign topic
5. MODEL CLUSTERING (optional, Insight Engine; only for unassigned questions)
     - k = min(8, max(2, ceil(unassigned / 5)))
     - label = noun phrase, <= 4 words, no verb, no imperative
     - schema-validated; a label failing validation is discarded, not repaired
     - failure of the model call leaves step 4 results only; grouping degrades,
       it never blocks the view
6. ATTRIBUTE  each question may belong to at most 2 topics; otherwise "Other"
7. APPLY FLOOR  a topic is shown only when >= 5 distinct students contributed
                questions to it; "Other" obeys the same floor
8. ORDER  descending by question count, then alphabetically by label
```

### 7.3 Label rules

| Rule | Detail |
|---|---|
| Noun phrase only | "Authentication", "Endpoint requirements", "Validation errors". Never "How to authenticate". |
| Maximum 4 words | A 4-word cap forces a topic, not a summary. |
| No verb | A label containing a verb from the checklist forbidden list (`05` section 6.3, `CL1`) is discarded. |
| No requirement paraphrase | A label must not restate a requirement in different words (C2). If a topic is really a requirement, the label quotes the source's own wording with a citation. |
| No student text longer than 8 words | Prevents a label from carrying a quoted student sentence. |
| No PII | Post-redaction text only. A label containing an email, name pattern, or id fails validation outright. |
| Advisory marking | Topic labels are AI-generated (T5). The UI must label the block "AI-generated topic grouping - advisory" and allow the tutor to rename a label. A renamed label is stored as tutor-authored and stops being regenerated. |
| Never identity-linked | A topic carries a count and a label. It never carries a list of who asked, and never an `anonRef`. |

### 7.4 Failure and empty states

| Case | Behaviour |
|---|---|
| Fewer than 5 questions in the milestone | The topic block shows `insufficient data`; clustering does not run, saving a model call. |
| Model call fails | Step 4 results are shown with the note that grouping is partial. The view does not error. |
| All questions land in "Other" | Show "Other" with its count if the floor is met, plus "No dominant topics detected". |
| One topic holds everything | Show it, with its count. A single dominant topic is a real signal. |

---

## 8. The Assignment Health view

One screen, one purpose: evidence about the cohort, with no path to an individual. Handoff section 58 is the reference layout; this section is the specification.

```text
ASSIGNMENT HEALTH                                  [ Window: v ]  Assignment: <name>
--------------------------------------------------------------------------------
Average resolution rate  68%   Active students  24 / 37      Potential difficulty areas  3
                              (suppressed if the floor    (count only; suppressed
                               rule in 3.6 fails)          below 1 flag)

--------------------------------------------------------------------------------
Milestone performance

Milestone            Elapsed time   Resolution rate   Questions   Assistant questions
Requirements         18m            94%               3           6
Database Design      47m            71%               28         31
API Design           72m            54%               41         44
Testing              9m             insufficient data
--------------------------------------------------------------------------------
Potential difficulty areas (evidence only)

API Design
  Average elapsed time   72m  (cohort 41m)
  Questions per student  1.9  (cohort 0.7)
  Resolution rate        54%  (cohort 78%)
  Top topics             Authentication, Endpoint requirements, Validation
  [ View related questions ]

Evidence only - the system does not prescribe an intervention.
```

### 8.1 Required content

| Block | Content | Empty or suppressed state |
|---|---|---|
| Window selector | `Since published` (default), `Last 7 days`, `Last 24 hours` | Always present. |
| Header metrics | M1, M2, count of M8 flags | `insufficient data` per metric; the count shows `insufficient data` when there are no eligible milestones. |
| Milestone table | One row per milestone: name, M4, M3, M5, M6 | Row stays visible with `insufficient data` per column. |
| Difficulty panel | Top 3 M8 flags with baseline lines and topics | `No potential difficulty areas in this window` or the eligibility explanation. |
| Topic block | Per flagged milestone, M9 labels with counts | `insufficient data` or `No dominant topics detected`. |
| Footer note | The fixed evidence-only sentence | Always present. |

### 8.2 Required behaviour

1. Every number is traceable to a metric id; a reviewer can point at the row and say which formula produced it.
2. No cell links to a person. The only outbound link is `View related questions`, scoped to the milestone and window.
3. The view renders without any per-student fetch. A network trace of loading this page must contain no identity field.
4. The window selector never mixes windows across metrics in one render.
5. Loading and error states do not temporarily render raw or unsuppressed values. Suppression is applied in the query, so there is no render in which a small bucket exists in the payload.
6. The page is one screen at 1280px without horizontal scrolling; the milestone table is the only scrollable region if the list is long.

### 8.3 What is deliberately absent

Ranked student lists, individual progress, at-risk flags, predicted grades, engagement scores, time-on-task leaderboards, "students who have not logged in", per-student question counts, and any export button on the analytics surface. Their absence is the feature (D31).

---

## 9. Windows, refresh, and caching

| Window id | Definition | Default floor behaviour |
|---|---|---|
| `W_ALL` | From the assignment's publish timestamp to now | Default. |
| `W_7D` | Last 7 rolling days | Suppressed if fewer than 5 contributing students in the last 7 days. |
| `W_24H` | Last 24 rolling hours | Usually suppressed in a small cohort; shown only when the floor is met, never with a "small sample" caveat instead of suppression. |

Rules:

1. The default window is `W_ALL`. A tutor sees cumulative evidence unless they choose otherwise.
2. A window that fails the floor shows `insufficient data` for every metric, not a partially unsuppressed view.
3. The difficulty rule never mixes windows (section 5.1 note 6).
4. Computation is on demand with a 60-second HTTP cache keyed by `(assignmentId, window, milestoneId?)` (`04-TECH-ARCHITECTURE.md` section 10.2). At a 37-student scale a nightly rollup is unnecessary. If `milestone_metrics` or `assignment_metrics` (`06-DATA-MODEL.md` sections 7.6.3-7.6.4) are materialised anyway, the suppression rules apply **at write time as well as at read time**: `milestone_metrics` carries `CHECK (contributor_count >= 5)`, a below-floor bucket is an absent row rather than a null value, and absence renders as `insufficient data`. A materialised table must not become the place where a suppressed value survives.
5. A cached payload contains only suppressed/qualified values, because suppression happens in the query. There is no cache entry that holds a small-bucket value.
6. Timezone: all bucketing uses a single configured timezone for the course. Mixing UTC display with local-day buckets is a defect.

---

## 10. Data model touchpoints

Interface expectation only; `06-DATA-MODEL.md` owns the physical schema.

| Entity | Fields analytics needs | Notes |
|---|---|---|
| `analytics_events` | `assignment_id`, `milestone_id?`, `checklist_item_id?`, `event_type`, `occurred_at`, `duration_seconds?`, `subject_ref`, `metadata` | `subject_ref` per section 1.3 and 06 section 7.6.1. No user id, no content, no filename. Append-only. |
| `student_checklist_progress` | `checklist_item_id`, `student_id`, `milestone_id`, `started_at`, `completed_at`, `elapsed_seconds`, `reopen_count` | Carries identity because the student's own view needs it; analytics reads it only through the aggregate pipeline (06 section 4.7.4 says aggregate queries read `analytics_events` for time and completion, not this table). |
| `milestones` | `id`, `assignment_id`, `title`, `publication_status`, `display_order` | Only `APPROVED`/`PUBLISHED` participate. |
| `checklist_items` | `id`, `milestone_id`, `text`, `planning_level`, `publication_status` | Item counts feed the denominators. |
| `queries` | `id`, `assignment_id`, `milestone_id`, `topic_label`, `topic_label_source`, `topic_confidence`, `created_at` | `milestone_id` is documented in 06 section 7.4.1 as "the anchor used for question-volume aggregation". `student_id` is never selected by analytics. |
| `discussion_threads`, `discussion_posts` | `id`, `assignment_id`, `created_at` (+ a topic field, see below) | Post counts feed M5. Author columns are never selected. |
| `faq_entries` | `id`, `assignment_id`, `title`, `published_at` | Feeds M12 and deterministic topic matching. |
| `enrollments` | `course_id`, `student_id` | Denominator only, `COUNT(DISTINCT ...)`. |
| `guardrail_logs` | `verdict`, `assignment_id`, `prompt_version`, `created_at` | Source of M6 counts only. No content, no identity. No MVP endpoint returns this table. |
| `milestone_metrics`, `assignment_metrics` | pre-computed per-window aggregates | 06 sections 7.6.3-7.6.4; `milestone_metrics` carries `CHECK (contributor_count >= 5)` and `assignment_metrics.active_count` carries the same shape of CHECK. Absence of a row means **Insufficient data**. |

Topic storage gap to close: `queries.topic_label` exists (06 section 7.4.1), but `discussion_threads` has no equivalent column. Discussion-derived topic labels therefore need either a `topic_label` / `topic_label_source` / `topic_confidence` column set on `discussion_threads`, or a derived topic table. Until that exists, section 7's grouping runs on `queries` only and the milestone topic block says so. This is an interface expectation for 06, recorded in section 12.

Index requirements: `analytics_events (assignment_id, milestone_id, occurred_at)` (06 section 6.6 already creates it), `queries (assignment_id, milestone_id, created_at)`, `discussion_posts (thread_id, created_at)`, `student_checklist_progress (assignment_id, milestone_id, completed_at)`.

---

## 11. Verification tests

Fixture cohorts are synthetic and committed under `docs/fixtures/` (D46) so the numbers in this section are reproducible on any machine. Each test asserts the exact displayed payload, including suppression strings.

| # | Test | Fixture | Expected |
|---|---|---|---|
| A1 | Floor at 4 students | Milestone with 4 contributing students, values present | Bucket suppressed; payload contains no value field; UI string is `insufficient data`. |
| A2 | Floor at 5 students | Same data with 5 contributors | Value displayed; no suppression. |
| A3 | Complementary suppression | 4 milestones, exactly 1 below the floor, group total displayed | Second-smallest qualified bucket also suppressed. |
| A4 | Contagious total | All buckets below the floor | Group total suppressed. |
| A5 | Active-students elimination | `N_enrolled = 37`, `active = 36` | M2 suppressed. |
| A6 | Whole-cohort smallness | `N_enrolled = 4` | Every metric suppressed; explanatory line present. |
| A7 | Real zero versus missing | Qualified bucket with 0 completions vs a 3-student bucket | `0%` displayed for the first, `insufficient data` for the second. |
| A8 | Difficulty requires both | Milestone with high time only | Not flagged. |
| A9 | Difficulty requires both | Milestone with high questions only | Not flagged. |
| A10 | Difficulty flags both | Milestone with time and question rate each 20 percent above cohort | Flagged; evidence lines carry baselines. |
| A11 | Margin blocks noise | Time 3 percent above cohort, questions 4 percent above | Not flagged. |
| A12 | Fewer than 2 eligible milestones | 1 milestone | Rule not evaluated; `insufficient data` panel. |
| A13 | Runaway interval cap | One interval of 14 hours | Capped at 8 hours; `cappedIntervals` incremented. |
| A14 | Re-open does not move completion | Complete, re-open, complete again | One interval; M4 unchanged. |
| A15 | Per-student weighting | Student X completes 20 items, 19 others complete 1 each | Milestone mean is the mean of per-student means, not the mean of 39 intervals. |
| A16 | No identity in payload | Any analytics response | Serialised JSON contains none of `userId`, `subjectRef`, `anonRef`, `email`, `name`. |
| A17 | Topic floor | Topic with 4 distinct askers | Topic suppressed; the milestone's topic block still renders. |
| A18 | Label validation | Model returns "How to authenticate your API" | Label discarded (verb, 5 words); deterministic topics only. |
| A19 | PII redaction | Question contains an email address | Email absent from the redacted text and from every label. |
| A20 | Window consistency | 24h questions, all-time time | Impossible by construction: the metric pair takes one window argument. Asserted by the function signature and a type test. |

---

## 12. Open questions

Recorded rather than guessed, per AGENTS.md 4.1.4.

1. **`MARGIN_TIME` and `MARGIN_Q` (both 0.10) and the 8-hour interval cap** are working assumptions with no upstream basis. They need calibration against the demo fixture cohort, and the register should record the final values.
2. **`K = 5` against the real cohort size.** D32 sets it at 5 and this doc treats it as fixed. With a demo cohort under 10, most buckets will be suppressed and the view will look empty. `06-DATA-MODEL.md` section 6.10 and section 10 item 11 commit the fixture cohort, including at least one below-floor milestone so both the **Insufficient data** state and a real metric are demonstrable. The committed cohort is **37** ([`02-SCOPE.md`](02-SCOPE.md) section 5, [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) WP-02, and this doc's own verification fixture A5 at section 11 with `N_enrolled = 37, active = 36`), which is large enough for the table to be readable rather than a wall of `insufficient data`.
3. **How much of M6 a tutor should see.** D49 settles the rule: assistant turns are not question volume and never enter M8, and they are reported separately as M6. What is still open is presentation only - whether M6 appears as its own column in the milestone table (as section 8.1 currently shows) or moves behind a disclosure, and whether a tutor asking "what are students asking the assistant" is a future feature. Either way M6 stays a count, never content.
4. **Topic lexicon ownership.** Section 7.2 step 4c needs a maintained list. Working assumption: a small in-repo constant list, reviewed with the tutor during ingestion.
5. **Discussion topic storage.** `06-DATA-MODEL.md` gives `queries.topic_label` but no equivalent on `discussion_threads` (section 10). Until 06 gains a column set or a derived table, grouping covers private queries only. The Lead has asked 06's owner to add the column; this item closes when it lands.
6. **Whether a per-tutorial-group breakdown is wanted.** Any group smaller than `K` must be suppressed, which for a 37-student cohort may remove the usefulness. Working assumption: no group filter in the MVP.
7. **Retention of `analytics_events`.** Owned by `12-OPERATIONS.md`; not settled here.
