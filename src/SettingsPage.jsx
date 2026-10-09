import ModelStore from './ModelStore.jsx';
import DeviceSettings from './DeviceSettings.jsx';
import { useEffect, useRef, useState } from 'react';
import Select from './Select.jsx';
import Icon from './Icon.jsx';
import Brand from './Brand.jsx';
import ThemeSetting from './ThemeSetting.jsx';
import useInputDevices from './useInputDevices.js';
import { settingsTabs } from './uiPreferences.js';
import { cleanError, useSettings } from './SettingsProvider.jsx';

const labelMode = mode => mode === 'live' ? 'Live' : 'Work';
const size = value => value == null ? '확인할 수 없음' : new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value / (value >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2)) + (value >= 1024 ** 3 ? ' GB' : ' MB');
const deviceName = value => value === 'cuda' ? 'NVIDIA GPU' : value === 'cpu' ? 'CPU' : '미확인';
const phaseName = stage => stage === 'checking' ? '실행 검사 중…' : stage === 'installing' ? '실행 준비 중…' : stage === 'downloading' ? '다운로드 중…' : '처리 중…';
export default function SettingsPage({ mode = 'work' }) {
  const { tab, preferences, ready, change, issues, pending, operation, reload } = useSettings();
  const [environment, setEnvironment] = useState(null), [environmentError, setEnvironmentError] = useState('');
  const [appInfo, setAppInfo] = useState(null), [confirmDelete, setConfirmDelete] = useState(null), [localPending, setLocalPending] = useState(null);
  const [storage, setStorage] = useState(null), [storageLoading, setStorageLoading] = useState(false), [supportError, setSupportError] = useState(''), [notice, setNotice] = useState('');
  const [movingLibrary,setMovingLibrary] = useState(false);
  async function moveLibrary() {
    if (movingLibrary) return;
    setMovingLibrary(true); setSupportError(''); setNotice('');
    try { const result = await window.desktop.settings.moveLibrary(); if (!result.canceled) { await readStorage(true); setNotice('보관함 위치를 변경했습니다. 기존 위치의 파일은 안전을 위해 보존했습니다.'); } }
    catch (error) { setSupportError(cleanError(error)); }
    finally { setMovingLibrary(false); }
  }
  const mounted = useRef(true), request = useRef(false), storageGeneration = useRef(0);
  const inputs = useInputDevices(tab === 'recording');
  const defaults = preferences[mode], title = settingsTabs.find(item => item[0] === tab)?.[1];
  async function check() {
    setEnvironmentError('');
    try { const value = await window.desktop.getTranscriptionEnvironment(); if (mounted.current) setEnvironment(value); }
    catch (error) { if (mounted.current) setEnvironmentError(cleanError(error)); }
  }
  useEffect(() => {
    mounted.current = true; check();
    const off = window.desktop.onTranscriptionState(value => { setEnvironment(value); });
    window.desktop.getAppInfo().then(value => { if (mounted.current) setAppInfo(value); }).catch(error => { if (mounted.current) setSupportError(cleanError(error)); });
    return () => { mounted.current = false; ++storageGeneration.current; off(); };
  }, []);
  async function readStorage(force = false) {
    const generation = ++storageGeneration.current; setStorageLoading(true); setSupportError('');
    try { const value = await window.desktop.settings.storage(force); if (mounted.current && generation === storageGeneration.current) setStorage(value); }
    catch (error) { if (mounted.current && generation === storageGeneration.current) setSupportError(cleanError(error)); }
    finally { if (mounted.current && generation === storageGeneration.current) setStorageLoading(false); }
  }
  useEffect(() => { setSupportError(''); setNotice(''); if (tab === 'storage') readStorage(); }, [tab]);
  async function support(work, success = '') {
    setSupportError(''); setNotice('');
    try { await work(); if (mounted.current) setNotice(success); }
    catch (error) { if (mounted.current) setSupportError(cleanError(error)); }
  }
  async function act(action, id, targetMode = mode) {
    if (request.current) return;
    request.current = true; setLocalPending({ action, id });
    try {
      if (action === 'install') await window.desktop.installTranscriptionModels([id]);
      if (action === 'delete') { await window.desktop.deleteTranscriptionModel(id); setConfirmDelete(null); }
      if (action === 'import') await window.desktop.importTranscriptionModel();
      if (action === 'verify') await window.desktop.settings.verify(id);
      if (action === 'default') await change(targetMode, { model: id });
    } catch (error) { if (mounted.current) setSupportError(cleanError(error)); }
    finally { request.current = false; if (mounted.current) setLocalPending(null); }
  }
  const listError = environmentError || (environment?.modelsChecked === false ? environment.error : '');
  const catalogReady = Boolean(environment) && environment.modelsChecked !== false;
  const models = (catalogReady ? environment.models || [] : []).filter(model => model.preset || model.downloaded || model.partial).sort((a, b) => Number(Boolean(a.external)) - Number(Boolean(b.external)) || Number(Boolean(b.preset)) - Number(Boolean(a.preset)));
  const working = Boolean(operation.lockReason || operation.pending || localPending);
  const ownModel = models.find(model => model.id === defaults.model);
  const missingDevice = ready && !inputs.loading && !inputs.error && defaults.microphone && defaults.microphone !== '__system__' && !inputs.devices.some(device => device.deviceId === defaults.microphone);
  const errors = Object.entries(issues).filter(([key]) => key === 'load' || key.startsWith(mode + ':'));
  return <section className="content settings-page settings-panel"><div className="heading"><h1>{title}</h1></div>
    {tab === 'devices' ? <DeviceSettings/> : null}
    <p className="settings-scope">{tab === 'general' ? `테마는 앱 전체에, 보관함 보기는 ${labelMode(mode)}에 적용됩니다.` : tab === 'recording' ? `${labelMode(mode)} 새 녹음에 적용됩니다. 진행 중인 녹음은 유지됩니다.` : tab === 'models' ? `설치된 모델은 함께 사용합니다. 기본 모델 선택은 ${labelMode(mode)}에 적용됩니다.` : '앱 공통'}</p>
    {!ready ? <p className="hint" role="status">설정을 확인하는 중…</p> : null}
    {errors.map(([key, error]) => <p key={key} className="error-message" role="alert">{error.text} <button className="secondary" disabled={pending[key]} onClick={() => error.change ? change(error.mode, error.change) : reload()}>다시 시도</button></p>)}
    {tab === 'general' ? <><ThemeSetting/><section className="settings-section settings-row"><div><h2>보관함 보기</h2><p className="hint">{labelMode(mode)}에서 사용하는 보기입니다.</p></div><Select className="preference-select" label="보관함 보기" value={defaults.layout} disabled={!ready || pending[mode + ':layout']} onChange={value => change(mode, { layout: value })} options={[{ value: 'cards', label: '카드' }, { value: 'compact', label: '작은 카드' }, { value: 'list', label: '목록' }]}/></section></> : null}
    {tab === 'recording' ? <section className="settings-section"><div className="settings-row"><div><h2>기본 녹음 장치</h2><p className="hint">녹음 화면에서 이번 녹음의 장치를 변경할 수 있습니다.</p></div><Select className="preference-select" label="기본 녹음 장치" value={defaults.microphone} disabled={!ready || inputs.loading || pending[mode + ':microphone']} onChange={value => change(mode, { microphone: value })} options={[{ value: '', label: '시스템 기본 마이크' }, { value: '__system__', label: '컴퓨터 소리' }, ...(missingDevice ? [{ value: defaults.microphone, label: '이전 장치 · 연결되지 않음', disabled: true }] : []), ...inputs.devices.map((device, index) => ({ value: device.deviceId, label: device.label || `마이크 ${index + 1}` }))]}/></div>
      <p className="hint" role="status">{inputs.loading ? '장치 목록을 확인하는 중…' : inputs.restricted ? '장치 이름이 제한되어 있습니다. 녹음 시작 시 권한을 확인합니다.' : !inputs.devices.length && !inputs.error ? '연결된 마이크가 없습니다. 컴퓨터 소리를 선택하거나 마이크를 연결해 주세요.' : ''}</p>
      {inputs.error ? <p className="error-message" role="alert">{inputs.error}</p> : null}{missingDevice ? <p className="error-message" role="alert">이전에 선택한 장치가 연결되지 않았습니다. <button className="secondary" disabled={pending[mode + ':microphone']} onClick={() => change(mode, { microphone: '' })}>기본 마이크 사용</button></p> : null}<button className="secondary" disabled={inputs.loading} onClick={inputs.refresh}>장치 다시 확인</button></section> : null}
    {tab === 'models' ? <section className="settings-section model-management"><p className="hint">모델을 삭제해도 녹음과 스크립트는 유지됩니다. 역할은 Work·Live별로 지정합니다.</p><ModelStore mode={mode} management/></section> : null}
    {tab === 'storage' ? <section className="settings-section"><div className="settings-row"><div><h2>보관함 저장 위치</h2><p className="hint">Work·Live 기록과 메모를 함께 이전합니다. 설치된 모델은 유지됩니다.</p></div><button className="secondary" disabled={movingLibrary} onClick={moveLibrary}>{movingLibrary ? '복사·검증 중…' : '저장 위치 변경'}</button></div>{movingLibrary ? <p className="hint" role="status">파일 검증이 끝날 때까지 앱을 닫지 마세요. 기존 파일은 보존됩니다.</p> : null}<p className="hint">녹음과 스크립트, 설치된 모델의 저장 위치입니다.</p><button className="secondary" disabled={storageLoading} onClick={() => readStorage(true)}>사용량 다시 확인</button>{storageLoading ? <p className="hint" role="status">사용량을 계산하는 중…</p> : null}
      {storage?.rows.map(row => <section className="storage-entry" key={row.id}><div className="storage-entry-heading"><h2>{row.id === 'models' ? '모델 보관함' : `${labelMode(row.id)} 보관함`}</h2><span>{row.error ? '확인 실패' : size(row.bytes)}</span></div><div className="storage-path">{row.path}</div><div className="settings-actions"><button className="secondary" onClick={() => support(() => window.desktop.settings.location(row.id))}><Icon name="folder"/>저장 위치 열기</button><button className="secondary" onClick={() => support(() => window.desktop.settings.location(row.id, true), '경로를 복사했습니다.')}><Icon name="copy"/>경로 복사</button></div>{row.error ? <p className="error-message" role="alert">{row.error}</p> : <p className="hint">{row.free != null ? `드라이브 여유 공간 ${size(row.free)}` : '드라이브 여유 공간 미확인'}{row.skipped ? ' · 연결된 파일·폴더와 중복 파일은 집계에서 제외했습니다.' : ''}</p>}</section>)}
      {storage ? <p className="hint">마지막 확인 {new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(storage.checkedAt)}</p> : null}</section> : null}
    {tab === 'about' ? <section className="settings-section"><div className="about-brand"><Brand/><span>{appInfo?.version || '확인 중…'}</span></div><p className="hint">새 설치 파일로 업데이트할 수 있습니다. 기존 기록과 설정은 유지됩니다.</p><div className="settings-actions">{[['releases', '공식 릴리스'], ['changes', '변경 사항'], ['license', '라이선스'], ['notices', '외부 구성 요소 고지']].map(([id, label]) => <button className="secondary" key={id} onClick={() => support(() => window.desktop.settings.link(id))}>{label}</button>)}</div>
      <details className="diagnostics"><summary>문제 확인</summary><dl className="gpu-detail"><div><dt>감지된 NVIDIA GPU</dt><dd>{environment?.hardwareChecked ? environment.gpu?.name || '감지되지 않음' : '미확인'}</dd></div><div><dt>자동 선택된 실행 장치</dt><dd>{deviceName(environment?.device)}</dd></div><div><dt>마지막 작업의 실행 장치</dt><dd>{deviceName(environment?.lastExecution?.device)}</dd></div><div><dt>PC 메모리</dt><dd>{size(environment?.ram)}</dd></div></dl>{environmentError || environment?.error ? <p className="error-message" role="alert">{environmentError || environment.error}</p> : null}<p className="hint">로그와 진단 정보로 문제를 확인할 수 있습니다. 진단 정보에는 녹음 내용과 개인 경로가 포함되지 않습니다.</p><div className="settings-actions"><button className="secondary" disabled={working} onClick={check}>상태 다시 확인</button><button className="secondary" onClick={() => support(() => window.desktop.settings.log())}>로그 열기</button><button className="secondary" onClick={() => support(() => window.desktop.settings.diagnostics(), '진단 정보를 복사했습니다.')}>진단 정보 복사</button></div></details></section> : null}
    {supportError ? <p className="error-message" role="alert">{supportError}</p> : null}{notice ? <p className="hint" role="status">{notice}</p> : null}
  </section>;
}
