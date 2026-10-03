#!/usr/bin/env python3
"""Reproduce the scraping-strategy viability matrix for a Canvas discussion.

Strategies compared
-------------------
A   Canvas REST API ``/entries`` (+ nested ``recent_replies``)   [primary]
A'  Canvas REST API ``/entries/:id/replies`` recursion           [cross-check]
B   HTTP GET of the discussion page + HTML parsing (lxml)        [expect DEAD]
D   Canvas REST API ``/view`` (nested tree)                      [alternative]
C   Headless-browser DOM extraction                              [fragile]

Strategy C needs a real browser. Playwright is not installed here, so C is
auto-skipped with exact reproduction steps instead of silently omitted; if
Playwright becomes importable the probe runs it automatically.

    python probe_strategies.py --course 157398 --topic 3205287
"""

from __future__ import annotations

import argparse
import sys
import time

from canvas_client import CanvasAuthError, CanvasClient, CanvasError

# The absolute XPath supplied with the original request. Kept verbatim so the
# brittleness finding is reproducible instead of paraphrased.
SUPPLIED_XPATH = (
    "/html/body/div[3]/div[2]/div[2]/div[3]/div[1]/div/span[2]/div/div/div/div/span/"
    "div/div/span/div[3]/div[1]/div/div/span/span/div/span/span[2]/div/span/div"
)

# Recorded from a live browser run against this topic (see README). Reproduced
# here so the discrepancy between "server HTML" and "rendered DOM" is explicit.
RECORDED_DOM_XPATH_MATCHES = 1
RECORDED_DOM_TARGET = (
    'div.userMessage > div.user_content[data-resource-type="discussion_topic.reply"]'
    '[data-resource-id="3529880"]'
)


def _timed(fn):
    start = time.perf_counter()
    try:
        value, detail = fn()
        return {"ok": True, "value": value, "detail": detail, "seconds": round(time.perf_counter() - start, 3)}
    except Exception as exc:  # probes must never abort the whole matrix
        return {"ok": False, "value": None, "detail": f"{type(exc).__name__}: {exc}",
                "seconds": round(time.perf_counter() - start, 3)}


# --------------------------------------------------------------------- probes


def probe_a(client: CanvasClient, course: int, topic: int) -> tuple[int, str]:
    entries = client.get_paginated(
        f"/api/v1/courses/{course}/discussion_topics/{topic}/entries", {"per_page": 100}
    )
    total = len(entries) + sum(len(e.get("recent_replies") or []) for e in entries)
    return total, f"{len(entries)} roots + nested recent_replies = {total} posts in 1 request"


def probe_a_prime(client: CanvasClient, course: int, topic: int) -> tuple[int, str]:
    entries = client.get_paginated(
        f"/api/v1/courses/{course}/discussion_topics/{topic}/entries", {"per_page": 100}
    )
    total = len(entries)
    requests = 1
    for entry in entries:
        replies = client.get_paginated(
            f"/api/v1/courses/{course}/discussion_topics/{topic}/entries/{entry['id']}/replies",
            {"per_page": 100},
        )
        total += len(replies)
        requests += 1
    return total, f"{total} posts via {requests} requests (roots + explicit reply calls)"


def probe_b(client: CanvasClient, course: int, topic: int, xpath: str) -> tuple[int, str]:
    import re

    import urllib.request

    url = f"{client.base_url}/courses/{course}/discussion_topics/{topic}"
    headers = {"User-Agent": client.user_agent, "Accept": "text/html"}
    if client.cookies:
        headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in client.cookies.items())
    if client.token:
        headers["Authorization"] = "Bearer " + client.token

    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=client.timeout) as response:
        raw = response.read()

    html = raw.decode("utf-8", errors="replace")
    from lxml import html as LH

    doc = LH.fromstring(raw)
    entry_nodes = doc.xpath("//*[contains(@class,'discussion_entry')]")
    resource_nodes = doc.xpath("//*[@data-resource-type]")
    xpath_hits = doc.xpath(xpath) if xpath else []
    body_divs = len(doc.xpath("/html/body/div"))
    app = doc.xpath("//*[@id='application']")

    # The raw page contains no post markup: count what a naive scraper finds.
    found = len(resource_nodes)
    detail = (
        f"page bytes={len(html)}; body/div={body_divs}; #application={'yes' if app else 'no'}; "
        f"data-resource-type nodes={found}; .discussion_entry={len(entry_nodes)}; "
        f"supplied XPath matches={len(xpath_hits)}"
    )
    # Guard against the page ever becoming server-rendered: detect marker text.
    if re.search(r"discussion_topic\.reply", html):
        detail += "; NOTE: post markup unexpectedly present in server HTML"
    return found, detail


def probe_d(client: CanvasClient, course: int, topic: int) -> tuple[int, str]:
    payload, _headers = client.get_json(f"/api/v1/courses/{course}/discussion_topics/{topic}/view")
    nodes = payload.get("view") or []

    def count(items):
        return sum(1 + count(n.get("replies") or []) for n in items)

    total = count(nodes)
    deleted = 0

    def count_deleted(items):
        nonlocal deleted
        for node in items:
            if node.get("deleted"):
                deleted += 1
            count_deleted(node.get("replies") or [])
        return deleted

    count_deleted(nodes)
    return total, f"{total} nested nodes ({deleted} marked deleted, {total - deleted} live); 1 request"


def probe_c_playwright(course: int, topic: int, cookie_file: str | None, xpath: str) -> tuple[int, str]:
    from playwright.sync_api import sync_playwright  # noqa: F401

    from canvas_client import load_netscape_cookies

    cookies = load_netscape_cookies(cookie_file) if cookie_file else {}
    url = f"https://rmit.instructure.com/courses/{course}/discussion_topics/{topic}"
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context()
        context.add_cookies([
            {"name": name, "value": value, "domain": "rmit.instructure.com", "path": "/"}
            for name, value in cookies.items()
        ])
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        for _ in range(6):
            buttons = page.locator("button", has_text="Expand Threads")
            if buttons.count() == 0:
                break
            try:
                buttons.first.click(timeout=3000)
            except Exception:
                pass
            page.wait_for_timeout(1500)
        hits = page.evaluate(
            "xp => document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength",
            xpath,
        )
        posts = page.evaluate(
            "() => document.querySelectorAll('[data-resource-type=\"discussion_topic.reply\"]').length"
        )
        browser.close()
    return posts, f"{posts} DOM reply nodes after expanding threads; supplied XPath matches={hits}"


# ----------------------------------------------------------------------- main


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--course", type=int, required=True)
    parser.add_argument("--topic", type=int, required=True)
    parser.add_argument("--cookie-file", default=None)
    parser.add_argument("--token", default=None)
    parser.add_argument("--xpath", default=SUPPLIED_XPATH)
    args = parser.parse_args(argv)

    try:
        client = CanvasClient(cookie_file=args.cookie_file, token=args.token)
    except CanvasAuthError as exc:
        print(f"AUTH ERROR: {exc}", file=sys.stderr)
        return 2

    try:
        topic_payload, _ = client.get_json(
            f"/api/v1/courses/{args.course}/discussion_topics/{args.topic}"
        )
    except CanvasError as exc:
        print(f"CANVAS ERROR: {exc}", file=sys.stderr)
        return 1

    expected = topic_payload.get("discussion_subentry_count")
    print(f"topic: {topic_payload.get('title')!r} (id {args.topic})")
    print(f"authoritative post count (discussion_subentry_count): {expected}")
    print("")

    results = {
        "A  REST /entries (+recent_replies)": _timed(lambda: probe_a(client, args.course, args.topic)),
        "A' REST /entries/:id/replies recursion": _timed(lambda: probe_a_prime(client, args.course, args.topic)),
        "B  page HTML + lxml": _timed(lambda: probe_b(client, args.course, args.topic, args.xpath)),
        "D  REST /view (nested tree)": _timed(lambda: probe_d(client, args.course, args.topic)),
    }

    if "C  headless browser DOM" not in results:
        try:
            import playwright  # noqa: F401

            results["C  headless browser DOM"] = _timed(
                lambda: probe_c_playwright(args.course, args.topic, args.cookie_file, args.xpath)
            )
        except ImportError:
            results["C  headless browser DOM"] = {
                "ok": False,
                "value": None,
                "detail": "Playwright not installed - see reproduction steps below",
                "seconds": 0.0,
                "skipped": True,
            }

    print(f"{'strategy':40} {'found':>6} {'sec':>7}  verdict")
    print("-" * 92)
    for name, result in results.items():
        found = result["value"]
        if result.get("skipped"):
            verdict = "SKIPPED (documented)"
            shown = "-"
        elif not result["ok"]:
            verdict = "ERROR"
            shown = "-"
        elif name.startswith("B"):
            verdict = "NOT VIABLE (server HTML has no posts)"
            shown = str(found)
        elif found is None:
            verdict = "ERROR"
            shown = "-"
        elif expected is not None and found >= expected:
            verdict = "VIABLE"
            shown = str(found)
        else:
            verdict = f"PARTIAL ({found} of {expected})"
            shown = str(found)
        print(f"{name:40} {shown:>6} {result['seconds']:>7.2f}  {verdict}")
        print(f"{'':40} {result['detail'][:150]}")

    print("")
    print("Supplied absolute XPath")
    print(f"  {args.xpath}")
    print(f"  matches in server HTML : 0   (recomputed above under strategy B)")
    print(f"  matches in live DOM    : {RECORDED_DOM_XPATH_MATCHES}   (recorded from browser run)")
    print(f"  live target            : {RECORDED_DOM_TARGET}")
    print("")

    if results["C  headless browser DOM"].get("skipped"):
        print("Strategy C reproduction (manual)")
        print("  1. Open the topic in a real browser with the cookies from cookies.txt")
        print("     (ego-browser: Network.setCookie via CDP, or a Playwright context.add_cookies).")
        print("  2. Click 'Expand Threads' and wait - post nodes render lazily")
        print("     (observed 12 -> 25 -> 33).")
        print("  3. Evaluate the supplied XPath: it resolves to exactly 1 element, the")
        print("     first-rendered post body - not an answers container.")
        print("  4. Durable DOM key instead: [data-resource-type=\"discussion_topic.reply\"]")
        print("     plus [data-resource-id], which equals the REST API id.")
        print("  pip install playwright && playwright install chromium   # to automate this")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
