import { getGatewayBaseUrl } from '../config/gateway';

const API_BASE = `${getGatewayBaseUrl()}/api/lime-ai/v1`;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || payload?.detail?.message || 'Request failed.';
    const errors = payload?.errors ?? [];
    throw new Error(errors.length ? `${message} ${errors.join(', ')}` : message);
  }

  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    return payload.data;
  }

  return payload;
}

export async function fetchLimeLessons() {
  return request('/lessons');
}

export async function fetchLimeStudentsByLesson(lessonId) {
  return request(`/lessons/${lessonId}/students`);
}

export async function fetchLessonNames() {
  const response = await fetch(`${getGatewayBaseUrl()}/api/public/courses`);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Could not load lesson names.');
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function fetchStudentNames(studentIds) {
  const ids = [...new Set((studentIds ?? []).map(String).filter(Boolean))];
  if (!ids.length) return [];

  const token = localStorage.getItem('token');
  const query = new URLSearchParams({ ids: ids.join(',') });
  const response = await fetch(
    `${getGatewayBaseUrl()}/api/auth/student-names?${query.toString()}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Could not load student names.');
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function fetchSavedStudentLessonAnalysis(lessonId, studentId) {
  return request(`/lessons/${lessonId}/students/${studentId}/analysis`);
}

export async function fetchLimePredictions(lessonId, { studentId = '', highOnly = true, includeMedium = false, limit = 200 } = {}) {
  const query = new URLSearchParams();

  if (studentId) {
    query.set('student_id', studentId);
  }

  query.set('high_only', String(Boolean(highOnly)));
  query.set('include_medium', String(Boolean(includeMedium)));
  query.set('limit', String(limit));

  return request(`/lessons/${lessonId}/predictions?${query.toString()}`);
}

export async function fetchLimeExplanation(lessonId, predictionId, { numFeatures = 6, numSamples = 200 } = {}) {
  const query = new URLSearchParams();
  query.set('num_features', String(numFeatures));
  query.set('num_samples', String(numSamples));

  return request(`/lessons/${lessonId}/predictions/${predictionId}/lime?${query.toString()}`);
}

export async function fetchAggregateExplanation(payload) {
  return request('/aggregate-explanation', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createStudentLessonSummary(lessonId, studentId) {
  return request(`/lessons/${lessonId}/students/${studentId}/summary`, {
    method: 'POST',
  });
}
