const BORDER_RE = /^\s*\+[+\-=:]+\+\s*$/;

export function isAsciiBorderLine(line) {
  const t = String(line || "").trim();
  return t.length >= 3 && t.startsWith("+") && t.endsWith("+") && /[-+=]/.test(t);
}

export function isAsciiRowLine(line) {
  const t = String(line || "").trim();
  return t.startsWith("|") && t.includes("|", 1);
}

function splitCells(line) {
  const t = String(line || "").trim();
  if (!t.startsWith("|")) return [];
  const inner = t.endsWith("|") ? t.slice(1, -1) : t.slice(1);
  return inner.split("|").map((cell) => cell.replace(/\s+/g, " ").trim());
}

function hasEmoji(text) {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(String(text || ""));
}

function rowIsHeader(row) {
  const filled = row.filter(Boolean);
  if (!filled.length) return false;
  const emojiHeaders = filled.filter(
    (cell) => hasEmoji(cell) && !cell.trim().startsWith("•")
  );
  if (emojiHeaders.length >= Math.ceil(filled.length / 2)) return true;
  if (filled.length < 2) return false;
  return filled.every((cell) => {
    const t = cell.trim();
    if (!t || /^[•\-*(]/.test(t) || /^[a-z]/.test(t)) return false;
    return t.length <= 32 && t.split(/\s+/).length <= 5;
  });
}

export function looksLikeAsciiTable(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return false;
  const hits = lines.filter((line) => isAsciiBorderLine(line) || isAsciiRowLine(line)).length;
  return hits >= 3 && hits / lines.length >= 0.65;
}

export function parseAsciiBoxTable(block) {
  const dataRows = [];
  for (const line of String(block || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || BORDER_RE.test(trimmed) || isAsciiBorderLine(trimmed)) continue;
    if (!isAsciiRowLine(trimmed)) continue;
    const cells = splitCells(trimmed);
    if (cells.length) dataRows.push(cells);
  }
  if (!dataRows.length) return null;

  const titles = [];
  const bands = [];
  let current = null;

  const startBand = (row) => {
    current = {
      columns: row.length,
      headers: row.map((cell) => cell),
      bodies: row.map(() => []),
    };
    bands.push(current);
  };

  for (const row of dataRows) {
    const filled = row.filter(Boolean);
    if (filled.length <= 1 && row.length <= 2) {
      if (filled[0]) titles.push(filled[0]);
      continue;
    }
    const headerish = rowIsHeader(row);
    if (!current || headerish) {
      startBand(row);
      continue;
    }
    if (row.length === current.columns) {
      row.forEach((cell, index) => {
        if (cell) current.bodies[index].push(cell);
      });
      continue;
    }
    startBand(row);
  }

  const cards = [];
  for (const band of bands) {
    for (let i = 0; i < band.columns; i += 1) {
      const header = band.headers[i] || "";
      const body = band.bodies[i].join("\n").trim();
      if (!header && !body) continue;
      cards.push({
        title: header,
        body,
        columns: band.columns,
      });
    }
  }

  return {
    title: titles[0] || "",
    subtitle: titles.slice(1).join(" · "),
    cards,
    columnCount: Math.max(...bands.map((band) => band.columns), 1),
  };
}

const SUBSCRIPT_MAP = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

function mermaidSafe(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/"/g, "'")
    .replace(/[\[\]{}]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " / ")
    .replace(/\+/g, " and ")
    .replace(/[₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => SUBSCRIPT_MAP[ch] || "")
    .replace(/[^ -~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function quoteMermaidLabel(label) {
  const safe = String(label || "")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => SUBSCRIPT_MAP[ch] || "")
    .replace(/[“”«»]/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/"/g, "'")
    .replace(/[→←↔]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/\+/g, " and ")
    .replace(/#/g, "")
    .replace(/;/g, ",")
    .replace(/\*\*/g, "")
    .replace(/[_*]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^ -~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `"${safe || "node"}"`;
}

export function isMermaidStartLine(line) {
  return /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|mindmap|timeline|stateDiagram(?:-v2)?|pie|gantt|gitGraph|journey|quadrantChart|requirementDiagram|C4Context|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban)\b/.test(
    String(line || "").trim()
  );
}

function isMermaidBodyLine(line, kind = "") {
  const t = String(line || "").trim();
  if (!t) return false;
  if (/^```/.test(t) || /^#{1,6}\s/.test(t)) return false;
  if (isMermaidStartLine(t) || t.startsWith("%%")) return true;
  if (
    /^(subgraph|end|style|classDef|class|click|direction|participant|actor|Note|activate|deactivate|loop|alt|else|opt|par|and|rect|title|section|dateFormat|axisFormat)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/-->|.->|->>|-->>|---|==>|--x|-\)|:\s|\|\|--/.test(t)) return true;
  if (/^[A-Za-z_][\w-]*\s*(\[\[|\(\(|\[\(|\[|\(|\{)/.test(t)) return true;
  if (/^[A-Za-z_][\w-]*\s*$/.test(t)) return true;
  if (kind === "mindmap" || kind === "timeline" || kind === "sequence" || kind === "class" || kind === "er") {
    return t.length <= 120;
  }
  if (/^\s{2,}\S/.test(String(line || ""))) return true;
  return false;
}

function findShapeClose(source, start, open, close) {
  if (open.length > 1) return source.indexOf(close, start);
  let depth = 1;
  let index = start;
  while (index < source.length) {
    if (source.startsWith(close, index)) {
      depth -= 1;
      if (depth === 0) return index;
      index += close.length;
      continue;
    }
    if (source.startsWith(open, index)) {
      depth += 1;
      index += open.length;
      continue;
    }
    index += 1;
  }
  return -1;
}

function quoteNodeLabels(source) {
  const pairs = [
    { open: "[[", close: "]]" },
    { open: "((", close: "))" },
    { open: "[(", close: ")]" },
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: "(", close: ")" },
  ];
  let out = "";
  let index = 0;
  const text = String(source || "");
  const idRe = /[A-Za-z_][\w-]*/y;

  while (index < text.length) {
    idRe.lastIndex = index;
    const idMatch = idRe.exec(text);
    if (idMatch && idMatch.index === index) {
      const id = idMatch[0];
      let cursor = index + id.length;
      let spaced = cursor;
      while (text[spaced] === " ") spaced += 1;
      const rest = text.slice(spaced);
      const shape = pairs.find((pair) => rest.startsWith(pair.open));
      if (shape) {
        const innerStart = spaced + shape.open.length;
        if (text[innerStart] === '"' || text[innerStart] === "'") {
          const quote = text[innerStart];
          let endQuote = innerStart + 1;
          while (endQuote < text.length && text[endQuote] !== quote) endQuote += 1;
          const afterQuote = endQuote + 1;
          if (text.slice(afterQuote, afterQuote + shape.close.length) === shape.close) {
            const inner = text.slice(innerStart + 1, endQuote);
            out += `${id}${text.slice(index + id.length, spaced)}${shape.open}${quoteMermaidLabel(inner)}${shape.close}`;
            index = afterQuote + shape.close.length;
            continue;
          }
        }
        const closeAt = findShapeClose(text, innerStart, shape.open, shape.close);
        if (closeAt !== -1) {
          const inner = text.slice(innerStart, closeAt);
          out += `${id}${text.slice(index + id.length, spaced)}${shape.open}${quoteMermaidLabel(inner)}${shape.close}`;
          index = closeAt + shape.close.length;
          continue;
        }
      }
      out += id;
      index += id.length;
      continue;
    }
    out += text[index];
    index += 1;
  }
  return out;
}

function rewriteReservedNodeIds(source) {
  return String(source || "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (/^(flowchart|graph|subgraph|end|style|classDef|class|click|direction)\b/.test(trimmed)) {
        return line;
      }
      return line.replace(
        /(^|[\s>;])(end|o)(?=\s*(\[|\(|\{|"|-->|---|-\.|==|$))/gi,
        (_, pre, id) => `${pre}n_${id.toLowerCase()}`
      );
    })
    .join("\n");
}

export function extractMermaidSource(text) {
  const lines = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const trimmed = line.trim().replace(/^```(?:mermaid)?\s*/i, "");
    return isMermaidStartLine(trimmed);
  });
  if (start === -1) return String(text || "").trim();

  const collected = [];
  for (let index = start; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (/^```/.test(trimmed) && collected.length) break;
    if (index === start) {
      collected.push(trimmed.replace(/^```(?:mermaid)?\s*/i, ""));
      continue;
    }
    const kind = collected[0] ? detectDiagramKind(collected[0]) : "";
    if (!trimmed) {
      let peek = index + 1;
      while (peek < lines.length && !lines[peek].trim()) peek += 1;
      if (peek >= lines.length || !isMermaidBodyLine(lines[peek], kind) || isMermaidStartLine(lines[peek])) {
        break;
      }
      collected.push("");
      continue;
    }
    if (!isMermaidBodyLine(raw, kind)) break;
    collected.push(raw);
  }
  return collected.join("\n").replace(/```\s*$/, "").trim();
}

/**
 * GPT often emits unquoted labels like A[Water (root)], which Mermaid 11
 * treats as a syntax error. Quote labels, strip fences, and ASCII-fold text.
 */
export function sanitizeMermaidDefinition(text) {
  let source = extractMermaidSource(text);
  if (!source) return "";
  source = source
    .replace(/^\s*```(?:mermaid)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const header = source.split(/\r?\n/, 1)[0] || "";
  if (/^(flowchart|graph)\b/.test(header.trim())) {
    source = rewriteReservedNodeIds(quoteNodeLabels(source));
  }
  return source.replace(/[ \t]+\n/g, "\n").trim();
}

export function isMermaidErrorSvg(svg) {
  return /Syntax error in text/i.test(String(svg || ""));
}

export function splitMermaidDefinitions(text) {
  const cleaned = sanitizeMermaidDefinition(text);
  const lines = cleaned.split(/\r?\n/);
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (isMermaidStartLine(line) && current.length) {
      blocks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks.map((block) => block.trim()).filter(looksLikeMermaid);
}

function isFlowchartSource(text) {
  return /^(flowchart|graph)\b/m.test(String(text || "").trim());
}

/**
 * Turn mermaid flowchart source into boxes and arrows the UI can draw
 * without depending on a successful mermaid.render().
 */
export function flowchartToLayout(text) {
  const source = sanitizeMermaidDefinition(text);
  if (!isFlowchartSource(source)) return null;

  const nodes = new Map();
  const edges = [];
  let direction = "TB";
  const header = source.split(/\r?\n/, 1)[0] || "";
  if (/\b(LR|RL)\b/.test(header)) direction = "LR";

  const nodeRe = /([A-Za-z_][\w-]*)\s*(?:\[\[|\[\(|\(\(|\[|\(|\{)\s*"([^"]*)"/g;
  const edgeRe =
    /([A-Za-z_][\w-]*)\s*(?:-->|---|-\.->|==>|==)\s*(?:\|"?([^"|]*)"?\|)?\s*([A-Za-z_][\w-]*)/g;

  for (const match of source.matchAll(nodeRe)) {
    nodes.set(match[1], { id: match[1], label: match[2] || match[1] });
  }
  for (const match of source.matchAll(edgeRe)) {
    const from = match[1];
    const to = match[3];
    if (!nodes.has(from)) nodes.set(from, { id: from, label: from });
    if (!nodes.has(to)) nodes.set(to, { id: to, label: to });
    edges.push({ from, to, label: String(match[2] || "").trim() });
  }
  if (!nodes.size) return null;

  const indegree = new Map();
  for (const id of nodes.keys()) indegree.set(id, 0);
  for (const edge of edges) indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);

  let currentIds = [...nodes.keys()].filter((id) => !indegree.get(id));
  if (!currentIds.length) currentIds = [[...nodes.keys()][0]];
  const seen = new Set();
  const layers = [];
  while (currentIds.length && layers.length < 16) {
    layers.push(currentIds.map((id) => nodes.get(id)).filter(Boolean));
    currentIds.forEach((id) => seen.add(id));
    const next = [];
    for (const edge of edges) {
      if (seen.has(edge.from) && !seen.has(edge.to) && !next.includes(edge.to)) {
        next.push(edge.to);
      }
    }
    currentIds = next;
  }
  for (const [id, node] of nodes) {
    if (!seen.has(id)) layers.push([node]);
  }
  return { direction, layers, edges };
}

export function conceptBoardToMermaid(parsed) {
  if (!parsed?.cards?.length) return "";
  const cards = parsed.cards;
  const title = mermaidSafe(parsed.title || "Concept map");
  const nodes = cards.map((card, index) => {
    const label = mermaidSafe([card.title, card.body].filter(Boolean).join("<br/>"));
    return `  n${index}["${label || `Item ${index + 1}`}"]`;
  });

  let links = "";
  if (cards.length === 3) {
    links = "  n0 --> n1 --> n2";
  } else if (cards.length === 6) {
    links = ["  n0 --- n1 --- n2", "  n3 --> n4 --> n5"].join("\n");
  } else if (cards.length > 1) {
    links = cards
      .slice(0, -1)
      .map((_, index) => `  n${index} --> n${index + 1}`)
      .join("\n");
  }

  return [`flowchart TB`, `  title["${title}"]`, ...nodes, links ? `  title --> n0` : "", links]
    .filter(Boolean)
    .join("\n");
}

export function extractVisualSegments(text) {
  const source = String(text || "");
  const lines = source.split("\n");
  const parts = [];
  let markdownStart = 0;
  let index = 0;

  const pushMarkdown = (end) => {
    const chunk = lines.slice(markdownStart, end).join("\n");
    if (chunk.trim()) parts.push({ type: "markdown", content: chunk });
  };

  while (index < lines.length) {
    const trimmed = String(lines[index] || "").trim();
    const fencedMermaid =
      /^```mermaid\b/i.test(trimmed) ||
      (trimmed === "```" && isMermaidStartLine(lines[index + 1] || ""));
    if (fencedMermaid) {
      const start = index;
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        index += 1;
      }
      if (index < lines.length) index += 1;
      const inner = lines
        .slice(start, index)
        .join("\n")
        .replace(/^\s*```(?:mermaid)?[^\n]*\n?/i, "")
        .replace(/\n?```\s*$/i, "");
      if (looksLikeMermaid(inner)) {
        pushMarkdown(start);
        parts.push({ type: "mermaid", content: inner });
        markdownStart = index;
        continue;
      }
      index = start + 1;
      continue;
    }

    if (isMermaidStartLine(lines[index])) {
      const start = index;
      index += 1;
      while (index < lines.length) {
        const line = lines[index];
        if (!String(line || "").trim()) {
          let peek = index + 1;
          while (peek < lines.length && !String(lines[peek] || "").trim()) peek += 1;
          if (
            peek >= lines.length ||
            !isMermaidBodyLine(lines[peek], detectDiagramKind(lines[start])) ||
            isMermaidStartLine(lines[peek])
          ) {
            break;
          }
          index += 1;
          continue;
        }
        if (!isMermaidBodyLine(line, detectDiagramKind(lines[start]))) break;
        index += 1;
      }
      const block = lines.slice(start, index).join("\n");
      if (looksLikeMermaid(block) && index - start >= 2) {
        pushMarkdown(start);
        parts.push({ type: "mermaid", content: block });
        markdownStart = index;
        continue;
      }
      index = start + 1;
      continue;
    }

    if (
      isAsciiBorderLine(lines[index]) ||
      (isAsciiRowLine(lines[index]) &&
        index + 1 < lines.length &&
        (isAsciiBorderLine(lines[index + 1]) || isAsciiRowLine(lines[index + 1])))
    ) {
      const start = index;
      index += 1;
      while (
        index < lines.length &&
        (isAsciiBorderLine(lines[index]) || isAsciiRowLine(lines[index]))
      ) {
        index += 1;
      }
      const block = lines.slice(start, index).join("\n");
      if (looksLikeAsciiTable(block) && parseAsciiBoxTable(block)?.cards?.length) {
        pushMarkdown(start);
        parts.push({ type: "ascii", content: block });
        markdownStart = index;
        continue;
      }
      index = start + 1;
      continue;
    }
    index += 1;
  }

  pushMarkdown(lines.length);
  return parts.length ? parts : [{ type: "markdown", content: source }];
}

export function looksLikeMermaid(text) {
  return /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|mindmap|timeline|stateDiagram(?:-v2)?|pie|gantt|gitGraph|journey|quadrantChart|requirementDiagram|C4Context|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban)\b/m.test(
    String(text || "").trim()
  );
}

export function detectDiagramKind(text) {
  const raw = String(text || "")
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, "");
  const header = (raw.split(/\r?\n/).find((line) => isMermaidStartLine(line)) || raw.split(/\r?\n/, 1)[0] || "").trim();
  if (/^sequenceDiagram\b/.test(header)) return "sequence";
  if (/^mindmap\b/.test(header)) return "mindmap";
  if (/^timeline\b/.test(header) || /^journey\b/.test(header)) return "timeline";
  if (/^classDiagram\b/.test(header)) return "class";
  if (/^erDiagram\b/.test(header)) return "er";
  if (/^stateDiagram/.test(header)) return "state";
  if (/^pie\b/.test(header)) return "pie";
  if (/^gantt\b/.test(header)) return "gantt";
  if (/^(flowchart|graph)\b/.test(header)) {
    if (/\b(LR|RL)\b/.test(header)) return "linear";
    return "flowchart";
  }
  if (looksLikeMermaid(header) || looksLikeMermaid(raw)) return "flowchart";
  return "flowchart";
}
