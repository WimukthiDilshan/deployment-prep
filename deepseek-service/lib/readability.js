/**
 * Flesch Reading Ease
 * ---------------------
 * Classic readability formula (0–100-ish; higher = easier to read):
 *   FRE = 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
 *
 * We use this so an output can be matched to the student's cognitive-load
 * target (overloaded students need easier text → higher FRE target).
 */

function countSyllables(word) {
  const w = String(word || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;

  // Lightweight English syllable heuristic (good enough for ranking, not NLP research).
  let syllables = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

function splitSentences(text) {
  const parts = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [];
}

function splitWords(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-zA-Z']+/g) || [];
}

/**
 * @param {string} text
 * @returns {{ fleschReadingEase: number, words: number, sentences: number, syllables: number }}
 */
function computeFleschReadingEase(text) {
  const words = splitWords(text);
  const sentences = splitSentences(text);
  const wordCount = Math.max(words.length, 1);
  const sentenceCount = Math.max(sentences.length, 1);
  const syllableCount = Math.max(
    words.reduce((sum, w) => sum + countSyllables(w), 0),
    1
  );

  const asl = wordCount / sentenceCount; // average sentence length
  const asw = syllableCount / wordCount; // average syllables per word
  const fleschReadingEase = 206.835 - 1.015 * asl - 84.6 * asw;

  return {
    fleschReadingEase: Number(fleschReadingEase.toFixed(2)),
    words: wordCount,
    sentences: sentenceCount,
    syllables: syllableCount,
  };
}

/**
 * Target FRE by cognitive-load level.
 * Higher load → prefer easier wording (higher FRE).
 */
function targetFleschForLoad(level) {
  const key = String(level || "Medium").trim();
  const map = {
    "Very High": 75,
    High: 65,
    Medium: 55,
    Low: 45,
  };
  return map[key] ?? 55;
}

/**
 * Convert FRE distance-from-target into a 0..1 match score.
 * Distance of 0 → 1.0; distance ≥ scale → 0.0.
 */
function readabilityMatchScore(fleschReadingEase, cognitiveLoadLevel) {
  const target = targetFleschForLoad(cognitiveLoadLevel);
  const scale = 50; // FRE points that map to a full penalty
  const distance = Math.abs(fleschReadingEase - target);
  const match = 1 - Math.min(1, distance / scale);
  return {
    targetFlesch: target,
    readabilityMatch: Number(match.toFixed(4)),
  };
}

module.exports = {
  computeFleschReadingEase,
  targetFleschForLoad,
  readabilityMatchScore,
};
