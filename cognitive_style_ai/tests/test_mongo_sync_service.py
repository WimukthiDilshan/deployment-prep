import unittest

from services.mongo_sync_service import _feature_values, _fingerprint


class MongoSyncServiceTests(unittest.TestCase):
    def test_builds_the_exact_visual_verbal_model_inputs(self):
        cursor = {"_id": "cursor-1", "imageCursorRatio": 0.7, "imageScrollRatio": 0.8}
        gaze = {"_id": "gaze-1", "ImageGazeRatio": 0.75, "FirstInteractionPreference": "VISUAL"}

        features = _feature_values(cursor, gaze)

        self.assertEqual(
            {
                "imageCursorRatio": 0.7,
                "imageScrollRatio": 0.8,
                "ImageGazeRatio": 0.75,
                "FirstInteractionPreference_VISUAL": 1.0,
            },
            features,
        )

    def test_source_fingerprint_changes_when_a_mongo_document_changes(self):
        features = {
            "imageCursorRatio": 0.7,
            "imageScrollRatio": 0.8,
            "ImageGazeRatio": 0.75,
            "FirstInteractionPreference_VISUAL": 1.0,
        }

        first = _fingerprint({"_id": "cursor-1"}, {"_id": "gaze-1"}, features)
        second = _fingerprint({"_id": "cursor-2"}, {"_id": "gaze-1"}, features)

        self.assertNotEqual(first, second)
        self.assertEqual(64, len(first))


if __name__ == "__main__":
    unittest.main()
