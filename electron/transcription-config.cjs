const MODELS = [
  { id: 'tiny', label: 'tiny', size: '약 75 MB', description: '가장 빠름 · 간단한 음성', repo: 'Systran/faster-whisper-tiny' },
  { id: 'base', label: 'base', size: '약 145 MB', description: '빠름 · 가벼운 작업', repo: 'Systran/faster-whisper-base' },
  { id: 'small', label: '저성능', size: '약 486 MB', description: '빠르고 가벼운 변환 · 적은 메모리 사용', preset: true, repo: 'Systran/faster-whisper-small' },
  { id: 'medium', label: 'medium', size: '약 1.5 GB', description: '정확도 우선 · 더 많은 메모리', repo: 'Systran/faster-whisper-medium' },
  { id: 'large-v3-turbo', label: '표준', size: '약 1.62 GB', description: '기본 추천 · 속도와 정확도 균형', preset: true, repo: 'mobiuslabsgmbh/faster-whisper-large-v3-turbo' },
  { id: 'large-v3', label: '고성능', size: '약 3.09 GB', description: '정확도 우선 · 더 많은 연산과 메모리', preset: true, repo: 'Systran/faster-whisper-large-v3' },
];
function validateSettings(value, models = MODELS) {
  if (!value || !models.some(model => model.id === value.model) || !['auto', 'cuda', 'cpu'].includes(value.device)) throw new Error('모델 또는 실행 장치 설정이 올바르지 않습니다.');
  return { model: value.model, device: value.device };
}
function recommendation(gpu, ram) {
  const memory = gpu?.memory || 0;
  return { model: memory >= 12000 ? 'large-v3' : memory >= 4000 ? 'large-v3-turbo' : 'small', device: gpu ? 'cuda' : 'cpu' };
}
function computeType(device, supported) {
  const preferences = device === 'cuda' ? ['int8_float16', 'float16', 'int8_float32', 'float32'] : ['int8', 'int8_float32', 'float32'];
  const type = preferences.find(value => supported.includes(value));
  if (!type) throw new Error('이 장치에서 지원하는 연산 방식을 찾지 못했습니다. CPU로 설정해 다시 확인해 주세요.');
  return type;
}
module.exports = { MODELS, validateSettings, recommendation, computeType };
