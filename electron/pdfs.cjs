const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicJson } = require('./library.cjs');
const LIMIT = 128 * 1024 * 1024;
const number = v => Number.isFinite(v) && Math.abs(v) <= 100000;
function validateObjects(objects) {
  if (!Array.isArray(objects) || objects.length > 20000 || Buffer.byteLength(JSON.stringify(objects)) > 20_000_000) throw new Error('필기 크기를 확인해 주세요.');
  const ids = new Set();
  for (const o of objects) {
    if (!o || !/^[a-f0-9-]{36}$/.test(o.id) || ids.has(o.id) || !['pen','highlight','rect','ellipse','line','arrow','text'].includes(o.type) || !Number.isSafeInteger(o.page) || o.page < 1 || !/^#[a-f0-9]{6}$/i.test(o.color) || !number(o.width) || o.width < .1 || o.width > 100 || !Array.isArray(o.points) || o.points.length > 50000 || !o.points.every(p => Array.isArray(p) && p.length === 2 && p.every(number)) || typeof (o.text || '') !== 'string' || (o.text || '').length > 10000) throw new Error('필기 형식이 올바르지 않습니다.');
    ids.add(o.id);
  }
  return objects;
}
class PDFs {
  constructor(library) { this.library = library; }
  note(id, editable = false) { const n = this.library.data.notes.find(n => n.id === id && n.kind === 'pdf'); if (!n || editable && n.deleted) throw new Error('PDF가 삭제되었거나 존재하지 않습니다.'); return n; }
  file(id) { this.note(id); return path.join(this.library.recordings, id, 'original.pdf'); }
  import(bytes, name, folder = '') {
    return this.library.enqueue(async () => {
      if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > LIMIT || !Buffer.from(bytes.subarray(0,5)).equals(Buffer.from('%PDF-'))) throw new Error('128 MB 이하의 올바른 PDF를 선택해 주세요.');
      const { PDFDocument } = require('pdf-lib');
      let pdf; try { pdf = await PDFDocument.load(bytes, { updateMetadata: false }); } catch { throw new Error('손상되었거나 암호화된 PDF입니다. 암호 해제 사본을 사용해 주세요.'); }
      const title = String(name || '새 PDF').replace(/\.pdf$/i,'').trim().slice(0,120) || '새 PDF', now = new Date();
      const note = { id: randomUUID(), kind:'pdf', title, folder:this.library.validateFolder(folder), date:now.toISOString().slice(0,10).replaceAll('-','.'), createdAt:now.toISOString(), segments:[], done:true, status:'pdf', deleted:false, audioFile:'original.pdf', pages:pdf.getPageCount(), pdfPreview:'' };
      const dir = path.join(this.library.recordings,note.id); await fs.mkdir(dir);
      try { await fs.writeFile(path.join(dir,'original.pdf'),bytes,{flag:'wx'}); await atomicJson(path.join(dir,'annotations.json'),{version:1,revision:0,objects:[]}); return {note,library:await this.library.saveNote(note)}; }
      catch(error) { /* Preserve any created files for recovery; never overwrite another item. */ throw error; }
    });
  }
  async read(id) {
    await this.library.ready; this.note(id);
    const file=path.join(this.library.recordings,id,'annotations.json');
    const read=async filename=>{const doc=JSON.parse(await fs.readFile(filename,'utf8'));if(doc.version!==1||!Number.isSafeInteger(doc.revision)||doc.revision<0)throw new Error('PDF 필기 형식을 확인해 주세요.');validateObjects(doc.objects);return doc;};
    try{return await read(file);}catch(error){try{return {...await read(file+'.backup'),recovered:true};}catch{throw new Error('PDF 필기를 읽지 못했습니다. 원본 PDF와 필기 파일을 보존했습니다.');}}
  }
  index(payload) {
    return this.library.enqueue(async()=>{
      const note=this.note(payload.id,true);
      if(typeof payload.text!=='string'||payload.text.length>2_000_000)throw new Error('PDF 검색 내용을 확인해 주세요.');
      await atomicJson(path.join(this.library.recordings,note.id,'search.json'),{version:1,text:payload.text});
      await this.library.saveNote({...note,pdfPreview:payload.text.slice(0,2000)});return true;
    });
  }
  async text(id) {
    this.note(id);let original='';try{original=JSON.parse(await fs.readFile(path.join(this.library.recordings,id,'search.json'),'utf8')).text||'';}catch{}
    return original+' '+(await this.read(id)).objects.filter(o=>o.type==='text').map(o=>o.text).join(' ');
  }
  save(payload) {
    return this.library.enqueue(async () => {
      const note=this.note(payload.id,true), current=await this.read(note.id);
      if(payload.revision!==current.revision) { const e=new Error('다른 기기에서 PDF가 변경되었습니다. 내 필기를 보존하고 최신 내용을 확인해 주세요.'); e.code='CONFLICT'; throw e; }
      const objects=validateObjects(payload.objects); if(objects.some(o=>o.page>note.pages))throw new Error('PDF 페이지를 확인해 주세요.');
      const doc={version:1,revision:current.revision+1,objects,updatedAt:new Date().toISOString()};
      if(current.recovered)await fs.copyFile(path.join(this.library.recordings,note.id,'annotations.json'),path.join(this.library.recordings,note.id,'annotations.damaged-'+Date.now()+'.json'));
      await atomicJson(path.join(this.library.recordings,note.id,'annotations.json.backup'),current);
      await atomicJson(path.join(this.library.recordings,note.id,'annotations.json'),doc);
      await this.library.saveNote({...note,editedAt:doc.updatedAt,pdfPreview:note.pdfPreview || ''});
      return doc;
    });
  }
  async export(id, annotated, fontFile) {
    const original=await fs.readFile(this.file(id)); if(!annotated)return original;
    const { PDFDocument,rgb }=require('pdf-lib'), doc=await PDFDocument.load(original,{updateMetadata:false}), data=await this.read(id);
    let font; if(data.objects.some(o=>o.type==='text')) { doc.registerFontkit(require('@pdf-lib/fontkit')); font=await doc.embedFont(await fs.readFile(fontFile),{subset:false}); }
    for(const o of data.objects) {
      const page=doc.getPage(o.page-1), color=rgb(...o.color.slice(1).match(/../g).map(v=>parseInt(v,16)/255)), opacity=o.type==='highlight'?.3:1;
      const [a,b=a]=o.points; if(!a)continue;
      const style={color,borderColor:color,borderWidth:o.width,opacity,borderOpacity:opacity};
      if(o.type==='text')page.drawText(o.text || '',{x:a[0],y:a[1],size:Math.max(8,o.width*6),font,color});
      else if(o.type==='rect')page.drawRectangle({x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1]),borderColor:color,borderWidth:o.width,borderOpacity:opacity});
      else if(o.type==='ellipse')page.drawEllipse({x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,xScale:Math.max(.1,Math.abs(a[0]-b[0])/2),yScale:Math.max(.1,Math.abs(a[1]-b[1])/2),borderColor:color,borderWidth:o.width});
      else { for(let i=1;i<o.points.length;i++)page.drawLine({start:{x:o.points[i-1][0],y:o.points[i-1][1]},end:{x:o.points[i][0],y:o.points[i][1]},thickness:o.type==='highlight'?o.width*5:o.width,color,opacity}); if(o.type==='arrow'){const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);for(const delta of [-.5,.5])page.drawLine({start:{x:b[0],y:b[1]},end:{x:b[0]-12*Math.cos(angle+delta),y:b[1]-12*Math.sin(angle+delta)},color,thickness:o.width});} }
    }
    return Buffer.from(await doc.save());
  }
}
module.exports={PDFs,validateObjects,LIMIT};
