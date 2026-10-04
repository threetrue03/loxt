"""Private CPU-only diarization and WASAPI environment shared by installer/app."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request
from downloads import emit, model_lock
from watchdog import watch_parent

VERSION = 2
SEGMENTATION_SHA256 = '220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079'
MODELS = [
    {'name': 'pyannote-segmentation.tar.bz2', 'url': 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2', 'size': 6958444, 'sha256': '24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488'},
    {'name': 'embedding.onnx', 'url': 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx', 'size': 40257283, 'sha256': 'ad4a1802485d8b34c722d2a9d04249662f2ece5d28a7a039063ca22f515a789e'},
]


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def fetch(url, filename, size, checksum):
    if filename.is_file() and filename.stat().st_size == size and digest(filename) == checksum:
        return
    part = filename.with_suffix(filename.suffix + '.part')
    offset = part.stat().st_size if part.exists() and part.stat().st_size < size else 0
    request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
    with urllib.request.urlopen(request, timeout=60) as response:
        if offset and response.status != 206: offset = 0
        with part.open('ab' if offset else 'wb') as target:
            current, percent = offset, -1
            while block := response.read(256 * 1024):
                target.write(block); current += len(block)
                value = int(current / size * 100)
                if value != percent: emit('download', name=filename.name, current=current, total=size); percent = value
            target.flush(); os.fsync(target.fileno())
    if part.stat().st_size != size or digest(part) != checksum:
        part.unlink(missing_ok=True); raise RuntimeError('화자 모델의 다운로드 무결성 검사에 실패했습니다. 다시 시도해 주세요.')
    os.replace(part, filename)


def prepare(root, runtime):
    root.mkdir(parents=True, exist_ok=True)
    with model_lock(root):
        python = root / 'venv/Scripts/python.exe'
        marker = root / 'ready.json'
        try: ready = json.loads(marker.read_text('utf8')).get('version') == VERSION
        except (OSError, ValueError): ready = False
        repair = False
        if ready and python.is_file():
            try:
                probe = subprocess.run([str(python), '-c', 'import numpy, av, sherpa_onnx, soundcard'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30, creationflags=0x08000000)
                repair = probe.returncode != 0
            except (OSError, subprocess.TimeoutExpired): repair = True
            if repair: ready = False
        if not ready or not python.is_file():
            emit('phase', phase='installing', message='화자 분석·출력 장치 엔진 준비 중')
            base = root / 'python-base'
            if not (base / 'sorinote-runtime.json').is_file():
                shutil.copytree(runtime, base, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))
            commands = [[str(base / 'python.exe'), '-m', 'venv', str(root / 'venv')],
                        [str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', *(['--force-reinstall'] if repair else []), '-r', str(Path(__file__).with_name('requirements-auxiliary.txt'))]]
            for command in commands:
                owned = [command[0], str(Path(__file__).with_name('owned_process.py')), '--owner', str(os.getpid()), *command[1:]]
                completed = subprocess.run(owned, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf8', errors='replace', creationflags=0x08000000)
                if completed.returncode: raise RuntimeError(completed.stdout[-2500:])
        models = root / 'models'; models.mkdir(exist_ok=True)
        for entry in MODELS:
            emit('phase', phase='downloading', message='화자 모델 다운로드 중')
            filename = models / entry['name']; fetch(entry['url'], filename, entry['size'], entry['sha256'])
            if filename.suffix == '.bz2' and (not (models / 'segmentation.onnx').is_file() or digest(models / 'segmentation.onnx') != SEGMENTATION_SHA256):
                with tarfile.open(filename) as archive:
                    member = next(item for item in archive.getmembers() if item.isfile() and Path(item.name).name == 'model.onnx')
                    with archive.extractfile(member) as source, (models / 'segmentation.onnx.tmp').open('wb') as target: shutil.copyfileobj(source, target)
                    for name in ['LICENSE', 'README.md']:
                        notice = next(item for item in archive.getmembers() if item.isfile() and Path(item.name).name == name)
                        (models / ('segmentation-' + name)).write_bytes(archive.extractfile(notice).read())
                os.replace(models / 'segmentation.onnx.tmp', models / 'segmentation.onnx')
        if len(MODELS) != 2: raise RuntimeError('화자 모델 설치 정보를 확인하지 못했습니다.')
        if not ready:
            emit('phase', phase='checking', message='화자 모델 실행 확인 중')
            completed = subprocess.run([str(python), str(Path(__file__).with_name('diarize_file.py')), '--probe', '--models', str(models), '--parent-pid', str(os.getpid())], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf8', errors='replace', timeout=60, creationflags=0x08000000)
            if completed.returncode: raise RuntimeError('화자 모델 실행 검사 실패: ' + completed.stdout[-1500:])
        temporary = marker.with_suffix('.tmp'); temporary.write_text(json.dumps({'version': VERSION}), encoding='utf8'); os.replace(temporary, marker)
        emit('ready')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--root', type=Path, required=True); parser.add_argument('--runtime', type=Path, required=True); parser.add_argument('--parent-pid', type=int, default=0)
    args = parser.parse_args(); watch_parent(args.parent_pid)
    try: prepare(args.root, args.runtime)
    except Exception as error: emit('error', message=str(error)); raise SystemExit(1)
