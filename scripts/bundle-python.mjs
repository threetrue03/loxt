import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import unzipper from 'unzipper';

// Official complete Python runtime archive (also used by Python's install manager).
// Pin both version and the SHA-256 published in python.org/windows-3.13.16.json.
const version = '3.13.16';
const sha256 = 'bbf675bb5e763c1efbb09a3a461b259d81598a63c30c4b0d7ea11b9f063df159';
const root = path.resolve('.runtime');
const destination = path.join(root, 'python');
const archive = path.join(root, `python-${version}-amd64.zip`);
await mkdir(root, { recursive: true });
async function hash(filename) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}
let valid = false;
try { valid = await hash(archive) === sha256; } catch { /* first build */ }
if (!valid) {
  const response = await fetch(`https://www.python.org/ftp/python/${version}/python-${version}-amd64.zip`);
  if (!response.ok) throw new Error(`Python download: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive + '.part'));
  if (await hash(archive + '.part') !== sha256) throw new Error('Python archive checksum mismatch');
  await rename(archive + '.part', archive);
}
let complete = false;
try { complete = JSON.parse(await readFile(path.join(destination, 'sorinote-runtime.json'), 'utf8')).sha256 === sha256; await stat(path.join(destination, 'python.exe')); } catch { /* extract verified archive */ }
if (!complete) {
  await mkdir(destination, { recursive: true });
  const zip = await unzipper.Open.file(archive);
  await zip.extract({ path: destination, concurrency: 4 });
  await stat(path.join(destination, 'python.exe'));
  await writeFile(path.join(destination, 'sorinote-runtime.json'), JSON.stringify({ version, sha256 }, null, 2));
}
console.log(`Bundled Python ${version}; official SHA-256 verified.`);
