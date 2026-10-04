"""Model-only installation shared by NSIS and the desktop app; no GPU required."""
import argparse
from pathlib import Path
import sys
import os
from downloads import model
from watchdog import watch_parent

PRESETS = {"small": "최적화", "large-v3-turbo": "표준", "large-v3": "고성능"}


def selected_models(value):
    names = value.split(",")
    if not names or any(name not in PRESETS for name in names):
        raise ValueError("설치할 모델은 small, large-v3-turbo, large-v3 중에서 선택해 주세요.")
    return list(dict.fromkeys(names))


def install(root, names, notify):
    root.mkdir(parents=True, exist_ok=True)
    # A separate lock prevents installer and desktop downloads racing each other.
    from downloads import model_lock
    with model_lock(root):
        for index, name in enumerate(names, 1):
            notify("model-start", model=name, index=index, total=len(names))
            model(root / name, name)
            notify("model-installed", model=name, index=index, total=len(names))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--models", required=True)
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument("--installer-log", action="store_true")
    parser.add_argument("--installer-window", type=int, default=0)
    parser.add_argument("--installer-models-only", action="store_true")
    parser.add_argument("--installer-result", type=Path)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("--device", choices=['auto', 'cuda', 'cpu'], default='auto')
    args = parser.parse_args()
    if args.installer_result:
        args.installer_result.with_suffix('.pid').write_text(str(os.getpid()), encoding='ascii')
    if args.installer_log:
        args.root.mkdir(parents=True, exist_ok=True)
        sys.stdout = (args.root / 'installer-preparation.log').open('w', encoding='utf8', buffering=1)
        sys.stderr = sys.stdout
    watch_parent(args.parent_pid)
    names = selected_models(args.models)
    if args.installer_log:
        from installer_progress import InstallerProgress
        progress = InstallerProgress(args.installer_window, args.parent_pid, models_only=args.installer_models_only, prepare=args.prepare)

        def human_event(kind, **data):
            progress.event(kind, **data)
            if kind == "download":
                percent = int(data["current"] / data["total"] * 100)
                print(f"모델 다운로드 {data['current'] / 1e6:,.1f} MB / {data['total'] / 1e6:,.1f} MB · {percent}%", flush=True)
            elif kind == "phase":
                print(data["message"], flush=True)
            elif kind == "model-start":
                print(f"[{data['index']}/{data['total']}] {PRESETS[data['model']]} ({data['model']}) 설치", flush=True)
            elif kind == "model-installed":
                print(f"{PRESETS[data['model']]} 모델 설치 완료", flush=True)
            elif kind in ['engine-start', 'validation-start', 'model-ready', 'environment-ready', 'hardware']:
                print(data.get('message') or f"전사 준비: {data.get('model', '')} {data.get('device', '')}", flush=True)
        import downloads
        downloads.emit = human_event
        notify = human_event
    else:
        from downloads import emit
        notify = emit
    try:
        install(args.root, names, notify)
        notify("models-installed", models=names)
        if args.prepare:
            if not args.runtime:
                raise ValueError('포함된 Python 경로를 확인하지 못했습니다.')
            from engine_prepare import prepare
            prepare(args.root.parent, args.runtime, names, args.device, notify, models_verified=True)
        if args.installer_log:
            print("선택한 모델의 전사 준비를 완료했습니다." if args.prepare else "선택한 모델을 설치했습니다. 앱 설정에서 사용할 모델을 선택해 주세요.", flush=True)
    except Exception as error:
        if args.installer_log:
            progress.event("error", message=str(error))
            try:
                args.root.mkdir(parents=True, exist_ok=True)
                (args.root / 'installer-error.txt').write_text(str(error)[:900], encoding='utf-16-le')
            except OSError:
                pass
            print(f"전사 준비 실패: {error}. 앱 설정에서 다시 시도할 수 있습니다.", flush=True)
        else:
            notify("error", message=str(error))
        if args.installer_result:
            temporary = args.installer_result.with_suffix('.tmp')
            temporary.write_text('1', encoding='ascii')
            temporary.replace(args.installer_result)
        return 1
    if args.installer_result:
        temporary = args.installer_result.with_suffix('.tmp')
        temporary.write_text('0', encoding='ascii')
        temporary.replace(args.installer_result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
