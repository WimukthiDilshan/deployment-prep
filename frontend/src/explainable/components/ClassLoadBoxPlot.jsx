import {
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarize(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    q1: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    q3: percentile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };
}

const labelMap = {
  1: 'Very Low',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Very High',
};

export default function ClassLoadBoxPlot({ values }) {
  const stats = summarize(values ?? []);
  const points = (values ?? []).map((value, index) => ({ x: value, y: 0, index }));

  if (!stats) {
    return <p className="muted">No distribution data available yet.</p>;
  }

  return (
    <div className="box-plot-wrap">
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart margin={{ top: 24, right: 18, left: 8, bottom: 22 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tickFormatter={(tick) => labelMap[tick] || tick}
          />
          <YAxis type="number" domain={[-0.5, 0.5]} hide />
          <Tooltip
            formatter={(value) => [labelMap[value] || value, 'Cognitive Load']}
            labelFormatter={() => 'Student'}
          />
          <ReferenceArea x1={stats.q1} x2={stats.q3} y1={-0.25} y2={0.25} fill="#d8e7f3" fillOpacity={0.9} />
          <ReferenceLine x={stats.median} stroke="#184e77" strokeWidth={3} />
          <ReferenceLine x={stats.min} stroke="#5f5a55" strokeDasharray="4 4" />
          <ReferenceLine x={stats.max} stroke="#5f5a55" strokeDasharray="4 4" />
          <Scatter name="Students" data={points} fill="#184e77" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="muted tiny-text">
        Min: {labelMap[Math.round(stats.min)]} · Median: {labelMap[Math.round(stats.median)]} · Max: {labelMap[Math.round(stats.max)]}
      </p>
    </div>
  );
}
