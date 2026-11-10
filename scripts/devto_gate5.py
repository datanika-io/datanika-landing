#!/usr/bin/env python3
"""Dev.to gate 5: does the canonical serve this post's text? landing#727.

`git diff` against origin/main answers whether the ref has the local file.
It does not answer whether datanika.io is serving that file. The edge keeps
the previous HTML for the cache TTL after a promotion, and that is when a
corrected post becomes syndicatable.

This module keeps both checks. An empty diff is not a pass unless a
cache-busted read of the canonical comes back `cf-cache-status: MISS` and
the served article contains the local post's text.

Fail closed. A canonical that cannot be read, a cache-bust that does not
return MISS, or a local post with no usable string refuses. A gate that
cannot look must not pass.
"""

from __future__ import annotations

import html
import json
import re
import secrets
import sys
import urllib.error
import urllib.request

SITE = "https://datanika.io"
# Long enough that a string is the post's, not the navbar's. Short enough
# that a corrected sentence is still a needle.
MIN_NEEDLE = 24
UA = "datanika-growth/1.0"

# Astro's markdown renders a straight apostrophe as U+2019 and straight
# quotes as curly quotes. The source file keeps the ASCII characters.
# Fold both sides or every real post looks different from its own page.
_TYPO = str.maketrans({
    "\u2018": "'",
    "\u2019": "'",
    "\u2032": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2026": "...",
    "\u00a0": " ",
})


# Cloudflare's email obfuscation rewrites a visible address to "[email protected]".
# That is a rendering of the same address, not a different post. Fold both
# forms to one token or every post that names an address looks drifted.
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_CF_EMAIL = re.compile(r"\[email\s+protected\]", re.I)


def fold(text: str) -> str:
    text = _CF_EMAIL.sub("[email]", text.translate(_TYPO))
    text = _EMAIL.sub("[email]", text)
    return re.sub(r"\s+", " ", text).strip()


def request_url(slug: str, nonce: str) -> str:
    """The cache-busted canonical. The nonce is part of the URL on purpose.

    Cloudflare keys HTML on the query string. A request without one can
    return the edge's previous object and still be HTTP 200.
    """
    if not re.fullmatch(r"[a-z0-9-]+", slug or ""):
        raise ValueError("slug is not a blog slug")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", nonce or ""):
        raise ValueError("nonce is not url-safe")
    return "%s/blog/%s/?cb=%s" % (SITE, slug, nonce)


def live_response(slug: str, urlopen=urllib.request.urlopen) -> dict:
    """GET the canonical with a fresh cache-buster. Never raises."""
    try:
        url = request_url(slug, secrets.token_hex(8))
    except ValueError as e:
        return {"status": 0, "headers": {}, "body": "", "error": str(e)}
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Cache-Control": "no-cache"},
        method="GET",
    )
    try:
        with urlopen(req, timeout=60) as r:
            headers = {k.lower(): v for k, v in r.headers.items()}
            body = r.read().decode("utf-8", "replace")
            return {"status": r.status, "headers": headers, "body": body, "error": ""}
    except urllib.error.HTTPError as e:
        headers = {k.lower(): v for k, v in e.headers.items()} if e.headers else {}
        raw = e.read().decode("utf-8", "replace") if e.fp else ""
        return {"status": e.code, "headers": headers, "body": raw, "error": ""}
    except Exception as e:  # noqa: BLE001 — a gate that cannot look must refuse
        return {"status": 0, "headers": {}, "body": "", "error": str(e)}


def _fm_value(raw: str) -> str:
    """Unwrap one pair of YAML quotes and the backslash escapes inside them.

    A YAML title keeps a backslash in front of an inner quote. The page
    does not: it shows a curly quote, which `fold` then flattens.
    """
    val = raw.strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
        val = val[1:-1]
    return val.replace('\\"', '"').replace("\\'", "'")


def _frontmatter_and_body(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    fm: dict[str, str] = {}
    for line in parts[1].splitlines():
        m = re.match(r"^(\w+):\s*(.*)$", line)
        if m:
            fm[m.group(1)] = _fm_value(m.group(2))
    return fm, parts[2]


def _strip_inline(text: str) -> str:
    """Turn markdown into the words the rendered article shows.

    Inline code is held out of the emphasis pass. A cron expression
    ``0 * * * *`` is full of asterisks, and ``____dlt_loads`` is full of
    underscores; stripping emphasis across them deletes characters the
    page still has.
    """
    codes: list[str] = []
    escapes: list[str] = []

    def hold(m: re.Match) -> str:
        codes.append(m.group(1))
        return "\ue000%d\ue001" % (len(codes) - 1)

    def hold_esc(m: re.Match) -> str:
        escapes.append(m.group(1))
        return "\ue002%d\ue003" % (len(escapes) - 1)

    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\[[^\]]*\]", r"\1", text)
    text = re.sub(r"`([^`]*)`", hold, text)
    # `\*` inside emphasis is a literal asterisk, not the end of the span.
    # The page shows the asterisk and not the backslash.
    text = re.sub(r"\\([\\`*_{}\[\]()#+\-.!|>])", hold_esc, text)
    text = text.replace("**", "")
    text = re.sub(r"__([^_\n]+)__", r"\1", text)
    text = re.sub(r"(?<!\w)\*([^*\n]+)\*(?!\w)", r"\1", text)
    # `_only_` is emphasis. `airtable_daily_sync` is not: the underscore there
    # sits between word characters, so the lookarounds refuse it.
    text = re.sub(r"(?<!\w)_([^_\n]+)_(?!\w)", r"\1", text)
    # Raw inline HTML in the markdown. `<sup>` is removed with no space,
    # matching the article-text pass; `<br>` becomes a space, matching a
    # block tag. `<upload>` inside code is still held and is left alone.
    text = re.sub(r"(?is)<br\s*/?>", " ", text)
    text = re.sub(r"(?is)</?(?:sup|sub|kbd|wbr)\b[^>]*>", "", text)
    text = re.sub(r"\ue002(\d+)\ue003", lambda m: escapes[int(m.group(1))], text)
    return re.sub(r"\ue000(\d+)\ue001", lambda m: codes[int(m.group(1))], text)


def _prose_needles(chunk: str) -> list[str]:
    needles: list[str] = []
    for block in re.split(r"\n\s*\n", chunk):
        lines = [ln.rstrip() for ln in block.splitlines()]
        content = [ln for ln in lines if ln.strip()]
        if not content:
            continue
        if all(ln.strip().startswith("|") for ln in content):
            for ln in content:
                if re.match(r"^\s*\|?\s*:?-{3,}", ln):
                    continue
                for cell in ln.strip().strip("|").split("|"):
                    text = fold(_strip_inline(cell.strip()))
                    if len(text) >= MIN_NEEDLE:
                        needles.append(text)
            continue
        pieces = []
        for ln in content:
            s = ln.strip()
            if s in ("---", "***", "___"):
                continue
            s = re.sub(r"^#{1,6}\s+", "", s)
            s = re.sub(r"^>\s?", "", s)
            s = re.sub(r"^[-*+]\s+", "", s)
            s = re.sub(r"^\d+\.\s+", "", s)
            pieces.append(_strip_inline(s))
        text = fold(" ".join(pieces))
        if len(text) >= MIN_NEEDLE:
            needles.append(text)
    return needles


def distinguishing_strings(markdown: str) -> list[str]:
    """Strings the served article must contain.

    Taken from the local post, not from the page, so a stale edge copy that
    lacks a corrected sentence cannot satisfy them.
    """
    fm, body = _frontmatter_and_body(markdown)
    needles: list[str] = []
    for key in ("title", "description"):
        text = fold(fm.get(key, ""))
        if len(text) >= MIN_NEEDLE:
            needles.append(text)
    pos = 0
    for m in re.finditer(r"```[^\n]*\n(.*?)```", body, flags=re.S):
        needles.extend(_prose_needles(body[pos:m.start()]))
        code = fold(m.group(1))
        if len(code) >= MIN_NEEDLE:
            needles.append(code)
        pos = m.end()
    needles.extend(_prose_needles(body[pos:]))
    # Preserve order, drop duplicates.
    seen: set[str] = set()
    out = []
    for n in needles:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


# Inline tags carry no space of their own. Replacing them with a space turns
# `<code>Acme Corp</code>.` into `Acme Corp .`, which is not the source text.
_INLINE_TAG = re.compile(
    r"(?is)</?(?:span|code|strong|em|a|b|i|mark|small|sub|sup|abbr|time)\b[^>]*>"
)


def article_text(raw_html: str) -> str | None:
    m = re.search(r"(?is)<article\b[^>]*>(.*)</article>", raw_html)
    if not m:
        return None
    inner = m.group(1)
    inner = re.sub(r"(?is)<script\b[^>]*>.*?</script>", " ", inner)
    inner = re.sub(r"(?is)<style\b[^>]*>.*?</style>", " ", inner)
    inner = _INLINE_TAG.sub("", inner)
    inner = re.sub(r"(?is)<[^>]+>", " ", inner)
    return fold(html.unescape(inner))


def gate5_decision(diff_stat, markdown: str, response) -> dict:
    """Both halves of gate 5.

    `diff_stat` is `git diff --shortstat origin/main -- <post>`. None means
    the diff could not be run. "" means the ref matches. Anything else is
    drift. The served half runs only when the ref matches, and it still
    refuses when the response is missing: an empty diff is not evidence
    about the bytes on the edge.
    """
    if diff_stat is None:
        return {"ok": False, "reason": "ref comparison could not run"}
    diff = str(diff_stat).strip()
    if diff:
        return {"ok": False, "reason": "ref drift", "diff": diff}
    if not isinstance(response, dict) or response.get("error") or not response.get("status"):
        return {"ok": False, "reason": "canonical could not be read"}
    status = response.get("status")
    if status != 200:
        return {"ok": False, "reason": "canonical status %s" % status}
    headers = {str(k).lower(): v for k, v in (response.get("headers") or {}).items()}
    cache = str(headers.get("cf-cache-status") or "").strip().upper()
    if cache != "MISS":
        return {
            "ok": False,
            "reason": "cache-bust returned %s, not MISS" % (cache or "no cf-cache-status"),
        }
    text = article_text(response.get("body") or "")
    if text is None:
        return {"ok": False, "reason": "served page has no article"}
    needles = distinguishing_strings(markdown or "")
    if not needles:
        return {"ok": False, "reason": "local post has no distinguishing string"}
    missing = [n for n in needles if n not in text]
    if missing:
        return {"ok": False, "reason": "served text differs", "missing": missing[0]}
    return {"ok": True, "reason": "", "checked": len(needles)}


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] == "--request":
        if len(argv) != 4:
            print("usage: devto_gate5.py --request <slug> <nonce>", file=sys.stderr)
            return 2
        try:
            print(request_url(argv[2], argv[3]))
        except ValueError as e:
            print("FAIL gate 5: %s" % e, file=sys.stderr)
            return 1
        return 0

    raw = sys.stdin.read()
    if not raw.strip():
        print("FAIL gate 5: no decision input", file=sys.stderr)
        return 2
    data = json.loads(raw)
    # `diff_stat` absent is "could not run", not "empty". An empty string is a match.
    diff_stat = data["diff_stat"] if "diff_stat" in data else None
    decision = gate5_decision(diff_stat, data.get("markdown") or "", data.get("response"))
    json.dump(decision, sys.stdout)
    sys.stdout.write("\n")
    return 0 if decision["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
