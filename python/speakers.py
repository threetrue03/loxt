"""CPU speaker turns, canonical recording-local IDs and provisional Live identities."""
from pathlib import Path
import numpy as np


def label(index):
    value, text = index + 1, ''
    while value:
        value, digit = divmod(value - 1, 26); text = chr(65 + digit) + text
    return text


def overlap_speaker(start, end, turns):
    ranked = [(max(0, min(end, turn['end']) - max(start, turn['start'])), turn['speaker']) for turn in turns]
    return max(ranked, key=lambda item: item[0])[1] if ranked and max(item[0] for item in ranked) > 0 else None


def assign(segments, turns):
    result = []
    for segment in segments:
        words = segment.get('words')
        if not words:
            result.append({**segment, 'speaker': overlap_speaker(segment['start'], segment['end'], turns)}); continue
        group = None
        for word in words:
            speaker = overlap_speaker(word['start'], word['end'], turns)
            if group is None or group['speaker'] != speaker:
                if group: result.append(group)
                group = {'start': word['start'], 'end': word['end'], 'text': word['text'], 'speaker': speaker, 'words': [word]}
            else: group['end'] = word['end']; group['text'] += word['text']; group['words'].append(word)
        if group: result.append(group)
    return [{**item, 'text': item['text'].strip()} for item in result if item['text'].strip()]


class Speakers:
    def __init__(self, models):
        import sherpa_onnx as sherpa
        models = Path(models)
        embedding = sherpa.SpeakerEmbeddingExtractorConfig(model=str(models / 'embedding.onnx'), num_threads=2, provider='cpu')
        config = sherpa.OfflineSpeakerDiarizationConfig(
            segmentation=sherpa.OfflineSpeakerSegmentationModelConfig(pyannote=sherpa.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(models / 'segmentation.onnx'), window_shift_ratio=.1), num_threads=2, provider='cpu'),
            embedding=embedding, clustering=sherpa.FastClusteringConfig(num_clusters=-1, threshold=.8), min_duration_on=.3, min_duration_off=.5)
        if not config.validate(): raise RuntimeError('화자 모델 파일을 확인하지 못했습니다. 다시 준비해 주세요.')
        self.diarizer = sherpa.OfflineSpeakerDiarization(config)
        self.extractor = sherpa.SpeakerEmbeddingExtractor(embedding)
        self.centroids = []

    def turns(self, audio, online=False):
        if len(audio) < 8000: return []
        turns = self.diarizer.process(np.ascontiguousarray(audio, dtype=np.float32)).sort_by_start_time()
        canonical, result = {}, []
        for turn in turns:
            start, end = max(0, float(turn.start)), min(len(audio)/16000, float(turn.end))
            if end <= start: continue
            if online:
                sample = audio[int(start*16000):int(end*16000)]
                stream = self.extractor.create_stream(); stream.accept_waveform(sample_rate=16000, waveform=sample); stream.input_finished()
                if not self.extractor.is_ready(stream): continue
                vector = np.asarray(self.extractor.compute(stream), dtype=np.float32); vector /= max(1e-8, float(np.linalg.norm(vector)))
                similarities = [float(np.dot(vector, center)) for center in self.centroids]
                index = int(np.argmax(similarities)) if similarities and max(similarities) >= .5 else len(self.centroids)
                if index == len(self.centroids): self.centroids.append(vector)
                else:
                    center = self.centroids[index] * .9 + vector * .1; self.centroids[index] = center / max(1e-8,float(np.linalg.norm(center)))
            else:
                index = canonical.setdefault(turn.speaker, len(canonical))
            result.append({'start': start, 'end': end, 'speaker': label(index)})
        return result


def decode(filename):
    import av
    blocks = []
    with av.open(str(filename)) as container:
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame): blocks.append(output.to_ndarray().reshape(-1))
        for output in resampler.resample(None): blocks.append(output.to_ndarray().reshape(-1))
    return np.concatenate(blocks).astype(np.float32) if blocks else np.empty(0,dtype=np.float32)
