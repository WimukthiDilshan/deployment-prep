import { useEffect, useState } from 'react';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';

const POLL_MS = 2500;

export default function LessonQueueProgress({ courseId }) {
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = String(courseId || '').trim();
    if (!id) return undefined;
    let cancelled = false;

    const tick = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await axios.get(
          `${getGatewayBaseUrl()}/api/courses/${encodeURIComponent(id)}/processing-queue`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (cancelled) return;
        setQueue(res.data?.data || null);
        setError('');
      } catch (e) {
        if (cancelled) return;
        setError(e.response?.data?.message || '');
      }
    };

    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [courseId]);

  if (!courseId) return null;

  const pending = Number(queue?.pendingCount || 0);
  const total = Number(queue?.totalCount || 0);
  const completed = Number(queue?.completedCount || 0);
  const percent = Math.max(0, Math.min(100, Number(queue?.percent) || 0));
  const enrollmentOpen = Boolean(queue?.enrollmentOpen);
  const showBar = pending > 0 || (total > 0 && completed > 0);

  if (!showBar && !error) return null;

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1rem 1.15rem',
        marginBottom: '1.25rem',
        border: pending
          ? '1px solid rgba(251, 191, 36, 0.35)'
          : '1px solid rgba(34, 197, 94, 0.28)',
      }}
    >
      <p
        style={{
          fontWeight: 700,
          fontSize: '0.92rem',
          margin: '0 0 0.35rem 0',
        }}
      >
        Processing queue
      </p>
      <p
        style={{
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          margin: '0 0 0.7rem 0',
          lineHeight: 1.45,
        }}
      >
        {pending > 0
          ? `Subsections run one at a time. ${completed} of ${Math.max(total, completed + pending)} complete. Students cannot enroll until this queue finishes.`
          : enrollmentOpen
            ? 'Queue complete. Students can enroll in this course.'
            : 'No subsections are waiting. Add materials, then they will enter this queue.'}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        style={{
          height: '10px',
          borderRadius: '999px',
          background: 'rgba(148, 163, 184, 0.25)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${percent}%`,
            background: pending
              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
              : 'linear-gradient(90deg, #16a34a, #4ade80)',
            transition: 'width 0.35s ease',
          }}
        />
      </div>
      <p
        style={{
          fontSize: '0.78rem',
          margin: '0.45rem 0 0 0',
          color: pending ? '#fbbf24' : '#86efac',
          fontWeight: 600,
        }}
      >
        {percent}% complete
        {pending > 0
          ? ` · ${pending} in queue${queue?.activeSubsectionId ? ' · processing now' : ''}`
          : ''}
      </p>
      {error ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '0.4rem 0 0 0' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
