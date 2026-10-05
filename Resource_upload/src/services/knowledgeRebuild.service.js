const CourseSubSection = require("../models/courseSubSection.model");
const { extractFromStoredFile } = require("./lessonExtract.service");
const { dedupeSubsectionExtracts } = require("./semanticDedupe.service");
const {
  evaluateKnowledgeQuality,
  applyUniqueKnowledge,
} = require("./knowledgeQuality.service");

const rebuilding = new Set();

async function rebuildSubsectionKnowledge(subsectionId) {
  const doc = await CourseSubSection.findById(subsectionId);
  if (!doc) return;

  doc.knowledgeStatus = "rebuilding";
  await doc.save();

  let pptText = "";
  let pdfText = "";
  const equations = [];

  if (doc.pptUrl) {
    try {
      const extracted = await extractFromStoredFile({
        kind: "ppt",
        url: doc.pptUrl,
        containsMath: Boolean(doc.containsMath),
      });
      pptText = extracted.pptText || "";
      equations.push(...(extracted.equations || []));
    } catch (error) {
      console.warn("[knowledge-rebuild] PPT extract failed:", error.message);
    }
  }

  if (doc.pdfUrl) {
    try {
      const extracted = await extractFromStoredFile({
        kind: "pdf",
        url: doc.pdfUrl,
        containsMath: Boolean(doc.containsMath),
      });
      pdfText = extracted.pdfText || "";
      equations.push(...(extracted.equations || []));
    } catch (error) {
      console.warn("[knowledge-rebuild] PDF extract failed:", error.message);
    }
  }

  const dedupeResult = await dedupeSubsectionExtracts({
    pptText,
    pdfText,
    transcriptText: doc.transcriptText || "",
    protectMath: Boolean(doc.containsMath),
  });

  const quality = evaluateKnowledgeQuality({
    hasPptFile: Boolean(doc.pptUrl),
    hasPdfFile: Boolean(doc.pdfUrl),
    pptExtractLen: pptText.length,
    pdfExtractLen: pdfText.length,
    transcriptText: doc.transcriptText || "",
    dedupedPpt: dedupeResult.ppt,
    dedupedPdf: dedupeResult.pdf,
    dedupedTranscript: dedupeResult.transcript,
    containsMath: Boolean(doc.containsMath),
    equations,
  });

  const uniqueLen = [dedupeResult.ppt, dedupeResult.pdf, dedupeResult.transcript]
    .map((text) => String(text || "").trim())
    .join("\n").length;
  const usable = uniqueLen > 0 || String(doc.transcriptText || "").trim().length > 0;
  applyUniqueKnowledge(doc, {
    transcriptText: doc.transcriptText || "",
    dedupeResult,
    equations,
    containsMath: Boolean(doc.containsMath),
    quality: {
      status: usable ? "ready" : "failed",
      reasons: usable ? [] : quality.reasons,
    },
  });
  await doc.save();

  console.log(
    "[knowledge-rebuild]",
    String(doc._id),
    doc.knowledgeStatus,
    doc.knowledgeStatusReason || "ok"
  );
}

function scheduleKnowledgeRebuild(subsectionId) {
  const id = String(subsectionId || "");
  if (!id || rebuilding.has(id)) return;
  rebuilding.add(id);
  setImmediate(() => {
    rebuildSubsectionKnowledge(id)
      .catch((error) => {
        console.error("[knowledge-rebuild]", id, error.message);
      })
      .finally(() => {
        rebuilding.delete(id);
      });
  });
}

module.exports = {
  scheduleKnowledgeRebuild,
  rebuildSubsectionKnowledge,
};
