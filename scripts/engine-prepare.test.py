"""Preparation failure, selection and marker safety without downloads."""
from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
import engine_prepare as engine


class PreparationTests(unittest.TestCase):
    def test_core_preparation_succeeds_without_optional_speaker_engine(self):
        test_root = Path(__file__).resolve().parents[1] / 'test-results'
        with tempfile.TemporaryDirectory(dir=test_root, prefix='prepare-core-') as temporary:
            root = Path(temporary)
            base = root / 'python-base-3.13.16'
            base.mkdir()
            (base / 'sorinote-runtime.json').write_text('{}')
            calls = []
            def run(python, args, notify, protocol=False):
                calls.append(args)
                if any('auxiliary_prepare.py' in str(arg) for arg in args):
                    raise RuntimeError('speaker engine unavailable')
                if 'probe' in args:
                    return [('probe', {'compute_types': ['int8']})]
                if 'prepare' in args:
                    return [('prepared', {})]
                return []
            events = []
            with patch.object(engine, 'hardware', return_value=None), patch.object(engine, 'run', run):
                engine.prepare(root, root, ['small'], 'cpu', lambda kind, **data: events.append(kind), models_verified=True, prepare_auxiliary=False)
            self.assertIn('environment-ready', events)
            self.assertFalse(any('auxiliary_prepare.py' in str(arg) for args in calls for arg in args))
            with patch.object(engine, 'hardware', return_value=None), patch.object(engine, 'run', run):
                with self.assertRaisesRegex(RuntimeError, 'speaker engine unavailable'):
                    engine.prepare(root, root, ['small'], 'cpu', lambda *args, **kwargs: None, models_verified=True)

    def test_repair_also_validates_installed_active_model_without_changing_selection(self):
        test_root = Path(__file__).resolve().parents[1] / 'test-results'
        with tempfile.TemporaryDirectory(dir=test_root, prefix='prepare-active-') as temporary:
            root = Path(temporary)
            base = root / 'python-base-3.13.16'
            base.mkdir()
            (base / 'sorinote-runtime.json').write_text('{}')
            active = root / 'models/medium'
            active.mkdir(parents=True)
            for name in ['model.bin', 'config.json', 'tokenizer.json']:
                (active / name).write_text('fixture')
            original = {'model': 'medium', 'device': 'cpu'}
            (root / 'settings.json').write_text(json.dumps(original))
            def run(python, args, notify, protocol=False):
                if 'probe' in args:
                    return [('probe', {'compute_types': ['int8']})]
                if 'prepare' in args:
                    return [('prepared', {})]
                return []
            events = []
            with patch.object(engine, 'hardware', return_value=None), patch.object(engine, 'run', run):
                engine.prepare(root, root, ['small'], 'auto', lambda kind, **data: events.append((kind, data)), models_verified=True)
            final = next(data for kind, data in events if kind == 'environment-ready')
            self.assertTrue(final['selected_ready'])
            self.assertEqual(final['selected_model'], 'medium')
            self.assertEqual(json.loads((root / 'settings.json').read_text()), original)
            self.assertIn('medium:cpu:int8', json.loads((root / 'prepared.json').read_text())['validations'])

    def test_transient_validates_job_model_without_changing_saved_model(self):
        test_root = Path(__file__).resolve().parents[1] / 'test-results'
        with tempfile.TemporaryDirectory(dir=test_root, prefix='prepare-transient-') as temporary:
            root = Path(temporary)
            base = root / 'python-base-3.13.16'
            base.mkdir()
            (base / 'sorinote-runtime.json').write_text('{}')
            original = b'{"model":"medium","device":"cpu"}'
            (root / 'settings.json').write_bytes(original)
            calls, events = [], []
            def run(python, args, notify, protocol=False):
                calls.append(args)
                if 'probe' in args:
                    return [('probe', {'compute_types': ['int8']})]
                if 'prepare' in args:
                    return [('prepared', {})]
                return []
            with patch.object(engine, 'hardware', return_value=None), patch.object(engine, 'run', run):
                engine.prepare(root, root, ['small'], 'auto', lambda kind, **data: events.append((kind, data)), models_verified=True, prepare_auxiliary=False, transient=True)
            final = next(data for kind, data in events if kind == 'environment-ready')
            self.assertEqual(final['selected_model'], 'small')
            self.assertTrue(final['selected_ready'])
            self.assertEqual((root / 'settings.json').read_bytes(), original)
            self.assertFalse(any('medium' in args for args in calls))

    def test_selection_preserves_existing_and_never_falls_back_from_cuda(self):
        gpu = {'name': 'RTX test', 'memory': 6144}
        settings, device, _ = engine.selection(['small', 'large-v3-turbo'], {}, 'auto', gpu)
        self.assertEqual((settings['model'], device), ('large-v3-turbo', 'cuda'))
        original = {'model': 'medium', 'device': 'cpu'}
        settings, device, existing = engine.selection(['small'], original, 'auto', gpu)
        self.assertEqual(settings, original)
        self.assertTrue(existing)
        self.assertEqual(device, 'cpu')
        with self.assertRaisesRegex(RuntimeError, 'NVIDIA'):
            engine.selection(['small'], {'model': 'small', 'device': 'cuda'}, 'auto', None)
        self.assertEqual(engine.selection(['small'], {}, 'auto', None)[1], 'cpu')

    def test_only_successful_inference_creates_markers_and_failed_device_change_keeps_settings(self):
        test_root = Path(__file__).resolve().parents[1] / 'test-results'
        with tempfile.TemporaryDirectory(dir=test_root, prefix='prepare-unit-') as temporary:
            root = Path(temporary)
            base = root / 'python-base-3.13.16'
            base.mkdir()
            (base / 'sorinote-runtime.json').write_text('{}')
            settings = {'model': 'medium', 'device': 'auto'}
            (root / 'settings.json').write_text(json.dumps(settings))
            original = (root / 'settings.json').read_bytes()
            def run(python, args, notify, protocol=False):
                if 'probe' in args:
                    return [('probe', {'compute_types': ['int8']})]
                if 'prepare' in args:
                    if 'large-v3' in args:
                        raise RuntimeError('out of memory')
                    return [('prepared', {})]
                return []
            events = []
            with patch.object(engine, 'hardware', return_value=None), patch.object(engine, 'run', run):
                with self.assertRaisesRegex(RuntimeError, 'out of memory'):
                    engine.prepare(root, root, ['small', 'large-v3'], 'cpu', lambda kind, **data: events.append(kind), models_verified=True)
            self.assertNotIn('environment-ready', events)
            self.assertEqual((root / 'settings.json').read_bytes(), original)
            validations = json.loads((root / 'prepared.json').read_text())['validations']
            self.assertIn('small:cpu:int8', validations)
            self.assertNotIn('large-v3:cpu:int8', validations)


if __name__ == '__main__':
    unittest.main()
