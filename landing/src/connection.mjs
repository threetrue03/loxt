import { connectionURL } from '../../shared/connection-url.js';
export { connectionURL };
export const connectionKey = 'loxt.personal-web.v1';

export function savedConnection() {
  try { const value = localStorage.getItem(connectionKey); return value ? connectionURL(value).base : ''; } catch { return ''; }
}
