import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Select from './Select.jsx';
import Modal from './Modal.jsx';
import { cleanError, useSettings } from './SettingsProvider.jsx';
import { roleNames } from './modelOptions.js';
import useModelStore from './useModelStore.js';
import './model-store.css';

const stamp = value => value ? new Date(value).toLocaleString('ko-KR') : '아직 확인하지 않음';
const number = value => Number.isFinite(value) ? value.toFixed(2) : '미측정';
const phase = environment => environment?.stage === 'downloading' && Number.isFinite(environment.progress) ? `${environment.progress}%` : environment?.stage === 'checking' ? '실행 확인 중…' : environment?.stage === 'installing' ? '실행 준비 중…' : '처리 중…';

export default function ModelStore({ mode = 'work', management = false, onBack }) {
  const { data, environment, error: listError, loading, reload } = useModelStore();
  const { preferences, operation, ready, change } = useSettings();
  const [query, setQuery] = useState(''), [category, setCategory] = useState(management ? 'installed' : 'all');
  const [results, setResults] = useState(null), [searching, setSearching] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [detail, setDetail] = useState(null), [detailLoading, setDetailLoading] = useState(false), [editing, setEditing] = useState(null), [deleting, setDeleting] = useState(null), [benchmark, setBenchmark] = useState(null), [localPending, setLocalPending] = useState(null);
  const mounted = useRef(true), requests = useRef(0), detailRequests = useRef(0), actionRef = useRef(false);
  const locked = !ready || Boolean(operation.pending || operation.lockReason || localPending), remote = window.desktop.remote;
  const action = operation.pending || localPending;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++requests.current; ++detailRequests.current; }; }, []);
  useEffect(() => {
    const generation = ++requests.current;
    if (!query.trim()) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try { const value = await window.desktop.modelStore.search({ query: query.trim() }); if (mounted.current && generation === requests.current) { setResults(value); setError(value.error || ''); } }
      catch (failure) { if (mounted.current && generation === requests.current) { setError(cleanError(failure)); setResults({models:[]}); } }
      finally { if (mounted.current && generation === requests.current) setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);
  async function searchMore() {
    const generation = ++requests.current; setSearching(true);
    try { const value = await window.desktop.modelStore.search({query:query.trim(),cursor:results.nextCursor}); if (mounted.current && generation === requests.current) setResults(previous => ({...value,models:[...previous.models,...value.models]})); }
    catch (failure) { if(mounted.current && generation === requests.current)setError(cleanError(failure)); }
    finally { if(mounted.current && generation === requests.current)setSearching(false); }
  }
  async function refresh() {
    setError('');
    if (!query.trim()) return reload(true);
    const generation=++requests.current;setSearching(true);
    try { const value=await window.desktop.modelStore.search({query:query.trim(),force:true});if(mounted.current&&generation===requests.current){setResults(value);setError(value.error||'');} }
    catch(failure){if(mounted.current&&generation===requests.current)setError(cleanError(failure));}
    finally{if(mounted.current&&generation===requests.current)setSearching(false);}
  }
  async function act(name, id, work) {
    if (actionRef.current || locked) return;
    actionRef.current=true;setLocalPending({action:name,id});setError('');setNotice('');
    try { const result=await work();if(mounted.current){setNotice(result?.canceled?'작업을 취소했습니다.':name==='benchmark'?'성능 확인을 마쳤습니다.':name==='install'?'모델 설치와 실행 확인을 마쳤습니다.':name==='delete'?'모델을 삭제했습니다.':'모델 설정을 저장했습니다.');await reload(false,true);}return result; }
    catch(failure){if(mounted.current)setError(cleanError(failure));return false;}
    finally{actionRef.current=false;if(mounted.current)setLocalPending(null);}
  }
  async function openDetail(model) {
    const generation=++detailRequests.current;setDetail(model);setError('');
    if(!model.repo)return;
    setDetailLoading(true);
    try { const value=await window.desktop.modelStore.detail(model.repo);if(mounted.current&&generation===detailRequests.current)setDetail({...model,...value,alias:model.alias,tags:model.tags}); }
    catch(failure){if(mounted.current&&generation===detailRequests.current)setError(cleanError(failure));}
    finally{if(mounted.current&&generation===detailRequests.current)setDetailLoading(false);}
  }
  const rows = (results?.models || data?.models || []).map(model => {
    const local=data?.models.find(item=>item.id===model.id);
    return local ? {...model,...local,name:model.name||local.name} : model;
  }).filter(model => category==='installed'?model.downloaded:category==='ko'?model.languages?.includes('ko'):category==='work'?model.work:category==='live'?model.live:true);
  const installed = data?.models.filter(model=>model.downloaded)||[];
  const selected = preferences[mode].model;
  const benchmarkResult = benchmark && data?.management.benchmarks && [data.management.benchmarks[data.hardware.key + ":" + benchmark.id]].find(result => result && (!benchmark.revision || result.revision===benchmark.revision));
  const section = <>
    {remote ? <p className="hint">연결한 PC의 모델입니다. 설치·삭제·별명·성능 확인은 PC 앱에서 관리하세요.</p> : null}
    <div className="store-toolbar"><label className="store-search"><Icon name="search"/><input aria-label="모델 검색" placeholder="모델·제공자 검색" value={query} maxLength={120} onChange={event=>setQuery(event.target.value)}/></label><Select label="모델 분류" value={category} onChange={setCategory} options={[['all','전체'],['work','Work'],['live','Live'],['ko','한국어'],['installed','설치됨']].map(([value,label])=>({value,label}))}/><button className="secondary" onClick={refresh} disabled={searching||loading}>새로고침</button></div>
    <div className="store-hardware"><span>{data?.hardware.checked ? `${data.hardware.gpu?.name||'CPU'} · RAM ${((data.hardware.ram||0)/1024**3).toFixed(0)} GB` : 'PC 성능 확인 중…'}</span><span>추천은 예상 또는 실측으로 구분합니다.</span><button className="secondary" disabled={locked||remote||!installed.length} onClick={()=>setBenchmark(installed.find(model=>model.id===selected)||installed[0])}>성능 확인</button></div>
    {operation.lockReason ? <p className="settings-lock" role="status">{operation.lockReason}</p> : null}
    {error || listError ? <p className="error-message" role="alert">{error||listError}</p> : null}{notice ? <p className="hint" role="status">{notice}</p> : null}
    {searching ? <p className="hint" role="status">모델을 검색하는 중…</p> : null}
    <div className="model-rows store-rows">{rows.map(model => {
      const inProgress=action?.id===model.id&&['install','verify','benchmark'].includes(action.action);
      const role=model.roles?.[mode]||'other', issue=operation.issues?.[model.id];
      return <article className="model-entry" key={model.id}><div className="model-row store-row">
        <button className="store-model-name" onClick={()=>openDetail(model)}><strong>{model.alias||model.name||model.modelName||model.label}</strong><small>{model.repo||model.modelName||model.id}</small><span className="model-badges">{role!=='other'?<span className="model-badge">{roleNames[role]}</span>:<span>{model.external?'외부 모델':'기타 모델'}</span>}{selected===model.id?<span className="model-badge">{mode==='live'?'Live':'Work'} 기본 모델</span>:null}{(model.tags||[]).map(tag=><span key={tag}>{tag}</span>)}</span></button>
        <div className="model-description"><span>{model.description}</span><small>{model.compatibilityText||'설치됨'} · {model.size}</small></div><span className="store-recommendation">{model.recommendation?.label||'성능 확인 필요'}</span>
        <div className="model-row-actions">{inProgress?<><button className="secondary install-progress" disabled>{phase(environment)}</button><button className="icon-button" aria-label="모델 작업 취소" onClick={()=>window.desktop.modelStore.cancel().catch(failure=>setError(cleanError(failure)))}>×</button></>:<>
          {model.downloaded?<><button className="secondary" disabled={locked||remote} onClick={()=>setEditing({...model,mode,role,alias:model.alias||'',tagText:(model.tags||[]).join(', '),use:false})}>관리</button><button className="icon-button" aria-label={`${model.alias||model.label||model.name} 모델 삭제`} disabled={locked||remote} onClick={()=>setDeleting(model)}><Icon name="trash"/></button></>:<button className="secondary" disabled={locked||remote||model.compatibility==='unsupported'} aria-label={`${model.label||model.name} 모델 설치`} onClick={()=>openDetail(model)}>{model.compatibility==='unsupported'?'지원 예정':'설치'}</button>}
        </>}</div></div>{issue?<p className="model-row-error" role="alert">{issue.text}</p>:null}
      </article>;
    })}</div>
    {!rows.length && !searching ? <p className="hint">{loading?'모델 목록을 확인하는 중…':'해당하는 모델이 없습니다. 검색어나 분류를 바꿔 보세요.'}</p> : null}
    {results?.nextCursor!=null ? <button className="secondary" disabled={searching} onClick={searchMore}>더 보기</button> : null}
    <div className="external-model-import"><button className="secondary" disabled={locked||remote} onClick={()=>act('import','import',()=>window.desktop.importTranscriptionModel())}><Icon name="upload"/>외부 모델 불러오기</button><p className="hint">faster-whisper / CTranslate2 Whisper 모델 폴더를 가져옵니다. 원본 폴더는 유지됩니다.</p></div>
    <p className="hint store-cache-note">정보 제공: Hugging Face · 목록 24시간, 검색 15분 캐시 · 마지막 확인 {stamp(results?.checkedAt||data?.checkedAt)}. 업데이트는 상세에서 확인하며 자동으로 설치하지 않습니다.</p>
  </>;
  return <>{management?section:<section className="content model-store-page"><header className="heading"><h1 className="page-title-icon">{onBack?<button className="icon-button" aria-label="홈으로 돌아가기" onClick={onBack}><Icon name="back"/></button>:null}모델 스토어</h1><span className="home-mode">{mode==='live'?'Live':'Work'}</span></header>{section}</section>}
    {detail?<Modal title="모델 정보" onClose={()=>{++detailRequests.current;setDetail(null);}}><div className="store-detail"><h3>{detail.alias||detail.name||detail.modelName}</h3><p className="store-repository">{detail.repo||detail.modelName}</p><p>{detail.description}</p><dl><div><dt>엔진</dt><dd>{(detail.engine||detail.external)?'faster-whisper / CTranslate2': '별도 엔진 필요'}</dd></div><div><dt>지원 상태</dt><dd>{detail.compatibilityText||'가져온 모델'}</dd></div><div><dt>용량</dt><dd>{detail.size}</dd></div><div><dt>라이선스</dt><dd>{detail.license||'원본 제공처에서 확인'}</dd></div><div><dt>언어</dt><dd>{detail.languages?.includes('ko')?'한국어 포함 · ':''}{detail.languages?.length?`${detail.languages.length}개 언어`:'제공처에서 확인'}</dd></div><div><dt>업데이트</dt><dd>{detail.updateAvailable?'새 버전 있음':detail.installedRevision?'설치 버전과 동일':'설치 후 비교 가능'}</dd></div></dl><p className="hint">다운로드는 표시된 버전에 고정하고 파일 해시와 모델 실행을 확인합니다. 다른 엔진의 모델은 검색할 수 있지만 설치를 지원하지 않습니다. 정확도는 하드웨어 점수로 측정하지 않습니다.</p>{detail.revision?<p className="store-revision">버전 {detail.revision}</p>:null}{detailLoading?<p className="hint" role="status">최신 모델 정보를 확인하는 중…</p>:null}{error?<p className="error-message" role="alert">{error}</p>:null}<div className="settings-actions">{detail.repo?<button className="secondary" onClick={()=>remote?window.open(detail.sourceUrl,'_blank','noopener'):window.desktop.modelStore.source(detail.repo)}>제공처·라이선스 확인</button>:null}{!detail.installed&&!detail.downloaded||detail.updateAvailable?<button className="primary" disabled={locked||remote||detailLoading||!detail.plan} onClick={()=>{const repo=detail.repo;setDetail(null);act('install',detail.id,()=>window.desktop.modelStore.install(repo));}}>{detail.updateAvailable?'업데이트 설치':'설치'}</button>:null}</div></div></Modal>:null}
    {editing?<Modal title="모델 관리" onClose={()=>{if(!localPending)setEditing(null);}}><div className="store-editor"><label>사용 모드<Select label="모델 사용 모드" disabled={locked} value={editing.mode} options={[{value:'work',label:'Work'},{value:'live',label:'Live'}]} onChange={value=>setEditing(previous=>({...previous,mode:value,role:data.management.roles[value]&&Object.keys(data.management.roles[value]).find(role=>data.management.roles[value][role]===editing.id)||'other'}))}/></label><label>역할<Select label="모델 역할" disabled={locked} value={editing.role} options={Object.entries(roleNames).map(([value,label])=>({value,label}))} onChange={value=>setEditing(previous=>({...previous,role:value}))}/></label><p className="hint">이 역할에 있던 모델은 기타 모델로 분류됩니다. 다른 모드의 역할은 유지됩니다.</p><label>별명<input aria-label="모델 별명" maxLength={80} value={editing.alias} onChange={event=>setEditing({...editing,alias:event.target.value})}/></label><label>태그 · 쉼표로 구분<input aria-label="모델 태그" maxLength={247} value={editing.tagText} onChange={event=>setEditing({...editing,tagText:event.target.value})}/></label><label className="store-checkbox"><input type="checkbox" checked={editing.use} onChange={event=>setEditing({...editing,use:event.target.checked})}/>{editing.mode==='live'?'Live':'Work'} 기본 모델로 사용</label><p className="hint">실제 모델: {editing.repo||editing.modelName||editing.id}</p>{error?<p className="error-message" role="alert">{error}</p>:null}<button className="primary" disabled={locked} onClick={async()=>{const value=await act('default',editing.id,()=>window.desktop.modelStore.assign({mode:editing.mode,id:editing.id,role:editing.role,alias:editing.alias,tags:editing.tagText.split(',').map(tag=>tag.trim()).filter(Boolean),use:editing.use}));if(value)setEditing(null);}}>저장</button></div></Modal>:null}
    {deleting?<Modal title="모델 삭제" onClose={()=>{if(!localPending)setDeleting(null);}}><p>{deleting.alias||deleting.label||deleting.name} 모델을 PC에서 삭제합니다. 녹음·스크립트·메모는 유지됩니다. 기본 모델로 지정한 경우 다시 설치하거나 다른 모델을 선택해야 합니다.</p>{error?<p className="error-message" role="alert">{error}</p>:null}<button className="secondary danger" disabled={locked} onClick={async()=>{if(await act('delete',deleting.id,()=>window.desktop.deleteTranscriptionModel(deleting.id)))setDeleting(null);}}>삭제 확인</button></Modal>:null}
    {benchmark?<Modal title="이 PC에서 성능 확인" onClose={()=>{if(!localPending)setBenchmark(null);}}><div className="store-benchmark"><Select label="성능 확인 모델" value={benchmark.id} disabled={locked} options={installed.map(model=>({value:model.id,label:model.alias||model.name||model.label}))} onChange={id=>setBenchmark(installed.find(model=>model.id===id))}/><p className="hint">Windows 예시 음성으로 모델 로딩·파일 변환·2초와 6초 청크 시간을 측정합니다. 개인 녹음은 사용하지 않습니다. 정확도·한국어 실제 음성·전체 Live 지연은 별도 검증이 필요합니다.</p>{benchmarkResult?<dl><div><dt>파일 변환 RTF</dt><dd>{number(benchmarkResult.rtf)} · 1 이하가 음성 길이보다 빠름</dd></div><div><dt>모델 로딩</dt><dd>{number(benchmarkResult.loadSeconds)}초</dd></div><div><dt>2초 청크</dt><dd>{number(benchmarkResult.previewLatencyMs/1000)}초</dd></div><div><dt>6초 청크 RTF</dt><dd>{number(benchmarkResult.liveChunkRTF)}</dd></div><div><dt>최대 프로세스 RAM</dt><dd>{number(benchmarkResult.peakProcessRAM==null?NaN:benchmarkResult.peakProcessRAM/1024**2)} MB · GPU 메모리는 미측정</dd></div><div><dt>측정</dt><dd>{benchmarkResult.device} · {benchmarkResult.language} · {stamp(benchmarkResult.at)}</dd></div></dl>:null}{error?<p className="error-message" role="alert">{error}</p>:null}{action?.action==='benchmark'?<><p className="hint" role="status">{environment?.message||'성능 확인 중…'}</p><button className="secondary" onClick={()=>window.desktop.modelStore.cancel().catch(failure=>setError(cleanError(failure)))}>측정 취소</button></>:<button className="primary" disabled={locked||remote} onClick={()=>act('benchmark',benchmark.id,()=>window.desktop.modelStore.benchmark(benchmark.id))}>성능 측정 시작</button>}</div></Modal>:null}
  </>;
}
