import { formatTime } from './data.js';
export default function SpeakerTime({ segment }) {
  const value = segment.speaker;
  const index = typeof value === 'number' ? value : /^\d+$/.test(value || '') ? Number(value) : /^[A-Z]$/.test(value || '') ? value.charCodeAt(0) - 64 : null;
  const label = index != null ? `화자 ${Math.max(1,index)}` : value ? `화자 ${value.replace(/^화자\s*/, '')}` : '';
  return <span className="timestamp">{label ? <span className="speaker-badge" aria-label={label}>{label}</span> : null}<span>{formatTime(segment.start)}</span></span>;
}
