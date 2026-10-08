import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Library } from '../electron/library.cjs';
import { PDFs } from '../electron/pdfs.cjs';
import { Memos } from '../electron/memos.cjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';

await mkdir('test-results/v2-device', { recursive: true });
const existing = process.argv.find(arg => arg.startsWith('--profile='))?.slice(10);
const profile = existing ? path.resolve(existing) : await mkdtemp(path.resolve('test-results/v2-device/profile-'));
if (!existing) {
const root = path.join(profile, 'LOXT');
await mkdir(root);
await writeFile(path.join(profile, 'library-location.json'), JSON.stringify({ version: 1, root }));
const store = new Library(path.join(root, 'work-library')); await store.ready;
await store.createFolder('연결 테스트');
const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
pdf.addPage([450,620]).drawText('LOXT 2.0 - Write a note here', { x: 30, y: 550, font, size: 16 });
await new PDFs(store).import(await pdf.save(), '필기 테스트.pdf', '연결 테스트');
const memos = new Memos(store), note = (await memos.create('연결 테스트')).note;
await store.updateNote(note.id, { title: '연결 테스트 메모' });
}
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const executablePath = process.argv.slice(2).find(arg => arg.endsWith('.exe'));
const app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? [] : ['.'], env });
const page = await app.firstWindow();
await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1280,900);window.setTitle('LOXT 2.0.0 연결 테스트 · 예시 보관함'); window.show(); });
await page.getByRole('button', { name: '설정', exact: true }).click();
await page.getByRole('button', { name: '내 기기 연결', exact: true }).click();
const state = await page.evaluate(() => window.desktop.devices.configure(true));
await page.locator('.device-settings details').evaluate(el => el.open = true);
await writeFile('test-results/v2-device/connection.json', JSON.stringify({ profile, pid: await app.evaluate(()=>process.pid), ...state }, null, 2));
console.log(JSON.stringify({ profile, addresses: state.addresses, bootstrap: state.bootstrap, fingerprint: state.fingerprint }, null, 2));
await page.evaluate(async()=>{window.__v2Environment=await window.desktop.getTranscriptionEnvironment();window.desktop.onTranscriptionState(value=>window.__v2Environment=value);});
const timer = setInterval(async () => { try { const status = await page.evaluate(async () => ({ environment: window.__v2Environment, library: await window.desktop.getLibrary() })); await writeFile('test-results/v2-device/status.json', JSON.stringify({ models: status.environment.models?.map(({id,downloaded})=>({id,downloaded})), stage: status.environment.stage, queue: status.environment.queue, notes: status.library.notes.map(({id,title,status,seconds,kind,hasMemo,segments}) => ({id,title,status,seconds,kind,hasMemo,segmentCount:segments?.length})) }, null, 2)); } catch {} }, 10000);
await writeFile('test-results/v2-device/pid.json', JSON.stringify({pid:await app.evaluate(()=>process.pid),profile}));
await new Promise(resolve => app.on('close', resolve));
clearInterval(timer);


