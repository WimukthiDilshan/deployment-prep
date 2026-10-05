"""
Semantic near-duplicate removal across PPT, PDF, and video transcript.

Keep order: PPT (canonical slides) -> PDF extras -> spoken extras only.
Uses Sentence-BERT MiniLM when installed; otherwise lexical TF cosine.

Spoken lecture text often paraphrases the slides at MiniLM ~0.50-0.70.
A single 0.70 cutoff therefore kept most of the voice script. Video is
compared against every slide/PDF sentence at a lower threshold so the
knowledge chunk stays extractive (no generated summary) and smaller.
"""
import json
import math
import os
import re
import sys

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

PPT_THRESHOLD = 0.70
PDF_THRESHOLD = 0.58
VIDEO_THRESHOLD = 0.62
VIDEO_INTRA_THRESHOLD = 0.70
MIN_CHARS = 40
MAX_TRANSCRIPT_CHUNKS = 280
QUOTE_RE = re.compile(r'"([^"]{12,})"')
PAGE_MARK_RE = re.compile(r"\s*--\s*\d+\s+of\s+\d+\s*--")
MATH_BLOCK_RE = re.compile(r"\$\$[\s\S]+?\$\$|\$[^$\n]+\$")


def _collect_parts(text):
    cleaned = PAGE_MARK_RE.sub("\n", str(text or "").strip())
    quoted = [q.strip() for q in QUOTE_RE.findall(cleaned) if q.strip()]
    if len(quoted) >= 2:
        remainder = QUOTE_RE.sub(" ", cleaned)
        return quoted + re.split(r"(?<=[.!?])\s+|\n+", remainder)
    return re.split(r'(?<=[.!?])(?:\s+|["”]+\s*,\s*)|\n+', cleaned)


def split_chunks(text):
    chunks = []
    buf = ""
    for part in _collect_parts(text):
        piece = " ".join(str(part or "").split()).strip(" ,;\"'")
        if not piece:
            continue
        if len(piece) < MIN_CHARS:
            buf = (buf + " " + piece).strip()
            if len(buf) >= MIN_CHARS:
                chunks.append(buf)
                buf = ""
            continue
        if buf:
            piece = (buf + " " + piece).strip()
            buf = ""
        chunks.append(piece)
    if buf:
        chunks.append(buf)
    return chunks


def is_math_chunk(text):
    sample = str(text or "").strip()
    return sample.startswith("$$") or (sample.startswith("$") and sample.endswith("$"))


def split_math_aware(text):
    source = str(text or "")
    chunks = []
    last = 0
    for match in MATH_BLOCK_RE.finditer(source):
        before = source[last:match.start()]
        chunks.extend(split_chunks(before))
        math_chunk = match.group(0).strip()
        if math_chunk:
            chunks.append(math_chunk)
        last = match.end()
    chunks.extend(split_chunks(source[last:]))
    return chunks


def tokenize(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def tf_vector(tokens, vocab):
    vec = [0.0] * len(vocab)
    if not tokens or not vocab:
        return vec
    for t in tokens:
        i = vocab.get(t)
        if i is not None:
            vec[i] += 1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def cosine(a, b):
    if not a or not b or len(a) != len(b):
        return 0.0
    return float(sum(x * y for x, y in zip(a, b)))


def max_cosine(vec, others):
    best = 0.0
    for other in others:
        best = max(best, cosine(vec, other))
    return best


def lexical_embeddings(texts):
    docs = [tokenize(t) for t in texts]
    vocab = {}
    for tokens in docs:
        for t in tokens:
            if t not in vocab:
                vocab[t] = len(vocab)
    if not vocab:
        vocab = {"_": 0}
    return [tf_vector(tokens, vocab) for tokens in docs]


def sbert_embeddings(texts):
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("all-MiniLM-L6-v2")
    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [list(map(float, row)) for row in vectors]


def downsample(chunks, limit):
    if len(chunks) <= limit:
        return chunks
    head = max(1, limit // 3)
    tail = max(1, limit // 3)
    mid = limit - head - tail
    start = chunks[:head]
    end = chunks[-tail:]
    rest = chunks[head:-tail]
    step = max(1, len(rest) // max(mid, 1))
    middle = rest[::step][:mid]
    return start + middle + end


def dedupe(ppt_text, pdf_text, transcript_text, threshold=None, protect_math=False):
    splitter = split_math_aware if protect_math else split_chunks
    groups = [
        ("ppt", splitter(ppt_text)),
        ("pdf", splitter(pdf_text)),
        ("video", downsample(splitter(transcript_text), MAX_TRANSCRIPT_CHUNKS)),
    ]
    items = []
    for source, chunks in groups:
        for chunk in chunks:
            items.append(
                {
                    "source": source,
                    "text": chunk,
                    "math": protect_math and is_math_chunk(chunk),
                }
            )

    if not items:
        return {
            "ppt": "",
            "pdf": "",
            "transcript": "",
            "stats": {
                "method": "none",
                "inputChunks": 0,
                "kept": 0,
                "dropped": 0,
                "threshold": VIDEO_THRESHOLD,
                "protectMath": bool(protect_math),
            },
        }

    method = "sbert_minilm"
    try:
        vectors = sbert_embeddings([item["text"] for item in items])
    except Exception:
        method = "lexical_tf_cosine_fallback"
        vectors = lexical_embeddings([item["text"] for item in items])

    slide_vectors = [
        vec
        for item, vec in zip(items, vectors)
        if item["source"] in ("ppt", "pdf")
    ]
    kept_ppt = []
    kept_pdf = []
    kept_video = []
    kept = {"ppt": [], "pdf": [], "video": []}
    dropped = 0

    for item, vec in zip(items, vectors):
        source = item["source"]
        if not item["math"]:
            if source == "ppt":
                if max_cosine(vec, kept_ppt) >= PPT_THRESHOLD:
                    dropped += 1
                    continue
                kept_ppt.append(vec)
            elif source == "pdf":
                if max_cosine(vec, kept_ppt + kept_pdf) >= PDF_THRESHOLD:
                    dropped += 1
                    continue
                kept_pdf.append(vec)
            else:
                against_slides = max_cosine(vec, slide_vectors)
                against_spoken = max_cosine(vec, kept_video)
                if against_slides >= VIDEO_THRESHOLD or against_spoken >= VIDEO_INTRA_THRESHOLD:
                    dropped += 1
                    continue
                kept_video.append(vec)
        kept[source].append(item["text"])

    joiner = "\n\n"
    return {
        "ppt": joiner.join(kept["ppt"]),
        "pdf": joiner.join(kept["pdf"]),
        "transcript": joiner.join(kept["video"]),
        "stats": {
            "method": method,
            "inputChunks": len(items),
            "kept": len(items) - dropped,
            "dropped": dropped,
            "keptPpt": len(kept["ppt"]),
            "keptPdf": len(kept["pdf"]),
            "keptVideo": len(kept["video"]),
            "pptThreshold": PPT_THRESHOLD,
            "pdfThreshold": PDF_THRESHOLD,
            "videoThreshold": VIDEO_THRESHOLD,
            "protectMath": bool(protect_math),
        },
    }


def main():
    payload = json.load(sys.stdin)
    result = dedupe(
        payload.get("pptText") or "",
        payload.get("pdfText") or "",
        payload.get("transcriptText") or "",
        payload.get("threshold"),
        bool(payload.get("protectMath")),
    )
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
