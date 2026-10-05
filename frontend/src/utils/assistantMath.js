import katex from 'katex';

const CANONICAL_LINE = /^\s*\[eq_\d+]\s+(.+?)\s*$/i;
const DISPLAY_MATH = /\$\$([\s\S]+?)\$\$/g;

export function parseCanonicalEquations(knowledgeChunk) {
  const text = String(knowledgeChunk || "");
  const start = text.indexOf("CANONICAL EQUATIONS");
  const block = start >= 0 ? text.slice(start) : text;
  const found = [];
  const seen = new Set();
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(CANONICAL_LINE);
    if (!match) continue;
    const latex = String(match[1] || "").trim();
    if (!latex || seen.has(latex)) continue;
    seen.add(latex);
    found.push(latex);
  }
  return found;
}

function looksBrokenLatex(latex) {
  const sample = String(latex || "").trim();
  if (!sample) return true;
  if (/\\cdott|\\cdotx|\(\s*\\cdotx|\\cdot\s*\\cdot/.test(sample)) return true;
  if (/\\[a-zA-Z]+t\b/.test(sample) && /\\cdot/.test(sample) && sample.length < 80) {
    return true;
  }
  try {
    katex.renderToString(sample, { throwOnError: true, displayMode: true });
    return false;
  } catch (_) {
    return true;
  }
}

function tokens(latex) {
  return String(latex || "")
    .toLowerCase()
    .replace(/\\/g, " ")
    .match(/[a-z0-9]+/g) || [];
}

function similar(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const item of left) {
    if (right.has(item)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function bestCanonical(latex, canonicals) {
  let best = "";
  let score = 0;
  for (const candidate of canonicals) {
    const next = similar(latex, candidate);
    if (next > score) {
      score = next;
      best = candidate;
    }
  }
  return score >= 0.28 ? best : "";
}

export function restoreBrokenEquations(text, canonicals) {
  const source = String(text || "");
  if (!canonicals?.length) return source;
  return source.replace(DISPLAY_MATH, (full, body) => {
    const latex = String(body || "").trim();
    if (!looksBrokenLatex(latex)) return `\n$$\n${latex}\n$$\n`;
    const replacement = bestCanonical(latex, canonicals);
    if (!replacement) return `\n$$\n${latex}\n$$\n`;
    return `\n$$\n${replacement}\n$$\n`;
  });
}

/**
 * Put math into a form remark-math / KaTeX can typeset.
 * Keeps educator LaTeX; only normalizes delimiters and line breaks.
 */
export function normalizeAssistantMath(raw) {
  let text = String(raw ?? "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => `\n$$\n${body}\n$$\n`);
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body}$`);
  text = text.replace(/\$\$[ \t]*/g, () => "$$\n");
  text = text.replace(/[ \t]*\$\$/g, () => "\n$$");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
