import unittest
from types import SimpleNamespace

from app.services.prediction_service import (
    _storage_float,
    _storage_int,
    check_prediction_reliability,
    normalize_prediction_value,
)


def _input(**overrides):
    data = {
        "pause_frequency": 1,
        "navigation_count_video": 1,
        "rewatch_segments": 0,
        "playback_rate_change": 0,
        "idle_duration_video": 0,
        "paused_duration_video": 0,
        "time_on_content": 120,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class PredictionServiceTest(unittest.TestCase):
    def test_numeric_prediction_is_normalized_to_label_and_score(self):
        label, score = normalize_prediction_value(3)

        self.assertEqual(label, "Medium")
        self.assertEqual(score, 3)

    def test_text_prediction_is_normalized_to_score(self):
        label, score = normalize_prediction_value("High")

        self.assertEqual(label, "High")
        self.assertEqual(score, 4)

    def test_invalid_prediction_becomes_unknown(self):
        label, score = normalize_prediction_value("unexpected")

        self.assertEqual(label, "Unknown")
        self.assertEqual(score, 0)

    def test_reliability_rejects_short_watch_time(self):
        result = check_prediction_reliability(_input(time_on_content=30))

        self.assertFalse(result["reliable"])
        self.assertEqual(result["reason"], "Not enough video watch time in this window")

    def test_reliability_rejects_long_pause_without_activity(self):
        result = check_prediction_reliability(
            _input(
                pause_frequency=1,
                navigation_count_video=0,
                rewatch_segments=0,
                playback_rate_change=0,
                paused_duration_video=80,
            )
        )

        self.assertFalse(result["reliable"])
        self.assertEqual(result["reason"], "Long pause detected with insufficient learning interaction")

    def test_reliability_accepts_enough_learning_activity(self):
        result = check_prediction_reliability(_input())

        self.assertTrue(result["reliable"])
        self.assertEqual(result["reason"], "Enough learning behavior available")

    def test_storage_helpers_handle_empty_and_invalid_values(self):
        self.assertEqual(_storage_int(None), 0)
        self.assertEqual(_storage_int("12.9"), 12)
        self.assertEqual(_storage_int("bad"), 0)
        self.assertEqual(_storage_float("0.456"), 0.46)
        self.assertEqual(_storage_float("bad"), 0.0)


if __name__ == "__main__":
    unittest.main()
