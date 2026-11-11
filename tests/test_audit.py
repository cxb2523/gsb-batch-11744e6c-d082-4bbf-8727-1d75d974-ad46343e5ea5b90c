"""Tests for the offline scrape audit (src.audit) and src.utils.get_url.

All HTML is hand-built locally; no test makes a network request or reads real
credentials.
"""
from __future__ import annotations

import json

import pandas as pd
import pytest

from src import audit, scrape, utils


CALENDAR_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
URL_2021 = (
    "https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20210317.htm"
)
URL_2022 = (
    "https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20220615.htm"
)
URL_BAD_MARKER = (
    "https://www.federalreserve.gov/monetarypolicy/sometable20210317.htm"
)
URL_BAD_DATE = (
    "https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20219999.htm"
)


def build_page(headers, rows, heading="Assessments of Appropriate Monetary Policy"):
    """Build a minimal FOMC projection page with one target table."""
    head_cells = "".join(f"<th>{h}</th>" for h in headers)
    body_rows = []
    for row in rows:
        cells = "".join(
            f"<th>{cell}</th>"
            if i == 0
            else f"<td>{cell}</td>"
            for i, cell in enumerate(row)
        )
        body_rows.append(f"<tr>{cells}</tr>")
    return f"""
    <html><body>
        <h3>Summary of Economic Projections</h3>
        <h4>{heading}</h4>
        <table class="projection">
            <thead><tr>{head_cells}</tr></thead>
            <tbody>{''.join(body_rows)}</tbody>
        </table>
    </body></html>
    """


CALENDAR_HTML = """
<html><body>
  <a href="/other/page.htm">Not a projection</a>
  <a href="/monetarypolicy/fomcprojtabl20220615.htm">June 2022</a>
  <a href="/monetarypolicy/fomcprojtabl20210317.htm">March 2021</a>
  <a href="/monetarypolicy/fomcprojtabl20210317.pdf">PDF version</a>
</body></html>
"""


@pytest.fixture()
def two_source_pages():
    pages = {
        URL_2021: build_page(
            ["Midpoint", "2021", "2022", "Longer Run"],
            [["3.000", "1", "", "2"], ["2.875", "", "1", ""]],
        ),
        URL_2022: build_page(
            ["Midpoint", "2022", "2023", "2024", "Longer Run"],
            [["3.125", "2", "1", "3", "4"]],
        ),
    }
    # The calendar URL must resolve too when scrape() is monkeypatched.
    pages[CALENDAR_URL] = CALENDAR_HTML
    return pages


def _check_by_name(result, name):
    matches = [c for c in result["checks"] if c["name"] == name]
    assert len(matches) == 1
    return matches[0]


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #


def test_audit_matches_scrape_on_same_html(two_source_pages, monkeypatch):
    """Audit column order/set and per-source metadata equal scrape()'s output."""
    pages = two_source_pages
    sources = [URL_2021, URL_2022]

    def fake_get_url(url):
        return pages[url]

    monkeypatch.setattr(utils, "get_url", fake_get_url)
    monkeypatch.setattr(scrape.utils, "get_url", fake_get_url)

    scraped = scrape.scrape()

    result = audit.audit(pages, sources=sources)

    assert result["all_passed"] is True
    assert result["source_count"] == 2

    # Column order must match scrape()'s col_order rule exactly.
    assert result["column_order"] == list(scraped.columns)
    assert result["column_order"][:2] == ["date", "midpoint"]
    assert result["merged_column_set"] == sorted(set(scraped.columns))

    # scrape()'s own rule expressed independently.
    expected_order = ["date", "midpoint"] + sorted(
        c for c in scraped.columns if c not in ("date", "midpoint")
    )
    assert result["column_order"] == expected_order

    by_url = {s["url"]: s for s in result["sources"]}

    source_2021 = by_url[URL_2021]
    assert source_2021["date"] == "2021-03-17"
    assert source_2021["url_valid"] is True
    assert source_2021["in_date_range"] is None
    assert source_2021["has_table"] is True
    assert source_2021["raw_headers"] == [
        "Midpoint",
        "2021",
        "2022",
        "Longer Run",
    ]
    assert source_2021["slug_columns"] == [
        "midpoint",
        "2021",
        "2022",
        "longer_run",
    ]
    assert source_2021["row_count"] == 2
    assert source_2021["midpoint_renamed"] is True
    assert source_2021["midpoint_original_name"] == "midpoint"
    assert source_2021["duplicate_columns"] == []

    source_2022 = by_url[URL_2022]
    assert source_2022["date"] == "2022-06-15"
    assert source_2022["slug_columns"] == [
        "midpoint",
        "2022",
        "2023",
        "2024",
        "longer_run",
    ]
    assert source_2022["row_count"] == 1

    # Per-source rows match what scrape() concatenated.
    df_2021 = scraped[scraped["date"] == pd.Timestamp("2021-03-17")]
    df_2022 = scraped[scraped["date"] == pd.Timestamp("2022-06-15")]
    assert len(df_2021) == source_2021["row_count"]
    assert len(df_2022) == source_2022["row_count"]
    assert list(df_2021["midpoint"]) == ["3.000", "2.875"]
    assert list(df_2022["midpoint"]) == ["3.125"]

    # Every check passes and has no failure reason.
    assert result["checks"]
    for check in result["checks"]:
        assert check["passed"] is True
        assert check["reason"] is None

    # The CSV contract: date, midpoint lead and the frame round-trips to CSV.
    csv_text = scraped.to_csv(index=False)
    assert csv_text.splitlines()[0].split(",")[:2] == ["date", "midpoint"]


def test_audit_with_date_range(two_source_pages):
    """in_date_range is computed per source against the inclusive range."""
    pages = two_source_pages
    result = audit.audit(
        pages,
        sources=[URL_2021, URL_2022],
        date_range=("2021-01-01", "2021-12-31"),
    )
    by_url = {s["url"]: s for s in result["sources"]}
    assert by_url[URL_2021]["in_date_range"] is True
    assert by_url[URL_2022]["in_date_range"] is False
    range_check = _check_by_name(result, f"date_in_range:{URL_2022}")
    assert range_check["passed"] is False
    assert "outside the expected range" in range_check["reason"]
    assert result["all_passed"] is False


def test_audit_from_calendar_html(two_source_pages):
    """calendar_html is parsed with the same link rule as _get_source_urls."""
    pages = two_source_pages
    result = audit.audit(pages, calendar_html=CALENDAR_HTML)
    urls = {s["url"] for s in result["sources"]}
    assert urls == {URL_2021, URL_2022}
    # Sorted by parsed date, like _get_source_urls.
    assert [s["url"] for s in result["sources"]] == [URL_2021, URL_2022]
    assert result["all_passed"] is True


def test_sources_and_calendar_are_mutually_exclusive(two_source_pages):
    with pytest.raises(ValueError):
        audit.audit(two_source_pages, sources=[URL_2021], calendar_html=CALENDAR_HTML)


# --------------------------------------------------------------------------- #
# Negative paths
# --------------------------------------------------------------------------- #


def test_missing_heading_is_marked_not_raised(two_source_pages):
    """A page without the target heading is reported as having no table."""
    pages = dict(two_source_pages)
    pages[URL_2022] = build_page(
        ["Midpoint", "2022"], [["1", "2"]], heading="Some Other Heading"
    )
    result = audit.audit(pages, sources=[URL_2021, URL_2022])

    source = next(s for s in result["sources"] if s["url"] == URL_2022)
    assert source["has_table"] is False
    assert source["row_count"] == 0
    check = _check_by_name(result, f"projection_table:{URL_2022}")
    assert check["passed"] is False
    assert "no projection table" in check["reason"]
    assert result["all_passed"] is False


def test_heading_without_table_is_marked_not_raised():
    html = "<html><h4>Assessments of Appropriate Monetary Policy</h4><p>nothing</p></html>"
    result = audit.audit({URL_2021: html}, sources=[URL_2021])
    check = _check_by_name(result, f"projection_table:{URL_2021}")
    assert check["passed"] is False
    assert "no projection table" in check["reason"]
    assert result["all_passed"] is False


def test_url_missing_marker_fails_with_reason(two_source_pages):
    result = audit.audit(
        two_source_pages, sources=[URL_2021, URL_BAD_MARKER]
    )
    bad = next(s for s in result["sources"] if s["url"] == URL_BAD_MARKER)
    assert bad["url_valid"] is False
    assert bad["date"] is None
    check = _check_by_name(result, f"url_shape:{URL_BAD_MARKER}")
    assert check["passed"] is False
    assert "fomcprojtabl" in check["reason"]
    assert result["all_passed"] is False


def test_url_with_illegal_date_fails_with_reason(two_source_pages):
    result = audit.audit(
        two_source_pages, sources=[URL_2021, URL_BAD_DATE]
    )
    bad = next(s for s in result["sources"] if s["url"] == URL_BAD_DATE)
    assert bad["url_valid"] is False
    assert bad["date"] is None
    check = _check_by_name(result, f"url_shape:{URL_BAD_DATE}")
    assert check["passed"] is False
    assert "eight digits" in check["reason"] or "not a valid date" in check["reason"]
    assert result["all_passed"] is False


def test_missing_page_is_fetch_failure(two_source_pages):
    """A source absent from the pages map fails the fetch check, no exception."""
    pages = {URL_2021: two_source_pages[URL_2021]}
    result = audit.audit(pages, sources=[URL_2021, URL_2022])
    missing = next(s for s in result["sources"] if s["url"] == URL_2022)
    assert missing["html_available"] is False
    check = _check_by_name(result, f"fetch:{URL_2022}")
    assert check["passed"] is False
    assert "no downloaded HTML" in check["reason"]
    # No table-related checks are emitted for the unavailable source.
    assert not any(
        c["name"] == f"projection_table:{URL_2022}" for c in result["checks"]
    )
    assert result["all_passed"] is False


def test_recorded_fetch_error_is_reported():
    """fetch_errors (e.g. from UrlFetchError) surface as a failed check."""
    message = "Failed to fetch x: HTTP 503 Service Unavailable"
    result = audit.audit(
        {},
        sources=[URL_2021],
        fetch_errors={URL_2021: message},
    )
    check = _check_by_name(result, f"fetch:{URL_2021}")
    assert check["passed"] is False
    assert "fetch failed" in check["reason"]
    assert "503" in check["reason"]


# --------------------------------------------------------------------------- #
# Boundary paths
# --------------------------------------------------------------------------- #


def test_empty_source_list():
    result = audit.audit({}, sources=[])
    assert result["source_count"] == 0
    assert result["sources"] == []
    assert result["merged_column_set"] == ["date", "midpoint"]
    assert result["column_order"] == ["date", "midpoint"]
    prefix = _check_by_name(result, "merged_columns_date_midpoint_first")
    # The rule itself still holds for the empty case.
    assert prefix["passed"] is True
    # No per-source checks, but the global check remains.
    assert [c["name"] for c in result["checks"]] == [
        "merged_columns_date_midpoint_first"
    ]
    # Round-trips through JSON.
    assert json.loads(json.dumps(result)) == result


def test_empty_table_body_is_flagged(two_source_pages):
    pages = dict(two_source_pages)
    pages[URL_2022] = build_page(
        ["Midpoint", "2022", "2023"], []
    )
    result = audit.audit(pages, sources=[URL_2022])
    source = result["sources"][0]
    assert source["has_table"] is True
    assert source["row_count"] == 0
    assert source["slug_columns"] == ["midpoint", "2022", "2023"]
    empty_check = _check_by_name(result, f"non_empty_table:{URL_2022}")
    assert empty_check["passed"] is False
    assert "zero rows" in empty_check["reason"]
    assert result["all_passed"] is False


def test_duplicate_slugified_headers_are_conflicts():
    html = build_page(
        ["Midpoint", "2022", "2022"],  # duplicate raw header
        [["1", "2", "3"]],
    )
    result = audit.audit({URL_2021: html}, sources=[URL_2021])
    source = result["sources"][0]
    assert source["duplicate_columns"] == ["2022"]
    dup_check = _check_by_name(result, f"duplicate_columns:{URL_2021}")
    assert dup_check["passed"] is False
    assert "2022" in dup_check["reason"]
    assert result["all_passed"] is False


def test_duplicate_headers_after_slugification_only():
    """Distinct raw headers that collide once slugified are also conflicts."""
    html = build_page(
        ["Midpoint", "Longer Run", "longer-run"],
        [["1", "2", "3"]],
    )
    result = audit.audit({URL_2021: html}, sources=[URL_2021])
    assert result["sources"][0]["duplicate_columns"] == ["longer_run"]
    assert result["all_passed"] is False


# --------------------------------------------------------------------------- #
# Purity / serialization / no network
# --------------------------------------------------------------------------- #


def test_result_is_json_serializable(two_source_pages):
    result = audit.audit(
        two_source_pages,
        sources=[URL_2021, URL_2022],
        date_range=("2020-01-01", "2023-01-01"),
    )
    encoded = json.dumps(result)
    decoded = json.loads(encoded)
    assert decoded == result

    # No non-native types leaked out.
    def native(value):
        if isinstance(value, dict):
            return all(native(k) and native(v) for k, v in value.items())
        if isinstance(value, (list, tuple)):
            return all(native(v) for v in value)
        return isinstance(value, (str, int, float, bool)) or value is None

    assert native(result)


def test_inputs_are_not_mutated(two_source_pages):
    pages = two_source_pages
    pages_before = {url: html for url, html in pages.items()}
    sources = [URL_2021, URL_2022]
    sources_before = list(sources)
    audit.audit(pages, sources=sources)
    assert pages == pages_before
    assert sources == sources_before


def test_audit_module_does_not_import_requests():
    """The audit module must stay offline: no requests import of any kind."""
    import ast
    import inspect

    tree = ast.parse(inspect.getsource(audit))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
    assert "requests" not in imported
    assert not any(name.startswith("requests.") for name in imported)


# --------------------------------------------------------------------------- #
# utils.get_url error semantics
# --------------------------------------------------------------------------- #


class _FakeResponse:
    def __init__(self, status_code, reason="", text="body", ok=None):
        self.status_code = status_code
        self.reason = reason
        self.text = text
        self.ok = ok if ok is not None else 200 <= status_code < 300


def test_get_url_raises_readable_error_on_non_2xx(monkeypatch):

    def fake_get(url):
        return _FakeResponse(503, reason="Service Unavailable")

    monkeypatch.setattr(utils.requests, "get", fake_get)
    with pytest.raises(utils.UrlFetchError) as excinfo:
        utils.get_url("https://example.com/fomcprojtabl20210317.htm")
    message = str(excinfo.value)
    assert "503" in message
    assert "https://example.com/fomcprojtabl20210317.htm" in message
    assert isinstance(excinfo.value, RuntimeError)


def test_get_url_returns_text_on_success(monkeypatch):
    monkeypatch.setattr(
        utils.requests, "get", lambda url: _FakeResponse(200, text="<html/>")
    )
    assert utils.get_url("https://example.com") == "<html/>"


def test_get_url_error_message_flows_into_audit(monkeypatch):
    """End-to-end: a get_url failure recorded by the caller fails an audit."""
    def fake_get(url):
        return _FakeResponse(404, reason="Not Found")

    monkeypatch.setattr(utils.requests, "get", fake_get)
    try:
        utils.get_url(URL_2021)
    except utils.UrlFetchError as exc:
        message = str(exc)
    else:  # pragma: no cover - defensive
        pytest.fail("get_url did not raise")

    result = audit.audit(
        {}, sources=[URL_2021], fetch_errors={URL_2021: message}
    )
    check = _check_by_name(result, f"fetch:{URL_2021}")
    assert check["passed"] is False
    assert "404" in check["reason"]
