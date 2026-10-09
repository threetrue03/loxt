import DocumentHeader from './DocumentHeader.jsx';
import DocumentFullscreenContext from './DocumentFullscreenContext.js';
import {useDocumentFullscreen} from './documentView.js';
import ResizableDocuments from './ResizableDocuments.jsx';
import MemoHost from './MemoHost.jsx';
import SpeakerTime from './SpeakerTime.jsx';
import { useSettings } from './SettingsProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Select from './Select.jsx';
import { modelOptions } from './modelOptions.js';
import Menu from './Menu.jsx';
import { formatTime, formatRecordingTime } from './data.js';
import { captureLive, openLiveInput } from './liveCapture.js';

export default function LiveRecorder({ state, visible, initialFolder, onFinish, onBack, onNotice }) {
  const { preferences } = useSettings();
  const [title, setTitle] = useState('새 Live 녹음'), [model, setModel] = useState(preferences.live.model);
  const [device, setDevice] = useState(preferences.live.microphone), [devices, setDevices] = useState([]), [environment, setEnvironment] = useState(null);
  const [localStage, setLocalStage] = useState('ready'), [paused, setPaused] = useState(false), [error, setError] = useState('');
  const [outputStatus, setOutputStatus] = useState('');
  const [inputProgress, setInputProgress] = useState(null);
  const input = useRef(null), capture = useRef(null), id = useRef(null), sequence = useRef(0), ending = useRef(false), cancelled = useRef(false);
  const [memoOpen,setMemoOpen] = useState(false);
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
      if (current !== generation.current) { await window.desktop.live.finish(result.id).catch(() => {}); return; }
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
  async function cancelPreparation() {
    if (ending.current) return;
    ending.current = true; cancelled.current = true; ++generation.current;
    setLocalStage('finishing');
    input.current?.getTracks().forEach(track => track.stop()); input.current = null;
    try { await window.desktop.systemAudio.cancelPending(); await window.desktop.live.finish(null); }
    catch (failure) { if (!/진행 중인 Live/.test(failure.message)) setError(failure.message); }
    finally { id.current = null; setInputProgress(null); setLocalStage('ready'); ending.current = false; }
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
  const documentRoot=useRef(null); const [fullscreen,toggleFullscreen]=useDocumentFullscreen(documentRoot);
  const models = environment?.models || [];
  const label = localStage === 'save-error' ? '저장 재시도 필요' : state.stage === 'error' ? '변환 오류 · 원본 저장 중' : finishing ? state.finishingPhase === 'diarizing' ? '화자 분석·스크립트 보정 중' : '남은 음성 변환·저장 중' : paused ? '일시정지됨' : active ? 'Live 녹음 중' : '';
  const preparationLabel = state.preparationPhase === 'waiting' ? 'Work 변환 완료 대기' : Number.isFinite(inputProgress ?? state.progress) ? `모델 준비 중 · ${inputProgress ?? state.progress}%` : state.preparationPhase === 'loading' || state.preparationPhase === 'checking' || state.preparationDetail === 'checking' ? '모델 불러오는 중…' : '모델 준비 중…';
  return <DocumentFullscreenContext.Provider value={[fullscreen,toggleFullscreen]}><section ref={documentRoot} className={`content workspace recording-workspace ${fullscreen?"document-fullscreen":""}`}>
    <DocumentHeader onBack={onBack} status={label || (preparing?preparationLabel:"녹음 준비")} title={title} onTitle={setTitle} readOnly={locked} onSave={()=>{if(!title.trim())setTitle("새 Live 녹음");}} folder={initialFolder} label="Live 녹음 제목"/>

    {error || state.error ? <p className="error-message" role="alert">{error || state.error}</p> : null}

    {state.delaySeconds > 4 && active ? <p className="hint live-delay" role="status">변환 지연 중 · 약 {Math.round(state.delaySeconds)}초 대기</p> : null}
    <ResizableDocuments open={memoOpen}><div className="transcript-frame"><div className="detail-tabs"><span>스크립트</span><div className="script-actions"><button className="script-export live-memo-toggle" aria-label="Live 메모 열기" aria-expanded={memoOpen} disabled={!id.current} onClick={() => setMemoOpen(value => !value)}><Icon name="file"/>메모</button><button className="script-export" title={fullscreen?"전체화면 종료":"전체화면"} aria-label={fullscreen?"전체화면 종료":"전체화면"} aria-pressed={fullscreen} onClick={toggleFullscreen}><Icon name={fullscreen?"collapse":"expand"}/></button></div></div><div ref={region} className="transcript" role="region" aria-label="Live 스크립트" tabIndex="0" onScroll={() => { const element = region.current; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40; }}>{state.segments?.map((segment, index) => <div className="segment live-segment" key={`${segment.start}-${index}`}><SpeakerTime segment={segment}/><span className="segment-text">{segment.text}</span></div>)}{state.preview?.length ? <div className="live-preview" aria-label="인식 중인 문장"><small>인식 중</small>{state.preview.map((segment, index) => <div className="segment live-segment" key={index}><SpeakerTime segment={segment}/><span className="segment-text">{segment.text}</span></div>)}</div> : null}{!active && !state.segments?.length && !state.preview?.length ? <div className="empty">모델과 입력 장치를 선택하고 Live를 시작하세요.</div> : null}{active && !paused && !finishing && localStage === 'recording' ? <div className="live-listening" role="status"><i aria-hidden="true"/>듣고 있어요</div> : null}</div></div><aside className="memo-panel" aria-label="Live 녹음 메모" inert={!memoOpen || undefined}>{memoOpen && id.current ? <MemoHost id={id.current} title={title + ' 메모'} compact onClose={() => setMemoOpen(false)}/> : null}</aside></ResizableDocuments>
    <div className="bottom-controls"><div className={`recording ${active && !paused && !finishing ? 'is-recording' : ''}`}>{label ? <div className="record-state" role="status">{label}</div> : null}<span className="record-device" title={device === '__system__' ? outputStatus || '컴퓨터 소리' : device ? devices.find(item => item.deviceId === device) ? devices.find(item => item.deviceId === device).label || '선택한 마이크' : '선택 장치 · 연결되지 않음' : '시스템 기본 마이크'}>{device === '__system__' ? outputStatus || '컴퓨터 소리' : device ? devices.find(item => item.deviceId === device) ? devices.find(item => item.deviceId === device).label || '선택한 마이크' : '선택 장치 · 연결되지 않음' : '시스템 기본 마이크'}</span><LiveMeters id={id.current} active={active} paused={paused} finishing={finishing} seconds={state.seconds}/ ><div className="record-actions live-record-actions">{preparing || connecting ? <button className="secondary" onClick={cancelPreparation}>준비 취소</button> : null}{active && !preparing && !finishing && localStage !== 'save-error' ? <button className="secondary" onClick={togglePause}><Icon name={paused ? 'play' : 'pause'}/>{paused ? 'Live 계속' : '일시정지'}</button> : null}<Select className="sort-select live-model-select" label="Live 변환 모델" value={model} disabled={locked || !environment} onChange={changeModel} upward options={modelOptions(models, 'live')}/><div className="record-start-group"><button className="primary" disabled={preparing || connecting || finishing || !environment} onClick={active ? stop : start}><Icon name={active ? 'stop' : 'mic'}/>{finishing ? '저장 중…' : preparing ? preparationLabel : connecting ? '연결 중…' : localStage === 'save-error' ? '저장 재시도' : active ? 'Live 종료' : 'Live 시작'}</button>{!active ? <Menu label="Live 녹음 장치 선택" className="microphone-menu" upward disabled={preparing || connecting} trigger={<Icon name="chevronDown"/>}>{close => [{ deviceId: '', label: '시스템 기본 마이크' }, { deviceId: '__system__', label: '컴퓨터 소리' }, ...devices].map((item, index) => <button key={item.deviceId} role="menuitemradio" aria-checked={device === item.deviceId} onClick={() => { setDevice(item.deviceId); close(); }}><Icon name={item.deviceId === '__system__' ? 'speaker' : 'mic'}/><span>{item.label || `마이크 ${index}`}</span>{device === item.deviceId ? <span>✓</span> : null}</button>)}</Menu> : null}</div></div></div></div>
  </section></DocumentFullscreenContext.Provider>;
}

function LiveMeters({ id, active, paused, finishing, seconds }) {
  const [meter, setMeter] = useState({ seconds: seconds || 0, level: 0 });
  useEffect(() => { setMeter({ seconds: seconds || 0, level: 0 }); return window.desktop.live.onMeter(value => { if (value.id === id) setMeter(value); }); }, [id]);
  return <><div className="clock">{formatRecordingTime(active ? meter.seconds : 0)}</div><div className="wave" aria-hidden="true">{Array.from({length:12},(_,index) => <i key={index} style={{height:4 + (active && !paused && !finishing ? meter.level || 0 : 0) * (20 + Math.sin(index*1.3)*10)}}/>)}</div>{meter.delaySeconds > 4 && active ? <span className="hint live-delay">약 {Math.round(meter.delaySeconds)}초 대기</span> : null}</>;
}
