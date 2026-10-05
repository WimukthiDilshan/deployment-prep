import {
  parseAsciiBoxTable,
} from '../utils/asciiDiagram';

function bodyLines(body) {
  return String(body || '')
    .split('\n')
    .map((line) => line.replace(/^•\s*/, '').trim())
    .filter(Boolean);
}

export default function ConceptBoard({ block }) {
  const parsed = parseAsciiBoxTable(block);
  if (!parsed?.cards?.length) {
    return <pre className="assistant-md-ascii-fallback">{block}</pre>;
  }
  const columns = Math.min(Math.max(parsed.columnCount, 1), 3);

  return (
    <div className="assistant-concept-board">
      {parsed.title ? (
        <header className="assistant-concept-board-header">
          <h3>{parsed.title}</h3>
          {parsed.subtitle ? <p>{parsed.subtitle}</p> : null}
        </header>
      ) : null}
      <div
        className="assistant-concept-board-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {parsed.cards.map((card, index) => (
          <article key={`${card.title}-${index}`} className="assistant-concept-card">
            {card.title ? <h4>{card.title}</h4> : null}
            <ul>
              {bodyLines(card.body).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
