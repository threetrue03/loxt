import Icon from './Icon.jsx';
import Menu from './Menu.jsx';
import { parentOf } from './FolderTree.jsx';

export default function HomePage({ mode, loaded, busy, notes, folders, parents, recent, jobs, recording, onRecord, onImport, onYouTube, onMemo, onFolder, onLibrary, onRoot, onJob, renderNote, renderFolder }) {
  const live = mode === 'live';
  const hasNotes = notes.some(note => !note.deleted);
  const roots = folders.filter(folder => parentOf(folder, parents) === '');
  return <section className="content home-page">
    <header className="heading home-heading"><h1 className="page-title-icon"><Icon name="home"/>홈</h1><span className="home-mode">{live ? 'Live' : 'Work'}</span></header>
    <div className="home-start-actions">
      {!live || !window.desktop.remote ? <button className="home-start-action" disabled={!loaded || busy} onClick={onRecord}><Icon name="mic"/><span><strong>{live ? 'Live 시작' : '새 녹음 시작'}</strong><small>{live ? '말하는 동안 스크립트를 기록하세요.' : '녹음을 마치면 스크립트로 변환합니다.'}</small></span><Icon name="chevronRight"/></button> : null}
      {!live || !window.desktop.remote ? <button className="home-start-action" disabled={!loaded || busy} onClick={onImport}><Icon name="upload"/><span><strong>파일 불러오기</strong><small>음성 파일을 변환하세요.</small></span><Icon name="chevronRight"/></button> : null}
      {!live && !window.desktop.remote ? <button className="home-start-action" disabled={!loaded || busy} onClick={onYouTube}><Icon name="youtube"/><span><strong>YouTube 불러오기</strong><small>링크의 음성을 변환하세요.</small></span><Icon name="chevronRight"/></button> : null}
    </div>
    {recording || jobs.length ? <section className="home-section" aria-labelledby={`home-jobs-${mode}`}><div className="home-section-heading"><h2 id={`home-jobs-${mode}`}>진행 중</h2></div><div className="home-jobs">
      {recording ? <button className="home-recording-job" onClick={recording.onOpen}><Icon name="mic"/><span><strong>{recording.title}</strong><small>{recording.status}</small></span><span>돌아가기</span><Icon name="chevronRight"/></button> : null}
      {jobs.map(job => <button key={job.id} className="home-conversion-job" onClick={() => onJob(job.id)}><span className="home-job-title">{notes.find(note => note.id === job.id)?.title || job.title || '음성 기록'}</span><progress aria-label={`${job.title || '음성 기록'} 변환 진행`} max="100" value={job.status === 'queued' ? 0 : job.progress ?? undefined}/><span className="home-job-progress">{job.status === 'queued' ? '대기 중' : job.source === 'youtube' ? `음성 가져오기${job.progress != null ? ` · ${job.progress}%` : ''}` : job.progress != null ? `${job.progress}%` : job.stage === 'diarizing' ? '화자 분석 중' : '준비 중'}</span><Icon name="chevronRight"/></button>)}
    </div></section> : null}
    <section className="home-section" aria-labelledby={`home-folders-${mode}`}><div className="home-section-heading"><h2 id={`home-folders-${mode}`}>내 보관함</h2><button className="home-section-link" disabled={!loaded} onClick={onRoot}>보관함 열기<Icon name="chevronRight"/></button></div>{roots.length ? <div className="home-folders">{roots.map(renderFolder)}</div> : <p className="home-folder-empty">보관함에서 폴더를 만들어 기록을 정리하세요.</p>}</section>
  </section>;
}
