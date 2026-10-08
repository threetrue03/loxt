const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { randomUUID } = require('node:crypto');
const { ZipFile } = require('yazl');
const { Memos } = require('./memos.cjs');

function safeName(value) {
  const name = String(value).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || '이름 없음';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? '_' + name : name;
}
const escapeMD = text => String(text).replace(/[\\`*_{}\[\]<>#|]/g, '\\$&');
function inline(content) {
  if (!Array.isArray(content)) return '';
  return content.map(item => {
    if (item.type === 'link') return `[${inline(item.content)}](${item.href})`;
    if (item.type === 'math') return '$' + inline(item.content) + '$';
    let text = escapeMD(item.text || '');
    if (item.styles?.code) text = '`` ' + (item.text || '').replace(/\n/g, ' ') + ' ``';
    if (item.styles?.bold) text = '**' + text + '**';
    if (item.styles?.italic) text = '*' + text + '*';
    if (item.styles?.strike) text = '~~' + text + '~~';
    if (item.styles?.underline) text = '<u>' + text + '</u>';
    return text;
  }).join('');
}
function markdown(blocks, depth = 0) {
  return blocks.map(block => {
    let text = inline(block.content), prefix = '', body = '';
    switch (block.type) {
      case 'heading': prefix = '#'.repeat(Math.max(1, Math.min(3, block.props?.level || 1))) + ' '; break;
      case 'bulletListItem': case 'toggleListItem': prefix = '- '; break;
      case 'numberedListItem': prefix = '1. '; break;
      case 'checkListItem': prefix = `- [${block.props?.checked ? 'x' : ' '}] `; break;
      case 'quote': prefix = '> '; break;
      case 'divider': text = '---'; break;
      case 'codeBlock': {
        const code = (block.content || []).map(item => item.text || '').join('');
        const longest = Math.max(2, ...(code.match(/`+/g) || []).map(run => run.length)), fence = '`'.repeat(longest + 1);
        text = `${fence}${block.props?.language || ''}\n${code}\n${fence}`; break;
      }
      case 'mathBlock': text = '$$\n' + (block.content || []).map(item => item.text || '').join('') + '\n$$'; break;
      case 'image': case 'file': text = `${block.type === 'image' ? '!' : ''}[${escapeMD(block.props?.caption || block.props?.name || '첨부파일')}](${block.props?.url || ''})`; break;
      case 'table': {
        const rows = block.content?.rows || [];
        const cells = rows.map(row => '| ' + row.cells.map(cell => inline(Array.isArray(cell) ? cell : cell.content).replace(/\n/g, '<br>')).join(' | ') + ' |');
        if (cells.length) cells.splice(1, 0, '| ' + rows[0].cells.map(() => '---').join(' | ') + ' |');
        text = cells.join('\n'); break;
      }
    }
    body = '  '.repeat(depth) + prefix + text.split('\n').join('\n' + '  '.repeat(depth));
    if (block.children?.length) body += '\n' + markdown(block.children, depth + 1);
    return body;
  }).join('\n\n');
}
function time(seconds) { const total = Math.max(0, Math.floor(Number(seconds) || 0)); return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':'); }
async function folderSnapshot(library, folder) {
  return library.enqueue(async () => {
    if (typeof folder !== 'string' || (folder && !library.data.folders.includes(folder))) throw new Error('내보낼 폴더를 확인해 주세요.');
    const within = name => !folder || name === folder || name.startsWith(folder + '/');
    if ([...library.sessions.values()].some(session => within(session.note.folder))) throw new Error('이 폴더의 녹음을 종료한 뒤 내보내 주세요.');
    const notes = structuredClone(library.data.notes.filter(note => !note.deleted && within(note.folder)));
    const folders = library.data.folders.filter(within);
    const parents = { ...library.data.folderParents };
    const memos = new Memos(library), documents = {};
    for (const note of notes) if (note.kind === 'memo' || note.hasMemo) documents[note.id] = await memos.read(note.id);
    return { notes, folders, parents, documents };
  });
}
async function exportFolder(payload, { library, dialog, mainWindow }) {
  if (!payload || typeof payload.folder !== 'string') throw new Error('내보낼 폴더를 확인해 주세요.');
  const snapshot = await folderSnapshot(library, payload.folder);
  const result = await dialog.showSaveDialog(mainWindow, { title: '폴더 내보내기', defaultPath: safeName(payload.folder.split('/').at(-1) || '내 보관함') + '.zip', filters: [{name:'ZIP',extensions:['zip']}] });
  if (result.canceled || !result.filePath) return { canceled: true };
  const temporary = result.filePath + '.' + randomUUID() + '.part', zip = new ZipFile();
  const destinations = new Map([['', '']]), used = new Set(), memos = new Memos(library);
  function directory(folder) {
    if (destinations.has(folder)) return destinations.get(folder);
    const parent = snapshot.parents[folder] || '', base = directory(parent);
    let component = safeName(folder.slice(parent ? parent.length + 1 : 0));
    const original = component; let suffix = 1;
    while (used.has((base + component).toLocaleLowerCase())) component = original + ' (' + ++suffix + ')';
    used.add((base + component).toLocaleLowerCase()); const destination = base + component + '/'; destinations.set(folder, destination); return destination;
  }
  // The selected folder is the ZIP root; empty descendant folders are preserved.
  if (payload.folder) destinations.set(payload.folder, safeName(payload.folder.split('/').at(-1)) + '/');
  let writing;
  try {
    writing = pipeline(zip.outputStream, createWriteStream(temporary, { flags:'wx' }));
    writing.catch(() => {});
    zip.on('error', error => zip.outputStream.destroy(error));
    for (const folder of snapshot.folders) zip.addEmptyDirectory(directory(folder));
    for (const note of snapshot.notes) {
      const location = directory(note.folder) + safeName(note.title) + ' [' + note.id + ']/';
      zip.addEmptyDirectory(location);
      if (note.kind === 'pdf') {
        zip.addFile(path.join(library.recordings,note.id,'original.pdf'),location + '원본.pdf');
        zip.addFile(path.join(library.recordings,note.id,'annotations.json'),location + '필기.json');
      } else if (note.kind !== 'memo') {
        if (typeof note.audioFile !== 'string' || path.basename(note.audioFile) !== note.audioFile) throw new Error('원본 녹음 경로를 확인해 주세요.');
        zip.addFile(path.join(library.recordings, note.id, note.audioFile), location + '원본' + path.extname(note.audioFile));
        if (note.done || note.segments?.length) zip.addBuffer(Buffer.from('\ufeff' + note.title + '\n\n' + (note.segments || []).map(segment => `[${time(segment.start)}] ${segment.speaker ? segment.speaker + ' · ' : ''}${segment.text}`).join('\n'), 'utf8'), location + '스크립트.txt');
      }
      if (snapshot.documents[note.id]) {
        let body = markdown(snapshot.documents[note.id].blocks);
        const urls = new Set(body.match(/loxt-asset:\/\/memo\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{1,12}/g) || []);
        for (const url of urls) {
          const asset = await memos.asset(url); if (asset.id !== note.id) throw new Error('첨부파일의 문서를 확인해 주세요.');
          zip.addFile(asset.filename, location + '첨부파일/' + asset.name);
          body = body.split(url).join(encodeURIComponent('첨부파일') + '/' + asset.name);
        }
        zip.addBuffer(Buffer.from('\ufeff# ' + escapeMD(note.title) + '\n\n' + body, 'utf8'), location + '메모.md');
      }
    }
    zip.end(); await writing; await fs.rename(temporary, result.filePath);
    return { canceled: false, notes: snapshot.notes.length };
  } catch (error) {
    zip.outputStream.destroy(error); if (writing) await writing.catch(() => {});
    await fs.unlink(temporary).catch(() => {}); throw error;
  }
}
module.exports = { exportFolder, folderSnapshot, markdown, safeName };
