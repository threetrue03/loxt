"""WASAPI loopback: follow the current default render endpoint within one session."""
import argparse
import base64
import json
import sys
import threading
import time
import warnings
from watchdog import watch_parent


def capture(sc, emit, stopped, seconds=None):
    import numpy as np
    deadline = time.monotonic() + seconds if seconds else float('inf')
    first, failures = True, 0
    while not stopped.is_set() and time.monotonic() < deadline:
        try:
            speaker = sc.default_speaker()
            microphone = sc.get_microphone(id=speaker.id, include_loopback=True)
            # Keep all native channels; single-channel WASAPI capture is unreliable.
            with microphone.recorder(samplerate=16000, channels=max(2,microphone.channels), blocksize=1600) as source:
                emit('ready' if first else 'device', device=speaker.name, endpoint=speaker.id)
                first, failures = False, 0
                checked = time.monotonic()
                while not stopped.is_set() and time.monotonic() < deadline:
                    if time.monotonic() - checked >= .5:
                        checked = time.monotonic()
                        if sc.default_speaker().id != speaker.id:
                            emit('reconnecting', message='출력 장치가 변경되어 다시 연결합니다.')
                            break
                    samples = source.record(numframes=1600)
                    mono = samples.mean(axis=1) if samples.ndim == 2 else samples
                    pcm = (np.clip(mono, -1, 1) * 32767).astype('<i2').tobytes()
                    emit('pcm', pcm=base64.b64encode(pcm).decode('ascii'))
        except Exception as error:
            failures += 1
            emit('reconnecting', message=f'출력 장치 연결을 기다립니다. {str(error)[:180]}')
            if first and failures >= 3: raise RuntimeError('Windows 출력 장치를 열지 못했습니다. 연결과 기본 출력 설정을 확인해 주세요.') from error
            stopped.wait(.5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--parent-pid', type=int, default=0); parser.add_argument('--seconds', type=float)
    args = parser.parse_args(); watch_parent(args.parent_pid); stopped = threading.Event()
    def commands():
        for line in sys.stdin:
            if json.loads(line).get('type') == 'stop': break
        stopped.set()
    def emit(kind, **data): print(json.dumps({'type':kind, **data}, ensure_ascii=False), flush=True)
    try:
        import soundcard as sc
        # NumPy's Windows DLL initialization touches stdio. Import before the
        # command reader blocks on stdin, otherwise startup can deadlock.
        threading.Thread(target=commands, daemon=True).start()
        warnings.filterwarnings('ignore', category=RuntimeWarning, module='soundcard')
        capture(sc, emit, stopped, args.seconds)
    except Exception as error: emit('error', message=str(error)); raise SystemExit(1)
