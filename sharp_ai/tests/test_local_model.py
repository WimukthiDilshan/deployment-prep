import unittest

from services.local_model import FEATURE_NAMES, predict_scores


class LocalCognitiveLoadModelTests(unittest.TestCase):
    def test_predicts_a_matrix_in_one_batch_with_api_compatible_rounding(self):
        scores = predict_scores(
            [
                [3, 4, 2, 1, 10, 180],
                [2.4, 4.6, 1.5, 0.2, 12.2, 170.8],
            ]
        )

        self.assertEqual(6, len(FEATURE_NAMES))
        self.assertEqual([4.0, 4.0], scores.tolist())


if __name__ == "__main__":
    unittest.main()
