"""Runs the reading of downloaded calendars in a child process, with a time limit.

A calendar is data from outside. A few hundred bytes of recurrence rules can expand into
millions of occurrences, or make the recurrence library walk years of seconds before it reaches
today. In the server's own process that would stall the render loop (the door would keep its old
status) or exhaust its memory. In a child it costs at most ``timeout`` seconds: the child is
killed and the source counts as failed, so the door falls back on that calendar's last good data
or "Knock first", never "Free".

Memory is bounded by what the child reads, not by a limit set here: the recurrence expansion is
lazy and capped (``sources.MAX_OCCURRENCES``). The service's seccomp filter
(``SystemCallFilter=~@resources``) kills a process that calls setrlimit, so the child sets none.

The child starts from a fork server where there is one (Linux, macOS): it forks from a small,
single-threaded process that has already imported the parsing code, so each run is cheap and
safe next to the server's threads. Elsewhere (Windows) it is spawned.
"""
from __future__ import annotations

import functools
import multiprocessing
import pickle

TIMEOUT = 30.0
_JOIN = 5.0


class CalendarTimeout(Exception):
    """Reading the calendar took longer than the time limit."""


class CalendarCrashed(Exception):
    """The process reading the calendar died without an answer (e.g. killed for its memory)."""


class ChildError(Exception):
    """The child raised an exception that cannot be sent back; ``name`` is its type."""

    def __init__(self, name: str):
        super().__init__(name)
        self.name = name


@functools.cache
def _context():
    if "forkserver" in multiprocessing.get_all_start_methods():
        context = multiprocessing.get_context("forkserver")
        # imported once by the fork server, not by every child
        context.set_forkserver_preload(["inkdoor.sources"])
        return context
    return multiprocessing.get_context("spawn")


def _child(conn, func, args) -> None:
    try:
        try:
            answer = ("ok", func(*args))
        except Exception as ex:
            answer = ("error", ex)
        except BaseException as ex:  # e.g. Ctrl+C reached the child: never re-raise it as such
            answer = ("error", ChildError(type(ex).__name__))
        try:
            payload = pickle.dumps(answer)
            pickle.loads(payload)  # some exceptions pickle but cannot be rebuilt
        except Exception:
            # something that cannot cross processes: send its type name only
            payload = pickle.dumps(("error", ChildError(type(answer[1]).__name__)))
        conn.send_bytes(payload)
    finally:
        conn.close()


def run(func, *args, timeout: float | None = None):
    """``func(*args)`` in a child process: its result, or the exception it raised.

    ``func`` must be a module-level function and ``args`` and the result picklable. Raises
    CalendarTimeout after ``timeout`` seconds (default TIMEOUT) and CalendarCrashed if the child
    dies.
    """
    timeout = TIMEOUT if timeout is None else timeout
    context = _context()
    receiver, sender = context.Pipe(duplex=False)
    try:
        process = context.Process(target=_child, args=(sender, func, args), daemon=True)
        process.start()
    except BaseException:
        receiver.close()
        sender.close()
        raise
    sender.close()  # the child holds its own copy: EOF here means the child is gone
    try:
        if not receiver.poll(timeout):
            raise CalendarTimeout()
        try:
            status, value = pickle.loads(receiver.recv_bytes())
        except (EOFError, OSError):
            raise CalendarCrashed() from None
    finally:
        receiver.close()
        if process.is_alive():
            process.kill()
        process.join(_JOIN)
        if process.exitcode is not None:
            process.close()
    if status == "error":
        raise value from None
    return value
