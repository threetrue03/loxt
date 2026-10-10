"""Only pinned, hash-checked model data; repository code is never downloaded."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import urllib.request
from downloads import download, emit, model_lock
from watchdog import watch_parent

ALLOWED = {'model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt', 'vocabulary.json', 'preprocessor_config.json', 'README.md', 'LICENSE', 'LICENSE.txt', 'LICENSE.md'}


def validate_plan(plan):
    if not isinstance(plan, dict) or not isinstance(plan.get('repo'), str) or not isinstance(plan.get('revision'), str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,95}/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', plan.get('repo', '')) or not re.fullmatch(r'[a-f0-9]{40}', plan.get('revision', '')):
        raise ValueError('모델 제공처와 버전을 확인해 주세요.')
    files = plan.get('files', [])
    if not isinstance(files, list) or len(files) > len(ALLOWED):
        raise ValueError('모델 파일 목록을 확인해 주세요.')
    names = set()
    for item in files:
        if not isinstance(item, dict) or not isinstance(item.get('name'), str) or item.get('name') not in ALLOWED or item['name'] in names or not isinstance(item.get('size'), int) or isinstance(item['size'], bool) or not 0 < item['size'] <= 20_000_000_000 or not isinstance(item.get('hash'), str) or not re.fullmatch(r'[a-f0-9]{40}|[a-f0-9]{64}', item.get('hash', '')):
            raise ValueError('모델 파일의 크기와 무결성 정보를 확인해 주세요.')
        if item['name'] != 'model.bin' and item['size'] > 5_000_000:
            raise ValueError('모델 설정 파일이 너무 큽니다.')
        if item['name'] == 'model.bin' and len(item['hash']) != 64:
            raise ValueError('모델 바이너리의 SHA256 검사를 확인해 주세요.')
        names.add(item['name'])
    if not {'model.bin', 'config.json', 'tokenizer.json'}.issubset(names):
        raise ValueError('필수 모델 파일이 없습니다.')
    return plan


def install(plan, root):
    validate_plan(plan)
    root.mkdir(parents=True, exist_ok=True)
    if root.is_symlink() or any(child.is_symlink() for child in root.iterdir()):
        raise ValueError('모델 저장 위치를 확인해 주세요.')
    total = sum(item['size'] for item in plan['files'])
    finished = 0
    import downloads
    original = downloads.emit
    def progress(kind, **data):
        if kind == 'download':
            original(kind, **{**data, 'current': finished + data['current'], 'total': total})
        else:
            original(kind, **data)
    downloads.emit = progress
    try:
        with model_lock(root):
            for item in sorted(plan['files'], key=lambda x: x['name'] == 'model.bin'):
                name, expected = item['name'], item['hash']
                target = root / name
                if target.is_symlink():
                    raise ValueError('모델 저장 파일을 확인해 주세요.')
                url = f"https://huggingface.co/{plan['repo']}/resolve/{plan['revision']}/{name}"
                if len(expected) == 64:
                    download(url, target, item['size'], expected, phase='downloading', message='모델 파일 다운로드 중')
                else:
                    from installer_models import file_matches
                    if not file_matches(target, item):
                        with urllib.request.urlopen(url, timeout=30) as response:
                            content = response.read(item['size'] + 1)
                        actual = hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest()
                        if len(content) != item['size'] or actual != expected:
                            raise ValueError('모델 설정 파일의 무결성 검사가 실패했습니다.')
                        temporary = target.with_name(name + '.tmp')
                        temporary.write_bytes(content)
                        temporary.replace(target)
                finished += item['size']
                original('download', current=finished, total=total, unit='B')
            config = json.loads((root / 'config.json').read_text('utf8'))
            tokenizer = json.loads((root / 'tokenizer.json').read_text('utf8'))
            if not isinstance(config, dict) or not isinstance(tokenizer, dict) or not any(key in config for key in ['alignment_heads', 'suppress_ids', 'suppress_ids_begin']):
                raise ValueError('Whisper 전용 CTranslate2 모델 설정을 확인하지 못했습니다.')
            from installer_models import MANIFEST, save_json
            save_json(root / MANIFEST, plan)
            emit('download-complete', revision=plan['revision'])
    finally:
        downloads.emit = original


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--parent-pid', type=int, default=0)
    args = parser.parse_args()
    watch_parent(args.parent_pid)
    try:
        install(json.loads(args.plan.read_text('utf8')), args.root)
    except Exception as error:
        emit('error', message=str(error))
        raise SystemExit(1)
