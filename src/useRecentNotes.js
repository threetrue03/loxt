import { useCallback, useState } from 'react';

export default function useRecentNotes(workspace, notes) {
  const key = `loxt.recent-opened.${workspace}`;
  const [ids, setIds] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value?.version === 1 && Array.isArray(value.ids) ? value.ids.filter(id => typeof id === 'string').slice(0, 50) : [];
    } catch { return []; }
  });
  const remember = useCallback(id => {
    setIds(previous => {
      const next = [id, ...previous.filter(value => value !== id)].slice(0, 50);
      try { localStorage.setItem(key, JSON.stringify({ version: 1, ids: next })); } catch { /* Keep history for this session when storage is unavailable. */ }
      return next;
    });
  }, [key]);
  const available = new Map(notes.filter(note => !note.deleted).map(note => [note.id, note]));
  return { recent: ids.flatMap(id => available.has(id) ? [available.get(id)] : []), remember };
}
