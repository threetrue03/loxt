"""Update only the owning NSIS installer's Unicode status controls."""
import ctypes
from ctypes import wintypes

LABELS = {"small": "최적화", "large-v3-turbo": "표준", "large-v3": "고성능"}


class InstallerProgress:
    def __init__(self, window, parent_pid, models_only=False, prepare=False):
        self.window = window
        self.models_only = models_only
        self.prepare = prepare
        self.stage = 'models'
        self.model = ""
        self.index = self.total = 0
        self.api = ctypes.WinDLL("user32", use_last_error=True)
        self.api.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        self.api.GetDlgItem.argtypes = [wintypes.HWND, ctypes.c_int]
        self.api.GetDlgItem.restype = wintypes.HWND
        self.api.SendMessageTimeoutW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM,
                                                wintypes.LPARAM, wintypes.UINT, wintypes.UINT,
                                                ctypes.POINTER(ctypes.c_size_t)]
        self.api.SendMessageTimeoutW.restype = ctypes.c_ssize_t
        owner = wintypes.DWORD()
        self.api.GetWindowThreadProcessId(window, ctypes.byref(owner))
        if not parent_pid or owner.value != parent_pid:
            self.window = 0

    def _set(self, control, value):
        if not self.window:
            return
        hwnd = self.api.GetDlgItem(self.window, control)
        result = ctypes.c_size_t()
        # WM_SETTEXT marshals the Unicode buffer across processes synchronously.
        # A timeout prevents a blocked/closing installer from blocking downloads.
        if isinstance(value, str):
            buffer = ctypes.create_unicode_buffer(value)
            self.api.SendMessageTimeoutW(hwnd, 0xC, 0, ctypes.addressof(buffer), 2, 500, ctypes.byref(result))
        else:
            self.api.SendMessageTimeoutW(hwnd, 0x402, value, 0, 2, 500, ctypes.byref(result))

    def event(self, kind, **data):
        total_stages = 5 if getattr(self, 'prepare', False) else 3
        if kind == 'engine-start':
            self.stage = 'engine'
            self.component = data.get('component', 'engine')
            self._set(1800, '전체 설치: 3/5단계 · 전사 환경 준비 중')
            self._set(1801, '1. 앱과 모델 파일 준비 완료\r\n2. 전사 엔진·실행 라이브러리 준비 중\r\n3. 실제 모델 실행 검사 대기')
            self._set(1802, data['message'])
            self._set(1804, '인터넷 연결과 여유 공간이 필요합니다. 기존 설치 파일은 재사용합니다.')
            self._set(1803, 0)
            return
        if kind == 'validation-start':
            self.stage = 'validation'
            self._set(1800, '전체 설치: 4/5단계 · 실제 모델 실행 검사')
            self._set(1802, f"{LABELS.get(data['model'], data['model'])} · {data['index']}/{data['total']} · {'GPU' if data['device'] == 'cuda' else 'CPU'} 실행 검사 중")
            self._set(1804, '모델을 불러오고 테스트 음성으로 실제 추론을 확인합니다.')
            self._set(1803, 0)
            return
        if kind == 'model-ready':
            self._set(1804, f"{LABELS.get(data['model'], data['model'])} 전사 준비 완료 · {data['device']} / {data['compute_type']}")
            self._set(1803, 100)
            return
        if kind == 'environment-ready':
            self._set(1801, '1. 앱과 모델 파일 준비 완료\r\n2. 전사 엔진·실행 라이브러리 준비 완료\r\n3. 실제 모델 실행 검사 완료')
            self._set(1804, '바로 전사할 수 있습니다.' if data['selected_ready'] else '설치한 모델 준비 완료 · 앱에서 사용할 모델을 선택하세요.')
            return
        if kind == "model-start":
            self.model, self.index, self.total = data["model"], data["index"], data["total"]
            label = LABELS[self.model]
            self._set(1800, f"전체 설치: 2/{total_stages}단계 · {label} 모델 설치 중")
            first = "기존 앱 유지 · 모델 설치 도구 준비 완료" if getattr(self, "models_only", False) else "프로그램 설치 완료"
            self._set(1801, f"1. {first}\r\n2. 선택 모델 설치 중 ({self.index}/{self.total}개)\r\n3. 설치 마무리 대기")
            self._set(1802, f"{label} ({self.model}) · 모델 {self.index}/{self.total}")
            self._set(1804, "모델 파일 확인 중 · 설치된 파일은 확인 후 재사용합니다.")
            self._set(1803, 0)
        elif kind == "download":
            if getattr(self, 'stage', 'models') == 'engine':
                label = '화자 모델' if getattr(self, 'component', '') == 'auxiliary' else 'GPU 라이브러리'
                self._set(1802, f"{label} · {data.get('name', '실행 파일')}")
            percent = min(100, int(data["current"] / data["total"] * 100))
            self._set(1803, percent)
            self._set(1804, f"다운로드: {data['current'] / 1e6:,.1f} MB / {data['total'] / 1e6:,.1f} MB · {percent}%"
                      + (" · 모델 확인 중" if percent == 100 else ""))
        elif kind == "phase":
            if getattr(self, 'stage', '') == 'engine' and getattr(self, 'component', '') == 'auxiliary':
                self._set(1802, data['message'])
                self._set(1803, 0)
            if getattr(self, 'stage', 'models') == 'models':
                self._set(1800, f"전체 설치: 2/{total_stages}단계 · {LABELS.get(self.model, '선택')} 모델 다운로드 중")
        elif kind == "model-installed":
            self._set(1804, f"{LABELS[data['model']]} 모델 설치 완료 · 파일 무결성 확인 완료")
            self._set(1803, 100)
        elif kind == "error":
            self._set(1804, f"전사 준비 미완료 · {data.get('message', '')}"[:400])
