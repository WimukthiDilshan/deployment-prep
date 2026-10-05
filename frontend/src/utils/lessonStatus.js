export function isLessonPreparing(status) {
  const value = String(status || '').trim();
  return value === 'queued' || value === 'processing' || value === 'rebuilding';
}
