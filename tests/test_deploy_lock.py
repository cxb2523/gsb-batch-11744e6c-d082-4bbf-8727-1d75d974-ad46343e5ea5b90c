"""deploy/requirements.txt pins, with hashes, everything install.sh installs."""
import re
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10
    import tomli as tomllib

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / "deploy" / "requirements.txt"


def _name(requirement: str) -> str:
    return re.split(r"[\s<>=!~;\[]", requirement.strip(), maxsplit=1)[0].lower().replace("_", "-")


def _pinned() -> dict[str, list[str]]:
    """name -> the lines of its entry (the pin and its hashes)."""
    entries: dict[str, list[str]] = {}
    current = None
    for line in LOCK.read_text().splitlines():
        if line and not line.startswith((" ", "#")):
            current = _name(line)
            entries[current] = [line]
        elif current and line.strip().startswith("--hash="):
            entries[current].append(line.strip())
    return entries


def test_every_dependency_is_pinned_with_hashes():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    wanted = {_name(r) for r in project["dependencies"]}
    wanted |= {_name(r) for r in (ROOT / "deploy" / "requirements.in").read_text().splitlines()
               if r.strip() and not r.startswith("#")}
    entries = _pinned()
    assert wanted <= entries.keys(), "run the command at the top of deploy/requirements.txt"
    for name, lines in entries.items():
        assert "==" in lines[0], name
        assert any(line.startswith("--hash=sha256:") for line in lines[1:]), name
