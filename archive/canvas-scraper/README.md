# Canvas Discussion Scraper

> **RETIRED PRIOR WORK — NOT REQUIRED AND NOT USED BY THE APPLICATION.**
> This tool was built during the design phase and moved to `archive/`. It is a
> research artefact only: the app must run with `CANVAS_*` unset (D45) and never
> imports anything from here (D44). Kept for historical reference; do not present
> it as hackathon output.

Read-only scraper for RMIT Canvas discussion threads. Harvests a complete
discussion — every question and reply, with authorship, timestamps, role, and
thread structure — into JSONL plus a human-readable Markdown digest.

**Answering the original question up front: yes, the Canvas REST API can be
used for this, and it is the only strategy that fully works.** It retrieves the
entire 33-post discussion in **2 HTTP requests** with structured JSON. Scraping
the rendered page HTML does not work at all.

---

## 1. Viability matrix (measured, not assumed)

Reproduce with `python probe_strategies.py --course 157398 --topic 3205287`:

| # | Strategy | Posts found | Time | Verdict |
|---|---|---|---|---|
| **A** | REST `GET /entries?per_page=100` (+ nested `recent_replies`) | **33** | 0.69 s | ✅ **VIABLE — primary** |
| **A'** | REST `/entries/:id/replies` recursion | **33** | 3.75 s | ✅ Viable — cross-check (13 requests) |
| **B** | Plain HTTP GET of the page + lxml/en XPath | **0** | 0.65 s | ❌ **NOT VIABLE** |
| **D** | REST `GET /view` (nested tree) | **34** (33 live + 1 deleted) | 0.20 s | ✅ Viable — alternative |
| **C** | Headless browser + DOM/XPath | 33 after expanding | — | ⚠️ Viable but fragile |

Authoritative count for comparison: `discussion_subentry_count = 33`.

**Why B fails.** `/courses/157398/discussion_topics/3205287` is a React shell.
The served HTML has only 3 body divs, one of which is `#application`; there are
zero elements matching `.discussion_entry`, `.discussion-entries`,
`.entry-content`, or `article`, and zero `[data-resource-type]` nodes. The post
content only exists after JavaScript executes.

**Why C is fragile.** Post nodes render lazily and threads start collapsed:
`12` nodes initially, `25` after clicking *Expand Threads*, `33` after further
expansion and waits. It works, but it costs a browser, click choreography,
arbitrary sleeps, and it breaks whenever Canvas restyles.

## 2. The supplied XPath

```
/html/body/div[3]/div[2]/div[2]/div[3]/div[1]/div/span[2]/div/div/div/div/span/div/div/span/div[3]/div[1]/div/div/span/span/div/span/span[2]/div/span/div
```

Evaluated live in a real browser against this topic it resolves to **exactly one**
element:

```
div.userMessage > div.user_content
    [data-resource-type="discussion_topic.reply"][data-resource-id="3529880"]
```

Two things worth knowing:

1. **It is not an answers container.** `3529880` is the newest post — Jacob
   Prantalos's *question*. An absolute positional XPath selects whichever post
   happens to render first, so it captures 1 of 33 posts, not the answers.
2. **It is positionally brittle.** It matched 0 elements in the server HTML and
   depends on `body/div[3]` staying put. The live page already carries 11 body
   children including WalkMe-injected iframes and overlays, any of which can
   shift those indices.

The durable equivalent is the key Canvas itself puts in the DOM:

```
[data-resource-type="discussion_topic.reply"][data-resource-id="<id>"]
```

`data-resource-id` is the *same id the REST API returns*, which is why the API
route supersedes DOM scraping entirely.

## 3. Install and use

```bash
cd archive/canvas-scraper
pip install -r requirements.txt      # only for HTML -> text

python scrape_discussion.py --course 157398 --topic 3205287
python verify.py --course 157398 --topic 3205287
python probe_strategies.py --course 157398 --topic 3205287
python -m unittest discover -s tests -t .     # 28 offline tests
```

Credentials resolve in this order:

1. `--token` argument
2. `CANVAS_TOKEN` environment variable
3. Netscape cookie file — `--cookie-file`, else `CANVAS_COOKIE_FILE`, else
   `../cookies.txt`, else `./cookies.txt`

`canvas_session` alone is sufficient (verified: it returns 200 while a
cookieless request returns 401), but the whole cookie set is sent.

### CLI options

| Flag | Meaning |
|---|---|
| `--course`, `--topic` | target ids (required) |
| `--out` | output directory (default `./out`) |
| `--cookie-file` | Netscape cookies path |
| `--token` | Canvas personal access token |
| `--no-deleted` | drop deleted-post tombstones from the output |
| `--no-markdown` | skip the Markdown digest |
| `--quiet` | suppress progress logging |

Exit codes: `0` ok · `2` auth failure · `3` verification mismatch · `1` other.

## 4. Output

`out/topic-3205287.jsonl` — one JSON object per line: a `record_type: "topic"`
header followed by one `record_type: "post"` per post:

```json
{
  "record_type": "post",
  "course_id": 157398, "topic_id": 3205287,
  "post_id": 3529880, "parent_id": null, "depth": 0, "is_root": true,
  "author_id": 481855, "author_name": "<redacted>", "author_role": "student",
  "responds_to_threads": 0,
  "created_at": "2026-08-14T13:38:00Z", "updated_at": "2026-08-14T13:39:57Z",
  "edited": true, "read_state": "read", "deleted": false, "orphan": false,
  "message_html": "<p>[UG]</p>...", "message_text": "[UG] Hi there, ...",
  "thread_path": [3529880],
  "permalink": "https://rmit.instructure.com/courses/157398/discussion_topics/3205287#entry-3529880",
  "source": "api_entries"
}
```

`source` ∈ `api_entries` · `api_replies` · `api_view_tombstone`.

`out/topic-3205287.md` renders each thread as nested headings
(`## Thread N` → `### Question` → `#### ↳ Reply` → `##### ↳ Reply`) with a
final *Deleted posts* section so the `/view` count reconciles.

`out/topic-3205287.meta.json` records counts, endpoint timings, the
reconciliation report, unresolved authors, and the rate-limit headroom. **No
credential values are written to any output**, and `verify.py` check 8 enforces
that on every run.

## 5. Verification

`verify.py` exits non-zero unless all eight checks pass:

1. live post count == `discussion_subentry_count`
2. post ids unique, JSONL re-parses, line count matches
3. every `parent_id` resolves
4. tree rebuilds with consistent depths
5. *live* — captured replies match Canvas' own `/entries/:id/replies`
6. `/view` diff fully explained by tombstones
7. `thread_path` consistent with `depth`
8. no credential values in any output file

Current result on topic `3205287`: `ALL CHECKS PASSED — 33 live posts, 34 records`.

## 6. Notes, limits, and things that surprised me

- **`recent_replies` is flat, not nested.** A post with 6 `recent_replies` may be
  1 direct reply plus 2 grandchildren. The tree is rebuilt from `parent_id`.
- **`/entries` and `/view` legitimately disagree by one.** `/entries` omits
  deleted posts; `/view` includes `3526944` with `deleted: true`. Rather than
  let that look like data loss, the deleted node is recorded as a tombstone so
  `33 + 1 = 34` reconciles exactly. Check 6 enforces this.
- **Role detection is best-effort.** `/courses/:id/enrollments` returns
  *students only* to a student caller (1200 records crawled, zero staff), so it
  cannot find tutors — that was a dead end. `users?enrollment_type=teacher`
  (1 result) and `?enrollment_type=ta` (8 results) do work. Two active
  answerers are still unresolvable, at user ids **269594** and **438489**.
  They are tagged `unknown`, never dropped.
  Edit `staff_overrides.json` to correct them. **Personal names are not recorded
  in this repository** — the ids are sufficient, and the participants in a real
  discussion thread have not consented to appear here.
  **Any "answers only" filter must treat `unknown` as include, not exclude**, or
  it will silently discard real answers.
- **Encoding is clean.** One message appears mangled (`TutorI?d`) when printed
  through a cp1252 Windows console, but the stored file is valid UTF-8 with zero
  replacement characters. The `decode_replacements` field tracks any real
  corruption; it is currently 0.
- **Rate limiting is comfortable.** Canvas reported `x-rate-limit-remaining: 700`;
  a full scrape of this topic uses well under 20 requests.
- **Cursor pagination.** `/enrollments` and `/users` paginate via
  `Link: rel="next"` with `page=bookmark:...` cursors, not offsets.

### Out of scope

Multi-course harvesting, the GraphQL API, attachment/media download,
incremental re-scrape diffs, and RAG/embedding ingestion. Only topic `3205287`
is validated end to end; the course/topic ids are parameterised so other topics
should work.

### Ethics and safety

Every Canvas call is a `GET`. The scraper never posts, edits, marks read, or
otherwise mutates course state. It reads only a course the account is enrolled
in and is intended for personal/hackathon use. Keep `cookies.txt` and `out/`
out of version control — the workspace-root `.gitignore` covers `cookies.txt`,
and `archive/canvas-scraper/.gitignore` covers `out/`. Re-export the cookie file when
the session expires.

## 7. Layout

```
archive/canvas-scraper/
  canvas_client.py       auth, HTTP, Link-header pagination, retry, rate limits
  discussion_parser.py   HTML->text, flatten, tree rebuild, tombstone reconcile
  roles.py               author -> role resolution with overrides
  serializers.py         JSONL / Markdown / meta writers
  scrape_discussion.py   CLI entry point
  verify.py              eight-check integrity gate (exit code)
  probe_strategies.py    the viability matrix above
  staff_overrides.json   manual role corrections
  tests/test_units.py    28 offline unit tests
  out/                   generated output (gitignored)
```
