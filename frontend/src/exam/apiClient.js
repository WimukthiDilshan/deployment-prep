import { getGatewayBaseUrl } from '../config/gateway';

const API_BASE = `${getGatewayBaseUrl()}/api/exam`;

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || 'Exam service request failed.');
  return payload;
}

export async function fetchMyCourses() {
  const response = await fetch(`${getGatewayBaseUrl()}/api/courses/mine`, {
    headers: authHeaders(),
  });
  const payload = await parseResponse(response);
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function uploadExamMaterial({ courseId, courseName, lessonName, unitNo, document }) {
  const body = new FormData();
  body.append('courseId', courseId);
  body.append('courseName', courseName);
  body.append('lessonName', lessonName);
  body.append('unitNo', unitNo);
  body.append('document', document);
  return parseResponse(await fetch(`${API_BASE}/materials`, {
    method: 'POST', headers: authHeaders(), body,
  }));
}

export async function fetchExamMaterials() {
  const payload = await parseResponse(await fetch(`${API_BASE}/materials`, { headers: authHeaders() }));
  return payload.materials ?? [];
}

export async function fetchExamLessons() {
  const payload = await parseResponse(await fetch(`${API_BASE}/materials/lessons`, {
    headers: authHeaders(),
  }));
  return payload.lessons ?? [];
}

export async function generateExamQuiz({ courseId, lessonName, unitNo }) {
  const payload = await parseResponse(await fetch(`${API_BASE}/quizzes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ courseId, lessonName, unitNo }),
  }));
  return {
    ...payload.quiz,
    cognitiveLoadCounts: payload.cognitiveLoadCounts ?? {},
  };
}

export async function checkExamAnswers(quizId, answers) {
  return parseResponse(await fetch(`${API_BASE}/quizzes/${quizId}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ answers }),
  }));
}

export async function fetchExamAnswerSheet(quizId) {
  return parseResponse(await fetch(`${API_BASE}/quizzes/${quizId}/answers`, {
    headers: authHeaders(),
  }));
}

export async function downloadExamMaterial(material) {
  const response = await fetch(`${API_BASE}/materials/${material.id}/file`, { headers: authHeaders() });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Document download failed.');
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = material.originalFileName;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
