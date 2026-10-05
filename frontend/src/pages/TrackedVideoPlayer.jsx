import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import LearningStateIndicator from '../components/LearningStateIndicator';
import { fetchLoadTrend } from '../cognitiveLoad/apiClient';
import { getGatewayBaseUrl } from '../config/gateway';
import './CourseDetail.css';

const SEEK_JUMP_THRESHOLD_SECONDS = 2;
const SEEK_EVENT_DEBOUNCE_MS = 900;
const COGNITIVE_LOAD_WINDOW_MS = 120000;

function getTrackedVideoOwnerKey(courseId, subsectionId) {
  if (!courseId || !subsectionId) return '';
  return `cognitive-load:tracked-video-owner:${courseId}:${subsectionId}`;
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

function getCognitiveLoadTheme(load) {
  const value = String(load || '').toLowerCase();

  if (value.includes('very high')) {
    return {
      bg: '#17181f',
      border: 'rgba(248, 113, 113, 0.32)',
      accent: '#f87171',
      soft: 'rgba(127, 29, 29, 0.24)',
      text: '#fecaca',
    };
  }

  if (value.includes('high')) {
    return {
      bg: '#17181f',
      border: 'rgba(251, 146, 60, 0.32)',
      accent: '#fb923c',
      soft: 'rgba(124, 45, 18, 0.24)',
      text: '#fed7aa',
    };
  }

  if (value.includes('medium')) {
    return {
      bg: '#17181f',
      border: 'rgba(96, 165, 250, 0.32)',
      accent: '#60a5fa',
      soft: 'rgba(30, 64, 175, 0.22)',
      text: '#bfdbfe',
    };
  }

  if (value.includes('low')) {
    return {
      bg: '#17181f',
      border: 'rgba(52, 211, 153, 0.3)',
      accent: '#34d399',
      soft: 'rgba(6, 78, 59, 0.24)',
      text: '#bbf7d0',
    };
  }

  return {
    bg: '#17181f',
    border: 'rgba(148, 163, 184, 0.28)',
    accent: '#93c5fd',
    soft: '#20232d',
    text: '#dbeafe',
  };
}

function getRawEventLabel(eventType) {
  const labels = {
    play: 'Play',
    pause: 'Pause',
    seek_forward: 'Seek forward',
    seek_backward: 'Rewatch',
    rate_change: 'Rate change',
    idle_start: 'Idle started',
    idle_end: 'Idle ended',
  };

  return labels[eventType] ?? eventType ?? 'Unknown';
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

function MiniMetric({ label, value }) {
  return (
    <div
      style={{
        padding: '0.65rem 0.75rem',
        borderRadius: '10px',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        background: 'rgba(15, 23, 42, 0.58)',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          color: '#cbd5e1',
          marginBottom: '0.22rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '0.95rem',
          fontWeight: 700,
          color: '#f8fafc',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function findSubsection(sections, subsectionId) {
  for (const section of sections || []) {
    const match = (section.subsections || []).find(
      (sub) => String(sub.id) === String(subsectionId)
    );
    if (match) return match;
  }
  return null;
}

export default function TrackedVideoPlayer() {
  const { courseId, subsectionId } = useParams();
  const [course, setCourse] = useState(null);
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawEventStats, setRawEventStats] = useState(createEmptyRawEventStats);
  const [sendError, setSendError] = useState('');
  const [cognitiveLoadResult, setCognitiveLoadResult] = useState(null);
  const [cognitiveLoadError, setCognitiveLoadError] = useState('');
  const [cognitiveLoadLoading, setCognitiveLoadLoading] = useState(false);
  const [cognitiveLoadOpen, setCognitiveLoadOpen] = useState(false);
  const [predictionFeaturesOpen, setPredictionFeaturesOpen] = useState(false);
  const [loadTrendAnalysis, setLoadTrendAnalysis] = useState(null);
  const [loadTrendLoading, setLoadTrendLoading] = useState(false);

  const videoRef = useRef(null);
  const videoSessionIdRef = useRef('');
  const sessionStartRef = useRef(null);
  const rawEventQueueRef = useRef(Promise.resolve());
  const windowStatsByKeyRef = useRef({});
  const activeRawEventWindowKeyRef = useRef('');
  const lastPredictedWindowKeyRef = useRef('');
  const predictionInFlightWindowKeyRef = useRef('');
  const predictTimeoutRef = useRef(null);
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
  const trackingOwnerValueRef = useRef('');

  const livePredictionSummary = getLivePredictionSummary(cognitiveLoadResult);
  const liveLoadStatus = livePredictionSummary?.predictedLoad || 'Collecting data';
  const liveLoadTheme = getCognitiveLoadTheme(liveLoadStatus);

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
    const currentWindowKey = getActiveWindowKey(
      sessionStartRef.current,
      videoSessionIdRef.current
    );
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
    const ownerKey = getTrackedVideoOwnerKey(courseId, subsectionId);
    if (!ownerKey) return undefined;

    const ownerValue = `tracked-tab:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    trackingOwnerValueRef.current = ownerValue;

    const writeOwner = () => {
      localStorage.setItem(
        ownerKey,
        JSON.stringify({
          owner: ownerValue,
          updatedAt: Date.now(),
        })
      );
    };

    const clearOwner = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(ownerKey) || '{}');
        if (parsed.owner === ownerValue) {
          localStorage.removeItem(ownerKey);
        }
      } catch {
        localStorage.removeItem(ownerKey);
      }
    };

    writeOwner();
    const intervalId = window.setInterval(writeOwner, 2000);
    window.addEventListener('beforeunload', clearOwner);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('beforeunload', clearOwner);
      clearOwner();
    };
  }, [courseId, subsectionId]);

  useEffect(() => {
    if (!video?.videoUrl) {
      videoSessionIdRef.current = '';
      sessionStartRef.current = null;
      clearWindowStats();
      setCognitiveLoadResult(null);
      setLoadTrendAnalysis(null);
      setCognitiveLoadError('');
      setCognitiveLoadLoading(false);
      lastPredictedWindowKeyRef.current = '';
      predictionInFlightWindowKeyRef.current = '';
      activeRawEventWindowKeyRef.current = '';
      return;
    }

    const startedAt = new Date();
    const sessionId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    videoSessionIdRef.current = sessionId;
    sessionStartRef.current = startedAt;
    setCognitiveLoadResult(null);
    setLoadTrendAnalysis(null);
    setCognitiveLoadError('');
    setCognitiveLoadLoading(false);
    setCognitiveLoadOpen(false);
    setPredictionFeaturesOpen(false);
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
    activeRawEventWindowKeyRef.current = getActiveWindowKey(startedAt, sessionId);
    resetActiveWindowStats(activeRawEventWindowKeyRef.current);
  }, [video?.videoUrl]);

  useEffect(() => {
    setCognitiveLoadOpen(false);
    setPredictionFeaturesOpen(false);
  }, [cognitiveLoadResult]);

  useEffect(() => {
    let cancelled = false;

    async function loadVideo() {
      if (!courseId || !subsectionId) {
        setError('Missing course or video id.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const res = await axios.get(
          `${getGatewayBaseUrl()}/api/public/courses/${encodeURIComponent(courseId)}`
        );
        if (cancelled) return;

        const payload = res.data?.data;
        const sections = Array.isArray(payload?.sections) ? payload.sections : [];
        const selected = findSubsection(sections, subsectionId);

        if (!selected?.videoUrl) {
          setCourse(payload?.course ?? null);
          setVideo(null);
          setError('Video not found for this course.');
          return;
        }

        setCourse(payload?.course ?? null);
        setVideo(selected);
      } catch (exc) {
        if (!cancelled) {
          setError(
            exc.response?.data?.message || exc.message || 'Could not load video.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadVideo();
    return () => {
      cancelled = true;
    };
  }, [courseId, subsectionId]);

  const enqueueRawEvent = ({ payload, eventTime }) => {
    const activeSessionId = videoSessionIdRef.current;
    if (!video?.videoUrl || !activeSessionId) return Promise.resolve();

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

  const runCognitiveLoadPredictionForCompletedWindow = async () => {
    const activeSessionId = videoSessionIdRef.current;
    if (!video?.videoUrl || !activeSessionId || !sessionStartRef.current) {
      return;
    }

    const windowInfo = getCompletedWindowInfo(
      sessionStartRef.current,
      activeSessionId,
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
          session_id: activeSessionId,
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
            activeSessionId,
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
      setCognitiveLoadOpen(false);
      setPredictionFeaturesOpen(false);
      lastPredictedWindowKeyRef.current = windowKey;
    } catch (predictionError) {
      setCognitiveLoadError(
        predictionError.response?.data?.detail?.[0]?.msg ||
          predictionError.response?.data?.message ||
          predictionError.message ||
          'Could not predict cognitive load for this video session.'
      );
    } finally {
      if (predictionInFlightWindowKeyRef.current === windowKey) {
        predictionInFlightWindowKeyRef.current = '';
      }
      setCognitiveLoadLoading(false);
    }
  };

  const sendCognitiveLoadEvent = (payload) => {
    if (!video?.videoUrl || !videoSessionIdRef.current) return;

    const currentWindowKey = getActiveWindowKey(
      sessionStartRef.current,
      videoSessionIdRef.current
    );

    if (
      currentWindowKey &&
      activeRawEventWindowKeyRef.current !== currentWindowKey
    ) {
      activeRawEventWindowKeyRef.current = currentWindowKey;
      resetActiveWindowStats(currentWindowKey);
    }

    updateStatsForWindow(currentWindowKey, payload);
    enqueueRawEvent({ payload, eventTime: new Date().toISOString() }).catch(() => {
      setSendError('Could not send video interaction data to the cognitive load API.');
    });
  };

  const markInteraction = () => {
    lastInteractionTimeRef.current = Date.now();

    if (idleStartRef.current) {
      const idleSeconds = Math.max(
        1,
        Math.round((Date.now() - idleStartRef.current) / 1000)
      );
      sendCognitiveLoadEvent({
        event_type: 'adaptation_idle',
        event_value: String(idleSeconds),
        video_time: Number(videoRef.current?.currentTime?.toFixed(2) || 0),
      });
      sendCognitiveLoadEvent({
        event_type: 'idle_end',
        video_time: Number(videoRef.current?.currentTime?.toFixed(2) || 0),
      });
    }

    idleStartRef.current = null;
  };

  const isPauseFromSeek = () => {
    const now = Date.now();
    return (
      isSeekingRef.current ||
      Boolean(videoRef.current?.seeking) ||
      now - lastSeekEventTimeRef.current < 600 ||
      now - lastRewatchEventTimeRef.current < 3000 ||
      now < suppressPauseCountUntilRef.current
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
    if (moveDistance < 0.5) return false;

    const now = Date.now();
    if (now - lastNavigationCommitTimeRef.current < SEEK_EVENT_DEBOUNCE_MS) {
      return false;
    }

    const isBackwardSeek = to < from - 0.25;
    lastNavigationCommitTimeRef.current = now;
    lastSeekEventTimeRef.current = now;
    suppressPauseCountUntilRef.current = now + 2500;
    lastVideoTimeRef.current = to;
    if (isBackwardSeek) lastRewatchEventTimeRef.current = now;

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
  };

  const handleVideoPlay = () => {
    if (pauseConfirmTimeoutRef.current) {
      window.clearTimeout(pauseConfirmTimeoutRef.current);
      pauseConfirmTimeoutRef.current = null;
    }
    closePauseTimerForActiveWindow();
    markInteraction();
  };

  const handleVideoSeeking = () => {
    seekStartTimeRef.current = lastVideoTimeRef.current;
    isSeekingRef.current = true;
    lastSeekEventTimeRef.current = Date.now();
    suppressPauseCountUntilRef.current = Date.now() + 2000;
    beginSeekGesture();
    markInteraction();
  };

  const handleVideoSeeked = () => {
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
      if (!commitSeekTimeoutRef.current) isSeekingRef.current = false;
    }, 0);
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

    if (jumpDistance > SEEK_JUMP_THRESHOLD_SECONDS) {
      commitVideoNavigationEvent({
        fromPosition: previousTime,
        toPosition: currentTime,
      });
    }

    lastVideoTimeRef.current = currentTime;
  };

  const handleVideoEnded = () => {
    markInteraction();
  };

  useEffect(() => {
    if (!video?.videoUrl || !videoSessionIdRef.current) return undefined;

    const interactionEvents = ['mousemove', 'keydown', 'click'];
    const onInteraction = () => markInteraction();

    interactionEvents.forEach((eventName) => {
      document.addEventListener(eventName, onInteraction);
    });

    const idleCheckIntervalId = window.setInterval(() => {
      const inactiveMs = Date.now() - lastInteractionTimeRef.current;
      if (inactiveMs > 60000 && !idleStartRef.current) {
        idleStartRef.current = Date.now();
        sendCognitiveLoadEvent({
          event_type: 'idle_start',
          video_time: Number(videoRef.current?.currentTime?.toFixed(2) || 0),
        });
      }
    }, 1000);

    return () => {
      interactionEvents.forEach((eventName) => {
        document.removeEventListener(eventName, onInteraction);
      });
      window.clearInterval(idleCheckIntervalId);
    };
  }, [video?.videoUrl]);

  useEffect(() => {
    const activeSessionId = videoSessionIdRef.current;
    if (!video?.videoUrl || !activeSessionId || !sessionStartRef.current) {
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
          activeSessionId
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
  }, [courseId, video?.videoUrl]);

  useEffect(() => {
    return () => {
      if (pauseConfirmTimeoutRef.current) {
        window.clearTimeout(pauseConfirmTimeoutRef.current);
      }
      if (commitSeekTimeoutRef.current) {
        window.clearTimeout(commitSeekTimeoutRef.current);
      }
      if (predictTimeoutRef.current) {
        window.clearTimeout(predictTimeoutRef.current);
      }
    };
  }, []);

  return (
    <main
      className={`course-learn tracked-video-page${
        cognitiveLoadOpen ? ' is-panel-expanded' : ''
      }${predictionFeaturesOpen ? ' is-prediction-expanded' : ''}`}
      style={{ width: '100vw', minWidth: '100vw', maxWidth: '100vw' }}
    >
      <div
        className={`course-learn__stage tracked-video-page__stage is-playing${
          cognitiveLoadOpen ? ' is-panel-expanded' : ''
        }${predictionFeaturesOpen ? ' is-prediction-expanded' : ''}`}
        style={{ width: '100vw', minWidth: '100vw', maxWidth: '100vw' }}
      >
        <div className="course-learn__bar">
          <p>{video?.title || course?.courseName || 'Tracked video'}</p>
          <Link className="btn" to={`/course/${encodeURIComponent(courseId || '')}`}>
            Back to course
          </Link>
        </div>

        {loading ? (
          <p className="course-learn__empty">Loading video...</p>
        ) : error ? (
          <p className="course-learn__empty">{error}</p>
        ) : (
          <>
            <div
              className="course-learn__theater tracked-video-page__theater"
              style={{ width: '100vw', minWidth: '100vw', maxWidth: '100vw' }}
            >
              <div
                className="course-learn__player tracked-video-page__player"
                style={{ width: '100vw', minWidth: '100vw', maxWidth: '100vw' }}
              >
                <video
                  key={video.videoUrl}
                  ref={videoRef}
                  controls
                  playsInline
                  preload="metadata"
                  src={video.videoUrl}
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onSeeking={handleVideoSeeking}
                  onSeeked={handleVideoSeeked}
                  onRateChange={handleVideoRateChange}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onEnded={handleVideoEnded}
                />
                <LearningStateIndicator
                  analysis={loadTrendAnalysis}
                  loading={cognitiveLoadLoading || loadTrendLoading}
                />
              </div>
            </div>

            <div
              className="course-learn__below tracked-video-page__below"
              style={{ width: '100vw', minWidth: '100vw', maxWidth: '100vw' }}
            >
              <section
                className="course-learn__panel tracked-video-page__panel"
                style={{
                  marginTop: 0,
                  background: liveLoadTheme.bg,
                  borderColor: liveLoadTheme.border,
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
                      style={{ display: 'block', margin: 0, fontSize: '0.8rem', letterSpacing: '0.02em' }}
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
                        <strong>{liveLoadStatus}</strong>
                        {livePredictionSummary?.minuteIndex != null
                          ? ` · Window #${livePredictionSummary.minuteIndex}`
                          : ' · Waiting for first 2-minute window'}
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
                    <p
                      style={{
                        margin: '0.55rem 0 0.65rem',
                        color: '#cbd5e1',
                        fontSize: '0.82rem',
                      }}
                    >
                      Video interaction events are collected live. A prediction appears after each
                      completed 2-minute video window.
                    </p>
                    {cognitiveLoadLoading ? (
                      <p
                        style={{
                          margin: '0 0 0.55rem',
                          color: liveLoadTheme.text,
                          fontSize: '0.82rem',
                        }}
                      >
                        Predicting...
                      </p>
                    ) : null}
                    {!predictionFeaturesOpen ? (
                      <div
                        style={{
                          marginBottom: '0.65rem',
                          paddingTop: '0.55rem',
                          borderTop: `1px solid ${liveLoadTheme.border}`,
                        }}
                      >
                        <span
                          className="form-label"
                          style={{
                            display: 'block',
                            margin: '0 0 0.48rem',
                            fontSize: '0.76rem',
                            letterSpacing: '0.02em',
                          }}
                        >
                          Live Events
                        </span>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: '0.55rem',
                          }}
                        >
                          <MiniMetric label="Pause" value={rawEventStats.pauseCount} />
                          <MiniMetric label="Seek" value={rawEventStats.seekCount} />
                          <MiniMetric label="Rewatch" value={rawEventStats.rewatchCount} />
                          <MiniMetric label="Speed changes" value={rawEventStats.rateChangeCount} />
                          <MiniMetric label="Idle time" value={`${rawEventStats.idleDuration}s`} />
                          <MiniMetric label="Last event" value={rawEventStats.lastEvent || 'Waiting'} />
                        </div>
                      </div>
                    ) : null}
                    {livePredictionSummary ? (
                      <div
                        style={{
                          marginBottom: '0.65rem',
                          paddingTop: '0.55rem',
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

                        {predictionFeaturesOpen ? (
                          <>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns:
                                  'minmax(210px, 1.2fr) repeat(auto-fit, minmax(150px, 1fr))',
                                gap: '0.55rem',
                                alignItems: 'stretch',
                                marginTop: '0.55rem',
                                marginBottom: '0.55rem',
                              }}
                            >
                              <div
                                style={{
                                  padding: '0.65rem 0.75rem',
                                  borderRadius: '10px',
                                  border: `1px solid ${liveLoadTheme.border}`,
                                  background: liveLoadTheme.soft,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '0.7rem',
                                    color: liveLoadTheme.text,
                                    marginBottom: '0.22rem',
                                  }}
                                >
                                  Latest prediction
                                </div>
                                <div
                                  style={{
                                    fontSize: '1.05rem',
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
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
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
                      </div>
                    ) : null}
                  </>
                ) : null}
                {cognitiveLoadError ? (
                  <p
                    style={{
                      margin: '0.85rem 0 0',
                      color: '#fecaca',
                      fontSize: '0.82rem',
                    }}
                  >
                    {cognitiveLoadError}
                  </p>
                ) : null}
                {sendError ? (
                  <p
                    style={{
                      margin: '0.85rem 0 0',
                      color: '#fecaca',
                      fontSize: '0.82rem',
                    }}
                  >
                    {sendError}
                  </p>
                ) : null}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
