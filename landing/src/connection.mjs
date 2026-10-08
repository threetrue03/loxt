export const connectionKey = 'loxt.personal-web.v1';

export function connectionURL(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('PC 설정에서 복사한 연결 주소를 붙여넣어 주세요.'); }
  const parts = url.hostname.split('.');
  const ipv4 = parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  const [a, b] = parts.map(Number);
  const local = url.hostname === 'localhost' || (ipv4 && (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)));
  if (url.protocol !== 'https:' || !local || url.username || url.password || url.search || !['/', '/web.html'].includes(url.pathname)) throw new Error('LOXT가 제공한 HTTPS 개인 네트워크 주소를 사용해 주세요.');
  if (url.hash && !/^#pair=[a-f0-9]{48}$/.test(url.hash)) throw new Error('연결 주소가 올바르지 않습니다. PC에서 다시 복사해 주세요.');
  url.pathname = '/web.html';
  const first = url.href;
  url.hash = '';
  return { first, base: url.href };
}

export function savedConnection() {
  try { const value = localStorage.getItem(connectionKey); return value ? connectionURL(value).base : ''; } catch { return ''; }
}
