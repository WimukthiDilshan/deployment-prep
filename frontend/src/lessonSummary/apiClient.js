import { getGatewayBaseUrl } from '../config/gateway';

const API_BASE = `${getGatewayBaseUrl()}/api/student-lesson-summaries`;

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.detail?.message || 'Lesson-summary request failed.');
  }
  return payload && 'data' in payload ? payload.data : payload;
}

export function shareLessonGuidance(studentId, lessonId) {
  return request('/share', {
    method: 'POST',
    body: JSON.stringify({ studentId, lessonId }),
  });
}

export function rejectLessonGuidance(studentId, lessonId, reason = '') {
  return request('/reject', {
    method: 'POST',
    body: JSON.stringify({ studentId, lessonId, reason }),
  });
}

export function regenerateLessonGuidance(studentId, lessonId) {
  return request('/regenerate', {
    method: 'POST',
    body: JSON.stringify({ studentId, lessonId }),
  });
}

export function fetchMySharedLessonGuidance() {
  return request('/me');
}

export function submitTechniqueFeedback(lessonId, feedback) {
  return request('/feedback', {
    method: 'POST',
    body: JSON.stringify({ lessonId, ...feedback }),
  });
}
