"""Extract embedded images from a PDF using PyMuPDF.

Writes PNG files into the output directory and prints JSON metadata on stdout.
Tiny decorative graphics are skipped. Duplicate images are stored once.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

MIN_SIDE = 32
MIN_BYTES = 2048
MAX_IMAGES = 40


def pixmap_png(document, xref: int):
    import pymupdf

    pix = pymupdf.Pixmap(document, xref)
    try:
        if pix.width < MIN_SIDE or pix.height < MIN_SIDE:
            return None
        if pix.n - pix.alpha > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        data = pix.tobytes("png")
        if not data or len(data) < MIN_BYTES:
            return None
        return data, int(pix.width), int(pix.height)
    finally:
        pix = None


def extract(pdf_path: Path, output_dir: Path) -> dict:
    import pymupdf

    output_dir.mkdir(parents=True, exist_ok=True)
    images: list[dict] = []
    seen: set[str] = set()

    with pymupdf.open(pdf_path) as document:
        if document.needs_pass:
            raise ValueError("Password-protected PDFs are not supported.")
        for page_number, page in enumerate(document, start=1):
            for image in page.get_images(full=True):
                if len(images) >= MAX_IMAGES:
                    break
                xref = image[0]
                try:
                    converted = pixmap_png(document, xref)
                except Exception:
                    continue
                if not converted:
                    continue
                data, width, height = converted
                digest = hashlib.sha256(data).hexdigest()
                if digest in seen:
                    continue
                seen.add(digest)
                file_name = f"pdf-page-{page_number}-{len(images):04d}.png"
                (output_dir / file_name).write_bytes(data)
                images.append(
                    {
                        "pageNumber": page_number,
                        "fileName": file_name,
                        "filePath": f"pdf/page-{page_number}/xref-{xref}",
                        "mimeType": "image/png",
                        "width": width,
                        "height": height,
                        "byteSize": len(data),
                        "hash": digest,
                    }
                )
            if len(images) >= MAX_IMAGES:
                break

    return {"images": images}


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: extract_pdf_images.py <pdf_path> <output_dir>", file=sys.stderr)
        sys.exit(1)

    try:
        result = extract(Path(sys.argv[1]), Path(sys.argv[2]))
    except ImportError:
        print(
            "Python package 'pymupdf' is not installed. Run: pip install pymupdf",
            file=sys.stderr,
        )
        sys.exit(1)

    json.dump(result, sys.stdout, ensure_ascii=True)


if __name__ == "__main__":
    main()
