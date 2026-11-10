import os

import pytest
from helpers import FAKE_LAN_ADDRESS, FIXTURES

from inkdoor.config import with_defaults


def pytest_configure(config):
    config.addinivalue_line("markers", "real_lan_address: keep the real net.lan_address")


@pytest.fixture(autouse=True)
def fake_lan_address(request, monkeypatch):
    """Every test gets a fixed private address unless it is marked ``real_lan_address``."""
    if request.node.get_closest_marker("real_lan_address") is None:
        from inkdoor import net
        monkeypatch.setattr(net, "lan_address", lambda: FAKE_LAN_ADDRESS)


@pytest.fixture
def cfg():
    path = lambda name: os.path.join(FIXTURES, name)
    return with_defaults({
        "display": {"language": "en-US", "timezone": "America/Sao_Paulo"},
        "calendar": [
            {"name": "Work", "style": "solid", "busy": True, "url": path("work.ics")},
            {"name": "Company", "style": "striped", "busy": True, "url": path("company.ics")},
            {"name": "Personal", "style": "outline", "busy": True, "status_label": "Busy",
             "url": path("personal.ics")},
        ],
        "tasks": {"name": "TickTick", "url": path("tasks.ics"), "overdue_days": 7},
    })
