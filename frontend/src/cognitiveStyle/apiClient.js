import { getGatewayBaseUrl } from '../config/gateway';

const API_BASE = `${getGatewayBaseUrl()}/api/cognitive-style-ai/v1`;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.detail || 'Cognitive-style analysis failed.');
  }
  return payload && 'data' in payload ? payload.data : payload;
}

export function analyseCognitiveStyle(lessonId, studentId, { limeSamples = 200, shapSamples = 100 } = {}) {
  const query = new URLSearchParams({
    lime_samples: String(limeSamples),
    shap_samples: String(shapSamples),
  });
  return request(
    `/lessons/${encodeURIComponent(lessonId)}/students/${encodeURIComponent(studentId)}/analyse?${query}`,
    { method: 'POST' },
  );
}
