import { getGatewayBaseUrl } from '../config/gateway';

const API_BASE = `${getGatewayBaseUrl()}/api/shap-ai/v1`;

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

export async function fetchShapExplanation(lessonId, predictionId, { numFeatures = 6, numSamples = 100 } = {}) {
  const query = new URLSearchParams();
  query.set('num_features', String(numFeatures));
  query.set('num_samples', String(numSamples));

  return request(`/lessons/${lessonId}/predictions/${predictionId}/shap?${query.toString()}`);
}
