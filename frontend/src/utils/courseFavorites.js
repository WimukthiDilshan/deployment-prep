function favoritesStorageKey() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.id) return `lumoraFavorites:${user.id}`;
  } catch {
    // guest
  }
  return 'lumoraFavorites:guest';
}

export function loadFavoriteCourseIds() {
  try {
    const raw = localStorage.getItem(favoritesStorageKey());
    const ids = JSON.parse(raw || '[]');
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveFavoriteCourseIds(ids) {
  try {
    localStorage.setItem(
      favoritesStorageKey(),
      JSON.stringify([...ids].map(String))
    );
  } catch {
    // ignore quota / private mode
  }
}

export function toggleFavoriteCourseId(courseId, current) {
  const id = String(courseId || '');
  if (!id) return current;
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  saveFavoriteCourseIds(next);
  return next;
}
