import pytest

from inkdoor.web.hosts import host_allowed, host_name


@pytest.mark.parametrize(
    "host",
    [
        "192.168.0.50", "192.168.0.50:8000", "[::1]:8000", "[fe80::1]",
        "localhost:8000", "inkdoor", "inkdoor.local", "door.lan", "x.home", "x.home.arpa",
        "x.internal", "x.localdomain", "INKDOOR.LAN.", "door.example.com",
    ],
)
def test_allowed(host):
    assert host_allowed(host, extra=["door.example.com"])


@pytest.mark.parametrize(
    "host",
    [
        None, "", "evil.com", "evil.com:8000", "x.notlocal", "inkdoor.lan.evil.com",
        "192.168.0.50.evil.com", "[::1", "a b",
        # suffixes under public domains: their owners could point a name at the LAN
        "inkdoor.fritz.box", "box.tail1234.ts.net",
    ],
)
def test_rejected(host):
    assert not host_allowed(host, extra=[])


@pytest.mark.parametrize("host", ["inkdoor.fritz.box", "box.tail1234.ts.net:3667"])
def test_public_zone_names_pass_when_listed(host):
    assert host_allowed(host, extra=["inkdoor.fritz.box", "box.tail1234.ts.net"])


@pytest.mark.parametrize(
    "host",
    [
        "evillan.com", "::1", "::1:8000", "door.lan:abc", "door.lan:", "[::1]x", "[::1]:abc",
        "[door.lan]", "-bad.lan", "bad-.lan", "a..lan", ".lan", "door_x.lan", " door.lan",
        "door.lan\t", "exämple.lan", "a" * 64 + ".lan", ("a" * 60 + ".") * 5 + "lan",
        "999.1.1.1.evil.com", "door.lan.:", "door..", ".",
        "door.lan:0", "door.lan:65536", "door.lan:99999", "[::1]:0", "[::1]:70000",
        "\u212aitchen.lan", "door.\u212aitchen", "\u0130nkdoor.lan",
    ],
)
def test_malformed_or_lookalike_rejected(host):
    assert not host_allowed(host, extra=[])


def test_port_range_edges():
    assert host_name("door.lan:1") == "door.lan" and host_name("door.lan:65535") == "door.lan"
    assert host_name("[::1]:65535") == "::1"


def test_non_ascii_never_folds_into_an_allowed_name():
    # "\u212a" (Kelvin sign) lowercases to "k"; the header must be rejected, not folded
    assert host_name("\u212aitchen.lan") is None
    assert not host_allowed("door.example.com", extra=["door.example.co\u212a"])
    assert not host_allowed("\u212aitchen.example", extra=["kitchen.example"])


def test_extra_is_exact_not_suffix():
    assert host_allowed("Door.Example.com.:8000", extra=["door.example.com"])
    assert host_allowed("door.example.com", extra=["DOOR.example.com."])
    assert not host_allowed("evil.door.example.com", extra=["door.example.com"])
    assert not host_allowed("example.com", extra=["door.example.com"])
    assert not host_allowed("door.example.com", extra=[])


@pytest.mark.parametrize(
    ("header", "name"),
    [
        ("Door.LAN.", "door.lan"),
        ("door.lan:8000", "door.lan"),
        ("192.168.0.50:80", "192.168.0.50"),
        ("[::1]", "::1"),
        ("[::1]:8000", "::1"),
        ("[FE80::1]:1", "fe80::1"),
        ("localhost", "localhost"),
        (None, None),
        ("", None),
        ("a b", None),
        ("::1", None),
        ("[::1", None),
        ("door.lan:x", None),
        ("door.lan:80:90", None),
        ("[::1]:", None),
        ("evil_host.com", None),
    ],
)
def test_host_name(header, name):
    assert host_name(header) == name
