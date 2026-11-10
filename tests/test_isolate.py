import os

import pytest

from inkdoor import isolate


def double(n):
    return n * 2


def fails():
    raise ValueError("bad calendar")


class Unpicklable(Exception):
    def __init__(self, a, b):  # pickles, but cannot be rebuilt from its args
        super().__init__(a)


def fails_oddly():
    raise Unpicklable(1, 2)


def dies():
    os._exit(3)


def sleeps():
    import time
    time.sleep(30)


def test_returns_the_childs_result():
    assert isolate.run(double, 21) == 42


def test_reraises_the_childs_exception():
    with pytest.raises(ValueError):
        isolate.run(fails)


def test_an_exception_that_cannot_cross_becomes_its_name():
    with pytest.raises(isolate.ChildError) as info:
        isolate.run(fails_oddly)
    assert info.value.name == "Unpicklable"


def test_a_child_that_dies_is_reported():
    with pytest.raises(isolate.CalendarCrashed):
        isolate.run(dies)


def test_a_slow_child_is_killed_at_the_time_limit():
    with pytest.raises(isolate.CalendarTimeout):
        isolate.run(sleeps, timeout=0.5)


def interrupted():
    raise KeyboardInterrupt


def test_an_interrupt_in_the_child_is_not_raised_as_one():
    with pytest.raises(isolate.ChildError) as info:
        isolate.run(interrupted)
    assert info.value.name == "KeyboardInterrupt"
