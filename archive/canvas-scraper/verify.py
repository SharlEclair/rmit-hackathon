#!/usr/bin/env python3
"""Integrity gate for a scrape produced by ``scrape_discussion.py``.

Exits 0 only when every check passes, so this can be used as a CI/acceptance
step. Checks 1-4, 6-8 are offline; check 5 cross-checks the captured replies
against Canvas' own per-entry replies endpoint and therefore needs network.

    python verify.py --course 157398 --topic 3205287           # live
    python verify.py --course 157398 --topic 3205287 --offline  # files only
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from canvas_client import CanvasAuthError, CanvasClient, CanvasError, load_netscape_cookies

EXIT_OK = 0
EXIT_FAIL = 3
EXIT_AUTH = 2


class Reporter:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.notes: list[str] = []

    def check(self, name: str, ok: bool, detail: str = "") -> bool:
        status = "PASS" if ok else "FAIL"
        line = f"[{status}] {name}"
        if detail:
            line += f" - {detail}"
        print(line)
        if not ok:
            self.failures.append(f"{name}: {detail}")
        return ok

    def note(self, text: str) -> None:
        self.notes.append(text)
        print(f"[note] {text}")


def load_records(path: str) -> tuple[list[dict], int]:
    records = []
    lines = 0
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            if not raw.strip():
                continue
            lines += 1
            records.append(json.loads(raw))
    return records, lines


# Cookie files carry non-secret stubs (e.g. `wm-popup` has the value "1"), so
# only values long enough to actually be credentials are scanned for.
MIN_SECRET_LEN = 12


def check_secrets(paths: list[str], secrets: list[str]) -> tuple[bool, str]:
    candidates = [s for s in secrets if isinstance(s, str) and len(s) >= MIN_SECRET_LEN]
    hits = []
    for path in paths:
        if not path or not os.path.isfile(path):
            continue
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            blob = fh.read()
        for secret in candidates:
            if secret in blob:
                hits.append(f"{os.path.basename(path)} contains a credential value")
    if not candidates:
        return True, "no scannable credential values available"
    return (not hits), ("; ".join(hits) if hits else f"scanned {len(candidates)} credential value(s): none found")


def rebuild(posts: list[dict]) -> list[str]:
    """Rebuild the tree from parent links and return depth/thread_path errors."""
    by_id = {p["post_id"]: p for p in posts}
    errors: list[str] = []

    def depth_of(node: dict, guard: set) -> int:
        parent_id = node.get("parent_id")
        if parent_id is None:
            return 0
        if parent_id not in by_id:
            errors.append(f"post {node['post_id']} references missing parent {parent_id}")
            return 0
        if parent_id in guard:
            errors.append(f"cycle detected at post {node['post_id']}")
            return 0
        return depth_of(by_id[parent_id], guard | {node["post_id"]}) + 1

    for post in posts:
        expected = depth_of(post, set())
        if expected != post["depth"]:
            errors.append(f"post {post['post_id']} depth {post['depth']} != recomputed {expected}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--course", type=int, required=True)
    parser.add_argument("--topic", type=int, required=True)
    parser.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    parser.add_argument("--cookie-file", default=None)
    parser.add_argument("--token", default=None)
    parser.add_argument("--offline", action="store_true", help="skip the live cross-checks")
    args = parser.parse_args(argv)

    stem = f"topic-{args.topic}"
    jsonl_path = os.path.join(args.out, stem + ".jsonl")
    md_path = os.path.join(args.out, stem + ".md")
    meta_path = os.path.join(args.out, stem + ".meta.json")

    if not os.path.isfile(jsonl_path):
        print(f"missing {jsonl_path}; run scrape_discussion.py first", file=sys.stderr)
        return EXIT_FAIL

    reporter = Reporter()
    records, line_count = load_records(jsonl_path)
    topics = [r for r in records if r.get("record_type") == "topic"]
    posts = [r for r in records if r.get("record_type") == "post"]
    live = [p for p in posts if not p.get("deleted")]
    roots = [p for p in live if p.get("is_root")]
    replies = [p for p in live if not p.get("is_root")]

    meta = {}
    if os.path.isfile(meta_path):
        with open(meta_path, "r", encoding="utf-8") as fh:
            meta = json.load(fh)
    expected = (topics[0].get("discussion_subentry_count") if topics else None) or meta.get(
        "discussion_subentry_count"
    )

    print(f"verifying {jsonl_path}")
    print(f"  records={len(records)} lines={line_count} topic_records={len(topics)} posts={len(posts)}")
    print("")

    reporter.check("1. live post count matches discussion_subentry_count",
                   expected is not None and len(live) == expected,
                   f"live={len(live)} expected={expected}")

    ids = [p.get("post_id") for p in posts]
    reporter.check("2. post ids unique / JSONL re-parses cleanly",
                   len(ids) == len(set(ids)) and line_count == len(records),
                   f"unique={len(set(ids))} of {len(ids)}; lines={line_count}")

    missing = [p["post_id"] for p in posts if p.get("parent_id") is not None and p["parent_id"] not in set(ids)]
    reporter.check("3. every parent_id resolves", not missing, f"unresolved={missing}")

    tree_errors = rebuild(posts)
    reporter.check("4. tree rebuilds with consistent depths", not tree_errors,
                   "; ".join(tree_errors[:3]) if tree_errors else
                   f"roots={len(roots)} replies={len(replies)} depth={max((p['depth'] for p in posts), default=0)}")

    if not args.offline:
        try:
            client = CanvasClient(cookie_file=args.cookie_file, token=args.token)
            base = f"/api/v1/courses/{args.course}/discussion_topics/{args.topic}"
            mismatches = []
            for root in roots:
                canvas_replies = client.get_paginated(base + f"/entries/{root['post_id']}/replies", {"per_page": 100})
                captured = sum(1 for p in replies if root["post_id"] in p.get("thread_path", [])[:-1])
                if len(canvas_replies) != captured:
                    mismatches.append(f"root {root['post_id']}: canvas={len(canvas_replies)} captured={captured}")
            reporter.check("5. captured replies match Canvas per-entry replies",
                           not mismatches, "; ".join(mismatches[:3]) if mismatches else
                           f"{len(roots)} roots cross-checked live")
        except (CanvasAuthError, CanvasError) as exc:
            reporter.check("5. captured replies match Canvas per-entry replies", False, f"live check failed: {exc}")
    else:
        reporter.note("check 5 skipped (--offline)")

    recon = meta.get("reconciliation") or {}
    unexplained = recon.get("unexplained_ids") or []
    entry_only = recon.get("entry_only_ids") or []
    tombs = meta.get("tombstone_ids") or []
    reporter.check("6. /view diff fully explained by tombstones",
                   not unexplained and not entry_only,
                   f"unexplained={unexplained} entry_only={entry_only} tombstones={tombs}")

    bad_paths = [p["post_id"] for p in posts
                 if not p.get("thread_path") or p["thread_path"][-1] != p["post_id"]
                 or len(p["thread_path"]) != p["depth"] + 1]
    reporter.check("7. thread_path consistent with depth", not bad_paths, f"bad={bad_paths[:5]}")

    secrets: list[str] = []
    cookie_file = args.cookie_file
    if args.token:
        secrets.append(args.token)
    elif cookie_file and os.path.isfile(cookie_file):
        secrets.extend(load_netscape_cookies(cookie_file).values())
    else:
        env_token = os.environ.get("CANVAS_TOKEN")
        if env_token:
            secrets.append(env_token)
        else:
            try:
                from canvas_client import CanvasClient as _CC

                secrets.extend(_CC(cookie_file=args.cookie_file, token=args.token).cookies.values())
            except Exception:
                pass
    ok_secrets, detail = check_secrets([jsonl_path, md_path, meta_path], secrets)
    reporter.check("8. no credential values in outputs", ok_secrets, detail)

    print("")
    if reporter.failures:
        print(f"FAILED ({len(reporter.failures)} check(s))")
        for failure in reporter.failures:
            print(f"  - {failure}")
        return EXIT_FAIL
    print(f"ALL CHECKS PASSED - {len(live)} live posts, {len(posts)} records")
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
