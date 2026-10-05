const { spawn } = require("child_process");
const path = require("path");
const { filterWhisperNoise } = require("./whisperNoise.service");

const PPT_THRESHOLD = 0.70;
const PDF_THRESHOLD = 0.58;
const VIDEO_THRESHOLD = 0.62;
const VIDEO_INTRA_THRESHOLD = 0.70;
const THRESHOLD = VIDEO_THRESHOLD;
const MIN_CHARS = 40;
const MAX_TRANSCRIPT_CHUNKS = 280;
const QUOTE_RE = /"([^"]{12,})"/g;
const PAGE_MARK_RE = /\s*--\s*\d+\s+of\s+\d+\s*--/g;

function collectParts(text) {
  const cleaned = String(text || "").trim().replace(PAGE_MARK_RE, "\n");
  const quoted = [...cleaned.matchAll(QUOTE_RE)].map((m) => m[1].trim()).filter(Boolean);
  if (quoted.length >= 2) {
    const remainder = cleaned.replace(QUOTE_RE, " ");
    return [...quoted, ...remainder.split(/(?<=[.!?])\s+|\n+/)];
  }
  return cleaned.split(/(?<=[.!?])(?:\s+|["”]+\s*,\s*)|\n+/);
}

function splitChunks(text) {
  const chunks = [];
  let buf = "";
  for (const part of collectParts(text)) {
    const piece = String(part || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[,;"']+|[,;"']+$/g, "");
    if (!piece) continue;
    if (piece.length < MIN_CHARS) {
      buf = `${buf} ${piece}`.trim();
      if (buf.length >= MIN_CHARS) {
        chunks.push(buf);
        buf = "";
      }
      continue;
    }
    chunks.push(buf ? `${buf} ${piece}`.trim() : piece);
    buf = "";
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function isMathChunk(text) {
  const sample = String(text || "").trim();
  return sample.startsWith("$$") || (sample.startsWith("$") && sample.endsWith("$"));
}

function splitMathAware(text) {
  const source = String(text || "");
  const chunks = [];
  let last = 0;
  const mathRe = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g;
  for (const match of source.matchAll(mathRe)) {
    const index = match.index || 0;
    chunks.push(...splitChunks(source.slice(last, index)));
    const mathChunk = String(match[0] || "").trim();
    if (mathChunk) chunks.push(mathChunk);
    last = index + match[0].length;
  }
  chunks.push(...splitChunks(source.slice(last)));
  return chunks;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function maxCosine(vec, others) {
  let best = 0;
  for (const other of others) {
    best = Math.max(best, cosine(vec, other));
  }
  return best;
}

function lexicalEmbeddings(texts) {
  const docs = texts.map(tokenize);
  const vocab = new Map();
  for (const tokens of docs) {
    for (const t of tokens) {
      if (!vocab.has(t)) vocab.set(t, vocab.size);
    }
  }
  const dim = Math.max(vocab.size, 1);
  return docs.map((tokens) => {
    const vec = new Array(dim).fill(0);
    for (const t of tokens) vec[vocab.get(t)] += 1;
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
    return vec.map((x) => x / norm);
  });
}

function downsample(chunks, limit) {
  if (chunks.length <= limit) return chunks;
  const head = Math.max(1, Math.floor(limit / 3));
  const tail = Math.max(1, Math.floor(limit / 3));
  const mid = limit - head - tail;
  const start = chunks.slice(0, head);
  const end = chunks.slice(-tail);
  const rest = chunks.slice(head, chunks.length - tail);
  const step = Math.max(1, Math.floor(rest.length / Math.max(mid, 1)));
  const middle = rest.filter((_, i) => i % step === 0).slice(0, mid);
  return [...start, ...middle, ...end];
}

function lexicalDedupe({ pptText, pdfText, transcriptText, protectMath = false }) {
  const splitter = protectMath ? splitMathAware : splitChunks;
  const groups = [
    ["ppt", splitter(pptText)],
    ["pdf", splitter(pdfText)],
    ["video", downsample(splitter(transcriptText), MAX_TRANSCRIPT_CHUNKS)],
  ];
  const items = [];
  for (const [source, chunks] of groups) {
    for (const text of chunks) items.push({ source, text, math: protectMath && isMathChunk(text) });
  }
  if (!items.length) {
    return {
      ppt: "",
      pdf: "",
      transcript: "",
      stats: {
        method: "none",
        inputChunks: 0,
        kept: 0,
        dropped: 0,
        threshold: VIDEO_THRESHOLD,
        protectMath: Boolean(protectMath),
      },
    };
  }

  const vectors = lexicalEmbeddings(items.map((item) => item.text));
  const slideVectors = items
    .map((item, index) => (item.source === "ppt" || item.source === "pdf" ? vectors[index] : null))
    .filter(Boolean);
  const keptPpt = [];
  const keptPdf = [];
  const keptVideo = [];
  const kept = { ppt: [], pdf: [], video: [] };
  let dropped = 0;

  items.forEach((item, index) => {
    const vec = vectors[index];
    if (!item.math) {
      if (item.source === "ppt") {
        if (maxCosine(vec, keptPpt) >= PPT_THRESHOLD) {
          dropped += 1;
          return;
        }
        keptPpt.push(vec);
      } else if (item.source === "pdf") {
        if (maxCosine(vec, [...keptPpt, ...keptPdf]) >= PDF_THRESHOLD) {
          dropped += 1;
          return;
        }
        keptPdf.push(vec);
      } else if (
        maxCosine(vec, slideVectors) >= VIDEO_THRESHOLD ||
        maxCosine(vec, keptVideo) >= VIDEO_INTRA_THRESHOLD
      ) {
        dropped += 1;
        return;
      } else {
        keptVideo.push(vec);
      }
    }
    kept[item.source].push(item.text);
  });

  return {
    ppt: kept.ppt.join("\n\n"),
    pdf: kept.pdf.join("\n\n"),
    transcript: kept.video.join("\n\n"),
    stats: {
      method: "lexical_tf_cosine_fallback",
      inputChunks: items.length,
      kept: items.length - dropped,
      dropped,
      keptPpt: kept.ppt.length,
      keptPdf: kept.pdf.length,
      keptVideo: kept.video.length,
      pptThreshold: PPT_THRESHOLD,
      pdfThreshold: PDF_THRESHOLD,
      videoThreshold: VIDEO_THRESHOLD,
      protectMath: Boolean(protectMath),
    },
  };
}

function parseJsonPayload(raw) {
  const text = String(raw || "").trim();
  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.lastIndexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Invalid semantic dedupe response");
  }
}

function runPythonDedupe(payload) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
    const scriptPath = path.join(__dirname, "..", "python", "dedupe_extracts.py");
    const child = spawn(pythonExecutable, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Semantic dedupe timed out"));
    }, 120000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || "Semantic dedupe process failed"));
        return;
      }
      try {
        resolve(parseJsonPayload(stdout));
      } catch (_) {
        reject(new Error("Invalid semantic dedupe response"));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

/**
 * Deduplicate PPT / PDF / transcript without changing original extracts.
 * Prefers SBERT MiniLM; falls back to lexical cosine so uploads never fail.
 */
async function dedupeSubsectionExtracts({
  pptText = "",
  pdfText = "",
  transcriptText = "",
  protectMath = false,
}) {
  const payload = {
    pptText,
    pdfText,
    transcriptText: filterWhisperNoise(transcriptText),
    protectMath: Boolean(protectMath),
  };

  try {
    const result = await runPythonDedupe(payload);
    if (result && typeof result === "object") {
      console.log("[semantic-dedupe]", result.stats || result);
      return result;
    }
  } catch (err) {
    console.warn(
      "[semantic-dedupe] SBERT unavailable, using lexical fallback:",
      err.message
    );
  }

  const fallback = lexicalDedupe(payload);
  console.log("[semantic-dedupe]", fallback.stats);
  return fallback;
}

module.exports = {
  dedupeSubsectionExtracts,
  THRESHOLD,
};
