"""Reconstruct lecture text and math-like notation from a PDF.

Uses PyMuPDF span geometry for superscripts/subscripts and a Unicode-to-LaTeX
map so educator formulas survive as $...$ / $$...$$ blocks.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

UNICODE_LATEX = {
    "α": r"\alpha",
    "β": r"\beta",
    "γ": r"\gamma",
    "δ": r"\delta",
    "ε": r"\varepsilon",
    "ζ": r"\zeta",
    "η": r"\eta",
    "θ": r"\theta",
    "ι": r"\iota",
    "κ": r"\kappa",
    "λ": r"\lambda",
    "μ": r"\mu",
    "ν": r"\nu",
    "ξ": r"\xi",
    "π": r"\pi",
    "ρ": r"\rho",
    "σ": r"\sigma",
    "τ": r"\tau",
    "υ": r"\upsilon",
    "φ": r"\phi",
    "χ": r"\chi",
    "ψ": r"\psi",
    "ω": r"\omega",
    "Γ": r"\Gamma",
    "Δ": r"\Delta",
    "Θ": r"\Theta",
    "Λ": r"\Lambda",
    "Ξ": r"\Xi",
    "Π": r"\Pi",
    "Σ": r"\Sigma",
    "Φ": r"\Phi",
    "Ψ": r"\Psi",
    "Ω": r"\Omega",
    "∂": r"\partial",
    "∇": r"\nabla",
    "∑": r"\sum",
    "∏": r"\prod",
    "∫": r"\int",
    "∮": r"\oint",
    "√": r"\sqrt",
    "∞": r"\infty",
    "±": r"\pm",
    "∓": r"\mp",
    "×": r"\times",
    "÷": r"\div",
    "·": r"\cdot",
    "≤": r"\leq",
    "≥": r"\geq",
    "≠": r"\neq",
    "≈": r"\approx",
    "≡": r"\equiv",
    "∈": r"\in",
    "∉": r"\notin",
    "⊂": r"\subset",
    "⊆": r"\subseteq",
    "∪": r"\cup",
    "∩": r"\cap",
    "∧": r"\land",
    "∨": r"\lor",
    "¬": r"\neg",
    "∀": r"\forall",
    "∃": r"\exists",
    "→": r"\rightarrow",
    "←": r"\leftarrow",
    "↔": r"\leftrightarrow",
    "⇒": r"\Rightarrow",
    "⇔": r"\Leftrightarrow",
    "′": r"^{\prime}",
    "°": r"^{\circ}",
    "ℝ": r"\mathbb{R}",
    "ℕ": r"\mathbb{N}",
    "ℤ": r"\mathbb{Z}",
    "ℚ": r"\mathbb{Q}",
    "ℂ": r"\mathbb{C}",
    "ℓ": r"\ell",
    "ħ": r"\hbar",
    "⟨": r"\langle",
    "⟩": r"\rangle",
}

MATH_HINT = re.compile(
    r"[\\^_{}=≤≥≠±∞∑∫∏√∂∇α-ωΑ-Ω∈∉⊂⊃∪∩→←⇒∀∃]|\\frac|\\sum|\\int|\\partial"
)
WORD_RE = re.compile(r"[A-Za-z]{3,}")


def unicode_to_latex(text: str) -> str:
    return "".join(UNICODE_LATEX.get(ch, ch) for ch in str(text or ""))


def span_script(span: dict, base_size: float, base_y: float) -> str:
    text = unicode_to_latex(span.get("text") or "")
    if not text:
        return ""
    size = float(span.get("size") or base_size or 11)
    origin = span.get("origin") or [0, 0]
    y = float(origin[1] if len(origin) > 1 else 0)
    dy = base_y - y
    stripped = text.strip()
    if not stripped:
        return text
    if size <= base_size * 0.88 and dy > base_size * 0.12:
        return f"^{{{stripped}}}"
    if size <= base_size * 0.88 and dy < -base_size * 0.06:
        return f"_{{{stripped}}}"
    return text


def line_to_text(line: dict) -> str:
    spans = line.get("spans") or []
    if not spans:
        return ""
    sizes = [float(span.get("size") or 0) for span in spans]
    base_size = max(sizes) if sizes else 11.0
    largest = max(spans, key=lambda span: float(span.get("size") or 0))
    origin = largest.get("origin") or [0, 0]
    base_y = float(origin[1] if len(origin) > 1 else 0)
    return "".join(span_script(span, base_size, base_y) for span in spans).strip()


def looks_like_math(text: str) -> bool:
    sample = text.strip()
    if len(sample) < 2:
        return False
    if sample.startswith("$"):
        return False
    words = WORD_RE.findall(sample)
    hints = len(MATH_HINT.findall(sample))
    if hints >= 2 and len(words) <= 8:
        return True
    if re.search(r"[_^]|\\frac|\\sum|\\int|\\partial|\\nabla", sample) and len(words) <= 12:
        return True
    return False


def wrap_math_line(text: str) -> str:
    sample = text.strip()
    if not sample:
        return ""
    if sample.startswith("$"):
        return sample
    if looks_like_math(sample):
        if "\\frac" in sample or "\\sum" in sample or "\\int" in sample or len(sample) > 24:
            return f"$$\n{sample}\n$$"
        return f"${sample}$"
    return sample


def collect_equations(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r"\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$", text):
        latex = (match.group(1) or match.group(2) or "").strip()
        if latex and latex not in seen:
            seen.add(latex)
            found.append(latex)
    return found


def extract(pdf_path: Path) -> dict:
    import fitz

    document = fitz.open(pdf_path)
    pages: list[str] = []
    try:
        for page in document:
            payload = page.get_text("dict") or {}
            lines_out: list[str] = []
            for block in payload.get("blocks") or []:
                if block.get("type") != 0:
                    continue
                for line in block.get("lines") or []:
                    rendered = wrap_math_line(line_to_text(line))
                    if rendered:
                        lines_out.append(rendered)
            if lines_out:
                pages.append("\n".join(lines_out))
    finally:
        document.close()

    text = "\n\n".join(pages).strip()
    return {"text": text, "equations": collect_equations(text)}


def main() -> None:
    if len(sys.argv) < 2:
        print("Missing PDF path", file=sys.stderr)
        sys.exit(1)

    try:
        result = extract(Path(sys.argv[1]))
    except ImportError:
        print(
            "Python package 'pymupdf' is not installed. Run: pip install pymupdf",
            file=sys.stderr,
        )
        sys.exit(1)

    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
