/**
 * Base URL for every browser HTTP call in this app.
 * Configure `VITE_API_GATEWAY_URL` to your API gateway; do not point the
 * frontend at Resource_upload, the auth backend, or other services directly.
 */
export function getGatewayBaseUrl() {
  const raw = import.meta.env.VITE_API_GATEWAY_URL;
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/api$/i, '');
  }
  return 'http://localhost:4000';
}
