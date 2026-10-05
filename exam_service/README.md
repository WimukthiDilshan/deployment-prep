# Exam service

The exam service accepts lecture PDFs and presentations. PDF uploads are processed with
PyMuPDF before the material is committed to MySQL:

- repeated page headers and footers are removed;
- page-number-only lines in page margins are removed;
- remaining lecture notes are split into overlapping, page-aware chunks;
- pages without an embedded text layer use Tesseract OCR before chunking;
- embedded images are deduplicated and stored as binary data with page metadata.

## Setup

```powershell
npm install
python -m pip install -r requirements.txt
Copy-Item .env.example .env
npm start
```

Chunk size and overlap can be configured with `PDF_CHUNK_SIZE` and
`PDF_CHUNK_OVERLAP`. Existing databases are migrated automatically at startup.

Run the extraction test with:

```powershell
npm run test:pdf
```

Install Tesseract OCR for scanned/image-only PDFs and either add `tesseract` to
`PATH` or set `TESSERACT_EXECUTABLE`. Existing uploaded PDFs with no chunks can
be repaired after OCR is installed:

```bash
npm run backfill:ocr -- --dry-run
npm run backfill:ocr
npm run backfill:ocr -- --material-ids=8,9,10
```

## Extracted content endpoints

- `GET /materials/:id/content` returns text chunks and image metadata.
- `GET /materials/:id/images/:imageId` returns one extracted image.

Both endpoints require the same `x-teacher-id` ownership header as the existing
material routes. The backend gateway exposes them under `/api/exam`.

## Gemini exam generation

`POST /quizzes/generate` loads extracted chunks for the selected lesson and asks
Gemini for exactly ten JSON-schema-constrained MCQs. The service also validates the
question count, answer count, correct-answer labels, and duplicates before saving.
Correct answers remain in MySQL and
are not returned with the generated questions. `POST /quizzes/:id/check` accepts
all ten answers and returns the score, correct choices, and explanations.

Configure `GEMINI_API_KEY`, model, timeout, output limit, and lecture-context
size through the `GEMINI_*` entries in `.env.example`.
