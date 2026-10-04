"""Offline batch routing/failure tests; production downloads tested by models-smoke."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
import install_models
from installer_progress import InstallerProgress


class ModelInstallerTests(unittest.TestCase):
    def test_installer_progress_labels_amount_and_failure(self):
        progress = object.__new__(InstallerProgress)
        fields = {}
        progress._set = lambda control, value: fields.__setitem__(control, value)
        progress.event('model-start', model='large-v3-turbo', index=2, total=3)
        self.assertIn('표준', fields[1800])
        self.assertIn('2/3', fields[1802])
        progress.event('download', current=640000000, total=1600000000)
        self.assertEqual(fields[1803], 40)
        self.assertIn('640.0 MB / 1,600.0 MB · 40%', fields[1804])
        progress.event('error')
        self.assertIn('미완료', fields[1804])
        self.assertEqual(fields[1803], 40)
        progress.event('model-start', model='small', index=1, total=1)
        self.assertEqual(fields[1803], 0)
        self.assertIn('최적화', fields[1802])
        progress.event('model-installed', model='small')
        self.assertEqual(fields[1803], 100)
        self.assertIn('무결성 확인 완료', fields[1804])
        progress.models_only = True
        progress.event('model-start', model='small', index=1, total=1)
        self.assertIn('기존 앱 유지', fields[1801])
        self.assertNotIn('프로그램 설치 완료', fields[1801])
        progress.event('engine-start', component='auxiliary', message='화자 분석·출력 장치 엔진 준비 중')
        progress.event('download', name='embedding.onnx', current=20_000_000, total=40_000_000)
        self.assertIn('화자 모델',fields[1802]); self.assertNotIn('GPU 라이브러리',fields[1802])
        self.assertEqual(fields[1803],50)
        progress.event('phase', message='화자 모델 실행 확인 중')
        self.assertEqual(fields[1802],'화자 모델 실행 확인 중')

    def test_only_presets_and_duplicate_selection(self):
        self.assertEqual(install_models.selected_models("small,large-v3-turbo,small,large-v3"),
                         ["small", "large-v3-turbo", "large-v3"])
        for selection in ["", "medium", "../library", "small,", "large-v3/../../"]:
            with self.assertRaises(ValueError):
                install_models.selected_models(selection)

    def test_batch_order_and_failure_do_not_report_unfinished_models(self):
        events, requested = [], []
        def notify(kind, **data):
            events.append((kind, data))
        def download(root, name):
            requested.append((root.name, name))
            if name == "large-v3-turbo":
                raise RuntimeError("connection interrupted")
        test_root = Path(__file__).resolve().parents[1] / 'test-results'
        test_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=test_root, prefix='model-helper-') as temporary:
            root = Path(temporary) / "models"
            with patch.object(install_models, "model", download):
                with self.assertRaisesRegex(RuntimeError, "interrupted"):
                    install_models.install(root, ["small", "large-v3-turbo", "large-v3"], notify)
            self.assertEqual(requested, [("small", "small"), ("large-v3-turbo", "large-v3-turbo")])
            self.assertEqual([(kind, data["model"]) for kind, data in events],
                             [("model-start", "small"), ("model-installed", "small"),
                              ("model-start", "large-v3-turbo")])


if __name__ == "__main__":
    unittest.main()
