const ID=/^[a-f0-9-]{36}$/;
function pageIds(note,doc){return doc.pageIds || [note.id];}
function validatePages(value){if(!Array.isArray(value)||!value.length||value.length>500||value.some(id=>typeof id!=='string'||!ID.test(id))||new Set(value).size!==value.length)throw Error('그리기 페이지는 1~500개이며 고유한 ID가 필요합니다.');return value;}
function normalizeObjects(objects,ids){return objects.map(o=>{const pageId=o.pageId||ids[o.page-1],page=ids.indexOf(pageId)+1;if(!page)throw Error('삭제되거나 변경된 페이지의 필기는 저장할 수 없습니다.');return {...o,pageId,page};});}
module.exports={pageIds,validatePages,normalizeObjects};
