import unittest

import numpy as np

from services.model_client import BatchPredictor, get_model_metadata


EXPECTED_FEATURES = [
    "imageCursorRatio",
    "imageScrollRatio",
    "ImageGazeRatio",
    "FirstInteractionPreference_VISUAL",
]

EXPECTED_CLASSES = {"Visual", "Verbal", "Moderate/Intermediatory"}


class ReplacementModelIntegrationTests(unittest.TestCase):
    def test_loads_real_svm_artifact_and_returns_three_class_probabilities(self):
        feature_names, classes = get_model_metadata()

        self.assertEqual(EXPECTED_FEATURES, feature_names)
        self.assertEqual(EXPECTED_CLASSES, set(classes))

        probabilities = BatchPredictor(feature_names, classes).probabilities(
            [[0.5, 0.5, 0.5, 0.0]]
        )

        self.assertEqual((1, 3), probabilities.shape)
        self.assertTrue(np.isfinite(probabilities).all())
        self.assertAlmostEqual(1.0, float(probabilities[0].sum()), places=6)


if __name__ == "__main__":
    unittest.main()
