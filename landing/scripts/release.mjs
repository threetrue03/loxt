import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { preview } from 'vite';

const root = path.resolve(import.meta.dirname, '../..'), landing = path.join(root, 'landing');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('앱 버전 형식을 확인하세요.');
const version = pkg.version;
const { version: installerVersion } = JSON.parse(await readFile(path.join(root, 'release/stage5/release.json'), 'utf8'));
if (installerVersion !== version) throw new Error('먼저 현재 버전의 npm run package:installer를 완료하세요.');

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with ${code}`)));
  });
}
const releasePath = path.join(landing, 'release.mjs');
const releaseSource = await readFile(releasePath, 'utf8');
if (!/export const version = '\d+\.\d+\.\d+';/.test(releaseSource)) throw new Error('landing/release.mjs 버전 선언을 확인하세요.');
await writeFile(releasePath, releaseSource.replace(/export const version = '\d+\.\d+\.\d+';/, `export const version = '${version}';`));
const metadataPath = path.join(landing, 'index.html');
await writeFile(metadataPath, (await readFile(metadataPath, 'utf8')).replace(/v\d+\.\d+\.\d+/g, `v${version}`));

await run(process.execPath, [path.join(landing, 'scripts/capture.mjs')]);
for (const [source, destination] of [['home.png','workspace-dark.png'],['light-home.png','workspace-light.png']]) {
  await copyFile(path.join(landing, 'public/assets', source), path.join(root, 'docs/assets', destination));
}
await run(process.execPath, [path.join(landing, 'scripts/build.mjs')], landing);
const server = await preview({ root: landing, preview: { host: '127.0.0.1', port: 5193 } });
try { await run(process.execPath, [path.join(landing, 'scripts/check.mjs'), server.resolvedUrls.local[0]]); }
finally { await new Promise(resolve => server.httpServer.close(resolve)); }

if (process.platform !== 'win32') throw new Error('현재 ZIP 생성 단계는 Windows PowerShell에서 실행하세요.');
const zip = path.join(landing, `loxt-site-v${version}.zip`);
const quote = value => `'${value.replaceAll("'", "''")}'`;
await run('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path ${quote(path.join(landing, 'dist', '*'))} -DestinationPath ${quote(zip)} -Force`]);
await mkdir(path.join(root, 'test-results'), { recursive: true });
await writeFile(path.join(root, 'test-results', `site-release-${version}.json`), JSON.stringify({ version, screenshots: 'landing/public/assets/screenshots.json', output: 'landing/dist', zip, checked: true, externallyPublished: false }, null, 2));
console.log(`Website ready: ${zip}\nUpload the installer to GitHub Releases, then publish landing/dist or the ZIP to Production.`);
