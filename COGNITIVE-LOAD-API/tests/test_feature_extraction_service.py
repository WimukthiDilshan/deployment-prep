from datetime import datetime
import unittest
from unittest.mock import patch

from app.services.feature_extraction_service import extract_feature_window_from_raw


class FeatureExtractionServiceTest(unittest.TestCase):
    def test_raw_events_are_converted_to_feature_window(self):
        window_start = datetime(2026, 8, 30, 10, 0, 0)
        window_end = datetime(2026, 8, 30, 10, 2, 0)
        events = [
            {"event_type": "pause", "event_time": datetime(2026, 8, 30, 10, 0, 5)},
            {"event_type": "seek_forward", "event_time": datetime(2026, 8, 30, 10, 0, 10)},
            {"event_type": "seek_backward", "event_time": datetime(2026, 8, 30, 10, 0, 20)},
            {"event_type": "rate_change", "event_time": datetime(2026, 8, 30, 10, 0, 25)},
            {"event_type": "idle_start", "event_time": datetime(2026, 8, 30, 10, 0, 30)},
            {"event_type": "idle_end", "event_time": datetime(2026, 8, 30, 10, 0, 50)},
            {"event_type": "adaptation_navigation", "event_time": datetime(2026, 8, 30, 10, 1, 0)},
            {"event_type": "adaptation_revisit", "event_time": datetime(2026, 8, 30, 10, 1, 5)},
            {
                "event_type": "adaptation_idle",
                "event_time": datetime(2026, 8, 30, 10, 1, 10),
                "event_value": "15",
            },
            {
                "event_type": "quiz_submit",
                "event_time": datetime(2026, 8, 30, 10, 1, 20),
                "event_value": "18",
                "is_correct": False,
            },
            {
                "event_type": "quiz_submit",
                "event_time": datetime(2026, 8, 30, 10, 1, 40),
                "event_value": "12",
                "is_correct": True,
            },
        ]
        payload = {
            "student_id": "S001",
            "lesson_id": "L001",
            "session_id": "SESSION-1",
            "minute_index": 1,
            "window_start": window_start,
            "window_end": window_end,
        }

        with patch(
            "app.services.feature_extraction_service.get_raw_interaction_events",
            return_value=events,
        ):
            result = extract_feature_window_from_raw(payload)

        self.assertEqual(result["pause_frequency"], 1)
        self.assertEqual(result["navigation_count_video"], 1)
        self.assertEqual(result["rewatch_segments"], 1)
        self.assertEqual(result["playback_rate_change"], 1)
        self.assertEqual(result["idle_duration_video"], 20)
        self.assertEqual(result["time_on_content"], 100)
        self.assertEqual(result["navigation_count_adaptation"], 1)
        self.assertEqual(result["revisit_frequency"], 1)
        self.assertEqual(result["idle_duration_adaptation"], 15)
        self.assertEqual(result["quiz_response_time"], 12)
        self.assertEqual(result["error_rate"], 0.5)
        self.assertEqual(result["raw_event_count"], len(events))

    def test_open_idle_period_is_capped_at_window_end(self):
        window_start = datetime(2026, 8, 30, 10, 0, 0)
        window_end = datetime(2026, 8, 30, 10, 2, 0)
        events = [
            {"event_type": "idle_start", "event_time": datetime(2026, 8, 30, 10, 1, 30)},
        ]
        payload = {
            "student_id": "S001",
            "lesson_id": "L001",
            "session_id": "SESSION-1",
            "minute_index": 1,
            "window_start": window_start,
            "window_end": window_end,
        }

        with patch(
            "app.services.feature_extraction_service.get_raw_interaction_events",
            return_value=events,
        ):
            result = extract_feature_window_from_raw(payload)

        self.assertEqual(result["idle_duration_video"], 30)
        self.assertEqual(result["time_on_content"], 90)


if __name__ == "__main__":
    unittest.main()
