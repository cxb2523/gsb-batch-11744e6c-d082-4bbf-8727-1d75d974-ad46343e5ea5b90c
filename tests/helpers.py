"""Shared test data and helpers. Tests import from here, never from conftest."""
import datetime as dt
import os
from zoneinfo import ZoneInfo

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")
TZ = ZoneInfo("America/Sao_Paulo")
FAKE_LAN_ADDRESS = "192.168.0.50"  # fictional; tests never look up this machine's host name


def fixture(name: str) -> str:
    return os.path.join(FIXTURES, name)


def at(hhmm: str, day: int = 14) -> dt.datetime:
    h, m = map(int, hhmm.split(":"))
    return dt.datetime(2026, 10, day, h, m, tzinfo=TZ)
