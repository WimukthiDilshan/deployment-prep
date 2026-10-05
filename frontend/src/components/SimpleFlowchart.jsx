import { flowchartToLayout } from '../utils/asciiDiagram';

export default function SimpleFlowchart({ definition, direction }) {
  const layout = flowchartToLayout(definition);
  if (!layout?.layers?.length) return null;

  const dir = direction || layout.direction;
  const isRow = dir === 'LR' || dir === 'RL';
  return (
    <div
      className={`simple-flow ${isRow ? 'simple-flow--lr' : 'simple-flow--tb'}`}
      role="img"
      aria-label="Flowchart"
    >
      {layout.layers.map((layer, index) => (
        <div key={`layer-${index}`} className="simple-flow-group">
          <div className="simple-flow-layer">
            {layer.map((node) => (
              <div key={node.id} className="simple-flow-node">
                {node.label}
              </div>
            ))}
          </div>
          {index < layout.layers.length - 1 ? (
            <div className="simple-flow-arrow" aria-hidden="true">
              {isRow ? '→' : '↓'}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
