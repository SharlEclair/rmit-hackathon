"""Resolve discussion authors to course roles.

Verified behaviour on the RMIT instance:

* ``GET /courses/:id/enrollments`` exposes **students only** for a student
  caller (1200 records crawled, zero staff), so it cannot be used to find
  teachers.
* ``GET /courses/:id/users?enrollment_type=teacher`` and ``...=ta`` *do* work
  and return staff, so those are the authoritative staff source.
* Some active answerers are still unresolvable through either route
  (e.g. non-enrolled lecturers), hence the override file and the explicit
  ``unknown`` role. Callers must treat ``unknown`` as "include", never
  "exclude", so a role guess can never silently drop an answer.
"""

from __future__ import annotations

import json
import os

__all__ = ["TYPE_TO_ROLE", "ROLE_PRIORITY", "build_role_map", "load_overrides", "STARTER_OVERRIDES"]

TYPE_TO_ROLE = {
    "TeacherEnrollment": "teacher",
    "TaEnrollment": "ta",
    "DesignerEnrollment": "designer",
    "StudentEnrollment": "student",
    "ObserverEnrollment": "observer",
    "StudentViewEnrollment": "student_view",
}

# Higher wins when a user has several enrollments.
ROLE_PRIORITY = {
    "unknown": 0,
    "student_view": 1,
    "observer": 2,
    "student": 3,
    "designer": 4,
    "ta": 5,
    "teacher": 6,
}

# Known answerers that the API does not classify as staff. Roles default to
# "unknown" so nothing is asserted without evidence; flip to "teacher"/"ta"
# once confirmed. Personal names are deliberately not recorded here: this file
# is version-controlled, and the identifiers are enough to correct a role.
STARTER_OVERRIDES = {
    "269594": {"name": "Unresolved answerer A", "role": "unknown", "note": "Posts answers; not visible in teacher/ta lists."},
    "438489": {"name": "Unresolved answerer B", "role": "unknown", "note": "Posts follow-ups; role not derivable."},
}


def load_overrides(path: str | None = None) -> dict:
    """Load ``staff_overrides.json`` if present, else the starter defaults."""
    candidates = []
    if path:
        candidates.append(path)
    here = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(here, "staff_overrides.json"))
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            with open(candidate, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            return {str(k): v for k, v in (data or {}).items()}
    return {str(k): v for k, v in STARTER_OVERRIDES.items()}


def _better(current: str, candidate: str) -> str:
    if ROLE_PRIORITY.get(candidate, 0) > ROLE_PRIORITY.get(current, 0):
        return candidate
    return current


def build_role_map(client, course_id: int, overrides: dict | None = None) -> dict:
    """Return ``{user_id: {"name": str, "role": str, "roles": [...]}}``.

    Overlays the authoritative teacher/TA lists on top of the paginated user
    crawl, then applies manual overrides last.
    """
    roles: dict[int, dict] = {}

    users = client.get_paginated(
        f"/api/v1/courses/{course_id}/users",
        {"per_page": 100, "include[]": "enrollments"},
    )
    for user in users:
        user_id = user.get("id")
        if user_id is None:
            continue
        found: list[str] = []
        for enrollment in user.get("enrollments") or []:
            label = TYPE_TO_ROLE.get(enrollment.get("type"))
            if label:
                found.append(label)
        entry = roles.setdefault(user_id, {"name": user.get("name"), "roles": []})
        entry["name"] = entry.get("name") or user.get("name")
        for label in found:
            if label not in entry["roles"]:
                entry["roles"].append(label)

    # Authoritative staff lists.
    for enrollment_type, label in (("teacher", "teacher"), ("ta", "ta")):
        try:
            staff = client.get_paginated(
                f"/api/v1/courses/{course_id}/users",
                {"per_page": 100, "enrollment_type": enrollment_type},
            )
        except Exception:  # tolerate a permission change on this endpoint
            staff = []
        for user in staff:
            user_id = user.get("id")
            if user_id is None:
                continue
            entry = roles.setdefault(user_id, {"name": user.get("name"), "roles": []})
            entry["name"] = entry.get("name") or user.get("name")
            if label not in entry["roles"]:
                entry["roles"].append(label)

    resolved = {}
    for user_id, entry in roles.items():
        role = "unknown"
        for label in entry["roles"]:
            role = _better(role, label)
        resolved[user_id] = {"name": entry.get("name"), "role": role, "roles": list(entry["roles"])}

    for raw_id, override in (overrides or {}).items():
        try:
            user_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        entry = resolved.setdefault(user_id, {"name": None, "role": "unknown", "roles": []})
        if override.get("name"):
            entry["name"] = override["name"]
        if override.get("role"):
            entry["role"] = override["role"]
        entry["overridden"] = True

    return resolved


def tag_posts(posts: list[dict], role_map: dict) -> dict:
    """Attach ``author_role`` to every post and report unresolved authors."""
    unresolved: dict[int, str] = {}
    for post in posts:
        author_id = post.get("author_id")
        info = role_map.get(author_id) if author_id is not None else None
        if info:
            post["author_role"] = info.get("role", "unknown")
            if not post.get("author_name"):
                post["author_name"] = info.get("name")
        else:
            post["author_role"] = "unknown"
            if author_id is not None:
                unresolved[author_id] = post.get("author_name") or ""

    # Advisory signal only: how many distinct root threads each author replied to.
    root_ids = {post["post_id"] for post in posts if post.get("is_root")}
    counts: dict[int, set] = {}
    for post in posts:
        if post.get("author_id") is None:
            continue
        counts.setdefault(post["author_id"], set())
    by_id = {post["post_id"]: post for post in posts}
    for post in posts:
        if post.get("is_root"):
            continue
        ancestor = by_id.get(post.get("parent_id"))
        while ancestor is not None and not ancestor.get("is_root"):
            ancestor = by_id.get(ancestor.get("parent_id"))
        if ancestor is not None:
            counts.setdefault(post["author_id"], set()).add(ancestor["post_id"])
    for post in posts:
        post["responds_to_threads"] = len(counts.get(post.get("author_id"), set()))

    return {"unresolved_authors": unresolved, "known_root_ids": sorted(root_ids)}
