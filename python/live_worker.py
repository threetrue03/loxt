"""Persistent Live model. Only bounded mono PCM windows cross stdin/stdout."""
import argparse
import base64
import json
from pathlib import Path
import sys
from worker import load_cuda, emit, test_audio


def aligned_segments(segments, seconds):
    result = []
    for segment in segments:
        words = []
        for word in segment.words or []:
            start, end = max(0.0, float(word.start)), min(seconds, float(word.end))
            if 0 <= start < end <= seconds:
                words.append({"start": start, "end": end, "text": word.word})
        if words:
            result.append({"start": words[0]["start"], "end": words[-1]["end"],
                           "text": "".join(w["text"] for w in words).strip(), "words": words})
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--device", choices=["cuda", "cpu"], required=True)
    parser.add_argument("--compute-type", required=True)
    parser.add_argument("--parent-pid", type=int, required=True)
    parser.add_argument("--speaker-models", type=Path, required=True)
    parser.add_argument("--speaker-site", type=Path, required=True)
    args = parser.parse_args()
    try:
        from watchdog import watch_parent
        watch_parent(args.parent_pid)
        import site
        site.addsitedir(str(args.speaker_site))
        from speakers import Speakers, assign
        speakers = Speakers(args.speaker_models)
        from downloads import model_lock
        with model_lock(args.model_dir.parent.parent):
            if args.device == "cuda": load_cuda()
            import numpy as np
            from faster_whisper import WhisperModel
            model = WhisperModel(str(args.model_dir), device=args.device, compute_type=args.compute_type, local_files_only=True)
            list(model.transcribe(test_audio(), language="ko", beam_size=1, vad_filter=True)[0])
            emit("ready")
            for line in sys.stdin:
                if len(line) > 500000: raise ValueError("Live 음성 구간이 너무 큽니다.")
                request = json.loads(line)
                if request.get("type") == "stop": break
                raw = base64.b64decode(request["pcm"], validate=True)
                if len(raw) % 2 or not 0 < len(raw) <= 7 * 32000: raise ValueError("Live 오디오 형식이 올바르지 않습니다.")
                audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768
                segments, _ = model.transcribe(audio, language="ko", beam_size=3,
                    word_timestamps=True, condition_on_previous_text=False, vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 500, "min_speech_duration_ms": 300, "speech_pad_ms": 200})
                aligned = assign(aligned_segments(segments, len(audio)/16000), speakers.turns(audio, online=True))
                for segment in aligned:
                    for word in segment.get('words', []): word['speaker'] = segment['speaker']
                emit("result", seq=request["seq"], segments=aligned)
    except Exception as error:
        emit("error", message=str(error)); sys.exit(1)


if __name__ == "__main__": main()
