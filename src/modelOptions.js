export const roleNames = { low: '저성능', standard: '표준', high: '고성능', other: '기타 모델' };
export function modelOptions(models, mode, installedOnly = false) {
  return models.filter(model => !installedOnly || model.downloaded).map(model => {
    const role = model.roles?.[mode] || (model.id === 'small' ? 'low' : model.id === 'large-v3-turbo' ? 'standard' : model.id === 'large-v3' ? 'high' : 'other');
    const name = model.alias || model.modelName || model.id;
    return { value: model.id, label: `${role !== 'other' ? roleNames[role] + ' · ' : ''}${name}${!model.downloaded ? ' · 설치 필요' : ''}`, group: model.external ? '외부 모델' : role !== 'other' ? '선택한 모델' : '기타 모델' };
  });
}
