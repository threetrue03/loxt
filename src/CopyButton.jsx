import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export default function CopyButton({ onCopy, onError, disabled = false }) {
  const [copied, setCopied] = useState(false), [working, setWorking] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    if (working || disabled) return;
    setWorking(true);
    try { await onCopy(); clearTimeout(timer.current); setCopied(true); timer.current = setTimeout(() => setCopied(false), 1400); }
    catch (error) { onError(error.message || '스크립트를 복사하지 못했습니다.'); }
    finally { setWorking(false); }
  }
  return <button className={`script-export ${copied ? 'copy-confirmed' : ''}`} aria-label="전체 복사" disabled={working || disabled} onClick={copy}>{copied ? <span className="copy-check" aria-hidden="true">✓</span> : <Icon name="copy"/>}<span>{copied ? '복사됨' : '전체 복사'}</span></button>;
}
