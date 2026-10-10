"""Update only the owning NSIS installer's Unicode status controls."""
import ctypes
from ctypes import wintypes

LABELS = {"small": "저성능", "large-v3-turbo": "표준", "large-v3": "고성능"}


class InstallerProgress:
    def __init__(self, window, parent_pid, models_only=False, prepare=False, language='ko'):
        self.window = window
        self.models_only = models_only
        self.prepare = prepare
        self.language = language
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
        self.api.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
        self.api.GetWindowLongW.restype = ctypes.c_long
        self.api.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
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
            style = self.api.GetWindowLongW(hwnd, -16)
            self.api.SetWindowLongW(hwnd, -16, style | 8 if value is None else style & ~8)
            self.api.SendMessageTimeoutW(hwnd, 0x40A, int(value is None), 40, 2, 500, ctypes.byref(result))
            if value is not None:
                self.api.SendMessageTimeoutW(hwnd, 0x402, value, 0, 2, 500, ctypes.byref(result))

    def text(self, korean, english):
        return english if getattr(self, 'language', 'ko') == 'en' else korean

    def event(self, kind, **data):
        total_stages = 5 if getattr(self, 'prepare', False) else 3
        if kind == 'engine-start':
            self.stage = 'engine'
            self.component = data.get('component', 'engine')
            self._set(1800, self.text('전체 설치: 3/5단계 · 변환 환경 준비 중', 'Step 3/5: preparing the conversion environment'))
            self._set(1801, self.text('1. 앱과 모델 파일 준비 완료\r\n2. 변환 엔진·실행 라이브러리 준비 중\r\n3. 모델 실행 검사 대기', '1. App/model files ready\r\n2. Preparing engine/libraries\r\n3. Model checks pending'))
            self._set(1802, self.text(data['message'], 'Checking/preparing the private conversion environment…'))
            self._set(1804, self.text('유효한 환경은 재사용합니다. 필요한 경우 인터넷과 여유 공간이 필요합니다.', 'Valid environments are reused. Downloads may require network and disk space.'))
            self._set(1803, None)
            return
        if kind == 'validation-start':
            self.stage = 'validation'
            self._set(1800, self.text('전체 설치: 4/5단계 · 모델 실행 검사', 'Step 4/5: model execution checks'))
            self._set(1802, f"{data['model']} · {data['index']}/{data['total']} · {data['device']}")
            self._set(1804, self.text('유효한 검사 결과는 재사용하고, 필요한 모델은 테스트 음성으로 검사합니다.', 'Reusing valid checks or running a test audio clip when needed.'))
            self._set(1803, None)
            return
        if kind == 'model-ready':
            self._set(1804, self.text('변환 준비 완료', 'Ready') + f" · {data['model']} · {data['device']} / {data['compute_type']}" + (self.text(' · 검사 결과 재사용', ' · previous check reused') if data.get('reused') else ''))
            self._set(1803, 100)
            return
        if kind == 'environment-ready':
            self._set(1801, self.text('1. 앱과 모델 파일 준비 완료\r\n2. 변환 엔진·실행 라이브러리 준비 완료\r\n3. 모델 실행 검사 완료', '1. App/model files ready\r\n2. Engine/libraries ready\r\n3. Model checks complete'))
            self._set(1804, self.text('변환 준비 완료 · 앱에서 사용할 모델을 확인하세요.', 'Ready. Check the selected model in the app.'))
            return
        if kind == "model-start":
            self.model, self.index, self.total = data["model"], data["index"], data["total"]
            label = LABELS.get(self.model, self.model) if getattr(self, 'language', 'ko') != 'en' else self.model
            self._set(1800, self.text(f"전체 설치: 2/{total_stages}단계 · {label} 모델 준비 중", f"Step 2/{total_stages}: preparing {label}"))
            first = "기존 앱 유지 · 모델 설치 도구 준비 완료" if getattr(self, "models_only", False) else "프로그램 설치 완료"
            self._set(1801, self.text(f"1. {first}\r\n2. 선택 모델 준비 중 ({self.index}/{self.total}개)\r\n3. 설치 마무리 대기", f"1. App files ready\r\n2. Models ({self.index}/{self.total})\r\n3. Finishing pending"))
            self._set(1802, f"{label} ({self.model}) · {self.index}/{self.total}")
            self._set(1804, self.text("모델 파일 확인 중 · 설치된 파일은 확인 후 재사용합니다.", 'Checking files; verified models will be reused.'))
            self._set(1803, None)
        elif kind == "download":
            if getattr(self, 'stage', 'models') == 'engine':
                label = '화자 모델' if getattr(self, 'component', '') == 'auxiliary' else 'GPU 라이브러리'
                self._set(1802, f"{label} · {data.get('name', '실행 파일')}")
            percent = min(100, int(data["current"] / data["total"] * 100))
            self._set(1803, percent)
            self._set(1804, self.text('현재 파일 다운로드: ', 'Current download: ') + f"{data['current'] / 1e6:,.1f} MB / {data['total'] / 1e6:,.1f} MB · {percent}%")
        elif kind == "phase":
            if getattr(self, 'stage', '') == 'engine' and getattr(self, 'component', '') == 'auxiliary':
                self._set(1802, data['message'])
                self._set(1803, None)
            if getattr(self, 'stage', 'models') == 'models':
                self._set(1802, self.text(data.get('message', ''), 'Checking, waiting or preparing files…'))
                self._set(1803, None)
        elif kind == "model-installed":
            self._set(1804, self.text('모델 파일 준비 완료 · 전체 무결성 확인 완료', 'Model files ready; integrity verified') + ' · ' + data['model'])
            self._set(1803, 100)
        elif kind == "error":
            self._set(1803, 0)
            self._set(1804, self.text('변환 준비 미완료 · 상세 원인과 다음 동작을 확인하세요.', 'Preparation incomplete. See details and available actions.'))
        elif kind == 'retry':
            self._set(1804, self.text(f"다시 연결 중 · {data['attempt']}/{data['maximum']}회 · {data['seconds']}초 후", f"Retry {data['attempt']}/{data['maximum']} in {data['seconds']}s"))
            self._set(1803, None)
        elif kind == 'space':
            self._set(1804, self.text('모델 저장 드라이브 여유: ', 'Target drive free: ') + f"{data['free'] / 1e6:,.0f} MB · " + self.text('이번 작업 필요: ', 'required: ') + f"{data['required'] / 1e6:,.0f} MB")
