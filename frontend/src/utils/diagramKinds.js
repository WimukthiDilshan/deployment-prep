import {
  extractMermaidSource,
  flowchartToLayout,
  detectDiagramKind,
} from './asciiDiagram.js';

export const KIND_LABEL = {
  linear: "Process",
  flowchart: "Flowchart",
  mindmap: "Concept tree",
  sequence: "Sequence",
  timeline: "Timeline",
  class: "Structure",
  er: "Relationships",
  state: "States",
  pie: "Chart",
  gantt: "Schedule",
};

function cleanLabel(text) {
  return String(text || "")
    .replace(/^root\s*/i, "")
    .replace(/^\(\((.+)\)\)$/, "$1")
    .replace(/^\[\[(.+)\]\]$/, "$1")
    .replace(/^\[(.+)\]$/, "$1")
    .replace(/^\((.+)\)$/, "$1")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSequenceDiagram(text) {
  const actors = [];
  const messages = [];
  const addActor = (name) => {
    const id = cleanLabel(name);
    if (id && !actors.includes(id)) actors.push(id);
  };
  for (const line of extractMermaidSource(text).split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    const participant = trimmed.match(/^participant\s+(\S+)(?:\s+as\s+(.+))?/i);
    if (participant) {
      addActor(participant[2] || participant[1]);
      continue;
    }
    const actor = trimmed.match(/^actor\s+(\S+)/i);
    if (actor) {
      addActor(actor[1]);
      continue;
    }
    const message = trimmed.match(/^(\S+)\s*(-->>|->>|-->|->|--x|-x)\s*(\S+)\s*:\s*(.+)$/);
    if (message) {
      addActor(message[1]);
      addActor(message[3]);
      messages.push({
        from: cleanLabel(message[1]),
        to: cleanLabel(message[3]),
        text: cleanLabel(message[4]),
      });
    }
  }
  if (!actors.length) return null;
  return { actors, messages };
}

export function parseMindmap(text) {
  const lines = extractMermaidSource(text)
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim() && !line.trim().startsWith("%%"));
  const root = { label: "Topic", children: [] };
  const stack = [{ indent: -1, node: root }];
  for (const line of lines) {
    const indent = line.match(/^ */)[0].length;
    const node = { label: cleanLabel(line.trim()) || "Item", children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent, node });
  }
  if (!root.children.length) return null;
  return root.children.length === 1 ? root.children[0] : root;
}

export function parseTimeline(text) {
  let title = "";
  let section = "";
  const events = [];
  for (const line of extractMermaidSource(text).split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    const titleMatch = trimmed.match(/^title\s+(.+)/i);
    if (titleMatch) {
      title = cleanLabel(titleMatch[1]);
      continue;
    }
    const sectionMatch = trimmed.match(/^section\s+(.+)/i);
    if (sectionMatch) {
      section = cleanLabel(sectionMatch[1]);
      continue;
    }
    if (!trimmed.includes(":")) continue;
    const colon = trimmed.indexOf(":");
    events.push({
      when: cleanLabel(trimmed.slice(0, colon)),
      text: cleanLabel(trimmed.slice(colon + 1)),
      section,
    });
  }
  return events.length ? { title, events } : null;
}

export function parseClassBoxes(text) {
  const names = new Set();
  const source = extractMermaidSource(text);
  for (const match of source.matchAll(/\bclass\s+(\w+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/^(\w+)\s*\{/gm)) names.add(match[1]);
  for (const match of source.matchAll(/(\w+)\s+--\s+(\w+)/g)) {
    names.add(match[1]);
    names.add(match[2]);
  }
  const nodes = [...names].filter((name) => name !== "class").map((name) => ({
    id: name,
    label: name,
  }));
  return nodes.length ? { nodes } : null;
}

export function parsePie(text) {
  let title = "";
  const items = [];
  for (const line of extractMermaidSource(text).split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    const titleMatch = trimmed.match(/^title\s+(.+)/i);
    if (titleMatch) {
      title = cleanLabel(titleMatch[1]);
      continue;
    }
    const quoted = trimmed.match(/^"([^"]+)"\s*:\s*([\d.]+)/);
    const plain = trimmed.match(/^([^:]+):\s*([\d.]+)/);
    const match = quoted || plain;
    if (match) items.push({ label: cleanLabel(match[1]), value: Number(match[2]) });
  }
  return items.length ? { title, items } : null;
}

export function fallbackLayoutFor(text) {
  const kind = detectDiagramKind(text);
  return {
    kind,
    sequence: kind === "sequence" ? parseSequenceDiagram(text) : null,
    mindmap: kind === "mindmap" ? parseMindmap(text) : null,
    timeline: kind === "timeline" ? parseTimeline(text) : null,
    boxes: kind === "class" || kind === "er" ? parseClassBoxes(text) : null,
    pie: kind === "pie" ? parsePie(text) : null,
    flow: flowchartToLayout(text),
  };
}
