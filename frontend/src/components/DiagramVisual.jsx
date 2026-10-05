import { detectDiagramKind } from '../utils/asciiDiagram';
import { fallbackLayoutFor, KIND_LABEL } from '../utils/diagramKinds';
import SimpleFlowchart from './SimpleFlowchart';

function TreeNode({ node }) {
  if (!node) return null;
  return (
    <div className="diagram-tree-node">
      <div className="diagram-tree-label">{node.label}</div>
      {node.children?.length ? (
        <div className="diagram-tree-children">
          {node.children.map((child, index) => (
            <TreeNode key={`${child.label}-${index}`} node={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SequenceView({ data }) {
  return (
    <div className="diagram-seq">
      <div
        className="diagram-seq-actors"
        style={{ gridTemplateColumns: `repeat(${data.actors.length}, minmax(7rem, 1fr))` }}
      >
        {data.actors.map((actor) => (
          <div key={actor} className="diagram-seq-actor">
            {actor}
          </div>
        ))}
      </div>
      <ul className="diagram-seq-messages">
        {data.messages.map((message, index) => (
          <li key={`${message.from}-${message.to}-${index}`}>
            <strong>{message.from}</strong>
            <span className="diagram-seq-arrow">→</span>
            <strong>{message.to}</strong>
            {message.text ? <em>{message.text}</em> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineView({ data }) {
  return (
    <div className="diagram-timeline">
      {data.title ? <h3>{data.title}</h3> : null}
      <ol>
        {data.events.map((event, index) => (
          <li key={`${event.when}-${index}`}>
            <span className="diagram-timeline-when">{event.when}</span>
            <span className="diagram-timeline-text">
              {event.section ? `${event.section}: ` : ""}
              {event.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PieView({ data }) {
  const total = data.items.reduce((sum, item) => sum + (item.value || 0), 0) || 1;
  return (
    <div className="diagram-pie">
      {data.title ? <h3>{data.title}</h3> : null}
      {data.items.map((item) => (
        <div key={item.label} className="diagram-pie-row">
          <span>{item.label}</span>
          <span
            className="diagram-pie-bar"
            style={{ width: `${Math.max(8, (item.value / total) * 100)}%` }}
          />
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function BoxGrid({ nodes }) {
  return (
    <div className="diagram-boxes">
      {nodes.map((node) => (
        <div key={node.id} className="simple-flow-node">
          {node.label}
        </div>
      ))}
    </div>
  );
}

export default function DiagramVisual({ definition, kind }) {
  const resolvedKind = kind || detectDiagramKind(definition);
  const fallback = fallbackLayoutFor(definition);
  let body = null;

  if (resolvedKind === "sequence" && fallback.sequence) {
    body = <SequenceView data={fallback.sequence} />;
  } else if (resolvedKind === "mindmap" && fallback.mindmap) {
    body = (
      <div className="diagram-tree">
        <TreeNode node={fallback.mindmap} />
      </div>
    );
  } else if (resolvedKind === "timeline" && fallback.timeline) {
    body = <TimelineView data={fallback.timeline} />;
  } else if (resolvedKind === "pie" && fallback.pie) {
    body = <PieView data={fallback.pie} />;
  } else if ((resolvedKind === "class" || resolvedKind === "er") && fallback.boxes) {
    body = <BoxGrid nodes={fallback.boxes.nodes} />;
  } else if (fallback.flow) {
    body = (
      <SimpleFlowchart
        definition={definition}
        direction={resolvedKind === "linear" ? "LR" : "TB"}
      />
    );
  }

  if (!body) return null;

  return (
    <figure className={`diagram-visual diagram-visual--${resolvedKind}`}>
      <figcaption>{KIND_LABEL[resolvedKind] || "Diagram"}</figcaption>
      {body}
    </figure>
  );
}
