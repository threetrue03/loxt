import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
const require=createRequire(import.meta.url),{Library}=require('../electron/library.cjs'),{PDFs}=require('../electron/pdfs.cjs');
const out=path.resolve('test-results/v2-pdf-render');await fs.mkdir(out,{recursive:true});
const store=new Library(await fs.mkdtemp(path.join(out,'profile-')));await store.ready;
const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
const font=await pdf.embedFont(await fs.readFile('public/pdf-font.ttf'),{subset:false});
const page=pdf.addPage([650,780]);page.drawText('함께 읽는 디자인 노트',{font,size:28,x:44,y:700});
page.drawText('읽고, 밑줄을 긋고, 생각을 더합니다.',{font,size:16,x:44,y:650});
const service=new PDFs(store),{note}=await service.import(await pdf.save(),'한글 내보내기.pdf');
await service.save({id:note.id,revision:0,objects:[{id:crypto.randomUUID(),type:'text',page:1,color:'#387a97',width:3,points:[[44,590]],text:'한글 필기를 PDF에 저장합니다.'},{id:crypto.randomUUID(),type:'highlight',page:1,color:'#ffaa22',width:5,points:[[44,640],[350,640]]}]});
const bytes=await service.export(note.id,true,path.resolve('public/pdf-font.ttf'));await fs.writeFile(path.join(out,'annotated.pdf'),bytes);
const canvasModule=require('@napi-rs/canvas'),canvas=canvasModule.createCanvas(650,780);
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,standardFontDataUrl:path.resolve('public/pdf-assets/standard_fonts').split(path.sep).join('/')+'/',wasmUrl:path.resolve('public/pdf-assets/wasm').split(path.sep).join('/')+'/'});
try{const document=await task.promise,p=await document.getPage(1);await p.render({canvas,canvasContext:canvas.getContext('2d'),viewport:p.getViewport({scale:1})}).promise;await fs.writeFile(path.join(out,'annotated.png'),canvas.toBuffer('image/png'));const pixels=canvas.getContext('2d').getImageData(44,45,380,50).data;let left=380,right=0,ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]<100){const x=(i/4)%380;left=Math.min(left,x);right=Math.max(right,x);ink++;}assert.ok(right-left>200 && ink>500,'Korean title glyphs must render across the full line, not only extract as text');const text=await p.getTextContent();assert.ok(text.items.map(i=>i.str).join('').replace(/\s/g,'').includes('한글필기를PDF에저장합니다.'));console.log('PASS: actual PDF export rendered to test-results/v2-pdf-render/annotated.png');}finally{await task.destroy();}
