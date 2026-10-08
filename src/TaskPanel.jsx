import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';

export default function TaskPanel({ active = true, environment, notes, onCancel, onOpen }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  const jobs = environment?.queue || [];
  const first = jobs[0];
  const title = job => notes.find(note => note.id === job.id)?.title || job.title;
  const percent = job => job.status === 'queued' ? '0%' : job.progress != null ? `${job.progress}%` : '준비 중';
  const stage = job => job.status === 'queued' ? '대기 중' : ['installing','downloading'].includes(job.stage) ? '모델 환경 준비 중' : ['checking','loading'].includes(job.stage) ? '모델 확인 중' : job.stage === 'saving' ? '저장 중' : job.source === 'youtube' ? '음성 가져오는 중' : '변환 중';
  return <>{first ? <button className="task-summary" aria-label="변환 작업 보기" onClick={() => setOpen(true)}><div className="task-summary-meter"><progress max="100" value={first.progress ?? undefined}/><span>{percent(first)}</span></div><div className="task-summary-caption"><span>{title(first)}</span><span className="task-pending" aria-label={`추가 대기 ${jobs.length - 1}개`}>+{jobs.length - 1}</span></div></button> : null}
    {open ? <Modal title="변환 작업" onClose={() => setOpen(false)}><div className="conversion-jobs">{jobs.length ? jobs.map(job => <div className="conversion-job" key={job.id}><button className="job-title" title={title(job)} onClick={() => { onOpen(job.id); setOpen(false); }}>{title(job)}</button><div className="job-meter"><progress aria-label={`${title(job)} 변환 진행`} max="100" value={job.status === 'queued' ? 0 : job.progress ?? undefined}/><span>{percent(job)}</span><small>{stage(job)}</small></div><button className="icon-button" aria-label={`${title(job)} 변환 중단`} title="변환 중단" disabled={job.stage === 'saving'} onClick={() => onCancel(job.id)}>×</button></div>) : <p className="hint">진행 중인 변환이 없습니다.</p>}</div></Modal> : null}
  </>;
}
