"""The Kindle side as the server hands it out: the zip, the KPM package and its install hooks."""
import io
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path

import pytest

from inkdoor import kindle_files

URL = "http://192.168.0.50:3667/kindle.png"
FOLDER = kindle_files.find_dir()


def test_kindle_version_is_bumped_when_the_scripts_change():
    assert kindle_files.scripts_digest(FOLDER) == kindle_files.SCRIPTS_SHA256, (
        "The Kindle scripts changed: raise KINDLE_VERSION in kindle_files.py (KPM only upgrades "
        "to a higher version) and set SCRIPTS_SHA256 to the new digest.")


def test_repository_index_lists_the_package_with_a_relative_url():
    index = json.loads(kindle_files.repository_index("inkdoor (this server)", "Door sign"))
    assert (index["manifest_version"], index["id"]) == (2, "inkdoor")
    artifact = index["packages"]["inkdoor"]["artifacts"][0]
    assert artifact == {"url": "kpm/inkdoor.kpkg", "version": list(kindle_files.KINDLE_VERSION),
                        "dependencies": [], "supported_platforms": None}


def package(url=URL, language="en-US"):
    return tarfile.open(fileobj=io.BytesIO(kindle_files.build_kpkg(FOLDER, url, language, "d")))


def test_package_has_the_manifest_hooks_and_scripts():
    archive = package()
    assert archive.getnames() == [
        "manifest.json", "install.sh", "uninstall.sh",
        "payload/inkdoor/common.sh", "payload/inkdoor/loop.sh", "payload/inkdoor/config.sh",
        "payload/documents/inkdoor-start.sh", "payload/documents/inkdoor-test.sh",
        "payload/documents/inkdoor-kpm.sh"]
    manifest = json.load(archive.extractfile("manifest.json"))
    assert manifest["id"] == "inkdoor" and manifest["version"] == list(kindle_files.KINDLE_VERSION)
    assert manifest["manifest_version"] == 2 and manifest["supported_platforms"] is None
    config_sh = archive.extractfile("payload/inkdoor/config.sh").read().decode()
    assert f'\nURL="{URL}"\n' in config_sh and '\nLANGUAGE="en-US"\n' in config_sh
    assert archive.extractfile("payload/inkdoor/loop.sh").read() == (FOLDER / "inkdoor/loop.sh").read_bytes()


def test_the_same_files_make_the_same_package():
    assert kindle_files.build_kpkg(FOLDER, URL, "pt-BR", "d") == kindle_files.build_kpkg(FOLDER, URL, "pt-BR", "d")


def test_package_refuses_an_address_that_cannot_go_into_config_sh():
    with pytest.raises(ValueError):
        kindle_files.build_kpkg(FOLDER, 'http://x"; reboot; "/kindle.png', "en-US", "d")


# --- the hooks, run as KPM runs them: "sh install.sh [upgrade]" from the unpacked package --------

def unpack(tmp_path, name, url=URL, language="en-US"):
    folder = tmp_path / name
    package(url, language).extractall(folder, filter="data")
    return folder


def hook(folder, script, root, *args):
    env = {**os.environ, "INKDOOR_KINDLE_ROOT": str(root)}
    subprocess.run(["sh", script, *args], cwd=folder, env=env, check=True, capture_output=True)


def test_install_puts_the_scripts_where_a_manual_install_does(tmp_path):
    root = tmp_path / "us"
    hook(unpack(tmp_path, "v1"), "install.sh", root)
    for name in ("common.sh", "loop.sh", "config.sh"):
        assert (root / "inkdoor" / name).is_file()
    for name in ("inkdoor-start.sh", "inkdoor-test.sh", "inkdoor-kpm.sh"):
        assert (root / "documents" / name).read_bytes() == (FOLDER / "documents" / name).read_bytes()
    assert f'URL="{URL}"' in (root / "inkdoor/config.sh").read_text()


def test_upgrade_keeps_the_kindle_settings_and_follows_the_server(tmp_path):
    root = tmp_path / "us"
    hook(unpack(tmp_path, "v1"), "install.sh", root)
    config = root / "inkdoor/config.sh"
    edited = config.read_text().replace("INTERVAL=300", "INTERVAL=600").replace(
        'LANGUAGE="en-US"', 'LANGUAGE="pt-BR"').replace("\n", "\r\n")      # edited on Windows
    config.write_text(edited)
    (root / "documents" / "book.azw3").write_text("a book")
    hook(unpack(tmp_path, "v1"), "uninstall.sh", root, "upgrade")
    assert config.is_file() and (root / "documents/inkdoor-start.sh").is_file()
    new_url = "http://192.168.0.77:3667/kindle.png"
    hook(unpack(tmp_path, "v2", new_url), "install.sh", root, "upgrade")
    text = config.read_text()
    assert f'URL="{new_url}"' in text and "INTERVAL=600" in text and 'LANGUAGE="pt-BR"' in text
    assert "\r" not in text and URL not in text
    assert (root / "documents" / "book.azw3").read_text() == "a book"


def test_uninstall_removes_inkdoor_and_nothing_else(tmp_path):
    root = tmp_path / "us"
    folder = unpack(tmp_path, "v1")
    hook(folder, "install.sh", root)
    (root / "documents" / "book.azw3").write_text("a book")
    hook(folder, "uninstall.sh", root)
    assert not (root / "inkdoor").exists()
    assert sorted(p.name for p in (root / "documents").iterdir()) == ["book.azw3"]


# --- "inkdoor - connect KPM", with KPM and the Kindle's Wi-Fi replaced by stubs ------------------

def connect_kpm(tmp_path, url=URL, kpm_works=True, kpm_present=True):
    """Runs the scriptlet with /mnt/us and /var/local/kmc/bin pointed at temporary folders."""
    root, bin_dir, calls = tmp_path / "us", tmp_path / "bin", tmp_path / "calls"
    (root / "inkdoor").mkdir(parents=True)
    bin_dir.mkdir()
    for name in ("inkdoor/common.sh", "inkdoor/config.sh", "documents/inkdoor-kpm.sh"):
        text = (FOLDER / name).read_text().replace("/mnt/us", str(root)).replace(
            "/var/local/kmc/bin", str(bin_dir))
        if name == "inkdoor/config.sh":
            # by hand, not with config_sh(): some tests need an address it would refuse
            text = re.sub(r'(?m)^URL=".*"$', lambda _: f"URL='{url}'", text, count=1)
        (root / name).parent.mkdir(exist_ok=True)
        (root / name).write_text(text)
    # su runs its command through a shell, as KMC's does: the scriptlet must hand it a safe line
    stubs = {"lipc-get-prop": "echo CONNECTED", "lipc-set-prop": "true",
             str(bin_dir / "su"): '[ "$1" = -c ] && exec sh -c "$2"'}
    if kpm_present:
        stubs[str(bin_dir / "kpm")] = f'echo "$@" >> "{calls}"; ' + (
            "true" if kpm_works else '[ "$2" != install ]')
    for name, body in stubs.items():
        path = bin_dir / name if "/" not in name else Path(name)
        path.write_text(f"#!/bin/sh\n{body}\n")
        path.chmod(0o755)
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "TMPDIR": str(tmp_path)}
    run = subprocess.run(["sh", str(root / "documents/inkdoor-kpm.sh")], env=env, cwd=tmp_path,
                         capture_output=True, text=True)
    lines = calls.read_text().splitlines() if calls.exists() else []
    return run, lines


def test_connect_kpm_adds_this_server_and_installs(tmp_path):
    run, calls = connect_kpm(tmp_path)
    assert run.returncode == 0, run.stdout + run.stderr
    # add-repo only records the repository: KPM reads its packages on update
    assert calls == ["-y remove-repo inkdoor", "-y add-repo http://192.168.0.50:3667/kpm.json",
                     "-y update", "-y install inkdoor"]
    assert "OK! To update later" in run.stdout


def test_connect_kpm_reports_a_failed_install(tmp_path):
    run, calls = connect_kpm(tmp_path, kpm_works=False)
    assert run.returncode == 1 and "FAILED: KPM could not install inkdoor." in run.stdout
    assert "the server's admin is on" in run.stdout


def test_connect_kpm_needs_kpm_and_an_image_address(tmp_path):
    run, calls = connect_kpm(tmp_path / "a", kpm_present=False)
    assert run.returncode == 1 and "KPM is not installed" in run.stdout and calls == []
    for i, url in enumerate(["http://192.168.0.50:3667/other",
                             "http://192.168.0.50/;touch hacked;/kindle.png",
                             "http://192.168.0.50/$(touch hacked)/kindle.png"]):
        run, calls = connect_kpm(tmp_path / f"b{i}", url=url)
        assert run.returncode == 1 and "must be http://.../kindle.png" in run.stdout, url
        assert calls == [] and not list(tmp_path.rglob("hacked"))


def test_connect_kpm_takes_an_ipv6_address(tmp_path):
    run, calls = connect_kpm(tmp_path, url="http://[fd00::5]:3667/kindle.png")
    assert run.returncode == 0 and "-y add-repo http://[fd00::5]:3667/kpm.json" in calls
