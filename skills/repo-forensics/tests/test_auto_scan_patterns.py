"""
Tests for auto_scan.py install/clone pattern detection and package-name
extraction. Mirrors the detect_install_command coverage in test_pre_scan.py
(auto_scan previously had no pattern tests of its own).
"""

import os
import sys
import pytest

# Ensure scripts dir is importable
SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'scripts')
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))

import auto_scan  # noqa: E402


# --- detect_install_command ---

class TestDetectInstallCommand:
    def test_no_command(self):
        assert auto_scan.detect_install_command("") == (None, None)
        assert auto_scan.detect_install_command(None) == (None, None)

    def test_non_install_command(self):
        ptype, match = auto_scan.detect_install_command("echo hello")
        assert ptype is None

    @pytest.mark.parametrize("cmd,expected_type", [
        ("git clone https://github.com/user/repo", "git_clone"),
        ("git pull", "git_pull"),
        ("pip install requests", "pip_install"),
        ("pip3 install flask", "pip_install"),
        ("npm install express", "npm_install"),
        ("npm i lodash", "npm_install"),
        ("npm update webpack", "npm_install"),
        ("yarn add react", "yarn_add"),
        ("gem install rails", "gem_install"),
        ("gem update bundler", "gem_install"),
        ("cargo install ripgrep", "cargo_install"),
        ("go get github.com/user/pkg", "go_install"),
        ("go install github.com/user/pkg@latest", "go_install"),
        ("brew install node", "brew_install"),
        ("brew upgrade python", "brew_install"),
        ("openclaw skills install my-skill", "openclaw_install"),
        ("clawhub install my-pkg", "openclaw_install"),
        ("claude plugins install my-plugin", "claude_plugin_install"),
        ("uv add requests", "uv_install"),
        ("uv pip install flask", "uv_install"),
        ("uv tool install ruff", "uv_install"),
        ("uv sync", "uv_sync"),
        ("uv sync --frozen", "uv_sync"),
        ("pnpm install express", "pnpm_install"),
        ("pnpm i lodash", "pnpm_install"),
        ("pnpm add react", "pnpm_install"),
        ("pnpm update webpack", "pnpm_install"),
        ("bun install express", "bun_install"),
        ("bun i lodash", "bun_install"),
        ("bun add react", "bun_install"),
        ("bun update webpack", "bun_install"),
        # monorepo / global-option forms (flags between tool and subcommand)
        ("pnpm -r add lodash", "pnpm_install"),
        ("pnpm --filter web add react", "pnpm_install"),
        ("pnpm --filter=web add react", "pnpm_install"),
        ("pnpm -w add typescript", "pnpm_install"),
        ("uv --project /p add flask", "uv_install"),
        ("bun --cwd app add esbuild", "bun_install"),
        # bare lockfile installs (no package args) -> lockfile_install
        ("npm install", "lockfile_install"),
        ("npm ci", "lockfile_install"),
        ("pnpm install", "lockfile_install"),
        ("bun install", "lockfile_install"),
        ("yarn", "lockfile_install"),
        ("yarn install", "lockfile_install"),
        ("pnpm install --frozen-lockfile", "pnpm_install"),  # all-flags: pnpm_install w/ empty pkgs
        ("cd app && pnpm install", "lockfile_install"),
    ])
    def test_install_patterns(self, cmd, expected_type):
        ptype, match = auto_scan.detect_install_command(cmd)
        assert ptype == expected_type

    def test_pnpm_not_classified_as_npm(self):
        """Unanchored npm pattern substring-matches 'pnpm install x';
        the pnpm pattern must win (list order)."""
        ptype, _ = auto_scan.detect_install_command("pnpm install express")
        assert ptype == 'pnpm_install'

    def test_uv_pip_not_classified_as_pip(self):
        """Unanchored pip pattern substring-matches 'uv pip install x';
        the uv pattern must win (list order)."""
        ptype, _ = auto_scan.detect_install_command("uv pip install requests")
        assert ptype == 'uv_install'

    def test_bare_install_after_with_args_ordering(self):
        """'pnpm install express' keeps the with-args type; only the arg-less
        form falls through to lockfile_install."""
        assert auto_scan.detect_install_command("pnpm install express")[0] == 'pnpm_install'
        assert auto_scan.detect_install_command("pnpm install")[0] == 'lockfile_install'

    def test_flag_prefix_extracts_real_package(self):
        """Monorepo flags must not leak into the extracted package list."""
        _, m = auto_scan.detect_install_command("pnpm --filter web add react react-dom")
        assert set(auto_scan.extract_package_names('pnpm_install', m)) == {'react', 'react-dom'}
        _, m = auto_scan.detect_install_command("uv --project /p add flask>=2.0")
        assert auto_scan.extract_package_names('uv_install', m) == ['flask']

    @pytest.mark.parametrize("cmd", [
        "pnpm " + "-" * 4000 + " x",
        "pnpm " + "-a " * 3000 + "z",
        "uv " + "-" * 4000 + " add",
    ])
    def test_flag_prefix_no_catastrophic_backtracking(self, cmd):
        """_PM_FLAGS must stay linear on adversarial dash runs (ReDoS guard)."""
        import time
        start = time.perf_counter()
        auto_scan.detect_install_command(cmd)
        assert (time.perf_counter() - start) < 0.5


# --- extract_package_names ---

class TestExtractPackageNames:
    def test_uv_add_strips_flags(self):
        _, match = auto_scan.detect_install_command("uv add requests --dev")
        names = auto_scan.extract_package_names('uv_install', match)
        assert names == ['requests']

    def test_uv_add_with_version_specifier(self):
        _, match = auto_scan.detect_install_command("uv add flask>=2.0")
        names = auto_scan.extract_package_names('uv_install', match)
        assert names == ['flask']

    def test_pnpm_multiple_packages(self):
        _, match = auto_scan.detect_install_command("pnpm add react react-dom")
        names = auto_scan.extract_package_names('pnpm_install', match)
        assert set(names) == {'react', 'react-dom'}

    def test_bun_scoped_package(self):
        _, match = auto_scan.detect_install_command("bun add @scope/pkg")
        names = auto_scan.extract_package_names('bun_install', match)
        assert names == ['@scope/pkg']

    def test_uv_sync_has_no_packages(self):
        """uv sync installs from the lockfile — no package args to extract."""
        ptype, match = auto_scan.detect_install_command("uv sync")
        assert ptype == 'uv_sync'
        assert auto_scan.extract_package_names(ptype, match) == []

    def test_npm_with_flags(self):
        _, match = auto_scan.detect_install_command("npm install --save express")
        names = auto_scan.extract_package_names('npm_install', match)
        assert 'express' in names


# --- split_npm_name_version / check_ioc_pinned_versions ---

class TestSplitNpmNameVersion:
    """`@` is both the scope marker and the version separator, so the split
    must key off the LAST `@` and ignore a leading one."""

    def test_plain_name_with_version(self):
        assert auto_scan.split_npm_name_version("keyv@6.0.0") == ("keyv", "6.0.0")

    def test_scoped_name_with_version(self):
        assert auto_scan.split_npm_name_version("@scope/pkg@1.2.3") == ("@scope/pkg", "1.2.3")

    def test_scoped_name_without_version(self):
        assert auto_scan.split_npm_name_version("@scope/pkg") == ("@scope/pkg", None)

    def test_bare_name(self):
        assert auto_scan.split_npm_name_version("keyv") == ("keyv", None)

    def test_trailing_at_yields_no_version(self):
        assert auto_scan.split_npm_name_version("keyv@") == ("keyv", None)


class TestCheckIocPinnedVersions:
    """Pinned `name@version` tokens match no entry in the IOC name sets, so
    check_ioc_packages() alone lets them through. Exercises the real IOC DB."""

    def test_non_npm_family_pattern_skipped(self):
        """pip/uv already strip version specifiers, so they are not re-checked."""
        assert auto_scan.check_ioc_pinned_versions("pip_install", ["keyv@6.0.0"]) == []

    def test_bare_name_ignored(self):
        """Bare names are check_ioc_packages()' job, not this one."""
        assert auto_scan.check_ioc_pinned_versions("npm_install", ["keyv"]) == []

    def test_name_listed_package_flagged_at_any_version(self):
        findings = auto_scan.check_ioc_pinned_versions(
            "npm_install", ["anthropic-sdk-node@9.9.9"])
        assert len(findings) == 1
        assert findings[0]['severity'] == 'critical'
        assert findings[0]['category'] == 'known-ioc'
        assert 'anthropic-sdk-node' in findings[0]['title']

    def test_compromised_version_flagged(self):
        findings = auto_scan.check_ioc_pinned_versions("npm_install", ["keyv@6.0.0"])
        assert len(findings) == 1
        assert findings[0]['severity'] == 'critical'
        assert findings[0]['category'] == 'known-ioc'
        assert 'keyv@6.0.0' in findings[0]['title']

    def test_clean_version_not_flagged(self):
        """Precision: only the exact compromised version is flagged."""
        assert auto_scan.check_ioc_pinned_versions("npm_install", ["keyv@6.0.1"]) == []

    def test_safe_bare_package_not_flagged(self):
        assert auto_scan.check_ioc_pinned_versions("npm_install", ["express"]) == []

    def test_safe_pinned_package_not_flagged(self):
        assert auto_scan.check_ioc_pinned_versions("npm_install", ["express@4.18.2"]) == []

    def test_yarn_and_pnpm_and_bun_covered(self):
        for ptype in ("yarn_add", "pnpm_install", "bun_install"):
            assert auto_scan.check_ioc_pinned_versions(ptype, ["keyv@6.0.0"]), ptype


class TestPinnedVersionHookOutput:
    """End-to-end through the PostToolUse entrypoint: a pinned compromised
    version must surface a CRITICAL, the neighbouring clean version must not."""

    def _run_hook(self, command):
        import json
        import subprocess
        script = os.path.abspath(os.path.join(SCRIPTS_DIR, 'auto_scan.py'))
        payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
        result = subprocess.run(
            [sys.executable, script], input=payload,
            capture_output=True, text=True, timeout=60,
        )
        return result.returncode, result.stdout

    def test_compromised_pinned_version_flags_critical(self):
        code, out = self._run_hook("npm install keyv@6.0.0")
        assert code == 0  # PostToolUse hooks never block; they report
        assert 'CRITICAL' in out
        assert 'keyv@6.0.0' in out

    def test_clean_pinned_version_is_clean(self):
        code, out = self._run_hook("npm install keyv@6.0.1")
        assert code == 0
        assert 'CRITICAL' not in out
        assert 'no issues found' in out
