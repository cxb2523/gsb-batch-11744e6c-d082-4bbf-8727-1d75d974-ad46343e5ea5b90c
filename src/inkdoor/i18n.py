"""Translations for every user-facing string.

Catalogs live in ``locales/<language>.json``. ``en-US`` is the default and the reference:
every key must exist there, and other catalogs fall back to it for anything missing.

Plurals are dicts with ``one`` and ``other`` keys; pass ``n=`` to pick the form.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from functools import lru_cache

DEFAULT = "en-US"
LOCALES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "locales")
_ALIASES = {"en": "en-US", "en_us": "en-US", "pt": "pt-BR", "pt_br": "pt-BR"}


def available() -> list[str]:
    return sorted(f[:-5] for f in os.listdir(LOCALES_DIR) if f.endswith(".json"))


def normalize(language: str | None) -> str:
    """Accepts 'pt-BR', 'pt_BR', 'pt', 'en'... and returns a catalog name, or the default."""
    if not language:
        return DEFAULT
    key = language.strip().replace("-", "_").lower()
    for name in available():
        if name.replace("-", "_").lower() == key:
            return name
    return _ALIASES.get(key, _ALIASES.get(key.split("_")[0], DEFAULT))


@lru_cache(maxsize=None)
def _catalog(language: str) -> dict:
    with open(os.path.join(LOCALES_DIR, f"{language}.json"), encoding="utf-8") as f:
        return json.load(f)


def _lookup(catalog: dict, key: str):
    node = catalog
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


class Translator:
    def __init__(self, language: str | None = None, clock: str | None = None):
        self.language = normalize(language)
        self._own = _catalog(self.language)
        self._fallback = _catalog(DEFAULT)
        self.clock = clock if clock in ("12h", "24h") else self.get("_meta.clock")

    def get(self, key: str):
        value = _lookup(self._own, key)
        return value if value is not None else _lookup(self._fallback, key)

    def __call__(self, key: str, **kwargs) -> str:
        value = self.get(key)
        if value is None:
            raise KeyError(f"missing translation: {key}")
        if isinstance(value, dict):
            value = value["one"] if kwargs.get("n") == 1 else value["other"]
        return value.format(**kwargs) if kwargs else value

    # ---- formatting helpers

    def time(self, t: dt.datetime | dt.time) -> str:
        if self.clock == "12h":
            hour = t.hour % 12 or 12
            return f"{hour}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"
        return f"{t.hour}:{t.minute:02d}"

    def duration(self, minutes: int) -> str:
        h, m = divmod(max(0, minutes), 60)
        if h and m:
            return self("duration.hours_minutes", h=h, m=m)
        return self("duration.hours", h=h) if h else self("duration.minutes", m=m)

    def weekday(self, d: dt.date) -> str:
        return self.get("weekdays")[d.weekday()]

    def date_short(self, d: dt.date) -> str:
        return self("date_short", day=d.day, month=d.month,
                    month_name=self.get("months_short")[d.month - 1])

    def date_header(self, d: dt.date) -> str:
        return self("date_header", weekday=self.weekday(d), day=d.day,
                    month=self.get("months_short")[d.month - 1])
