export function serializeTranscript(segments, { time = false, brackets = false, title = '' } = {}) {
  const text = segments.map(segment => {
    const seconds = Math.max(0, Math.floor(segment.start || 0));
    const stamp = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    return `${time ? `${brackets ? '[' : ''}${stamp}${brackets ? ']' : ''} ` : ''}${segment.speaker ? `[${segment.speaker}] ` : ''}${segment.text}`;
  }).join('\n\n');
  return title ? `${title}\n\n${text}` : text;
}
