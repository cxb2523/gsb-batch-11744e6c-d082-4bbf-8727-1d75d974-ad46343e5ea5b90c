"""Tests for the checksums.json signature check in verify_install."""

import shutil

from scripts.verify_install import verify_manifest_signature

import os

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _stage(tmp_path):
    """Copy the scripts plus manifest/signature pair into a temp skill root."""
    shutil.copytree(os.path.join(SKILL_ROOT, "scripts"), tmp_path / "scripts")
    for name in ("checksums.json", "checksums.json.sig"):
        shutil.copy(os.path.join(SKILL_ROOT, name), tmp_path / name)
    return tmp_path


def test_shipped_manifest_signature_verifies():
    """The manifest committed to this repo must be signed by the release key."""
    passed, message = verify_manifest_signature(SKILL_ROOT)
    assert passed, message


def test_regenerated_but_unsigned_manifest_fails(tmp_path):
    """A manifest whose bytes changed without re-signing must not verify."""
    root = _stage(tmp_path)
    manifest = root / "checksums.json"
    manifest.write_text(manifest.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    passed, message = verify_manifest_signature(str(root))
    assert not passed
    assert "signature does not verify" in message


def test_missing_signature_fails(tmp_path):
    """An absent signature file is a failure, never a pass."""
    root = _stage(tmp_path)
    (root / "checksums.json.sig").unlink()
    passed, message = verify_manifest_signature(str(root))
    assert not passed
    assert "missing" in message
