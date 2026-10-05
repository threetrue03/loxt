import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import RecordingPage from './RecordingPage.jsx';
import ConversionDialog from './ConversionDialog.jsx';
import Select from './Select.jsx';
import ScriptSkeleton from './ScriptSkeleton.jsx';
import CopyButton from './CopyButton.jsx';
import { taskLabel } from './uiPreferences.js';
import { formatTime } from './data.js';

export default function NoteDetail({ workspaceActive = true, audioHost = 'recording', note, environment, onTranscribe, onCancel, onBack, onUpdate, onExport, folders, initialFolder, onFinish, onDiscard, onBusy, onNotice, onConfigure, onModels, preferences, busy, draftKey, onConvert, onPreferences, folderParents, onCopy }) {
  const saved = Boolean(note);
  note = note || { id: 'draft', title: '새 녹음', seconds: 0, segments: [], done: false };
  const [review, setReview] = useState(false);
  useEffect(() => { if (!workspaceActive) setReview(false); }, [workspaceActive]);
  const audio = useRef(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [duration, setDuration] = useState(note.seconds || 0);
  const [title, setTitle] = useState(note.title);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const transcribing = environment?.task?.id === note.id;
  const queued = environment?.queue?.find(job => job.id === note.id);
  const locked = environment?.busy && !environment?.queue?.length;
  const converting = Boolean(transcribing || queued || ['queued','transcribing'].includes(note.status));
  const segments = converting ? [] : note.segments;
  const invalidTimeline = note.done && !converting && duration > 0 && segments.some(segment => segment.start >= duration || segment.end > duration + 0.25);
  const active = segments.findLastIndex(s => s.start <= position);
  useEffect(() => { setTitle(note.title); setPosition(0); setPlaying(false); setSpeed(1); setDuration(note.seconds || 0); setReady(false); setError(''); setReview(false); }, [note.id]);
  useEffect(() => { if (note.seconds > 0) setDuration(note.seconds); }, [note.seconds]);
  const titleSave = useRef(Promise.resolve()), titleVersion = useRef(0), savedTitle = useRef(note.title);
  useEffect(() => { savedTitle.current = note.title; }, [note.title]);
  async function saveTitle() {
    const value = title.trim() || savedTitle.current;
    if (value === savedTitle.current) return;
    const version = ++titleVersion.current;
    const task = titleSave.current.catch(() => {}).then(async () => {
      try {
        if (value === savedTitle.current) return;
        if (!(await onUpdate({ title: value }))) throw new Error('제목을 저장하지 못했습니다. 다시 입력해 주세요.');
        savedTitle.current = value;
      } catch (failure) { if (version === titleVersion.current) { setTitle(savedTitle.current); setError(failure.message); } }
    });
    titleSave.current = task; await task;
  }
  async function play() {
    setError('');
    if (playing) { audio.current.pause(); return; }
    try { await audio.current.play(); }
    catch { setError('녹음을 재생하지 못했습니다. 원본 파일과 오디오 장치 상태를 확인해 주세요.'); }
  }
  function seek(value) {
    try { audio.current.currentTime = value; setPosition(value); }
    catch { setError('이 구간으로 이동하지 못했습니다. 재생을 시작한 뒤 다시 시도해 주세요.'); }
  }
  function loaded() {
    setReady(true);
    const seconds = audio.current.duration;
    if (Number.isFinite(seconds) && seconds > 0) {
      setDuration(seconds);
      if (Math.abs(seconds - note.seconds) > 0.2) onUpdate({ seconds });
    }
  }
  function ended() {
    setPlaying(false);
    const seconds = audio.current.currentTime;
    if (seconds > duration + 0.2) { setDuration(seconds); onUpdate({ seconds }); }
  }
  if (!saved) return <RecordingPage workspaceActive={workspaceActive} key={draftKey} preferences={preferences} onPreferences={onPreferences} environment={environment} folders={folders} folderParents={folderParents} initialFolder={initialFolder} onBack={onBack} onFinish={onFinish} onDiscard={onDiscard} onBusy={onBusy} onNotice={onNotice}/>;
  return <section className="content workspace">
    <button className="back" onClick={onBack} disabled={busy}>← 녹음 목록</button>
    <div className="heading workspace-heading"><div className="workspace-title"><div className="detail-title"><input aria-label="녹음 제목 변경" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/></div><div className="detail-meta">{note.folder || '내 보관함'}　 /　 {note.date}　 /　 {formatTime(duration)}</div></div></div>
    <audio ref={audio} src={`sorinote-audio://${audioHost}/${note.id}`} preload="metadata" onLoadedMetadata={loaded} onCanPlay={() => setReady(true)} onTimeUpdate={() => setPosition(audio.current.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={ended} onError={() => { setError('원본을 재생할 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.'); setReady(false); }}/>
    {note.source?.type === 'youtube' && audioHost === 'recording' ? <button className="back youtube-source" onClick={() => { window.desktop.youtube.openSource(note.id).catch(failure => setError(failure.message)); }}><Icon name="youtube"/>YouTube 원본 열기</button> : null}
    {note.recovered ? <p className="recovery-message">중단된 녹음에서 저장된 부분을 복구했습니다.</p> : null}
    {error || note.transcriptionError ? <p className="error-message" role="alert">{error || note.transcriptionError}</p> : null}
    {note.diarization?.status === 'failed' && !converting ? <p className="recovery-message" role="status">스크립트는 저장되었습니다. 화자 분석 실패: {note.diarization.error} <button className="secondary" disabled={environment?.busy} onClick={async () => { try { await window.desktop.retrySpeakers(note.id, audioHost === 'live' ? 'live' : 'work'); } catch (failure) { setError(failure.message); } }}>화자 분석 재시도</button></p> : null}
    {invalidTimeline ? <p className="error-message" role="alert">스크립트 시간이 원본 녹음 길이와 맞지 않습니다. 하단의 다시 변환하기 버튼으로 시간 정렬을 다시 진행해 주세요.</p> : null}
    <div className="transcript-frame"><div className="detail-tabs"><span>스크립트</span><div className="script-actions">{note.done && !converting ? <><CopyButton onCopy={onCopy} onError={setError}/><button className="script-export" onClick={onExport}><Icon name="download"/>내보내기</button></> : <span>{queued?.status === 'queued' ? '변환 대기 중' : transcribing ? taskLabel(environment) : '변환 대기'}</span>}</div></div><div className="transcript" role="region" aria-label="스크립트" aria-busy={converting} tabIndex="0">{converting ? <ScriptSkeleton/> : segments.length ? segments.map((segment, index) => <button className={`segment ${active === index ? 'active' : ''}`} key={`${segment.start}-${index}`} aria-label={`${formatTime(segment.start)} 구간 재생`} disabled={!note.done || !ready} onClick={() => seek(Math.min(segment.start, duration))}><span className="timestamp">{formatTime(segment.start)}{segment.speaker ? <span className="speaker-badge" aria-label={`화자 ${segment.speaker}`}>{segment.speaker}</span> : null}</span><span className="segment-text">{segment.text}</span></button>) : <div className="empty">{transcribing ? '변환된 내용이 여기에 표시됩니다.' : note.done ? '인식된 음성이 없습니다. 원본 녹음을 확인하세요.' : '하단에서 변환하기를 눌러 스크립트를 만드세요.'}</div>}</div></div>
    <div className="bottom-controls">{queued ? <div className="conversion-progress"><div><strong>{queued.status === 'queued' ? '대기 중 · 순서대로 변환합니다' : taskLabel(environment)}</strong><progress aria-label="변환 진행" max="100" value={queued.status === 'queued' ? 0 : environment.progress ?? undefined}/></div><span>{queued.status === 'queued' ? '0%' : environment.progress != null ? `${environment.progress}%` : ''}</span><button className="secondary" onClick={onCancel} disabled={queued.stage === 'saving'}>변환 취소</button></div> : note.done ? <div className="player workspace-player"><button className="play" title={playing ? '일시정지' : '재생'} aria-label={playing ? '녹음 일시정지' : '녹음 재생'} onClick={play} disabled={!ready}><Icon name={playing ? 'pause' : 'play'}/></button><div className="timeline"><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(position, duration || 1)} disabled={!ready || !duration} aria-label="재생 위치" onChange={event => seek(Number(event.target.value))}/><div className="time-label">{formatTime(position)} / {formatTime(duration)}</div></div><Select className="speed-select" label="재생 속도" value={speed} upward disabled={!ready} onChange={value => { setSpeed(value); audio.current.playbackRate = value; }} options={[.75,1,1.5,2].map(value => ({value,label:`${value === 1 ? '1.0' : value}×`}))}/>{onConvert ? <button className="secondary" disabled={locked || note.deleted} onClick={() => setReview(true)}>다시 변환하기</button> : null}</div> : <div className="conversion-progress"><span>원본 저장 완료 · {formatTime(duration)}</span><button className="primary" disabled={!environment || locked || note.deleted} onClick={() => setReview(true)}>변환하기</button></div>}</div>
    {review ? <ConversionDialog mode={audioHost === 'live' ? 'live' : 'work'} preserveLocation folders={folders} parents={folderParents} initialFolder={note.folder || ''} environment={environment} onClose={() => setReview(false)} onConfirm={async options => { await onConvert(options); setReview(false); }}/>: null}
  </section>;
}
