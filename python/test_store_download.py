import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from store_download import validate_plan, install

class StoreDownloadTests(unittest.TestCase):
    def setUp(self):
        self.contents={'config.json':b'{"suppress_ids":[]}','tokenizer.json':b'{}','model.bin':b'verified binary'}
        self.plan={'repo':'provider/faster-whisper-test','revision':'a'*40,'files':[{'name':name,'size':len(data),'hash':hashlib.sha256(data).hexdigest() if name=='model.bin' else hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()} for name,data in self.contents.items()]}

    def test_reject_code_paths_unpinned_revision_and_missing_checksums(self):
        for patcher in [lambda p:p.update(revision='main'),lambda p:p['files'][0].update(name='../config.json'),lambda p:p['files'].append({'name':'custom.py','size':1,'hash':'a'*40}),lambda p:p['files'][-1].update(hash='a'*40),lambda p:p['files'][0].update(size=True)]:
            value=json.loads(json.dumps(self.plan));patcher(value)
            with self.assertRaises(ValueError):validate_plan(value)

    def test_pinned_urls_git_blob_hash_and_binary_hash_validation(self):
        urls=[]
        def open_url(url,timeout):
            urls.append(url);return io.BytesIO(self.contents[url.rsplit('/',1)[-1]])
        def binary(url,target,size,checksum,**kwargs):
            data=self.contents['model.bin'];self.assertEqual(hashlib.sha256(data).hexdigest(),checksum);target.write_bytes(data)
        test_root=Path(__file__).resolve().parent.parent / 'test-results'
        test_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=test_root) as directory,patch('store_download.urllib.request.urlopen',open_url),patch('store_download.download',binary):
            install(self.plan,Path(directory));self.assertTrue(all('/resolve/'+'a'*40+'/' in url for url in urls));self.assertEqual((Path(directory)/'model.bin').read_bytes(),self.contents['model.bin'])
            self.contents['config.json']=b'bad';
            with self.assertRaisesRegex(ValueError,'무결성'):install(self.plan,Path(directory))

if __name__=='__main__':unittest.main()
