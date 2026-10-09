const {randomUUID}=require('node:crypto');
const ROOT=/^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.?($|\/)).{1,1024}$/;
const validPath=value=>typeof value==='string'&&ROOT.test(value)&&value.split('/').length<=16&&value.split('/').every(part=>part.length>0&&part.length<=80);
function validFolderTrash(note){return note.kind==='folder'&&note.deleted===true&&validPath(note.folderTrashRoot)&&Array.isArray(note.folderPaths)&&note.folderPaths.length>0&&note.folderPaths.every(p=>validPath(p)&&(p===note.folderTrashRoot||p.startsWith(note.folderTrashRoot+'/')))&&note.folderMembers&&typeof note.folderMembers==='object'&&!Array.isArray(note.folderMembers)&&Object.entries(note.folderMembers).every(([id,p])=>/^[a-f0-9-]{36}$/.test(id)&&note.folderPaths.includes(p))&&(!note.restoredRoot||validPath(note.restoredRoot));}
function createFolderTrash(store,root,paths){
  const now=new Date(),members=Object.fromEntries(store.data.notes.filter(n=>!n.deleted&&paths.includes(n.folder)).map(n=>[n.id,n.folder]));
  return {id:randomUUID(),kind:'folder',title:root.split('/').at(-1),folder:'',folderTrashRoot:root,folderPaths:paths,folderMembers:members,segments:[],done:true,status:'folder',deleted:true,date:now.toISOString().slice(0,10).replaceAll('-','.'),createdAt:now.toISOString()};
}
function restorePlan(store,selected){
  const groups=new Map(store.data.notes.filter(n=>n.kind==='folder'&&n.deleted).map(n=>[n.id,n]));
  const full=new Set(selected.filter(n=>n.kind==='folder').map(n=>n.id)),touched=new Set([...full,...selected.map(n=>n.trashedFolderId).filter(id=>groups.has(id))]);
  const folders=new Set(store.data.folders),identities={...store.data.folderIds},changed=new Map(),remove=new Set(),restored=[];
  function addPath(path){if(!validPath(path))throw Error('복구할 폴더 경로를 확인해 주세요.');const parts=path.split('/');for(let i=1;i<=parts.length;i++){const folder=parts.slice(0,i).join('/');folders.add(folder);if(!Object.hasOwn(identities,folder))Object.defineProperty(identities,folder,{value:randomUUID(),writable:true,enumerable:true,configurable:true});}}
  for(const id of touched){
    const group=groups.get(id);if(!group||!validFolderTrash(group))throw Error('폴더 복구 기록을 확인해 주세요. 원본은 유지됩니다.');
    let target=group.restoredRoot&&(!folders.has(group.restoredRoot)||group.restoredRootId===identities[group.restoredRoot])?group.restoredRoot:null;
    if(!target){target=group.folderTrashRoot;if(folders.has(target)){const parts=target.split('/'),name=parts.pop();for(let i=1;;i++){const suffix=i===1?' (복구)':` (복구 ${i})`;target=[...parts,name.slice(0,80-suffix.length)+suffix].join('/');if(!folders.has(target))break;}}}
    const mapPath=original=>target+original.slice(group.folderTrashRoot.length);
    const members=store.data.notes.filter(n=>n.deleted&&n.trashedFolderId===id&&(full.has(id)||selected.some(s=>s.id===n.id)));
    if(full.has(id)){for(const p of group.folderPaths)addPath(mapPath(p));remove.add(id);}
    for(const n of members){const original=group.folderMembers[n.id]||n.trashedFolderPath;if(!group.folderPaths.includes(original))throw Error('기록의 원래 폴더를 확인해 주세요.');const folder=mapPath(original);addPath(folder);changed.set(n.id,{...n,folder,deleted:false,trashedFolderId:null,trashedFolderPath:null});}
    if(!full.has(id))changed.set(id,{...group,restoredRoot:target,restoredRootId:identities[target]});
    restored.push({id,from:group.folderTrashRoot,to:target,complete:full.has(id)});
  }
  for(const n of selected){if(n.kind==='folder'||changed.has(n.id))continue;changed.set(n.id,{...n,deleted:false,folder:folders.has(n.folder)?n.folder:''});}
  const folderParents={};for(const folder of folders){const parent=folder.includes('/')?folder.slice(0,folder.lastIndexOf('/')):'';if(parent)folderParents[folder]=parent;}
  const data={...store.data,folders:[...folders],folderParents,folderIds:identities,notes:store.data.notes.filter(n=>!remove.has(n.id)).map(n=>changed.get(n.id)||n)};
  return {data,notes:[...changed.values()],remove:[...remove],restored};
}
function expandPermanentIds(store,ids){const selected=new Set(ids);for(const id of ids){const note=store.data.notes.find(n=>n.id===id);if(note?.kind!=='folder')continue;for(const member of store.data.notes)if(member.deleted&&member.trashedFolderId===id)selected.add(member.id);}return [...selected];}
module.exports={validFolderTrash,createFolderTrash,restorePlan,expandPermanentIds};
