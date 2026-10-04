import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Menu from './Menu.jsx';
import ConversionDialog from './ConversionDialog.jsx';
import { formatRecordingTime } from './data.js';
import { openLiveInput } from './liveCapture.js';

function microphoneError(error) {
  if (error.name === 'NotAllowedError') return '마이크 사용 권한이 없습니다. Windows 마이크 개인정보 설정과 앱 권한을 확인해 주세요.';
  if (error.name === 'NotFoundError') return '연결된 마이크가 없습니다. 마이크를 연결한 뒤 다시 시작해 주세요.';
  if (error.name === 'NotReadableError') return '마이크를 열지 못했습니다. 다른 앱의 마이크 사용과 장치 상태를 확인해 주세요.';
  return '녹음을 시작하지 못했습니다. 마이크와 저장 공간을 확인해 주세요.';
}

export default function RecordingPage({ workspaceActive = true, folderParents, folders, initialFolder, onBack, onFinish, onDiscard, onBusy, onNotice, environment, preferences = {}, onPreferences }) {
  const [title, setTitle] = useState('새 녹음');
  const folder = initialFolder || '';
  const [devices, setDevices] = useState([]);
  const [device, setDevice] = useState(preferences.microphone || '');
  const [state, setState] = useState('ready');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [outputStatus, setOutputStatus] = useState('');
  const [stored, setStored] = useState(null);
  const [review, setReview] = useState(false);
  useEffect(() => { if (!workspaceActive) setReview(false); }, [workspaceActive]);
  const recorder = useRef(null);
  const stream = useRef(null);
  const audioContext = useRef(null);
  const analyser = useRef(null);
  const session = useRef(null);
  const pending = useRef([]);
  const pump = useRef(null);
  const sequence = useRef(0);
  const elapsed = useRef(0);
  const startedAt = useRef(0);
  const status = useRef('ready');
  const totalSeconds = useRef(0);
  const stopReason = useRef('');
  const finalizing = useRef(null);
  const mounted = useRef(true);
  const callbacks = useRef({ onFinish, onBusy, onNotice });
  callbacks.current = { onFinish, onBusy, onNotice };

  function changeState(value) { status.current = value; if (mounted.current) setState(value); }
  const currentSeconds = () => (elapsed.current + (status.current === 'recording' ? performance.now() - startedAt.current : 0)) / 1000;
  function releaseMicrophone() {
    stream.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    stream.current = null;
    audioContext.current?.close().catch(() => {}); audioContext.current = null; analyser.current = null;
    if (mounted.current) setLevel(0);
  }

  useEffect(() => {
    mounted.current = true;
    const updateDevices = async () => {
      try { const list = await navigator.mediaDevices.enumerateDevices(); if (mounted.current) setDevices(list.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')); }
      catch { /* 시작 시 자세한 마이크 오류를 안내합니다. */ }
    };
    updateDevices(); navigator.mediaDevices?.addEventListener('devicechange', updateDevices);
    return () => {
      mounted.current = false;
      navigator.mediaDevices?.removeEventListener('devicechange', updateDevices);
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
      releaseMicrophone();
    };
  }, []);

  useEffect(() => {
    if (state !== 'recording') return;
    const timer = setInterval(() => setSeconds(currentSeconds()), 200);
    let frame;
    const values = new Uint8Array(256);
    function meter() {
      if (analyser.current) {
        analyser.current.getByteTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / values.length);
        setLevel(Math.min(1, rms * 5));
      }
      frame = requestAnimationFrame(meter);
    }
    meter();
    return () => { clearInterval(timer); cancelAnimationFrame(frame); };
  }, [state]);

  useEffect(() => {
    if (state !== 'recording' && state !== 'paused') return;
    const timer = setInterval(() => {
      if (session.current) window.desktop.checkpointRecording({ id: session.current, seconds: currentSeconds() }).catch(() => {
        setError('저장 공간을 확인해 주세요. 녹음을 종료하면 저장을 다시 시도합니다.');
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [state]);

  function flushChunks() {
    if (pump.current) return pump.current;
    const work = (async () => {
      while (pending.current.length) {
        const bytes = new Uint8Array(await pending.current[0].arrayBuffer());
        await window.desktop.appendRecording({ id: session.current, sequence: sequence.current, bytes });
        pending.current.shift(); sequence.current++;
      }
    })();
    pump.current = work;
    work.then(() => { if (pump.current === work) pump.current = null; }, () => { if (pump.current === work) pump.current = null; });
    return work;
  }

  async function save() {
    changeState('saving');
    try {
      await flushChunks();
      // ondataavailable의 마지막 조각까지 받은 후에만 파일과 목록을 확정합니다.
      if (pending.current.length) await flushChunks();
      const result = await window.desktop.finishRecording({ id: session.current, seconds: totalSeconds.current });
      session.current = null; callbacks.current.onBusy(false);
      setStored(result); changeState('stopped');
      await callbacks.current.onFinish(result, { review: true });
      if (finalizing.current) { finalizing.current.resolve(result); finalizing.current = null; }
      else setReview(true);
      if (stopReason.current) callbacks.current.onNotice(stopReason.current);
    } catch (failure) {
      changeState('save-error');
      setError('녹음을 저장하지 못했습니다. 저장 공간과 권한을 확인한 뒤 재시도해 주세요. 아직 저장하지 못한 조각은 이 화면에 보관됩니다.');
      if (finalizing.current) { finalizing.current.reject(failure); finalizing.current = null; }
    }
  }

  function stop(reason = '') {
    if (!recorder.current || recorder.current.state === 'inactive') return;
    totalSeconds.current = currentSeconds(); elapsed.current = totalSeconds.current * 1000;
    setSeconds(totalSeconds.current); stopReason.current = reason;
    changeState('saving'); recorder.current.stop();
  }

  async function start() {
    if (!window.desktop) { setError('데스크톱 앱에서 녹음할 수 있습니다.'); return; }
    changeState('starting'); setError(''); callbacks.current.onBusy(true);
    try {
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('녹음 형식을 지원하지 않습니다.');
      setOutputStatus('');
      stream.current = await openLiveInput(device, event => {
        if (!mounted.current) return;
        if (event.type === 'device') setOutputStatus(event.device);
        if (event.type === 'reconnecting') setOutputStatus('출력 장치 다시 연결 중…');
      });
      const result = await window.desktop.beginRecording({ title: title.trim() || '새 녹음', folder, mime: mime.split(';')[0] });
      session.current = result.id; pending.current = []; sequence.current = 0; elapsed.current = 0;
      recorder.current = new MediaRecorder(stream.current, { mimeType: mime, audioBitsPerSecond: 128000 });
      recorder.current.ondataavailable = event => {
        if (!event.data.size) return;
        pending.current.push(event.data);
        flushChunks().catch(() => {
          if (['recording', 'paused'].includes(status.current)) stop('저장 오류로 녹음을 멈췄습니다. 저장된 원본을 확인해 주세요.');
        });
      };
      recorder.current.onstop = () => { releaseMicrophone(); save(); };
      recorder.current.onerror = () => stop('마이크 녹음에 오류가 발생해 녹음을 종료했습니다. 저장된 원본을 확인해 주세요.');
      stream.current.getAudioTracks().forEach(track => { track.onended = () => stop('마이크 연결이 끊겨 녹음을 종료하고 저장했습니다.'); });
      try {
        const context = new AudioContext(); audioContext.current = context;
        const source = context.createMediaStreamSource(stream.current);
        analyser.current = context.createAnalyser(); analyser.current.fftSize = 256; source.connect(analyser.current);
        await context.resume();
      } catch { /* 입력 파형을 표시하지 못해도 녹음은 계속합니다. */ }
      startedAt.current = performance.now(); recorder.current.start(1000); changeState('recording');
      navigator.mediaDevices.enumerateDevices().then(list => {
        if (mounted.current) setDevices(list.filter(d => d.kind === 'audioinput' && !['default', 'communications'].includes(d.deviceId)));
      }).catch(() => {});
    } catch (failure) {
      releaseMicrophone();
      if (session.current) { await window.desktop.abandonRecording(session.current).catch(() => {}); session.current = null; }
      callbacks.current.onBusy(false); changeState('ready'); setError(device === '__system__' ? `컴퓨터 소리 녹음을 시작하지 못했습니다. ${failure.name === 'NotAllowedError' ? '녹음 시작 버튼을 다시 눌러 주세요.' : failure.message}` : microphoneError(failure));
    }
  }
  function pause() {
    if (status.current === 'recording') {
      elapsed.current += performance.now() - startedAt.current;
      recorder.current.pause(); setSeconds(elapsed.current / 1000); setLevel(0); changeState('paused');
    } else {
      recorder.current.resume(); startedAt.current = performance.now(); changeState('recording');
    }
  }
  function stopForReview() {
    if (status.current === 'recording') pause();
    setReview(true);
  }
  async function convert(options) {
    const result = stored || await new Promise((resolve, reject) => {
      finalizing.current = { resolve, reject };
      if (status.current === 'save-error') save();
      else stop();
    });
    await callbacks.current.onFinish(result, { ...options, title: title.trim() || '새 녹음' });
  }
  async function discard() {
    const id = session.current || stored?.note.id;
    const previous = status.current;
    changeState('discarding');
    if (recorder.current) {
      recorder.current.ondataavailable = null; recorder.current.onstop = null;
      recorder.current.onerror = null;
      if (recorder.current.state !== 'inactive') recorder.current.stop();
    }
    releaseMicrophone();
    try {
      await pump.current?.catch(() => {});
      const library = await window.desktop.discardRecording(id);
      pending.current = []; session.current = null; callbacks.current.onBusy(false);
      onDiscard(library);
    } catch (failure) {
      changeState(stored ? 'stopped' : 'save-error');
      if (!stored && previous !== 'save-error') totalSeconds.current = elapsed.current / 1000;
      throw failure;
    }
  }
  async function keepPartial() {
    try {
      await window.desktop.abandonRecording(session.current); session.current = null;
      callbacks.current.onBusy(false); onBack();
      callbacks.current.onNotice('저장된 부분은 다음 실행에서 복구됩니다. 저장하지 못한 부분은 제외됩니다.');
    } catch { setError('부분 녹음을 정리하지 못했습니다. 저장 공간을 확인하고 재시도해 주세요.'); }
  }
  const active = !['ready', 'stopped'].includes(state);
  const statusText = { ready: '녹음 준비', starting: '마이크 연결 중', recording: '녹음 중 · 원본 자동 저장', paused: '일시정지됨', saving: '원본 저장 중', stopped: '원본 저장 완료', 'save-error': '저장 실패' }[state];
  return <section className="content workspace recording-workspace">
    <button className="back" onClick={onBack}>← 녹음 목록</button>
    <div className="heading workspace-heading"><div className="workspace-title detail-title"><input className="recording-title" aria-label="녹음 제목" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} onBlur={() => { if (!title.trim()) setTitle('새 녹음'); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/></div></div>
    {error ? <p className="error-message" role="alert">{error}</p> : null}
    <div className="transcript-frame"><div className="detail-tabs">스크립트</div><div className="transcript" role="region" aria-label="스크립트" tabIndex="0"><div className="empty">{stored ? '저장할 폴더와 모델을 선택하면 변환을 시작합니다.' : '녹음을 중단하면 음성을 스크립트로 변환합니다.'}</div></div></div>
    <div className="bottom-controls">
    <div className={`recording ${state === 'recording' ? 'is-recording' : state === 'paused' ? 'is-paused' : ''}`}>
      {state !== 'ready' ? <div className="record-state" role="status">{statusText}{outputStatus ? ` · ${outputStatus}` : ''}</div> : null}
      <div className="wave" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ height: 4 + level * (20 + Math.sin(i * 1.3) * 10) }}/>)}</div>
      <div className="clock">{formatRecordingTime(seconds)}</div>
      <div className="record-actions">
        {state === 'save-error' ? <><button className="secondary" onClick={keepPartial}>저장된 부분 보관</button><button className="primary" onClick={save}>저장 재시도</button></> : <>
          <button className="secondary" disabled={!['recording', 'paused'].includes(state)} onClick={pause}><Icon name={state === 'paused' ? 'play' : 'pause'}/><span>{state === 'paused' ? '녹음 계속' : '일시정지'}</span></button>
          <div className="record-start-group"><button className="primary" disabled={['starting', 'saving', 'discarding'].includes(state) || !window.desktop} onClick={state === 'ready' ? start : stopForReview}>{state === 'ready' ? <><Icon name="mic"/>녹음 시작</> : state === 'saving' ? '저장 중…' : state === 'starting' ? '연결 중…' : state === 'stopped' ? '변환하기' : <><Icon name="stop"/>녹음 중단</>}</button><Menu label="녹음 장치 선택" trigger={<Icon name="chevronDown"/>} className="microphone-menu" upward disabled={active || Boolean(stored)}>{close => [{ deviceId: '', label: '시스템 기본 마이크' }, { deviceId: '__system__', label: '컴퓨터 소리' }, ...devices].map((item, index) => <button role="menuitemradio" aria-checked={device === item.deviceId} key={item.deviceId} onClick={() => { setDevice(item.deviceId); onPreferences?.({ microphone: item.deviceId }); close(); }}><Icon name={item.deviceId === '__system__' ? 'speaker' : 'mic'}/><span>{item.label || `마이크 ${index}`}</span>{device === item.deviceId ? <span>✓</span> : null}</button>)}</Menu></div>
        </>}
      </div>
    </div>
    </div>
    {review ? <ConversionDialog folders={folders} parents={folderParents} initialFolder={folder} environment={environment} onClose={() => setReview(false)} onConfirm={convert} onDiscard={discard}/> : null}
  </section>;
}
