import { createReadStream } from 'node:fs';
import { writeFile, stat, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const asar = require('@electron/asar');
const root = path.resolve(pkg.build.directories.output);
const filename = `LOXT-Setup-${pkg.version}-x64.exe`;
const archive = path.join(root, 'win-unpacked', 'resources', 'app.asar');
const entries = asar.listPackage(archive);
if (entries.some(file => /[\\/](test-results|scripts|ui-preview\.html)([\\/]|$)/.test(file))) throw new Error('Test/source-only files included in the application');
const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
if (packaged.version !== pkg.version) throw new Error('Packaged version mismatch');
async function verifyRenderer(directory = 'dist') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await verifyRenderer(filename);
    else if (entry.isFile() && !asar.extractFile(archive, filename).equals(await readFile(filename))) throw new Error(`Packaged renderer mismatch: ${filename}`);
  }
}
await verifyRenderer();
for (const filename of await readdir('electron')) {
  if (!filename.endsWith('.cjs')) continue;
  if (!asar.extractFile(archive, `electron/${filename}`).equals(await readFile(path.join('electron', filename)))) throw new Error(`Packaged source mismatch: ${filename}`);
}
for (const filename of await readdir('shared')) {
  if (!/\.(js|cjs)$/.test(filename)) continue;
  if (!asar.extractFile(archive, `shared/${filename}`).equals(await readFile(path.join('shared', filename)))) throw new Error(`Packaged shared source mismatch: ${filename}`);
}
for (const filename of await readdir('python')) {
  if (!/\.(py|txt)$/.test(filename)) continue;
  const installed = path.join(root, 'win-unpacked', 'resources', 'python', filename);
  if (!(await readFile(installed)).equals(await readFile(path.join('python', filename)))) throw new Error(`Packaged worker mismatch: ${filename}`);
}
const digest = createHash('sha256');
const youtubeTool = JSON.parse(await readFile('.runtime/youtube/version.json', 'utf8'));
for (const file of ['yt-dlp.exe', 'version.json']) {
  const installed = await readFile(path.join(root, 'win-unpacked', 'resources', 'youtube', file));
  if (!installed.equals(await readFile(path.join('.runtime/youtube', file)))) throw new Error(`Packaged YouTube tool mismatch: ${file}`);
  if (file.endsWith('.exe') && createHash('sha256').update(installed).digest('hex') !== youtubeTool.sha256) throw new Error('Packaged YouTube tool checksum mismatch');
}
for await (const chunk of createReadStream(path.join(root, filename))) digest.update(chunk);
const sha256 = digest.digest('hex');
await writeFile(path.join(root, 'SHA256SUMS.txt'), `${sha256}  ${filename}\n`);
await writeFile(path.join(root, 'release.json'), JSON.stringify({ version: pkg.version, platform: 'win32', arch: 'x64', filename, bytes: (await stat(path.join(root, filename))).size, sha256, python: '3.13.16', updateMethod: 'manual-installer', signed: false }, null, 2));
console.log(`Installer ${filename}; SHA-256 ${sha256}; production archive checked.`);
