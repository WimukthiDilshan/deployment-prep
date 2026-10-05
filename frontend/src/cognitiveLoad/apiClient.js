import { getGatewayBaseUrl } from '../config/gateway';

export async function fetchLoadTrend(studentId, lessonId, sessionId, limit = 12) {
  const params = new URLSearchParams();
  if (sessionId) params.set('session_id', sessionId);
  if (limit) params.set('limit', String(limit));

  const query = params.toString();
  const response = await fetch(
    `${getGatewayBaseUrl()}/api/cognitive-load/students/${encodeURIComponent(
      studentId,
    )}/lessons/${encodeURIComponent(lessonId)}/load-trend${query ? `?${query}` : ''}`,
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || payload?.detail || 'Could not load learning state.');
  }

  return payload;
}
