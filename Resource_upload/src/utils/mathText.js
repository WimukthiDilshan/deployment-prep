function collectEquations(text) {
  const out = [];
  const seen = new Set();
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
  let match;
  const source = String(text || "");
  while ((match = re.exec(source))) {
    const latex = String(match[1] || match[2] || "").trim();
    if (!latex || seen.has(latex)) continue;
    seen.add(latex);
    out.push(latex);
  }
  return out;
}

function joinMixedTokens(tokens) {
  let out = "";
  for (const token of tokens) {
    const piece = String(token || "").trim();
    if (!piece) continue;
    const isMath = piece.startsWith("$$") || (piece.startsWith("$") && piece.endsWith("$"));
    if (isMath) {
      out += `${out ? "\n" : ""}${piece}\n`;
    } else {
      out += `${out && !out.endsWith("\n") ? " " : ""}${piece}`;
    }
  }
  return out.trim();
}

module.exports = {
  collectEquations,
  joinMixedTokens,
};
