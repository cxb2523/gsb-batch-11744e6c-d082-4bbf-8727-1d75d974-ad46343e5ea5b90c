"""Utility functions."""
from __future__ import annotations

import re
from datetime import datetime

import pandas as pd
import requests


class UrlFetchError(RuntimeError):
    """Raised when a URL cannot be fetched with a successful (2xx) response."""


def parse_date(url) -> datetime:
    """Parse the date from a source URL."""
    s = re.split(r"fomcprojtabl", url)[1]
    s = s.replace(".htm", "")
    return pd.to_datetime(s[-8:])


def get_url(url) -> str:
    """Get the provided URL.

    Args:
        url (str): The URL to fetch.

    Returns:
        str: The response body text.

    Raises:
        UrlFetchError: If the server responds with a non-2xx status code.
    """
    r = requests.get(url)
    if not r.ok:
        raise UrlFetchError(
            f"Failed to fetch {url}: HTTP {r.status_code} {r.reason}".rstrip()
        )
    return r.text


def safestr(ele) -> str | None:
    """Return a stripped string or None."""
    return ele.strip() or None
