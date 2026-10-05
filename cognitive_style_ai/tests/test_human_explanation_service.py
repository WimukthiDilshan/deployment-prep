import unittest

from services.human_explanation_service import (
    EXPLANATION_PROMPT_VERSION,
    build_explanation_prompt,
    get_cognitive_style_display_name,
)


class HumanExplanationPromptTests(unittest.TestCase):
    def test_prompt_uses_top_three_and_translates_raw_feature_names(self):
        top_features = [
            {"feature": "ImageGazeRatio", "direction": "positive"},
            {"feature": "imageCursorRatio", "direction": "positive"},
            {"feature": "imageScrollRatio", "direction": "negative"},
        ]

        prompt = build_explanation_prompt(
            student_id="1002",
            lesson_id="2001",
            cognitive_style="Visual",
            confidence=0.71,
            top_features=top_features,
        )

        self.assertIn("1. how much viewing time", prompt)
        self.assertIn("2. how strongly cursor activity", prompt)
        self.assertIn("3. how strongly scrolling activity", prompt)
        self.assertIn("supports the Visual result", prompt)
        self.assertIn("slightly opposes the Visual result", prompt)
        self.assertNotIn("ImageGazeRatio", prompt)
        self.assertIn(EXPLANATION_PROMPT_VERSION, prompt)
        self.assertIn("non-technical teacher", prompt)
        self.assertIn("Explain only why this style was selected", prompt)
        self.assertIn("do not tell the teacher or student what to do next", prompt)
        self.assertNotIn("may benefit from", prompt)

    def test_intermediate_model_label_is_teacher_friendly(self):
        prompt = build_explanation_prompt(
            student_id="1002",
            lesson_id="2001",
            cognitive_style="Moderate/Intermediatory",
            confidence=0.64,
            top_features=[{"feature": "ImageGazeRatio", "direction": "positive"}],
        )

        self.assertEqual(get_cognitive_style_display_name("Moderate/Intermediatory"), "Intermediate")
        self.assertIn("Predicted cognitive style: Intermediate", prompt)
        self.assertIn("Start exactly with: This student shows an intermediate cognitive style because", prompt)
        self.assertNotIn("predominantly moderate/intermediatory", prompt)


if __name__ == "__main__":
    unittest.main()
