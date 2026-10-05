import unittest
from unittest.mock import patch

from app.services.trend_analysis_service import analyze_cognitive_load_trend


def _window(
    minute_index,
    label,
    score,
    *,
    pauses=0,
    seeks=0,
    rewatches=0,
    speed_changes=0,
    idle=0,
    content=120,
):
    return {
        "student_id": "S001",
        "lesson_id": "L001",
        "session_id": "SESSION-1",
        "minute_index": minute_index,
        "predicted_cognitive_load": label,
        "predicted_score": score,
        "pause_frequency": pauses,
        "navigation_count_video": seeks,
        "rewatch_segments": rewatches,
        "playback_rate_change": speed_changes,
        "idle_duration_video": idle,
        "time_on_content": content,
    }


class TrendAnalysisServiceTest(unittest.TestCase):
    def _analyze(self, rows):
        with patch(
            "app.services.trend_analysis_service.get_student_lesson_prediction_windows",
            return_value=rows,
        ):
            return analyze_cognitive_load_trend("S001", "L001")

    def test_rising_high_load_has_high_risk(self):
        result = self._analyze(
            [
                _window(1, "Low", 2),
                _window(2, "Medium", 3),
                _window(3, "High", 4, pauses=5, rewatches=3),
            ]
        )

        self.assertEqual(result.trend, "rising")
        self.assertEqual(result.risk_level, "high")

    def test_decreasing_load_has_moderate_risk(self):
        result = self._analyze(
            [
                _window(1, "Very High", 5),
                _window(2, "High", 4),
                _window(3, "Medium", 3, idle=70, content=80),
            ]
        )

        self.assertEqual(result.trend, "decreasing")
        self.assertEqual(result.risk_level, "moderate")

    def test_stable_low_load_has_low_risk(self):
        result = self._analyze(
            [
                _window(1, "Low", 2),
                _window(2, "Low", 2),
                _window(3, "Low", 2),
            ]
        )

        self.assertEqual(result.trend, "stable")
        self.assertEqual(result.risk_level, "low")


if __name__ == "__main__":
    unittest.main()
