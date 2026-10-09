function abortError(){const error=Error('이전 PDF 페이지 요청이 취소되었습니다.');error.name='AbortError';error.code='CANCELED';return error;}
class PDFQueue{
 constructor(run,limit=24){this.run=run;this.limit=limit;this.queue=[];this.active=null;}
 enqueue(payload,{signal,priority=false}={}){
  if(signal?.aborted)return Promise.reject(abortError());
  if(this.queue.length+(this.active?1:0)>=this.limit)return Promise.reject(Error('PDF 작업이 많습니다. 잠시 후 다시 시도해 주세요.'));
  return new Promise((resolve,reject)=>{
   const item={payload,signal,priority,resolve,reject};item.abort=()=>{const index=this.queue.indexOf(item);if(index>=0){this.queue.splice(index,1);signal.removeEventListener('abort',item.abort);reject(abortError());}};
   signal?.addEventListener('abort',item.abort,{once:true});
   // UI renders run before background metadata work; equal priorities remain FIFO.
   const index=priority?this.queue.findIndex(entry=>!entry.priority):-1;index<0?this.queue.push(item):this.queue.splice(index,0,item);this.pump();
  });
 }
 pump(){if(this.active)return;const item=this.queue.shift();if(!item)return;this.active=item;
  Promise.resolve().then(()=>{if(item.signal?.aborted)throw abortError();return this.run(item.payload);}).then(value=>item.signal?.aborted?item.reject(abortError()):item.resolve(value),item.reject).finally(()=>{item.signal?.removeEventListener('abort',item.abort);this.active=null;this.pump();});
 }
 clear(){for(const item of this.queue){item.signal?.removeEventListener('abort',item.abort);item.reject(abortError());}this.queue=[];}
}
module.exports={PDFQueue,abortError};
