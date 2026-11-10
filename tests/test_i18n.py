import datetime as dt
import json
import os

import pytest

from inkdoor.i18n import DEFAULT, LOCALES_DIR, Translator, available, normalize


def flatten(node, prefix=""):
    keys = set()
    for key, value in node.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict) and not {"one", "other"} >= set(value):
            keys |= flatten(value, path + ".")
        else:
            keys.add(path)
    return keys


def load(language):
    with open(os.path.join(LOCALES_DIR, f"{language}.json"), encoding="utf-8") as f:
        return json.load(f)


@pytest.mark.parametrize("language", [l for l in available() if l != DEFAULT])
def test_every_catalog_has_the_same_keys_as_en_us(language):
    reference, other = flatten(load(DEFAULT)), flatten(load(language))
    assert reference - other == set(), "missing translations"
    assert other - reference == set(), "keys that do not exist in en-US"


def test_language_aliases():
    assert normalize("pt_BR") == "pt-BR"
    assert normalize("pt") == "pt-BR"
    assert normalize("en") == "en-US"
    assert normalize(None) == "en-US"
    assert normalize("xx-YY") == "en-US"


def test_clock_and_plurals():
    en, pt = Translator("en-US"), Translator("pt-BR")
    assert en.time(dt.time(0, 5)) == "12:05 AM"
    assert en.time(dt.time(16, 30)) == "4:30 PM"
    assert pt.time(dt.time(16, 30)) == "16:30"
    assert Translator("en-US", clock="24h").time(dt.time(16, 30)) == "16:30"
    assert en("agenda.events", n=1) == "1 event"
    assert en("agenda.events", n=2) == "2 events"
    assert pt.duration(90) == "1h30" and en.duration(90) == "1h 30m"
    assert en.date_header(dt.date(2026, 10, 14)) == "Wednesday, Oct 14"
    assert pt.date_header(dt.date(2026, 10, 14)) == "Quarta, 14 de out"
    assert en.date_short(dt.date(2026, 10, 4)) == "Oct 4"
    assert pt.date_short(dt.date(2026, 10, 4)) == "04/10"


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_config_errors_share_one_style(language):
    # they follow "Invalid config: ", so they start in lowercase and end like a sentence
    for key, message in Translator(language).get("config_error").items():
        assert not message[0].isupper(), key
        assert message.endswith((".", "}")), key


def test_ticktick_steps_use_the_menu_names_of_its_portuguese_app():
    # TickTick is translated, so the pt-BR steps name its menus as a Portuguese user sees them
    text = json.dumps(load("pt-BR"), ensure_ascii=False)
    for english in ("Subscribe to TickTick", "Integrations & Import", "Enable the URL"):
        assert english not in text
    assert "Assinar o TickTick" in text and "Integrações e Importação" in text
