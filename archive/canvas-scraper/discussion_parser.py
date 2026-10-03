"""Normalise Canvas discussion payloads into a flat post list and a tree.

Facts this module encodes (all verified against the live instance):

* ``GET /entries`` returns top-level posts whose ``recent_replies`` is a
  **flat** list of every descendant, not a nested tree. ``parent_id`` is
  present on each reply, so the tree is rebuilt from ids.
* A reply can be reachable from more than one path, so flattening must
  de-duplicate by ``post_id``.
* ``GET /view`` returns a genuinely nested tree that additionally contains
  posts marked ``deleted`` (which ``/entries`` omits). Those become tombstones
  so the two endpoints can be reconciled without looking like data loss.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

try:  # optional: only needed for high-fidelity HTML -> text
    from bs4 import BeautifulSoup
except Exception:  # pragma: no cover - exercised only without bs4 installed
    BeautifulSoup = None  # type: ignore[assignment]

__all__ = [
    "html_to_text",
    "normalize_entry",
    "flatten_entries",
    "build_tree",
    "annotate_tree",
    "iter_depth_first",
    "reconcile_view",
    "summarize",
]

_REPLACEMENT_CHAR = "\ufffd"
_BLOCK_TAGS = ("p", "div", "li", "tr", "br", "h1", "h2", "h3", "h4", "h5", "blockquote")
_TAG_RE = re.compile(r"<[^>]+>")
_BR_RE = re.compile(r"<\s*(br|/p|/div|/li|/tr)\s*/?\s*>", re.IGNORECASE)


def _regex_to_text(html: str) -> str:
    """Fallback converter used when BeautifulSoup is unavailable."""
    text = _BR_RE.sub("\n", html)
    text = _TAG_RE.sub(" ", text)
    return text


def html_to_text(html: str | None) -> tuple[str, int]:
    """Convert Canvas message HTML to readable text.

    Returns ``(text, replacement_char_count)``. The U+FFFD count is reported
    rather than scrubbed: one live message genuinely contains a mangled
    character in the source data, and silently dropping it would hide that.
    """
    if not html:
        return "", 0

    if BeautifulSoup is not None:
        soup = BeautifulSoup(html, "lxml")
        for br in soup.find_all("br"):
            br.replace_with("\n")
        for tag in soup.find_all(list(_BLOCK_TAGS)):
            tag.append("\n")
        text = soup.get_text()
    else:
        text = _regex_to_text(html)

    text = text.replace("\xa0", " ").replace("\u200b", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    return text, text.count(_REPLACEMENT_CHAR)


def normalize_entry(raw: dict, source: str = "api_entries") -> dict:
    """Turn one raw Canvas entry into a flat, JSON-serialisable post dict."""
    text, replacements = html_to_text(raw.get("message"))
    created = raw.get("created_at")
    updated = raw.get("updated_at")
    deleted = bool(raw.get("deleted"))

    return {
        "post_id": raw.get("id"),
        "parent_id": raw.get("parent_id"),
        "author_id": raw.get("user_id"),
        "author_name": raw.get("user_name"),
        "created_at": created,
        "updated_at": updated,
        "edited": bool(created and updated and created != updated),
        "read_state": raw.get("read_state"),
        "deleted": deleted,
        "has_more_replies": bool(raw.get("has_more_replies")),
        "message_html": raw.get("message") or "",
        "message_text": text,
        "decode_replacements": replacements,
        "source": source,
        "orphan": False,
        # filled in later
        "depth": 0,
        "is_root": False,
        "thread_path": [],
        "children": [],
        "author_role": "unknown",
        "responds_to_threads": 0,
    }


def flatten_entries(entries: Iterable[dict], source: str = "api_entries") -> list[dict]:
    """Flatten roots plus their replies, de-duplicating by id.

    Canvas' ``/entries`` returns ``recent_replies`` as a *flat* descendant list,
    but this descends into nested ``recent_replies`` as well so the same code
    also handles a nested payload. A container dict with no ``id`` (used to
    feed a bare reply list back through this function) is descended into
    without being emitted. Duplicate ids are emitted once and not re-descended.
    """
    seen: dict[Any, dict] = {}
    order: list[Any] = []

    def add(raw: dict, src: str) -> None:
        if not isinstance(raw, dict):
            return
        post_id = raw.get("id")
        if post_id is not None:
            if post_id in seen:
                return
            seen[post_id] = normalize_entry(raw, src)
            order.append(post_id)
        for child in raw.get("recent_replies") or []:
            add(child, src)

    for entry in entries or []:
        add(entry, source)

    return [seen[post_id] for post_id in order]


def _sort_key(post: dict) -> tuple:
    return (post.get("created_at") or "", post.get("post_id") or 0)


def build_tree(posts: list[dict]) -> list[dict]:
    """Rebuild the reply tree in place and return the ordered root list.

    Posts whose ``parent_id`` is absent from the set are re-parented to the
    root list and flagged ``orphan`` rather than being dropped.
    """
    by_id = {post["post_id"]: post for post in posts}
    for post in posts:
        post["children"] = []

    roots: list[dict] = []
    for post in posts:
        parent_id = post.get("parent_id")
        if parent_id is None or parent_id == post["post_id"]:
            post["parent_id"] = None
            roots.append(post)
        elif parent_id in by_id:
            by_id[parent_id]["children"].append(post)
        else:
            post["orphan"] = True
            post["parent_id"] = None
            roots.append(post)

    for post in posts:
        post["children"].sort(key=_sort_key)
    # Roots newest-first (matches Canvas' ordering); replies oldest-first.
    roots.sort(key=_sort_key, reverse=True)
    return roots


def annotate_tree(roots: list[dict]) -> list[dict]:
    """Assign ``depth``, ``is_root`` and ``thread_path``."""
    out: list[dict] = []

    def walk(node: dict, depth: int, path: list) -> None:
        node["depth"] = depth
        node["is_root"] = depth == 0
        node["thread_path"] = path + [node["post_id"]]
        out.append(node)
        for child in node["children"]:
            walk(child, depth + 1, node["thread_path"])

    for root in roots:
        walk(root, 0, [])
    return out


def iter_depth_first(roots: list[dict]) -> list[dict]:
    """Depth-first walk in display order (same order as ``annotate_tree``)."""
    out: list[dict] = []

    def walk(node: dict) -> None:
        out.append(node)
        for child in node["children"]:
            walk(child)

    for root in roots:
        walk(root)
    return out


def _walk_raw_view(nodes: Iterable[dict]) -> list[dict]:
    """Depth-first walk of the *raw* ``/view`` tree, which nests under ``replies``."""
    out: list[dict] = []

    def walk(node: dict) -> None:
        out.append(node)
        for child in node.get("replies") or []:
            walk(child)

    for node in nodes or []:
        if isinstance(node, dict):
            walk(node)
    return out


def reconcile_view(view_payload: dict, posts: list[dict]) -> dict:
    """Explain the difference between ``/view`` and ``/entries``.

    Returns a report plus ``tombstones``: posts present in ``/view`` but absent
    from ``/entries`` because Canvas marks them deleted. Since a deleted post
    has no body, it is recorded with an empty message.
    """
    flat_view = _walk_raw_view(view_payload.get("view") or [])
    view_ids = [node.get("id") for node in flat_view if node.get("id") is not None]
    entry_ids = {post["post_id"] for post in posts}

    tombstones: list[dict] = []
    unexplained: list[Any] = []
    for node in flat_view:
        node_id = node.get("id")
        if node_id is None or node_id in entry_ids:
            continue
        if node.get("deleted"):
            tombstone = normalize_entry(node, source="api_view_tombstone")
            tombstone["deleted"] = True
            tombstone["message_text"] = ""
            tombstone["message_html"] = ""
            tombstones.append(tombstone)
        else:
            unexplained.append(node_id)

    view_only = [i for i in view_ids if i not in entry_ids]
    entry_only = [i for i in entry_ids if i not in set(view_ids)]

    return {
        "view_node_count": len(view_ids),
        "view_unique_count": len(set(view_ids)),
        "entry_count": len(posts),
        "view_only_ids": view_only,
        "entry_only_ids": entry_only,
        "tombstones": tombstones,
        "unexplained_ids": unexplained,
        "explained": not entry_only and not unexplained,
    }


def summarize(posts: list[dict]) -> dict:
    """Small aggregate used for logs and the meta file.

    ``roots``/``replies`` count live posts only, so they always add up to
    ``live_posts``. Deleted tombstones are reported separately because they
    have no parent and would otherwise inflate the root count.
    """
    live = [p for p in posts if not p["deleted"]]
    roles: dict[str, int] = {}
    for post in posts:
        role = post.get("author_role", "unknown")
        roles[role] = roles.get(role, 0) + 1
    return {
        "total_posts": len(posts),
        "live_posts": len(live),
        "roots": sum(1 for p in live if p["is_root"]),
        "replies": sum(1 for p in live if not p["is_root"]),
        "deleted": sum(1 for p in posts if p["deleted"]),
        "orphans": sum(1 for p in posts if p["orphan"]),
        "max_depth": max((p["depth"] for p in posts), default=0),
        "distinct_authors": len({p["author_id"] for p in posts if p.get("author_id")}),
        "author_roles": roles,
        "decode_replacements": sum(p["decode_replacements"] for p in posts),
    }
