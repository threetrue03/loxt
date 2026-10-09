// List transport and durable index never duplicate complete transcripts.
function summary(note) {
  const count=note.segments?.length||0;
  return { ...note, segments: (note.segments || []).slice(0, 8).map(s => ({ ...s, text: s.text.slice(0, 500) })), segmentCount: note._summary&&Number.isSafeInteger(note.segmentCount)&&note.segmentCount>=count?note.segmentCount:count, _summary: true };
}
function lightResult(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value.notes) && Array.isArray(value.folders)) return { ...value, notes: value.notes.map(summary) };
  if (value.library) return { ...value, library: lightResult(value.library) };
  return value;
}
module.exports = { summary, lightResult };
