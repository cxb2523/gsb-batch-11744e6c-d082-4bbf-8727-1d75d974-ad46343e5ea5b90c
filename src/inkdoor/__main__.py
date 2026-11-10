"""inkdoor command line.

    inkdoor serve            render every few minutes and serve http://<ip>:3667/kindle.png
    inkdoor render           render once (output/kindle.png)
    inkdoor check            test every calendar link
    inkdoor demo [HH:MM...]  render previews with fictional data
    inkdoor password         create a new admin password next to config.toml and print it
    inkdoor url              print the admin address for other devices on the network
"""
from __future__ import annotations

import argparse
import os
import sys

from . import __version__, config
from .i18n import Translator, available


def _language_from_argv(argv: list[str]) -> str | None:
    """--lang must be known before argparse runs, so the help text itself is translated."""
    for i, arg in enumerate(argv):
        if arg == "--lang" and i + 1 < len(argv):
            return argv[i + 1]
        if arg.startswith("--lang="):
            return arg.split("=", 1)[1]
    return os.environ.get("INKDOOR_LANG")


def build_parser(t: Translator) -> argparse.ArgumentParser:
    # options work both before and after the command (inkdoor -o x demo / inkdoor demo -o x)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", "-c", default=argparse.SUPPRESS, help=t("cli.help.config"))
    common.add_argument("--output", "-o", default=argparse.SUPPRESS, help=t("cli.help.output"))
    common.add_argument("--lang", choices=available(), default=argparse.SUPPRESS, help=t("cli.help.lang"))

    parser = argparse.ArgumentParser(prog="inkdoor", parents=[common], description=t("cli.description"))
    parser.add_argument("--version", action="version", version=f"inkdoor {__version__}")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("serve", parents=[common], help=t("cli.help.serve"))
    commands.add_parser("render", parents=[common], help=t("cli.help.render"))
    commands.add_parser("check", parents=[common], help=t("cli.help.check"))
    demo = commands.add_parser("demo", parents=[common], help=t("cli.help.demo"))
    demo.add_argument("hours", nargs="*", default=["16:50"], help=t("cli.help.hours"))
    demo.add_argument("--screen", choices=list(config.SCREENS), help=t("cli.help.screen"))
    commands.add_parser("password", parents=[common], help=t("cli.help.password"))
    commands.add_parser("url", parents=[common], help=t("cli.help.url"))
    return parser


def _config_language(config_path: str | None, language: str | None) -> str | None:
    """--lang, else the config's language (which honors INKDOOR_LANG), else INKDOOR_LANG."""
    try:
        return config.load(config_path, language)["display"]["language"]
    except (config.ConfigMissing, config.ConfigInvalid):
        return language or os.environ.get("INKDOOR_LANG")


def _new_password(config_path: str, language: str | None) -> int:
    from .web.auth import generate_password, password_path, set_password
    t = Translator(_config_language(config_path, language))
    path = password_path(config_path)
    folder = os.path.dirname(path)
    if not os.path.isdir(folder):
        print(t("cli.password_no_folder", folder=folder), file=sys.stderr)
        return 1
    password = generate_password()
    try:
        set_password(path, password)
    except OSError as ex:
        print(t("cli.password_write_failed", path=path, error=type(ex).__name__), file=sys.stderr)
        return 1
    print(t("cli.password_new", password=password, path=path))
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    t = Translator(_language_from_argv(argv))
    args = build_parser(t).parse_args(argv)
    config_path = getattr(args, "config", None)
    output = getattr(args, "output", "output")
    language = getattr(args, "lang", None)

    try:
        if args.command == "demo":
            from .demo import demo_config, demo_snapshot
            from .render import render
            from .server import save
            try:
                display = config.load(config_path, language)["display"]
                lang, screen = display["language"], display["screen"]
            except config.ConfigMissing:
                lang, screen = language, config.DEFAULT_SCREEN
            cfg = demo_config(lang)
            cfg["display"]["screen"] = args.screen or screen
            t = Translator(cfg["display"]["language"])
            # the usual screen keeps the short names; another one is named in the file
            size = "" if cfg["display"]["screen"] == config.DEFAULT_SCREEN else f"-{cfg['display']['screen']}"
            for hour in args.hours:
                path = os.path.join(output, f"demo-{cfg['display']['language']}-{hour.replace(':', '')}{size}.png")
                save(render(demo_snapshot(cfg, hour), cfg), path)
                print(t("cli.preview", path=path))
            return 0

        if args.command == "password":
            return _new_password(config.resolve_path(config_path), language)

        if args.command == "check":
            from .check import run
            return 0 if run(config.load(config_path, language)) else 1

        if args.command == "render":
            from .server import render_once
            render_once(config.load(config_path, language), output)
            return 0

        if args.command == "url":
            from . import net
            from .render import translator_for
            from .server import load_for_serve
            cfg, _ = load_for_serve(config_path, language)  # a broken file still has a port
            url = net.admin_url(cfg)
            if url is None:
                print(translator_for(cfg)("cli.no_address"), file=sys.stderr)
                return 1
            print(url)
            return 0

        if args.command == "serve":
            # a missing or broken config does not stop serve: it falls back on its own
            from .server import PortInUse, serve
            try:
                serve(config_path, output, language)
            except PortInUse as ex:
                print(t("cli.port_in_use", port=ex.port), file=sys.stderr)
                return 1
            return 0
    except config.ConfigMissing as ex:
        print(t("cli.config_missing", path=ex.path), file=sys.stderr)
        return 2
    except config.ConfigInvalid as ex:
        print(t("cli.config_invalid", message=t(f"config_error.{ex.key}", **ex.details)), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
