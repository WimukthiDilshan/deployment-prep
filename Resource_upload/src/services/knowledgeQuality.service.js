const MIN_FILE_EXTRACT = 40;
const MIN_UNIQUE = 80;
const { filterWhisperNoise } = require("./whisperNoise.service");

function evaluateKnowledgeQuality({
  hasPptFile = false,
  hasPdfFile = false,
  pptExtractLen = 0,
  pdfExtractLen = 0,
  transcriptText = "",
  dedupedPpt = "",
  dedupedPdf = "",
  dedupedTranscript = "",
  containsMath = false,
  equations = [],
}) {
  const reasons = [];
  const uniqueLen = [dedupedPpt, dedupedPdf, dedupedTranscript]
    .map((text) => String(text || "").trim())
    .join("\n").length;
  const extractLen =
    Number(pptExtractLen || 0) +
    Number(pdfExtractLen || 0) +
    String(transcriptText || "").trim().length;

  if (hasPptFile && Number(pptExtractLen || 0) < MIN_FILE_EXTRACT) {
    reasons.push("ppt_extract_empty");
  }
  if (hasPdfFile && Number(pdfExtractLen || 0) < MIN_FILE_EXTRACT) {
    reasons.push("pdf_extract_empty");
  }
  if (extractLen >= 200 && uniqueLen < MIN_UNIQUE) {
    reasons.push("unique_chunk_empty");
  }
  if (containsMath && (hasPptFile || hasPdfFile) && !(equations || []).length) {
    reasons.push("math_equations_missing");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    status: reasons.length ? "needs_rebuild" : "ready",
  };
}

function applyUniqueKnowledge(target, {
  transcriptText,
  dedupeResult,
  equations,
  containsMath,
  quality,
}) {
  target.pptText = "";
  target.pdfText = "";
  if (typeof transcriptText === "string") {
    const cleanedTranscript = filterWhisperNoise(transcriptText);
    target.transcriptText = cleanedTranscript;
    target.transcriptPreview = cleanedTranscript.slice(0, 300);
  }
  target.dedupedPptText = dedupeResult?.ppt || "";
  target.dedupedPdfText = dedupeResult?.pdf || "";
  target.dedupedTranscriptText = dedupeResult?.transcript || "";
  target.dedupeStats = dedupeResult?.stats || null;
  target.containsMath = Boolean(containsMath);
  target.equations = containsMath ? equations || [] : [];
  target.knowledgeStatus = quality?.status || "ready";
  target.knowledgeStatusReason = Array.isArray(quality?.reasons)
    ? quality.reasons.join("; ")
    : "";
  return target;
}

module.exports = {
  evaluateKnowledgeQuality,
  applyUniqueKnowledge,
};
