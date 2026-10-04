import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Pin the official Windows release; installer builds never run an unverified download.
const version = '2026.08.19';
const sha256 = '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a';
const directory = path.resolve('.runtime/youtube');
const filename = path.join(directory, 'yt-dlp.exe');
const digest = data => createHash('sha256').update(data).digest('hex');
await mkdir(directory, { recursive: true });
let existing;
try { existing = await readFile(filename); } catch { /* first build */ }
if (!existing || digest(existing) !== sha256) {
  const response = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp.exe`, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`YouTube tool download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== sha256) throw new Error('YouTube tool SHA-256 mismatch');
  await writeFile(filename + '.tmp', data); await rename(filename + '.tmp', filename);
}
await writeFile(path.join(directory, 'version.json'), JSON.stringify({ version, sha256 }, null, 2));
console.log(`YouTube tool ${version}; SHA-256 verified.`);
