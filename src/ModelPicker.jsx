import Select from './Select.jsx';
import { taskLabel } from './uiPreferences.js';

export default function ModelPicker({ environment, onConfigure, onTranscribe, onCancel, disabled, done, onModels }) {
  const models = (environment?.models || []).filter(model => model.preset || model.downloaded || model.id === environment?.model);
  const selected = models.find(model => model.id === environment?.model);
  return <div className="model-picker">
    <div className="model-choice"><span>변환 모델</span><Select label="변환 모델" className="field-select" value={environment?.model || ''} disabled={!environment || environment.busy} onChange={model => onConfigure({model,device:'auto'})} options={models.map(model=>({value:model.id,label:`${model.label}${!model.downloaded ? ' · 설치 필요' : ''}`}))}/><span className="hint">{selected?.description || '모델 정보를 확인하고 있습니다.'}{selected && !selected.downloaded ? ` · 다운로드 ${selected.size}` : ''}</span></div>
    <div className="model-actions"><button className="model-library-link" onClick={onModels}>모델 보관함</button>{environment?.task ? <button className="secondary" onClick={onCancel} disabled={environment.stage === 'saving'}>전사 취소</button> : <button className="primary" onClick={onTranscribe} disabled={disabled || !environment || environment.busy}>{selected && !selected.downloaded ? '설치 후 전사' : done ? '다시 전사' : '전사하기'}</button>}</div>
    {environment?.task ? <div className="workspace-progress" role="status"><span>{taskLabel(environment)}{environment.progress != null ? ` · ${environment.progress}%` : ''}</span><progress aria-label="전사 진행" max="100" value={environment.progress ?? undefined}/></div> : null}
  </div>;
}
