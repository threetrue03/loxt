const documents=new Map();
export function documentTiming(key,stage,revision,requestId){let item=documents.get(key);if(!item||stage==='input'&&!item.pending){item={key,pending:true,started:performance.now(),stages:{}};documents.set(key,item);}item.stages[stage]=Math.round((performance.now()-item.started)*10)/10;item.revision=revision;if(requestId)item.requestId=requestId;if(stage==='saved'||stage==='applied')item.pending=false;while(documents.size>40)documents.delete(documents.keys().next().value);}
export const documentTimings=()=>[...documents.values()].map(({started,...item})=>item);

export function linkDocumentRequest(id,requestId){for(const [key,item]of documents)if(key===id||key.endsWith(':'+id))item.requestId=requestId;}
