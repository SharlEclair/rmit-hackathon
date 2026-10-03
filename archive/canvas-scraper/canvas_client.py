"""Canvas REST client: cookie/token auth, Link-header pagination, retry.

Read-only by construction: only ``GET`` requests are ever issued, so this
module cannot mutate Canvas state (no posting, no mark-read, no writes).

Auth precedence
---------------
1. explicit ``token`` argument
2. ``CANVAS_TOKEN`` environment variable
3. Netscape-format cookie file (``cookies.txt``)

Cookie mode sends every parsed cookie. ``canvas_session`` alone is sufficient
for the RMIT instance (verified: it returns 200, while no cookies returns 401),
but sending the full set mirrors the request that was verified to work.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any

__all__ = [
    "CHROME_UA",
    "DEFAULT_BASE_URL",
    "CanvasError",
    "CanvasAuthError",
    "CanvasRateLimitError",
    "CanvasClient",
    "load_netscape_cookies",
    "parse_next_link",
    "lower_headers",
]

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

DEFAULT_BASE_URL = "https://rmit.instructure.com"

# Canvas Link headers look like:
#   <url>; rel="current",<url>; rel="next",<url>; rel="last"
_LINK_NEXT_RE = re.compile(r'<([^>]+)>\s*;\s*rel="next"')
_LINK_ANY_RE = re.compile(r'<([^>]+)>\s*;\s*rel="([^"]+)"')

_JSON_HINT = ("json", "javascript")
_HTML_HEAD = ("<!doctype", "<html")


class CanvasError(RuntimeError):
    """Base class for scraper failures."""


class CanvasAuthError(CanvasError):
    """Session/token is missing, expired, or rejected by Canvas."""


class CanvasRateLimitError(CanvasError):
    """Canvas rate limit exhausted; stop rather than hammer the API."""


def lower_headers(headers: Any) -> dict:
    """Return a plain dict with lower-cased header names.

    ``urllib`` hands back an ``email.message.Message``-ish object whose keys
    keep the server's original casing, so lookups must be case-insensitive.
    """
    if not headers:
        return {}
    try:
        items = headers.items()
    except AttributeError:
        return {}
    return {str(k).lower(): v for k, v in items}


def load_netscape_cookies(path: str) -> dict:
    """Parse a Netscape ``cookies.txt`` file into ``{name: value}``.

    Handles the ``#HttpOnly_`` prefix extension, blank lines, and ordinary
    ``#`` comments. Lines with fewer than the 7 required tab-separated fields
    are skipped rather than raising, so a partially malformed export still
    yields the cookies it does contain.
    """
    cookies: dict[str, str] = {}
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = raw.rstrip("\n").rstrip("\r")
            if not line.strip():
                continue
            if line.startswith("#HttpOnly_"):
                line = line[len("#HttpOnly_") :]
            elif line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 7:
                continue
            name = parts[5].strip()
            value = parts[6]
            if name:
                cookies[name] = value
    return cookies


def parse_next_link(link_header: str | None) -> str | None:
    """Extract the ``rel="next"`` URL from a Link header, or ``None``."""
    if not link_header:
        return None
    match = _LINK_NEXT_RE.search(link_header)
    return match.group(1) if match else None


def parse_all_links(link_header: str | None) -> dict:
    """Return ``{rel: url}`` for every link in the header."""
    if not link_header:
        return {}
    return {rel: url for url, rel in _LINK_ANY_RE.findall(link_header)}


@dataclass
class CanvasClient:
    """Minimal, read-only Canvas API client."""

    base_url: str = DEFAULT_BASE_URL
    cookie_file: str | None = None
    token: str | None = None
    user_agent: str = CHROME_UA
    timeout: int = 30
    max_retries: int = 3
    max_pages: int = 100

    cookies: dict = field(default_factory=dict)
    auth_mode: str = "none"
    cookie_path: str | None = None
    request_log: list = field(default_factory=list)
    rate_limit_remaining: float | None = None
    sleep: Any = time.sleep

    def __post_init__(self) -> None:
        self.base_url = (self.base_url or DEFAULT_BASE_URL).rstrip("/")

        if self.token is None:
            self.token = os.environ.get("CANVAS_TOKEN") or None

        if self.token:
            self.auth_mode = "token"
            return

        path = self._resolve_cookie_file()
        if path is None:
            raise CanvasAuthError(
                "No credentials found. Provide cookies.txt (Netscape format) or "
                "set CANVAS_TOKEN to a Canvas personal access token."
            )
        self.cookie_path = path
        self.cookies = load_netscape_cookies(path)
        if not self.cookies:
            raise CanvasAuthError(f"Cookie file {path!r} contained no usable cookies.")
        self.auth_mode = "cookies"

    # ------------------------------------------------------------------ setup

    def _resolve_cookie_file(self) -> str | None:
        here = os.path.dirname(os.path.abspath(__file__))
        candidates: list[str] = []
        if self.cookie_file:
            candidates.append(self.cookie_file)
        env = os.environ.get("CANVAS_COOKIE_FILE")
        if env:
            candidates.append(env)
        candidates.extend(
            [
                os.path.join(here, os.pardir, "cookies.txt"),  # workspace root
                os.path.join(here, "cookies.txt"),
                "cookies.txt",
            ]
        )
        for candidate in candidates:
            if candidate and os.path.isfile(candidate):
                return os.path.abspath(candidate)
        return None

    def describe_auth(self) -> dict:
        """Credential summary that never leaks secret values."""
        info = {
            "mode": self.auth_mode,
            "base_url": self.base_url,
            "cookie_file": self.cookie_path,
            "cookie_names": sorted(self.cookies) if self.cookies else [],
        }
        return info

    # --------------------------------------------------------------- requests

    def _headers(self, accept: str) -> dict:
        headers = {"User-Agent": self.user_agent, "Accept": accept}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        elif self.cookies:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        return headers

    def _url(self, path_or_url: str, params: dict | None = None) -> str:
        if path_or_url.startswith(("http://", "https://")):
            url = path_or_url
        else:
            url = self.base_url + ("" if path_or_url.startswith("/") else "/") + path_or_url
        if params:
            query = urllib.parse.urlencode(params, doseq=True)
            url = url + ("&" if "?" in url else "?") + query
        return url

    def _retry_delay(self, headers: dict, attempt: int) -> float:
        retry_after = headers.get("retry-after")
        if retry_after:
            try:
                return max(0.0, min(60.0, float(retry_after)))
            except (TypeError, ValueError):
                pass
        return min(2.0**attempt, 16.0)

    def _record(self, status: int, headers: dict, url: str) -> None:
        remaining = headers.get("x-rate-limit-remaining")
        if remaining is not None:
            try:
                self.rate_limit_remaining = float(remaining)
            except (TypeError, ValueError):
                pass
        self.request_log.append(
            {
                "status": status,
                "url": url,
                "request_cost": headers.get("x-request-cost"),
                "runtime": headers.get("x-runtime"),
                "rate_limit_remaining": remaining,
            }
        )

    def _request(self, url: str, accept: str = "application/json") -> tuple[int, dict, bytes]:
        """GET ``url`` once (with retries). Returns ``(status, headers, body)``."""
        request = urllib.request.Request(url, headers=self._headers(accept), method="GET")
        attempt = 0
        while True:
            attempt += 1
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    body = response.read()
                    headers = lower_headers(response.headers)
                    status = int(getattr(response, "status", 200) or 200)
            except urllib.error.HTTPError as exc:
                body = exc.read()
                headers = lower_headers(getattr(exc, "headers", None))
                status = int(exc.code)
                if status in (429, 500, 502, 503, 504) and attempt <= self.max_retries:
                    self.sleep(self._retry_delay(headers, attempt))
                    continue
                if status in (401, 403):
                    raise CanvasAuthError(
                        f"Canvas rejected the credentials (HTTP {status}) for {url}. "
                        "The session cookie has most likely expired - re-export "
                        "cookies.txt while logged in, or set CANVAS_TOKEN."
                    ) from exc
                raise CanvasError(
                    f"HTTP {status} for {url}. Body starts: {body[:200]!r}"
                ) from exc
            except urllib.error.URLError as exc:
                if attempt <= self.max_retries:
                    self.sleep(min(2.0**attempt, 16.0))
                    continue
                raise CanvasError(f"Network error for {url}: {exc}") from exc

            if self.rate_limit_remaining is not None and self.rate_limit_remaining <= 0:
                self._record(status, headers, url)
                raise CanvasRateLimitError(
                    f"Canvas rate limit exhausted (x-rate-limit-remaining="
                    f"{self.rate_limit_remaining}) while fetching {url}."
                )
            self._record(status, headers, url)
            return status, headers, body

    # ------------------------------------------------------------ public API

    def get_json(self, path_or_url: str, params: dict | None = None) -> tuple[Any, dict]:
        """GET and decode JSON, raising ``CanvasAuthError`` on a login redirect."""
        url = self._url(path_or_url, params)
        _status, headers, body = self._request(url, accept="application/json")
        text = body.decode("utf-8", errors="replace")
        content_type = str(headers.get("content-type") or "").lower()

        looks_like_html = text.lstrip()[:16].lower().startswith(_HTML_HEAD)
        if looks_like_html and not any(hint in content_type for hint in _JSON_HINT):
            raise CanvasAuthError(
                "Canvas returned HTML instead of JSON for "
                f"{url} - the session is almost certainly expired. Re-export "
                "cookies.txt from a logged-in browser session, or set CANVAS_TOKEN."
            )
        try:
            return json.loads(text), headers
        except json.JSONDecodeError as exc:
            raise CanvasError(
                f"Could not decode JSON from {url}: {exc}. Body starts: {text[:200]!r}"
            ) from exc

    def get_paginated(
        self,
        path_or_url: str,
        params: dict | None = None,
        max_pages: int | None = None,
    ) -> list:
        """GET a collection, following the Link header ``rel="next"`` cursor."""
        limit = max_pages or self.max_pages
        items: list = []
        url = self._url(path_or_url, params)
        seen: set[str] = set()

        for _ in range(limit):
            if url in seen:
                break
            seen.add(url)
            payload, headers = self.get_json(url)
            if isinstance(payload, list):
                items.extend(payload)
            else:  # defensive: a non-list payload means we are off the rails
                raise CanvasError(f"Expected a JSON array from {url}, got {type(payload).__name__}.")
            next_url = parse_next_link(headers.get("link"))
            if not next_url:
                break
            url = next_url
        return items

    def get_profile(self) -> dict:
        """Cheap credential smoke test."""
        payload, _headers = self.get_json("/api/v1/users/self/profile")
        return payload

    def verify_auth(self) -> dict:
        """Return a small, secret-free summary proving the session works."""
        profile = self.get_profile()
        return {
            "ok": True,
            "user_id": profile.get("id"),
            "name": profile.get("name"),
            "login_id": profile.get("login_id"),
            "auth_mode": self.auth_mode,
        }
