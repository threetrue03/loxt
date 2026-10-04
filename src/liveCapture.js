import { openSystemInput } from './systemInput.js';

export async function openLiveInput(device, onStatus) {
  if (device === '__system__') {
    const capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    capture.getVideoTracks().forEach(track => track.stop());
    if (!capture.getAudioTracks().length) { capture.getTracks().forEach(track => track.stop()); throw new Error('컴퓨터 소리 입력을 가져오지 못했습니다.'); }
    if (window.desktop?.systemAudio) { capture.getTracks().forEach(track => track.stop()); return openSystemInput(onStatus); }
    return new MediaStream(capture.getAudioTracks());
  }
  return navigator.mediaDevices.getUserMedia({ audio: device ? { deviceId: { exact: device } } : true, video: false });
}

export async function captureLive(stream, onData, onError) {
  const context = new AudioContext({ latencyHint: 'interactive' });
  let node, source, gain, chain = Promise.resolve(), token = 0, flushing = new Map(), failed = false;
  try {
    await context.audioWorklet.addModule(new URL('live-capture-worklet.js', document.baseURI).href);
    source = context.createMediaStreamSource(stream); node = new AudioWorkletNode(context, 'loxt-live-capture');
    gain = context.createGain(); gain.gain.value = 0;
    node.port.onmessage = ({ data }) => {
      if (data.type === 'flushed') { flushing.get(data.token)?.(); flushing.delete(data.token); return; }
      if (data.type !== 'pcm') return;
      const bytes = new Uint8Array(data.samples.buffer);
      chain = chain.then(() => onData(bytes)).catch(error => { if (!failed) { failed = true; onError(error); } });
    };
    source.connect(node); node.connect(gain); gain.connect(context.destination); await context.resume();
    const flush = async type => {
      const current = ++token;
      await new Promise((resolve, reject) => { const timer = setTimeout(() => { flushing.delete(current); reject(new Error('음성 입력을 마무리하지 못했습니다. 다시 종료해 주세요.')); }, 5000); flushing.set(current, () => { clearTimeout(timer); resolve(); }); node.port.postMessage({ type, token: current }); });
      await chain;
    };
    return {
      pause: () => flush('pause'), resume: () => node.port.postMessage({ type: 'resume' }),
      async stop() { try { await flush('flush'); } finally { source.disconnect(); node.disconnect(); gain.disconnect(); await context.close(); stream.getTracks().forEach(track => { track.onended = null; track.stop(); }); } },
    };
  } catch (error) { source?.disconnect(); node?.disconnect(); gain?.disconnect(); await context.close(); stream.getTracks().forEach(track => track.stop()); throw error; }
}
