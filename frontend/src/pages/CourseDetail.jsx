import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';
import PaginatedAssistantContent from '../components/PaginatedAssistantContent';
import LearningStateIndicator from '../components/LearningStateIndicator';
import { fetchLoadTrend } from '../cognitiveLoad/apiClient';
import { selectBestOutputLocally } from '../utils/selectBestOutputLocal';
import { parseCanonicalEquations } from '../utils/assistantMath';
import {
  COGNITIVE_LOAD_PERSONALIZATION_MESSAGE,
  enableWatchNotifications,
  showHighLoadPersonalizationNotification,
} from '../utils/pushNotifications';
import {
  addPlaybackInterval,
  coveredSeconds,
  getWatchUserId,
  loadLocalProgress,
  mergeLessonMaps,
  probeVideoDuration,
  saveLocalProgress,
  seedDurationsFromSections,
  summarizeCourseWatch,
} from '../utils/videoWatchProgress';
import { CourseWatchRing, MiniWatchRing } from '../components/CourseWatchRing';
import { isLessonPreparing } from '../utils/lessonStatus';
import './CourseDetail.css';

function buildGptAskUrls() {
  const base = getGatewayBaseUrl();
  return [
    `${base}/api/gpt/ask`,
    'http://localhost:4000/api/gpt/ask',
    'http://127.0.0.1:4000/api/gpt/ask',
    'http://localhost:5002/api/gpt/ask',
  ].filter((url, i, arr) => arr.indexOf(url) === i);
}

function buildDeepseekChatUrls() {
  const base = getGatewayBaseUrl();
  return [
    `${base}/api/deepseek/chat`,
    'http://localhost:4000/api/deepseek/chat',
    'http://127.0.0.1:4000/api/deepseek/chat',
    'http://localhost:5004/api/deepseek/chat',
  ].filter((url, i, arr) => arr.indexOf(url) === i);
}

function buildSelectBestUrls() {
  const base = getGatewayBaseUrl();
  return [
    `${base}/api/deepseek/select-best`,
    'http://localhost:4000/api/deepseek/select-best',
    'http://127.0.0.1:4000/api/deepseek/select-best',
    'http://localhost:5004/api/deepseek/select-best',
  ].filter((url, i, arr) => arr.indexOf(url) === i);
}

function buildGptPromptUrls() {
  const base = getGatewayBaseUrl();
  return [
    `${base}/api/gpt/build-prompt`,
    'http://localhost:4000/api/gpt/build-prompt',
    'http://127.0.0.1:4000/api/gpt/build-prompt',
    'http://localhost:5002/api/gpt/build-prompt',
  ].filter((url, i, arr) => arr.indexOf(url) === i);
}

const PLAYBACK_PROMPT_COPY = {
  highLoad: {
    title: 'Personalization',
    body: 'Do you need any personalization for this lesson?',
    extraInstruction:
      'The student asked for personalization for this lesson. Use the exact knowledge chunk. Match the visual-verbal and analytic-holistic styles from the student profile. Use the stored learner profile if it is present; if it is empty, leave it empty and do not invent one. Use the predicted cognitive load and the matching frustration level. Do not invent facts.',
  },
  shortEnd: {
    title: 'Personalization',
    body: 'Do you need any personalization for this lesson?',
    extraInstruction:
      'The student asked for personalization after a short lesson video. Use the exact knowledge chunk. Cognitive load is High and frustration is High. Do not use a measured cognitive style. Do not invent facts.',
  },
  longEnd: {
    title: 'Personalization',
    body: 'Do you need any personalization for this lesson?',
    extraInstruction:
      'The student asked for personalization at the end of this lesson. Use the exact knowledge chunk. Match the visual-verbal and analytic-holistic styles from the student profile. Use the stored learner profile if it is present; if it is empty, leave it empty and do not invent one. Use the latest predicted cognitive load and the matching frustration level. Do not invent facts.',
  },
};

function PlaybackPersonalizationPrompt({ kind, onYes, onNo, busy }) {
  const copy = PLAYBACK_PROMPT_COPY[kind];
  if (!copy) return null;
  return (
    <aside
      role="status"
      aria-live="polite"
      aria-labelledby="playback-personalization-title"
      className="course-learn__toast"
    >
      <p
        id="playback-personalization-title"
        style={{
          margin: 0,
          fontSize: '0.72rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: '#93c5fd',
        }}
      >
        {copy.title}
      </p>
      <p
        style={{
          margin: '0.4rem 0 0.75rem 0',
          fontSize: '0.9rem',
          lineHeight: 1.45,
          color: '#f8fafc',
        }}
      >
        {copy.body}
      </p>
      <div style={{ display: 'flex', gap: '0.45rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onYes}
          style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
        >
          {busy ? 'Working…' : 'Yes'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={onNo}
          style={{
            flex: 1,
            fontSize: '0.8rem',
            padding: '0.4rem 0.6rem',
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          No
        </button>
      </div>
    </aside>
  );
}

function subsectionDownloadUrl(courseId, subsectionId, kind) {
  return `${getGatewayBaseUrl()}/api/public/courses/${encodeURIComponent(
    courseId
  )}/subsections/${encodeURIComponent(subsectionId)}/${kind}`;
}

async function downloadSubsectionFile(event, url, fileName) {
  event.preventDefault();
  const fallbackName = fileName || 'download';
  try {
    const response = await fetch(url, { credentials: 'include' });
    const contentType = String(response.headers.get('content-type') || '');
    if (!response.ok) {
      let message = `Download failed (${response.status})`;
      if (contentType.includes('application/json')) {
        const body = await response.json().catch(() => null);
        if (body?.message) message = body.message;
      }
      throw new Error(message);
    }
    if (
      contentType.includes('application/json') ||
      contentType.includes('text/html')
    ) {
      throw new Error('The server did not return the original file.');
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  } catch (error) {
    if (error instanceof TypeError) {
      window.location.assign(url);
      return;
    }
    window.alert(error.message || 'Could not download the file.');
  }
}

function collectSubsectionImages(sub) {
  const seen = new Set();
  const images = [];
  const add = (img, fallbackSource) => {
    const url = String(img?.url || '').trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({
      id: String(img?.id || img?.publicId || url),
      url,
      publicId: img?.publicId || '',
      source: String(img?.source || fallbackSource || '').toLowerCase(),
      filePath: img?.filePath || '',
      pageNumber: Number(img?.pageNumber) || 0,
    });
  };
  (Array.isArray(sub?.extractedImages) ? sub.extractedImages : []).forEach((img) =>
    add(img, img?.source)
  );
  (Array.isArray(sub?.images) ? sub.images : []).forEach((img) => add(img, 'upload'));
  return images;
}

function lessonImageCaption(img, index) {
  if (img.source === 'ppt' && img.pageNumber) return `PPT · slide ${img.pageNumber}`;
  if (img.source === 'pdf' && img.pageNumber) return `PDF · page ${img.pageNumber}`;
  if (img.source === 'ppt') return 'PPT image';
  if (img.source === 'pdf') return 'PDF image';
  if (img.source === 'upload') return `Uploaded image ${index + 1}`;
  return `Lesson image ${index + 1}`;
}

function LessonImageGallery({ images, afterGptOutput = false }) {
  if (!Array.isArray(images) || images.length === 0) return null;
  return (
    <div
      style={{
        marginTop: '0.85rem',
        padding: '0.85rem',
        borderRadius: '10px',
        border: '1px solid #bfdbfe',
        background: '#f8fbff',
      }}
    >
      <p
        className="form-label"
        style={{ marginBottom: '0.35rem', fontSize: '0.75rem' }}
      >
        {afterGptOutput
          ? 'Figures from this lesson'
          : 'Lesson images'}
      </p>
      <p
        style={{
          margin: '0 0 0.65rem 0',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          lineHeight: 1.45,
        }}
      >
        These images were extracted from the PPT and PDF. They belong to the
        lesson content, so they are shown for every cognitive style.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '0.65rem',
        }}
      >
        {images.map((img, index) => {
          const caption = lessonImageCaption(img, index);
          return (
            <a
              key={img.id || `${img.url}-${index}`}
              href={img.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                textDecoration: 'none',
                color: 'inherit',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  display: 'block',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  height: '140px',
                }}
              >
                <img
                  src={img.url}
                  alt={caption}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#2563eb',
                  lineHeight: 1.35,
                }}
              >
                {caption}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/** Pretty-print dual-model selection reasoning in the browser console (for defense / debugging). */
function logOutputSelectionReasoning(data, { loadLevel, sourceChars } = {}) {
  const hf = data?.scores?.huggingface;
  const ds = data?.scores?.deepseek;
  const weights = data?.weights || {};
  const winner =
    data?.selectedModel === 'huggingface'
      ? 'Hugging Face'
      : data?.selectedModel === 'deepseek'
        ? 'DeepSeek'
        : data?.selectedModel || 'unknown';

  const row = (label, s) => {
    if (!s) {
      return { Model: label, Status: 'missing output' };
    }
    return {
      Model: label,
      Faithfulness: s.faithfulness == null ? 'n/a' : s.faithfulness,
      'Flesch (FRE)': s.fleschReadingEase,
      'Target FRE': s.targetFlesch,
      'Readability match': s.readabilityMatch,
      Composite: s.composite,
      Formula:
        s.faithfulness == null
          ? `composite = 1.0 * readabilityMatch = ${s.composite}`
          : `composite = ${(weights.faithfulness ?? 0.65)}*faithfulness + ${(weights.readabilityMatch ?? 0.35)}*readabilityMatch = ${s.composite}`,
    };
  };

  console.groupCollapsed(
    `%c[Assistant Select-Best]%c Winner → ${winner}`,
    'color:#2563eb;font-weight:700',
    'color:inherit;font-weight:600'
  );
  console.log('Cognitive load level:', loadLevel);
  console.log('Source content length (chars):', sourceChars);
  console.log('Faithfulness method:', data?.faithfulnessMethod || 'n/a');
  console.log('Reason:', data?.reason || 'n/a');
  if (data?.warning) {
    console.warn('Warning:', data.warning);
  }
  console.log('Weights:', weights);
  console.table([row('Hugging Face', hf), row('DeepSeek', ds)]);

  if (hf && ds) {
    const delta = Number(
      (Number(hf.composite) - Number(ds.composite)).toFixed(4)
    );
    console.log(
      'Composite delta (HF - DeepSeek):',
      delta,
      delta > 0
        ? '→ Hugging Face higher'
        : delta < 0
          ? '→ DeepSeek higher'
          : '→ tie (faithfulness tie-break applies)'
    );
  }

  console.log('Selected model:', data?.selectedModel);
  console.log(
    'Selected output preview:',
    String(data?.selectedText || '').slice(0, 280)
  );
  console.log('Full selection payload:', data);
  console.groupEnd();
}

const ABOUT_PREVIEW_WORDS = 20;
const COGNITIVE_LOAD_WINDOW_MS = 120000;
const PERSONALIZATION_VIDEO_SECONDS = 120;

function isShortLessonVideo(duration) {
  return Number.isFinite(duration) && duration > 0 && duration < PERSONALIZATION_VIDEO_SECONDS;
}

function normalizeLoadLevel(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'Unknown' || raw === 'Waiting for activity') return '';
  const key = raw.toLowerCase().replace(/[_-]+/g, ' ');
  const map = {
    'very low': 'Very Low',
    low: 'Low',
    medium: 'Medium',
    moderate: 'Medium',
    high: 'High',
    'very high': 'Very High',
  };
  return map[key] || '';
}

function isHighCognitiveLoad(level) {
  return level === 'High' || level === 'Very High';
}

const SEEK_JUMP_THRESHOLD_SECONDS = 2;
const SEEK_EVENT_DEBOUNCE_MS = 900;
const TRACKED_VIDEO_OWNER_TTL_MS = 6000;

function getTrackedVideoOwnerKey(courseId, subsectionId) {
  if (!courseId || !subsectionId) return '';
  return `cognitive-load:tracked-video-owner:${courseId}:${subsectionId}`;
}

function isTrackedVideoOwnerFresh(courseId, subsectionId) {
  const key = getTrackedVideoOwnerKey(courseId, subsectionId);
  if (!key) return false;

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return Date.now() - Number(parsed.updatedAt || 0) < TRACKED_VIDEO_OWNER_TTL_MS;
  } catch {
    return false;
  }
}

function getActiveStudentId() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return 'guest-user';
    const user = JSON.parse(raw);
    return String(
      user?.id ?? user?._id ?? user?.studentId ?? user?.email ?? 'guest-user'
    ).trim();
  } catch {
    return 'guest-user';
  }
}

function getLoggedInStudentId() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return String(user?.id ?? user?._id ?? '').trim();
  } catch {
    return '';
  }
}

function resolveVisualVerbalStyle(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Visual';
  const key = raw.toLowerCase().replace(/-/g, '/');
  if (key === 'verbal') return 'Verbal';
  if (
    key === 'intermediate' ||
    key === 'intermediary' ||
    key === 'intermediatory' ||
    key === 'moderate' ||
    key === 'moderate/intermediate' ||
    key === 'moderate/intermediatory'
  ) {
    return 'Intermediate';
  }
  if (key === 'visual') return 'Visual';
  return raw;
}

function resolveAnalyticHolisticStyle(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Analytic';
  const key = raw.toLowerCase();
  if (key === 'holistic' || key === 'wholistic') return 'Holistic';
  if (key === 'analytic' || key === 'analytical') return 'Analytic';
  return raw;
}

function resolveLearnerProfile(value) {
  return String(value ?? '').trim();
}

function buildLessonPromptPayload({
  courseName,
  subsectionTitle,
  knowledgeChunk,
  containsMath,
  studentYear,
  learnerProfile,
  visualVerbalStyle,
  analyticHolisticStyle,
  loadLevel,
  frustration,
}) {
  return {
    courseName: courseName || '',
    subsectionTitle: subsectionTitle || '',
    knowledgeChunk: knowledgeChunk || '',
    containsMath: Boolean(containsMath),
    studentProfile: {
      year: studentYear || '',
      learnerProfile: learnerProfile || '',
    },
    visualVerbalCognitiveStyle: visualVerbalStyle,
    analyticWholisticCognitiveStyle: analyticHolisticStyle,
    cognitiveLoad: {
      level: loadLevel,
      ...(frustration ? { frustration } : {}),
    },
  };
}

function splitWords(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function formatIsoDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function formatSeconds(value) {
  if (value == null || value === 'N/A') return 'N/A';
  return `${value}s`;
}

function getLivePredictionSummary(result) {
  if (!result || typeof result !== 'object') return null;

  const prediction =
    result.prediction && typeof result.prediction === 'object'
      ? result.prediction
      : null;
  const featureWindow =
    result.feature_window && typeof result.feature_window === 'object'
      ? result.feature_window
      : null;
  const predictionStatus =
    prediction?.prediction_status ?? result.prediction_status ?? 'reliable';
  const reliabilityReason = prediction?.reason ?? result.reason ?? '';

  return {
    rawEventCount:
      typeof result.raw_event_count === 'number' ? result.raw_event_count : null,
    predictedLoad:
      predictionStatus === 'not_reliable'
        ? 'Waiting for activity'
        : prediction?.predicted_cognitive_load ??
          prediction?.predicted_label ??
          result.predicted_cognitive_load ??
          result.predicted_label ??
          'Unknown',
    predictionStatus,
    reliabilityReason,
    minuteIndex:
      prediction?.minute_index ??
      featureWindow?.minute_index ??
      result.minute_index ??
      null,
    createdAt:
      prediction?.created_at ?? result.created_at ?? featureWindow?.window_end ?? '',
    pauseFrequency:
      prediction?.pause_frequency ??
      featureWindow?.pause_frequency ??
      result.pause_frequency ??
      null,
    rewatchSegments:
      prediction?.rewatch_segments ??
      featureWindow?.rewatch_segments ??
      result.rewatch_segments ??
      null,
    navigationCountVideo:
      prediction?.navigation_count_video ??
      featureWindow?.navigation_count_video ??
      result.navigation_count_video ??
      null,
    playbackRateChange:
      prediction?.playback_rate_change ??
      featureWindow?.playback_rate_change ??
      result.playback_rate_change ??
      null,
    idleDurationVideo:
      prediction?.idle_duration_video ??
      featureWindow?.idle_duration_video ??
      result.idle_duration_video ??
      null,
    pausedDurationVideo:
      prediction?.paused_duration_video ??
      featureWindow?.paused_duration_video ??
      result.paused_duration_video ??
      0,
    timeOnContent:
      prediction?.time_on_content ??
      featureWindow?.time_on_content ??
      result.time_on_content ??
      null,
  };
}

function appendSkippedTrendWindow(previousAnalysis, predictionResult) {
  const prediction = predictionResult?.prediction || predictionResult || {};
  const minuteIndex = prediction.minute_index ?? predictionResult?.minute_index ?? null;
  const timeline = Array.isArray(previousAnalysis?.timeline)
    ? previousAnalysis.timeline
    : [];
  const nextTimeline = [
    ...timeline.filter((item) => item.minute_index !== minuteIndex),
    {
      minute_index: minuteIndex,
      predicted_load: 'Skipped',
      predicted_score: null,
      prediction_status: 'not_reliable',
      reason: prediction.reason || 'Insufficient learning activity',
    },
  ].slice(-8);

  return {
    ...(previousAnalysis || {}),
    current_load: previousAnalysis?.current_load || null,
    trend: previousAnalysis?.trend || 'stable',
    risk_level: 'insufficient_data',
    timeline: nextTimeline,
  };
}

function mergeSkippedTrendWindows(previousAnalysis, nextAnalysis) {
  const skippedWindows = (previousAnalysis?.timeline || []).filter(
    (item) => item.prediction_status === 'not_reliable'
  );

  if (!skippedWindows.length) return nextAnalysis;

  const nextTimeline = [...(nextAnalysis?.timeline || [])];
  skippedWindows.forEach((skippedWindow) => {
    if (
      !nextTimeline.some(
        (item) => item.minute_index === skippedWindow.minute_index
      )
    ) {
      nextTimeline.push(skippedWindow);
    }
  });

  nextTimeline.sort((a, b) => Number(a.minute_index || 0) - Number(b.minute_index || 0));

  return {
    ...nextAnalysis,
    timeline: nextTimeline.slice(-8),
  };
}

function createEmptyRawEventStats() {
  return {
    pauseCount: 0,
    seekCount: 0,
    rewatchCount: 0,
    rateChangeCount: 0,
    idleDuration: 0,
    pausedDuration: 0,
    pauseStartedAtMs: null,
    lastEvent: '',
  };
}

function getRawEventLabel(eventType) {
  const labels = {
    play: 'Play',
    pause: 'Pause',
    seek_forward: 'Seek forward',
    seek_backward: 'Rewatch',
    rate_change: 'Rate change',
    adaptation_navigation: 'Video opened',
    adaptation_revisit: 'Adaptation revisit',
    adaptation_idle: 'Adaptation idle',
    idle_start: 'Idle started',
    idle_end: 'Idle ended',
    quiz_submit: 'Quiz submitted',
  };

  return labels[eventType] ?? eventType ?? 'Unknown';
}

function getCognitiveLoadTheme(load) {
  const value = String(load || '').toLowerCase();

  if (value.includes('very high')) {
    return {
      bg: '#fff7f7',
      border: 'rgba(220, 38, 38, 0.28)',
      accent: '#dc2626',
      soft: '#fee2e2',
      text: '#991b1b',
    };
  }

  if (value.includes('high')) {
    return {
      bg: '#fffaf5',
      border: 'rgba(234, 88, 12, 0.28)',
      accent: '#ea580c',
      soft: '#ffedd5',
      text: '#9a3412',
    };
  }

  if (value.includes('medium')) {
    return {
      bg: '#f8fbff',
      border: 'rgba(37, 99, 235, 0.22)',
      accent: '#2563eb',
      soft: '#dbeafe',
      text: '#1e40af',
    };
  }

  if (value.includes('low')) {
    return {
      bg: '#f4fdf8',
      border: 'rgba(5, 150, 105, 0.24)',
      accent: '#059669',
      soft: '#d1fae5',
      text: '#047857',
    };
  }

  return {
    bg: '#ffffff',
    border: 'rgba(148, 163, 184, 0.35)',
    accent: '#2563eb',
    soft: '#f1f5f9',
    text: '#334155',
  };
}

function MiniMetric({ label, value }) {
  return (
    <div className="course-learn__mini-metric">
      <div className="course-learn__mini-metric-label">{label}</div>
      <div className="course-learn__mini-metric-value">{value}</div>
    </div>
  );
}

function updateRawEventStats(previousStats, payload) {
  const nextStats = {
    ...previousStats,
    lastEvent: getRawEventLabel(payload.event_type),
  };

  if (payload.event_type === 'pause') {
    nextStats.pauseCount += 1;
    nextStats.pauseStartedAtMs = nextStats.pauseStartedAtMs || Date.now();
  } else if (payload.event_type === 'play' && nextStats.pauseStartedAtMs) {
    nextStats.pausedDuration += Math.max(
      1,
      Math.round((Date.now() - nextStats.pauseStartedAtMs) / 1000)
    );
    nextStats.pauseStartedAtMs = null;
  } else if (payload.event_type === 'seek_forward') {
    nextStats.seekCount += 1;
  } else if (payload.event_type === 'seek_backward') {
    nextStats.rewatchCount += 1;
  } else if (payload.event_type === 'rate_change') {
    nextStats.rateChangeCount += 1;
  } else if (payload.event_type === 'adaptation_idle') {
    nextStats.idleDuration += Number(payload.event_value || 0);
  }

  return nextStats;
}

function getStatsForPrediction(stats, windowEnd) {
  const nextStats = { ...stats };
  if (nextStats.pauseStartedAtMs) {
    const endMs = Math.min(Date.now(), windowEnd.getTime());
    nextStats.pausedDuration += Math.max(
      0,
      Math.round((endMs - nextStats.pauseStartedAtMs) / 1000)
    );
  }
  return nextStats;
}

function closePauseTimer(stats) {
  if (!stats?.pauseStartedAtMs) return stats;

  return {
    ...stats,
    pausedDuration:
      Number(stats.pausedDuration || 0) +
      Math.max(1, Math.round((Date.now() - stats.pauseStartedAtMs) / 1000)),
    pauseStartedAtMs: null,
  };
}

function getCompletedWindowInfo(sessionStart, sessionId, now = new Date()) {
  if (!(sessionStart instanceof Date) || !sessionId) {
    return null;
  }

  const elapsedMs = Math.max(0, now.getTime() - sessionStart.getTime());
  const completedWindowCount = Math.floor(elapsedMs / COGNITIVE_LOAD_WINDOW_MS);
  if (completedWindowCount < 1) {
    return null;
  }

  const minuteIndex = completedWindowCount;
  const windowStart = new Date(
    sessionStart.getTime() + (minuteIndex - 1) * COGNITIVE_LOAD_WINDOW_MS
  );
  const windowEnd = new Date(
    sessionStart.getTime() + minuteIndex * COGNITIVE_LOAD_WINDOW_MS
  );

  return {
    minuteIndex,
    windowStart,
    windowEnd,
    windowKey: `${sessionId}:${minuteIndex}`,
  };
}

function getActiveWindowKey(sessionStart, sessionId, now = new Date()) {
  if (!(sessionStart instanceof Date) || !sessionId) {
    return '';
  }

  const elapsedMs = Math.max(0, now.getTime() - sessionStart.getTime());
  const activeWindowIndex = Math.floor(elapsedMs / COGNITIVE_LOAD_WINDOW_MS) + 1;
  return `${sessionId}:${activeWindowIndex}`;
}

const CourseDetail = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  /** Below this width, sidebar stacks full-width (fixed ¼ width is unreadable). */
  const [stackLayout, setStackLayout] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 860px)').matches
      : false
  );
  const [course, setCourse] = useState(null);
  const [sections, setSections] = useState([]);
  const [preparingLessonCount, setPreparingLessonCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** section id → expanded */
  const [sectionOpen, setSectionOpen] = useState({});
  /** subsection id → show material links under that row (sidebar only) */
  const [openSubsectionId, setOpenSubsectionId] = useState(null);
  /** video shown in main column when user activates Video link */
  const [mainVideo, setMainVideo] = useState(null);
  /** About description: collapsed shows ~20 words */
  const [aboutExpanded, setAboutExpanded] = useState(false);
  /** Inline GPT assistant (when a subsection video is open) */
  const [gptQuestion, setGptQuestion] = useState('');
  const [gptAnswer, setGptAnswer] = useState('');
  const [deepseekAnswer, setDeepseekAnswer] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [selectionMeta, setSelectionMeta] = useState(null);
  const [selectionError, setSelectionError] = useState('');
  const [showBothOutputs, setShowBothOutputs] = useState(false);
  const [gptLoading, setGptLoading] = useState(false);
  const [gptError, setGptError] = useState('');
  const [deepseekError, setDeepseekError] = useState('');
  /** Pedagogical prompt (gpt-service prompt builder) */
  const [pedagogicalPrompt, setPedagogicalPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState('');
  const [studentYear, setStudentYear] = useState('');
  const [learnerProfile, setLearnerProfile] = useState('');
  const [visualVerbalStyle, setVisualVerbalStyle] = useState('Visual');
  const [analyticHolisticStyle, setAnalyticHolisticStyle] = useState('Analytic');
  const [loadLevel, setLoadLevel] = useState('Medium');
  const [profileOpen, setProfileOpen] = useState(false);
  const [cognitiveLoadOpen, setCognitiveLoadOpen] = useState(false);
  const [predictionFeaturesOpen, setPredictionFeaturesOpen] = useState(false);
  const [promptBarOpen, setPromptBarOpen] = useState(false);
  const [playbackPrompt, setPlaybackPrompt] = useState(null);
  const [cognitiveLoadResult, setCognitiveLoadResult] = useState(null);
  const [cognitiveLoadError, setCognitiveLoadError] = useState('');
  const [cognitiveLoadLoading, setCognitiveLoadLoading] = useState(false);
  const [loadTrendAnalysis, setLoadTrendAnalysis] = useState(null);
  const [loadTrendLoading, setLoadTrendLoading] = useState(false);
  const [videoSessionId, setVideoSessionId] = useState('');
  const [courseTrackingDisabled, setCourseTrackingDisabled] = useState(false);
  const [rawEventStats, setRawEventStats] = useState(createEmptyRawEventStats);
  const [watchLessons, setWatchLessons] = useState({});
  const videoRef = useRef(null);
  const askPanelRef = useRef(null);
  const playbackPromptRef = useRef(null);
  const endPromptShownRef = useRef(false);
  const shortVideoEndNotifiedRef = useRef(false);
  const longVideoEndNotifiedRef = useRef(false);
  const latestPredictedLoadRef = useRef('');
  const promptFrustrationOverrideRef = useRef('');
  const pedagogicalPromptRef = useRef('');
  const loadLevelRef = useRef('Medium');
  const promptLoadingRef = useRef(false);
  const highLoadLevelRef = useRef('High');
  const twoMinuteNotifyDoneRef = useRef(false);
  const personalizationAskInFlightRef = useRef(false);
  const startHighLoadPersonalizationRef = useRef(async () => {});
  const sessionStartRef = useRef(null);
  const lastVideoTimeRef = useRef(0);
  const seekStartTimeRef = useRef(0);
  const lastPlaybackRateRef = useRef(1);
  const idleStartRef = useRef(null);
  const lastInteractionTimeRef = useRef(Date.now());
  const isSeekingRef = useRef(false);
  const lastSeekEventTimeRef = useRef(0);
  const lastRewatchEventTimeRef = useRef(0);
  const suppressPauseCountUntilRef = useRef(0);
  const pauseConfirmTimeoutRef = useRef(null);
  const seekGestureStartTimeRef = useRef(0);
  const seekDragActiveRef = useRef(false);
  const pendingSeekTargetRef = useRef(null);
  const lastNavigationCommitTimeRef = useRef(0);
  const commitSeekTimeoutRef = useRef(null);
  const predictTimeoutRef = useRef(null);
  const lastPredictedWindowKeyRef = useRef('');
  const predictionInFlightWindowKeyRef = useRef('');
  const activeRawEventWindowKeyRef = useRef('');
  const rawEventQueueRef = useRef(Promise.resolve());
  const windowStatsByKeyRef = useRef({});
  const watchLessonsRef = useRef({});
  const lastPlaybackMarkRef = useRef(null);
  const persistWatchTimeoutRef = useRef(null);
  const watchUiTimeoutRef = useRef(null);
  const watchUserIdRef = useRef(getWatchUserId());
  const courseIdRef = useRef(courseId);

  const toggleSection = (sectionId) => {
    const k = String(sectionId);
    setSectionOpen((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const toggleSubsectionLinks = (subsectionId) => {
    const k = String(subsectionId);
    setOpenSubsectionId((prev) => (prev === k ? null : k));
  };

  courseIdRef.current = courseId;
  watchUserIdRef.current = getWatchUserId();
  const livePredictionSummary = getLivePredictionSummary(cognitiveLoadResult);
  const liveLoadStatus = livePredictionSummary?.predictedLoad || 'Collecting data';
  const liveLoadTheme = getCognitiveLoadTheme(liveLoadStatus);
  const liveLoadWindow =
    livePredictionSummary?.minuteIndex != null
      ? `Window #${livePredictionSummary.minuteIndex}`
      : 'Waiting for first 2-minute window';

  const clearWindowStats = () => {
    windowStatsByKeyRef.current = {};
    setRawEventStats(createEmptyRawEventStats());
  };

  const resetActiveWindowStats = (windowKey) => {
    const nextStats = createEmptyRawEventStats();
    if (videoRef.current?.paused && !videoRef.current?.ended) {
      nextStats.pauseStartedAtMs = Date.now();
      nextStats.lastEvent = 'Pause';
    }
    if (windowKey) {
      windowStatsByKeyRef.current[windowKey] = nextStats;
    }
    setRawEventStats(nextStats);
  };

  const updateStatsForWindow = (windowKey, payload) => {
    if (!windowKey) return;

    const nextStats = updateRawEventStats(
      windowStatsByKeyRef.current[windowKey] || createEmptyRawEventStats(),
      payload
    );
    windowStatsByKeyRef.current[windowKey] = nextStats;

    if (activeRawEventWindowKeyRef.current === windowKey) {
      setRawEventStats(nextStats);
    }
  };

  const closePauseTimerForActiveWindow = () => {
    const currentWindowKey = getActiveWindowKey(sessionStartRef.current, videoSessionId);
    if (!currentWindowKey) return;
    const nextStats = closePauseTimer(
      windowStatsByKeyRef.current[currentWindowKey] || createEmptyRawEventStats()
    );
    windowStatsByKeyRef.current[currentWindowKey] = nextStats;

    if (activeRawEventWindowKeyRef.current === currentWindowKey) {
      setRawEventStats(nextStats);
    }
  };

  useEffect(() => {
    setOpenSubsectionId(null);
    setMainVideo(null);
    setAboutExpanded(false);
    setGptQuestion('');
    setGptAnswer('');
    setDeepseekAnswer('');
    setSelectedAnswer('');
    setSelectionMeta(null);
    setSelectionError('');
    setShowBothOutputs(false);
    setGptError('');
    setDeepseekError('');
    setPedagogicalPrompt('');
    setPromptError('');
    setPlaybackPrompt(null);
    playbackPromptRef.current = null;
    endPromptShownRef.current = false;
    shortVideoEndNotifiedRef.current = false;
    longVideoEndNotifiedRef.current = false;
    latestPredictedLoadRef.current = '';
    promptFrustrationOverrideRef.current = '';
    twoMinuteNotifyDoneRef.current = false;
    setLoadLevel('Medium');
    setCognitiveLoadResult(null);
    setCognitiveLoadError('');
    setCognitiveLoadLoading(false);
    setLoadTrendAnalysis(null);
    setLoadTrendLoading(false);
    setVideoSessionId('');
    clearWindowStats();
    lastPredictedWindowKeyRef.current = '';
    predictionInFlightWindowKeyRef.current = '';
    activeRawEventWindowKeyRef.current = '';
  }, [courseId]);

  useEffect(() => {
    setGptQuestion('');
    setGptAnswer('');
    setDeepseekAnswer('');
    setSelectedAnswer('');
    setSelectionMeta(null);
    setSelectionError('');
    setShowBothOutputs(false);
    setGptError('');
    setDeepseekError('');
    setPedagogicalPrompt('');
    setPromptError('');
    setPlaybackPrompt(null);
    playbackPromptRef.current = null;
    endPromptShownRef.current = false;
    shortVideoEndNotifiedRef.current = false;
    longVideoEndNotifiedRef.current = false;
    latestPredictedLoadRef.current = '';
    promptFrustrationOverrideRef.current = '';
    twoMinuteNotifyDoneRef.current = false;
    setLoadLevel('Medium');
    setCourseTrackingDisabled(false);
  }, [mainVideo?.url]);

  useEffect(() => {
    const activeCourseId = String(courseId || '');
    const activeSubsectionId = String(mainVideo?.subsectionId || '');
    if (!activeCourseId || !activeSubsectionId) {
      setCourseTrackingDisabled(false);
      return undefined;
    }

    const refreshTrackingOwner = () => {
      const isOwnedByTrackedTab = isTrackedVideoOwnerFresh(
        activeCourseId,
        activeSubsectionId
      );
      setCourseTrackingDisabled(isOwnedByTrackedTab);
    };

    refreshTrackingOwner();
    const intervalId = window.setInterval(refreshTrackingOwner, 2000);
    const onStorage = (event) => {
      if (
        event.key ===
        getTrackedVideoOwnerKey(activeCourseId, activeSubsectionId)
      ) {
        refreshTrackingOwner();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
    };
  }, [courseId, mainVideo?.subsectionId, mainVideo?.url]);

  useEffect(() => {
    if (!mainVideo?.url) {
      sessionStartRef.current = null;
      setVideoSessionId('');
      clearWindowStats();
      lastVideoTimeRef.current = 0;
      lastPlaybackRateRef.current = 1;
      idleStartRef.current = null;
      lastInteractionTimeRef.current = Date.now();
      isSeekingRef.current = false;
      lastSeekEventTimeRef.current = 0;
      lastRewatchEventTimeRef.current = 0;
      lastPlaybackMarkRef.current = null;
      suppressPauseCountUntilRef.current = 0;
      seekGestureStartTimeRef.current = 0;
      seekDragActiveRef.current = false;
      pendingSeekTargetRef.current = null;
      lastNavigationCommitTimeRef.current = 0;
      lastPredictedWindowKeyRef.current = '';
      predictionInFlightWindowKeyRef.current = '';
      activeRawEventWindowKeyRef.current = '';
      if (pauseConfirmTimeoutRef.current) {
        window.clearTimeout(pauseConfirmTimeoutRef.current);
        pauseConfirmTimeoutRef.current = null;
      }
      if (commitSeekTimeoutRef.current) {
        window.clearTimeout(commitSeekTimeoutRef.current);
        commitSeekTimeoutRef.current = null;
      }
      if (predictTimeoutRef.current) {
        window.clearTimeout(predictTimeoutRef.current);
        predictTimeoutRef.current = null;
      }
      return undefined;
    }

    const startedAt = new Date();
    const sessionId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStartRef.current = startedAt;
    setVideoSessionId(sessionId);
    clearWindowStats();
    lastVideoTimeRef.current = 0;
    lastPlaybackRateRef.current = 1;
    idleStartRef.current = null;
    lastInteractionTimeRef.current = Date.now();
    isSeekingRef.current = false;
    lastSeekEventTimeRef.current = 0;
    lastRewatchEventTimeRef.current = 0;
    suppressPauseCountUntilRef.current = 0;
    seekGestureStartTimeRef.current = 0;
    seekDragActiveRef.current = false;
    pendingSeekTargetRef.current = null;
    lastNavigationCommitTimeRef.current = 0;
    lastPredictedWindowKeyRef.current = '';
    predictionInFlightWindowKeyRef.current = '';
    twoMinuteNotifyDoneRef.current = false;
    longVideoEndNotifiedRef.current = false;
    latestPredictedLoadRef.current = '';
    promptFrustrationOverrideRef.current = '';
    activeRawEventWindowKeyRef.current = getActiveWindowKey(startedAt, sessionId);
    resetActiveWindowStats(activeRawEventWindowKeyRef.current);

    return () => {
      if (pauseConfirmTimeoutRef.current) {
        window.clearTimeout(pauseConfirmTimeoutRef.current);
        pauseConfirmTimeoutRef.current = null;
      }
      if (commitSeekTimeoutRef.current) {
        window.clearTimeout(commitSeekTimeoutRef.current);
        commitSeekTimeoutRef.current = null;
      }
      if (predictTimeoutRef.current) {
        window.clearTimeout(predictTimeoutRef.current);
        predictTimeoutRef.current = null;
      }
    };
  }, [courseId, mainVideo?.lessonId, mainVideo?.subsectionId, mainVideo?.url]);

  const offerPersonalizationAfterLoadPrediction = async (predictedLoad) => {
    if (predictedLoad) {
      latestPredictedLoadRef.current = predictedLoad;
      highLoadLevelRef.current = predictedLoad;
      promptFrustrationOverrideRef.current = '';
    }
    if (twoMinuteNotifyDoneRef.current) return;
    const duration = Number(videoRef.current?.duration || 0);
    if (isShortLessonVideo(duration)) {
      twoMinuteNotifyDoneRef.current = true;
      return;
    }
    if (!predictedLoad) return;

    twoMinuteNotifyDoneRef.current = true;
    if (!isHighCognitiveLoad(predictedLoad)) return;

    playbackPromptRef.current = 'highLoad';
    setPlaybackPrompt('highLoad');
    void showHighLoadPersonalizationNotification({
      courseId,
      subsectionId: mainVideo?.subsectionId,
      loadLevel: predictedLoad,
      kind: 'highLoad',
      url: window.location.href,
    });
  };

  const runCognitiveLoadPredictionForCompletedWindow = async () => {
    if (
      courseTrackingDisabled ||
      !mainVideo?.url ||
      !videoSessionId ||
      !sessionStartRef.current
    ) {
      return;
    }

    const windowInfo = getCompletedWindowInfo(
      sessionStartRef.current,
      videoSessionId,
      new Date()
    );
    if (!windowInfo) {
      return;
    }

    const { minuteIndex, windowStart, windowEnd, windowKey } = windowInfo;

    if (
      lastPredictedWindowKeyRef.current === windowKey ||
      predictionInFlightWindowKeyRef.current === windowKey
    ) {
      return;
    }

    try {
      setCognitiveLoadLoading(true);
      setCognitiveLoadError('');
      predictionInFlightWindowKeyRef.current = windowKey;
      const completedWindowStats = getStatsForPrediction(
        windowStatsByKeyRef.current[windowKey] || createEmptyRawEventStats(),
        windowEnd
      );
      const windowSeconds = Math.max(
        0,
        Math.round((windowEnd.getTime() - windowStart.getTime()) / 1000)
      );
      const idleDurationVideo = Math.max(
        0,
        Number(completedWindowStats.idleDuration || 0)
      );
      const res = await axios.post(
        `${getGatewayBaseUrl()}/api/cognitive-load/predict`,
        {
          student_id: getActiveStudentId(),
          lesson_id: String(courseId),
          session_id: videoSessionId,
          minute_index: minuteIndex,
          window_start: windowStart.toISOString(),
          window_end: windowEnd.toISOString(),
          pause_frequency: completedWindowStats.pauseCount,
          navigation_count_video: completedWindowStats.seekCount,
          rewatch_segments: completedWindowStats.rewatchCount,
          playback_rate_change: completedWindowStats.rateChangeCount,
          idle_duration_video: idleDurationVideo,
          paused_duration_video: Math.max(
            0,
            Number(completedWindowStats.pausedDuration || 0)
          ),
          time_on_content: Math.max(
            0,
            windowSeconds -
              idleDurationVideo -
              Number(completedWindowStats.pausedDuration || 0)
          ),
          save_result: true,
        }
      );
      setCognitiveLoadResult(res.data);
      const nextPrediction = res.data?.prediction || res.data;
      const predictedLoad = normalizeLoadLevel(
        nextPrediction?.prediction_status === 'not_reliable'
          ? ''
          : nextPrediction?.predicted_cognitive_load ??
              nextPrediction?.predicted_label ??
              res.data?.predicted_cognitive_load ??
              res.data?.predicted_label
      );
      if (predictedLoad) {
        setLoadLevel(predictedLoad);
      }
      void offerPersonalizationAfterLoadPrediction(predictedLoad);
      if (nextPrediction?.prediction_status === 'not_reliable') {
        setLoadTrendAnalysis((previous) =>
          appendSkippedTrendWindow(previous, res.data)
        );
      } else {
        try {
          setLoadTrendLoading(true);
          const trend = await fetchLoadTrend(
            getActiveStudentId(),
            String(courseId),
            videoSessionId,
          );
          setLoadTrendAnalysis((previous) =>
            mergeSkippedTrendWindows(previous, trend)
          );
        } catch {
          setLoadTrendAnalysis(null);
        } finally {
          setLoadTrendLoading(false);
        }
      }
      lastPredictedWindowKeyRef.current = windowKey;
    } catch (error) {
      setCognitiveLoadError(
        error.response?.data?.detail?.[0]?.msg ||
          error.response?.data?.message ||
          error.message ||
          'Could not predict cognitive load for this video session.'
      );
    } finally {
      if (predictionInFlightWindowKeyRef.current === windowKey) {
        predictionInFlightWindowKeyRef.current = '';
      }
      setCognitiveLoadLoading(false);
    }
  };

  const enqueueRawEvent = ({ payload, sessionIdOverride, eventTime }) => {
    const activeSessionId = sessionIdOverride ?? videoSessionId;
    if (courseTrackingDisabled || !mainVideo?.url || !activeSessionId) {
      return Promise.resolve();
    }

    rawEventQueueRef.current = rawEventQueueRef.current
      .catch(() => {})
      .then(async () => {
        await axios.post(`${getGatewayBaseUrl()}/api/cognitive-load/events/raw`, {
          student_id: getActiveStudentId(),
          lesson_id: String(courseId),
          session_id: activeSessionId,
          event_time: eventTime,
          video_time: payload.video_time ?? null,
          from_position: payload.from_position ?? null,
          to_position: payload.to_position ?? null,
          event_value: payload.event_value ?? null,
          question_id: payload.question_id ?? null,
          is_correct: payload.is_correct ?? null,
          event_type: payload.event_type,
        });
      });

    return rawEventQueueRef.current;
  };

  const sendCognitiveLoadEvent = async (payload) => {
    if (courseTrackingDisabled || !mainVideo?.url || !videoSessionId) return;

    const eventTime = new Date().toISOString();
    const currentWindowKey = getActiveWindowKey(
      sessionStartRef.current,
      videoSessionId
    );

    if (
      currentWindowKey &&
      activeRawEventWindowKeyRef.current !== currentWindowKey
    ) {
      activeRawEventWindowKeyRef.current = currentWindowKey;
      resetActiveWindowStats(currentWindowKey);
    }

    updateStatsForWindow(currentWindowKey, payload);

    enqueueRawEvent({ payload, eventTime }).catch(() => {
      setCognitiveLoadError(
        'Could not send video interaction data to the cognitive load API.'
      );
    });
  };

  const markInteraction = () => {
    lastInteractionTimeRef.current = Date.now();

    if (idleStartRef.current) {
      sendCognitiveLoadEvent({
        event_type: 'idle_end',
        video_time: Number(videoRef.current?.currentTime?.toFixed(2) || 0),
      });
    }

    idleStartRef.current = null;
  };

  const applyWatchLessons = (next, { persistLocal = true } = {}) => {
    watchLessonsRef.current = next;
    setWatchLessons(next);
    if (persistLocal && courseIdRef.current) {
      saveLocalProgress(courseIdRef.current, watchUserIdRef.current, next);
    }
  };

  const flushWatchToServer = (subsectionId, lesson, { immediate = false } = {}) => {
    const id = String(subsectionId || '');
    const activeCourseId = String(courseIdRef.current || '').trim();
    if (!id || !activeCourseId || !lesson) return;

    const send = async () => {
      persistWatchTimeoutRef.current = null;
      const token = localStorage.getItem('token');
      try {
        await axios.put(
          `${getGatewayBaseUrl()}/api/public/courses/${encodeURIComponent(activeCourseId)}/watch-progress`,
          {
            subsectionId: id,
            durationSec: Number(lesson.durationSec) || 0,
            intervals: lesson.intervals || [],
          },
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }
        );
      } catch {
        // Local progress still stands if the server is unavailable.
      }
    };

    if (persistWatchTimeoutRef.current) {
      window.clearTimeout(persistWatchTimeoutRef.current);
      persistWatchTimeoutRef.current = null;
    }
    if (immediate) {
      send();
      return;
    }
    persistWatchTimeoutRef.current = window.setTimeout(send, 1500);
  };

  const recordWatchRange = (from, to, durationSec) => {
    const subsectionId = String(mainVideo?.subsectionId || '');
    if (!subsectionId) return;

    const prev = watchLessonsRef.current[subsectionId] || {
      durationSec: 0,
      intervals: [],
    };
    const nextDuration = Math.max(Number(prev.durationSec) || 0, Number(durationSec) || 0);
    const intervals = addPlaybackInterval(prev.intervals, from, to, nextDuration);
    if (
      nextDuration === (Number(prev.durationSec) || 0) &&
      coveredSeconds(intervals) === coveredSeconds(prev.intervals)
    ) {
      return;
    }

    const nextLesson = { durationSec: nextDuration, intervals };
    watchLessonsRef.current = {
      ...watchLessonsRef.current,
      [subsectionId]: nextLesson,
    };

    if (!watchUiTimeoutRef.current) {
      watchUiTimeoutRef.current = window.setTimeout(() => {
        watchUiTimeoutRef.current = null;
        applyWatchLessons(watchLessonsRef.current);
      }, 250);
    }

    flushWatchToServer(subsectionId, nextLesson);
  };

  const rememberVideoDuration = (durationSec) => {
    const subsectionId = String(mainVideo?.subsectionId || '');
    const duration = Number(durationSec) || 0;
    if (!subsectionId || duration < 1) return;
    const prev = watchLessonsRef.current[subsectionId] || {
      durationSec: 0,
      intervals: [],
    };
    if ((Number(prev.durationSec) || 0) >= duration) return;
    const nextLesson = { ...prev, durationSec: duration };
    applyWatchLessons({
      ...watchLessonsRef.current,
      [subsectionId]: nextLesson,
    });
    flushWatchToServer(subsectionId, nextLesson);
  };

  const flushCurrentWatch = () => {
    if (watchUiTimeoutRef.current) {
      window.clearTimeout(watchUiTimeoutRef.current);
      watchUiTimeoutRef.current = null;
      applyWatchLessons(watchLessonsRef.current);
    }
    const subsectionId = String(mainVideo?.subsectionId || '');
    if (!subsectionId) return;
    const lesson = watchLessonsRef.current[subsectionId];
    if (lesson) flushWatchToServer(subsectionId, lesson, { immediate: true });
  };

  const isPauseFromSeek = () => {
    const now = Date.now();
    const recentlySought = now - lastSeekEventTimeRef.current < 600;
    const recentlyRewatched = now - lastRewatchEventTimeRef.current < 3000;
    const inSuppressionWindow = now < suppressPauseCountUntilRef.current;

    return (
      isSeekingRef.current ||
      Boolean(videoRef.current?.seeking) ||
      recentlySought ||
      recentlyRewatched ||
      inSuppressionWindow
    );
  };

  const beginSeekGesture = () => {
    if (!seekDragActiveRef.current) {
      seekDragActiveRef.current = true;
      seekGestureStartTimeRef.current = seekStartTimeRef.current;
    }
  };

  const resetSeekGesture = () => {
    seekDragActiveRef.current = false;
    pendingSeekTargetRef.current = null;
    if (commitSeekTimeoutRef.current) {
      window.clearTimeout(commitSeekTimeoutRef.current);
      commitSeekTimeoutRef.current = null;
    }
  };

  const commitVideoNavigationEvent = ({ fromPosition, toPosition }) => {
    const from = Number(fromPosition || 0);
    const to = Number(toPosition || 0);
    const moveDistance = Math.abs(to - from);

    if (moveDistance < 0.5) {
      return false;
    }

    const now = Date.now();
    if (now - lastNavigationCommitTimeRef.current < SEEK_EVENT_DEBOUNCE_MS) {
      return false;
    }

    const isBackwardSeek = to < from - 0.25;

    lastNavigationCommitTimeRef.current = now;
    lastSeekEventTimeRef.current = now;
    suppressPauseCountUntilRef.current = now + 2500;
    lastVideoTimeRef.current = to;

    if (isBackwardSeek) {
      lastRewatchEventTimeRef.current = now;
    }

    sendCognitiveLoadEvent({
      event_type: isBackwardSeek ? 'seek_backward' : 'seek_forward',
      from_position: Number(from.toFixed(2)),
      to_position: Number(to.toFixed(2)),
      video_time: Number(to.toFixed(2)),
    });

    return true;
  };

  const handleVideoPause = () => {
    const pausePosition = Number(videoRef.current?.currentTime?.toFixed(2) || 0);

    if (pauseConfirmTimeoutRef.current) {
      window.clearTimeout(pauseConfirmTimeoutRef.current);
    }

    pauseConfirmTimeoutRef.current = window.setTimeout(() => {
      const positionChanged =
        Math.abs((videoRef.current?.currentTime || 0) - pausePosition) > 0.15;

      if (videoRef.current?.paused && !isPauseFromSeek() && !positionChanged) {
        sendCognitiveLoadEvent({
          event_type: 'pause',
          video_time: pausePosition,
        });
      }

      pauseConfirmTimeoutRef.current = null;
    }, 350);

    markInteraction();
    flushCurrentWatch();
  };

  const handleVideoPlay = () => {
    if (pauseConfirmTimeoutRef.current) {
      window.clearTimeout(pauseConfirmTimeoutRef.current);
      pauseConfirmTimeoutRef.current = null;
    }
    closePauseTimerForActiveWindow();
    lastPlaybackMarkRef.current = Number(videoRef.current?.currentTime || 0);
    markInteraction();
    enableWatchNotifications();
  };

  const handleVideoSeeking = () => {
    lastPlaybackMarkRef.current = null;
    seekStartTimeRef.current = lastVideoTimeRef.current;
    isSeekingRef.current = true;
    lastSeekEventTimeRef.current = Date.now();
    suppressPauseCountUntilRef.current = Date.now() + 2000;
    beginSeekGesture();
    markInteraction();
  };

  const handleVideoSeeked = () => {
    lastPlaybackMarkRef.current = Number(videoRef.current?.currentTime || 0);
    lastSeekEventTimeRef.current = Date.now();
    suppressPauseCountUntilRef.current = Date.now() + 2000;

    if (pauseConfirmTimeoutRef.current) {
      window.clearTimeout(pauseConfirmTimeoutRef.current);
      pauseConfirmTimeoutRef.current = null;
    }

    pendingSeekTargetRef.current = Number(videoRef.current?.currentTime?.toFixed(2) || 0);
    markInteraction();

    if (commitSeekTimeoutRef.current) {
      window.clearTimeout(commitSeekTimeoutRef.current);
    }

    commitSeekTimeoutRef.current = window.setTimeout(() => {
      const gestureStart = seekDragActiveRef.current
        ? seekGestureStartTimeRef.current
        : seekStartTimeRef.current;
      const finalTarget = Number(
        pendingSeekTargetRef.current ?? videoRef.current?.currentTime?.toFixed(2) ?? 0
      );

      commitVideoNavigationEvent({
        fromPosition: gestureStart,
        toPosition: finalTarget,
      });

      isSeekingRef.current = false;
      resetSeekGesture();
    }, 250);

    window.setTimeout(() => {
      if (!commitSeekTimeoutRef.current) {
        isSeekingRef.current = false;
      }
    }, 0);
  };

  const offerShortVideoEndPersonalization = () => {
    if (shortVideoEndNotifiedRef.current) return;
    const duration = Number(videoRef.current?.duration || 0);
    if (!isShortLessonVideo(duration)) return;

    shortVideoEndNotifiedRef.current = true;
    highLoadLevelRef.current = 'High';
    playbackPromptRef.current = 'shortEnd';
    setPlaybackPrompt('shortEnd');
    void showHighLoadPersonalizationNotification({
      courseId,
      subsectionId: mainVideo?.subsectionId,
      loadLevel: 'High',
      kind: 'shortEnd',
      body: 'Do you need any personalization for this lesson?',
      url: window.location.href,
    });
  };

  const offerLongVideoEndPersonalization = () => {
    if (longVideoEndNotifiedRef.current) return;
    const duration = Number(videoRef.current?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (isShortLessonVideo(duration)) return;

    const lastLoad =
      latestPredictedLoadRef.current ||
      normalizeLoadLevel(loadLevelRef.current) ||
      'Medium';

    longVideoEndNotifiedRef.current = true;
    highLoadLevelRef.current = lastLoad;
    playbackPromptRef.current = 'longEnd';
    setPlaybackPrompt('longEnd');
    void showHighLoadPersonalizationNotification({
      courseId,
      subsectionId: mainVideo?.subsectionId,
      loadLevel: lastLoad,
      kind: 'longEnd',
      body: 'Do you need any personalization for this lesson?',
      url: window.location.href,
    });
  };

  const dismissPlaybackPersonalizationPrompt = () => {
    playbackPromptRef.current = null;
    setPlaybackPrompt(null);
  };

  const handleVideoRateChange = () => {
    const currentRate = Number(videoRef.current?.playbackRate || 1);
    if (currentRate === lastPlaybackRateRef.current) return;
    lastPlaybackRateRef.current = currentRate;
    sendCognitiveLoadEvent({
      event_type: 'rate_change',
      event_value: String(currentRate),
      video_time: Number(videoRef.current?.currentTime?.toFixed(2) || 0),
    });
    markInteraction();
  };

  const handleVideoTimeUpdate = () => {
    const currentTime = Number(videoRef.current?.currentTime || 0);
    const previousTime = Number(lastVideoTimeRef.current || 0);
    const jumpDistance = Math.abs(currentTime - previousTime);
    const duration = Number(videoRef.current?.duration || 0);
    const isPlaying =
      Boolean(videoRef.current) &&
      !videoRef.current.paused &&
      !videoRef.current.ended &&
      !isSeekingRef.current &&
      !videoRef.current.seeking;

    if (isPlaying) {
      const prevMark = lastPlaybackMarkRef.current;
      if (prevMark == null) {
        lastPlaybackMarkRef.current = currentTime;
      } else if (currentTime >= prevMark && currentTime - prevMark <= 1.25) {
        recordWatchRange(prevMark, currentTime, duration);
        lastPlaybackMarkRef.current = currentTime;
      } else {
        lastPlaybackMarkRef.current = currentTime;
      }
    }

    if (jumpDistance > SEEK_JUMP_THRESHOLD_SECONDS) {
      commitVideoNavigationEvent({
        fromPosition: previousTime,
        toPosition: currentTime,
      });
    }

    lastVideoTimeRef.current = currentTime;

    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }
    if (isShortLessonVideo(duration)) {
      twoMinuteNotifyDoneRef.current = true;
      if (currentTime >= duration - 0.35) {
        offerShortVideoEndPersonalization();
      }
      return;
    }
    if (currentTime >= duration - 0.35) {
      offerLongVideoEndPersonalization();
    }
  };

  const handleVideoLoadedMetadata = () => {
    const duration = Number(videoRef.current?.duration || 0);
    rememberVideoDuration(duration);
    if (isShortLessonVideo(duration)) {
      twoMinuteNotifyDoneRef.current = true;
    }
  };

  const handleVideoEnded = () => {
    const duration = Number(videoRef.current?.duration || 0);
    const currentTime = Number(videoRef.current?.currentTime || 0);
    if (duration > 0) {
      recordWatchRange(Math.max(0, duration - 0.5), duration, duration);
    } else if (currentTime > 0) {
      recordWatchRange(Math.max(0, currentTime - 0.5), currentTime, currentTime);
    }
    flushCurrentWatch();
    if (isShortLessonVideo(duration)) {
      offerShortVideoEndPersonalization();
    } else {
      offerLongVideoEndPersonalization();
    }
    markInteraction();
  };

  useEffect(() => {
    if (!mainVideo?.url || !videoSessionId || courseTrackingDisabled) {
      return undefined;
    }

    const interactionEvents = ['mousemove', 'keydown', 'click'];
    const onInteraction = () => markInteraction();

    interactionEvents.forEach((eventName) => {
      document.addEventListener(eventName, onInteraction);
    });

    const idleCheckIntervalId = window.setInterval(() => {
      const inactiveMs = Date.now() - lastInteractionTimeRef.current;

      if (inactiveMs > 60000) {
        if (!idleStartRef.current) {
          idleStartRef.current = Date.now();
          sendCognitiveLoadEvent({
            event_type: 'idle_start',
            video_time: Number(videoRef.current?.currentTime?.toFixed(2) || 0),
          });
        } else {
          const activeWindowKey = activeRawEventWindowKeyRef.current;
          if (activeWindowKey) {
            const nextStats = {
              ...(windowStatsByKeyRef.current[activeWindowKey] ||
                createEmptyRawEventStats()),
              idleDuration:
                (windowStatsByKeyRef.current[activeWindowKey]?.idleDuration || 0) + 1,
            };
            windowStatsByKeyRef.current[activeWindowKey] = nextStats;
          }
          setRawEventStats((prev) => ({
            ...prev,
            idleDuration: prev.idleDuration + 1,
          }));
        }
      }
    }, 1000);

    return () => {
      interactionEvents.forEach((eventName) => {
        document.removeEventListener(eventName, onInteraction);
      });
      window.clearInterval(idleCheckIntervalId);
    };
  }, [mainVideo?.url, videoSessionId, courseTrackingDisabled]);

  useEffect(() => {
    if (
      !mainVideo?.url ||
      !videoSessionId ||
      !sessionStartRef.current ||
      courseTrackingDisabled
    ) {
      return undefined;
    }

    const scheduleNextWindowPrediction = () => {
      const sessionStart = sessionStartRef.current;
      if (!sessionStart) return;

      const now = Date.now();
      const elapsedMs = Math.max(0, now - sessionStart.getTime());
      const completedWindowCount = Math.floor(elapsedMs / COGNITIVE_LOAD_WINDOW_MS);
      const nextBoundaryMs =
        sessionStart.getTime() + (completedWindowCount + 1) * COGNITIVE_LOAD_WINDOW_MS;
      const delayMs = Math.max(0, nextBoundaryMs - now + 100);

      predictTimeoutRef.current = window.setTimeout(async () => {
        await runCognitiveLoadPredictionForCompletedWindow();
        activeRawEventWindowKeyRef.current = getActiveWindowKey(
          sessionStart,
          videoSessionId
        );
        resetActiveWindowStats(activeRawEventWindowKeyRef.current);
        scheduleNextWindowPrediction();
      }, delayMs);
    };

    scheduleNextWindowPrediction();

    return () => {
      if (predictTimeoutRef.current) {
        window.clearTimeout(predictTimeoutRef.current);
        predictTimeoutRef.current = null;
      }
    };
  }, [
    courseId,
    mainVideo?.url,
    mainVideo?.lessonId,
    mainVideo?.subsectionId,
    videoSessionId,
    courseTrackingDisabled,
  ]);

  useEffect(() => {
    let cancelled = false;
    const studentId = getLoggedInStudentId();
    if (!studentId) return undefined;

    (async () => {
      try {
        const res = await axios.get(
          `${getGatewayBaseUrl()}/api/auth/student/${encodeURIComponent(studentId)}`
        );
        if (cancelled) return;
        const student = res.data?.student || {};
        setVisualVerbalStyle(
          resolveVisualVerbalStyle(student.visualVerbalCognitiveStyle)
        );
        setAnalyticHolisticStyle(
          resolveAnalyticHolisticStyle(student.analyticWholisticCognitiveStyle)
        );
        setLearnerProfile(resolveLearnerProfile(student.learnerProfile));
      } catch {
        if (!cancelled) {
          setVisualVerbalStyle('Visual');
          setAnalyticHolisticStyle('Analytic');
          setLearnerProfile('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mainVideo?.url) {
      setPedagogicalPrompt('');
      setPromptLoading(false);
      setPromptError('');
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPromptLoading(true);
      setPromptError('');
      const body = buildLessonPromptPayload({
        courseName: course?.courseName,
        subsectionTitle: mainVideo.title,
        knowledgeChunk: mainVideo.knowledgeChunk,
        containsMath: mainVideo.containsMath,
        studentYear,
        learnerProfile,
        visualVerbalStyle,
        analyticHolisticStyle,
        loadLevel,
        frustration: promptFrustrationOverrideRef.current,
      });

      const urls = buildGptPromptUrls();
      let lastErr;
      try {
        let res;
        for (const url of urls) {
          try {
            res = await axios.post(url, body);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            if (e.response?.status === 404) continue;
            if (!e.response && e.code === 'ERR_NETWORK') continue;
            throw e;
          }
        }
        if (!res && lastErr) throw lastErr;
        if (!cancelled) {
          setPedagogicalPrompt(String(res.data?.data?.prompt || '').trim());
        }
      } catch (err) {
        if (!cancelled) {
          setPedagogicalPrompt('');
          setPromptError(
            [err.response?.data?.message, err.response?.data?.detail, err.message]
              .filter(Boolean)
              .join('\n\n') || 'Could not build pedagogical prompt.'
          );
        }
      } finally {
        if (!cancelled) setPromptLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    mainVideo?.url,
    mainVideo?.title,
    mainVideo?.knowledgeChunk,
    mainVideo?.containsMath,
    course?.courseName,
    studentYear,
    learnerProfile,
    visualVerbalStyle,
    analyticHolisticStyle,
    loadLevel,
  ]);

  useEffect(() => {
    pedagogicalPromptRef.current = pedagogicalPrompt;
  }, [pedagogicalPrompt]);

  useEffect(() => {
    loadLevelRef.current = loadLevel;
  }, [loadLevel]);

  useEffect(() => {
    promptLoadingRef.current = promptLoading;
  }, [promptLoading]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }
    const onMessage = (event) => {
      const data = event.data;
      if (data?.type !== COGNITIVE_LOAD_PERSONALIZATION_MESSAGE) return;
      if (data.action === 'no') return;
      if (data.courseId && String(data.courseId) !== String(courseId)) return;
      if (
        data.subsectionId &&
        mainVideo?.subsectionId &&
        String(data.subsectionId) !== String(mainVideo.subsectionId)
      ) {
        return;
      }
      startHighLoadPersonalizationRef.current({
        kind: data.kind,
        loadLevel: data.loadLevel,
      });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [courseId, mainVideo?.subsectionId]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const sync = () => setStackLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!courseId?.trim()) {
      setLoading(false);
      setError('Missing course id.');
      return undefined;
    }

    const loadCourse = async ({ silent } = {}) => {
      if (!silent) {
        setError('');
        setLoading(true);
      }
      try {
        const res = await axios.get(
          `${getGatewayBaseUrl()}/api/public/courses/${encodeURIComponent(courseId.trim())}`
        );
        const payload = res.data?.data;
        if (cancelled) return;
        const nextSections = Array.isArray(payload?.sections)
          ? payload.sections
          : [];
        setCourse(payload?.course ?? null);
        setSections(nextSections);
        setPreparingLessonCount(Number(payload?.preparingLessonCount || 0));
        setMainVideo((current) => {
          if (!current?.subsectionId) return current;
          const stillVisible = nextSections.some((section) =>
            (section.subsections || []).some(
              (sub) => String(sub.id) === String(current.subsectionId)
            )
          );
          return stillVisible ? current : null;
        });
      } catch (e) {
        if (cancelled || silent) return;
        setCourse(null);
        setSections([]);
        setPreparingLessonCount(0);
        setError(
          e.response?.status === 404
            ? 'Course not found.'
            : e.response?.data?.message ||
                e.message ||
                'Could not load course.'
        );
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    loadCourse();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    if (!courseId?.trim() || preparingLessonCount <= 0) return undefined;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const res = await axios.get(
          `${getGatewayBaseUrl()}/api/public/courses/${encodeURIComponent(courseId.trim())}`
        );
        if (cancelled) return;
        const payload = res.data?.data;
        const nextSections = Array.isArray(payload?.sections)
          ? payload.sections
          : [];
        setCourse(payload?.course ?? null);
        setSections(nextSections);
        setPreparingLessonCount(Number(payload?.preparingLessonCount || 0));
        setMainVideo((current) => {
          if (!current?.subsectionId) return current;
          const stillVisible = nextSections.some((section) =>
            (section.subsections || []).some(
              (sub) => String(sub.id) === String(current.subsectionId)
            )
          );
          return stillVisible ? current : null;
        });
      } catch {
        // Keep the last successful course view if a quiet refresh fails.
      }
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [courseId, preparingLessonCount]);

  useEffect(() => {
    if (!courseId?.trim()) {
      watchLessonsRef.current = {};
      setWatchLessons({});
      return undefined;
    }

    let cancelled = false;
    const userId = getWatchUserId();
    const local = loadLocalProgress(courseId, userId);
    watchLessonsRef.current = local;
    setWatchLessons(local);

    const token = localStorage.getItem('token');
    (async () => {
      try {
        const res = await axios.get(
          `${getGatewayBaseUrl()}/api/public/courses/${encodeURIComponent(
            courseId.trim()
          )}/watch-progress`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        if (cancelled) return;
        const remoteLessons = {};
        Object.entries(res.data?.data?.lessons || {}).forEach(([id, lesson]) => {
          remoteLessons[String(id)] = {
            durationSec: Number(lesson?.durationSec) || 0,
            intervals: Array.isArray(lesson?.intervals) ? lesson.intervals : [],
          };
        });
        const merged = mergeLessonMaps(
          watchLessonsRef.current,
          loadLocalProgress(courseId, userId),
          remoteLessons
        );
        watchLessonsRef.current = merged;
        setWatchLessons(merged);
        saveLocalProgress(courseId, userId, merged);
      } catch {
        // Keep the local ring if the progress API is unavailable.
      }
    })();

    return () => {
      cancelled = true;
      if (persistWatchTimeoutRef.current) {
        window.clearTimeout(persistWatchTimeoutRef.current);
        persistWatchTimeoutRef.current = null;
      }
      if (watchUiTimeoutRef.current) {
        window.clearTimeout(watchUiTimeoutRef.current);
        watchUiTimeoutRef.current = null;
      }
    };
  }, [courseId]);

  useEffect(() => {
    if (!sections.length) return;
    const next = seedDurationsFromSections(sections, watchLessonsRef.current);
    watchLessonsRef.current = next;
    setWatchLessons(next);
  }, [sections]);

  useEffect(() => {
    let cancelled = false;
    const missing = [];
    sections.forEach((section) => {
      (section.subsections || []).forEach((sub) => {
        if (!sub?.videoUrl) return;
        const id = String(sub.id);
        const known =
          Number(watchLessonsRef.current[id]?.durationSec) ||
          Number(sub.videoDurationSec) ||
          0;
        if (known <= 0) missing.push({ id, url: sub.videoUrl });
      });
    });
    if (!missing.length) return undefined;

    (async () => {
      const found = {};
      await Promise.all(
        missing.map(async ({ id, url }) => {
          const duration = await probeVideoDuration(url);
          if (duration >= 1) found[id] = duration;
        })
      );
      if (cancelled || !Object.keys(found).length) return;
      const next = { ...watchLessonsRef.current };
      Object.entries(found).forEach(([id, durationSec]) => {
        const prev = next[id] || { durationSec: 0, intervals: [] };
        next[id] = {
          ...prev,
          durationSec: Math.max(Number(prev.durationSec) || 0, durationSec),
        };
      });
      watchLessonsRef.current = next;
      setWatchLessons(next);
      if (courseIdRef.current) {
        saveLocalProgress(courseIdRef.current, watchUserIdRef.current, next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sections]);

  useEffect(() => {
    const persistHidden = () => {
      const id = String(mainVideo?.subsectionId || '');
      if (watchUiTimeoutRef.current) {
        window.clearTimeout(watchUiTimeoutRef.current);
        watchUiTimeoutRef.current = null;
        applyWatchLessons(watchLessonsRef.current);
      }
      const lesson = id ? watchLessonsRef.current[id] : null;
      if (lesson) flushWatchToServer(id, lesson, { immediate: true });
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') persistHidden();
    };
    window.addEventListener('pagehide', persistHidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      persistHidden();
      window.removeEventListener('pagehide', persistHidden);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mainVideo?.subsectionId]);

  const visibleLessonCount = sections.reduce(
    (count, section) =>
      count + (Array.isArray(section.subsections) ? section.subsections.length : 0),
    0
  );
  const watchSummary = summarizeCourseWatch(sections, watchLessons);
  const canonicalEquations = parseCanonicalEquations(mainVideo?.knowledgeChunk);

  const askCourseGpt = async (extraInstruction) => {
    setGptError('');
    setDeepseekError('');
    setSelectionError('');
    setGptAnswer('');
    setDeepseekAnswer('');
    setSelectedAnswer('');
    setSelectionMeta(null);
    setShowBothOutputs(false);

    const token = localStorage.getItem('token');
    if (!token) {
      setGptError('Sign in to use the assistant (open /login in another tab).');
      return;
    }

    const prompt = (pedagogicalPromptRef.current || pedagogicalPrompt).trim();
    const studentQuestion = gptQuestion.trim();
    const extra =
      typeof extraInstruction === 'string' ? extraInstruction.trim() : '';
    const q = [prompt, studentQuestion ? `Student question: ${studentQuestion}` : '', extra]
      .filter(Boolean)
      .join('\n\n');
    if (!q) {
      setGptError('Wait for the subsection prompt to load, or type a question.');
      return;
    }

    const authHeaders = { Authorization: `Bearer ${token}` };
    const sourceContent = String(mainVideo?.knowledgeChunk || '').slice(0, 12000);

    const postWithFallback = async (urls, body, retryStatuses = [404]) => {
      let lastErr;
      for (const url of urls) {
        try {
          const res = await axios.post(url, body, {
            headers: authHeaders,
            timeout: 180000,
          });
          return res;
        } catch (e) {
          lastErr = e;
          const status = e.response?.status;
          if (retryStatuses.includes(status)) continue;
          if (
            !e.response &&
            (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED')
          ) {
            continue;
          }
          throw e;
        }
      }
      throw lastErr || new Error('No reachable endpoint.');
    };

    try {
      setGptLoading(true);

      const [hfResult, deepseekResult] = await Promise.allSettled([
        postWithFallback(buildGptAskUrls(), { question: q }),
        postWithFallback(buildDeepseekChatUrls(), {
          message: q,
          history: [],
        }, [404, 502, 503, 504]),
      ]);

      let hfText = '';
      let dsText = '';

      if (hfResult.status === 'fulfilled') {
        const payload = hfResult.value.data?.data;
        if (payload?.skipped) {
          setGptError(
            'Hugging Face did not generate a reply. Set HF_GENERATION_ENABLED=true in gpt-service/.env and restart gpt-service.'
          );
        } else {
          hfText = String(payload?.answer || '').trim();
          setGptAnswer(hfText);
          if (!hfText) {
            setGptError('Hugging Face returned an empty answer.');
          }
        }
      } else {
        const err = hfResult.reason;
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          throw err;
        }
        setGptError(
          [
            err?.response?.data?.message,
            err?.response?.data?.detail,
            err?.message,
          ]
            .filter(Boolean)
            .join('\n\n') || 'Hugging Face assistant request failed.'
        );
      }

      if (deepseekResult.status === 'fulfilled') {
        const dsPayload = deepseekResult.value.data?.data || deepseekResult.value.data || {};
        dsText = String(dsPayload.answer || dsPayload.converted || '').trim();
        setDeepseekAnswer(dsText);
        if (!dsText) {
          setDeepseekError('DeepSeek returned an empty answer.');
        }
      } else {
        const err = deepseekResult.reason;
        setDeepseekError(
          [
            err?.response?.data?.message,
            err?.response?.data?.detail,
            err?.message,
          ]
            .filter(Boolean)
            .join('\n\n') || 'DeepSeek assistant request failed.'
        );
      }

      if (!hfText && !dsText) {
        return;
      }

      setShowBothOutputs(true);

      // Cross-check both outputs against original source; pick less-hallucinated / better-fit text.
      try {
        const selectRes = await postWithFallback(buildSelectBestUrls(), {
          sourceContent,
          gptOutput: hfText,
          deepseekOutput: dsText,
          cognitiveLoadLevel: loadLevelRef.current || loadLevel,
        });
        const data = selectRes.data?.data;
        setSelectedAnswer(String(data?.selectedText || '').trim());
        setSelectionMeta(data || null);
        logOutputSelectionReasoning(data, {
          loadLevel: loadLevelRef.current || loadLevel,
          sourceChars: sourceContent.length,
        });
      } catch (selectErr) {
        console.warn(
          'select-best API failed; using local fallback scorer.',
          selectErr?.response?.status || selectErr?.message || selectErr
        );
        const local = selectBestOutputLocally({
          sourceContent,
          gptOutput: hfText,
          deepseekOutput: dsText,
          cognitiveLoadLevel: loadLevelRef.current || loadLevel,
        });
        if (!local.success) {
          setSelectionError(local.message || 'Could not select best output.');
          return;
        }
        setSelectedAnswer(String(local.selectedText || '').trim());
        setSelectionMeta(local);
        setSelectionError('');
        logOutputSelectionReasoning(local, {
          loadLevel: loadLevelRef.current || loadLevel,
          sourceChars: sourceContent.length,
        });
        console.warn(
          'Tip: restart deepseek-service so /api/deepseek/select-best returns 200 (currently missing on the running process).'
        );
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setGptError(
        [err.response?.data?.message, err.response?.data?.detail, err.message]
          .filter(Boolean)
          .join('\n\n') || 'Assistant request failed.'
      );
    } finally {
      setGptLoading(false);
    }
  };

  const startForcedHighPersonalization = async () => {
    if (personalizationAskInFlightRef.current) return;
    personalizationAskInFlightRef.current = true;
    try {
      dismissPlaybackPersonalizationPrompt();
      setLoadLevel('High');
      highLoadLevelRef.current = 'High';
      setPromptBarOpen(true);
      askPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const body = buildLessonPromptPayload({
        courseName: course?.courseName,
        subsectionTitle: mainVideo?.title,
        knowledgeChunk: mainVideo?.knowledgeChunk,
        containsMath: mainVideo?.containsMath,
        studentYear,
        learnerProfile,
        visualVerbalStyle,
        analyticHolisticStyle,
        loadLevel: 'High',
      });
      let promptText = '';
      let lastErr;
      for (const url of buildGptPromptUrls()) {
        try {
          const res = await axios.post(url, body);
          promptText = String(res.data?.data?.prompt || '').trim();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (e.response?.status === 404) continue;
          if (!e.response && e.code === 'ERR_NETWORK') continue;
          throw e;
        }
      }
      if (!promptText && lastErr) throw lastErr;
      if (promptText) {
        pedagogicalPromptRef.current = promptText;
        setPedagogicalPrompt(promptText);
      }

      await askCourseGpt(PLAYBACK_PROMPT_COPY.shortEnd.extraInstruction);
    } catch (err) {
      setGptError(
        [err.response?.data?.message, err.response?.data?.detail, err.message]
          .filter(Boolean)
          .join('\n\n') || 'Could not start short-lesson personalization.'
      );
    } finally {
      personalizationAskInFlightRef.current = false;
    }
  };

  const startHighLoadPersonalization = async (level) => {
    const normalized =
      normalizeLoadLevel(level) || highLoadLevelRef.current || 'High';
    if (personalizationAskInFlightRef.current) return;
    personalizationAskInFlightRef.current = true;
    try {
      dismissPlaybackPersonalizationPrompt();
      promptFrustrationOverrideRef.current = '';
      setLoadLevel(normalized);
      highLoadLevelRef.current = normalized;
      setPromptBarOpen(true);
      askPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const prompt = pedagogicalPromptRef.current || '';
          if (
            prompt.includes(`Level: ${normalized}`) &&
            !promptLoadingRef.current
          ) {
            resolve();
            return;
          }
          if (Date.now() - started > 4000) {
            resolve();
            return;
          }
          window.setTimeout(tick, 50);
        };
        tick();
      });
      await askCourseGpt(
        `The student asked for personalization for this lesson. Use the exact knowledge chunk. Match the student's visual-verbal style (${visualVerbalStyle}) and analytic-holistic style (${analyticHolisticStyle}) from their profile.${
          learnerProfile
            ? ` Match the stored learner profile (${learnerProfile}).`
            : ' Learner profile is empty; do not invent one.'
        } Use cognitive load ${normalized} with the matching frustration level. Do not invent facts.`
      );
    } finally {
      personalizationAskInFlightRef.current = false;
    }
  };
  startHighLoadPersonalizationRef.current = (payload) => {
    if (payload?.kind === 'shortEnd') {
      return startForcedHighPersonalization();
    }
    return startHighLoadPersonalization(payload?.loadLevel ?? payload);
  };

  const startManualPersonalizedContent = async () => {
    if (personalizationAskInFlightRef.current) return;
    const predicted = latestPredictedLoadRef.current;
    if (predicted) {
      await startHighLoadPersonalization(predicted);
      return;
    }

    personalizationAskInFlightRef.current = true;
    try {
      dismissPlaybackPersonalizationPrompt();
      promptFrustrationOverrideRef.current = 'Very High';
      setLoadLevel('Very High');
      highLoadLevelRef.current = 'Very High';
      setPromptBarOpen(true);
      askPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const body = buildLessonPromptPayload({
        courseName: course?.courseName,
        subsectionTitle: mainVideo?.title,
        knowledgeChunk: mainVideo?.knowledgeChunk,
        containsMath: mainVideo?.containsMath,
        studentYear,
        learnerProfile,
        visualVerbalStyle,
        analyticHolisticStyle,
        loadLevel: 'Very High',
        frustration: 'Very High',
      });
      let promptText = '';
      let lastErr;
      for (const url of buildGptPromptUrls()) {
        try {
          const res = await axios.post(url, body);
          promptText = String(res.data?.data?.prompt || '').trim();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (e.response?.status === 404) continue;
          if (!e.response && e.code === 'ERR_NETWORK') continue;
          throw e;
        }
      }
      if (!promptText && lastErr) throw lastErr;
      if (promptText) {
        pedagogicalPromptRef.current = promptText;
        setPedagogicalPrompt(promptText);
      }

      await askCourseGpt(
        `The student asked for personalized content. Use the exact knowledge chunk. Match the student's visual-verbal style (${visualVerbalStyle}) and analytic-holistic style (${analyticHolisticStyle}) from their profile.${
          learnerProfile
            ? ` Match the stored learner profile (${learnerProfile}).`
            : ' Learner profile is empty; do not invent one.'
        } No predicted cognitive load was available, so use cognitive load Very High and frustration Very High. Do not invent facts.`
      );
    } catch (err) {
      setGptError(
        [err.response?.data?.message, err.response?.data?.detail, err.message]
          .filter(Boolean)
          .join('\n\n') || 'Could not get personalized content.'
      );
    } finally {
      personalizationAskInFlightRef.current = false;
    }
  };

  return (
    <div className="course-learn">
      <div
        className={`course-learn__grid${stackLayout ? ' is-stack' : ''}`}
      >
        <aside className="glass-panel course-learn__curriculum">
          <Link to="/course" className="course-learn__back">
            ← All courses
          </Link>

          {loading && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Loading…
            </p>
          )}
          {!loading && error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{error}</p>
          )}
          {!loading && !error && course && (
            <>
              <div className="course-learn__cover">
                {course.thumbnailUrl ? (
                  <img
                    src={course.thumbnailUrl}
                    alt={course.courseName || 'Course thumbnail'}
                  />
                ) : null}
              </div>

              <h1 className="course-learn__title">
                {course.courseName || 'Untitled course'}
              </h1>

              <p className="course-learn__educator">
                {course.educatorName
                  ? `Educator: ${course.educatorName}`
                  : 'Educator: —'}
              </p>

              <CourseWatchRing summary={watchSummary} />

              {course.description ? (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p
                    className="form-label"
                    style={{ marginBottom: '0.35rem', fontSize: '0.75rem' }}
                  >
                    About
                  </p>
                  {(() => {
                    const words = splitWords(course.description);
                    const needsTruncate =
                      words.length > ABOUT_PREVIEW_WORDS;
                    const preview = words
                      .slice(0, ABOUT_PREVIEW_WORDS)
                      .join(' ');
                    return (
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.55,
                        }}
                      >
                        {!needsTruncate || aboutExpanded ? (
                          <>
                            <p
                              style={{
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {course.description}
                            </p>
                            {needsTruncate ? (
                              <button
                                type="button"
                                onClick={() => setAboutExpanded(false)}
                                style={{
                                  marginTop: '0.35rem',
                                  padding: 0,
                                  border: 'none',
                                  background: 'none',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  color: '#93c5fd',
                                  textDecoration: 'underline',
                                  fontFamily: 'inherit',
                                }}
                              >
                                See less
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <p style={{ margin: 0 }}>
                            {preview} …{' '}
                            <button
                              type="button"
                              onClick={() => setAboutExpanded(true)}
                              aria-expanded={false}
                              style={{
                                padding: 0,
                                margin: 0,
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: 'inherit',
                                color: '#93c5fd',
                                textDecoration: 'underline',
                                fontFamily: 'inherit',
                                verticalAlign: 'baseline',
                              }}
                            >
                              See more
                            </button>
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              <p
                className="form-label"
                style={{
                  marginBottom: '0.5rem',
                  fontSize: '0.8rem',
                  letterSpacing: '0.02em',
                }}
              >
                Course content
              </p>
              {preparingLessonCount > 0 ? (
                <p
                  style={{
                    margin: '0 0 0.75rem 0',
                    fontSize: '0.8rem',
                    color: '#fbbf24',
                    lineHeight: 1.45,
                  }}
                >
                  {visibleLessonCount
                    ? 'A new lesson is still in the processing queue. It will appear here when it is ready.'
                    : 'Lessons are still in the processing queue. They will appear here when they are ready.'}
                </p>
              ) : null}
              {sections.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  No sections yet.
                </p>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  {sections.map((s, idx) => {
                    const sid = String(s.id);
                    const subs = Array.isArray(s.subsections)
                      ? s.subsections
                      : [];
                    const open = Boolean(sectionOpen[sid]);
                    const num =
                      typeof s.order === 'number' ? s.order + 1 : idx + 1;

                    return (
                      <div
                        key={sid}
                        className="course-learn__section"
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.4rem',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSection(s.id)}
                            aria-expanded={open}
                            aria-label={
                              open ? 'Hide subsections' : 'Show subsections'
                            }
                            style={{
                              flexShrink: 0,
                            }}
                            className="course-learn__icon-btn"
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                transform: open
                                  ? 'rotate(0deg)'
                                  : 'rotate(-90deg)',
                                transition: 'transform 0.18s ease',
                                fontSize: '11px',
                              }}
                            >
                              ▼
                            </span>
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                color: 'var(--text-muted)',
                                marginRight: '0.35rem',
                              }}
                            >
                              {num}.
                            </span>
                            <span style={{ fontWeight: 600 }}>
                              {s.sectionName || 'Section'}
                            </span>
                            {subs.length > 0 ? (
                              <span
                                style={{
                                  marginLeft: '0.35rem',
                                  fontSize: '0.72rem',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                ({subs.length})
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {open && (
                          <div
                            style={{
                              marginTop: '0.55rem',
                              marginLeft: '2.2rem',
                              paddingLeft: '0.5rem',
                              borderLeft:
                                '2px solid rgba(129, 140, 248, 0.35)',
                            }}
                          >
                            {subs.length === 0 ? (
                              <p
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text-muted)',
                                  margin: 0,
                                }}
                              >
                                No subsections yet.
                              </p>
                            ) : (
                              <ul
                                style={{
                                  margin: 0,
                                  padding: 0,
                                  listStyle: 'none',
                                  fontSize: '0.8rem',
                                  color: 'var(--text-muted)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.45rem',
                                }}
                              >
                                {subs.map((sub, si) => {
                                  const subKey = String(sub.id);
                                  const linksOpen = openSubsectionId === subKey;
                                  const n =
                                    typeof sub.order === 'number'
                                      ? sub.order + 1
                                      : si + 1;
                                  const hasVideo = Boolean(sub.videoUrl);
                                  const hasImages =
                                    Array.isArray(sub.images) &&
                                    sub.images.length > 0;

                                  const isActive =
                                    String(mainVideo?.subsectionId || '') ===
                                    subKey;

                                  return (
                                    <li
                                      key={subKey}
                                      className={`course-learn__lecture${
                                        linksOpen ? ' is-open' : ''
                                      }${isActive ? ' is-active' : ''}`}
                                    >
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.35rem',
                                          }}
                                        >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleSubsectionLinks(sub.id)
                                          }
                                          aria-expanded={linksOpen}
                                          aria-label={
                                            linksOpen
                                              ? 'Hide download links'
                                              : 'Show video and file links'
                                          }
                                          className="course-learn__icon-btn"
                                          style={{
                                            flexShrink: 0,
                                            background: linksOpen
                                              ? 'rgba(124, 58, 237, 0.35)'
                                              : undefined,
                                          }}
                                        >
                                          <span
                                            style={{
                                              display: 'inline-block',
                                              transform: linksOpen
                                                ? 'rotate(0deg)'
                                                : 'rotate(-90deg)',
                                              transition:
                                                'transform 0.18s ease',
                                              fontSize: '10px',
                                            }}
                                          >
                                            ▼
                                          </span>
                                        </button>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <span
                                            style={{
                                              fontWeight: 600,
                                              color: 'var(--text)',
                                            }}
                                          >
                                            Lecture {n}
                                          </span>
                                          {hasVideo ? (
                                            <span className="course-learn__badge">
                                              Video
                                            </span>
                                          ) : (
                                            <span className="course-learn__badge is-files">
                                              Files
                                            </span>
                                          )}
                                        </div>
                                        {hasVideo ? (
                                          <MiniWatchRing
                                            percent={
                                              watchSummary.byLesson[subKey]
                                                ?.percent || 0
                                            }
                                            complete={Boolean(
                                              watchSummary.byLesson[subKey]
                                                ?.complete
                                            )}
                                          />
                                        ) : null}
                                      </div>

                                      {linksOpen && (
                                        <div className="course-learn__resources">
                                            {sub.videoUrl ? (
                                              <a
                                                className="course-learn__resource course-learn__resource--video"
                                                href={sub.videoUrl}
                                                rel="noopener noreferrer"
                                                onClick={(e) => {
                                                  if (
                                                    e.metaKey ||
                                                    e.ctrlKey ||
                                                    e.shiftKey ||
                                                    e.altKey ||
                                                    e.button !== 0
                                                  ) {
                                                    return;
                                                  }
                                                  e.preventDefault();
                                                  setMainVideo({
                                                    url: sub.videoUrl,
                                                    title: `${
                                                      s.sectionName ||
                                                      'Section'
                                                    } · Lecture ${n}`,
                                                    knowledgeChunk:
                                                      sub.knowledgeChunk || '',
                                                    knowledgeStatus:
                                                      sub.knowledgeStatus || 'ready',
                                                    containsMath: Boolean(
                                                      sub.containsMath
                                                    ),
                                                    subsectionId: sub.id,
                                                    extractedImages:
                                                      Array.isArray(
                                                        sub.extractedImages
                                                      )
                                                        ? sub.extractedImages
                                                        : [],
                                                    images: Array.isArray(
                                                      sub.images
                                                    )
                                                      ? sub.images
                                                      : [],
                                                  });
                                                }}
                                              >
                                                <span className="course-learn__resource-icon">▶</span>
                                                <span className="course-learn__resource-copy">
                                                  <strong>Play lecture</strong>
                                                  <em>Watch in this page</em>
                                                </span>
                                              </a>
                                            ) : null}
                                            {sub.pptUrl ? (
                                              <a
                                                className="course-learn__resource course-learn__resource--ppt"
                                                href={subsectionDownloadUrl(
                                                  courseId,
                                                  sub.id,
                                                  'ppt'
                                                )}
                                                download={
                                                  sub.pptFileName || 'lesson.pptx'
                                                }
                                                onClick={(event) =>
                                                  downloadSubsectionFile(
                                                    event,
                                                    subsectionDownloadUrl(
                                                      courseId,
                                                      sub.id,
                                                      'ppt'
                                                    ),
                                                    sub.pptFileName ||
                                                      'lesson.pptx'
                                                  )
                                                }
                                              >
                                                <span className="course-learn__resource-icon">PPT</span>
                                                <span className="course-learn__resource-copy">
                                                  <strong>Download slides</strong>
                                                  <em>{sub.pptFileName || 'PowerPoint file'}</em>
                                                </span>
                                              </a>
                                            ) : null}
                                            {sub.pdfUrl ? (
                                              <a
                                                className="course-learn__resource course-learn__resource--pdf"
                                                href={subsectionDownloadUrl(
                                                  courseId,
                                                  sub.id,
                                                  'pdf'
                                                )}
                                                download={
                                                  sub.pdfFileName || 'lesson.pdf'
                                                }
                                                onClick={(event) =>
                                                  downloadSubsectionFile(
                                                    event,
                                                    subsectionDownloadUrl(
                                                      courseId,
                                                      sub.id,
                                                      'pdf'
                                                    ),
                                                    sub.pdfFileName ||
                                                      'lesson.pdf'
                                                  )
                                                }
                                              >
                                                <span className="course-learn__resource-icon">PDF</span>
                                                <span className="course-learn__resource-copy">
                                                  <strong>Download notes</strong>
                                                  <em>{sub.pdfFileName || 'PDF file'}</em>
                                                </span>
                                              </a>
                                            ) : null}
                                            {hasImages
                                              ? sub.images.map((img, ii) =>
                                                  img?.url ? (
                                                    <a
                                                      key={`${subKey}-img-${ii}`}
                                                      className="course-learn__resource course-learn__resource--image"
                                                      href={img.url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                    >
                                                      <span className="course-learn__resource-icon">IMG</span>
                                                      <span className="course-learn__resource-copy">
                                                        <strong>Open image {ii + 1}</strong>
                                                        <em>View in a new tab</em>
                                                      </span>
                                                    </a>
                                                  ) : null
                                                )
                                              : null}
                                            {!sub.videoUrl &&
                                            !sub.pptUrl &&
                                            !sub.pdfUrl &&
                                            !hasImages ? (
                                              <span className="course-learn__resource-empty">
                                                No files for this lecture.
                                              </span>
                                            ) : null}
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </aside>

        <main
          className={`glass-panel course-learn__stage${
            mainVideo ? ' is-playing' : ''
          }`}
        >
          {mainVideo ? (
            <>
              <div className="course-learn__bar">
                <p>{mainVideo.title}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setMainVideo(null)}
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.28rem 0.7rem',
                  }}
                >
                  Close video
                </button>
              </div>
              <div className="course-learn__theater">
                <div className="course-learn__player">
                  <video
                    key={mainVideo.url}
                    ref={videoRef}
                    controls
                    playsInline
                    preload="metadata"
                    src={mainVideo.url}
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onSeeking={handleVideoSeeking}
                    onSeeked={handleVideoSeeked}
                    onRateChange={handleVideoRateChange}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onEnded={handleVideoEnded}
                  />
                  <LearningStateIndicator
                    analysis={loadTrendAnalysis}
                    loading={cognitiveLoadLoading || loadTrendLoading}
                    className="learning-state-wrap--course-detail"
                  />
                </div>
              </div>
              <div className="course-learn__below">
              <p style={{ marginTop: 0, marginBottom: 0 }}>
                <a
                  href={
                    mainVideo.subsectionId
                      ? `/course/${encodeURIComponent(courseId)}/watch/${encodeURIComponent(
                          mainVideo.subsectionId
                        )}`
                      : mainVideo.url
                  }
                  onClick={() => {
                    if (!mainVideo.subsectionId) return;
                    const ownerKey = getTrackedVideoOwnerKey(
                      String(courseId || ''),
                      String(mainVideo.subsectionId)
                    );
                    if (!ownerKey) return;
                    localStorage.setItem(
                      ownerKey,
                      JSON.stringify({ owner: 'tracked-tab', updatedAt: Date.now() })
                    );
                    setCourseTrackingDisabled(true);
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.82rem',
                    color: '#2563eb',
                  }}
                >
                  Open video in new tab
                </a>
              </p>
              <div
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: `1px solid ${liveLoadTheme.border}`,
                  background: liveLoadTheme.bg,
                }}
              >
                <button
                  type="button"
                  onClick={() => setCognitiveLoadOpen((open) => !open)}
                  aria-expanded={cognitiveLoadOpen}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>
                    <span
                      className="form-label"
                      style={{
                        display: 'block',
                        margin: 0,
                        fontSize: '0.8rem',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Live cognitive load
                    </span>
                    {!cognitiveLoadOpen ? (
                      <span
                        style={{
                          display: 'block',
                          marginTop: '0.25rem',
                          fontSize: '0.75rem',
                          color: liveLoadTheme.text,
                          lineHeight: 1.4,
                        }}
                      >
                        <strong>{liveLoadStatus}</strong> · {liveLoadWindow}
                        {rawEventStats.lastEvent
                          ? ` · Last event ${rawEventStats.lastEvent}`
                          : ''}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      fontSize: '0.7rem',
                      color: liveLoadTheme.accent,
                      transform: cognitiveLoadOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.18s ease',
                    }}
                  >
                    ▼
                  </span>
                </button>

                {cognitiveLoadOpen ? (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        marginTop: '0.85rem',
                        paddingTop: '0.85rem',
                        borderTop: `1px solid ${liveLoadTheme.border}`,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.45,
                        }}
                      >
                        Video interaction events are collected live. A prediction appears after each
                        completed 2-minute video window.
                      </p>
                      {cognitiveLoadLoading ? (
                        <span
                          style={{
                            padding: '0.28rem 0.65rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            background: '#dbeafe',
                            color: '#1e40af',
                          }}
                        >
                          Predicting...
                        </span>
                      ) : null}
                    </div>

                    {cognitiveLoadError ? (
                      <p
                        style={{
                          margin: '0.85rem 0 0 0',
                          padding: '0.75rem 0.9rem',
                          borderRadius: '10px',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          color: '#b91c1c',
                          fontSize: '0.82rem',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {cognitiveLoadError}
                      </p>
                    ) : null}

                    {!predictionFeaturesOpen ? (
                      <>
                        <p
                          className="form-label"
                          style={{
                            margin: '1rem 0 0.45rem 0',
                            fontSize: '0.76rem',
                            letterSpacing: '0.02em',
                          }}
                        >
                          Live events
                        </p>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                            gap: '0.55rem',
                          }}
                        >
                          <MiniMetric label="Pause" value={rawEventStats.pauseCount} />
                          <MiniMetric label="Seek" value={rawEventStats.seekCount} />
                          <MiniMetric label="Rewatch" value={rawEventStats.rewatchCount} />
                          <MiniMetric
                            label="Speed changes"
                            value={rawEventStats.rateChangeCount}
                          />
                          <MiniMetric label="Idle time" value={`${rawEventStats.idleDuration}s`} />
                          <MiniMetric
                            label="Last event"
                            value={rawEventStats.lastEvent || 'Waiting'}
                          />
                        </div>
                      </>
                    ) : null}

                    {livePredictionSummary ? (
                      <>
                        <div
                          style={{
                            marginTop: '1rem',
                            padding: '0.75rem 0',
                            borderTop: `1px solid ${liveLoadTheme.border}`,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setPredictionFeaturesOpen((open) => !open)}
                            aria-expanded={predictionFeaturesOpen}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.75rem',
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              color: 'inherit',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span>
                              <span
                                className="form-label"
                                style={{
                                  display: 'block',
                                  margin: 0,
                                  fontSize: '0.76rem',
                                  letterSpacing: '0.02em',
                                }}
                              >
                                Prediction
                              </span>
                              {!predictionFeaturesOpen ? (
                                <span
                                  style={{
                                    display: 'block',
                                    marginTop: '0.25rem',
                                    fontSize: '0.74rem',
                                    color: liveLoadTheme.text,
                                    lineHeight: 1.4,
                                  }}
                                >
                                  <strong>{livePredictionSummary.predictedLoad}</strong> ·{' '}
                                  {livePredictionSummary.minuteIndex != null
                                    ? `Window #${livePredictionSummary.minuteIndex}`
                                    : 'Window N/A'}
                                  {livePredictionSummary.predictionStatus === 'not_reliable' &&
                                  livePredictionSummary.reliabilityReason
                                    ? ` · ${livePredictionSummary.reliabilityReason}`
                                    : ''}
                                </span>
                              ) : null}
                            </span>
                            <span
                              aria-hidden="true"
                              style={{
                                flexShrink: 0,
                                fontSize: '0.7rem',
                                color: liveLoadTheme.accent,
                                transform: predictionFeaturesOpen
                                  ? 'rotate(0deg)'
                                  : 'rotate(-90deg)',
                                transition: 'transform 0.18s ease',
                              }}
                            >
                              ▼
                            </span>
                          </button>
                        </div>

                        {predictionFeaturesOpen ? (
                          <>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns:
                                  'minmax(210px, 1.2fr) repeat(auto-fit, minmax(150px, 1fr))',
                                gap: '0.65rem',
                                alignItems: 'stretch',
                              }}
                            >
                              <div
                                style={{
                                  padding: '0.85rem',
                                  borderRadius: '10px',
                                  border: `1px solid ${liveLoadTheme.border}`,
                                  background: liveLoadTheme.soft,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '0.72rem',
                                    color: liveLoadTheme.text,
                                    marginBottom: '0.3rem',
                                  }}
                                >
                                  Latest prediction
                                </div>
                                <div
                                  style={{
                                    fontSize: '1.25rem',
                                    fontWeight: 800,
                                    color: liveLoadTheme.accent,
                                  }}
                                >
                                  {livePredictionSummary.predictedLoad}
                                </div>
                              </div>
                              <MiniMetric
                                label="Window"
                                value={
                                  livePredictionSummary.minuteIndex != null
                                    ? `#${livePredictionSummary.minuteIndex}`
                                    : 'N/A'
                                }
                              />
                              <MiniMetric
                                label="Last updated"
                                value={
                                  livePredictionSummary.createdAt
                                    ? formatIsoDateTime(livePredictionSummary.createdAt)
                                    : 'N/A'
                                }
                              />
                            </div>

                            <p
                              className="form-label"
                              style={{
                                margin: '0.9rem 0 0.45rem 0',
                                fontSize: '0.76rem',
                                letterSpacing: '0.02em',
                              }}
                            >
                              Prediction features
                            </p>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                                gap: '0.55rem',
                              }}
                            >
                              <MiniMetric
                                label="Pause frequency"
                                value={livePredictionSummary.pauseFrequency ?? 'N/A'}
                              />
                              <MiniMetric
                                label="Rewatch segments"
                                value={livePredictionSummary.rewatchSegments ?? 'N/A'}
                              />
                              <MiniMetric
                                label="Video navigation"
                                value={livePredictionSummary.navigationCountVideo ?? 'N/A'}
                              />
                              <MiniMetric
                                label="Rate changes"
                                value={livePredictionSummary.playbackRateChange ?? 'N/A'}
                              />
                              <MiniMetric
                                label="Video idle"
                                value={formatSeconds(livePredictionSummary.idleDurationVideo)}
                              />
                              <MiniMetric
                                label="Paused time"
                                value={formatSeconds(livePredictionSummary.pausedDurationVideo)}
                              />
                              <MiniMetric
                                label="Time on content"
                                value={formatSeconds(livePredictionSummary.timeOnContent)}
                              />
                            </div>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <p
                        style={{
                          margin: '0.85rem 0 0 0',
                          padding: '0.75rem 0.85rem',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          background: '#ffffff',
                          fontSize: '0.82rem',
                          color: '#475569',
                          lineHeight: 1.5,
                        }}
                      >
                        Start watching and interacting with the video. The first
                        cognitive load prediction appears after the first completed
                        2-minute window.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
              <section
                id="lesson-personalization"
                ref={askPanelRef}
                className="course-learn__personalization"
                aria-labelledby="lesson-personalization-title"
              >
                <header className="course-learn__personalization-hero">
                  <div>
                    <p className="course-learn__personalization-kicker">
                      For this lesson
                    </p>
                    <h2 id="lesson-personalization-title">
                      Personalized content
                    </h2>
                    <p className="course-learn__personalization-lead">
                      Adapted to your cognitive style and the latest load for
                      this video. Long answers open page by page so they stay
                      easy to read.
                    </p>
                  </div>
                  <div className="course-learn__personalization-chips" aria-label="Learner settings in use">
                    <span>{visualVerbalStyle}</span>
                    <span>{analyticHolisticStyle}</span>
                    {learnerProfile ? <span>{learnerProfile}</span> : null}
                    <span>Load {loadLevel}</span>
                    {studentYear ? <span>{studentYear}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary course-learn__personalize-btn"
                    onClick={() => {
                      void startManualPersonalizedContent();
                    }}
                    disabled={gptLoading}
                  >
                    {gptLoading
                      ? 'Getting personalized content…'
                      : 'Get personalized content'}
                  </button>
                </header>
                {!selectedAnswer && !gptLoading ? (
                  <p className="course-learn__personalization-empty">
                    Generate a version of this lesson matched to your cognitive
                    style. Longer replies are split into pages so they stay easy
                    to read.
                  </p>
                ) : null}
              <div className="course-learn__personalization-card">
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-expanded={profileOpen}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>
                    <span
                      className="form-label"
                      style={{
                        display: 'block',
                        margin: 0,
                        fontSize: '0.8rem',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Learner profile
                    </span>
                    {!profileOpen ? (
                      <span
                        style={{
                          display: 'block',
                          marginTop: '0.25rem',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.4,
                        }}
                      >
                        {[
                          visualVerbalStyle,
                          analyticHolisticStyle,
                          learnerProfile,
                          studentYear,
                          `Load ${loadLevel}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      fontSize: '0.7rem',
                      color: '#4f46e5',
                      transform: profileOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.18s ease',
                    }}
                  >
                    ▼
                  </span>
                </button>
                {profileOpen ? (
                  <>
                <p
                  style={{
                    margin: '0.65rem 0 0.65rem 0',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.45,
                  }}
                >
                  Adjust year if needed. Cognitive styles and learner profile
                  come from the student profile. Cognitive load starts at Medium
                  and updates every two minutes from the video session.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '0.5rem',
                    marginBottom: '0.65rem',
                  }}
                >
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Year"
                    value={studentYear}
                    onChange={(e) => setStudentYear(e.target.value)}
                    style={{ fontSize: '0.82rem' }}
                  />
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      fontSize: '0.82rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.45,
                    }}
                  >
                    Visual-Verbal: {visualVerbalStyle} · Analytic-Holistic:{' '}
                    {analyticHolisticStyle}
                    <br />
                    Learner profile: {learnerProfile || '—'}
                    <br />
                    Cognitive load: {loadLevel}
                  </div>
                </div>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPromptBarOpen((open) => !open)}
                  aria-expanded={promptBarOpen}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    marginTop: '0.85rem',
                    paddingTop: '0.85rem',
                    border: 'none',
                    borderTop: '1px solid #e2e8f0',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>
                    <span
                      className="form-label"
                      style={{
                        display: 'block',
                        margin: 0,
                        fontSize: '0.8rem',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Full prompt
                    </span>
                    {!promptBarOpen ? (
                      <span
                        style={{
                          display: 'block',
                          marginTop: '0.25rem',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.4,
                        }}
                      >
                        {promptLoading
                          ? 'Building prompt…'
                          : pedagogicalPrompt.trim()
                            ? 'Pedagogical prompt is ready'
                            : 'Open to review the prompt'}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      fontSize: '0.7rem',
                      color: '#4f46e5',
                      transform: promptBarOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.18s ease',
                    }}
                  >
                    ▼
                  </span>
                </button>
                {promptBarOpen ? (
                  <>
                {promptLoading ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.82rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Building prompt…
                  </p>
                ) : null}
                {promptError ? (
                  <p
                    style={{
                      margin: '0.35rem 0 0 0',
                      fontSize: '0.82rem',
                      color: 'var(--danger)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {promptError}
                  </p>
                ) : null}
                <p
                  className="form-label"
                  style={{
                    margin: '0.85rem 0 0.45rem 0',
                    fontSize: '0.8rem',
                    letterSpacing: '0.02em',
                  }}
                >
                  Pedagogical prompt (subsection)
                </p>
                <p
                  style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.45,
                  }}
                >
                  Review the prompt here, then use it in Ask.
                </p>
                <textarea
                  className="form-input"
                  readOnly
                  rows={14}
                  value={pedagogicalPrompt}
                  placeholder={
                    promptLoading
                      ? 'Building prompt…'
                      : 'Prompt will appear here when the subsection has loaded.'
                  }
                  style={{
                    resize: 'vertical',
                    fontSize: '0.78rem',
                    lineHeight: 1.45,
                    fontFamily: 'ui-monospace, monospace',
                    maxHeight: '360px',
                  }}
                />
                  </>
                ) : null}
              </div>

              <div className="course-learn__personalization-ask">
                <p
                  className="form-label"
                  style={{
                    margin: 0,
                    fontSize: '0.8rem',
                    marginBottom: '0.5rem',
                    letterSpacing: '0.02em',
                  }}
                >
                  Ask the assistant
                </p>
                {isLessonPreparing(mainVideo.knowledgeStatus) ? (
                  <p
                    style={{
                      margin: '0 0 0.65rem 0',
                      fontSize: '0.8rem',
                      color: '#b45309',
                      lineHeight: 1.45,
                    }}
                  >
                    This lesson is still processing in the background (Whisper + MiniLM).
                    Ask will work once the knowledge chunk is ready.
                  </p>
                ) : null}
                <p
                  style={{
                    margin: '0 0 0.65rem 0',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.45,
                  }}
                >
                  Ask sends the pedagogical prompt to Hugging Face and DeepSeek.
                  Open Full prompt above to review it, or type an extra question.{' '}
                  <Link to="/login" style={{ color: '#2563eb' }}>
                    Sign in
                  </Link>{' '}
                  to ask.
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: '0.5rem',
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    disabled={!pedagogicalPrompt.trim() || gptLoading}
                    onClick={() => setGptQuestion(pedagogicalPrompt)}
                    style={{ fontSize: '0.8rem' }}
                  >
                    Use full prompt
                  </button>
                </div>
                <textarea
                  className="form-input"
                  rows={6}
                  value={gptQuestion}
                  onChange={(e) => setGptQuestion(e.target.value)}
                  placeholder="Paste the pedagogical prompt here, or type a question…"
                  style={{ resize: 'vertical', fontSize: '0.88rem' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => askCourseGpt()}
                      disabled={
                        gptLoading ||
                        !pedagogicalPrompt.trim() ||
                        isLessonPreparing(mainVideo.knowledgeStatus)
                      }
                  style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.85rem' }}
                >
                  {gptLoading
                    ? 'Generating + selecting best output…'
                    : 'Ask both models'}
                </button>

                {deepseekError ? (
                  <p
                    style={{
                      marginTop: '0.65rem',
                      marginBottom: 0,
                      fontSize: '0.82rem',
                      color: 'var(--danger)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    DeepSeek: {deepseekError}
                  </p>
                ) : null}

                {selectionError ? (
                  <p
                    style={{
                      marginTop: '0.65rem',
                      marginBottom: 0,
                      fontSize: '0.82rem',
                      color: 'var(--danger)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectionError}
                  </p>
                ) : null}

                {selectedAnswer ? (
                  <div className="course-learn__personalization-output">
                    <p
                      className="form-label"
                      style={{ marginBottom: '0.35rem', fontSize: '0.75rem' }}
                    >
                      Selected content for student
                      {selectionMeta?.selectedModel
                        ? ` (${selectionMeta.selectedModel === 'huggingface' ? 'Hugging Face' : 'DeepSeek'})`
                        : ''}
                    </p>
                    {selectionMeta?.reason ? (
                      <p
                        style={{
                          margin: '0 0 0.55rem 0',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.45,
                        }}
                      >
                        {selectionMeta.reason}
                        {selectionMeta.warning
                          ? ` · Warning: ${selectionMeta.warning}`
                          : ''}
                      </p>
                    ) : null}
                    {selectionMeta?.scores ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(160px, 1fr))',
                          gap: '0.5rem',
                          marginBottom: '0.65rem',
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {['huggingface', 'deepseek'].map((key) => {
                          const s = selectionMeta.scores?.[key];
                          if (!s) return null;
                          const label =
                            key === 'huggingface' ? 'Hugging Face' : 'DeepSeek';
                          return (
                            <div
                              key={key}
                              style={{
                                padding: '0.45rem 0.55rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                              }}
                            >
                              <strong style={{ color: 'var(--text)' }}>
                                {label}
                              </strong>
                              <div>Composite: {s.composite}</div>
                              <div>
                                Faithfulness:{' '}
                                {s.faithfulness == null
                                  ? 'n/a'
                                  : s.faithfulness}
                              </div>
                              <div>
                                Readability match: {s.readabilityMatch} (FRE{' '}
                                {s.fleschReadingEase} → target {s.targetFlesch})
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    <PaginatedAssistantContent
                      text={selectedAnswer}
                      canonicalEquations={canonicalEquations}
                    />
                    <LessonImageGallery
                      afterGptOutput
                      images={collectSubsectionImages(mainVideo)}
                    />
                  </div>
                ) : null}

                {(gptAnswer || deepseekAnswer || gptError || deepseekError) && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowBothOutputs((v) => !v)}
                    style={{
                      marginTop: '0.75rem',
                      width: '100%',
                      fontSize: '0.85rem',
                    }}
                  >
                    {showBothOutputs
                      ? 'Hide both model outputs'
                      : 'View both model outputs'}
                  </button>
                )}

                {showBothOutputs ? (
                  <div
                    style={{
                      marginTop: '0.85rem',
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: '0.75rem',
                    }}
                  >
                    <div className="course-learn__dual-pane">
                      <p
                        className="form-label"
                        style={{ marginBottom: '0.35rem', fontSize: '0.75rem' }}
                      >
                        Hugging Face reply
                      </p>
                      {gptError ? (
                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.82rem',
                            color: 'var(--danger)',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {gptError}
                        </p>
                      ) : null}
                      {!gptError && gptAnswer ? (
                        <PaginatedAssistantContent
                          text={gptAnswer}
                          canonicalEquations={canonicalEquations}
                        />
                      ) : null}
                      {!gptError && !gptAnswer ? (
                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.82rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          No reply.
                        </p>
                      ) : null}
                    </div>

                    <div className="course-learn__dual-pane">
                      <p
                        className="form-label"
                        style={{ marginBottom: '0.35rem', fontSize: '0.75rem' }}
                      >
                        DeepSeek reply
                      </p>
                      {deepseekError ? (
                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.82rem',
                            color: 'var(--danger)',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {deepseekError}
                        </p>
                      ) : null}
                      {!deepseekError && deepseekAnswer ? (
                        <PaginatedAssistantContent
                          text={deepseekAnswer}
                          canonicalEquations={canonicalEquations}
                        />
                      ) : null}
                      {!deepseekError && !deepseekAnswer ? (
                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.82rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          No reply.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {!selectedAnswer ? (
                  <LessonImageGallery
                    images={collectSubsectionImages(mainVideo)}
                  />
                ) : null}
              </div>
              </section>
              </div>
            </>
          ) : (
           <p className="course-learn__empty">
              {preparingLessonCount > 0 && visibleLessonCount === 0
                ? 'This lesson is still being prepared. The video will appear here after processing finishes.'
                : 'Choose a lecture from Course content on the right, then play the video.'}
            </p>
          )}
        </main>
      </div>
      {mainVideo && playbackPrompt ? (
        <PlaybackPersonalizationPrompt
          kind={playbackPrompt}
          busy={gptLoading}
          onNo={dismissPlaybackPersonalizationPrompt}
          onYes={async () => {
            const kind = playbackPrompt;
            if (kind === 'shortEnd') {
              await startForcedHighPersonalization();
              return;
            }
            if (kind === 'highLoad' || kind === 'longEnd') {
              await startHighLoadPersonalization(highLoadLevelRef.current);
              return;
            }
            const copy = PLAYBACK_PROMPT_COPY[kind];
            dismissPlaybackPersonalizationPrompt();
            await askCourseGpt(copy?.extraInstruction || '');
          }}
        />
      ) : null}
    </div>
  );
};

export default CourseDetail;
