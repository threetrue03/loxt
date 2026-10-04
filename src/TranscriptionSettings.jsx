import Select from './Select.jsx';
import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Brand from './Brand.jsx';
import ThemeSetting from './ThemeSetting.jsx';
import { settingsTabs } from './uiPreferences.js';

export default function TranscriptionSettings({ tab, environment, appInfo, storagePath, preferences, onPreferences, layout, onLayout, onConfigure, onImport, onInstall, onDelete, onCancel, onOpenStorage, onCheck }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [pending, setPending] = useState(null);
  const [installError, setInstallError] = useState(null);
  const [devices, setDevices] = useState([]);
  useEffect(() => {
    if (tab !== 'recording') return;
    let active = true;
    const update = () => navigator.mediaDevices?.enumerateDevices().then(list => { if (active) setDevices(list.filter(device => device.kind === 'audioinput' && !['default', 'communications'].includes(device.deviceId))); }).catch(() => {});
    update(); navigator.mediaDevices?.addEventListener('devicechange', update);
    return () => { active = false; navigator.mediaDevices?.removeEventListener('devicechange', update); };
  }, [tab]);
  const models = (environment?.models || []).filter(model => model.preset || model.downloaded || model.partial).sort((a, b) => Number(Boolean(b.preset)) - Number(Boolean(a.preset)));
  const working = environment?.busy;
  const title = settingsTabs.find(item => item[0] === tab)?.[1] || '일반';
  async function install(id) {
    setPending(id); setInstallError(null);
    try { const result = await onInstall([id]); if (result?.error) setInstallError({ id, text: result.error }); }
    catch (error) { setInstallError({ id, text: error.message }); }
    finally { setPending(null); }
  }
  return <section className="content settings-page settings-panel"><div className="heading"><h1>{title}</h1></div>
    {tab === 'general' ? <>
      <ThemeSetting/>
      <section className="settings-section"><h2>보관함 기본 보기</h2><Select className="preference-select" label="기본 보관함 보기" value={layout} onChange={onLayout} options={[{value:'cards',label:'카드'},{value:'compact',label:'작은 카드'},{value:'list',label:'목록'}]}/></section>
      
    </> : null}
    {tab === 'recording' ? <section className="settings-section"><h2>기본 녹음 장치</h2><Select className="preference-select" label="기본 녹음 장치" value={preferences.microphone} onChange={value => onPreferences({microphone:value})} options={[{value:'',label:'시스템 기본 마이크'},{value:'__system__',label:'컴퓨터 소리'},...devices.map((device,i)=>({value:device.deviceId,label:device.label || `마이크 ${i+1}`}))]}/><p className="hint">새 녹음에 적용됩니다. 장치가 없으면 녹음 화면에서 다시 선택하세요.</p><p className="hint">녹음을 중단하고 폴더와 모델을 선택하면 자동으로 변환을 시작합니다.</p></section> : null}
    {tab === 'models' ? <section className="settings-section model-management"><p className="hint">필요한 모델을 설치하세요. 실행에 필요한 준비도 자동으로 완료합니다. 모델을 삭제해도 녹음과 스크립트는 유지됩니다.</p><div className="model-rows">{models.map((model, index) => {
      const installing = pending === model.id || (environment?.operation === 'download' && environment.download?.model === model.id) || (environment?.operation === 'prepare' && environment.model === model.id);
      const finishing = installing && environment?.stage === 'checking';
      return <div key={model.id}>{!model.preset && (index === 0 || models[index - 1].preset) ? <div className="external-model-heading">외부 모델</div> : null}<div className="model-row">
        <div className="model-name"><Icon name="file"/><div><strong title={model.label}>{model.label}</strong><small>{model.external ? '외부 모델' : model.id}</small></div></div>
        <div className="model-description"><span>{model.description}</span><small>{model.id === environment?.recommended?.model ? '이 PC에 추천' : model.downloaded ? '설치됨' : model.partial ? '이어받기 가능' : '미설치'}</small></div><span className="model-size">{model.size}</span>
        <div className="model-row-actions">{installing ? <><button className="secondary install-progress" disabled aria-label={`${model.label} 설치 진행`}>{finishing ? '마무리 중' : environment?.progress != null ? `${environment.progress}%` : '설치 중'}</button><button className="icon-button" title="설치 취소" aria-label={`${model.label} 설치 취소`} onClick={onCancel}>×</button></> : confirmDelete === model.id ? <><button className="secondary" disabled={working} onClick={() => { onDelete(model.id); setConfirmDelete(null); }}>삭제 확인</button><button className="icon-button" aria-label="삭제 취소" onClick={() => setConfirmDelete(null)}>×</button></> : <>
          {!model.downloaded && model.preset ? <button className="secondary" disabled={working} aria-label={`${model.label} 모델 설치`} onClick={() => install(model.id)}>{installError?.id === model.id ? '재시도' : model.partial ? '이어받기' : '설치'}</button> : model.downloaded ? <button className="secondary" disabled={working || environment?.model === model.id} aria-label={`${model.label} 모델 선택`} onClick={() => onConfigure({ model: model.id, device: 'auto' })}>{environment?.model === model.id ? '선택됨' : '선택'}</button> : null}
          {model.downloaded || model.partial ? <button className="icon-button" disabled={working} title="모델 삭제" aria-label={`${model.label} 모델 삭제`} onClick={() => setConfirmDelete(model.id)}><Icon name="trash"/></button> : null}
        </>}</div>{installError?.id === model.id ? <p className="model-row-error" role="alert">{installError.text}</p> : null}
      </div></div>;
    })}</div><div className="external-model-import"><button className="secondary" disabled={working} onClick={onImport}><Icon name="upload"/>외부 모델 불러오기</button><p className="hint">faster-whisper/CTranslate2 모델 폴더를 선택하세요. model.bin, config.json, tokenizer.json이 필요합니다.</p></div></section> : null}
    {tab === 'storage' ? <section className="settings-section"><h2>보관함 위치</h2><p className="hint">녹음 원본과 스크립트는 이 PC의 보관함에 저장됩니다.</p><div className="storage-path">{storagePath}</div><button className="secondary" onClick={onOpenStorage}><Icon name="folder"/>저장 폴더 열기</button></section> : null}
    {tab === 'about' ? <section className="settings-section"><div className="about-brand"><Brand/><h2 className="hidden">LOXT</h2><span>{appInfo?.version}</span></div><p className="hint">{appInfo?.updateMethod || '새 설치 파일로 업데이트할 수 있습니다. 기존 기록은 유지됩니다.'}</p><details className="diagnostics"><summary>문제 확인</summary><dl className="gpu-detail"><div><dt>감지된 GPU</dt><dd>{environment?.gpu?.name || 'NVIDIA GPU 없음'}</dd></div><div><dt>자동 실행 장치</dt><dd>{environment?.gpu ? 'NVIDIA GPU' : 'CPU'}</dd></div><div><dt>PC 메모리</dt><dd>{environment?.ram ? `${(environment.ram / 1024 ** 3).toFixed(1)} GB` : '확인 중'}</dd></div></dl><p className="diagnostic-log">{environment?.error || environment?.message || '기록 없음'}</p><p className="hint">설치 로그는 보관함과 같은 상위 폴더의 transcription/models/installer-preparation.log에서 확인할 수 있습니다.</p><button className="secondary" onClick={onCheck} disabled={working}>상태 다시 확인</button></details></section> : null}
  </section>;
}
