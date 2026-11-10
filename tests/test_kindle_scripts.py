"""The Kindle's shell helpers (kindle/inkdoor/common.sh), run with sh on this computer."""
import os
import subprocess

import pytest

FOLDER = os.path.join(os.path.dirname(__file__), "..", "kindle", "inkdoor")


def run(tmp_path, script, interval=300, path_dirs=()):
    """Sources common.sh with its Kindle folders moved into tmp_path, then runs ``script``."""
    home = tmp_path / "inkdoor"
    home.mkdir(exist_ok=True)
    with open(os.path.join(FOLDER, "config.sh")) as f:
        config = f.read().replace("INTERVAL=300", f"INTERVAL={interval}")
    (home / "config.sh").write_text(config)
    with open(os.path.join(FOLDER, "common.sh")) as f:
        # /tmp first: tmp_path itself is under /tmp on Linux, and must not be replaced again
        common = f.read().replace("/tmp/", f"{tmp_path}/").replace("/mnt/us/inkdoor", str(home))
    (home / "common.sh").write_text(common)
    # LC_ALL=C as on the Kindle: a UTF-8 locale makes some greps skip the PNG's binary header
    env = {**os.environ, "LC_ALL": "C",
           "PATH": os.pathsep.join([*map(str, path_dirs), os.environ["PATH"]])}
    return subprocess.run(["sh", "-c", f'. "{home}/common.sh"; {script}'], env=env, cwd=tmp_path,
                          capture_output=True, text=True, check=True).stdout.strip()


@pytest.mark.parametrize("headers, expected", [
    ("HTTP/1.1 200 OK\r\nX-Inkdoor-Next: 95\r\nContent-Type: image/png\r\n\r\n", "95"),
    ("HTTP/1.1 200 OK\r\nx-inkdoor-next: 120\r\n\r\n", "120"),       # any case
    ("  HTTP/1.1 200 OK\n  X-Inkdoor-Next: 61\n", "61"),              # wget -S indents headers
    ("HTTP/1.1 200 OK\r\nX-Inkdoor-Next: 3\r\n\r\n", "30"),          # never sooner than 30 s
    ("HTTP/1.1 200 OK\r\nX-Inkdoor-Next: 9000\r\n\r\n", "300"),      # never later than INTERVAL
    ("HTTP/1.1 200 OK\r\nX-Inkdoor-Next: 99999999999999999999\r\n\r\n", "300"),
    ("HTTP/1.1 200 OK\r\nX-Inkdoor-Next: soon\r\n\r\n", "300"),
    ("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\n\r\n", "300"),   # an older server
])
def test_next_wait_follows_the_server_within_limits(tmp_path, headers, expected):
    (tmp_path / "inkdoor.headers").write_text(headers)
    assert run(tmp_path, "next_wait") == expected


def test_next_wait_without_a_download_is_the_interval(tmp_path):
    assert run(tmp_path, "next_wait", interval=600) == "600"


def test_download_keeps_the_response_headers(tmp_path):
    # a stand-in curl that answers like the server: headers to -D, a PNG to -o
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "curl").write_text('''#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    -D) printf 'HTTP/1.1 200 OK\\r\\nX-Inkdoor-Next: 75\\r\\n\\r\\n' > "$2"; shift ;;
    -o) printf '\\211PNG\\r\\n' > "$2"; shift ;;
    -m) shift ;;
  esac
  shift
done
''')
    (bin_dir / "curl").chmod(0o755)
    assert run(tmp_path, "download && next_wait", path_dirs=[bin_dir]) == "75"
    assert (tmp_path / "inkdoor.png").read_bytes().startswith(b"\x89PNG")
