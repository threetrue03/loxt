import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Select from './Select.jsx';
import Menu from './Menu.jsx';
import { formatTime, formatRecordingTime } from './data.js';
import { captureLive, openLiveInput } from './liveCapture.js';

export default function LiveRecorder({ state, visible, initialFolder, onFinish, onBack, onNotice }) {
  const [title, setTitle] = useState('새 Live 녹음'), [model, setModel] = useState('large-v3-turbo');
  const [device, setDevice] = useState(''), [devices, setDevices] = useState([]), [environment, setEnvironment] = useState(null);
  const [localStage, setLocalStage] = useState('ready'), [paused, setPaused] = useState(false), [error, setError] = useState('');
  const [outputStatus, setOutputStatus] = useState('');
  const [inputProgress, setInputProgress] = useState(null);
  const input = useRef(null), capture = useRef(null), id = useRef(null), sequence = useRef(0), ending = useRef(false), cancelled = useRef(false);
  const region = useRef(null), follow = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    let mounted = true;
    window.desktop.getTranscriptionEnvironment().then(value => { if (mounted) setEnvironment(value); }).catch(() => {});
    const off = window.desktop.onTranscriptionState(value => { if (mounted) setEnvironment(value); });
    const update = () => navigator.mediaDevices.enumerateDevices().then(list => { if (mounted) setDevices(list.filter(device => device.kind === 'audioinput' && !['default', 'communications'].includes(device.deviceId))); }).catch(() => {});
    update(); navigator.mediaDevices.addEventListener('devicechange', update);
    return () => { mounted = false; off(); navigator.mediaDevices.removeEventListener('devicechange', update); };
  }, []);
  useEffect(() => { if (visible && follow.current && region.current) region.current.scrollTop = region.current.scrollHeight; }, [visible, state.segments, state.preview]);
  const preparing = localStage === 'preparing' || state.stage === 'preparing', connecting = localStage === 'starting';
  const active = ['recording', 'finishing', 'save-error'].includes(localStage), finishing = localStage === 'finishing';
  const locked = preparing || connecting || active;
  // A warm model holds the GPU; returning to Work before recording releases it.
  useEffect(() => {
    if (!visible && state.stage === 'ready' && localStage === 'ready') window.desktop.live.finish(null).catch(() => {});
  }, [visible, state.stage, localStage]);
  async function changeModel(value) {
    if (locked) return;
    setLocalStage('preparing'); setError('');
    try { if (state.stage === 'ready') await window.desktop.live.finish(null); setModel(value); }
    catch (failure) { setError(failure.message); }
    finally { setLocalStage('ready'); }
  }
  async function start() {
    if (locked) return;
    setError(''); cancelled.current = false; ending.current = false;
    setLocalStage('starting');
    const current = ++generation.current;
    try {
      // Request loopback while this click still carries a user gesture.
      setOutputStatus('');
      const stream = await openLiveInput(device, event => {
        if (current !== generation.current) return;
        if (event.type === 'preparing') { setLocalStage('preparing'); setInputProgress(event.progress); }
        if (event.type === 'device') setOutputStatus(event.device);
        if (event.type === 'reconnecting') setOutputStatus('출력 장치 다시 연결 중…');
      });
      if (current !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      input.current = stream;
      setInputProgress(null); setLocalStage('starting');
      if (state.stage !== 'ready' || state.model !== model) {
        setLocalStage('preparing');
        await window.desktop.live.prepare({ model });
        if (current !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
        setLocalStage('starting');
      }
      const result = await window.desktop.live.start({ title: title.trim() || '새 Live 녹음', folder: initialFolder, model });
      id.current = result.id; sequence.current = 0;
      if (current !== generation.current) return;
      const recorder = await captureLive(stream, bytes => window.desktop.live.append({ id: id.current, sequence: sequence.current++, bytes }), failure => { setError(failure.message); stop(); });
      if (current !== generation.current) { await recorder.stop(); return; }
      capture.current = recorder;
      input.current.getAudioTracks().forEach(track => { track.onended = () => { onNotice('입력 장치 연결이 끊겨 Live 녹음을 저장합니다.'); stop(); }; });
      setPaused(false); setLocalStage('recording');
    } catch (failure) {
      if (current !== generation.current) return;
      input.current?.getTracks().forEach(track => track.stop()); input.current = null;
      if (id.current) await window.desktop.live.finish(id.current).then(onFinish).catch(() => {});
      id.current = null; setLocalStage('ready'); if (!cancelled.current) setError(failure.message || '음성 입력을 시작하지 못했습니다.');
    }
  }
  async function togglePause() {
    if (!capture.current) return;
    try {
      if (!paused) { await capture.current.pause(); await window.desktop.live.pause(id.current, true); setPaused(true); }
      else { await window.desktop.live.pause(id.current, false); capture.current.resume(); setPaused(false); }
    } catch (failure) { setError(failure.message); }
  }
  async function stop() {
    if (ending.current) return; ending.current = true; cancelled.current = true; ++generation.current; setLocalStage('finishing');
    try {
      if (capture.current) { const recorder = capture.current; capture.current = null; await recorder.stop(); }
      else input.current?.getTracks().forEach(track => track.stop());
      const backend = await window.desktop.live.getState();
      const result = ['idle', 'done'].includes(backend.stage) ? { canceled: true } : await window.desktop.live.finish(backend.id);
      id.current = null; input.current = null;
      if (result.canceled) { setLocalStage('ready'); ending.current = false; }
      else onFinish(result);
    } catch (failure) { setError(failure.message); setLocalStage('save-error'); ending.current = false; }
  }
  const models = environment?.models?.filter(item => item.preset || item.downloaded) || [];
  const label = localStage === 'save-error' ? '저장 재시도 필요' : state.stage === 'error' ? '변환 오류 · 원본 저장 중' : finishing ? state.finishingPhase === 'diarizing' ? '화자 분석·스크립트 보정 중' : '남은 음성 변환·저장 중' : paused ? '일시정지됨' : active ? 'Live 녹음 중' : '';
  const preparationLabel = Number.isFinite(inputProgress ?? state.progress) ? `모델 준비 중 · ${inputProgress ?? state.progress}%` : state.preparationPhase === 'loading' || state.preparationPhase === 'checking' || state.preparationDetail === 'checking' ? '모델 불러오는 중…' : '모델 준비 중…';
  return <section className="content workspace recording-workspace">
    <button className="back" onClick={onBack}>← Live 기록 목록</button>
    <div className="heading workspace-heading"><div className="workspace-title detail-title"><input className="recording-title" aria-label="Live 녹음 제목" maxLength={120} value={title} readOnly={locked} onChange={event => setTitle(event.target.value)} onBlur={() => { if (!title.trim()) setTitle('새 Live 녹음'); }}/></div></div>

    {error || state.error ? <p className="error-message" role="alert">{error || state.error}</p> : null}
    {outputStatus ? <p className="hint live-delay" role="status">컴퓨터 소리 · {outputStatus}</p> : null}
    {state.delaySeconds > 4 && active ? <p className="hint live-delay" role="status">변환 지연 중 · 약 {Math.round(state.delaySeconds)}초 대기</p> : null}
    <div className="transcript-frame"><div className="detail-tabs"><span>스크립트</span><span className="live-status">{active && !paused ? 'Live' : ''}</span></div><div ref={region} className="transcript" role="region" aria-label="Live 스크립트" tabIndex="0" onScroll={() => { const element = region.current; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40; }}>{state.segments?.map((segment, index) => <div className="segment live-segment" key={`${segment.start}-${index}`}><span className="timestamp">{formatTime(segment.start)}{segment.speaker ? <span className="speaker-badge" aria-label={`화자 ${segment.speaker}`}>{segment.speaker}</span> : null}</span><span className="segment-text">{segment.text}</span></div>)}{state.preview?.length ? <div className="live-preview" aria-label="인식 중인 문장"><small>인식 중</small>{state.preview.map((segment, index) => <div className="segment live-segment" key={index}><span className="timestamp">{formatTime(segment.start)}{segment.speaker ? <span className="speaker-badge" aria-label={`화자 ${segment.speaker}`}>{segment.speaker}</span> : null}</span><span className="segment-text">{segment.text}</span></div>)}</div> : null}{!state.segments?.length && !state.preview?.length ? <div className="empty">{active ? '말하면 스크립트가 여기에 이어집니다.' : '모델과 입력 장치를 선택하고 Live를 시작하세요.'}</div> : null}</div></div>
    <div className="bottom-controls"><div className={`recording ${active && !paused && !finishing ? 'is-recording' : ''}`}>{label ? <div className="record-state" role="status">{label}</div> : null}<div className="clock">{formatRecordingTime(active ? state.seconds || 0 : 0)}</div><div className="wave" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ height: 4 + (active && !paused && !finishing ? state.level || 0 : 0) * (20 + Math.sin(index * 1.3) * 10) }}/>)}</div><div className="record-actions live-record-actions">{active && !preparing && !finishing && localStage !== 'save-error' ? <button className="secondary" onClick={togglePause}><Icon name={paused ? 'play' : 'pause'}/>{paused ? 'Live 계속' : '일시정지'}</button> : null}<Select className="sort-select live-model-select" label="Live 변환 모델" value={model} disabled={locked || !environment} onChange={changeModel} upward options={models.map(item => ({ value: item.id, label: `${item.label}${!item.downloaded ? ' · 설치 필요' : ''}`, group: item.preset ? '기본 모델' : '외부 모델' }))}/><div className="record-start-group"><button className="primary" disabled={preparing || connecting || finishing || !environment} onClick={active ? stop : start}><Icon name={active ? 'stop' : 'mic'}/>{finishing ? '저장 중…' : preparing ? preparationLabel : connecting ? '연결 중…' : localStage === 'save-error' ? '저장 재시도' : active ? 'Live 종료' : 'Live 시작'}</button>{!active ? <Menu label="Live 녹음 장치 선택" className="microphone-menu" upward disabled={preparing || connecting} trigger={<Icon name="chevronDown"/>}>{close => [{ deviceId: '', label: '시스템 기본 마이크' }, { deviceId: '__system__', label: '컴퓨터 소리' }, ...devices].map((item, index) => <button key={item.deviceId} role="menuitemradio" aria-checked={device === item.deviceId} onClick={() => { setDevice(item.deviceId); close(); }}><Icon name={item.deviceId === '__system__' ? 'speaker' : 'mic'}/><span>{item.label || `마이크 ${index}`}</span>{device === item.deviceId ? <span>✓</span> : null}</button>)}</Menu> : null}</div></div></div></div>
  </section>;
}
