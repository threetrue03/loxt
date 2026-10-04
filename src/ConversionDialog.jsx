import { useState } from 'react';
import Modal from './Modal.jsx';
import Select from './Select.jsx';
import { parentOf } from './FolderTree.jsx';

export default function ConversionDialog({ folders, parents = {}, initialFolder = '', environment, onConfirm, onClose, onDiscard }) {
  const roots = folders.filter(value => !parentOf(value, parents));
  const [folder, setFolder] = useState(() => {
    let current = initialFolder; const seen = new Set();
    while (current && parentOf(current, parents) && !seen.has(current)) { seen.add(current); current = parentOf(current, parents); }
    return roots.includes(current) ? current : '';
  });
  const [model, setModel] = useState(environment?.model || 'small');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const models = environment?.models || [];
  const locked = environment?.busy && !environment?.queue?.length;
  const chosen = models.find(item => item.id === model);
  async function confirm() {
    setWorking(true); setError('');
    try { await onConfirm({ folder, model }); }
    catch (failure) { setError(failure.message); setWorking(false); }
  }
  async function discard() {
    setWorking(true); setError('');
    try { await onDiscard(); }
    catch (failure) { setError(failure.message); setWorking(false); }
  }
  return <Modal title="변환하기" onClose={() => { if (!working) onClose(); }}>
    <div className="conversion-options"><h3>저장할 폴더</h3><div className="folder-choices" role="group" aria-label="저장할 폴더">{['', ...roots].map(value => <button key={value} className="secondary" aria-pressed={folder === value} disabled={working} onClick={() => setFolder(value)}>{value || '폴더 지정 안함'}</button>)}</div>
    <div className="field-label">변환 모델</div><Select label="변환 모델" className="field-select" value={model} disabled={working || !environment || locked} onChange={setModel} options={models.filter(item => item.preset || item.downloaded || item.id === environment?.model).map(item => ({value:item.id,label:`${item.label}${!item.downloaded ? ' · 설치 필요' : ''}`,group:item.preset ? '기본 모델' : '외부 모델'}))}/><p className="hint">{chosen?.description}{chosen && !chosen.downloaded ? ` · 다운로드 ${chosen.size}` : ''}</p>
    {error ? <p className="error-message" role="alert">{error}</p> : null}<div className="conversion-actions">{onDiscard ? <button className="secondary danger" disabled={working} onClick={discard}><span>버리기</span></button> : null}<button className="primary" disabled={working || !environment || locked} onClick={confirm}>{working ? '처리 중…' : '변환하기'}</button></div></div>
  </Modal>;
}
