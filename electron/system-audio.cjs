const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

class SystemAudio {
  constructor(auxiliary, notify) { this.auxiliary = auxiliary; this.notify = notify; this.captures = new Map(); this.generation = 0; }
  async start() {
    const generation = ++this.generation;
    await this.auxiliary.prepare(event => {
      if (event.type === 'phase' || event.type === 'download') this.notify({ id:null, type:'preparing', progress:event.type === 'download' ? Math.min(99,Math.floor(event.current/event.total*100)) : null });
    }, child => { this.preparingChild = child; });
    this.preparingChild = null;
    if (generation !== this.generation) throw new Error('컴퓨터 소리 연결을 취소했습니다.');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const child = spawn(this.auxiliary.python, [path.join(this.auxiliary.engine.resources,'system_audio.py'), '--parent-pid', String(process.pid)], { windowsHide: true, env: { ...process.env, PYTHONUTF8:'1', PYTHONUNBUFFERED:'1' } });
      const capture = { child, stopped:false, buffer:'', ready:false }; this.captures.set(id,capture);
      const timeout = setTimeout(() => { this.stop(id); reject(new Error('컴퓨터 소리 장치 연결 시간이 초과됐습니다.')); },15000);
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); let error = '';
      child.stdout.on('data', text => {
        capture.buffer += text;
        if (capture.buffer.length > 1000000) { this.stop(id); reject(new Error('출력 장치 응답 크기를 초과했습니다.')); return; }
        while (capture.buffer.includes('\n')) { const end=capture.buffer.indexOf('\n'), line=capture.buffer.slice(0,end); capture.buffer=capture.buffer.slice(end+1); let event; try { event=JSON.parse(line); } catch { continue; }
          if (event.type==='ready') { capture.ready=true; clearTimeout(timeout); resolve({ id, device:event.device }); }
          if (event.type==='error') error=event.message;
          if (event.type==='pcm') { const bytes=Buffer.from(event.pcm,'base64'); if (bytes.length<=16000 && bytes.length%2===0) this.notify({id,type:'pcm',bytes:new Uint8Array(bytes)}); }
          else this.notify({id,...event});
        }
      });
      child.stderr.on('data', text=>{error=(error+text).slice(-1000);});
      child.on('error', error=>{ clearTimeout(timeout); this.captures.delete(id); reject(error); });
      child.on('close',()=>{clearTimeout(timeout);this.captures.delete(id);if(!capture.ready)reject(new Error(error||'출력 장치를 연결하지 못했습니다.'));else if(!capture.stopped)this.notify({id,type:'error',message:error||'컴퓨터 소리 연결이 종료됐습니다.'});});
      child.stdin.on('error',()=>{});
    });
  }
  cancelPending() { ++this.generation; if (this.preparingChild && this.auxiliary.listeners.size <= 1) this.auxiliary.engine.kill(this.preparingChild); for (const [id, capture] of this.captures) if (!capture.ready) this.stop(id); }
  stop(id) { const capture=this.captures.get(id);if(!capture)return;capture.stopped=true;capture.child.stdin.end('{"type":"stop"}\n');const timer=setTimeout(()=>this.auxiliary.engine.kill(capture.child),2000);capture.child.once('close',()=>clearTimeout(timer)); }
  shutdown() { for (const capture of this.captures.values()) this.auxiliary.engine.kill(capture.child); }
}
module.exports={SystemAudio};
