import {
  detectDiagramKind,
  extractVisualSegments,
  flowchartToLayout,
  sanitizeMermaidDefinition,
} from '../src/utils/asciiDiagram.js';
import {
  parseMindmap,
  parseSequenceDiagram,
  parseTimeline,
} from '../src/utils/diagramKinds.js';

const samples = [
  `flowchart LR
    A[Sunlight] --> B[Chlorophyll captures light]
    B --> C[Energy for reaction]
    D[Water (root)] --> C
    E[CO₂ (air)] --> C
    C --> F[Glucose (plant food)]
    C --> G[Oxygen (released)]`,
  `Visual Summary (Mermaid Diagram)
flowchart LR
    S["Sunlight"] --> C["Chlorophyll"]
    C --> W["Water + CO₂"]
    W --> G["Glucose + O₂"]
    G --> P["Plant uses Glucose"]
    G --> O["O₂ released"]
`,
  `\`\`\`mermaid
flowchart TB
  title["Carbon dioxide (from air)"]
  n0["**Inputs (What plants use)**"]
  n0 --> n1["Glucose (food/energy)"]
\`\`\``,
];

for (const [index, sample] of samples.entries()) {
  const sanitized = sanitizeMermaidDefinition(sample);
  const layout = flowchartToLayout(sample);
  const segments = extractVisualSegments(sample);
  console.log(`--- sample ${index + 1} ---`);
  console.log(sanitized);
  console.log('kind', detectDiagramKind(sample));
  console.log(
    'layout layers',
    layout?.layers?.map((layer) => layer.map((node) => node.label))
  );
  console.log(
    'segments',
    segments.map((part) => `${part.type}:${part.content.split('\n')[0].slice(0, 40)}`)
  );
  if (/[₀-₉]/.test(sanitized) || /\[[^"\]]+\(/.test(sanitized)) {
    throw new Error(`Sample ${index + 1} still has unsafe mermaid labels`);
  }
}

const sequence = parseSequenceDiagram(`sequenceDiagram
    participant Leaf
    participant Sun
    Sun->>Leaf: light
    Leaf-->>Sun: oxygen
`);
if (!sequence || sequence.actors.length < 2 || sequence.messages.length !== 2) {
  throw new Error(`sequence parse failed ${JSON.stringify(sequence)}`);
}

const tree = parseMindmap(`mindmap
  root((Photosynthesis))
    Inputs
      Sunlight
      Water
    Outputs
      Glucose
`);
if (!tree || tree.label !== "Photosynthesis" || tree.children.length !== 2) {
  throw new Error(`mindmap parse failed ${JSON.stringify(tree)}`);
}

const timeline = parseTimeline(`timeline
    title Plant growth
    Seed : germinates
    Leaf : photosynthesizes
`);
if (!timeline || timeline.events.length !== 2) {
  throw new Error(`timeline parse failed ${JSON.stringify(timeline)}`);
}

if (detectDiagramKind("sequenceDiagram\nA->>B: hi") !== "sequence") {
  throw new Error("sequence kind failed");
}
if (detectDiagramKind("flowchart LR\nA-->B") !== "linear") {
  throw new Error("linear kind failed");
}

const numbered = extractVisualSegments(`1. Sunlight hits chlorophyll
2. Water splits in the leaf
3. Glucose is made`);
if (numbered.some((part) => part.type === "process")) {
  throw new Error("numbered lists should stay markdown, not become diagrams");
}

console.log("ok");
