import argparse
import json
import sys
from pathlib import Path
from downloads import emit
from watchdog import watch_parent
from speakers import Speakers, assign, decode

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--models', type=Path, required=True); parser.add_argument('--audio', type=Path); parser.add_argument('--parent-pid', type=int, default=0); parser.add_argument('--probe', action='store_true')
    args = parser.parse_args(); watch_parent(args.parent_pid)
    try:
        if args.probe:
            import numpy as np
            Speakers(args.models).turns(np.zeros(16000,dtype=np.float32))
            emit('ready'); raise SystemExit(0)
        if not args.audio: parser.error('--audio가 필요합니다.')
        request = json.load(sys.stdin); audio = decode(args.audio)
        turns = Speakers(args.models).turns(audio)
        emit('result', segments=assign(request['segments'], turns), turns=turns)
    except Exception as error: emit('error', message=str(error)); raise SystemExit(1)
