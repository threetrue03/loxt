"""Pinned model plans, offline verification and recoverable directory commits."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil

MANIFEST = 'verified-model.json'
JOURNAL = 'installer-model-journal.json'


def save_json(path, value):
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w', encoding='utf8') as target:
        json.dump(value, target, ensure_ascii=False)
        target.flush()
        os.fsync(target.fileno())
    os.replace(temporary, path)


def checked_path(root, name):
    if Path(name).name != name or not name or name in ['.', '..']:
        raise ValueError('모델 저장 경로가 올바르지 않습니다.')
    path = root / name
    if path.is_symlink() or path.resolve().parent != root.resolve():
        raise ValueError('연결된 모델 저장 위치는 사용할 수 없습니다.')
    return path


def file_matches(path, item):
    if path.is_symlink() or not path.is_file() or path.stat().st_size != item['size']:
        return False
    with path.open('rb') as source:
        if len(item['hash']) == 64:
            actual = hashlib.file_digest(source, 'sha256').hexdigest()
        else:
            digest = hashlib.sha1(f"blob {item['size']}\0".encode())
            for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
                digest.update(block)
            actual = digest.hexdigest()
    return actual == item['hash']


def verified_plan(root, repo=None, revision=None):
    from store_download import validate_plan
    try:
        plan = validate_plan(json.loads((root / MANIFEST).read_text('utf8')))
        if (repo and plan['repo'] != repo) or (revision and plan['revision'] != revision):
            return None
        return plan if all(file_matches(root / item['name'], item) for item in plan['files']) else None
    except (OSError, ValueError, KeyError, TypeError):
        return None


def recover(root):
    journal_path = root / JOURNAL
    if not journal_path.exists():
        return
    value = json.loads(journal_path.read_text('utf8'))
    name = value.get('id', '')
    if value.get('version') != 1 or not re.fullmatch(r'tiny|base|small|medium|large-v3-turbo|large-v3', name):
        raise ValueError('모델 복구 기록이 올바르지 않습니다.')
    if value.get('stage') != '.installer-stage-' + name or value.get('backup') != '.installer-backup-' + name:
        raise ValueError('모델 복구 위치가 올바르지 않습니다.')
    target, stage, backup = [checked_path(root, value[key]) for key in ['id', 'stage', 'backup']]
    # Before the committed marker, restore the complete old directory. Keep the
    # downloaded stage for retry; never mix its files into the old model.
    if value.get('state') == 'committed':
        if not target.is_dir():
            raise ValueError('완료된 모델 파일을 찾지 못했습니다.')
        if backup.exists():
            shutil.rmtree(backup)
    elif backup.exists():
        if target.exists():
            if stage.exists():
                raise ValueError('모델 복구 위치가 중복됩니다.')
            os.replace(target, stage)
        os.replace(backup, target)
    elif not value.get('hadTarget') and target.exists() and not stage.exists():
        os.replace(target, stage)
    journal_path.unlink()


def install(root, name):
    import downloads
    from store_download import install as install_plan, validate_plan, ALLOWED
    root = Path(root)
    parent = root.parent
    parent.mkdir(parents=True, exist_ok=True)
    if root.name != name:
        raise ValueError('모델 이름과 저장 경로가 다릅니다.')
    with downloads.model_lock(parent):
        recover(parent)
        checked_path(parent, name)
        registry_path = parent.parent / 'store-models.json'
        try:
            registry = json.loads(registry_path.read_text('utf8'))
        except FileNotFoundError:
            registry = []
        if not isinstance(registry, list):
            raise ValueError('스토어 모델 목록을 확인해 주세요.')
        record = next((item for item in registry if isinstance(item, dict) and item.get('id') == name), None)
        repo, revision = (record.get('repo'), record.get('revision')) if record else (downloads.MODELS[name], None)
        if record and (not repo or not revision):
            raise ValueError('설치된 모델의 제공처와 버전을 확인해 주세요.')
        downloads.emit('phase', phase='checking', message='설치된 모델의 무결성 확인 중')
        plan = verified_plan(root, repo, revision)
        if plan:
            downloads.emit('model', revision=plan['revision'], reused=True)
            return
        # An older installation has no manifest: fetch its pinned revision, never
        # replace a store selection with the default provider's newest revision.
        suffix = '/revision/' + revision if revision and re.fullmatch(r'[a-f0-9]{40}', revision) else ''
        if record and not suffix:
            raise ValueError('설치된 모델 버전을 확인해 주세요.')
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,95}/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', repo):
            raise ValueError('모델 제공처를 확인해 주세요.')
        metadata = downloads.fetch_json(f'https://huggingface.co/api/models/{repo}{suffix}?blobs=true')
        resolved = metadata['sha']
        if revision and resolved != revision:
            raise ValueError('요청한 모델 버전과 다운로드 정보가 다릅니다.')
        files = []
        for item in metadata['siblings']:
            filename = item['rfilename']
            if filename in ALLOWED:
                lfs = item.get('lfs') or {}
                files.append({'name': filename, 'size': lfs.get('size', item.get('size')),
                              'hash': lfs.get('sha256', item.get('blobId'))})
        plan = validate_plan({'repo': repo, 'revision': resolved, 'files': files})
        # Manifest migration can be fully offline on later runs. Hash all files
        # before recording success; older unknown files are never blindly reused.
        if all(file_matches(root / item['name'], item) for item in files):
            save_json(root / MANIFEST, plan)
            downloads.emit('model', revision=resolved, reused=True)
            return
        stage = checked_path(parent, '.installer-stage-' + name)
        backup = checked_path(parent, '.installer-backup-' + name)
        stage.mkdir(exist_ok=True)
        # Retain the old complete model, and resume matching staged downloads.
        required = sum(item['size'] for item in files if not file_matches(stage / item['name'], item))
        downloads.ensure_space(stage, required)
        install_plan(plan, stage)
        if not verified_plan(stage, repo, resolved):
            raise ValueError('설치할 모델의 전체 무결성 검사가 실패했습니다.')
        journal = {'version': 1, 'id': name, 'stage': stage.name, 'backup': backup.name,
                   'hadTarget': root.exists(), 'state': 'staged'}
        if backup.exists():
            raise ValueError('이전 모델 복구 파일을 먼저 확인해 주세요.')
        save_json(parent / JOURNAL, journal)
        try:
            if root.exists():
                os.replace(root, backup)
            os.replace(stage, root)
            save_json(parent / JOURNAL, {**journal, 'state': 'committed'})
        except BaseException:
            recover(parent)
            raise
        recover(parent)
        downloads.emit('model', revision=resolved, reused=False)
