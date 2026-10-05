"""One local GPU task per process. stdout is JSONL; audio never leaves the PC."""
import argparse
import ctypes
import importlib.metadata
import io
import json
import math
import os
from pathlib import Path
import sys
import wave

DLL_HANDLES = []


def emit(kind, **data):
    print(json.dumps({"type": kind, **data}, ensure_ascii=False), flush=True)


def load_cuda():
    # NVIDIA wheels keep their Windows DLLs inside the isolated environment.
    base = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
    directories = sorted({p.parent for p in base.rglob("*.dll")}) if base.exists() else []
    for directory in directories:
        DLL_HANDLES.append(os.add_dll_directory(str(directory)))
    os.environ["PATH"] = os.pathsep.join(map(str, directories)) + os.pathsep + os.environ.get("PATH", "")
    for name in ["cudart64_12.dll", "cublasLt64_12.dll", "cublas64_12.dll", "cudnn64_9.dll"]:
        DLL_HANDLES.append(ctypes.WinDLL(name))


def test_audio():
    # Confirm the decoder API too, without creating a recording in the library.
    from faster_whisper.audio import decode_audio
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
        output.writeframes(b"\0" * 32000)
    buffer.seek(0)
    return decode_audio(buffer)


def probe(model_dir, device):
    if device == "cuda":
        load_cuda()
    import ctranslate2
    from faster_whisper import WhisperModel  # validates all engine imports
    test_audio()
    count = ctranslate2.get_cuda_device_count() if device == "cuda" else 0
    types = ctranslate2.get_supported_compute_types(device)
    if device == "cuda" and not count:
        raise RuntimeError("NVIDIA CUDA 장치를 찾지 못했습니다. CPU를 선택하거나 드라이버를 확인해 주세요.")
    required = ["model.bin", "config.json", "tokenizer.json"]
    emit("probe", gpu_count=count, compute_types=sorted(types),
         engine=importlib.metadata.version("faster-whisper"),
         model_ready=all((model_dir / name).is_file() for name in required))


def prepare(model_dir, name, device, compute, skip_download=False):
    from downloads import model as download_model
    emit("phase", phase="downloading", message=f"{name} 모델 다운로드 중")
    if not skip_download:
        download_model(model_dir, name)
    # A short inference checks CUDA/cuDNN execution, not just device enumeration.
    if device == "cuda":
        load_cuda()
    from faster_whisper import WhisperModel
    emit("phase", phase="checking", message=f"{'GPU' if device == 'cuda' else 'CPU'} 모델 실행 확인 중")
    model = WhisperModel(str(model_dir), device=device, compute_type=compute, local_files_only=True)
    segments, _ = model.transcribe(test_audio(), language="ko", beam_size=1, vad_filter=False)
    list(segments)
    emit("prepared")


def bounded_segment(segment, seconds):
    start, end = float(segment.start), float(segment.end)
    if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
        raise ValueError("변환 결과의 시간이 올바르지 않습니다. 다시 변환해 주세요.")
    text = segment.text.strip()
    # Do not move text generated beyond the recording onto its final second.
    if not text or start >= seconds or end <= start:
        return None
    item = {"start": start, "end": min(end, seconds), "text": text}
    words = [{"start": max(start, float(w.start)), "end": min(end, seconds, float(w.end)), "text": w.word}
             for w in getattr(segment, 'words', None) or []
             if math.isfinite(w.start) and math.isfinite(w.end) and max(start, w.start) < min(end, seconds, w.end)]
    if words: item['words'] = words
    return item


def transcribe(model_dir, audio, name, device, compute, model=None):
    if model is None and device == "cuda":
        load_cuda()
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    if model is None:
        emit("phase", phase="loading", message=f"{name} 모델 불러오는 중")
    if model is None: model = WhisperModel(str(model_dir), device=device, compute_type=compute, local_files_only=True)
    emit("phase", phase="transcribing", message="한국어 음성을 변환하는 중")
    decoded = decode_audio(str(audio), sampling_rate=16000)
    seconds = len(decoded) / 16000
    if seconds <= 0:
        raise ValueError("원본 녹음에 재생할 오디오가 없습니다.")
    # Align timestamps to speech instead of relying on generated timestamp tokens.
    # Avoid carrying repeated/hallucinated text into the next decoding window.
    segments, info = model.transcribe(decoded, language="ko", beam_size=5, vad_filter=True,
                                      word_timestamps=True, condition_on_previous_text=False)
    emit("duration", seconds=seconds)
    result = []
    for segment in segments:
        item = bounded_segment(segment, seconds)
        if item is not None:
            result.append(item)
            emit("segment", **item, duration=seconds)
    emit("result", segments=result, seconds=seconds, language=info.language,
         model=name, device=device, compute_type=compute)


def serve(args):
    from downloads import model_lock
    model = None
    for line in sys.stdin:
        request = json.loads(line)
        if request.get('type') == 'stop': break
        try:
            from contextlib import nullcontext
            with model_lock(args.model_dir.parent.parent) if args.lock_environment else nullcontext():
                if model is None:
                    if args.device == 'cuda': load_cuda()
                    from faster_whisper import WhisperModel
                    emit('phase', phase='loading', message=f'{args.model} 모델 불러오는 중')
                    model = WhisperModel(str(args.model_dir), device=args.device, compute_type=args.compute_type, local_files_only=True)
                audio = Path(request['audio'])
                if not audio.is_file(): raise ValueError('원본 오디오 파일을 찾지 못했습니다.')
                transcribe(args.model_dir, audio, args.model, args.device, args.compute_type, model=model)
        except Exception as error:
            emit('error', message=str(error)); raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["probe", "prepare", "transcribe", "serve"])
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--audio", type=Path)
    parser.add_argument("--model", default="medium")
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    parser.add_argument("--compute-type", default="int8_float16")
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--lock-environment", action="store_true")
    args = parser.parse_args()
    try:
        from watchdog import watch_parent
        watch_parent(args.parent_pid)
        from contextlib import nullcontext
        from downloads import model_lock
        environment = args.model_dir.parent.parent
        environment.mkdir(parents=True, exist_ok=True)
        with model_lock(environment) if args.lock_environment and args.command != "serve" else nullcontext():
            if args.command == "probe":
                probe(args.model_dir, args.device)
            elif args.command == "prepare":
                prepare(args.model_dir, args.model, args.device, args.compute_type, args.skip_download)
            elif args.command == "serve":
                serve(args)
            else:
                if not args.audio or not args.audio.is_file():
                    raise RuntimeError("원본 오디오 파일을 찾지 못했습니다.")
                transcribe(args.model_dir, args.audio, args.model, args.device, args.compute_type)
    except Exception as error:
        emit("error", message=str(error))
        sys.exit(1)


if __name__ == "__main__":
    main()
