"""Pure-function "scrape audit and offline replay" helpers.

The functions in this module never make network requests, never read from or
write to disk, and never mutate their inputs. They replay the parsing logic of
:mod:`src.scrape` against an in-memory mapping of already-downloaded HTML pages
and return structured, JSON-serializable plain data (``dict``/``list``/``str``/
``int``/``bool``/``None``) describing what would be scraped and which sanity
checks pass or fail.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Mapping, Sequence

from bs4 import BeautifulSoup
from slugify import slugify

from src.utils import safestr

#: Text (lower-cased) that marks the heading immediately preceding a projection table.
TARGET_HEADING_TEXT = "assessments of appropriate monetary policy"

#: Marker every FOMC projection-table URL must contain.
URL_MARKER = "fomcprojtabl"

#: Eight trailing digits encode the meeting date in a source URL.
URL_DATE_RE = re.compile(r"^.*?(\d{8})(?:\.htm)?/?$")


def _check(name: str, passed: bool, reason: str | None = None) -> dict[str, Any]:
    """Build a single check result."""
    result: dict[str, Any] = {"name": name, "passed": bool(passed)}
    result["reason"] = None if passed else reason
    return result


def parse_url_date(url: str) -> tuple[str | None, str | None]:
    """Parse the trailing eight-digit date from a source URL.

    Mirrors the shape of the URLs consumed by :func:`src.utils.parse_date` but
    never raises: a malformed URL yields ``(None, reason)`` instead.

    Args:
        url: A candidate projection-table URL.

    Returns:
        A ``(iso_date, error)`` tuple. Exactly one element is ``None``.
    """
    if URL_MARKER not in url:
        return None, f'URL is missing the "{URL_MARKER}" marker: {url}'
    match = URL_DATE_RE.match(url)
    if match is None:
        return None, f"URL does not end with an eight-digit date: {url}"
    raw = match.group(1)
    try:
        parsed = datetime.strptime(raw, "%Y%m%d")
    except ValueError:
        return None, f"Trailing eight digits {raw!r} are not a valid date: {url}"
    return parsed.date().isoformat(), None


def extract_calendar_urls(calendar_html: str) -> list[str]:
    """Extract projection-table links from a FOMC calendar page.

    Uses the same link filter as :func:`src.scrape._get_source_urls` and turns
    relative hrefs into absolute federalreserve.gov URLs.
    """
    soup = BeautifulSoup(calendar_html, "html.parser")
    links = soup.find_all(
        "a", href=lambda href: href and URL_MARKER in href and ".htm" in href
    )
    return [
        f"https://www.federalreserve.gov{a['href']}"
        for a in links
        if a.get("href")
    ]


def _coerce_date(value: Any) -> datetime | None:
    """Best-effort conversion of a date-range endpoint to a datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        # Fall back to a pandas-style parse (e.g. "20210317") without importing pandas.
        try:
            return datetime.strptime(str(value), "%Y%m%d")
        except ValueError:
            return None


def _parse_table(html: str) -> dict[str, Any]:
    """Replay :func:`src.scrape._parse_source_url`'s table parsing offline.

    Returns a plain-data dict describing the table, or an error marker instead
    of raising when the page has no projection table.
    """
    soup = BeautifulSoup(html, "html.parser")
    target_heading = soup.find(
        ["h4", "h5"],
        string=lambda text: text
        and TARGET_HEADING_TEXT in text.lower(),
    )
    if target_heading is None:
        return {"has_table": False, "reason": "no target h4/h5 heading found"}
    target_table = target_heading.find_next("table")
    if target_table is None:
        return {"has_table": False, "reason": "no table follows the target heading"}
    if target_table.thead is None or target_table.thead.tr is None:
        return {"has_table": False, "reason": "target table has no thead row"}

    raw_headers = [
        safestr(th.text) for th in target_table.thead.tr.find_all("th")
    ]
    slug_headers = [slugify(str(header), separator="_") for header in raw_headers]

    if target_table.tbody is not None:
        row_count = len(target_table.tbody.find_all("tr"))
    else:
        row_count = 0

    duplicate_names = sorted(
        {name for name in slug_headers if slug_headers.count(name) > 1}
    )

    return {
        "has_table": True,
        "reason": None,
        "raw_headers": raw_headers,
        "slug_headers": slug_headers,
        "duplicate_columns": duplicate_names,
        "row_count": row_count,
        "midpoint_renamed": bool(slug_headers),
        "midpoint_original_name": slug_headers[0] if slug_headers else None,
    }


def audit(
    pages: Mapping[str, str],
    sources: Sequence[str] | None = None,
    calendar_html: str | None = None,
    date_range: tuple[Any, Any] | None = None,
    fetch_errors: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Audit a set of already-downloaded FOMC projection pages.

    Args:
        pages: Mapping of source URL to the raw HTML text that was downloaded
            for it. Entries may be missing; such a source is treated as
            unavailable (for example because its fetch failed).
        sources: Explicit list of source URLs to audit. Mutually exclusive with
            ``calendar_html``; when neither is given the source list is empty.
        calendar_html: Raw HTML of the FOMC calendar page, from which source
            links are extracted the same way as in
            :func:`src.scrape._get_source_urls`.
        date_range: Optional inclusive ``(start, end)`` range; endpoints may be
            datetimes or ISO/``YYYYMMDD`` strings.
        fetch_errors: Optional mapping of URL to a human-readable fetch-failure
            reason (for example the message raised by
            :class:`src.utils.UrlFetchError`).

    Returns:
        A JSON-serializable plain-data dict with per-source findings, the
        merged column set/order that matches :func:`src.scrape.scrape`'s
        ``col_order`` rule, and an ordered list of check results.
    """
    if sources is not None and calendar_html is not None:
        raise ValueError("Pass either sources or calendar_html, not both")
    if sources is not None:
        source_urls = list(sources)
    elif calendar_html is not None:
        # Mirror _get_source_urls: extract links, then sort by parsed date.
        extracted = extract_calendar_urls(calendar_html)

        def _date_sort_key(url: str) -> tuple[int, str]:
            iso_date, error = parse_url_date(url)
            return (1, url) if error or iso_date is None else (0, iso_date)

        source_urls = sorted(extracted, key=_date_sort_key)
    else:
        source_urls = []

    if date_range is not None:
        range_start = _coerce_date(date_range[0])
        range_end = _coerce_date(date_range[1])
    else:
        range_start = range_end = None

    fetch_errors = dict(fetch_errors or {})

    checks: list[dict[str, Any]] = []
    source_results: list[dict[str, Any]] = []
    # Columns contributed by parseable tables, mirroring scrape()'s concat.
    merged_columns: set[str] = set()

    def add_check(name: str, passed: bool, reason: str | None = None) -> None:
        checks.append(_check(name, passed, reason))

    for url in source_urls:
        label = url
        iso_date, url_error = parse_url_date(url)
        in_range: bool | None = None

        add_check(
            f"url_shape:{label}",
            url_error is None,
            url_error,
        )

        if iso_date is not None and range_start is not None and range_end is not None:
            meeting_date = datetime.strptime(iso_date, "%Y-%m-%d")
            in_range = range_start <= meeting_date <= range_end
            add_check(
                f"date_in_range:{label}",
                in_range,
                None
                if in_range
                else (
                    f"meeting date {iso_date} is outside the expected range "
                    f"{range_start.date().isoformat()} to {range_end.date().isoformat()}"
                ),
            )

        source: dict[str, Any] = {
            "url": url,
            "date": iso_date,
            "url_valid": url_error is None,
            "in_date_range": in_range,
            "html_available": url in pages,
            "has_table": False,
            "raw_headers": [],
            "slug_columns": [],
            "duplicate_columns": [],
            "row_count": 0,
            "midpoint_renamed": False,
            "midpoint_original_name": None,
            "table_reason": None,
        }

        if url in fetch_errors:
            reason = f"fetch failed: {fetch_errors[url]}"
            add_check(f"fetch:{label}", False, reason)
        elif url not in pages:
            reason = "no downloaded HTML available for this URL"
            add_check(f"fetch:{label}", False, reason)
        else:
            add_check(f"fetch:{label}", True)
            table = _parse_table(pages[url])
            source["has_table"] = table["has_table"]
            source["table_reason"] = table["reason"]
            if not table["has_table"]:
                add_check(
                    f"projection_table:{label}",
                    False,
                    f"no projection table ({table['reason']})",
                )
            else:
                add_check(f"projection_table:{label}", True)
                source["raw_headers"] = table["raw_headers"]
                source["slug_columns"] = table["slug_headers"]
                source["duplicate_columns"] = table["duplicate_columns"]
                source["row_count"] = table["row_count"]
                source["midpoint_renamed"] = table["midpoint_renamed"]
                source["midpoint_original_name"] = table["midpoint_original_name"]

                if table["duplicate_columns"]:
                    add_check(
                        f"duplicate_columns:{label}",
                        False,
                        "duplicate slugified column names: "
                        + ", ".join(table["duplicate_columns"]),
                    )
                else:
                    add_check(f"duplicate_columns:{label}", True)

                add_check(
                    f"non_empty_table:{label}",
                    table["row_count"] > 0,
                    None
                    if table["row_count"] > 0
                    else "table body contains zero rows",
                )
                add_check(
                    f"midpoint_rename:{label}",
                    table["midpoint_renamed"],
                    None
                    if table["midpoint_renamed"]
                    else "table has no first column to rename to midpoint",
                )
                # Mirror scrape(): the first slugified column is renamed to
                # "midpoint", so its original slug never becomes a DataFrame column.
                contributed = list(table["slug_headers"])
                if contributed:
                    contributed[0] = "midpoint"
                merged_columns.update(contributed)

        source_results.append(source)

    # Mirror scrape(): ["date", "midpoint"] + sorted(everything else).
    other_columns = sorted(merged_columns - {"date", "midpoint"})
    column_order = ["date", "midpoint"] + other_columns
    column_set = sorted(merged_columns | {"date", "midpoint"})

    prefix_ok = column_order[:2] == ["date", "midpoint"]
    add_check(
        "merged_columns_date_midpoint_first",
        prefix_ok,
        None
        if prefix_ok
        else f"merged column order does not start with date, midpoint: {column_order}",
    )

    all_passed = all(item["passed"] for item in checks)

    return {
        "source_count": len(source_urls),
        "sources": source_results,
        "merged_column_set": column_set,
        "column_order": column_order,
        "checks": checks,
        "all_passed": all_passed,
    }
