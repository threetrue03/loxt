"""Diarization identity/alignment and default-output reconnection regression checks."""
import sys
from pathlib import Path
import unittest
import threading
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from speakers import assign, label
from system_audio import capture


class AuxiliaryTests(unittest.TestCase):
    def test_speaker_changes_split_words_and_returning_voice_keeps_identity(self):
        turns = [{'start': 0, 'end': 1, 'speaker': 'A'}, {'start': 1, 'end': 2, 'speaker': 'B'}, {'start': 2, 'end': 3, 'speaker': 'A'}]
        segments = [{'start': 0, 'end': 3, 'text': 'one two three', 'words': [{'start': i, 'end': i+.8, 'text': text} for i,text in enumerate(['one', ' two', ' three'])]}]
        result = assign(segments, turns)
        self.assertEqual([item['speaker'] for item in result], ['A','B','A'])
        self.assertEqual([item['text'] for item in result], ['one','two','three'])
        self.assertEqual(label(26),'AA')
        self.assertIsNone(assign([{'start':4,'end':5,'text':'unknown'}],turns)[0]['speaker'])

    def test_default_output_reconnects_and_keeps_pcm_stream(self):
        stopped = threading.Event(); events = []; clock = [0.0]
        class Speaker:
            def __init__(self, value): self.id = value; self.name = value
        class Recorder:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def record(self, numframes):
                clock[0] += .1
                if clock[0] > 1.6: stopped.set()
                return np.full((numframes,2),.25)
        class Microphone:
            channels = 1
            def recorder(self,**kwargs):
                if kwargs['channels'] != 2: raise AssertionError('Mono endpoints must use WASAPI stereo remapping')
                return Recorder()
        class SoundCard:
            def default_speaker(self): return Speaker('speaker' if clock[0] < .6 else 'headset')
            def get_microphone(self,id,include_loopback): self.selected.append(id); return Microphone()
            selected = []
        from unittest.mock import patch
        sc = SoundCard()
        with patch('system_audio.time.monotonic',side_effect=lambda:clock[0]):
            capture(sc,lambda kind,**data:events.append({'type':kind,**data}),stopped)
        self.assertEqual(sc.selected,['speaker','headset'])
        self.assertEqual([item['device'] for item in events if item['type'] in ['ready','device']],['speaker','headset'])
        self.assertTrue(any(item['type']=='reconnecting' for item in events))
        self.assertGreater(len([item for item in events if item['type']=='pcm']),10)


if __name__ == '__main__': unittest.main()
