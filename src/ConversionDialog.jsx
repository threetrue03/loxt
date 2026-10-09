import { useSettings } from './SettingsProvider.jsx';
import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Select from './Select.jsx';
import { modelOptions } from './modelOptions.js';
import { parentOf } from './FolderTree.jsx';

export default function ConversionDialog({ folders, parents = {}, initialFolder = '', mode = 'work', preserveLocation = false, environment, onConfirm, onClose, onDiscard }) {
  const roots = folders.filter(value => !parentOf(value, parents));
  const [folder, setFolder] = useState(() => {
    if (preserveLocation && folders.includes(initialFolder)) return initialFolder;
    let current = initialFolder; const seen = new Set();
    while (current && parentOf(current, parents) && !seen.has(current)) { seen.add(current); current = parentOf(current, parents); }
    return roots.includes(current) ? current : '';
  });
  const { preferences } = useSettings();
  const [model, setModel] = useState(preferences[mode].model);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [remoteEnvironment, setRemoteEnvironment] = useState(null);
  useEffect(() => {
    if (!window.desktop.remote) return;
    let active = true;
    window.desktop.getTranscriptionEnvironment().then(value => {
      if (active) setRemoteEnvironment(value);
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);
  const models = (remoteEnvironment || environment)?.models || [];
  useEffect(() => {
    if (!window.desktop.remote || !models.length) return;
    if (!models.some(item => item.id === model && item.downloaded)) {
      const installed = models.find(item => item.downloaded && item.preset) || models.find(item => item.downloaded);
      if (installed) setModel(installed.id);
    }
  }, [models, model]);
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
    <div className="conversion-options"><h3>저장할 폴더</h3><div className="folder-choices" role="group" aria-label="저장할 폴더">{['', ...roots, ...(preserveLocation && initialFolder && !roots.includes(initialFolder) ? [initialFolder] : [])].map(value => <button key={value} className="secondary" aria-pressed={folder === value} disabled={working} onClick={() => setFolder(value)}>{value || '폴더 지정 안함'}</button>)}</div>
    <div className="field-label">변환 모델</div><Select label="변환 모델" className="field-select" value={model} disabled={working || !environment || locked} onChange={setModel} options={modelOptions(models, mode, window.desktop.remote)}/><p className="hint">{chosen?.description}{chosen && !chosen.downloaded ? ` · 다운로드 ${chosen.size}` : ''}</p>
    {window.desktop.remote && remoteEnvironment && !models.some(item => item.downloaded) ? <p className="hint">연결한 PC에 설치된 모델이 없습니다. PC의 설정 → 모델 보관함에서 설치한 뒤 이 창을 다시 열어 주세요.</p> : null}
    {error ? <p className="error-message" role="alert">{error}</p> : null}<div className="conversion-actions">{onDiscard ? <button className="secondary danger" disabled={working} onClick={discard}><span>버리기</span></button> : null}<button className="primary" disabled={working || !environment || locked || window.desktop.remote && !chosen?.downloaded} onClick={confirm}>{working ? '처리 중…' : '변환하기'}</button></div></div>
  </Modal>;
}
