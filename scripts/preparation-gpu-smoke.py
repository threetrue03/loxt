"""Fresh isolated GPU preparation using existing, verified local wheel caches."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

workspace = Path(__file__).resolve().parents[1]
profile = Path(tempfile.mkdtemp(prefix='prepared-gpu-', dir=workspace / 'test-results'))
root = profile / 'transcription'
root.mkdir()
# Only read the installed wheel cache; all installation writes target the new profile.
wheel_cache = Path(os.environ['APPDATA']) / 'sorinote-desktop/transcription/wheels'
shutil.copytree(wheel_cache, root / 'wheels')
model = workspace / 'test-results/models-e9cKq7/transcription/models/small'
shutil.copytree(model, root / 'models/small')
environment = {**os.environ, 'PYTHONUTF8': '1'}
subprocess.run([str(workspace / '.runtime/python/python.exe'), str(workspace / 'python/engine_prepare.py'),
                '--root', str(root), '--runtime', str(workspace / '.runtime/python'), '--models', 'small',
                '--device', 'cuda', '--parent-pid', str(os.getpid())], check=True, env=environment)
prepared = json.loads((root / 'prepared.json').read_text('utf8'))
assert 'small:cuda:int8_float16' in prepared['validations']
assert json.loads((root / 'settings.json').read_text('utf8')) == {'model': 'small', 'device': 'cuda'}
print('PASS: fresh private GPU engine installed and real RTX 2060 inference validated', flush=True)
print('TEST_PROFILE', profile, flush=True)
