"""Tiny isolated installer regression fixtures; no network/model/registry changes."""
import hashlib
import io
import json
import os
import re
from pathlib import Path
import shutil
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

PROJECT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PROJECT/'python'))
sys.dont_write_bytecode=True
import downloads, installer_models, install_models, engine_prepare
from installer_progress import InstallerProgress
from store_download import validate_plan
ROOT=PROJECT/'test-results/implementation-2.8.0/installer'
ROOT.mkdir(parents=True,exist_ok=True)
PAYLOAD={'config.json':b'{"alignment_heads":[]}', 'tokenizer.json':b'{}', 'model.bin':b'NEW'}
REPO='dropbox-dash/faster-whisper-large-v3-turbo'
REVISION='a'*40
PLAN={'repo':REPO,'revision':REVISION,'files':[{'name':k,'size':len(v),'hash':hashlib.sha256(v).hexdigest() if k=='model.bin' else hashlib.sha1(f'blob {len(v)}\0'.encode()+v).hexdigest()} for k,v in PAYLOAD.items()]}
META={'sha':REVISION,'siblings':[{'rfilename':v['name'],'size':v['size'],'blobId':v['hash'],**({'lfs':{'size':v['size'],'sha256':v['hash']}} if v['name']=='model.bin' else {})} for v in PLAN['files']]}
class Response(io.BytesIO):
 status=206
 def __init__(self,body):super().__init__(body);self.headers={'Content-Range':f'bytes 0-{len(body)-1}/{len(body)}'}

class InstallerTests(unittest.TestCase):
 def setUp(self):
  self.root=Path(tempfile.mkdtemp(prefix='fixture-',dir=ROOT)); self.models=self.root/'models';self.models.mkdir()
  self.target=self.models/'large-v3-turbo'; self.target.mkdir()
  for n in PAYLOAD:(self.target/n).write_bytes(b'OLD')
  (self.root/'store-models.json').write_text(json.dumps([{'id':self.target.name,'repo':REPO,'revision':REVISION,'tag':'my model'}]),encoding='utf8')
  self.events=[];self.event_patch=patch.object(downloads,'emit',lambda kind,**v:self.events.append((kind,v)));self.event_patch.start()
 def tearDown(self):self.event_patch.stop();shutil.rmtree(self.root)
 def network(self,url,*a,**k):
  address=url.full_url if hasattr(url,'full_url') else url
  self.assertIn(REPO,address);self.assertIn(REVISION,address)
  return Response(PAYLOAD[address.rsplit('/',1)[1]])
 def ready(self):
  self.target.mkdir(exist_ok=True)
  for name,data in PAYLOAD.items():(self.target/name).write_bytes(data)
  installer_models.save_json(self.target/installer_models.MANIFEST,PLAN)
 def test_pinned_install_and_registry_preserved(self):
  registry=(self.root/'store-models.json').read_bytes();requests=[]
  def metadata(url):requests.append(url);return META
  with patch.object(downloads,'fetch_json',metadata),patch.object(downloads.urllib.request,'urlopen',self.network):downloads.model(self.target,self.target.name)
  self.assertEqual(requests,[f'https://huggingface.co/api/models/{REPO}/revision/{REVISION}?blobs=true'])
  self.assertEqual((self.root/'store-models.json').read_bytes(),registry)
  self.assertEqual((self.target/'model.bin').read_bytes(),b'NEW')
  self.assertIsNotNone(installer_models.verified_plan(self.target,REPO,REVISION))
 def test_offline_verified_reuse_no_metadata(self):
  self.ready()
  with patch.object(downloads,'fetch_json',side_effect=AssertionError('network used')),patch.object(downloads.urllib.request,'urlopen',side_effect=AssertionError('network used')):downloads.model(self.target,self.target.name)
  self.assertTrue(any(k=='model' and v.get('reused') for k,v in self.events))
 def test_corrupt_manifest_and_file_never_report_verified(self):
  self.ready();(self.target/'model.bin').write_bytes(b'BAD')
  self.assertIsNone(installer_models.verified_plan(self.target,REPO,REVISION))
  (self.target/installer_models.MANIFEST).write_text('[]')
  self.assertIsNone(installer_models.verified_plan(self.target,REPO,REVISION))
  with patch.object(downloads,'fetch_json',side_effect=ConnectionError('offline')):
   with self.assertRaises(ConnectionError):downloads.model(self.target,self.target.name)
  self.assertFalse(any(k=='model' and v.get('reused') for k,v in self.events))
 def test_malformed_plan_rejected_cleanly(self):
  for value in [[],{'repo':[],'revision':REVISION},{**PLAN,'files':[None]},{**PLAN,'files':[{**PLAN['files'][0],'hash':[]}]}]:
   with self.assertRaises(ValueError):validate_plan(value)
 def test_legacy_manifest_migration(self):
  for n,b in PAYLOAD.items():(self.target/n).write_bytes(b)
  with patch.object(downloads,'fetch_json',return_value=META),patch.object(downloads.urllib.request,'urlopen',side_effect=AssertionError('files downloaded')):downloads.model(self.target,self.target.name)
  self.assertTrue((self.target/installer_models.MANIFEST).is_file())
 def test_download_failure_keeps_complete_old_model(self):
  def failure(url,*a,**k):
   if str(url).endswith('tokenizer.json'):raise ConnectionError('offline')
   return self.network(url,*a,**k)
  with patch.object(downloads,'fetch_json',return_value=META),patch.object(downloads.urllib.request,'urlopen',failure):
   with self.assertRaises(ConnectionError):downloads.model(self.target,self.target.name)
  for n in PAYLOAD:self.assertEqual((self.target/n).read_bytes(),b'OLD')
 def test_commit_rename_failure_rolls_back(self):
  original=os.replace
  def replace(source,target):
   if Path(source).name=='.installer-stage-large-v3-turbo' and Path(target)==self.target:raise PermissionError('in use')
   return original(source,target)
  with patch.object(downloads,'fetch_json',return_value=META),patch.object(downloads.urllib.request,'urlopen',self.network),patch.object(installer_models.os,'replace',replace):
   with self.assertRaises(PermissionError):downloads.model(self.target,self.target.name)
  for n in PAYLOAD:self.assertEqual((self.target/n).read_bytes(),b'OLD')
  self.assertFalse((self.models/installer_models.JOURNAL).exists())
 def journal(self,state='staged',had=True):
  installer_models.save_json(self.models/installer_models.JOURNAL,{'version':1,'id':self.target.name,'stage':'.installer-stage-'+self.target.name,'backup':'.installer-backup-'+self.target.name,'hadTarget':had,'state':state})
 def test_interrupted_commit_restores_old(self):
  backup=self.models/('.installer-backup-'+self.target.name);os.replace(self.target,backup)
  self.target.mkdir();(self.target/'model.bin').write_bytes(b'NEW');self.journal()
  installer_models.recover(self.models)
  self.assertEqual((self.target/'model.bin').read_bytes(),b'OLD')
  self.assertEqual((self.models/('.installer-stage-'+self.target.name)/'model.bin').read_bytes(),b'NEW')
 def test_committed_cleanup_preserves_new(self):
  backup=self.models/('.installer-backup-'+self.target.name);os.replace(self.target,backup)
  self.ready();self.journal('committed');installer_models.recover(self.models)
  self.assertEqual((self.target/'model.bin').read_bytes(),b'NEW');self.assertFalse(backup.exists())
 def test_recovery_path_injection_rejected(self):
  self.journal();p=self.models/installer_models.JOURNAL;v=json.loads(p.read_text());v['backup']='../../private';p.write_text(json.dumps(v))
  with self.assertRaises(ValueError):installer_models.recover(self.models)
  self.assertEqual((self.target/'model.bin').read_bytes(),b'OLD')
 def test_low_space_no_model_change(self):
  with patch.object(downloads,'fetch_json',return_value=META),patch.object(downloads.shutil,'disk_usage',return_value=shutil._ntuple_diskusage(1,1,0)):
   with self.assertRaises(OSError) as error:downloads.model(self.target,self.target.name)
  self.assertEqual(error.exception.errno,28)
  self.assertEqual((self.target/'model.bin').read_bytes(),b'OLD')
 def test_retry_events_and_no_final_sleep(self):
  with patch.object(downloads.urllib.request,'urlopen',side_effect=ConnectionError('offline')) as request,patch.object(downloads.time,'sleep') as sleep:
   with self.assertRaises(ConnectionError):downloads.download('https://example.invalid/data',self.root/'file',3,hashlib.sha256(b'NEW').hexdigest())
  self.assertEqual(request.call_count,5);self.assertEqual([c.args[0] for c in sleep.call_args_list],[1,2,3,4]);self.assertEqual(len([1 for k,v in self.events if k=='retry']),4)
 def test_unmeasured_progress_is_marquee(self):
  progress=InstallerProgress.__new__(InstallerProgress);progress.prepare=True;progress.model='small';progress.language='en';values=[];progress._set=lambda c,v:values.append((c,v))
  progress.event('engine-start',message='loading');self.assertIn((1803,None),values)
  progress.event('download',current=42,total=100);self.assertIn((1803,42),values)
  progress.event('validation-start',model='small',device='cpu',index=1,total=1);self.assertEqual(values[-1],(1803,None))
 def test_initial_permission_error_publishes_result_and_reason(self):
  result=self.root/'prepare-result.txt';original=Path.mkdir
  def denied(path,*a,**k):
   if path==self.models:raise PermissionError('fixture denied')
   return original(path,*a,**k)
  with patch.object(Path,'mkdir',denied),patch.object(install_models,'watch_cancel'),patch.object(install_models,'watch_parent'):
   code=install_models.main(['--root',str(self.models),'--models','small','--installer-log','--installer-result',str(result)])
  self.assertEqual(code,1);self.assertEqual(result.read_text(),'1');self.assertIn('권한',result.with_suffix('.error.txt').read_text('utf-16-le'));self.assertTrue(result.with_suffix('.log').is_file())
  self.assertIn('권한',result.with_suffix('.summary.txt').read_text('utf-16-le'))
 def test_result_publication_failure_returns_error_without_crashing(self):
  result=self.root/'prepare-result.txt'
  with patch.object(install_models,'publish_result',side_effect=PermissionError('fixture result denied')),patch.object(install_models,'model'),patch.object(install_models,'watch_cancel'),patch.object(install_models,'watch_parent'),patch.object(sys,'stderr',io.StringIO()) as error:
   code=install_models.main(['--root',str(self.models),'--models','small','--installer-result',str(result)])
  self.assertEqual(code,1);self.assertIn('Result publication failed',error.getvalue())
 def test_lock_wait_emits_activity_once(self):
  with patch.object(downloads.msvcrt,'locking',side_effect=[OSError('busy'),OSError('busy'),None,None]),patch.object(downloads.time,'sleep'):
   with downloads.model_lock(self.models):pass
  self.assertEqual(len([1 for k,v in self.events if k=='phase' and v.get('phase')=='waiting']),1)
 def test_fingerprint_detects_model_change(self):
  a=engine_prepare.model_fingerprint(self.target,'env1');(self.target/'model.bin').write_bytes(b'changed')
  self.assertNotEqual(a,engine_prepare.model_fingerprint(self.target,'env1'));self.assertNotEqual(a,engine_prepare.model_fingerprint(self.target,'env2'))
 def test_environment_reuse_and_deep_repair(self):
  runtime=self.root/'runtime';runtime.mkdir();(runtime/'sorinote-runtime.json').write_text('{}');(runtime/'python.exe').write_bytes(b'fixture')
  calls=[];events=[]
  def run(python,args,notify,protocol=False):
   calls.append(list(map(str,args)))
   if args[0]=='-m' and args[1]=='venv':
    exe=self.root/'venv/Scripts/python.exe';exe.parent.mkdir(parents=True,exist_ok=True);exe.write_bytes(b'fixture')
   if 'probe' in args:return [('probe',{'compute_types':['int8']})]
   if 'prepare' in args:return [('prepared',{})]
   return []
  notify=lambda k,**d:events.append((k,d))
  with patch.object(engine_prepare,'run',run),patch.object(engine_prepare,'hardware',return_value=None),patch.object(engine_prepare,'environment_healthy',return_value=True):
   engine_prepare.prepare(self.root,runtime,['large-v3-turbo'],'cpu',notify,models_verified=True,prepare_auxiliary=False)
   first=len(calls);calls.clear();engine_prepare.prepare(self.root,runtime,['large-v3-turbo'],'cpu',notify,models_verified=True,prepare_auxiliary=False)
   self.assertEqual(calls,[]);self.assertTrue(any(k=='model-ready' and d.get('reused') for k,d in events))
   engine_prepare.prepare(self.root,runtime,['large-v3-turbo'],'cpu',notify,models_verified=True,prepare_auxiliary=False,deep_check=True)
   self.assertGreaterEqual(len(calls),first)
 def test_error_categories(self):
  self.assertIn('drive',install_models.failure_message(OSError(28,'full'),'en'))
  self.assertIn('permissions',install_models.failure_message(PermissionError('denied'),'en'))
  self.assertIn('network',install_models.failure_message(ConnectionError('offline'),'en'))
 def test_custom_language_references_are_complete(self):
  language=(PROJECT/'build/installer-language.nsh').read_text('utf8')
  definitions={}
  for name,code in re.findall(r'^LangString (Loxt\w+) (\d+) ',language,re.M):definitions.setdefault(name,set()).add(code)
  references=set()
  for filename in ['installer.nsh','preparation-page.nsh','maintenance.nsh','remove-environment.nsh']:
   references.update(re.findall(r'\$\((Loxt\w+)\)',(PROJECT/'build'/filename).read_text('utf8')))
  self.assertTrue(references.issubset(definitions))
  self.assertTrue(all(value=={'1042','1033'} for value in definitions.values()))

if __name__=='__main__':unittest.main(verbosity=2)
