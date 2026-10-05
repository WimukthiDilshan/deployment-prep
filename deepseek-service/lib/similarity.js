const axios = require("axios");

/**
 * Faithfulness via embedding cosine similarity
 * --------------------------------------------
 * Idea: embed(source) and embed(output), then cosine similarity.
 * High similarity ⇒ output stays close to the source (less hallucination risk).
 *
 * Strategy:
 *  1) Prefer remote sentence embeddings (Hugging Face) when HF_API_TOKEN is set.
 *  2) If that fails, fall back to a sparse TF-IDF-style bag-of-words embedding
 *     so ranking never crashes (defense-friendly graceful degradation).
 */

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Sparse lexical embedding (TF over shared vocabulary) used as fallback. */
function buildSparseVectors(texts) {
  const docs = texts.map(tokenize);
  const vocab = new Map();
  for (const tokens of docs) {
    for (const t of tokens) {
      if (!vocab.has(t)) vocab.set(t, vocab.size);
    }
  }
  const dim = Math.max(vocab.size, 1);
  const vectors = docs.map((tokens) => {
    const vec = new Array(dim).fill(0);
    if (!tokens.length) return vec;
    for (const t of tokens) {
      vec[vocab.get(t)] += 1;
    }
    // L2-normalize so cosine is well-behaved
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
    return vec.map((x) => x / norm);
  });
  return vectors;
}

function meanPool(matrix) {
  // HF feature-extraction may return [tokens][dims] or [dims]
  if (!Array.isArray(matrix) || matrix.length === 0) return null;
  if (typeof matrix[0] === "number") return matrix;
  if (Array.isArray(matrix[0]) && typeof matrix[0][0] === "number") {
    const dims = matrix[0].length;
    const out = new Array(dims).fill(0);
    for (const row of matrix) {
      for (let i = 0; i < dims; i += 1) out[i] += row[i];
    }
    return out.map((v) => v / matrix.length);
  }
  // Sometimes nested one more level: [batch][tokens][dims]
  if (Array.isArray(matrix[0]?.[0]) && typeof matrix[0][0][0] === "number") {
    return meanPool(matrix[0]);
  }
  return null;
}

async function embedWithHuggingFace(texts) {
  const token = String(process.env.HF_API_TOKEN || "").trim();
  if (!token) {
    const err = new Error("HF_API_TOKEN not configured for embeddings.");
    err.code = "NO_HF_TOKEN";
    throw err;
  }

  const model =
    String(process.env.HF_EMBEDDING_MODEL || "").trim() ||
    "sentence-transformers/all-MiniLM-L6-v2";

  // Router + classic inference URLs (try both for compatibility).
  const endpoints = [
    `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`,
    `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`,
  ];

  let lastErr;
  for (const url of endpoints) {
    try {
      const response = await axios.post(
        url,
        { inputs: texts, options: { wait_for_model: true } },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 90000,
          validateStatus: () => true,
        }
      );

      if (response.status >= 400) {
        lastErr = new Error(
          response.data?.error ||
            `HF embedding HTTP ${response.status}`
        );
        continue;
      }

      const data = response.data;
      // Expected: array of embeddings aligned with `texts`
      if (Array.isArray(data) && data.length === texts.length) {
        const vectors = data.map((item) => meanPool(item)).filter(Boolean);
        if (vectors.length === texts.length) return vectors;
      }

      // Single-text response shape
      if (texts.length === 1) {
        const one = meanPool(data);
        if (one) return [one];
      }

      lastErr = new Error("Unexpected HF embedding response shape.");
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("HF embedding request failed.");
}

/**
 * Embed texts and return cosine(source, candidate) for each candidate.
 * @returns {Promise<{ scores: number[], method: string, warning: string|null }>}
 */
async function faithfulnessScores(sourceText, candidateTexts) {
  const source = String(sourceText || "").trim();
  const candidates = candidateTexts.map((t) => String(t || "").trim());

  if (!source || candidates.some((c) => !c)) {
    return {
      scores: candidates.map(() => 0),
      method: "none",
      warning: "Missing source or candidate text for faithfulness scoring.",
    };
  }

  // 1) Neural embeddings (preferred for true semantic faithfulness)
  try {
    const vectors = await embedWithHuggingFace([source, ...candidates]);
    const sourceVec = vectors[0];
    const scores = candidates.map((_, i) => {
      const sim = cosineSimilarity(sourceVec, vectors[i + 1]);
      // Cosine can be slightly negative; clamp for a clean 0..1 faithfulness score.
      return Number(Math.max(0, Math.min(1, sim)).toFixed(4));
    });
    return { scores, method: "hf_embeddings", warning: null };
  } catch (err) {
    console.warn(
      "[select-best] Embedding API failed; falling back to sparse TF cosine.",
      err?.message || err
    );
  }

  // 2) Fallback: sparse bag-of-words vectors (still cosine similarity, but lexical)
  const vectors = buildSparseVectors([source, ...candidates]);
  const sourceVec = vectors[0];
  const scores = candidates.map((_, i) =>
    Number(Math.max(0, Math.min(1, cosineSimilarity(sourceVec, vectors[i + 1]))).toFixed(4))
  );

  return {
    scores,
    method: "sparse_tf_cosine_fallback",
    warning:
      "Semantic embedding API unavailable; used lexical TF cosine fallback for faithfulness.",
  };
}

module.exports = {
  cosineSimilarity,
  faithfulnessScores,
};
