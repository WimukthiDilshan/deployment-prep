import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import fitz


SCRIPT = Path(__file__).resolve().parents[1] / "src" / "python" / "extract_pdf.py"
SPEC = importlib.util.spec_from_file_location("extract_pdf", SCRIPT)
extract_pdf = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(extract_pdf)


class PdfExtractionTests(unittest.TestCase):
    def test_removes_repeated_headers_and_page_numbers_and_extracts_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf_path = root / "lecture.pdf"
            image_path = root / "diagram.png"
            output_path = root / "images"

            pixmap = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 64, 64), False)
            pixmap.clear_with(0x3366CC)
            pixmap.save(image_path)

            document = fitz.open()
            for page_number in range(1, 4):
                page = document.new_page()
                page.insert_text((72, 30), "CS101 - Lecture Notes")
                page.insert_text((72, 120), f"Topic {page_number}", fontsize=16)
                page.insert_textbox(
                    fitz.Rect(72, 160, 520, 480),
                    f"Important lecture explanation for topic {page_number}. " * 18,
                    fontsize=11,
                )
                page.insert_text((290, 820), f"Page {page_number} of 3")
                page.insert_image(fitz.Rect(72, 520, 136, 584), filename=image_path)
            document.save(pdf_path)
            document.close()

            result = extract_pdf.extract(pdf_path, output_path, 300, 40)
            combined_text = " ".join(chunk["content"] for chunk in result["chunks"])

            self.assertEqual(result["pageCount"], 3)
            self.assertNotIn("CS101 - Lecture Notes", combined_text)
            self.assertNotIn("Page 1 of 3", combined_text)
            self.assertIn("Topic 1", combined_text)
            self.assertGreater(len(result["chunks"]), 3)
            self.assertEqual(len(result["images"]), 1)
            self.assertTrue((output_path / result["images"][0]["fileName"]).exists())

            completed = subprocess.run(
                [sys.executable, str(SCRIPT), str(pdf_path), str(root / "cli-images")],
                check=True,
                capture_output=True,
                text=True,
            )
            cli_result = json.loads(completed.stdout)
            self.assertTrue(cli_result["chunks"])

            serialized = extract_pdf.serialize_result({"content": "next ➜ section"})
            serialized.encode("cp1252")
            self.assertEqual(json.loads(serialized)["content"], "next ➜ section")

    @unittest.skipUnless(
        extract_pdf.find_tesseract() or shutil.which("tesseract"),
        "Tesseract OCR is not installed",
    )
    def test_uses_ocr_for_an_image_only_pdf(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = fitz.open()
            source_page = source.new_page(width=595, height=842)
            source_page.insert_text(
                (55, 150),
                "Binary search repeatedly divides a sorted list into smaller halves.",
                fontsize=18,
            )
            source_pixmap = source_page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            source.close()

            scanned = fitz.open()
            scanned_page = scanned.new_page(width=595, height=842)
            scanned_page.insert_image(scanned_page.rect, stream=source_pixmap.tobytes("png"))
            pdf_path = root / "scanned-lecture.pdf"
            scanned.save(pdf_path)
            scanned.close()

            result = extract_pdf.extract(pdf_path, root / "images", 300, 40)
            combined_text = " ".join(chunk["content"] for chunk in result["chunks"])

            self.assertEqual(result["ocrPageCount"], 1)
            self.assertIn("Binary search", combined_text)
            self.assertTrue(result["chunks"])


if __name__ == "__main__":
    unittest.main()
