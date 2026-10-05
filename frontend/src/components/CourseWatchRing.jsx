import { formatWatchClock, motivationCopy } from '../utils/videoWatchProgress';
import './CourseWatchRing.css';

function pieFill(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return `conic-gradient(from -90deg, #2563eb 0%, #7c3aed ${p}%, #e2e8f0 ${p}% 100%)`;
}

export function MiniWatchRing({ percent = 0, complete = false }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));

  if (complete) {
    return (
      <span className="course-watch__mini-done" aria-hidden="true">
        ✓
      </span>
    );
  }

  return (
    <span
      className="course-watch__mini-pie"
      style={{ background: pieFill(p) }}
      aria-hidden="true"
    />
  );
}

export function CatalogWatchPie({ percent = 0, size = 38 }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const hole = Math.round(size * 0.62);
  return (
    <span
      className="course-mine__pie"
      style={{ width: size, height: size, background: pieFill(p) }}
      aria-hidden="true"
    >
      <span className="course-mine__pie-hole" style={{ width: hole, height: hole }}>
        {Math.round(p)}
      </span>
    </span>
  );
}

export function CourseWatchRing({ summary, compact = false }) {
  const percent = Math.max(0, Math.min(100, Number(summary?.percent) || 0));
  const watchedSec = Number(summary?.watchedSec) || 0;
  const totalSec = Number(summary?.totalSec) || 0;
  const videoCount = Number(summary?.videoCount) || 0;

  if (videoCount <= 0 && totalSec <= 0 && percent <= 0) return null;

  return (
    <section
      className={`course-watch${compact ? ' course-watch--compact' : ''}`}
      aria-label={`Course video progress, ${Math.round(percent)} percent watched`}
    >
      <div
        className="course-watch__pie"
        style={{ background: pieFill(percent) }}
        aria-hidden="true"
      >
        <span className="course-watch__pie-hole">
          <strong>{Math.round(percent)}</strong>
          <em>%</em>
        </span>
      </div>
      <div className="course-watch__copy">
        <p className="course-watch__kicker">Your progress</p>
        <p className="course-watch__line">
          {totalSec > 0
            ? `${formatWatchClock(watchedSec)} of ${formatWatchClock(totalSec)} watched`
            : 'Open a lecture to start the ring'}
        </p>
        <p className="course-watch__nudge">{motivationCopy(percent)}</p>
      </div>
    </section>
  );
}
