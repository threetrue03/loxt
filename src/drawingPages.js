export function changeDrawingPage(state,action,page){
 const pageIds=[...state.pageIds],at=page-1,objects=state.objects.map(o=>({...o,pageId:o.pageId||pageIds[o.page-1]}));let nextPage=page;
 if(action==='add'){pageIds.push(crypto.randomUUID());nextPage=pageIds.length;}
 else if(action==='duplicate'){const original=pageIds[at],id=crypto.randomUUID();pageIds.splice(at+1,0,id);objects.push(...objects.filter(o=>o.pageId===original).map(o=>({...o,id:crypto.randomUUID(),pageId:id,points:o.points.map(p=>[...p])})));nextPage=page+1;}
 else if(action==='delete'){if(pageIds.length===1)throw Error('마지막 페이지는 삭제할 수 없습니다.');pageIds.splice(at,1);nextPage=Math.min(page,pageIds.length);}
 else throw Error('페이지 작업을 확인해 주세요.');
 if(pageIds.length>500)throw Error('그리기는 최대 500페이지까지 추가할 수 있습니다.');
 return {pageIds,objects:objects.filter(o=>pageIds.includes(o.pageId)).map(o=>({...o,page:pageIds.indexOf(o.pageId)+1})),page:nextPage};
}
