import os
import re

from inkdoor.__main__ import main


def test_demo_with_options_before_and_after_the_command(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)       # no config.toml here
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    assert main(["-o", "a", "demo", "9:00"]) == 0
    assert main(["demo", "9:00", "-o", "b", "--lang", "pt-BR"]) == 0
    assert os.path.exists(tmp_path / "a" / "demo-en-US-900.png")
    assert os.path.exists(tmp_path / "b" / "demo-pt-BR-900.png")
    assert "INKDOOR_LANG" not in os.environ   # --lang does not leak into the process


def test_missing_config_exits_with_2(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    assert main(["check"]) == 2
    assert "config.example.toml" in capsys.readouterr().err


def test_invalid_config_is_explained_in_the_chosen_language(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "config.toml").write_text("[server]\nrefresh_minutes = 0\n")
    assert main(["render", "--lang", "pt-BR"]) == 2
    assert "refresh_minutes precisa ser" in capsys.readouterr().err


def test_cli_password_command(tmp_path, monkeypatch, capsys):
    from inkdoor.web.auth import read_password_hash, verify_password
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    monkeypatch.setenv("INKDOOR_CONFIG", str(tmp_path / "config.toml"))   # need not exist yet
    assert main(["password"]) == 0
    out = capsys.readouterr().out
    password = re.search(r"[2-9a-hjkmnp-z]{4}(-[2-9a-hjkmnp-z]{4}){3}", out).group(0)
    encoded = read_password_hash(tmp_path / "admin-password")
    assert verify_password(password, encoded)
    assert str(tmp_path / "admin-password") in out
    assert "scrypt" not in out and encoded.split("$")[-1] not in out
    assert os.stat(tmp_path / "admin-password").st_mode & 0o777 == 0o600

    assert main(["password", "--config", str(tmp_path / "config.toml"), "--lang", "pt-BR"]) == 0
    out = capsys.readouterr().out
    assert "Nova senha" in out
    assert not verify_password(password, read_password_hash(tmp_path / "admin-password"))


def test_cli_password_needs_an_existing_folder(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    missing = tmp_path / "nope" / "config.toml"
    assert main(["password", "--config", str(missing)]) == 1
    captured = capsys.readouterr()
    assert str(tmp_path / "nope") in captured.err
    assert captured.out == ""
    assert not os.path.exists(tmp_path / "nope")


def test_cli_password_honors_inkdoor_lang_without_a_config(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("INKDOOR_LANG", "pt-BR")
    assert main(["password", "--config", str(tmp_path / "config.toml")]) == 0
    assert "Nova senha" in capsys.readouterr().out
    (tmp_path / "config.toml").write_text("[server]\nrefresh_minutes = 0\n")   # invalid config
    assert main(["password", "--config", str(tmp_path / "config.toml")]) == 0
    assert "Nova senha" in capsys.readouterr().out


def test_cli_url_prints_the_admin_address(tmp_path, monkeypatch, capsys):
    from inkdoor import net
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    monkeypatch.setattr(net, "lan_address", lambda: "192.168.1.20")
    config_path = tmp_path / "config.toml"
    assert main(["url", "--config", str(config_path)]) == 0           # missing: default port
    assert capsys.readouterr().out == "http://192.168.1.20:3667\n"
    config_path.write_text("[server]\nport = 8123\n")
    assert main(["url", "--config", str(config_path)]) == 0
    assert capsys.readouterr().out == "http://192.168.1.20:8123\n"
    config_path.write_text("[server\n")                                 # broken: default port
    assert main(["url", "--config", str(config_path)]) == 0
    assert capsys.readouterr().out == "http://192.168.1.20:3667\n"


def test_cli_url_fails_without_a_lan_address(tmp_path, monkeypatch, capsys):
    from inkdoor import net
    from inkdoor.i18n import Translator
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    monkeypatch.setattr(net, "lan_address", lambda: None)
    assert main(["url", "--config", str(tmp_path / "config.toml")]) == 1
    captured = capsys.readouterr()
    assert captured.out == "" and captured.err.strip() == Translator("en-US")("cli.no_address")
    assert main(["url", "--config", str(tmp_path / "config.toml"), "--lang", "pt-BR"]) == 1
    assert capsys.readouterr().err.strip() == Translator("pt-BR")("cli.no_address")


def test_serve_starts_with_a_broken_config(tmp_path, monkeypatch, capsys):
    from inkdoor import server
    calls = []
    monkeypatch.setattr(server, "serve", lambda *args: calls.append(args))
    (tmp_path / "config.toml").write_text("[server\n")
    assert main(["serve", "--config", str(tmp_path / "config.toml")]) == 0
    assert calls


def test_serve_port_in_use_exits_with_1(tmp_path, monkeypatch, capsys):
    from inkdoor import server

    def busy(*args):
        raise server.PortInUse(8123)

    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    monkeypatch.setattr(server, "serve", busy)
    assert main(["serve", "--config", str(tmp_path / "config.toml")]) == 1
    assert "8123" in capsys.readouterr().err


def test_demo_draws_another_kindle_screen(tmp_path, monkeypatch):
    from PIL import Image
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    assert main(["-o", "a", "demo", "9:00", "--screen", "600x800"]) == 0
    assert Image.open(tmp_path / "a" / "demo-en-US-900-600x800.png").size == (600, 800)


def test_version_matches_the_package_metadata():
    # pyproject.toml and inkdoor.__version__ are bumped together for a release
    try:
        import tomllib
    except ModuleNotFoundError:  # Python 3.10
        import tomli as tomllib
    from inkdoor import __version__
    root = os.path.join(os.path.dirname(__file__), "..")
    with open(os.path.join(root, "pyproject.toml"), "rb") as f:
        assert tomllib.load(f)["project"]["version"] == __version__
    with open(os.path.join(root, "CHANGELOG.md"), encoding="utf-8") as f:
        assert f"## [{__version__}] - " in f.read()      # and the changelog has its entry
