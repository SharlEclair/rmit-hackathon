"""Serialise scraped discussions to JSONL, Markdown, and a meta summary."""

from __future__ import annotations

import datetime as _dt
import json
import os

__all__ = [
    "build_records",
    "write_jsonl",
    "write_markdown",
    "write_meta",
]

_ROLE_LABEL = {
    "teacher": "teacher",
    "ta": "TA",
    "designer": "designer",
    "student": "student",
    "observer": "observer",
    "student_view": "student view",
    "unknown": "role unknown",
}


def build_records(topic: dict, posts: list[dict], course_id: int, topic_id: int, base_url: str) -> list[dict]:
    """Return the topic record followed by every post, depth-first."""
    topic_html = topic.get("message") or ""
    from discussion_parser import html_to_text  # local import keeps this module dependency-light

    topic_text, replacements = html_to_text(topic_html)

    topic_record = {
        "record_type": "topic",
        "course_id": course_id,
        "topic_id": topic_id,
        "topic_title": topic.get("title"),
        "discussion_type": topic.get("discussion_type"),
        "posted_at": topic.get("posted_at"),
        "last_reply_at": topic.get("last_reply_at"),
        "author_id": (topic.get("author") or {}).get("id"),
        "author_name": (topic.get("author") or {}).get("display_name"),
        "anonymous_state": topic.get("anonymous_state"),
        "discussion_subentry_count": topic.get("discussion_subentry_count"),
        "message_html": topic_html,
        "message_text": topic_text,
        "decode_replacements": replacements,
        "html_url": topic.get("html_url"),
    }

    records = [topic_record]
    for post in posts:
        record = {
            "record_type": "post",
            "course_id": course_id,
            "topic_id": topic_id,
            "topic_title": topic.get("title"),
            "post_id": post["post_id"],
            "parent_id": post["parent_id"],
            "depth": post["depth"],
            "is_root": post["is_root"],
            "author_id": post["author_id"],
            "author_name": post["author_name"],
            "author_role": post["author_role"],
            "responds_to_threads": post["responds_to_threads"],
            "created_at": post["created_at"],
            "updated_at": post["updated_at"],
            "edited": post["edited"],
            "read_state": post["read_state"],
            "deleted": post["deleted"],
            "orphan": post["orphan"],
            "message_html": post["message_html"],
            "message_text": post["message_text"],
            "decode_replacements": post["decode_replacements"],
            "thread_path": post["thread_path"],
            "permalink": f"{base_url}/courses/{course_id}/discussion_topics/{topic_id}#entry-{post['post_id']}",
            "source": post["source"],
        }
        records.append(record)
    return records


def write_jsonl(path: str, records: list[dict]) -> int:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return len(records)


def write_markdown(path: str, topic: dict, posts: list[dict], base_url: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    # Only live posts count towards the root/reply split; deleted tombstones
    # have no parent and would otherwise inflate the root count.
    live = [p for p in posts if not p["deleted"]]
    roots = [p for p in live if p["is_root"]]
    replies = [p for p in live if not p["is_root"]]
    tombstones = [p for p in posts if p["deleted"]]
    scraped = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")

    lines: list[str] = []
    lines.append(f"# {topic.get('title') or 'Discussion'}")
    lines.append("")
    lines.append(f"- **Course** {topic.get('course_id', '')}")
    lines.append(f"- **Topic** {topic.get('topic_id', '')} — {topic.get('html_url') or ''}")
    lines.append(f"- **Posts** {len(live)} (roots {len(roots)}, replies {len(replies)})")
    lines.append(f"- **Scraped** {scraped} from `{base_url}`")
    lines.append("")

    if topic.get("_message_text"):
        lines.append("### Discussion prompt")
        lines.append("")
        for para in str(topic["_message_text"]).split("\n\n"):
            lines.append(para)
            lines.append("")

    def render(node: dict) -> None:
        # No leading indentation anywhere: a 4+ space indent turns a line into
        # an indented code block in CommonMark, which would break deep replies.
        # Nesting is expressed through heading level instead.
        level = "#" * (3 + min(node["depth"], 3))
        role = _ROLE_LABEL.get(node.get("author_role"), node.get("author_role") or "unknown")
        who = node.get("author_name") or "unknown author"
        if node["deleted"]:
            lines.append(f"{level} ~~deleted post~~ (id {node['post_id']})")
            lines.append("")
            return
        heading = "Question" if node["is_root"] else "↳ Reply"
        if node["orphan"]:
            heading += " (orphaned parent)"
        lines.append(f"{level} {heading} — {who} ({role})")
        lines.append("")
        lines.append(f"*id {node['post_id']} · {node.get('created_at') or 'no timestamp'}"
                     f"{' · edited' if node.get('edited') else ''}*")
        lines.append("")
        body = node.get("message_text") or "*(empty)*"
        for para in body.split("\n\n"):
            lines.append(para)
            lines.append("")
        for child in node["children"]:
            render(child)

    for index, root in enumerate(roots, start=1):
        lines.append("---")
        lines.append("")
        lines.append(f"## Thread {index}")
        lines.append("")
        render(root)

    if tombstones:
        lines.append("---")
        lines.append("")
        lines.append("## Deleted posts")
        lines.append("")
        lines.append(
            "Present in `/view` but absent from `/entries` because Canvas marks them deleted. "
            "Listed so the `/view` node count reconciles exactly."
        )
        lines.append("")
        for tomb in tombstones:
            lines.append(f"- id {tomb['post_id']} — deleted (no body available)")
        lines.append("")

    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines).rstrip() + "\n")


def write_meta(path: str, meta: dict) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
