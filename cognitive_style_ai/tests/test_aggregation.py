import unittest

from services.explanation_service import aggregate_top_features


class AggregateTopFeaturesTests(unittest.TestCase):
    def test_combines_normalized_lime_and_shap_and_returns_three(self):
        lime = [
            {"feature": "focus", "value": 0.8, "weight": 4.0},
            {"feature": "speed", "value": 2.0, "weight": -1.0},
            {"feature": "pauses", "value": 3.0, "weight": 2.0},
            {"feature": "accuracy", "value": 0.9, "weight": 0.5},
        ]
        shap = [
            {"feature": "focus", "value": 0.8, "shap_value": 1.0},
            {"feature": "speed", "value": 2.0, "shap_value": -4.0},
            {"feature": "pauses", "value": 3.0, "shap_value": 2.0},
            {"feature": "accuracy", "value": 0.9, "shap_value": 0.2},
        ]

        result = aggregate_top_features(lime, shap)

        self.assertEqual(3, len(result))
        self.assertEqual({"focus", "speed", "pauses"}, {item["feature"] for item in result})
        self.assertEqual("negative", next(item for item in result if item["feature"] == "speed")["direction"])
        self.assertGreaterEqual(result[0]["importance"], result[1]["importance"])


if __name__ == "__main__":
    unittest.main()
