const reads=new Set(['memo.changes','pdf.changes','pdf.prepareIndex','library.list','library.detail','memo.get','pdf.get','pdf.searchIndex','pdf.info','pdf.page','pdf.preview','pdf.outline','pdf.destination','search','environment','preferences','appInfo','liveState']);
class RequestCache {
  constructor(){this.entries=new Map();this.bytes=0;}
  prune(){const now=Date.now();for(const [key,e] of this.entries)if(e.settled&&(e.expires<now||this.bytes>8*1024*1024||this.entries.size>512)){this.entries.delete(key);this.bytes-=e.bytes;}}
  run(key,method,work){if(reads.has(method))return work();this.prune();if(this.entries.has(key))return this.entries.get(key).promise;
    // Active writes stay until settled, so a retried upload cannot run twice.
    if([...this.entries.values()].filter(e=>!e.settled).length>=64)throw new Error('진행 중인 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    const e={settled:false,bytes:0,expires:Infinity};e.promise=Promise.resolve().then(work).then(value=>{e.settled=true;e.expires=Date.now()+120000;e.bytes=Buffer.byteLength(JSON.stringify(value)||'null');this.bytes+=e.bytes;this.prune();return value;},error=>{this.entries.delete(key);throw error;});this.entries.set(key,e);return e.promise;
  }
  clear(){this.entries.clear();this.bytes=0;}
}
module.exports={RequestCache,reads};
