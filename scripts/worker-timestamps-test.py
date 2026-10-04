import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace, ModuleType
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

spec = importlib.util.spec_from_file_location("worker", Path(__file__).resolve().parents[1] / "python" / "worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class TimestampTests(unittest.TestCase):
    def test_model_output_is_aligned_and_bounded_using_decoded_audio(self):
        calls = []
        decoded = [0] * 900480  # Exactly 56.28 seconds at 16 kHz.
        class Model:
            def __init__(self, *args, **kwargs): pass
            def transcribe(self, audio, **options):
                calls.append((audio, options))
                return iter([
                    SimpleNamespace(start=2, end=3, text=" 음성 "),
                    SimpleNamespace(start=55, end=60, text="끝 구간"),
                    SimpleNamespace(start=79.9, end=81.46, text="녹음 밖 생성 텍스트"),
                ]), SimpleNamespace(language="ko", duration=999)
        whisper, audio_module = ModuleType("faster_whisper"), ModuleType("faster_whisper.audio")
        whisper.WhisperModel = Model
        audio_module.decode_audio = lambda source, sampling_rate: decoded
        output = io.StringIO()
        with patch.dict("sys.modules", {"faster_whisper": whisper, "faster_whisper.audio": audio_module}), redirect_stdout(output):
            worker.transcribe(Path("model"), Path("original.webm"), "small", "cpu", "int8")
        events = [json.loads(line) for line in output.getvalue().splitlines()]
        result = events[-1]
        self.assertEqual(result["seconds"], 56.28)
        self.assertEqual(result["segments"], [{"start": 2.0, "end": 3.0, "text": "음성"}, {"start": 55.0, "end": 56.28, "text": "끝 구간"}])
        self.assertIs(calls[0][0], decoded)
        self.assertTrue(calls[0][1]["word_timestamps"])
        self.assertFalse(calls[0][1]["condition_on_previous_text"])
        self.assertTrue(all(event["end"] <= 56.28 for event in events if event["type"] == "segment"))

    def test_invalid_or_empty_timestamps(self):
        for start, end in [(float("nan"), 1), (0, float("inf")), (-1, 2), (4, 2)]:
            with self.assertRaises(ValueError): worker.bounded_segment(SimpleNamespace(start=start, end=end, text="오류"), 56.28)
        for start, end, text in [(56.28, 57, "초과"), (2, 2, "길이 없음"), (0, 1, " ")]:
            self.assertIsNone(worker.bounded_segment(SimpleNamespace(start=start, end=end, text=text), 56.28))


if __name__ == "__main__": unittest.main()
