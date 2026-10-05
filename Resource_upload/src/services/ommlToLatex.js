const UNICODE_LATEX = {
  α: "\\alpha",
  β: "\\beta",
  γ: "\\gamma",
  δ: "\\delta",
  ε: "\\varepsilon",
  ζ: "\\zeta",
  η: "\\eta",
  θ: "\\theta",
  ι: "\\iota",
  κ: "\\kappa",
  λ: "\\lambda",
  μ: "\\mu",
  ν: "\\nu",
  ξ: "\\xi",
  π: "\\pi",
  ρ: "\\rho",
  σ: "\\sigma",
  τ: "\\tau",
  υ: "\\upsilon",
  φ: "\\phi",
  χ: "\\chi",
  ψ: "\\psi",
  ω: "\\omega",
  Α: "A",
  Β: "B",
  Γ: "\\Gamma",
  Δ: "\\Delta",
  Θ: "\\Theta",
  Λ: "\\Lambda",
  Ξ: "\\Xi",
  Π: "\\Pi",
  Σ: "\\Sigma",
  Φ: "\\Phi",
  Ψ: "\\Psi",
  Ω: "\\Omega",
  "∂": "\\partial",
  "∇": "\\nabla",
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
  "∮": "\\oint",
  "√": "\\sqrt",
  "∞": "\\infty",
  "±": "\\pm",
  "∓": "\\mp",
  "×": "\\times",
  "÷": "\\div",
  "·": "\\cdot",
  "∗": "\\ast",
  "∘": "\\circ",
  "≤": "\\leq",
  "≥": "\\geq",
  "≠": "\\neq",
  "≈": "\\approx",
  "≡": "\\equiv",
  "∼": "\\sim",
  "∈": "\\in",
  "∉": "\\notin",
  "⊂": "\\subset",
  "⊃": "\\supset",
  "⊆": "\\subseteq",
  "∪": "\\cup",
  "∩": "\\cap",
  "∧": "\\land",
  "∨": "\\lor",
  "¬": "\\neg",
  "∀": "\\forall",
  "∃": "\\exists",
  "→": "\\rightarrow",
  "←": "\\leftarrow",
  "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow",
  "⇐": "\\Leftarrow",
  "⇔": "\\Leftrightarrow",
  "↦": "\\mapsto",
  "′": "^{\\prime}",
  "″": "^{\\prime\\prime}",
  "°": "^{\\circ}",
  "…": "\\ldots",
  "⋯": "\\cdots",
  "ℝ": "\\mathbb{R}",
  "ℕ": "\\mathbb{N}",
  "ℤ": "\\mathbb{Z}",
  "ℚ": "\\mathbb{Q}",
  "ℂ": "\\mathbb{C}",
  "ℓ": "\\ell",
  "ħ": "\\hbar",
  "⟨": "\\langle",
  "⟩": "\\rangle",
};

const NARY_OPS = {
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
  "∮": "\\oint",
  "⋃": "\\bigcup",
  "⋂": "\\bigcap",
  "⋁": "\\bigvee",
  "⋀": "\\bigwedge",
};

const SKIP_LOCAL = new Set([
  "fpr",
  "ssuppr",
  "ssubpr",
  "ssubsuppr",
  "sprepr",
  "radpr",
  "ctrlpr",
  "rpr",
  "argpr",
  "eqarrpr",
  "mpr",
  "funcpr",
  "limlowpr",
  "limupppr",
  "barpr",
  "accpr",
  "groupchrpr",
  "phantpr",
  "boxpr",
]);

function mapUnicode(input) {
  return String(input || "").replace(/[\u00A0-\uFFFF]/g, (ch) => UNICODE_LATEX[ch] || ch);
}

function localName(name) {
  const raw = String(name || "");
  const idx = raw.indexOf(":");
  return (idx >= 0 ? raw.slice(idx + 1) : raw).toLowerCase();
}

function parseAttrs(tagPart) {
  const attrs = {};
  const re = /([A-Za-z0-9:_-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(tagPart))) {
    attrs[match[1]] = match[2];
    const local = localName(match[1]);
    attrs[local] = match[2];
  }
  return attrs;
}

function parseNodes(xml, start = 0) {
  const nodes = [];
  const source = String(xml || "");
  let i = start;
  while (i < source.length) {
    if (source.startsWith("</", i)) {
      return { nodes, end: i };
    }
    if (source[i] !== "<") {
      const next = source.indexOf("<", i);
      const end = next === -1 ? source.length : next;
      nodes.push({ type: "text", text: source.slice(i, end) });
      i = end;
      continue;
    }
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    const close = source.indexOf(">", i);
    if (close === -1) break;
    const raw = source.slice(i + 1, close);
    if (raw.startsWith("?") || raw.startsWith("!")) {
      i = close + 1;
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const tagPart = (selfClosing ? raw.slice(0, -1) : raw).trim();
    const name = tagPart.split(/\s+/)[0] || "";
    const attrs = parseAttrs(tagPart);
    i = close + 1;
    if (selfClosing) {
      nodes.push({ type: "el", name, attrs, children: [] });
      continue;
    }
    const inner = parseNodes(source, i);
    nodes.push({ type: "el", name, attrs, children: inner.nodes });
    const closeTag = source.indexOf(">", inner.end);
    i = closeTag === -1 ? source.length : closeTag + 1;
  }
  return { nodes, end: i };
}

function childrenOf(node) {
  return Array.isArray(node?.children) ? node.children : [];
}

function findChild(node, local) {
  return childrenOf(node).find((child) => child.type === "el" && localName(child.name) === local);
}

function findChildren(node, local) {
  return childrenOf(node).filter((child) => child.type === "el" && localName(child.name) === local);
}

function convert(node) {
  if (!node) return "";
  if (node.type === "text") return mapUnicode(node.text);
  const name = localName(node.name);
  if (SKIP_LOCAL.has(name)) return "";

  if (name === "t") {
    return childrenOf(node).map(convert).join("");
  }
  if (name === "r" || name === "e" || name === "box" || name === "borderbox" || name === "phant" || name === "arg") {
    return childrenOf(node).map(convert).join("");
  }
  if (name === "f") {
    const num = findChild(node, "num");
    const den = findChild(node, "den");
    return `\\frac{${convert(num)}}{${convert(den)}}`;
  }
  if (name === "ssup") {
    return `{${convert(findChild(node, "e"))}}^{${convert(findChild(node, "sup"))}}`;
  }
  if (name === "ssub") {
    return `{${convert(findChild(node, "e"))}}_{${convert(findChild(node, "sub"))}}`;
  }
  if (name === "ssubsup") {
    return `{${convert(findChild(node, "e"))}}_{${convert(findChild(node, "sub"))}}^{${convert(findChild(node, "sup"))}}`;
  }
  if (name === "spre") {
    return `{}^{${convert(findChild(node, "sup"))}}_{${convert(findChild(node, "sub"))}}{${convert(findChild(node, "e"))}}`;
  }
  if (name === "rad") {
    const deg = findChild(node, "deg");
    const body = convert(findChild(node, "e"));
    const degLatex = deg ? convert(deg).trim() : "";
    return degLatex ? `\\sqrt[${degLatex}]{${body}}` : `\\sqrt{${body}}`;
  }
  if (name === "nary") {
    const pr = findChild(node, "narypr");
    const chr = findChild(pr, "chr");
    const opRaw = chr?.attrs?.val || "∫";
    const op = NARY_OPS[opRaw] || UNICODE_LATEX[opRaw] || opRaw;
    const sub = convert(findChild(node, "sub"));
    const sup = convert(findChild(node, "sup"));
    const body = convert(findChild(node, "e"));
    return `${op}_{${sub}}^{${sup}} ${body}`;
  }
  if (name === "d") {
    const pr = findChild(node, "dpr");
    const beg = findChild(pr, "begchr")?.attrs?.val ?? "(";
    const end = findChild(pr, "endchr")?.attrs?.val ?? ")";
    const inner = findChildren(node, "e").map(convert).join(",");
    return `${beg}${inner}${end}`;
  }
  if (name === "m") {
    const rows = findChildren(node, "mr").map((row) =>
      findChildren(row, "e").map(convert).join(" & ")
    );
    return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
  }
  if (name === "func") {
    return `${convert(findChild(node, "fname"))}\\left(${convert(findChild(node, "e"))}\\right)`;
  }
  if (name === "limlow") {
    return `\\underbrace{${convert(findChild(node, "e"))}}_{${convert(findChild(node, "lim"))}}`;
  }
  if (name === "limupp") {
    return `\\overbrace{${convert(findChild(node, "e"))}}^{${convert(findChild(node, "lim"))}}`;
  }
  if (name === "bar") {
    return `\\overline{${convert(findChild(node, "e"))}}`;
  }
  if (name === "acc") {
    const chr = findChild(findChild(node, "accpr"), "chr")?.attrs?.val || "";
    const body = convert(findChild(node, "e"));
    if (chr === "̂" || chr === "^") return `\\hat{${body}}`;
    if (chr === "̃" || chr === "~") return `\\tilde{${body}}`;
    if (chr === "̇") return `\\dot{${body}}`;
    if (chr === "̈") return `\\ddot{${body}}`;
    if (chr === "⃗" || chr === "→") return `\\vec{${body}}`;
    return `\\hat{${body}}`;
  }
  if (name === "groupchr") {
    return convert(findChild(node, "e"));
  }
  if (name === "eqarr") {
    const rows = findChildren(node, "e").map(convert);
    return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
  }
  if (name === "narypr" || name === "dpr") return "";

  return childrenOf(node).map(convert).join("");
}

function looksDisplay(latex) {
  return /\\frac|\\sum|\\int|\\prod|\\begin\{|\\sqrt|\\partial|\\nabla/.test(latex);
}

function wrapLatex(latex) {
  const trimmed = String(latex || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return looksDisplay(trimmed) ? `$$\n${trimmed}\n$$` : `$${trimmed}$`;
}

function ommlToLatex(ommlXml) {
  const { nodes } = parseNodes(ommlXml);
  const latex = nodes.map(convert).join("").replace(/\s+/g, " ").trim();
  return latex;
}

function ommlToWrappedLatex(ommlXml) {
  return wrapLatex(ommlToLatex(ommlXml));
}

module.exports = {
  ommlToLatex,
  ommlToWrappedLatex,
  mapUnicode,
  wrapLatex,
};
