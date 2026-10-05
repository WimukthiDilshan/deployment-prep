const MAX_VIDEO_SEC = 15 * 60;

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function mergeIntervals(intervals) {
  const sorted = (Array.isArray(intervals) ? intervals : [])
    .map((pair) => [Number(pair?.[0]), Number(pair?.[1])])
    .filter(
      ([start, end]) =>
        Number.isFinite(start) && Number.isFinite(end) && end - start >= 0.05
    )
    .map(([start, end]) => {
      const a = Math.max(0, Math.min(start, end));
      const b = Math.min(MAX_VIDEO_SEC, Math.max(start, end));
      return [round2(a), round2(b)];
    })
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  if (!sorted.length) return [];

  const out = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = out[out.length - 1];
    const current = sorted[i];
    if (current[0] <= last[1] + 0.08) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      out.push(current.slice());
    }
  }
  return out;
}

function normalizeIntervals(raw, durationSec = MAX_VIDEO_SEC) {
  const cap = Math.min(
    MAX_VIDEO_SEC,
    Math.max(0, Number(durationSec) || MAX_VIDEO_SEC)
  );
  return mergeIntervals(raw)
    .map(([start, end]) => [start, Math.min(end, cap)])
    .filter(([start, end]) => end - start >= 0.05)
    .slice(0, 400);
}

function coveredSeconds(intervals) {
  return (Array.isArray(intervals) ? intervals : []).reduce((sum, pair) => {
    const start = Number(pair?.[0]);
    const end = Number(pair?.[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return sum;
    }
    return sum + (end - start);
  }, 0);
}

module.exports = {
  MAX_VIDEO_SEC,
  mergeIntervals,
  normalizeIntervals,
  coveredSeconds,
};
