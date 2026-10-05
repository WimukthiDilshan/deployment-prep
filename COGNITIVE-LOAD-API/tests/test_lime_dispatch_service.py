from datetime import datetime
import unittest
from unittest.mock import patch

from app.services.lime_dispatch_service import (
    dispatch_saved_feature_window_to_lime,
    process_completed_windows_for_event,
)


class LimeDispatchServiceTest(unittest.TestCase):
    def test_event_without_session_id_skips_auto_dispatch(self):
        result = process_completed_windows_for_event(
            {
                "student_id": "S001",
                "lesson_id": "L001",
            }
        )

        self.assertFalse(result["enabled"])
        self.assertEqual(result["processed_windows"], [])

    def test_only_completed_two_minute_windows_are_processed(self):
        first_event_time = datetime(2026, 8, 30, 10, 0, 0)
        last_event_time = datetime(2026, 8, 30, 10, 5, 0)

        with patch(
            "app.services.lime_dispatch_service.get_event_time_bounds",
            return_value={
                "first_event_time": first_event_time,
                "last_event_time": last_event_time,
            },
        ), patch(
            "app.services.lime_dispatch_service.get_latest_successful_dispatch_end",
            return_value=None,
        ), patch(
            "app.services.lime_dispatch_service._process_window",
            side_effect=[
                {"minute_index": 1, "status": "success"},
                {"minute_index": 2, "status": "success"},
            ],
        ) as process_window:
            result = process_completed_windows_for_event(
                {
                    "student_id": "S001",
                    "lesson_id": "L001",
                    "session_id": "SESSION-1",
                }
            )

        self.assertTrue(result["enabled"])
        self.assertEqual(len(result["processed_windows"]), 2)
        self.assertEqual(process_window.call_count, 2)

    def test_duplicate_saved_window_is_not_sent_to_lime_again(self):
        feature_window_data = {
            "student_id": "S001",
            "lesson_id": "L001",
            "session_id": "SESSION-1",
            "minute_index": 1,
            "window_start": datetime(2026, 8, 30, 10, 0, 0),
            "window_end": datetime(2026, 8, 30, 10, 2, 0),
        }

        with patch(
            "app.services.lime_dispatch_service.has_successful_feature_window_dispatch",
            return_value=True,
        ), patch(
            "app.services.lime_dispatch_service._post_feature_window_to_lime"
        ) as post_to_lime, patch(
            "app.services.lime_dispatch_service.save_feature_window_dispatch"
        ) as save_dispatch:
            result = dispatch_saved_feature_window_to_lime(10, feature_window_data)

        self.assertEqual(result["status"], "skipped")
        post_to_lime.assert_not_called()
        save_dispatch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
