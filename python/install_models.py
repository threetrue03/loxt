"""Model-only installation shared by NSIS and desktop; no system Python changes."""
import argparse
from pathlib import Path
import sys
import os
import urllib.error
import threading
import subprocess
from downloads import model
from watchdog import watch_parent

PRESETS = {"small": "저성능", "large-v3-turbo": "표준", "large-v3": "고성능"}


def selected_models(value):
    names = value.split(',')
    from downloads import MODELS
    if not names or any(name not in MODELS for name in names):
        raise ValueError('지원하는 Whisper 모델을 선택해 주세요.')
    return list(dict.fromkeys(names))


def install(root, names, notify):
    root.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(names, 1):
        notify('model-start', model=name, index=index, total=len(names))
        model(root / name, name)
        notify('model-installed', model=name, index=index, total=len(names))


def failure_message(error, language='ko'):
    english = language == 'en'
    if isinstance(error, PermissionError) or getattr(error, 'winerror', 0) == 5:
        advice = 'Cannot write to the model folder. Check folder permissions and security software, then retry.' if english else '모델 폴더에 저장할 권한이 없습니다. 폴더 권한과 보안 프로그램을 확인한 뒤 다시 시도하세요.'
    elif getattr(error, 'errno', 0) == 28 or getattr(error, 'winerror', 0) == 112:
        advice = 'The model/environment drive is full. Free space on the folder shown below; changing the app install folder will not move models.' if english else '모델·변환 환경 저장 드라이브의 공간이 부족합니다. 아래 경로의 드라이브 공간을 확보하세요. 앱 설치 위치만 바꿔도 모델 위치는 바뀌지 않습니다.'
    elif isinstance(error, (urllib.error.URLError, TimeoutError, ConnectionError)):
        advice = 'Download failed. Check the network/proxy and retry, or prepare later. Verified files and resumed downloads are kept.' if english else '다운로드 연결에 실패했습니다. 인터넷·프록시를 확인하고 다시 시도하거나 나중에 준비하세요. 검증된 파일과 이어받기 자료는 유지됩니다.'
    else:
        advice = 'Preparation failed. See the details/log and retry, or prepare later in the app. Existing complete models are preserved.' if english else '준비를 완료하지 못했습니다. 상세 원인·로그를 확인한 뒤 다시 시도하거나 앱에서 나중에 준비하세요. 기존의 완전한 모델은 유지됩니다.'
    return advice + '\r\n\r\n' + str(error)[:1800]


def publish_result(filename, value):
    if filename:
        temporary = filename.with_suffix('.tmp')
        temporary.write_text(str(value), encoding='ascii')
        temporary.replace(filename)


def watch_cancel(filename, finished):
    if not filename:
        return
    def wait():
        while not finished.wait(0.1):
            if filename.with_suffix('.cancel').exists():
                # This helper owns the tree. No user app or unrelated process is
                # terminated; child watchers also enforce parent ownership.
                publish_result(filename, 2)
                if os.name == 'nt':
                    try:
                        subprocess.run([os.path.join(os.environ['SystemRoot'], 'System32', 'taskkill.exe'), '/PID', str(os.getpid()), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000, timeout=10)
                    except (OSError, KeyError, subprocess.TimeoutExpired):
                        pass
                os._exit(2)
    threading.Thread(target=wait, daemon=True).start()


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--models', required=True)
    parser.add_argument('--parent-pid', type=int, default=0)
    parser.add_argument('--installer-log', action='store_true')
    parser.add_argument('--installer-window', type=int, default=0)
    parser.add_argument('--installer-models-only', action='store_true')
    parser.add_argument('--installer-result', type=Path)
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--runtime', type=Path)
    parser.add_argument('--device', choices=['auto', 'cuda', 'cpu'], default='auto')
    parser.add_argument('--language', choices=['ko', 'en'], default='ko')
    parser.add_argument('--deep-check', action='store_true')
    args = parser.parse_args(argv)
    import downloads
    original_out, original_err, original_emit = sys.stdout, sys.stderr, downloads.emit
    log = progress = None
    finished = threading.Event()
    notify = downloads.emit
    try:
        if args.installer_result:
            args.installer_result.with_suffix('.pid').write_text(str(os.getpid()), encoding='ascii')
        if args.installer_log:
            # Result/log fallback is independent of a denied or full model drive.
            try:
                args.root.mkdir(parents=True, exist_ok=True)
                log_path = args.root / 'installer-preparation.log'
                log = log_path.open('w', encoding='utf8', buffering=1)
            except OSError:
                if not args.installer_result:
                    raise
                log = args.installer_result.with_suffix('.log').open('w', encoding='utf8', buffering=1)
            sys.stdout = sys.stderr = log
            from installer_progress import InstallerProgress
            progress = InstallerProgress(args.installer_window, args.parent_pid, models_only=args.installer_models_only, prepare=args.prepare, language=args.language)
            def human_event(kind, **data):
                progress.event(kind, **data)
                # Keep exact stages and causes in the log, even in English UI.
                print(kind + ': ' + str(data), flush=True)
            downloads.emit = notify = human_event
        watch_parent(args.parent_pid)
        watch_cancel(args.installer_result, finished)
        names = selected_models(args.models)
        install(args.root, names, notify)
        notify('models-installed', models=names)
        if args.prepare:
            if not args.runtime:
                raise ValueError('포함된 Python 경로를 확인하지 못했습니다.')
            from engine_prepare import prepare
            prepare(args.root.parent, args.runtime, names, args.device, notify, models_verified=True, deep_check=args.deep_check)
        notify('complete', message='Preparation completed.' if args.language == 'en' else '선택한 모델의 변환 준비를 완료했습니다.' if args.prepare else '선택한 모델 파일을 준비했습니다. 앱에서 사용할 모델을 선택하세요.')
        publish_result(args.installer_result, 0)
        return 0
    except Exception as error:
        message = failure_message(error, args.language)
        if progress:
            progress.event('error', message=message)
        for path in [args.root / 'installer-error.txt', args.installer_result.with_suffix('.error.txt') if args.installer_result else None]:
            if path:
                try:
                    path.write_text(message.replace('\n', ' ').replace('\r', ' ')[:2300], encoding='utf-16-le')
                except OSError:
                    pass
        if args.installer_result:
            try:
                args.installer_result.with_suffix('.summary.txt').write_text(message.split('\r\n\r\n')[0], encoding='utf-16-le')
            except OSError:
                pass
        print(message, file=sys.stderr, flush=True)
        if not args.installer_log:
            notify('error', message=message)
        try:
            publish_result(args.installer_result, 1)
        except OSError as publication_error:
            print('Result publication failed: ' + str(publication_error), file=sys.stderr)
        return 1
    finally:
        finished.set()
        downloads.emit = original_emit
        sys.stdout, sys.stderr = original_out, original_err
        if log:
            log.close()


if __name__ == '__main__':
    raise SystemExit(main())
