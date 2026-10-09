import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await fs.readFile('src/webRecordingJournal.js','utf8');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const context=await browser.newContext();
 await context.route('http://127.0.0.1:59991/**',route=>route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('.js')?source:'<!doctype html><title>Private migration test</title>'}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:59991/');
 const result=await page.evaluate(async()=>{
  await new Promise((resolve,reject)=>{const r=indexedDB.open('loxt-recording-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('recordings',{keyPath:'key'});r.onsuccess=()=>{const db=r.result,tx=db.transaction('recordings','readwrite');tx.objectStore('recordings').put({key:'sample:old',host:'sample',id:'old',bytes:3,chunks:[new Uint8Array([1,2]).buffer,new Uint8Array([3]).buffer]});tx.oncomplete=()=>{db.close();resolve();};};r.onerror=()=>reject(r.error);});
  const {recordingJournal}=await import('/journal.js'),journal=recordingJournal('sample');const migrated=(await journal.list())[0];
  await journal.append({id:'old',sequence:2,bytes:new Uint8Array([4,5])});await journal.append({id:'old',sequence:2,bytes:new Uint8Array([4,5])});await journal.checkpoint({id:'old',seconds:9});
  const final=(await journal.list())[0];const other=await recordingJournal('other-host').list();await journal.remove('old');
  return {migratedCount:migrated.count,migratedChunks:migrated.chunks.map(c=>[...new Uint8Array(c)]),count:final.count,bytes:final.bytes,seconds:final.seconds,chunks:final.chunks.map(c=>[...new Uint8Array(c)]),otherCount:other.length,removed:(await journal.list()).length};
 });
 assert.deepEqual(result,{migratedCount:2,migratedChunks:[[1,2],[3]],count:3,bytes:5,seconds:9,chunks:[[1,2],[3],[4,5]],otherCount:0,removed:0});
 await fs.writeFile('test-results/implementation-2.2.0/journal-results.json',JSON.stringify(result,null,2));console.log('Legacy draft migration, chunk ordering, deduplication and host isolation passed.');
} finally {await browser.close();}
