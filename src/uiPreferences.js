export const fonts = [{ id: 'suit', label: 'SUIT', family: '"SUIT", sans-serif' }];
export function loadPreferences() {
  let value = {};
  try { value = JSON.parse(localStorage.getItem('sorinote.ui-preferences')) || {}; } catch { /* defaults */ }
  return { font: 'suit', microphone: typeof value.microphone === 'string' ? value.microphone : '', autoTranscribe: true };
}
export const settingsTabs = [['general', '일반', 'settings'], ['recording', '녹음', 'mic'], ['models', '모델 보관함', 'file'], ['storage', '저장 및 보관함', 'folder'], ['about', '앱 정보', 'shield']];
export function taskLabel(environment) {
  if (!environment?.busy) return '';
  if (environment.operation === 'download' || environment.stage === 'downloading') return '모델 설치 중';
  if (environment.stage === 'diarizing') return '화자 분석 중';
  if (environment.stage === 'saving') return '스크립트 저장 중';
  if (environment.stage === 'transcribing') return '변환 중';
  return '변환 시작 중';
}
