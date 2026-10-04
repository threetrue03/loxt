import { useEffect, useRef, useState } from 'react';

export default function InlineName({ value, label, maxLength = 120, onSave, onCancel, className = '', allowEmptyCancel = false }) {
  const [name, setName] = useState(value), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const input = useRef(null), pending = useRef(false), cancelled = useRef(false);
  useEffect(() => { input.current.focus(); input.current.select(); }, []);
  async function save() {
    if (pending.current || cancelled.current) return;
    if (!name.trim()) { if (allowEmptyCancel) { cancelled.current = true; onCancel(); return; } setError('이름을 입력해 주세요.'); input.current.focus(); return; }
    if (name.trim() === value) { onCancel(); return; }
    pending.current = true; setSaving(true); setError('');
    try { await onSave(name.trim()); onCancel(); }
    catch (error) { setError(error.message); }
    finally { pending.current = false; setSaving(false); }
  }
  return <span className={`inline-name ${className}`} onClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}><input ref={input} aria-label={label} aria-invalid={Boolean(error)} value={name} maxLength={maxLength} readOnly={saving} onChange={event => setName(event.target.value)} onBlur={save} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); save(); } if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; onCancel(); } }}/>{error ? <span className="inline-name-error" role="alert">{error}</span> : null}</span>;
}
