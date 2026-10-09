const {Worker}=require('node:worker_threads'),path=require('node:path');
let worker=null,indexWorker=null,indexTail=Promise.resolve(),sequence=0,waiting=0,idle=null;
const pending=new Map();
function stop(){clearTimeout(idle);const current=worker;worker=null;for(const entry of pending.values())entry.reject(Error('PDF 처리가 중단되었습니다. 다시 시도해 주세요.'));pending.clear();void current?.terminate();}
function start(){if(worker)return worker;worker=new Worker(path.join(__dirname,'pdf-worker.cjs'));worker.unref();worker.on('message',message=>{const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);message.error?entry.reject(Error(message.error)):entry.resolve(message.result);});worker.on('error',()=>stop());worker.on('exit',()=>{if(worker&&worker.threadId===-1)stop();});return worker;}
const {PDFQueue}=require('./pdf-queue.cjs');
const queue=new PDFQueue(payload=>new Promise((resolve,reject)=>{clearTimeout(idle);const id=++sequence,timer=setTimeout(()=>stop(),180000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});start().ref();worker.postMessage({id,payload});}));
function pdfJob(payload,options={}){
 if(payload.action==='index'){const task=indexTail.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const w=indexWorker=new Worker(path.join(__dirname,'pdf-worker.cjs')),timer=setTimeout(()=>{void w.terminate();reject(Error('PDF 검색 준비 시간이 초과됐습니다. 다시 시도해 주세요.'));},180000);const finish=()=>{clearTimeout(timer);if(indexWorker===w)indexWorker=null;void w.terminate();};w.once('message',message=>{finish();message.error?reject(Error(message.error)):resolve(message.result);});w.once('error',error=>{finish();reject(error);});w.once('exit',code=>{if(indexWorker===w){finish();reject(Error('PDF 검색 준비가 중단되었습니다.'));}});w.postMessage({id:1,payload});}));indexTail=task;return task;}
 waiting++;return queue.enqueue(payload,options).finally(()=>{waiting--;if(!waiting){worker?.unref();idle=setTimeout(stop,30000).unref();}});
}
module.exports={pdfJob,stopPDFJobs:()=>{queue.clear();stop();void indexWorker?.terminate();}};
