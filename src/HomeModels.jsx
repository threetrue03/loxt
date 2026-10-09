import { useState } from 'react';
import Icon from './Icon.jsx';
import { useSettings } from './SettingsProvider.jsx';
import useModelStore from './useModelStore.js';
import { roleNames } from './modelOptions.js';
import './model-store.css';

export default function HomeModels({ mode, onOpen }) {
  const { data } = useModelStore();
  const { preferences, change, operation, pending } = useSettings();
  const [error, setError] = useState('');
  const selected = preferences[mode].model;
  return <section className="home-section home-models" aria-label={`${mode === 'live' ? 'Live' : 'Work'} 모델 선택`}>
    <div className="home-section-heading"><h2>변환 모델</h2><button className="home-section-link" onClick={onOpen}>모델 스토어 열기<Icon name="chevronRight"/></button></div>
    <p className="hint">{mode === 'live' ? 'Live는 Whisper 청크 변환을 사용합니다. 실시간 지연과 정확도는 음성과 PC에 따라 달라집니다.' : '설치된 모델을 선택하거나 모델 스토어에서 찾아보세요.'}</p>
    <div className="home-model-choices">{['low', 'standard', 'high'].map(role => {
      const id = data?.management.roles[mode]?.[role], model = data?.models.find(item => item.id === id);
      return <button key={role} className="home-model-choice" aria-pressed={Boolean(id && selected === id)} disabled={!model?.downloaded || Boolean(operation.lockReason || operation.pending || pending[mode + ':model'])} onClick={async () => { setError(''); if (!await change(mode, { model: id })) setError('모델을 선택하지 못했습니다. 진행 중인 작업과 설정을 확인해 주세요.'); }}>
        <span><strong>{roleNames[role]}</strong>{selected === id ? <span aria-label="선택됨">✓</span> : null}</span><small>{model?.alias || model?.name || model?.modelName || '모델 지정 안됨'}</small><small>{model?.downloaded ? model.recommendation?.label || '설치됨' : '스토어에서 설치·지정'}</small>
      </button>;
    })}</div>{error ? <p className="error-message" role="alert">{error}</p> : null}
  </section>;
}
