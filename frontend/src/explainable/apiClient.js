import { getGatewayBaseUrl } from '../config/gateway';

const API_BASE = `${getGatewayBaseUrl()}/api/explainable/v1`;

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

export async function fetchLessons() {
  return request('/lessons');
}

export async function fetchLessonStudents(lessonId) {
  return request(`/lessons/${lessonId}/students`);
}

export async function fetchStudentExplanation(studentId, lessonId) {
  return request(`/students/${studentId}/lessons/${lessonId}/explanation`);
}

export async function fetchHighLoadPeriods(studentId, lessonId) {
  return request(`/students/${studentId}/lessons/${lessonId}/high-load-periods`);
}

export async function fetchHighLoadPeriodExplanation(studentId, lessonId, periodId) {
  return request(`/students/${studentId}/lessons/${lessonId}/high-load-periods/${periodId}/explanation`);
}

export async function fetchClassSummary(lessonId) {
  return request(`/lessons/${lessonId}/class-summary`);
}

export async function generateStudentExplanations(lessonId) {
  return request(`/lessons/${lessonId}/generate-student-explanations`, {
    method: 'POST',
  });
}

export async function generateClassRecommendation(lessonId, classSummary) {
  return request(`/lessons/${lessonId}/generate-class-recommendation`, {
    method: 'POST',
    body: JSON.stringify({ class_summary: classSummary }),
  });
}
