"""Verified, resumable downloads for the large Windows NVIDIA wheels."""
import argparse
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import msvcrt
import os
from pathlib import Path
import re
import shutil
import threading
import time
import urllib.request

PACKAGES = {
    "nvidia-cublas-cu12": "12.9.2.10",
    "nvidia-cudnn-cu12": "9.27.0.42",
    "nvidia-cuda-runtime-cu12": "12.9.79",
}
CHUNK = 4 * 1024 * 1024
MODELS = {name: f"Systran/faster-whisper-{name}" for name in ["tiny", "base", "small", "medium", "large-v3"]}
MODELS["large-v3-turbo"] = "mobiuslabsgmbh/faster-whisper-large-v3-turbo"


def emit(kind, **data):
    print(json.dumps({"type": kind, **data}, ensure_ascii=False), flush=True)


def sha256(filename):
    digest = hashlib.sha256()
    with filename.open("rb") as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch_json(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def ensure_space(root, required, reserve=64 * 1024 * 1024):
    """Check the actual target volume, before preallocating a partial file."""
    free = shutil.disk_usage(root).free
    emit('space', path=str(root), required=required + reserve, free=free)
    if free < required + reserve:
        raise OSError(28, f'저장 공간이 부족합니다: {root} · 필요 {(required + reserve) / 1e6:,.0f} MB / 여유 {free / 1e6:,.0f} MB')


def download(url, filename, size, checksum, phase="installing", message="GPU 라이브러리 다운로드 중"):
    if filename.is_file() and filename.stat().st_size == size and sha256(filename) == checksum:
        emit("download", name=filename.name, current=size, total=size, unit="B")
        return
    partial = filename.with_name(filename.name + ".part")
    manifest = filename.with_name(filename.name + ".resume.json")
    fingerprint = {"size": size, "sha256": checksum, "chunk": CHUNK}
    completed = set()
    try:
        saved = json.loads(manifest.read_text("utf8"))
        if all(saved.get(k) == v for k, v in fingerprint.items()) and partial.stat().st_size == size:
            completed = {n for n in saved["completed"] if isinstance(n, int) and 0 <= n < (size + CHUNK - 1) // CHUNK}
    except (OSError, ValueError, KeyError):
        pass
    if not completed:
        ensure_space(filename.parent, size)
        with partial.open("wb") as target:
            target.truncate(size)
    lock = threading.Lock()
    last_percent = [-1]

    def part(index):
        start, end = index * CHUNK, min(size - 1, (index + 1) * CHUNK - 1)
        failure = None
        for attempt in range(5):
            try:
                request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity"})
                with urllib.request.urlopen(request, timeout=30) as response:
                    if response.status != 206 or response.headers.get("Content-Range") != f"bytes {start}-{end}/{size}":
                        raise RuntimeError("다운로드 서버에서 이어받기 응답을 확인하지 못했습니다.")
                    block = response.read(end - start + 1)
                    if len(block) != end - start + 1:
                        raise RuntimeError("다운로드 조각이 중단됐습니다.")
                with lock:
                    with partial.open("r+b") as target:
                        target.seek(start); target.write(block); target.flush(); os.fsync(target.fileno())
                    completed.add(index)
                    temporary = manifest.with_name(manifest.name + ".tmp")
                    temporary.write_text(json.dumps({**fingerprint, "completed": sorted(completed)}), encoding="utf8")
                    os.replace(temporary, manifest)
                    current = sum(min(CHUNK, size - n * CHUNK) for n in completed)
                    percent = int(current / size * 100)
                    if percent != last_percent[0]:
                        last_percent[0] = percent
                        emit("download", name=filename.name, current=current, total=size, unit="B")
                return
            except Exception as error:
                failure = error
                if isinstance(error, OSError) and error.errno in [13, 28]:
                    raise
                if attempt < 4:
                    delay = attempt + 1
                    emit('retry', name=filename.name, attempt=attempt + 2, maximum=5, seconds=delay, message=str(error))
                    time.sleep(delay)
        raise failure

    emit("phase", phase=phase, message=message)
    remaining = [n for n in range((size + CHUNK - 1) // CHUNK) if n not in completed]
    with ThreadPoolExecutor(max_workers=4) as executor:
        for future in as_completed([executor.submit(part, n) for n in remaining]):
            future.result()
    if sha256(partial) != checksum:
        manifest.unlink(missing_ok=True)
        raise RuntimeError("다운로드 파일의 무결성 검사가 실패했습니다. 다시 시도해 주세요.")
    os.replace(partial, filename)
    manifest.unlink(missing_ok=True)


def wheels(root):
    root.mkdir(parents=True, exist_ok=True)
    result = []
    for name, version in PACKAGES.items():
        metadata = fetch_json(f"https://pypi.org/pypi/{name}/{version}/json")
        wheel = next(item for item in metadata["urls"] if item["filename"].endswith("win_amd64.whl"))
        filename = wheel["filename"]
        if Path(filename).name != filename or not wheel["url"].startswith("https://files.pythonhosted.org/"):
            raise RuntimeError("공식 패키지 다운로드 주소를 확인하지 못했습니다.")
        download(wheel["url"], root / filename, wheel["size"], wheel["digests"]["sha256"])
        result.append(filename)
    emit("wheels", files=result)


@contextmanager
def model_lock(root):
    with (root / ".prepare.lock").open("a+b") as handle:
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"\0"); handle.flush()
        waiting = False
        while True:
            try:
                handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError:
                if not waiting:
                    emit('phase', phase='waiting', message='다른 모델·환경 준비 작업이 끝나기를 기다리는 중')
                    waiting = True
                time.sleep(1)
        try:
            yield
        finally:
            handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def model(root, name="medium"):
    from installer_models import install
    install(root, name)


def model_files(root, name):
    model(root, name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--model", action="store_true")
    parser.add_argument("--parent-pid", type=int, default=0)
    args = parser.parse_args()
    try:
        from watchdog import watch_parent
        watch_parent(args.parent_pid)
        if args.model:
            model(args.root)
        else:
            wheels(args.root)
    except Exception as error:
        emit("error", message=str(error))
        raise SystemExit(1)
