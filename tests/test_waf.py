"""Offline unit tests for ``detection.waf`` backoff semantics.

No network access and no browser are involved: ``asyncio.sleep`` is patched
with an in-memory recorder so the tests run instantly.
"""
import asyncio
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from detection.waf import WAFManager, detect_waf


class FakeConfig:
    def __init__(self, delay_min=2000, delay_max=4000):
        self.delay_min = delay_min
        self.delay_max = delay_max


def run(coro):
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class DetectWafOrderingTests(unittest.TestCase):
    """The detection order and return fields must remain unchanged."""

    def test_rate_limiter_takes_precedence_over_signatures(self):
        # 429 plus a Cloudflare header must still report the Rate-Limiter.
        waf = detect_waf(429, headers={"cf-ray": "abc"}, body="")
        self.assertIsNotNone(waf)
        self.assertEqual(waf["name"], "Rate-Limiter")
        self.assertEqual(waf["type"], "Rate-Limit")
        self.assertEqual(waf["status"], 429)
        self.assertIn("reason", waf)

    def test_header_signature_detection_and_fields(self):
        waf = detect_waf(200, headers={"CF-RAY": "xyz"}, body="")
        self.assertEqual(
            waf,
            {
                "name": "Cloudflare",
                "type": "WAF",
                "status": 200,
                "reason": "Header 'cf-ray' detected",
            },
        )

    def test_clean_response_returns_none(self):
        self.assertIsNone(detect_waf(200, headers={}, body="hello world"))


class WAFManagerBackoffTests(unittest.TestCase):
    def setUp(self):
        self.sleeps = []

        async def fake_sleep(seconds):
            self.sleeps.append(seconds)

        sleep_patcher = mock.patch("detection.waf.asyncio.sleep", new=fake_sleep)
        sleep_patcher.start()
        self.addCleanup(sleep_patcher.stop)

    def _cloudflare_response(self, manager, config):
        return run(
            manager.handle_response(
                403, {"cf-ray": "ray-1"}, "blocked", config
            )
        )

    def test_delay_is_doubled_only_once_per_waf_name(self):
        manager = WAFManager()
        config = FakeConfig(2000, 4000)

        first = self._cloudflare_response(manager, config)
        self.assertTrue(first)
        self.assertEqual(config.delay_min, 4000)
        self.assertEqual(config.delay_max, 8000)
        self.assertEqual(manager.consecutive_blocks, 1)
        self.assertTrue(manager.throttled)
        self.assertTrue(manager.delay_doubled)
        self.assertEqual(len(self.sleeps), 1)

        # Further consecutive blocks must never grow the delay again.
        for expected_blocks in range(2, 7):
            result = self._cloudflare_response(manager, config)
            self.assertTrue(result)
            self.assertEqual(manager.consecutive_blocks, expected_blocks)
            self.assertEqual(config.delay_min, 4000)
            self.assertEqual(config.delay_max, 8000)

        self.assertEqual(
            len(self.sleeps), 1, "no additional backoff sleep should occur"
        )

    def test_delay_floor_applied_on_first_doubling(self):
        manager = WAFManager()
        config = FakeConfig(10, 20)

        self._cloudflare_response(manager, config)
        self.assertEqual(config.delay_min, 3000)
        self.assertEqual(config.delay_max, 6000)

    def test_clean_response_resets_streak_and_throttling(self):
        manager = WAFManager()
        config = FakeConfig(2000, 4000)

        self._cloudflare_response(manager, config)
        self.assertEqual(manager.consecutive_blocks, 1)
        self.assertTrue(manager.throttled)
        self.assertTrue(manager.delay_doubled)

        clean = run(
            manager.handle_response(200, {}, "all good", config)
        )
        self.assertFalse(clean)
        self.assertEqual(manager.consecutive_blocks, 0)
        self.assertFalse(manager.throttled)
        self.assertFalse(manager.delay_doubled)

        # A new streak after the gap is allowed to double once again.
        self._cloudflare_response(manager, config)
        self.assertEqual(manager.consecutive_blocks, 1)
        self.assertEqual(config.delay_min, 8000)
        self.assertEqual(config.delay_max, 16000)
        self.assertTrue(manager.delay_doubled)

    def test_switching_waf_name_allows_one_new_doubling(self):
        manager = WAFManager()
        config = FakeConfig(2000, 4000)

        self._cloudflare_response(manager, config)
        self.assertEqual(config.delay_min, 4000)
        self.assertEqual(config.delay_max, 8000)
        self.assertEqual(manager.detected_waf, "Cloudflare")

        # More Cloudflare blocks do not change the delay.
        self._cloudflare_response(manager, config)
        self._cloudflare_response(manager, config)
        self.assertEqual(config.delay_min, 4000)
        self.assertEqual(config.delay_max, 8000)
        self.assertEqual(manager.consecutive_blocks, 3)

        # A different WAF answers: exactly one new doubling is permitted.
        akamai = run(
            manager.handle_response(
                403,
                {"x-akamai-transformed": "1"},
                "access denied",
                config,
            )
        )
        self.assertTrue(akamai)
        self.assertEqual(manager.detected_waf, "Akamai")
        self.assertEqual(config.delay_min, 8000)
        self.assertEqual(config.delay_max, 16000)
        self.assertTrue(manager.delay_doubled)
        # The block streak is preserved across the WAF-name switch.
        self.assertEqual(manager.consecutive_blocks, 4)

        # Repeated blocks under the new WAF do not double again.
        run(
            manager.handle_response(
                403,
                {"x-akamai-transformed": "1"},
                "access denied",
                config,
            )
        )
        self.assertEqual(config.delay_min, 8000)
        self.assertEqual(config.delay_max, 16000)

    def test_no_config_still_sleeps_but_cannot_touch_delays(self):
        manager = WAFManager()
        result = run(
            manager.handle_response(403, {"cf-ray": "r"}, "blocked", None)
        )
        self.assertTrue(result)
        self.assertEqual(manager.consecutive_blocks, 1)
        self.assertFalse(manager.throttled)
        self.assertFalse(manager.delay_doubled)
        self.assertEqual(self.sleeps, [2])

    def test_backoff_sleep_duration_is_bounded(self):
        manager = WAFManager()
        config = FakeConfig(100, 200)
        with mock.patch(
            "detection.waf.asyncio.sleep",
            new=mock.AsyncMock(side_effect=self.sleeps.append),
        ):
            self._cloudflare_response(manager, config)
        self.assertEqual(self.sleeps, [3])  # min(2 + 1 block, 8)

    def test_second_streak_without_gap_does_not_redouble_same_waf(self):
        manager = WAFManager()
        config = FakeConfig(2000, 4000)

        self._cloudflare_response(manager, config)
        self._cloudflare_response(manager, config)
        self.assertEqual(config.delay_min, 4000)
        self.assertEqual(config.delay_max, 8000)

        # No clean response in between: the same WAF may never double again.
        for _ in range(5):
            self._cloudflare_response(manager, config)
        self.assertEqual(config.delay_min, 4000)
        self.assertEqual(config.delay_max, 8000)


if __name__ == "__main__":
    unittest.main()
