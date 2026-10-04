import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Select from './Select.jsx';
import { parentOf } from './FolderTree.jsx';
import { formatTime } from './data.js';

export default function YouTubeDialog({ folders, parents, initialFolder, environment, onClose, onStarted }) {
  const [url, setUrl] = useState('');
  const [video, setVideo] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const roots = folders.filter(folder => !parentOf(folder, parents));
  const [folder, setFolder] = useState(() => {
    let current = initialFolder; const visited = new Set();
    while (current && parentOf(current, parents) && !visited.has(current)) { visited.add(current); current = parentOf(current, parents); }
    return roots.includes(current) ? current : '';
  });
  const [model, setModel] = useState(null);
  const selectedModel = model || environment?.model || 'small';
  const mounted = useRef(true);
  const inspecting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (inspecting.current) window.desktop.youtube.cancelInspect().catch(() => {}); }; }, []);
  async function inspect(event) {
    event.preventDefault(); setError(''); setWorking(true); inspecting.current = true;
    try { const info = await window.desktop.youtube.inspect(url); if (mounted.current) setVideo(info); }
    catch (failure) { if (mounted.current) setError(failure.message); }
    finally { inspecting.current = false; if (mounted.current) setWorking(false); }
  }
  async function start() {
    setError(''); setWorking(true);
    try { await window.desktop.youtube.start({ token: video.token, folder, model: selectedModel }); onStarted(); }
    catch (failure) { if (mounted.current) { setError(failure.message); setWorking(false); } }
  }
  return <Modal title="YouTube 불러오기" onClose={() => { if (!working || !video) onClose(); }}>
    {!video ? <form onSubmit={inspect} className="youtube-link-form"><label htmlFor="youtube-link">영상 링크</label><input id="youtube-link" type="url" required maxLength={2048} autoComplete="off" placeholder="YouTube 링크를 붙여넣으세요" value={url} disabled={working} onChange={event => { setUrl(event.target.value); setError(''); }}/><p className="hint">공개된 일반 업로드 영상의 음성을 가져옵니다.</p>{error ? <p className="error-message" role="alert">{error}</p> : null}<div className="conversion-actions"><button type="submit" className="primary" disabled={working || !url.trim()}>{working ? '영상 확인 중…' : '영상 확인'}</button></div></form> : <div className="conversion-options">
      <div className="youtube-video"><h3>{video.title}</h3><p>{video.uploader}{video.uploader ? ' · ' : ''}{formatTime(video.seconds)}</p></div>
      <h3>저장할 폴더</h3><div className="folder-choices" role="group" aria-label="저장할 폴더">{['', ...roots].map(value => <button key={value} className="secondary" aria-pressed={folder === value} disabled={working} onClick={() => setFolder(value)}>{value || '폴더 지정 안함'}</button>)}</div>
      <div className="field-label">변환 모델</div><Select label="변환 모델" className="field-select" value={selectedModel} disabled={working || !environment} onChange={setModel} options={(environment?.models || []).filter(item => item.preset || item.downloaded || item.id === environment?.model).map(item => ({ value: item.id, label: `${item.label}${!item.downloaded ? ' · 설치 필요' : ''}`, group: item.preset ? '기본 모델' : '외부 모델' }))}/>
      {error ? <p className="error-message" role="alert">{error}</p> : null}<div className="conversion-actions"><button className="secondary" disabled={working} onClick={() => { setVideo(null); setError(''); }}>뒤로</button><button className="primary" disabled={working || !environment} onClick={start}>{working ? '처리 중…' : '변환하기'}</button></div>
    </div>}
  </Modal>;
}

export function YouTubeProgress({ jobs, onClose, onCancel }) {
  return <Modal title="음성 가져오기" onClose={onClose}><div className="conversion-jobs">{jobs.length ? jobs.map(job => <div className="conversion-job" key={job.id}><span className="job-title" title={job.title}>{job.title}</span><div className="job-meter"><progress aria-label={`${job.title} 음성 가져오기 진행`} max="100" value={job.progress ?? undefined}/><span>{job.status === 'queued' ? '0%' : job.progress != null ? `${job.progress}%` : '연결 중'}</span><small>{job.status === 'queued' ? '대기 중' : job.stage === 'saving' ? '저장 중' : '음성 가져오는 중'}</small></div><button className="icon-button" aria-label={`${job.title} 가져오기 중단`} disabled={job.stage === 'saving'} onClick={() => onCancel(job.id)}>×</button></div>) : <p className="hint">음성 가져오기가 끝났습니다. 저장된 기록의 변환 상태는 변환 작업에서 확인할 수 있습니다.</p>}</div></Modal>;
}
