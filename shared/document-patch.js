export function documentPatch(previous,next){
 const before=new Map(previous.map(item=>[item.id,item])),present=new Set(next.map(item=>item.id));
 const patch={upsert:next.filter(item=>before.get(item.id)!==item&&JSON.stringify(before.get(item.id))!==JSON.stringify(item)),remove:previous.filter(item=>!present.has(item.id)).map(item=>item.id)};
 if(previous.length!==next.length||previous.some((item,index)=>item.id!==next[index]?.id))patch.order=next.map(item=>item.id);
 return patch;
}
export function applyDocumentPatch(items,patch){
 const changed=new Map(patch.upsert.map(item=>[item.id,item])),removed=new Set(patch.remove);
 let result=items.filter(item=>!removed.has(item.id)).map(item=>{const next=changed.get(item.id)||item;changed.delete(item.id);return next;}).concat([...changed.values()]);
 if(patch.order){const byID=new Map(result.map(item=>[item.id,item]));result=patch.order.map(id=>byID.get(id));if(result.some(item=>!item))throw Error('문서 변경 순서를 확인해 주세요.');}return result;
}
