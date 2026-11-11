"""Tests for SKILL.md YAML frontmatter validation in validate_manifests."""

import json

import validate_manifests as module
from validate_manifests import main, validate_manifests


def valid_root(tmp_path):
    path = tmp_path / ".claude-plugin" / "plugin.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "name": "repo-forensics", "version": "1.0.0", "author": {"name": "Example"},
    }), encoding="utf-8")


def write_skill(root, relative, frontmatter, body="# Skill\n"):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("---\n{}\n---\n\n{}".format(frontmatter, body), encoding="utf-8")


def errors_for(tmp_path):
    _, violations = validate_manifests(tmp_path)
    return ["{}: {}".format(item["field"], item["message"]) for item in violations]


def test_rejects_bare_brackets_argument_hint(tmp_path):
    valid_root(tmp_path)
    write_skill(tmp_path, "SKILL.md",
                "name: demo\ndescription: demo\nargument-hint: [a] [b]")
    errors = errors_for(tmp_path)
    assert any("argument-hint" in error for error in errors)
    assert any("unquoted '['" in error for error in errors)


def test_accepts_quoted_argument_hint(tmp_path):
    valid_root(tmp_path)
    write_skill(tmp_path, "SKILL.md",
                'name: demo\ndescription: demo\nargument-hint: "[a] [b]"')
    assert errors_for(tmp_path) == []


def test_rejects_single_flow_list_argument_hint(tmp_path):
    valid_root(tmp_path)
    write_skill(tmp_path, "SKILL.md",
                "name: demo\ndescription: demo\nargument-hint: [single]")
    errors = errors_for(tmp_path)
    assert any("argument-hint" in error for error in errors)


def test_ignores_markdown_without_frontmatter(tmp_path):
    valid_root(tmp_path)
    path = tmp_path / "SKILL.md"
    path.write_text("# No frontmatter here\n\nJust a body.\n", encoding="utf-8")
    assert errors_for(tmp_path) == []


def test_accepts_plain_scalar_starting_with_angle_bracket(tmp_path):
    valid_root(tmp_path)
    write_skill(tmp_path, "SKILL.md",
                "name: demo\ndescription: demo\nargument-hint: <repo_path> [--flag]")
    assert errors_for(tmp_path) == []


def test_indented_rule_in_block_scalar_does_not_hide_later_keys(tmp_path):
    """An indented ``---`` inside a block scalar must not end the frontmatter.

    Keys after the block scalar stay in scope and are still validated.
    """
    valid_root(tmp_path)
    write_skill(tmp_path, "SKILL.md",
                "name: demo\ndescription: |\n  intro\n  ---\n  outro\n"
                "argument-hint: [a] [b]")
    errors = errors_for(tmp_path)
    assert any("argument-hint" in error for error in errors)


def test_bom_before_fence_is_still_parsed(tmp_path):
    valid_root(tmp_path)
    path = tmp_path / "SKILL.md"
    path.write_text(
        "﻿---\nname: demo\ndescription: demo\nargument-hint: [a] [b]\n---\n",
        encoding="utf-8")
    assert any("argument-hint" in error for error in errors_for(tmp_path))


def test_crlf_frontmatter_is_parsed(tmp_path):
    valid_root(tmp_path)
    path = tmp_path / "SKILL.md"
    path.write_bytes(
        b"---\r\nname: demo\r\ndescription: demo\r\nargument-hint: [a] [b]\r\n---\r\n")
    assert any("argument-hint" in error for error in errors_for(tmp_path))


def test_unclosed_frontmatter_is_ignored_not_crashed(tmp_path):
    valid_root(tmp_path)
    path = tmp_path / "SKILL.md"
    path.write_text("---\nname: demo\nargument-hint: [a] [b]\n", encoding="utf-8")
    # No closing fence: not frontmatter, so no violation — but must not raise.
    assert errors_for(tmp_path) == []


def test_non_utf8_skill_md_reports_violation_not_crash(tmp_path):
    valid_root(tmp_path)
    path = tmp_path / "SKILL.md"
    path.write_bytes(b"---\nname: demo\ndescription: \xff\xfe bad\n---\n")
    errors = errors_for(tmp_path)
    assert any("could not read" in error for error in errors)


def test_deeply_nested_flow_collection_reports_violation_not_crash(tmp_path):
    """Deep nesting raises RecursionError rather than YAMLError.

    ``metadata`` is used because it is not a scalar key, so the structural
    check does not apply and the YAML parse path is what is exercised.
    """
    valid_root(tmp_path)
    depth = 2000
    write_skill(tmp_path, "SKILL.md",
                "name: demo\ndescription: demo\nmetadata: "
                + "[" * depth + "]" * depth)
    errors = errors_for(tmp_path)
    assert any("frontmatter" in error for error in errors)


def test_non_string_scalar_caught_by_yaml_type_check(tmp_path):
    """A bare date parses as datetime.date, not str.

    This value is invisible to the structural check (it does not start with
    ``[`` or ``{``), so it exercises the PyYAML type-check path specifically.
    Skipped when PyYAML is unavailable, since that path cannot run.
    """
    import pytest

    import validate_manifests as module
    if module._yaml is None:
        pytest.skip("PyYAML not installed; type-check path unavailable")
    valid_root(tmp_path)
    write_skill(tmp_path, "SKILL.md",
                "name: demo\ndescription: demo\nargument-hint: 2026-07-25")
    errors = errors_for(tmp_path)
    assert any("must be a string" in error for error in errors)


def test_fixture_and_vendor_dirs_are_excluded(tmp_path):
    """A broken skill under tests/fixtures or node_modules must not fail the gate."""
    valid_root(tmp_path)
    broken = "name: demo\ndescription: demo\nargument-hint: [a] [b]"
    write_skill(tmp_path, "tests/fixtures/evil/SKILL.md", broken)
    write_skill(tmp_path, "tests/corpus/evil/SKILL.md", broken)
    write_skill(tmp_path, "node_modules/pkg/SKILL.md", broken)
    assert errors_for(tmp_path) == []


def test_real_skill_outside_excluded_dirs_is_still_checked(tmp_path):
    """Guard against the exclusion logic swallowing genuine skills."""
    valid_root(tmp_path)
    write_skill(tmp_path, "skills/real/SKILL.md",
                "name: demo\ndescription: demo\nargument-hint: [a] [b]")
    assert any("argument-hint" in error for error in errors_for(tmp_path))


def test_build_output_dirs_are_not_excluded(tmp_path):
    """``dist``/``build`` must stay in scope - pipelines emit real skills there."""
    valid_root(tmp_path)
    write_skill(tmp_path, "dist/real/SKILL.md",
                "name: demo\ndescription: demo\nargument-hint: [a] [b]")
    assert any("argument-hint" in error for error in errors_for(tmp_path))


def test_require_yaml_fails_closed_without_pyyaml(tmp_path, monkeypatch, capsys):
    """CI must fail loudly rather than silently run the weaker check."""
    valid_root(tmp_path)
    monkeypatch.setattr(module, "_yaml", None)
    code = main(["--root", str(tmp_path), "--require-yaml"])
    assert code == 2
    assert "PyYAML is required" in capsys.readouterr().err


def test_missing_pyyaml_warns_when_not_required(tmp_path, monkeypatch, capsys):
    """A degraded run is allowed, but never silent."""
    valid_root(tmp_path)
    monkeypatch.setattr(module, "_yaml", None)
    code = main(["--root", str(tmp_path)])
    assert code == 0
    assert "PyYAML not installed" in capsys.readouterr().err
