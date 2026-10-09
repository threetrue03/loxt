import {documentTiming} from './syncDiagnostics.js';
import {applyDocumentPatch} from '../shared/document-patch.js';
// Remember a notification even while local edits or a save prevent applying it.
// Revision checks prevent an old read from overwriting a newly edited draft.
export function requestDocumentRefresh(entry,api,field,publish,revision=Infinity,requestId){
 if(requestId)entry.remoteRequestId=requestId;documentTiming(entry.key||entry.id,'notification',revision,entry.remoteRequestId);
 entry.refreshSequence=(entry.refreshSequence||0)+1;entry.targetRevision=Math.max(entry.targetRevision||0,revision);
 if(entry.listeners&&!entry.listeners.size||entry.state.loading||entry.state.dirty||entry.state.saving||entry.refresh)return;
 const since=entry.state.revision,target=entry.targetRevision,sequence=entry.refreshSequence;
 entry.refresh=(api.changes?api.changes({...entry.documentPayload,since}):api.get(entry.documentPayload)).then(value=>{
  if(entry.state.dirty||entry.state.saving||entry.state.revision!==since)return;
  let doc=value.snapshot||value;
  if(value.patches){let items=entry.state[field],current=since;for(const record of value.patches){if(record.base!==current)throw Error('문서 갱신 순서가 일치하지 않습니다.');items=applyDocumentPatch(items,record.patch);current=record.revision;}doc={revision:current,[field]:items,updatedAt:value.updatedAt};}
  if(doc.revision>since){entry[field==='blocks'?'savedBlocks':'savedObjects']=doc[field];if(doc.pageIds)entry.savedPageIds=doc.pageIds;publish(entry,doc);documentTiming(entry.key||entry.id,'applied',doc.revision,entry.remoteRequestId);if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>documentTiming(entry.key||entry.id,'renderFrame',doc.revision,entry.remoteRequestId));}
  if(entry.refreshSequence===sequence||entry.targetRevision<=doc.revision)entry.targetRevision=0;
 }).catch(error=>{publish(entry,{error:error.message});entry.refreshFailed=true;}).finally(()=>{entry.refresh=null;if(entry.targetRevision&&!entry.refreshFailed&&!entry.state.dirty&&!entry.state.saving)requestDocumentRefresh(entry,api,field,publish,entry.targetRevision);});
 return entry.refresh;
}
