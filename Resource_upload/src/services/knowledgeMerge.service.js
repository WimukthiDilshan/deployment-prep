const { filterWhisperNoise } = require("./whisperNoise.service");

/**
 * Extractive knowledge chunk only.
 * Uses MiniLM-unique PPT, then unique PDF, then unique spoken lines.
 * Sentences are copied from the educator files/transcript. Nothing is generated.
 */
function buildUniqueKnowledgeChunk({
  ppt = "",
  pdf = "",
  transcript = "",
  equations = [],
  containsMath = false,
} = {}) {
  const parts = [
    String(ppt || "").trim(),
    String(pdf || "").trim(),
    filterWhisperNoise(transcript),
  ].filter(Boolean);

  let knowledgeChunk = parts.join("\n\n").trim();

  if (containsMath && Array.isArray(equations) && equations.length) {
    const listed = equations
      .map((eq, idx) => `[eq_${idx + 1}] ${String(eq.latex || "").trim()}`)
      .filter((line) => line.length > 8)
      .join("\n");
    if (listed) {
      knowledgeChunk = `${knowledgeChunk}\n\nCANONICAL EQUATIONS (copy exactly):\n${listed}`.trim();
    }
  }
  return knowledgeChunk;
}

module.exports = {
  buildUniqueKnowledgeChunk,
};
