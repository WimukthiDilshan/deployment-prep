const { extractPptText, extractPptMathText } = require("./pptText.service");
const { extractPdfText, extractPdfMathText } = require("./pdfText.service");
const { collectEquations } = require("../utils/mathText");

function toEquationDocs(latexList, source) {
  return (latexList || [])
    .map((latex) => String(latex || "").trim())
    .filter(Boolean)
    .map((latex) => ({ latex, source }));
}

function fileNameFromUrl(url, fallback) {
  try {
    const pathname = new URL(url).pathname;
    const base = decodeURIComponent(pathname.split("/").pop() || "");
    return base || fallback;
  } catch (_) {
    return fallback;
  }
}

function looksLikeHtml(buffer) {
  const head = Buffer.isBuffer(buffer)
    ? buffer.subarray(0, 80).toString("utf8").toLowerCase()
    : "";
  return head.includes("<!doctype") || head.includes("<html");
}

function attachmentUrl(url) {
  const source = String(url || "");
  if (!source.includes("/upload/") || source.includes("fl_attachment")) {
    return "";
  }
  return source.replace("/upload/", "/upload/fl_attachment/");
}

async function fetchOneBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download stored file (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("Downloaded empty file");
  }
  if (looksLikeHtml(buffer)) {
    throw new Error("Downloaded HTML instead of a file");
  }
  return buffer;
}

async function fetchRemoteBuffer(url) {
  if (!url) {
    throw new Error("Missing file URL");
  }
  try {
    return await fetchOneBuffer(url);
  } catch (error) {
    const fallback = attachmentUrl(url);
    if (!fallback) throw error;
    return fetchOneBuffer(fallback);
  }
}

async function extractLessonDocuments({ pptBuffer, pptName, pdfBuffer, containsMath }) {
  let pptText = "";
  let pdfText = "";
  const equations = [];

  if (pptBuffer?.length) {
    if (containsMath) {
      const result = extractPptMathText(pptBuffer, pptName);
      pptText = result.text || "";
      equations.push(...toEquationDocs(result.equations, "ppt"));
    } else {
      pptText = extractPptText(pptBuffer, pptName);
    }
  }

  if (pdfBuffer?.length) {
    if (containsMath) {
      const result = await extractPdfMathText(pdfBuffer);
      pdfText = result.text || "";
      equations.push(...toEquationDocs(result.equations, "pdf"));
    } else {
      pdfText = await extractPdfText(pdfBuffer);
    }
  }

  if (containsMath && !equations.length) {
    equations.push(
      ...toEquationDocs(collectEquations(pptText), "ppt"),
      ...toEquationDocs(collectEquations(pdfText), "pdf")
    );
  }

  return { pptText, pdfText, equations: containsMath ? equations : [] };
}

async function extractFromStoredFile({ kind, url, containsMath }) {
  if (!url) {
    return { pptText: "", pdfText: "", equations: [] };
  }
  const remote = await fetchRemoteBuffer(url);
  if (kind === "ppt") {
    return extractLessonDocuments({
      pptBuffer: remote,
      pptName: fileNameFromUrl(url, "lesson.pptx"),
      containsMath,
    });
  }
  return extractLessonDocuments({
    pdfBuffer: remote,
    containsMath,
  });
}

module.exports = {
  toEquationDocs,
  fileNameFromUrl,
  fetchRemoteBuffer,
  extractLessonDocuments,
  extractFromStoredFile,
};
