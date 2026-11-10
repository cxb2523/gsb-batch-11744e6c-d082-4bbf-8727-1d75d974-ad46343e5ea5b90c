"""Fictional data for rendering previews without real calendars."""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from .config import with_defaults
from .i18n import normalize
from .sources import Event, Snapshot, Task, sort_tasks

DEMO_DATE = dt.date(2026, 10, 14)   # a Wednesday; fixed so previews are reproducible

# Sample content in each language. Keys: calendar names, then event and task titles.
CONTENT = {
    "en-US": {
        "calendars": ("Work", "Company", "Personal"),
        "personal_label": "Busy",
        "all_day": "Marina's birthday",
        "today": [
            ("9:00", "9:30", "Product team standup", 0, ""),
            ("10:00", "11:00", "Q4 roadmap review", 1, ""),
            ("12:30", "13:15", "Lunch with Rafa", 2, "Vila Bistro"),
            ("14:00", "15:00", "Quarterly planning with the finance leadership", 1, "Room 4B"),
            ("16:30", "17:30", "1:1 with Camila", 0, ""),
            ("17:30", "18:00", "Vendor sync", 1, ""),
            ("18:45", "19:30", "Pilates", 2, ""),
        ],
        "tomorrow": [("9:00", "9:30", "Standup", 0), ("11:00", "12:00", "Steering committee", 1),
                     ("15:00", "16:00", "Workshop", 0)],
        "tasks": [("Send the revised proposal to the client", -1, 3, None),
                  ("Review the lease agreement", 0, 2, None),
                  ("Pay the HOA bill", 0, 0, dt.time(18, 0)),
                  ("Reply to HR about vacation days", 0, 0, None),
                  ("Buy Marina's present", 0, 3, None),
                  ("Book the car service", 0, 0, None)],
    },
    "pt-BR": {
        "calendars": ("Trabalho", "Empresa", "Pessoal"),
        "personal_label": "Ocupado",
        "all_day": "Aniversário da Marina",
        "today": [
            ("9:00", "9:30", "Daily do time de produto", 0, ""),
            ("10:00", "11:00", "Revisão do roadmap Q4", 1, ""),
            ("12:30", "13:15", "Almoço com o Rafa", 2, "Restaurante Vila"),
            ("14:00", "15:00", "Planejamento trimestral com a diretoria financeira", 1, "Sala Ipê"),
            ("16:30", "17:30", "1:1 com a Camila", 0, ""),
            ("17:30", "18:00", "Alinhamento com fornecedor", 1, ""),
            ("18:45", "19:30", "Pilates", 2, ""),
        ],
        "tomorrow": [("9:00", "9:30", "Daily", 0), ("11:00", "12:00", "Comitê", 1),
                     ("15:00", "16:00", "Workshop", 0)],
        "tasks": [("Enviar proposta revisada para o cliente", -1, 3, None),
                  ("Revisar contrato do aluguel", 0, 2, None),
                  ("Pagar boleto do condomínio", 0, 0, dt.time(18, 0)),
                  ("Responder e-mail do RH sobre férias", 0, 0, None),
                  ("Comprar presente da Marina", 0, 3, None),
                  ("Agendar revisão do carro", 0, 0, None)],
    },
}
STYLES = ("solid", "striped", "outline")


def demo_config(language: str | None = None) -> dict:
    language = normalize(language)
    content = CONTENT.get(language, CONTENT["en-US"])
    names = content["calendars"]
    # fictional links: never fetched, but a calendar needs one to count as set up
    calendars = [{"name": n, "style": s, "busy": True,
                  "url": f"https://calendar.example/demo/{s}.ics"} for n, s in zip(names, STYLES)]
    calendars[2]["status_label"] = content["personal_label"]
    return with_defaults({"display": {"language": language}, "calendar": calendars})


def demo_snapshot(cfg: dict, hour: str) -> Snapshot:
    tz = ZoneInfo(cfg["display"]["timezone"])
    content = CONTENT.get(cfg["display"]["language"], CONTENT["en-US"])
    calendars = cfg["calendar"]
    h, m = map(int, hour.split(":"))
    now = dt.datetime.combine(DEMO_DATE, dt.time(h, m), tz)
    tomorrow = DEMO_DATE + dt.timedelta(days=1)

    def at(day, hhmm):
        return dt.datetime.combine(day, dt.time(*map(int, hhmm.split(":"))), tz)

    def event(day, start, end, title, cal_index, location=""):
        cal = calendars[cal_index]
        return Event(at(day, start), at(day, end), title, cal["name"], cal.get("style", "solid"),
                     cal.get("busy", True), cal.get("status_label"), location=location)

    all_day = Event(at(DEMO_DATE, "0:00"), at(tomorrow, "0:00"), content["all_day"],
                    calendars[2]["name"], calendars[2].get("style", "outline"), False, all_day=True)
    today = [all_day] + [event(DEMO_DATE, *row) for row in content["today"]]
    tomorrow_events = [event(tomorrow, *row) for row in content["tomorrow"]]
    tasks = sort_tasks([Task(title, DEMO_DATE + dt.timedelta(days=offset), time, priority, offset < 0)
                        for title, offset, priority, time in content["tasks"]])
    return Snapshot(now, today, tomorrow_events, tasks, [])
