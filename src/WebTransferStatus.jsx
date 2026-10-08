import { useEffect, useState } from 'react';

export default function WebTransferStatus() {
  const [jobs, setJobs] = useState({});
  useEffect(() => {
    const listener = event => setJobs(current => {
      const next = { ...current };
      if (event.detail.done) delete next[event.detail.id]; else next[event.detail.id] = event.detail;
      return next;
    });
    window.addEventListener('loxt:upload', listener);
    return () => window.removeEventListener('loxt:upload', listener);
  }, []);
  if (!window.desktop.remote || !Object.keys(jobs).length) return null;
  return <aside className="web-transfer" role="status">{Object.values(jobs).map(job => <div key={job.id}><span>{job.name} · {job.loaded === job.total ? 'PC에서 저장 중…' : `업로드 ${Math.floor(job.loaded / job.total * 100)}%`}</span><progress max={job.total} value={job.loaded}/></div>)}</aside>;
}
