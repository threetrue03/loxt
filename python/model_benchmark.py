"""Local generated-speech timing, never a speech accuracy benchmark."""
import argparse
import ctypes
import json
import math
from pathlib import Path
import time
from worker import emit, load_cuda
from watchdog import watch_parent


def memory_bytes():
    class Counters(ctypes.Structure):
        _fields_ = [('cb', ctypes.c_ulong), ('PageFaultCount', ctypes.c_ulong), *[(name, ctypes.c_size_t) for name in ['PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage', 'PrivateUsage']]]
    try:
        value = Counters(); value.cb = ctypes.sizeof(value)
        ctypes.windll.kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        ctypes.windll.psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
        if ctypes.windll.psapi.GetProcessMemoryInfo(handle, ctypes.byref(value), value.cb):
            return int(value.PeakWorkingSetSize)
    except (AttributeError, OSError):
        pass
    return None


def measure(model, audio, language, beam):
    start = time.perf_counter()
    segments, _ = model.transcribe(audio, language=language, beam_size=beam, word_timestamps=True, vad_filter=False, condition_on_previous_text=False)
    first = None; count = 0
    for segment in segments:
        if segment.text.strip():
            count += 1
            if first is None:
                first = (time.perf_counter() - start) * 1000
    return {'seconds': time.perf_counter() - start, 'firstTextMs': first, 'segments': count}


def benchmark(args):
    if args.device == 'cuda':
        load_cuda()
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    audio = decode_audio(str(args.audio), sampling_rate=16000)
    seconds = len(audio) / 16000
    if not 2 <= seconds <= 90:
        raise ValueError('성능 확인용 음성 길이를 확인해 주세요.')
    emit('phase', phase='loading', message='성능 확인 모델 불러오는 중')
    start = time.perf_counter()
    model = WhisperModel(str(args.model_dir), device=args.device, compute_type=args.compute_type, local_files_only=True)
    load_seconds = time.perf_counter() - start
    emit('phase', phase='benchmarking', message='예시 음성 파일 변환 시간 측정 중')
    work = [measure(model, audio, args.language, 5) for _ in range(2)]
    emit('phase', phase='benchmarking', message='예시 음성 Live 청크 처리 시간 측정 중')
    preview_seconds = min(2, seconds); final_seconds = min(6, seconds)
    preview = measure(model, audio[:int(preview_seconds * 16000)], args.language, 3)
    final = measure(model, audio[:int(final_seconds * 16000)], args.language, 3)
    average = sum(r['seconds'] for r in work) / len(work)
    result = {'rtf': average / seconds, 'loadSeconds': load_seconds, 'audioSeconds': seconds, 'conversionSeconds': average, 'device': args.device, 'computeType': args.compute_type, 'language': args.language, 'repetitions': len(work), 'peakProcessRAM': memory_bytes(), 'previewSeconds': preview_seconds, 'previewLatencyMs': preview['seconds'] * 1000, 'firstTextMs': preview['firstTextMs'], 'liveChunkSeconds': final_seconds, 'liveChunkRTF': final['seconds'] / final_seconds, 'sample': 'Windows local synthesized speech', 'accuracyMeasured': False, 'liveEndToEndMeasured': False}
    if not all(math.isfinite(result[key]) and result[key] >= 0 for key in ['rtf', 'loadSeconds', 'conversionSeconds', 'liveChunkRTF']):
        raise ValueError('성능 측정 결과를 확인하지 못했습니다.')
    emit('benchmark', **result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', type=Path, required=True)
    parser.add_argument('--model-dir', type=Path, required=True)
    parser.add_argument('--language', choices=['ko','en'], default='ko')
    parser.add_argument('--device', choices=['cuda','cpu'], required=True)
    parser.add_argument('--compute-type', required=True)
    parser.add_argument('--parent-pid', type=int, default=0)
    args = parser.parse_args(); watch_parent(args.parent_pid)
    try:
        benchmark(args)
    except Exception as error:
        emit('error', message=str(error)); raise SystemExit(1)
