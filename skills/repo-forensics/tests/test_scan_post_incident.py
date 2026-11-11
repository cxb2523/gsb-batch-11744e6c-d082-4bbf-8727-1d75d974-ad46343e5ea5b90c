"""Tests for scan_post_incident.py - Post-Incident Artifact Scanner."""

import scan_post_incident as scanner


class TestNodeModulesArtifacts:
    def test_detects_malicious_package_dir(self, tmp_path):
        """plain-crypto-js directory in node_modules should be flagged."""
        nm = tmp_path / "node_modules" / "plain-crypto-js"
        nm.mkdir(parents=True)
        (nm / "package.json").write_text('{"name":"plain-crypto-js","version":"4.2.0"}')
        findings = scanner.scan_node_modules(str(tmp_path))
        assert any(f.severity == "critical" and "plain-crypto-js" in f.title for f in findings)

    def test_clean_node_modules_no_findings(self, tmp_path):
        """Normal node_modules should produce no findings."""
        nm = tmp_path / "node_modules" / "express"
        nm.mkdir(parents=True)
        (nm / "package.json").write_text('{"name":"express","version":"4.18.0"}')
        findings = scanner.scan_node_modules(str(tmp_path))
        assert len(findings) == 0

    def test_detects_sandworm_package_dir(self, tmp_path):
        """SANDWORM campaign package directory should be flagged."""
        nm = tmp_path / "node_modules" / "claud-code"
        nm.mkdir(parents=True)
        findings = scanner.scan_node_modules(str(tmp_path))
        assert any("claud-code" in f.title for f in findings)


class TestNpmCacheArtifacts:
    def test_detects_malicious_package_in_cache_pre_key_substring(self, tmp_path, monkeypatch):
        """npm cache index entry with package name before the 'key' token is flagged.

        This test exercises the second OR branch exclusively:
            f"/{pkg_name}" in content.split('"key"')[0]
        The content intentionally omits the '/-/' tarball URL pattern so the
        first branch cannot fire. With the buggy '[0:1]' slice the branch
        returns a list and 'in' checks element equality (always False). With
        the correct '[0]' it returns a string and substring matching works.
        """
        fake_cache = tmp_path / ".npm" / "_cacache"
        index_dir = fake_cache / "index-v5" / "ab"
        index_dir.mkdir(parents=True)
        # content-v2 dir must exist for scan_npm_cache to proceed
        (fake_cache / "content-v2").mkdir(parents=True)

        # Package name appears BEFORE '"key"' and NO '/-/' tarball pattern present.
        # content.split('"key"')[0] == '\t{"path":"/plain-crypto-js","'
        # which contains '/plain-crypto-js', triggering the finding.
        cache_entry = index_dir / "abc123"
        cache_entry.write_text(
            '\t{"path":"/plain-crypto-js","key":"some-cache-key","integrity":"sha512-abc"}'
        )

        monkeypatch.setattr(
            scanner.os.path, "expanduser",
            lambda p: str(tmp_path) if p == "~" else p.replace("~", str(tmp_path))
        )

        findings = scanner.scan_npm_cache()
        assert any(
            "plain-crypto-js" in f.title and f.severity == "critical"
            for f in findings
        ), f"Expected critical finding for plain-crypto-js in npm cache, got: {findings}"

    def test_clean_npm_cache_no_findings(self, tmp_path, monkeypatch):
        """npm cache index with only legitimate packages produces no findings."""
        fake_cache = tmp_path / ".npm" / "_cacache"
        index_dir = fake_cache / "index-v5" / "cd"
        index_dir.mkdir(parents=True)
        (fake_cache / "content-v2").mkdir(parents=True)

        cache_entry = index_dir / "def456"
        cache_entry.write_text(
            '\t{"path":"/lodash","key":"some-cache-key","integrity":"sha512-xyz"}'
        )

        monkeypatch.setattr(
            scanner.os.path, "expanduser",
            lambda p: str(tmp_path) if p == "~" else p.replace("~", str(tmp_path))
        )

        findings = scanner.scan_npm_cache()
        assert len(findings) == 0, f"Expected no findings for clean cache, got: {findings}"


class TestHostArtifacts:
    def test_no_rat_binary(self):
        """On a clean machine, no RAT binaries should be found."""
        findings = scanner.scan_host_artifacts()
        rat_findings = [f for f in findings if "RAT Binary" in f.title]
        # May or may not find persistence items, but should not find RAT binary
        assert not any("act.mond" in f.snippet for f in rat_findings)


class TestSecondComingArtifacts:
    """scan_second_coming_artifacts() — filename-only detection of the
    "Shai-Hulud: The Second Coming" fake-Bun dropper and exfil staging files.

    Fixtures are empty placeholder files: the detector keys on filename alone,
    so no payload content is needed (or wanted).
    """

    def test_detects_bun_environment_js(self, tmp_path):
        """bun_environment.js anywhere in the tree is a critical post-incident hit."""
        pkg = tmp_path / "node_modules" / "some-pkg"
        pkg.mkdir(parents=True)
        (pkg / "bun_environment.js").write_text("// placeholder\n")
        findings = scanner.scan_second_coming_artifacts(str(tmp_path))
        assert len(findings) == 1
        assert findings[0].severity == "critical"
        assert findings[0].category == "post-incident"
        assert "bun_environment.js" in findings[0].title
        assert findings[0].file == "node_modules/some-pkg/bun_environment.js"

    def test_detects_setup_bun_js_at_repo_root(self, tmp_path):
        (tmp_path / "setup_bun.js").write_text("// placeholder\n")
        findings = scanner.scan_second_coming_artifacts(str(tmp_path))
        assert any(
            f.severity == "critical" and "setup_bun.js" in f.title
            for f in findings
        ), f"Expected setup_bun.js finding, got: {[f.title for f in findings]}"

    def test_detects_environment_source_js_golden_path_rename(self, tmp_path):
        """environment_source.js is the December 2025 'Golden Path' rename."""
        (tmp_path / "environment_source.js").write_text("// placeholder\n")
        findings = scanner.scan_second_coming_artifacts(str(tmp_path))
        assert any("environment_source.js" in f.title for f in findings)

    def test_detects_actions_secrets_json(self, tmp_path):
        """actionsSecrets.json is the double-Base64 exfil staging file."""
        (tmp_path / "actionsSecrets.json").write_text("{}\n")
        findings = scanner.scan_second_coming_artifacts(str(tmp_path))
        assert any(
            f.category == "post-incident" and "actionsSecrets.json" in f.title
            for f in findings
        )

    def test_detects_bun_installer_js(self, tmp_path):
        (tmp_path / "bun_installer.js").write_text("// placeholder\n")
        findings = scanner.scan_second_coming_artifacts(str(tmp_path))
        assert any("bun_installer.js" in f.title for f in findings)

    def test_clean_tree_no_findings(self, tmp_path):
        """Ordinary project files must not trip the filename matchers."""
        (tmp_path / "index.js").write_text("module.exports = {};\n")
        (tmp_path / "package.json").write_text('{"name":"clean"}')
        env = tmp_path / "environment.js"  # near-miss name, must not match
        env.write_text("export default {};\n")
        findings = scanner.scan_second_coming_artifacts(str(tmp_path))
        assert len(findings) == 0, f"Unexpected findings: {[f.title for f in findings]}"

    def test_multiple_artifacts_each_reported(self, tmp_path):
        (tmp_path / "setup_bun.js").write_text("")
        (tmp_path / "bun_environment.js").write_text("")
        findings = scanner.scan_second_coming_artifacts(str(tmp_path))
        assert len(findings) == 2
        assert all(f.severity == "critical" for f in findings)


class TestGoldenPathArtifacts:
    """New SECOND_COMING_ARTIFACTS entries for the December 2025 "Golden Path"
    rename, consumed by the existing scan_second_coming_artifacts().

    Source: Cobenian/shai-hulud-detect CHANGELOG 3.1.0 -- "Detection for
    obfuscated exfiltration JSON files: `3nvir0nm3nt.json`, `cl0vd.json`,
    `c9nt3nts.json`, `pigS3cr3ts.json`".
    """

    def test_detects_each_obfuscated_exfil_json(self, tmp_path):
        for name in ("3nvir0nm3nt.json", "cl0vd.json", "c9nt3nts.json", "pigS3cr3ts.json"):
            d = tmp_path / name.replace(".", "_")
            d.mkdir()
            (d / name).write_text("{}\n")
            findings = scanner.scan_second_coming_artifacts(str(d))
            assert len(findings) == 1, f"{name}: got {[f.title for f in findings]}"
            assert findings[0].severity == "critical"
            assert findings[0].category == "post-incident"
            assert name in findings[0].title

    def test_real_word_neighbours_not_flagged(self, tmp_path):
        """Precision: the leetspeak names must not catch ordinary config files."""
        for name in ("environment.json", "cloud.json", "contents.json", "secrets.json"):
            (tmp_path / name).write_text("{}\n")
        findings = scanner.scan_second_coming_artifacts(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"


class TestShaiHuludFamilyArtifacts:
    """scan_shai_hulud_family_artifacts() -- on-disk artifacts from the family
    waves outside the Second Coming: the v1 workflow file, Mini Shai-Hulud
    payloads, dead-man's-switch units, injected formatter workflows, and staged
    TruffleHog binaries.
    """

    def test_detects_v1_workflow_file(self, tmp_path):
        wf = tmp_path / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / "shai-hulud-workflow.yml").write_text("on: push\n")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert any(
            f.severity == "critical" and "shai-hulud-workflow.yml" in f.title
            for f in findings
        ), f"Got: {[f.title for f in findings]}"

    def test_detects_mini_payload_filenames(self, tmp_path):
        pkg = tmp_path / "node_modules" / "@tanstack" / "router"
        pkg.mkdir(parents=True)
        (pkg / "router_init.js").write_text("")
        (pkg / "tanstack_runner.js").write_text("")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        titles = " ".join(f.title for f in findings)
        assert "router_init.js" in titles and "tanstack_runner.js" in titles, titles
        assert all(f.severity == "critical" for f in findings)

    def test_detects_deadman_switch_units(self, tmp_path):
        (tmp_path / "gh-token-monitor.sh").write_text("")
        (tmp_path / "com.user.kitty-monitor.plist").write_text("")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert len(findings) == 2
        assert all(f.severity == "critical" for f in findings)
        assert all("BEFORE rotating any credential" in f.description for f in findings)

    def test_detects_formatter_workflow_in_workflows_dir(self, tmp_path):
        wf = tmp_path / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / "formatter_123456789.yml").write_text("on: schedule\n")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert any("formatter_123456789.yml" in f.title for f in findings), \
            f"Got: {[f.title for f in findings]}"

    def test_formatter_name_outside_workflows_dir_not_flagged(self, tmp_path):
        """Precision: upstream only counts formatter_<digits>.yml under
        .github/workflows/ ("if [[ "$file" == */.github/workflows/* ]]")."""
        (tmp_path / "formatter_123456789.yml").write_text("k: v\n")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_ordinary_formatter_workflow_not_flagged(self, tmp_path):
        wf = tmp_path / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / "formatter_check.yml").write_text("on: push\n")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_detects_kitty_cat_payload(self, tmp_path):
        kitty = tmp_path / ".local" / "share" / "kitty"
        kitty.mkdir(parents=True)
        (kitty / "cat.py").write_text("")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert any("kitty/cat.py" in f.title for f in findings), \
            f"Got: {[f.title for f in findings]}"

    def test_bare_cat_py_not_flagged(self, tmp_path):
        """Precision: cat.py outside a kitty/ directory is an ordinary filename."""
        (tmp_path / "cat.py").write_text("print('meow')\n")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_detects_staged_trufflehog_binary(self, tmp_path):
        (tmp_path / "trufflehog").write_text("")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert any(
            f.severity == "high" and "TruffleHog" in f.title for f in findings
        ), f"Got: {[(f.severity, f.title) for f in findings]}"

    def test_clean_tree_no_findings(self, tmp_path):
        wf = tmp_path / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / "ci.yml").write_text("on: push\n")
        (tmp_path / "index.js").write_text("module.exports = {};\n")
        (tmp_path / "monitor.sh").write_text("#!/bin/sh\necho ok\n")
        findings = scanner.scan_shai_hulud_family_artifacts(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"


class TestWormPayloadHashes:
    """scan_worm_payload_hashes() -- byte-level confirmation for the family's
    priority payload filenames (README step 4: "Hash priority files ... and
    compare against 20 known-malicious SHA-256s").
    """

    def test_published_iocs_present(self):
        """Guard against a published IOC being dropped or mistyped."""
        for digest in (
            # check_bun_attack_files(): setup_bun_hashes / bun_environment_hashes
            "a3894003ad1d293ba96d77881ccd2071446dc3f65f434669b49b3da92421901a",
            "62ee164b9b306250c1172583f138c9614139264f889fa99614903c12755468d0",
            # MALICIOUS_HASHLIST: Mini Shai-Hulud router_init.js / tanstack_runner.js
            "ab4fcadaec49c03278063dd269ea5eef82d24f2124a8e15d7b90f2fa8601266c",
            "2ec78d556d696e208927cc503d48e4b5eb56b31abc2870c2ed2e98d6be27fc96",
        ):
            assert digest in scanner.WORM_PAYLOAD_HASHES
        assert len(scanner.WORM_PAYLOAD_HASHES) == 14

    def test_detector_self_test_fixtures_excluded(self):
        """Upstream's two test-case fixture hashes must never ship as IOCs."""
        for fixture in (
            "86532ed94c5804e1ca32fa67257e1bb9de628e3e48a1f56e67042dc055effb5b",
            "aba1fcbd15c6ba6d9b96e34cec287660fff4a31632bf76f2a766c499f55ca1ee",
        ):
            assert fixture not in scanner.WORM_PAYLOAD_HASHES

    def test_matching_hash_on_priority_filename_is_critical(self, tmp_path, monkeypatch):
        payload = b"// inert stand-in for a worm payload\n"
        digest = scanner.hashlib.sha256(payload).hexdigest()
        monkeypatch.setattr(
            scanner, "WORM_PAYLOAD_HASHES", {digest: "test IOC description"}
        )
        (tmp_path / "bundle.js").write_bytes(payload)
        findings = scanner.scan_worm_payload_hashes(str(tmp_path))
        assert len(findings) == 1
        assert findings[0].severity == "critical"
        assert findings[0].category == "post-incident"
        assert "bundle.js" in findings[0].title
        assert digest in findings[0].snippet

    def test_same_bytes_under_other_filename_not_hashed(self, tmp_path, monkeypatch):
        """Precision: only priority basenames are hashed, so cost stays bounded."""
        payload = b"// inert stand-in for a worm payload\n"
        digest = scanner.hashlib.sha256(payload).hexdigest()
        monkeypatch.setattr(
            scanner, "WORM_PAYLOAD_HASHES", {digest: "test IOC description"}
        )
        (tmp_path / "helper.js").write_bytes(payload)
        findings = scanner.scan_worm_payload_hashes(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_benign_bundle_js_not_flagged(self, tmp_path):
        """Precision: a real bundle.js with non-matching bytes stays silent."""
        (tmp_path / "bundle.js").write_text("export const version = '1.0.0';\n")
        findings = scanner.scan_worm_payload_hashes(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_oversize_file_skipped(self, tmp_path, monkeypatch):
        monkeypatch.setattr(scanner, "MAX_HASHED_FILE_BYTES", 8)
        (tmp_path / "bundle.js").write_text("x" * 64)
        assert scanner.scan_worm_payload_hashes(str(tmp_path)) == []


class TestWormRepoMarkers:
    """scan_worm_repo_markers() -- git-level markers ported from
    check_shai_hulud_repos() and check_git_branches().
    """

    @staticmethod
    def _make_repo(root, branch="main"):
        heads = root / ".git" / "refs" / "heads"
        heads.mkdir(parents=True)
        (heads / branch).write_text("0" * 40 + "\n")
        (root / ".git" / "config").write_text(
            '[remote "origin"]\n\turl = https://github.com/acme/widget.git\n'
        )
        return root

    def test_detects_shai_hulud_branch(self, tmp_path):
        self._make_repo(tmp_path, branch="shai-hulud")
        findings = scanner.scan_worm_repo_markers(str(tmp_path))
        assert any(
            f.severity == "critical" and "Branch" in f.title for f in findings
        ), f"Got: {[(f.severity, f.title) for f in findings]}"

    def test_detects_repo_directory_name(self, tmp_path):
        repo = tmp_path / "shai-hulud-stash"
        repo.mkdir()
        self._make_repo(repo)
        findings = scanner.scan_worm_repo_markers(str(tmp_path))
        assert any(
            f.severity == "high" and "Repository Name" in f.title for f in findings
        ), f"Got: {[(f.severity, f.title) for f in findings]}"

    def test_detects_shai_hulud_remote_as_medium(self, tmp_path):
        """A shai-hulud remote is medium: it also matches a detector clone."""
        self._make_repo(tmp_path)
        (tmp_path / ".git" / "config").write_text(
            '[remote "origin"]\n\turl = https://github.com/victim/shai-hulud.git\n'
        )
        findings = scanner.scan_worm_repo_markers(str(tmp_path))
        assert any(
            f.severity == "medium" and "Git Remote" in f.title for f in findings
        ), f"Got: {[(f.severity, f.title) for f in findings]}"

    def test_detects_double_base64_data_json(self, tmp_path):
        self._make_repo(tmp_path)
        (tmp_path / "data.json").write_text("eyJhIjoiYiJ9Cg==\n")
        findings = scanner.scan_worm_repo_markers(str(tmp_path))
        assert any(
            f.severity == "high" and "data.json" in f.title for f in findings
        ), f"Got: {[(f.severity, f.title) for f in findings]}"

    def test_ordinary_data_json_not_flagged(self, tmp_path):
        """Precision: upstream requires BOTH the 'eyJ' prefix and '==' padding."""
        self._make_repo(tmp_path)
        (tmp_path / "data.json").write_text('{"items": [1, 2, 3]}\n')
        findings = scanner.scan_worm_repo_markers(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_clean_repo_no_findings(self, tmp_path):
        self._make_repo(tmp_path)
        findings = scanner.scan_worm_repo_markers(str(tmp_path))
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_tree_without_git_no_findings(self, tmp_path):
        (tmp_path / "data.json").write_text("eyJhIjoiYiJ9Cg==\n")
        assert scanner.scan_worm_repo_markers(str(tmp_path)) == []


class TestDeadmanSwitchHostArtifacts:
    """scan_deadman_switch_host_artifacts() -- host persistence from
    check_mini_shai_hulud_indicators() IOC 8 (--check-host host_paths).
    """

    def test_detects_installed_deadman_switch(self, tmp_path, monkeypatch):
        agent = tmp_path / "com.user.gh-token-monitor.plist"
        agent.write_text("<plist/>\n")
        monkeypatch.setattr(
            scanner, "DEADMAN_HOST_PATHS",
            [(str(agent), "gh-token-monitor (TanStack wave, May 2026)")]
        )
        findings = scanner.scan_deadman_switch_host_artifacts()
        assert len(findings) == 1
        assert findings[0].severity == "critical"
        assert findings[0].category == "post-incident"
        assert "DO NOT rotate" in findings[0].description

    def test_absent_paths_produce_no_findings(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            scanner, "DEADMAN_HOST_PATHS",
            [(str(tmp_path / "not-there.plist"), "gh-token-monitor")]
        )
        assert scanner.scan_deadman_switch_host_artifacts() == []

    def test_default_paths_are_all_absolute_and_named(self):
        """Every configured host path must be absolute and carry a variant label."""
        assert scanner.DEADMAN_HOST_PATHS
        for path, variant in scanner.DEADMAN_HOST_PATHS:
            assert scanner.os.path.isabs(path), path
            assert variant
