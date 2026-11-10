"""The Kindle's scripts as one zip, with config.sh already pointing at this server.

The scripts live in ``kindle/`` at the root of the repository, next to ``src/``; they are not part
of the Python package. Both supported installs keep them beside the code: the installer's
``/opt/inkdoor`` is a clone with its virtualenv inside, and a laptop runs ``pip install -e`` in a
clone. ``find_dir`` looks for them upwards from the package and returns None when they are not
there (for example, a package installed somewhere else), in which case the admin offers no zip.
"""
from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import io
import json
import re
import tarfile
import zipfile
from pathlib import Path

SCRIPTS = ("inkdoor/common.sh", "inkdoor/loop.sh", "inkdoor/config.sh",
           "documents/inkdoor-start.sh", "documents/inkdoor-test.sh", "documents/inkdoor-kpm.sh")
KPM_HOOKS = ("kpm/install.sh", "kpm/uninstall.sh")

# Version of the Kindle side, as KPM sees it: ";kpm upgrade" only installs a higher version, so
# bump it whenever a file in SCRIPTS or KPM_HOOKS changes. A test compares SCRIPTS_SHA256 with
# the files and fails until both are updated.
KINDLE_VERSION = (1, 2, 0)
SCRIPTS_SHA256 = "c219dcf8eca963d0a78463aa27f57da50e5c89734dc3a4804b84cec983540173"
PACKAGE_ID = "inkdoor"
_STAMP = (2026, 1, 1, 0, 0, 0)            # fixed timestamps: the same files make the same archive
_MTIME = int(dt.datetime(*_STAMP, tzinfo=dt.timezone.utc).timestamp())
# Inside the zip, the scriptlets go in "scriptlets/", not "documents/": dragging a folder named
# "documents" onto the Kindle in Finder can replace the Kindle's own, books included.
_ZIP_NAMES = {"documents/inkdoor-start.sh": "scriptlets/inkdoor-start.sh",
              "documents/inkdoor-test.sh": "scriptlets/inkdoor-test.sh",
              "documents/inkdoor-kpm.sh": "scriptlets/inkdoor-kpm.sh"}
# What may go between the quotes of URL="..." in a shell file: an http address with no quotes,
# "$", backticks or backslashes
_SAFE_URL = re.compile(r"http://[A-Za-z0-9.:\[\]/_-]+")


def find_dir() -> Path | None:
    """The repository's ``kindle/`` folder, or None when this install does not have it."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "kindle"
        if all((candidate / name).is_file() for name in SCRIPTS + KPM_HOOKS):
            return candidate
    return None


def scripts_digest(folder: Path) -> str:
    """SHA-256 over the Kindle files, to notice a change that needs a new KINDLE_VERSION."""
    digest = hashlib.sha256()
    for name in SCRIPTS + KPM_HOOKS:
        digest.update(name.encode() + b"\0" + (folder / name).read_bytes() + b"\0")
    return digest.hexdigest()


def kindle_language(language: str) -> str:
    """The Kindle scripts know en-US and pt-BR (common.sh treats any "pt…" as pt-BR)."""
    return "pt-BR" if language.lower().startswith("pt") else "en-US"


def config_sh(template: str, url: str, language: str) -> str:
    """``config.sh`` with URL and LANGUAGE set; every other line as in the template."""
    if not _SAFE_URL.fullmatch(url):
        raise ValueError("unexpected characters in the image address")
    text = re.sub(r'^URL="[^"\n]*"', f'URL="{url}"', template, count=1, flags=re.M)
    return re.sub(r'^LANGUAGE="[^"\n]*"', f'LANGUAGE="{kindle_language(language)}"', text,
                  count=1, flags=re.M)


def build_zip(folder: Path, url: str, language: str, readme: str) -> bytes:
    """The zip the admin hands out: the scripts, config.sh filled in, and a README.txt."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in SCRIPTS:
            data = (folder / name).read_bytes()
            if name == "inkdoor/config.sh":
                data = config_sh(data.decode("utf-8"), url, language).encode("utf-8")
            info = zipfile.ZipInfo(_ZIP_NAMES.get(name, name), date_time=_STAMP)
            info.external_attr = 0o100755 << 16          # a regular, executable file
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
        info = zipfile.ZipInfo("README.txt", date_time=_STAMP)
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, readme.replace("\n", "\r\n").encode("utf-8"))  # Notepad too
    return buffer.getvalue()


# --------------------------------------------------------------------------- KPM

def repository_index(name: str, description: str) -> str:
    """The KPM repository index (``kpm.json``) this server publishes: one package, inkdoor.

    The artifact's URL is relative: KPM resolves it against the index's own address.
    """
    return json.dumps({
        "manifest_version": 2,
        "id": PACKAGE_ID,
        "name": name,
        "description": description,
        "packages": {PACKAGE_ID: {
            "name": "inkdoor",
            "author": "inkdoor",
            "description": description,
            "artifacts": [{"url": f"kpm/{PACKAGE_ID}.kpkg", "version": list(KINDLE_VERSION),
                           "dependencies": [], "supported_platforms": None}],
        }},
    })


def _add(archive: tarfile.TarFile, name: str, data: bytes, mode: int) -> None:
    info = tarfile.TarInfo(name)
    info.size, info.mode = len(data), mode
    info.mtime = _MTIME
    archive.addfile(info, io.BytesIO(data))


def build_kpkg(folder: Path, url: str, language: str, description: str) -> bytes:
    """The KPM package: manifest, install/uninstall hooks and the scripts under ``payload/``,
    with config.sh pointing at ``url``. On an upgrade install.sh keeps the Kindle's own config.sh
    and only changes its URL line."""
    manifest = {"manifest_version": 2, "id": PACKAGE_ID, "name": "inkdoor", "author": "inkdoor",
                "description": description, "version": list(KINDLE_VERSION),
                "dependencies": [], "supported_platforms": None}
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=_MTIME) as packed, \
            tarfile.open(fileobj=packed, mode="w") as archive:
        _add(archive, "manifest.json", json.dumps(manifest, indent=2).encode("utf-8"), 0o644)
        for hook in KPM_HOOKS:
            _add(archive, Path(hook).name, (folder / hook).read_bytes(), 0o755)
        for name in SCRIPTS:
            data = (folder / name).read_bytes()
            if name == "inkdoor/config.sh":
                data = config_sh(data.decode("utf-8"), url, language).encode("utf-8")
            _add(archive, f"payload/{name}", data, 0o755)
    return buffer.getvalue()
