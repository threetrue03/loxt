"""Shared installer/app preparation; persistent private Python, no system changes."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from downloads import model_lock
from watchdog import watch_parent

RESOURCES = Path(__file__).resolve().parent
MODELS = {'tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v3'}
PREFERENCES = {'cuda': ['int8_float16', 'float16', 'int8_float32', 'float32'],
               'cpu': ['int8', 'int8_float32', 'float32']}


def read_json(filename, default):
    try:
        return json.loads(filename.read_text('utf8'))
    except (OSError, ValueError):
        return default


def save_json(filename, value):
    temporary = filename.with_name(filename.name + '.tmp')
    with temporary.open('w', encoding='utf8') as target:
        json.dump(value, target, ensure_ascii=False, indent=2)
        target.flush()
        os.fsync(target.fileno())
    os.replace(temporary, filename)


def hardware():
    try:
        result = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
                                capture_output=True, text=True, timeout=15, creationflags=0x08000000)
        name, memory = result.stdout.splitlines()[0].rsplit(',', 1)
        if result.returncode == 0 and int(memory.strip()) > 0:
            return {'name': name.strip(), 'memory': int(memory.strip())}
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        pass
    return None


def selection(names, settings, requested_device, gpu, available=MODELS):
    if not names or any(name not in available for name in names):
        raise ValueError('준비할 변환 모델을 확인해 주세요.')
    valid = isinstance(settings, dict) and settings.get('model') in available and settings.get('device') in ['auto', 'cuda', 'cpu']
    preferred = 'large-v3' if gpu and gpu['memory'] >= 12000 else 'large-v3-turbo' if gpu and gpu['memory'] >= 4000 else 'small'
    chosen = dict(settings) if valid else {'model': preferred if preferred in names else names[0], 'device': 'auto'}
    if requested_device != 'auto':
        chosen['device'] = requested_device
    device = chosen['device'] if chosen['device'] != 'auto' else 'cuda' if gpu else 'cpu'
    if device == 'cuda' and not gpu:
        raise RuntimeError('NVIDIA GPU를 찾지 못했습니다. CPU를 선택하거나 드라이버를 확인한 뒤 다시 준비해 주세요.')
    return chosen, device, valid


def run(python, args, notify, protocol=False):
    # Child pip/worker processes watch this helper too, including installer closure.
    command = [str(python), str(RESOURCES / 'owned_process.py'), '--owner', str(os.getpid()), *map(str, args)]
    environment = {**os.environ, 'PYTHONUTF8': '1', 'PYTHONUNBUFFERED': '1',
                   'HF_HUB_DISABLE_TELEMETRY': '1', 'HF_HUB_DISABLE_IMPLICIT_TOKEN': '1'}
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               encoding='utf8', errors='replace', env=environment, creationflags=0x08000000)
    output, events = [], []
    for line in process.stdout:
        output.append(line.rstrip())
        output = output[-40:]
        if protocol:
            try:
                event = json.loads(line)
                kind = event.pop('type')
                events.append((kind, event))
                notify(kind, **event)
            except (ValueError, KeyError):
                pass
    if process.wait() != 0:
        failure = next((data.get('message') for kind, data in reversed(events) if kind == 'error'), None)
        if failure:
            raise RuntimeError(failure)
        raise RuntimeError('\n'.join(output)[-2000:] or '변환 환경 준비 작업이 중단됐습니다.')
    return events


def prepare(root, runtime, names, requested_device, notify, models_verified=False):
    root, runtime = root.resolve(), runtime.resolve()
    root.mkdir(parents=True, exist_ok=True)
    notify('engine-start', message='다른 변환·설치 작업을 확인하는 중')
    with model_lock(root):
        gpu = hardware()
        original = read_json(root / 'settings.json', {})
        import re
        external = read_json(root / 'external-models.json', [])
        if not isinstance(external, list) or any(not isinstance(item, dict) or not re.fullmatch(r'external-[a-f0-9-]{36}', item.get('id', '')) for item in external):
            raise ValueError('외부 모델 목록이 올바르지 않습니다.')
        available = MODELS | {item['id'] for item in external}
        settings, device, existing = selection(names, original, requested_device, gpu, available)
        # A repair must validate the user's active model too when already installed.
        active = root / 'models' / settings['model']
        if settings['model'] not in names and all((active / filename).is_file() for filename in ['model.bin', 'config.json', 'tokenizer.json']):
            names = [*names, settings['model']]
        notify('hardware', device=device, gpu=gpu, model=settings['model'])
        if not models_verified:
            from install_models import install
            builtin = [name for name in names if name in MODELS]
            if builtin:
                install(root / 'models', builtin, notify)
            for name in names:
                if name not in MODELS and not all((root / 'models' / name / filename).is_file() for filename in ['model.bin', 'config.json', 'tokenizer.json']):
                    raise RuntimeError('외부 모델 파일이 없습니다. 모델 보관함에서 다시 불러와 주세요.')
        notify('engine-start', message='앱 전용 Python 환경 준비 중')
        base = root / 'python-base-3.13.16'
        marker = runtime / 'sorinote-runtime.json'
        if not (base / 'sorinote-runtime.json').exists():
            if not marker.is_file():
                raise RuntimeError('포함된 Python 설치 정보를 확인하지 못했습니다.')
            shutil.copytree(runtime, base, dirs_exist_ok=True, ignore=shutil.ignore_patterns('sorinote-runtime.json', '__pycache__'))
            shutil.copyfile(marker, base / 'sorinote-runtime.json')
        python = root / 'venv/Scripts/python.exe'
        run(base / 'python.exe', ['-m', 'venv', root / 'venv'], notify)
        run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', 'pip==26.2.1'], notify)
        wheels = []
        if device == 'cuda':
            notify('engine-start', message='GPU 실행 라이브러리 다운로드 중')
            events = run(python, [RESOURCES / 'downloads.py', '--root', root / 'wheels', '--parent-pid', os.getpid()], notify, True)
            wheels = next((data['files'] for kind, data in events if kind == 'wheels'), [])
            if len(wheels) != 3 or any(Path(name).name != name or not name.endswith('.whl') for name in wheels):
                raise RuntimeError('GPU 설치 파일을 확인하지 못했습니다.')
        notify('engine-start', message='변환 엔진과 실행 라이브러리 설치 중')
        run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--resume-retries', '10', '--timeout', '60',
                     '--only-binary=:all:', *[root / 'wheels' / name for name in wheels], '-r',
                     RESOURCES / ('requirements.txt' if device == 'cuda' else 'requirements-cpu.txt')], notify)
        notify('engine-start', component='auxiliary', message='화자 분석·출력 장치 엔진 준비 중')
        run(base / 'python.exe', [RESOURCES / 'auxiliary_prepare.py', '--root', root / 'auxiliary', '--runtime', base, '--parent-pid', os.getpid()], notify, True)
        prepared = read_json(root / 'prepared.json', {})
        validations = prepared.get('validations', {})
        if not isinstance(validations, dict):
            validations = {}
        if prepared.get('model') == 'medium' and prepared.get('checkedAt'):
            validations.setdefault('medium:cuda:int8_float16', prepared['checkedAt'])
        for index, name in enumerate(names, 1):
            notify('validation-start', model=name, device=device, index=index, total=len(names))
            args = ['--model-dir', root / 'models' / name, '--model', name, '--device', device, '--parent-pid', os.getpid()]
            events = run(python, [RESOURCES / 'worker.py', 'probe', *args], notify, True)
            supported = next((data['compute_types'] for kind, data in events if kind == 'probe'), [])
            compute = next((value for value in PREFERENCES[device] if value in supported), None)
            if not compute:
                raise RuntimeError('이 장치에서 지원하는 연산 방식을 확인하지 못했습니다.')
            events = run(python, [RESOURCES / 'worker.py', 'prepare', *args, '--compute-type', compute, '--skip-download'], notify, True)
            if not any(kind == 'prepared' for kind, _ in events):
                raise RuntimeError('모델 실행을 확인하지 못했습니다.')
            validations[f'{name}:{device}:{compute}'] = datetime.now(timezone.utc).isoformat()
            save_json(root / 'prepared.json', {'validations': validations})
            notify('model-ready', model=name, device=device, compute_type=compute, index=index, total=len(names))
        # Existing model choice is retained; explicit device changes apply only on success.
        if not existing or requested_device != 'auto':
            save_json(root / 'settings.json', settings)
        notify('environment-ready', models=names, device=device, selected_model=settings['model'],
               selected_ready=any(key.startswith(f"{settings['model']}:{device}:") for key in validations))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--models', required=True)
    parser.add_argument('--device', choices=['auto', 'cuda', 'cpu'], default='auto')
    parser.add_argument('--parent-pid', type=int, default=0)
    args = parser.parse_args()
    watch_parent(args.parent_pid)
    from downloads import emit
    try:
        prepare(args.root, args.runtime, list(dict.fromkeys(args.models.split(','))), args.device, emit)
    except Exception as error:
        emit('error', message=str(error))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
