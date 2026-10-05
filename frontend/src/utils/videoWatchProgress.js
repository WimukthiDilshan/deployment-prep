const MAX_VIDEO_SEC = 15 * 60;
const STORAGE_PREFIX = 'courseWatchProgress';

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function getWatchUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.id) return String(user.id);
  } catch {
    // guest
  }
  return 'guest';
}

export function mergeIntervals(intervals) {
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

export function coveredSeconds(intervals) {
  return (Array.isArray(intervals) ? intervals : []).reduce((sum, pair) => {
    const start = Number(pair?.[0]);
    const end = Number(pair?.[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return sum;
    }
    return sum + (end - start);
  }, 0);
}

export function addPlaybackInterval(intervals, from, to, durationSec) {
  const cap = Math.min(MAX_VIDEO_SEC, Math.max(0, Number(durationSec) || MAX_VIDEO_SEC));
  const start = Math.max(0, Math.min(Number(from) || 0, Number(to) || 0));
  const end = Math.min(cap, Math.max(Number(from) || 0, Number(to) || 0));
  if (end - start < 0.08) return mergeIntervals(intervals);
  return mergeIntervals([...(intervals || []), [start, end]]);
}

function storageKey(courseId, userId) {
  return `${STORAGE_PREFIX}:${userId || 'guest'}:${courseId}`;
}

export function loadLocalProgress(courseId, userId) {
  if (!courseId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(courseId, userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const lessons = parsed?.lessons && typeof parsed.lessons === 'object' ? parsed.lessons : parsed;
    const map = {};
    Object.entries(lessons || {}).forEach(([id, lesson]) => {
      map[String(id)] = {
        durationSec: Math.max(0, Number(lesson?.durationSec) || 0),
        intervals: mergeIntervals(lesson?.intervals),
      };
    });
    return map;
  } catch {
    return {};
  }
}

export function saveLocalProgress(courseId, userId, lessons) {
  if (!courseId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(courseId, userId),
      JSON.stringify({ version: 1, lessons: lessons || {} })
    );
  } catch {
    // ignore quota / private mode
  }
}

export function mergeLessonMaps(...maps) {
  const next = {};
  maps.forEach((map) => {
    Object.entries(map || {}).forEach(([id, lesson]) => {
      const prev = next[id] || { durationSec: 0, intervals: [] };
      next[id] = {
        durationSec: Math.max(
          Number(prev.durationSec) || 0,
          Number(lesson?.durationSec) || 0
        ),
        intervals: mergeIntervals([
          ...(prev.intervals || []),
          ...(lesson?.intervals || []),
        ]),
      };
    });
  });
  return next;
}

export function seedDurationsFromSections(sections, lessons = {}) {
  const next = { ...lessons };
  (Array.isArray(sections) ? sections : []).forEach((section) => {
    (section?.subsections || []).forEach((sub) => {
      if (!sub?.videoUrl) return;
      const id = String(sub.id);
      const durationSec = Math.max(0, Number(sub.videoDurationSec) || 0);
      if (!next[id]) {
        next[id] = { durationSec, intervals: [] };
        return;
      }
      if (durationSec > (Number(next[id].durationSec) || 0)) {
        next[id] = { ...next[id], durationSec };
      }
    });
  });
  return next;
}

export function summarizeCourseWatch(sections, lessons = {}) {
  let totalSec = 0;
  let watchedSec = 0;
  let videoCount = 0;
  let completedCount = 0;
  const byLesson = {};

  (Array.isArray(sections) ? sections : []).forEach((section) => {
    (section?.subsections || []).forEach((sub) => {
      if (!sub?.videoUrl) return;
      const id = String(sub.id);
      const stored = lessons[id] || {};
      const durationSec = Math.max(
        0,
        Number(stored.durationSec) || Number(sub.videoDurationSec) || 0
      );
      const uniqueSec = Math.min(durationSec || coveredSeconds(stored.intervals), coveredSeconds(stored.intervals));
      const percent = durationSec > 0 ? Math.min(100, (uniqueSec / durationSec) * 100) : 0;
      videoCount += 1;
      if (durationSec > 0) {
        totalSec += durationSec;
        watchedSec += uniqueSec;
      }
      if (percent >= 95) completedCount += 1;
      byLesson[id] = {
        durationSec,
        watchedSec: uniqueSec,
        percent,
        complete: percent >= 95,
      };
    });
  });

  const percent = totalSec > 0 ? (watchedSec / totalSec) * 100 : 0;
  return {
    videoCount,
    completedCount,
    watchedSec,
    totalSec,
    percent: Math.max(0, Math.min(100, percent)),
    byLesson,
  };
}

export function summarizeStoredWatch(courseId, userId) {
  const lessons = loadLocalProgress(courseId, userId);
  let totalSec = 0;
  let watchedSec = 0;
  let videoCount = 0;
  Object.values(lessons).forEach((lesson) => {
    const durationSec = Math.max(0, Number(lesson?.durationSec) || 0);
    const uniqueSec = Math.min(
      durationSec || coveredSeconds(lesson?.intervals),
      coveredSeconds(lesson?.intervals)
    );
    if (durationSec > 0 || uniqueSec > 0) videoCount += 1;
    if (durationSec > 0) {
      totalSec += durationSec;
      watchedSec += uniqueSec;
    }
  });
  const percent = totalSec > 0 ? (watchedSec / totalSec) * 100 : 0;
  return {
    videoCount,
    watchedSec,
    totalSec,
    percent: Math.max(0, Math.min(100, percent)),
  };
}

export function formatWatchClock(totalSeconds) {
  const sec = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes}m ${seconds}s`;
}

export function motivationCopy(percent) {
  if (percent >= 99.5) return 'You finished every lecture video.';
  if (percent >= 75) return 'Almost there — keep watching.';
  if (percent >= 50) return 'Halfway through the course videos.';
  if (percent >= 25) return 'Nice start. Stay with the lecture.';
  if (percent > 0) return 'Every minute you watch fills the ring.';
  return 'Watch the videos to fill your course ring.';
}

export function probeVideoDuration(url) {
  return new Promise((resolve) => {
    const src = String(url || '').trim();
    if (!src || typeof document === 'undefined') {
      resolve(0);
      return;
    }
    const video = document.createElement('video');
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(Number(video.duration));
    video.onerror = () => finish(0);
    window.setTimeout(() => finish(0), 8000);
    video.src = src;
  });
}

export { MAX_VIDEO_SEC };
