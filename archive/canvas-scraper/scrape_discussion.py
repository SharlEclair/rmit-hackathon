#!/usr/bin/env python3
"""Scrape one Canvas discussion topic into JSONL + Markdown.

Read-only: every Canvas call is a GET. Nothing is posted, edited, marked read,
or otherwise mutated.

Examples
--------
    python scrape_discussion.py --course 157398 --topic 3205287
    python scrape_discussion.py --course 157398 --topic 3205287 --out out --no-markdown
    CANVAS_TOKEN=... python scrape_discussion.py --course 157398 --topic 3205287
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys

from canvas_client import CanvasAuthError, CanvasClient, CanvasError, CanvasRateLimitError
from discussion_parser import (
    annotate_tree,
    build_tree,
    flatten_entries,
    html_to_text,
    normalize_entry,
    reconcile_view,
    summarize,
)
from roles import build_role_map, load_overrides, tag_posts
from serializers import build_records, write_jsonl, write_markdown, write_meta

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_AUTH = 2


def _flatten_replies(replies: list[dict]) -> list[dict]:
    """Normalise a bare reply list using the shared flattener."""
    return flatten_entries([{"recent_replies": replies}], source="api_replies")


def fetch_discussion(client: CanvasClient, course_id: int, topic_id: int, log=print) -> dict:
    """Fetch topic metadata and the complete post tree."""
    topic, _ = client.get_json(
        f"/api/v1/courses/{course_id}/discussion_topics/{topic_id}",
        {"include[]": "sections"},
    )
    log(f"  topic: {topic.get('title')!r}  subentries={topic.get('discussion_subentry_count')}")

    entries = client.get_paginated(
        f"/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries",
        {"per_page": 100},
    )
    log(f"  /entries: {len(entries)} root posts")

    posts = flatten_entries(entries, source="api_entries")
    log(f"  flattened (roots + recent_replies): {len(posts)} posts")

    # Completeness fallback: only needed when Canvas flags truncated replies.
    needs_more = [p for p in posts if p["is_root"] and p["has_more_replies"]]
    if needs_more:
        log(f"  {len(needs_more)} root(s) flagged has_more_replies -> fetching per-entry replies")
    by_id = {p["post_id"]: p for p in posts}
    for root in needs_more:
        replies = client.get_paginated(
            f"/api/v1/courses/{course_id}/discussion_topics/{topic_id}/entries/{root['post_id']}/replies",
            {"per_page": 100},
        )
        for reply in _flatten_replies(replies):
            by_id.setdefault(reply["post_id"], reply)
    posts = list(by_id.values())

    view, _ = client.get_json(
        f"/api/v1/courses/{course_id}/discussion_topics/{topic_id}/view"
    )
    reconciliation = reconcile_view(view, posts)
    log(
        f"  /view: {reconciliation['view_unique_count']} unique nodes; "
        f"tombstones={len(reconciliation['tombstones'])}; "
        f"unexplained={len(reconciliation['unexplained_ids'])}"
    )

    posts.extend(reconciliation["tombstones"])
    roots = build_tree(posts)
    ordered = annotate_tree(roots)
    return {
        "topic": topic,
        "entries": entries,
        "posts": ordered,
        "reconciliation": reconciliation,
        "roots": roots,
    }


def scrape(
    course_id: int,
    topic_id: int,
    out_dir: str = "out",
    cookie_file: str | None = None,
    token: str | None = None,
    include_deleted: bool = True,
    want_markdown: bool = True,
    log=print,
) -> dict:
    client = CanvasClient(cookie_file=cookie_file, token=token)
    auth = client.verify_auth()
    log(f"  auth: {auth['name']} ({auth['login_id']}) via {auth['auth_mode']}")

    fetched = fetch_discussion(client, course_id, topic_id, log=log)
    topic = fetched["topic"]
    posts = fetched["posts"]

    role_map = build_role_map(client, course_id, overrides=load_overrides())
    tag_report = tag_posts(posts, role_map)

    stats = summarize(posts)
    unknown_posts = stats["author_roles"].get("unknown", 0)
    log(
        f"  roles: {len(role_map)} course users indexed; "
        f"authors absent from that index={len(tag_report['unresolved_authors'])}; "
        f"posts whose role is still unknown={unknown_posts}"
    )

    reconciliation = fetched["reconciliation"]

    topic_for_md = dict(topic)
    topic_for_md["course_id"] = course_id
    topic_for_md["topic_id"] = topic_id
    topic_for_md["_message_text"], _ = html_to_text(topic.get("message"))

    records = build_records(topic, posts, course_id, topic_id, client.base_url)
    if not include_deleted:
        records = [r for r in records if r.get("record_type") == "topic" or not r.get("deleted")]

    stem = f"topic-{topic_id}"
    os.makedirs(out_dir, exist_ok=True)
    jsonl_path = os.path.join(out_dir, stem + ".jsonl")
    md_path = os.path.join(out_dir, stem + ".md")
    meta_path = os.path.join(out_dir, stem + ".meta.json")

    write_jsonl(jsonl_path, records)
    if want_markdown:
        write_markdown(md_path, topic_for_md, posts, client.base_url)

    meta = {
        "generated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "auth": client.describe_auth(),
        "course_id": course_id,
        "topic_id": topic_id,
        "topic_title": topic.get("title"),
        "discussion_subentry_count": topic.get("discussion_subentry_count"),
        "stats": stats,
        "reconciliation": {k: v for k, v in reconciliation.items() if k != "tombstones"},
        "tombstone_ids": [t["post_id"] for t in reconciliation["tombstones"]],
        "unresolved_authors": tag_report["unresolved_authors"],
        "rate_limit_remaining": client.rate_limit_remaining,
        "request_log": client.request_log,
        "outputs": {"jsonl": jsonl_path, "markdown": md_path if want_markdown else None, "meta": meta_path},
        "secrets": "never written - cookie/token values are excluded from all outputs",
    }
    write_meta(meta_path, meta)

    log(f"  wrote {len(records)} records -> {jsonl_path}")
    if want_markdown:
        log(f"  wrote markdown -> {md_path}")
    log(f"  wrote meta -> {meta_path}")

    return {
        "jsonl_path": jsonl_path,
        "markdown_path": md_path if want_markdown else None,
        "meta_path": meta_path,
        "stats": stats,
        "records": records,
        "posts": posts,
        "topic": topic,
        "client": client,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--course", type=int, required=True, help="Canvas course id, e.g. 157398")
    parser.add_argument("--topic", type=int, required=True, help="Canvas discussion topic id, e.g. 3205287")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    parser.add_argument("--cookie-file", default=None, help="Netscape cookies.txt (default: ../cookies.txt)")
    parser.add_argument("--token", default=None, help="Canvas token; falls back to CANVAS_TOKEN")
    parser.add_argument("--no-deleted", action="store_true", help="exclude deleted-post tombstones")
    parser.add_argument("--no-markdown", action="store_true", help="skip the Markdown digest")
    parser.add_argument("--quiet", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    log = (lambda *a, **k: None) if args.quiet else print

    try:
        result = scrape(
            course_id=args.course,
            topic_id=args.topic,
            out_dir=args.out,
            cookie_file=args.cookie_file,
            token=args.token,
            include_deleted=not args.no_deleted,
            want_markdown=not args.no_markdown,
            log=log,
        )
    except CanvasAuthError as exc:
        print(f"AUTH ERROR: {exc}", file=sys.stderr)
        return EXIT_AUTH
    except CanvasRateLimitError as exc:
        print(f"RATE LIMIT: {exc}", file=sys.stderr)
        return EXIT_ERROR
    except CanvasError as exc:
        print(f"CANVAS ERROR: {exc}", file=sys.stderr)
        return EXIT_ERROR

    stats = result["stats"]
    log("")
    log("Summary")
    log(f"  posts        : {stats['live_posts']} live + {stats['deleted']} deleted = {stats['total_posts']} records")
    log(f"  threads      : {stats['roots']} roots, {stats['replies']} replies")
    log(f"  max depth    : {stats['max_depth']}")
    log(f"  authors      : {stats['distinct_authors']} -> {stats['author_roles']}")
    log(f"  subentry cnt : {result['topic'].get('discussion_subentry_count')}")
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
