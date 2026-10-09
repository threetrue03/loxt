// Conservative retained-data estimate, not a measured JavaScript heap size.
// Immutable document objects are estimated once; changed snapshots get new identities.
const sizes = new WeakMap();
export function estimateDocumentBytes(value, seen = new WeakSet()) {
  if (typeof value === 'string') return value.length * 2 + 16;
  if (value == null) return 8;
  if (typeof value !== 'object') return 8;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (!Array.isArray(value) && sizes.has(value)) return sizes.get(value);
  let bytes = 48;
  if (Array.isArray(value)) for (const child of value) bytes += 8 + estimateDocumentBytes(child, seen);
  else for (const [key, child] of Object.entries(value)) bytes += key.length * 2 + 8 + estimateDocumentBytes(child, seen);
  if (!Array.isArray(value)) sizes.set(value, bytes);
  return bytes;
}
export function documentCacheBudget() { return globalThis.window?.desktop?.remote ? 16 * 1024 * 1024 : 32 * 1024 * 1024; }
export function trimIdleDocuments(entries, { bytesLimit = documentCacheBudget(), countLimit = 20, protectedEntry = () => false, onEvict = () => {} } = {}) {
  let bytes = [...entries.values()].reduce((sum, entry) => sum + (entry.cacheBytes || 0), 0);
  const candidates = [...entries].filter(([, entry]) => !protectedEntry(entry)).sort((a, b) => (a[1].lastAccess || 0) - (b[1].lastAccess || 0));
  for (const [key, entry] of candidates) {
    if (entries.size <= countLimit && bytes <= bytesLimit) break;
    entries.delete(key); bytes -= entry.cacheBytes || 0; onEvict(entry);
  }
  return { bytes, entries: entries.size, overBudget: bytes > bytesLimit || entries.size > countLimit };
}
