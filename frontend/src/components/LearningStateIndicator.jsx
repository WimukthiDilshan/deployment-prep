import { useMemo, useState } from 'react';

const LOAD_CLASS = {
  'Very Low': 'very-low',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  'Very High': 'very-high',
};

const TREND_CLASS = {
  rising: 'rising',
  decreasing: 'decreasing',
  stable: 'stable',
  fluctuating: 'fluctuating',
};

const LOAD_LABEL = {
  'Very Low': 'Calm',
  Low: 'Calm',
  Medium: 'Focused',
  High: 'Heavy',
  'Very High': 'Intense',
};

const LOAD_SCORE = {
  'Very Low': 1,
  Low: 2,
  Medium: 3,
  High: 4,
  'Very High': 5,
};

const TREND_SYMBOL = {
  rising: 'up',
  decreasing: 'down',
  stable: 'steady',
  fluctuating: 'wave',
};

const GRAPH_WIDTH = 230;
const GRAPH_HEIGHT = 132;
const GRAPH_TOP = 12;
const GRAPH_RIGHT = 12;
const GRAPH_BOTTOM = 40;
const GRAPH_LEFT = 54;

function readableValue(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildGraphPoints(timeline = []) {
  const points = timeline
    .map((item) => {
      const isSkipped =
        item.prediction_status === 'not_reliable' ||
        item.status === 'skipped' ||
        item.predicted_load === 'Skipped';

      return {
        minuteIndex: item.minute_index,
        score: isSkipped
          ? 0
          : Number(item.predicted_score) || LOAD_SCORE[item.predicted_load] || 0,
        label: isSkipped ? 'Skipped' : item.predicted_load || 'Unknown',
        reason: item.reason || item.reliability_reason || '',
        activity: isSkipped ? 'Inactive' : item.activity || 'Active',
        skipped: isSkipped,
      };
    })
    .filter((item) => item.skipped || item.score > 0)
    .slice(-8);

  if (!points.length) return [];

  const drawableWidth = GRAPH_WIDTH - GRAPH_LEFT - GRAPH_RIGHT;
  const drawableHeight = GRAPH_HEIGHT - GRAPH_TOP - GRAPH_BOTTOM;
  const stepWidth = points.length > 1 ? drawableWidth / (points.length - 1) : 0;

  return points.map((item, index) => ({
    ...item,
    x: points.length > 1 ? GRAPH_LEFT + stepWidth * index : GRAPH_LEFT + drawableWidth / 2,
    y: item.skipped
      ? GRAPH_HEIGHT - 20
      : GRAPH_TOP + ((5 - item.score) / 4) * drawableHeight,
    xLabel: item.minuteIndex ? `W${item.minuteIndex}` : `W${index + 1}`,
  }));
}

export default function LearningStateIndicator({ analysis, loading = false, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const graphPoints = useMemo(
    () => buildGraphPoints(analysis?.timeline),
    [analysis?.timeline],
  );
  const latestPoint = graphPoints[graphPoints.length - 1];
  const previousPoint = [...graphPoints].reverse().find((point) => point !== latestPoint && !point.skipped);
  const reliablePointCount = graphPoints.filter((point) => !point.skipped).length;
  const hasEnoughTrendData =
    Boolean(analysis) &&
    analysis?.risk_level !== 'insufficient_data' &&
    reliablePointCount > 1 &&
    !latestPoint?.skipped;
  const displayLoad = hasEnoughTrendData ? analysis?.current_load : null;
  const displayTrend = hasEnoughTrendData ? analysis?.trend : 'stable';
  const loadClass = LOAD_CLASS[displayLoad] || 'unknown';
  const trendClass = TREND_CLASS[displayTrend] || 'stable';
  const showAlertIcon = loadClass === 'high' || loadClass === 'very-high';
  const loadScore = LOAD_SCORE[displayLoad] || 0;
  const loadLabel = LOAD_LABEL[displayLoad] || 'Waiting';
  const trendLabel = hasEnoughTrendData ? TREND_SYMBOL[displayTrend] || 'steady' : 'steady';
  const graphPaths = graphPoints.reduce((paths, point) => {
    if (point.skipped) {
      return paths;
    }

    const previous = graphPoints[graphPoints.indexOf(point) - 1];
    if (!paths.length || previous?.skipped) {
      paths.push(`M ${point.x} ${point.y}`);
    } else {
      paths[paths.length - 1] += ` L ${point.x} ${point.y}`;
    }
    return paths;
  }, []);
  const loadShift =
    latestPoint && previousPoint && !latestPoint.skipped
      ? latestPoint.score - previousPoint.score
      : 0;
  const shiftLabel = loadShift > 0 ? `+${loadShift}` : String(loadShift);
  const latestActivity = latestPoint?.activity || (latestPoint ? 'Active' : 'Waiting');
  const title = hasEnoughTrendData
    ? `${analysis.current_load || 'Unknown'} load, ${readableValue(
        analysis.trend,
      )} trend`
    : 'Learning state is waiting for enough video activity.';

  return (
    <div className={`learning-state-wrap${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className={`learning-state learning-state--${loadClass}${
          loading ? ' is-loading' : ''
        }${isOpen ? ' is-open' : ''}`}
        aria-label={`${title}. Click to ${isOpen ? 'hide' : 'show'} learning graph.`}
        aria-expanded={isOpen}
        title={title}
        onClick={() => setIsOpen((open) => !open)}
      >
        <div className="learning-state__orb" aria-hidden="true">
          <div className="learning-state__ring">
            {showAlertIcon ? (
              <span className={`learning-state__alert learning-state__alert--${loadClass}`} />
            ) : (
              <span className={`learning-state__trend learning-state__trend--${trendClass}`} />
            )}
          </div>
          <span className="learning-state__glow" />
        </div>
        <div className="learning-state__content" aria-hidden="true">
          <span className="learning-state__eyebrow">Learning Pulse</span>
          <strong>{loadLabel}</strong>
          <span className="learning-state__meta">{trendLabel}</span>
          <div className="learning-state__dots">
            {[1, 2, 3, 4, 5].map((step) => (
              <span
                key={step}
                className={step <= loadScore ? 'is-active' : ''}
              />
            ))}
          </div>
        </div>
      </button>

      {isOpen ? (
        <div className={`learning-state-graph learning-state-graph--${loadClass}`}>
          <div className="learning-state-graph__head">
            <span>Pulse Path</span>
            <strong>{readableValue(analysis?.trend || 'steady')}</strong>
          </div>
          <svg
            className="learning-state-graph__chart"
            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
            role="img"
            aria-label="Recent cognitive load trend graph"
          >
            <line x1={GRAPH_LEFT} y1={GRAPH_TOP} x2={GRAPH_LEFT} y2={GRAPH_HEIGHT - GRAPH_BOTTOM} />
            <line
              x1={GRAPH_LEFT}
              y1={GRAPH_HEIGHT - GRAPH_BOTTOM}
              x2={GRAPH_WIDTH - GRAPH_RIGHT}
              y2={GRAPH_HEIGHT - GRAPH_BOTTOM}
            />
            {[1, 2, 3, 4, 5].map((score) => {
              const y = GRAPH_TOP + ((5 - score) / 4) * (GRAPH_HEIGHT - GRAPH_TOP - GRAPH_BOTTOM);
              return (
                <line
                  key={score}
                  className="grid-line"
                  x1={GRAPH_LEFT}
                  y1={y}
                  x2={GRAPH_WIDTH - GRAPH_RIGHT}
                  y2={y}
                />
              );
            })}
            <text className="axis-label axis-label--high" x="2" y="15">
              High load
            </text>
            <text className="axis-label axis-label--low" x="2" y={GRAPH_HEIGHT - GRAPH_BOTTOM + 3}>
              Low load
            </text>
            {graphPaths.map((graphPath) => (
              <path key={graphPath} d={graphPath} />
            ))}
            {graphPoints.map((point) => (
              <g key={`${point.minuteIndex}-${point.score}-${point.label}`}>
                {point.skipped ? (
                  <text
                    className="skip-label"
                    x={point.x}
                    y={point.y - 8}
                    textAnchor="middle"
                  >
                    Skipped
                  </text>
                ) : null}
                <circle
                  className={point.skipped ? 'skipped-point' : ''}
                  cx={point.x}
                  cy={point.y}
                  r={point.skipped ? '4.8' : '4.4'}
                />
                <text
                  className="x-axis-label"
                  x={point.x}
                  y={GRAPH_HEIGHT - 4}
                  textAnchor="middle"
                >
                  {point.xLabel}
                </text>
              </g>
            ))}
          </svg>
          <div className="learning-state-graph__details">
            <span>
              <small>Window</small>
              <strong>{latestPoint?.xLabel || 'Waiting'}</strong>
            </span>
            <span>
              <small>Latest</small>
              <strong>{latestPoint?.label || analysis?.current_load || 'Waiting'}</strong>
            </span>
            <span>
              <small>Activity</small>
              <strong>{latestActivity}</strong>
            </span>
          </div>
          <div className="learning-state-graph__chips">
            <span>
              {latestPoint?.skipped
                ? 'Insufficient Activity'
                : readableValue(analysis?.risk_level || 'waiting')}
            </span>
            <span>
              {latestPoint?.skipped
                ? readableValue(latestPoint.reason || 'skipped')
                : readableValue(analysis?.trend || 'steady')}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
