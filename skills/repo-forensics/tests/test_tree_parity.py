"""Both-tree parity guard.

The repo ships the scanner twice: the canonical `skills/repo-forensics/` tree and
the generated Codex mirror `plugins/repo-forensics/skills/repo-forensics/`. Several
source files MUST stay byte-identical across the two; a one-tree edit that forgets
the mirror ships a fix to only one surface (a real hazard flagged in the Shai-Hulud
hardening review — nothing enforced this before).

This test hashes every shared source file under both trees and asserts equality.
Added 2026-08-06 with the Shai-Hulud family hardening.
"""

import hashlib
import pathlib
import pytest

# tests/ -> skills/repo-forensics -> skills -> <repo root>
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_CANONICAL = _REPO_ROOT / "skills" / "repo-forensics"
_MIRROR = _REPO_ROOT / "plugins" / "repo-forensics" / "skills" / "repo-forensics"

# Directories whose files are expected to exist identically in both trees. Tests
# live only in the canonical tree (the mirror is the release subset), so they are
# intentionally excluded.
_SHARED_SUBDIRS = ("scripts", "data")


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _shared_files():
    if not _MIRROR.is_dir():
        return []
    out = []
    for sub in _SHARED_SUBDIRS:
        base = _CANONICAL / sub
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if not p.is_file():
                continue
            # Skip caches and any hidden dir/file (.pytest_cache, .ruff_cache,
            # __pycache__) — those are generated, not shipped source.
            parts = p.relative_to(_CANONICAL).parts
            if any(seg.startswith(".") or seg == "__pycache__" for seg in parts):
                continue
            if p.suffix in (".pyc", ".pyo"):
                continue
            out.append(p.relative_to(_CANONICAL))
    return out


@pytest.mark.skipif(not _MIRROR.is_dir(), reason="mirror tree not present")
@pytest.mark.parametrize("rel", _shared_files(), ids=lambda r: str(r))
def test_source_file_identical_across_trees(rel):
    canon = _CANONICAL / rel
    mirror = _MIRROR / rel
    assert mirror.is_file(), f"mirror missing {rel} (canonical edit not mirrored)"
    assert _sha256(canon) == _sha256(mirror), (
        f"{rel} differs between canonical and mirror tree — a one-tree edit shipped "
        f"to only one surface. Re-mirror before shipping."
    )
