const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MODELS } = require('./transcription-config.cjs');
const { atomicJson } = require('./library.cjs');
const ROLES = ['low', 'standard', 'high'];
const ROLE_LABELS = { low: '저성능', standard: '표준', high: '고성능' };
const DAY = 86400000, SEARCH_TTL = 900000;
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
const REVISION = /^[a-f0-9]{40}$/;
const modelId = repo => repo.toLowerCase()==='dropbox-dash/faster-whisper-large-v3-turbo' ? 'large-v3-turbo' : MODELS.find(m => m.repo.toLowerCase() === repo.toLowerCase())?.id || 'store-' + createHash('sha256').update(repo.toLowerCase()).digest('hex').slice(0, 24);
const hardwareKey = state => createHash('sha256').update(JSON.stringify([state.gpu?.name || '', state.gpu?.memory || 0, state.ram || 0, state.device || '', state.computeType || ''])).digest('hex').slice(0, 24);
const clean = (value, maximum = 200) => typeof value === 'string' ? value.replace(/[\x00-\x1f]/g, '').slice(0, maximum) : '';
async function hubJSON(resource, fetcher = fetch) {
  const url = new URL(resource, 'https://huggingface.co');
  if (url.origin !== 'https://huggingface.co' || url.username || url.password) throw Error('모델 제공처 주소를 확인해 주세요.');
  let response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json', 'User-Agent': 'LOXT-Model-Store' } }); }
  catch { throw Error('모델 제공처에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.'); }
  if (!response.ok) throw Error(response.status === 429 ? '모델 제공처의 요청 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.' : response.status === 401 || response.status === 403 ? '이 모델은 제공처의 로그인 또는 사용 승인이 필요합니다. 공개 모델을 선택해 주세요.' : '모델 제공처에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
  const parts = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 5000000) throw Error('모델 정보가 너무 큽니다. 다른 모델을 선택해 주세요.'); parts.push(Buffer.from(chunk)); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function entry(info, known = REPO.test(info.id||'') ? MODELS.find(m => m.id === modelId(info.id)) : null) {
  if (!REPO.test(info.id || '')) throw Error('모델 저장소 이름을 확인해 주세요.');
  const tags = Array.isArray(info.tags) ? info.tags.filter(x => typeof x === 'string') : [];
  const card = info.cardData || {}, files = new Set((info.siblings || []).map(f => f.rfilename));
  const languages = [...new Set([...(Array.isArray(card.language) ? card.language : typeof card.language === 'string' ? [card.language] : []), ...tags.filter(t => /^[a-z]{2,3}$/.test(t))])].slice(0, 110);
  const ct2 = info.library_name === 'ctranslate2' || tags.includes('ctranslate2');
  const whisper = Boolean(known || /whisper/i.test(info.id) || info.config?.model_type === 'whisper' || tags.some(t => /whisper/.test(t)));
  const required = ['model.bin', 'config.json', 'tokenizer.json'].every(f => files.has(f));
  const restricted = Boolean(info.private || info.gated || info.disabled);
  const compatible = !restricted && required && whisper && (ct2 || known);
  const bin = (info.siblings || []).find(f => f.rfilename === 'model.bin');
  const size = bin?.lfs?.size || bin?.size || null;
  return { id: modelId(info.id), repo: info.id, name: info.id.split('/')[1], provider: info.id.split('/')[0], revision: REVISION.test(info.sha || '') ? info.sha : null,
    license: clean(card.license || tags.find(t => t.startsWith('license:'))?.slice(8) || '미확인', 80), languages,
    bytes: Number.isSafeInteger(size) ? size : null, size: size ? `${(size / 1024 ** 3).toFixed(2)} GB` : known?.size || '상세에서 확인',
    description: known?.description || (whisper ? 'Whisper 계열 음성 인식 모델' : '별도 실행 엔진이 필요한 음성 인식 모델'),
    engine: compatible ? 'faster-whisper' : null, compatibility: compatible ? known ? 'supported' : 'unverified' : 'unsupported',
    compatibilityText: restricted ? '제공처 승인 필요' : compatible ? known ? '설치 가능' : '실행 검증 필요' : '지원 예정 · 별도 엔진 또는 파일 형식 필요',
    work: compatible, live: compatible, nativeStreaming: false, updatedAt: clean(info.lastModified, 60), sourceUrl: `https://huggingface.co/${info.id}`, known: Boolean(known) };
}
function installationPlan(info) {
  const model = entry(info);
  if (!model.engine || !model.revision) throw Error('현재 LOXT에서 설치할 수 없는 모델입니다. 지원 상태를 확인해 주세요.');
  const allowed = new Set(['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt', 'vocabulary.json', 'preprocessor_config.json', 'README.md', 'LICENSE', 'LICENSE.txt', 'LICENSE.md']);
  const files = (info.siblings || []).filter(f => allowed.has(f.rfilename)).map(f => {
    const size = f.lfs?.size || f.size, hash = f.lfs?.sha256 || f.blobId;
    if (!Number.isSafeInteger(size) || size <= 0 || size > 20000000000 || !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(hash || '') || f.rfilename === 'model.bin' && !/^[a-f0-9]{64}$/.test(hash || '') || f.rfilename !== 'model.bin' && size > 5000000) throw Error('다운로드 파일의 크기와 무결성 정보를 확인하지 못했습니다.');
    return { name: f.rfilename, size, hash };
  });
  if (!['model.bin','config.json','tokenizer.json'].every(name => files.some(f => f.name === name))) throw Error('필수 모델 파일이 없습니다.');
  return { model, repo: model.repo, revision: model.revision, files };
}
class ModelStore {
  constructor(root, { engine, preferences, notify = () => {}, fetcher = fetch, clock = Date.now } = {}) {
    this.root = root; this.engine = engine; this.preferences = preferences; this.notify = notify; this.fetcher = fetcher; this.clock = clock; this.queue = Promise.resolve(); this.requests = new Map(); this.error = '';
    this.data = { version: 1, roles: { work: { low: 'small', standard: 'large-v3-turbo', high: 'large-v3' }, live: { low: 'small', standard: 'large-v3-turbo', high: 'large-v3' } }, annotations: {}, benchmarks: {}, checks: {} };
    this.ready = this.load();
  }
  async load() {
    try { const value = JSON.parse(await fs.readFile(path.join(this.root, 'model-store.json'), 'utf8')); if (value.version !== 1 || !value.roles?.work || !value.roles?.live || !value.annotations || !value.benchmarks) throw Error('invalid'); this.data = { ...this.data, ...value }; }
    catch (e) { if (e.code !== 'ENOENT') this.error = '모델 관리 정보를 읽지 못했습니다. 기존 모델 파일은 유지합니다. 저장 전 설정 파일을 확인해 주세요.'; }
  }
  async write(change) {
    await this.ready;
    const task = this.queue.then(async () => { if (this.error) throw Error(this.error); const next = change(structuredClone(this.data)); await fs.mkdir(this.root,{recursive:true}); await atomicJson(path.join(this.root, 'model-store.json'), next); this.data = next; this.notify(); return this.snapshot(); });
    this.queue = task.catch(() => {}); return task;
  }
  snapshot() { return structuredClone({ ...this.data, error: this.error }); }
  decorate(models) {
    return models.map(m => ({ ...m, alias: this.data.annotations[m.id]?.alias || '', tags: this.data.annotations[m.id]?.tags || [],
      roles: Object.fromEntries(['work','live'].map(mode => [mode, Object.keys(this.data.roles[mode]).find(role => this.data.roles[mode][role] === m.id) || 'other'])),
      modelName: m.repo?.split('/')[1] || m.label, label: this.data.annotations[m.id]?.alias || m.label }));
  }
  async assign({ mode, id, role = 'other', alias = '', tags = [], use = false }) {
    await this.ready;
    if (!['work','live'].includes(mode) || ![...ROLES,'other'].includes(role) || typeof alias !== 'string' || alias.length > 80 || !Array.isArray(tags) || tags.length > 8 || tags.some(t => typeof t !== 'string' || t.length > 30)) throw Error('모델 별명·태그·역할을 확인해 주세요.');
    const model = (await this.engine.modelList()).find(m => m.id === id);
    if (!model?.downloaded && (use || role !== 'other')) throw Error('설치된 모델을 선택해 주세요.');
    if (!model) throw Error('모델을 찾지 못했습니다.');
    const previous = structuredClone(this.data);
    await this.write(next => { for (const key of ROLES) if (next.roles[mode][key] === id) delete next.roles[mode][key]; if (role !== 'other') next.roles[mode][role] = id; next.annotations[id] = { alias: clean(alias.trim(), 80), tags: [...new Set(tags.map(t => clean(t.trim(),30)).filter(Boolean))] }; return next; });
    try { if (use) await this.preferences.set(mode, { model: id }); }
    catch (e) { await this.write(() => previous); throw e; }
    this.engine.update({ models: await this.engine.modelList() }); return this.snapshot();
  }
  async cached(key, ttl, work, force = false) {
    const safeKey = createHash('sha256').update(key).digest('hex'), file = path.join(this.root, 'store-cache', safeKey + '.json');
    let old; try { old = JSON.parse(await fs.readFile(file,'utf8')); } catch {}
    if (!force && old && this.clock() - old.at < ttl) return { ...old.value, checkedAt: old.at, cached: true };
    if (this.requests.has(key)) return this.requests.get(key);
    const task = (async () => { try { const value = await work(); const at = this.clock(); await fs.mkdir(path.dirname(file),{recursive:true}); await atomicJson(file, { at, value }); return { ...value, checkedAt: at, cached: false }; }
      catch (e) { if (old) return { ...old.value, checkedAt: old.at, cached: true, stale: true, error: clean(e.message,500) }; throw e; } })().finally(() => this.requests.delete(key));
    this.requests.set(key,task); return task;
  }
  async search({ query = '', cursor = 0, force = false } = {}) {
    await this.ready;
    if (typeof query !== 'string' || query.length > 120 || !Number.isInteger(cursor) || cursor < 0 || cursor > 180) throw Error('검색어를 확인해 주세요.');
    query = query.trim();
    const result = await this.cached('search:'+query.toLowerCase(), query ? SEARCH_TTL : DAY, async () => {
      const url = new URL('/api/models','https://huggingface.co'); url.search = new URLSearchParams({ pipeline_tag:'automatic-speech-recognition', ...(query ? {search:query} : {}), limit:'200', full:'true', config:'true', cardData:'true', sort:'downloads', direction:'-1' }).toString();
      const values = await hubJSON(url.href,this.fetcher); if (!Array.isArray(values)) throw Error('모델 검색 결과를 확인하지 못했습니다.');
      return { models: values.filter(m=>REPO.test(m.id||'')).map(m=>entry(m)), provider:'Hugging Face' };
    },force);
    return { ...result, models:result.models.slice(cursor,cursor+20), nextCursor: cursor+20 < result.models.length ? cursor+20 : null };
  }
  async detail(repo, force = false) {
    if (!REPO.test(repo || '')) throw Error('모델 저장소 이름을 확인해 주세요.');
    const info = await hubJSON(`/api/models/${repo}?blobs=true`,this.fetcher);
    const model = entry(info), installed = (await this.engine.modelList()).find(m=>m.id===model.id);
    return { ...model, installed: Boolean(installed?.downloaded), installedRevision: installed?.revision || null, updateAvailable: Boolean(installed?.downloaded && installed.revision && installed.revision !== model.revision), plan: model.engine ? installationPlan(info) : null };
  }
  async list({ offline = false, force = false } = {}) {
    await this.ready;
    const environment = this.engine.snapshot(), models = await this.engine.modelList();
    const stored = offline ? {models:MODELS.map(m=>({...m,name:m.repo.split('/')[1],provider:m.repo.split('/')[0],work:true,live:true,compatibility:'supported',compatibilityText:'설치 가능',sourceUrl:'https://huggingface.co/'+m.repo}))} : await this.cached('featured',DAY,async()=>{
      const models = await Promise.all(MODELS.map(async m=>entry(await hubJSON(`/api/models/${m.repo}?blobs=true`,this.fetcher),m))); return { models };
    },force).catch(error=>({models:MODELS.map(m=>({...m,name:m.repo.split('/')[1],provider:m.repo.split('/')[0],work:true,live:true,compatibility:'supported',compatibilityText:'설치 가능',sourceUrl:'https://huggingface.co/'+m.repo})),error:clean(error.message,500)}));
    const candidates = [];
    const byId = new Map([...stored.models,...candidates,...models.filter(m=>m.store||m.external)].map(m=>[m.id,m]));
    for(const m of models){const item=byId.get(m.id);if(item)Object.assign(item,m,{name:item.name||m.modelName,installed:m.downloaded});}
    return {models:[...byId.values()].map(m=>({...m,recommendation:this.recommend(m,environment)})),management:this.snapshot(),hardware:{key:hardwareKey(environment),gpu:environment.gpu,ram:environment.ram,device:environment.device,checked:environment.hardwareChecked},checkedAt:stored.checkedAt,error:stored.error||this.error,stale:stored.stale||false};
  }
  recommend(model, environment) {
    const measured=this.data.benchmarks[hardwareKey(environment)+':'+model.id];
    if (measured && (!model.revision || measured.revision === model.revision)) return {kind:'measured',label:measured.rtf<=1?'사용 가능 · 실측':'부담 큼 · 실측',rtf:measured.rtf,loadSeconds:measured.loadSeconds,at:measured.at,live:'Live 지연은 별도 검증 필요'};
    if (model.compatibility==='unsupported') return {kind:'unverified',label:'미검증'};
    const memory=environment.gpu?.memory||0;
    return {kind:'estimated',label:!model.known&&!MODELS.some(m=>m.id===model.id)?'성능 확인 필요':environment.hardwareChecked?(model.id==='large-v3'&&memory<8192?'부담 큼 · 예상':model.id===environment.recommended?.model?'추천 · 예상':'사용 가능 · 예상'):'성능 확인 필요'};
  }
  async plan(repo) { return installationPlan(await hubJSON(`/api/models/${REPO.test(repo||'')?repo:(()=>{throw Error('모델 주소를 확인해 주세요.');})()}?blobs=true`,this.fetcher)); }
  async saveBenchmark(id, result) {
    if (!Number.isFinite(result.rtf) || result.rtf<=0 || !Number.isFinite(result.loadSeconds) || result.loadSeconds<0 || !Number.isFinite(result.audioSeconds) || result.audioSeconds<2) throw Error('성능 측정 결과를 확인하지 못했습니다.');
    const model=(await this.engine.modelList()).find(m=>m.id===id);if(!model?.downloaded)throw Error('설치된 모델을 선택해 주세요.');
    return this.write(next=>{next.benchmarks[hardwareKey(this.engine.snapshot())+':'+id]={...result,model:id,hardware:hardwareKey(this.engine.snapshot()),revision:model.revision||null,at:new Date().toISOString()};return next;});
  }
  async benchmark(id, cancelled = () => false) {
    const engine=this.engine;
    if(engine.busy)throw Error('현재 작업을 마친 뒤 성능을 확인해 주세요.');
    await engine.detect();if(cancelled())return {canceled:true};const model=(await engine.modelList()).find(m=>m.id===id&&m.downloaded);
    if(!model)throw Error('성능을 확인할 설치된 모델을 선택해 주세요.');
    try{await fs.access(engine.state.python||engine.python);}catch{throw Error('모델을 한 번 사용하거나 모델 보관함에서 실행 준비를 마친 뒤 성능을 확인해 주세요.');}
    await engine.releaseWorkWorker();if(cancelled())return {canceled:true};engine.operation='benchmark';engine.cancelled=false;engine.update({stage:'benchmarking',message:'예시 음성 준비 중',error:'',progress:null});
    const directory=path.join(this.root,'benchmark-sample');const audio=path.join(directory,'speech.wav');let measured;
    try{
      await fs.mkdir(directory,{recursive:true});
      const output=await engine.run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(engine.resources,'benchmark-speech.ps1'),'-Output',audio],()=>{},30000);
      const language=JSON.parse(output.split('\n').at(-1)).language;
      await engine.run(engine.state.python||engine.python,[path.join(engine.resources,'model_benchmark.py'),'--audio',audio,'--model-dir',path.join(engine.root,'models',id),'--language',language,'--device',engine.state.device||'cpu','--compute-type',engine.state.computeType||'int8','--parent-pid',String(process.pid)],line=>{let e;try{e=JSON.parse(line);}catch{return;}if(e.type==='phase')engine.update({stage:e.phase,message:e.message});if(e.type==='benchmark'){const{type,...result}=e;measured=result;}},300000);
      if(engine.cancelled)return{canceled:true};if(!measured)throw Error('성능 확인 결과가 없습니다.');await this.saveBenchmark(id,measured);return measured;
    }catch(e){if(engine.cancelled)return{canceled:true};throw e;}
    finally{engine.operation=null;await fs.unlink(audio).catch(()=>{});await engine.detect();}
  }
}
module.exports = { ModelStore, entry, installationPlan, hubJSON, modelId, hardwareKey, REPO, ROLES, ROLE_LABELS, DAY, SEARCH_TTL };
