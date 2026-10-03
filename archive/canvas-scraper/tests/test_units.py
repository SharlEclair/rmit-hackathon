"""Offline unit tests. No network access is required.

Run with:  python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from canvas_client import load_netscape_cookies, parse_all_links, parse_next_link  # noqa: E402
from discussion_parser import (  # noqa: E402
    annotate_tree,
    build_tree,
    flatten_entries,
    html_to_text,
    normalize_entry,
    reconcile_view,
    summarize,
)
from roles import ROLE_PRIORITY, _better, tag_posts  # noqa: E402
from serializers import build_records  # noqa: E402
from verify import check_secrets  # noqa: E402


class TestNetscapeCookies(unittest.TestCase):
    def _write(self, text: str) -> str:
        handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".txt", delete=False, newline="\n")
        handle.write(text)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_parses_values_and_skips_comments(self):
        path = self._write(
            "# Netscape HTTP Cookie File\n"
            "# a comment\n"
            "\n"
            "rmit.instructure.com\tFALSE\t/\tTRUE\t0\tlog_session_id\tabc123\n"
            "rmit.instructure.com\tFALSE\t/\tTRUE\t0\tcanvas_session\tdeadbeef\n"
        )
        cookies = load_netscape_cookies(path)
        self.assertEqual(cookies, {"log_session_id": "abc123", "canvas_session": "deadbeef"})

    def test_handles_httponly_prefix(self):
        path = self._write("#HttpOnly_rmit.instructure.com\tFALSE\t/\tTRUE\t0\tsecret\tvalue1\n")
        self.assertEqual(load_netscape_cookies(path), {"secret": "value1"})

    def test_skips_malformed_lines(self):
        path = self._write("only\ttwo\nrmit.instructure.com\tFALSE\t/\tTRUE\t0\tgood\tv\n")
        self.assertEqual(load_netscape_cookies(path), {"good": "v"})

    def test_accepts_pipe_style_values_without_crashing(self):
        path = self._write("d\tFALSE\t/\tTRUE\t0\tname\t\n")
        self.assertEqual(load_netscape_cookies(path), {"name": ""})


class TestLinkHeaders(unittest.TestCase):
    def test_extracts_next(self):
        header = (
            '<https://x/api?page=1>; rel="current",'
            '<https://x/api?page=bookmark:abc>; rel="next",'
            '<https://x/api?page=1>; rel="first"'
        )
        self.assertEqual(parse_next_link(header), "https://x/api?page=bookmark:abc")

    def test_none_when_absent(self):
        self.assertIsNone(parse_next_link('<https://x/api?page=1>; rel="last"'))
        self.assertIsNone(parse_next_link(None))
        self.assertIsNone(parse_next_link(""))

    def test_parse_all_links(self):
        header = '<https://a>; rel="current",<https://b>; rel="next"'
        self.assertEqual(parse_all_links(header), {"current": "https://a", "next": "https://b"})


class TestHtmlToText(unittest.TestCase):
    def test_entities_and_block_tags(self):
        text, replacements = html_to_text("<p>Hello&nbsp;<b>world</b></p>\n<p>Second &gt; third</p>")
        self.assertIn("Hello world", text)
        self.assertIn("Second > third", text)
        self.assertEqual(replacements, 0)

    def test_br_becomes_newline(self):
        text, _ = html_to_text("line one<br>line two")
        self.assertIn("line one", text)
        self.assertIn("line two", text)
        self.assertNotEqual(text.index("line two"), text.index("line one"))

    def test_counts_replacement_chars_without_dropping_them(self):
        text, replacements = html_to_text("<p>TutorI\ufffdd like to ask</p>")
        self.assertEqual(replacements, 1)
        self.assertIn("\ufffd", text)

    def test_empty_and_none(self):
        self.assertEqual(html_to_text(""), ("", 0))
        self.assertEqual(html_to_text(None), ("", 0))


def make_entry(post_id, parent_id=None, created="2026-01-01T00:00:00Z", replies=None, **extra):
    entry = {
        "id": post_id,
        "parent_id": parent_id,
        "user_id": 1,
        "user_name": "Author",
        "created_at": created,
        "updated_at": created,
        "message": f"<p>post {post_id}</p>",
        "recent_replies": replies or [],
    }
    entry.update(extra)
    return entry


class TestFlatten(unittest.TestCase):
    def test_flattens_roots_and_replies(self):
        entries = [make_entry(1, replies=[make_entry(2, parent_id=1)])]
        posts = flatten_entries(entries)
        self.assertEqual([p["post_id"] for p in posts], [1, 2])

    def test_deduplicates_replies_reachable_from_multiple_paths(self):
        reply = make_entry(2, parent_id=1)
        entries = [make_entry(1, replies=[reply]), make_entry(2, parent_id=1)]
        posts = flatten_entries(entries)
        self.assertEqual(len(posts), 2)
        self.assertEqual(len({p["post_id"] for p in posts}), 2)

    def test_marks_edited_only_when_timestamps_differ(self):
        edited = normalize_entry(make_entry(1, updated_at="2026-02-02T00:00:00Z"))
        plain = normalize_entry(make_entry(2))
        self.assertTrue(edited["edited"])
        self.assertFalse(plain["edited"])


class TestTree(unittest.TestCase):
    def _posts(self):
        return flatten_entries([
            make_entry(1, created="2026-01-01T00:00:00Z", replies=[
                make_entry(2, parent_id=1, created="2026-01-02T00:00:00Z", replies=[
                    make_entry(4, parent_id=2, created="2026-01-04T00:00:00Z"),
                ]),
                make_entry(3, parent_id=1, created="2026-01-03T00:00:00Z"),
            ]),
            make_entry(5, created="2026-01-05T00:00:00Z"),
        ])

    def test_builds_nested_tree_with_newest_root_first(self):
        posts = self._posts()
        roots = build_tree(posts)
        self.assertEqual([r["post_id"] for r in roots], [5, 1])
        self.assertEqual([c["post_id"] for c in roots[1]["children"]], [2, 3])

    def test_depth_and_thread_path(self):
        posts = self._posts()
        roots = annotate_tree(build_tree(posts))
        by_id = {p["post_id"]: p for p in roots}
        self.assertEqual(by_id[1]["depth"], 0)
        self.assertEqual(by_id[2]["depth"], 1)
        self.assertEqual(by_id[4]["depth"], 2)
        self.assertEqual(by_id[4]["thread_path"], [1, 2, 4])
        self.assertTrue(by_id[1]["is_root"])
        self.assertFalse(by_id[2]["is_root"])

    def test_orphan_is_repromoted_to_root_and_flagged(self):
        posts = flatten_entries([make_entry(7, parent_id=999)])
        roots = build_tree(posts)
        self.assertEqual(len(roots), 1)
        self.assertTrue(roots[0]["orphan"])
        self.assertIsNone(roots[0]["parent_id"])

    def test_summarize(self):
        posts = annotate_tree(build_tree(self._posts()))
        stats = summarize(posts)
        self.assertEqual(stats["total_posts"], 5)
        self.assertEqual(stats["roots"], 2)
        self.assertEqual(stats["replies"], 3)
        self.assertEqual(stats["max_depth"], 2)


class TestReconcileView(unittest.TestCase):
    def test_deleted_view_node_becomes_tombstone(self):
        posts = flatten_entries([make_entry(1)])
        view = {"view": [{"id": 1, "replies": []}, {"id": 99, "deleted": True, "replies": [], "message": "<p>x</p>"}]}
        report = reconcile_view(view, posts)
        self.assertEqual([t["post_id"] for t in report["tombstones"]], [99])
        self.assertEqual(report["tombstones"][0]["message_text"], "")
        self.assertTrue(report["tombstones"][0]["deleted"])
        self.assertTrue(report["explained"])
        self.assertEqual(report["unexplained_ids"], [])

    def test_missing_live_view_node_is_unexplained(self):
        posts = flatten_entries([make_entry(1)])
        view = {"view": [{"id": 1, "replies": []}, {"id": 42, "replies": []}]}
        report = reconcile_view(view, posts)
        self.assertEqual(report["unexplained_ids"], [42])
        self.assertFalse(report["explained"])

    def test_walks_nested_replies(self):
        posts = flatten_entries([make_entry(1)])
        view = {"view": [{"id": 1, "replies": [{"id": 99, "deleted": True, "replies": []}]}]}
        report = reconcile_view(view, posts)
        self.assertEqual([t["post_id"] for t in report["tombstones"]], [99])


class TestRoles(unittest.TestCase):
    def test_role_priority_prefers_staff(self):
        self.assertEqual(_better("unknown", "teacher"), "teacher")
        self.assertEqual(_better("teacher", "student"), "teacher")
        self.assertEqual(_better("ta", "designer"), "ta")
        self.assertGreater(ROLE_PRIORITY["teacher"], ROLE_PRIORITY["student"])

    def test_tag_posts_marks_unknown_never_drops(self):
        posts = flatten_entries([
            make_entry(1, replies=[make_entry(2, parent_id=1, user_id=7)]),
        ])
        annotate_tree(build_tree(posts))
        report = tag_posts(posts, {1: {"name": "Tutor", "role": "teacher"}})
        by_id = {p["post_id"]: p for p in posts}
        self.assertEqual(by_id[1]["author_role"], "teacher")
        self.assertEqual(by_id[2]["author_role"], "unknown")
        self.assertIn(7, report["unresolved_authors"])  # keyed by author id, not post id
        self.assertEqual(len(posts), 2)  # nothing was dropped

    def test_responds_to_threads_counts_distinct_roots(self):
        posts = flatten_entries([
            make_entry(1, replies=[make_entry(2, parent_id=1, user_id=9)]),
            make_entry(3, replies=[make_entry(4, parent_id=3, user_id=9)]),
        ])
        annotate_tree(build_tree(posts))
        tag_posts(posts, {})
        by_id = {p["post_id"]: p for p in posts}
        self.assertEqual(by_id[2]["responds_to_threads"], 2)


class TestSecrets(unittest.TestCase):
    def _tmp(self, text):
        handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, newline="\n")
        handle.write(text)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_short_values_are_not_treated_as_secrets(self):
        path = self._tmp("lots of 1 and 0 and wm-popup=1 here")
        ok, detail = check_secrets([path], ["1"])
        self.assertTrue(ok, detail)

    def test_real_secret_is_detected(self):
        secret = "supersecretvalue123"
        path = self._tmp(f"leaked {secret} oops")
        ok, _ = check_secrets([path], [secret])
        self.assertFalse(ok)

    def test_clean_file_passes(self):
        secret = "supersecretvalue123"
        path = self._tmp("nothing to see here")
        ok, _ = check_secrets([path], [secret])
        self.assertTrue(ok)


class TestSerialization(unittest.TestCase):
    def test_build_records_shape(self):
        posts = annotate_tree(build_tree(flatten_entries([make_entry(1, replies=[make_entry(2, parent_id=1)])])))
        topic = {"title": "T", "message": "<p>prompt</p>", "discussion_subentry_count": 2}
        records = build_records(topic, posts, 157398, 3205287, "https://rmit.instructure.com")
        self.assertEqual(records[0]["record_type"], "topic")
        self.assertEqual(records[0]["message_text"], "prompt")
        self.assertEqual(len(records), 3)
        post = records[1]
        self.assertEqual(post["record_type"], "post")
        self.assertEqual(post["course_id"], 157398)
        self.assertTrue(post["permalink"].endswith("#entry-1"))
        json.dumps(records)  # must be JSON-serialisable


if __name__ == "__main__":
    unittest.main(verbosity=2)
