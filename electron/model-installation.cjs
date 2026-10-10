const fs = require('node:fs/promises'), path = require('node:path');
const { MODELS } = require('./transcription-config.cjs');
async function exists(file) { try { await fs.lstat(file); return true; } catch(error) { if(error.code==='ENOENT')return false;throw error; } }
async function recoverInstallation(root) {
  await recoverInstaller(root);
  const journal = path.join(root,'model-install-journal.json');
  let transaction;
  try { transaction=JSON.parse(await fs.readFile(journal,'utf8')); } catch(error) { if(error.code==='ENOENT')return;throw Error('이전 모델 설치 기록을 읽지 못했습니다. 모델 파일은 보존합니다.'); }
  const id=transaction.id;
  if(transaction.version!==1 || !(MODELS.some(model=>model.id===id)||/^store-[a-f0-9]{24}$/.test(id||'')) || !/^[a-f0-9]{40}$/.test(transaction.revision||'') || transaction.stage!=='stage-'+id || !new RegExp('^backup-'+id+'-[a-f0-9-]{36}$').test(transaction.backup||'')) throw Error('이전 모델 설치 경로를 확인해 주세요. 모델 파일은 보존합니다.');
  const models=path.resolve(root,'models'), target=path.join(models,id), stage=path.join(models,transaction.stage), backup=path.join(models,transaction.backup);
  for(const file of [models,target,stage,backup]) if(await exists(file) && (await fs.lstat(file)).isSymbolicLink())throw Error('모델 복구 경로가 연결된 폴더입니다. 파일은 보존합니다.');
  let registry=[];
  try{registry=JSON.parse(await fs.readFile(path.join(root,'store-models.json'),'utf8'));if(!Array.isArray(registry))throw Error('invalid');}catch(error){if(error.code!=='ENOENT')throw Error('모델 목록을 확인한 뒤 설치를 복구해 주세요. 파일은 보존합니다.');}
  const committed=registry.some(model=>model.id===id&&model.revision===transaction.revision);
  if(committed) {
    if(!await exists(target))throw Error('설치된 모델 경로를 확인해 주세요. 백업은 보존합니다.');
    if(await exists(backup) && path.dirname(backup)===models)await fs.rm(backup,{recursive:true,force:true});
  } else if(await exists(backup)) {
    if(await exists(target)) {
      if(await exists(stage))throw Error('모델 설치 복구에 중복 경로가 있습니다. 파일은 모두 보존합니다.');
      await fs.rename(target,stage);
    }
    await fs.rename(backup,target);
  } else if(!await exists(stage)&&await exists(target)) await fs.rename(target,stage);
  await fs.unlink(journal);
}
async function recoverInstaller(root) {
  const models=path.resolve(root,'models'), journal=path.join(models,'installer-model-journal.json');
  if(await exists(models)&&(await fs.lstat(models)).isSymbolicLink())throw Error('모델 복구 폴더가 연결된 경로입니다. 파일은 보존합니다.');
  if(await exists(journal)&&(await fs.lstat(journal)).isSymbolicLink())throw Error('모델 복구 기록을 확인해 주세요. 파일은 보존합니다.');
  let value;
  try{value=JSON.parse(await fs.readFile(journal,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw Error('설치 프로그램의 모델 복구 기록을 읽지 못했습니다. 파일은 보존합니다.');}
  const id=value.id;
  if(value.version!==1||!/^(tiny|base|small|medium|large-v3-turbo|large-v3)$/.test(id||'')||value.stage!=='.installer-stage-'+id||value.backup!=='.installer-backup-'+id||typeof value.hadTarget!=='boolean'||!['staged','committed'].includes(value.state))throw Error('모델 복구 위치를 확인해 주세요. 파일은 보존합니다.');
  const [target,stage,backup]=[id,value.stage,value.backup].map(name=>path.join(models,name));
  for(const file of [target,stage,backup])if(path.dirname(file)!==models||await exists(file)&&(await fs.lstat(file)).isSymbolicLink())throw Error('모델 복구 위치가 연결된 경로입니다. 파일은 보존합니다.');
  if(value.state==='committed'){
    if(!await exists(target)||(await fs.lstat(target)).isDirectory()===false)throw Error('완료된 모델을 찾지 못했습니다. 백업은 보존합니다.');
    if(await exists(backup))await fs.rm(backup,{recursive:true,force:true});
  }else if(await exists(backup)){
    if(await exists(target)){if(await exists(stage))throw Error('모델 복구 위치가 중복됩니다. 파일은 모두 보존합니다.');await fs.rename(target,stage);}
    await fs.rename(backup,target);
  }else if(!value.hadTarget&&await exists(target)&&!await exists(stage))await fs.rename(target,stage);
  else if(value.hadTarget&&!await exists(target))throw Error('이전 모델을 찾지 못했습니다. 복구 기록과 남은 파일은 보존합니다.');
  await fs.unlink(journal);
}
module.exports={recoverInstallation,recoverInstaller};
