export const folderStorageKey = 'sorinote:folders:v1';

export function loadFolders() {
  try {
    const data = JSON.parse(localStorage.getItem(folderStorageKey) || '[]');
    if (!Array.isArray(data)) return [];
    return [...new Set(data.filter(name => typeof name === 'string' && name.trim() && name.length <= 80))];
  } catch { return []; }
}

export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function durationSeconds(duration) {
  const [minutes, seconds] = duration.split(':').map(Number);
  return minutes * 60 + seconds;
}

export function formatRecordingTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map(part => String(part).padStart(2, '0')).join(':');
}
