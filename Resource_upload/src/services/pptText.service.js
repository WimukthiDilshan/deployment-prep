const AdmZip = require("adm-zip");
const { ommlToWrappedLatex } = require("./ommlToLatex");
const { collectEquations, joinMixedTokens } = require("../utils/mathText");

function decodeXmlEntities(input) {
  return String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanExtractedText(input) {
  return String(input || "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b[a-zA-Z0-9_:-]+\s*=\s*"[^"]*"/g, " ")
    .replace(/\/[a-zA-Z0-9:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPptxTextFromBuffer(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter(
      (entry) =>
        /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName) && !entry.isDirectory
    )
    .sort((a, b) => {
      const aNum = Number(a.entryName.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const bNum = Number(b.entryName.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return aNum - bNum;
    });

  const slides = [];
  for (const entry of entries) {
    const xml = entry.getData().toString("utf8");
    const matches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)];
    const slideBits = [];
    for (const m of matches) {
      const cleaned = cleanExtractedText(decodeXmlEntities(m[1]));
      if (cleaned) slideBits.push(cleaned);
    }
    if (slideBits.length) slides.push(slideBits.join(". "));
  }

  return slides.join("\n");
}

function extractPptxMathTextFromBuffer(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter(
      (entry) =>
        /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName) && !entry.isDirectory
    )
    .sort((a, b) => {
      const aNum = Number(a.entryName.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const bNum = Number(b.entryName.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return aNum - bNum;
    });

  const slides = [];
  for (const entry of entries) {
    const xml = entry.getData().toString("utf8");
    const matches = [
      ...xml.matchAll(
        /<m:oMathPara\b[\s\S]*?<\/m:oMathPara>|<m:oMath\b[\s\S]*?<\/m:oMath>|<a:t[^>]*>([\s\S]*?)<\/a:t>/g
      ),
    ];
    const tokens = [];
    for (const match of matches) {
      const chunk = match[0] || "";
      if (/^<m:oMath/i.test(chunk)) {
        const wrapped = ommlToWrappedLatex(chunk);
        if (wrapped) tokens.push(wrapped);
        continue;
      }
      const cleaned = cleanExtractedText(decodeXmlEntities(match[1]));
      if (cleaned) tokens.push(cleaned);
    }
    const slideText = joinMixedTokens(tokens);
    if (slideText) slides.push(slideText);
  }

  const text = slides.join("\n\n");
  return {
    text,
    equations: collectEquations(text),
  };
}

function extractPptText(buffer, originalName) {
  const lower = String(originalName || "").toLowerCase();
  if (lower.endsWith(".pptx")) {
    return extractPptxTextFromBuffer(buffer);
  }
  // Legacy .ppt binary format is not parsed here.
  return "";
}

function extractPptMathText(buffer, originalName) {
  const lower = String(originalName || "").toLowerCase();
  if (lower.endsWith(".pptx")) {
    return extractPptxMathTextFromBuffer(buffer);
  }
  return { text: "", equations: [] };
}

module.exports = {
  extractPptText,
  extractPptMathText,
};
