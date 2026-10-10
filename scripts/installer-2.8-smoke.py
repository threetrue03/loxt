"""Safe NSIS UI harness: isolated files, no host installation/registry changes."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

PROJECT = Path(__file__).resolve().parents[1]
RESULTS = PROJECT / 'test-results/implementation-2.8.0/installer'
RESULTS.mkdir(parents=True, exist_ok=True)
ROOT = Path(tempfile.mkdtemp(prefix='nsis-', dir=RESULTS)).resolve()
assert ROOT.is_relative_to(RESULTS.resolve())
CACHE = Path(os.environ.get('ELECTRON_BUILDER_CACHE', Path.home() / 'AppData/Local/electron-builder/Cache'))
compiler = next(CACHE.rglob('Bin/makensis.exe'))
resources = ROOT / 'app/resources'
helpers = resources / 'python'
helpers.mkdir(parents=True)
runtime = resources / 'python-runtime'
os.mkdir(runtime)
# Copy the bundled runtime (a test-owned copy, never modify the source runtime).
shutil.copytree(PROJECT / '.runtime/python', runtime, dirs_exist_ok=True)
for source in (PROJECT / 'python').glob('*.py'):
    shutil.copyfile(source, helpers / ('installer_real.py' if source.name == 'install_models.py' else source.name))
(helpers / 'install_models.py').write_text('''
import os, sys, time, subprocess, json
from pathlib import Path
import downloads
import installer_real as installer
def model(root, name):
    mode = (Path(__file__).parents[2] / 'mode.txt').read_text()
    if mode == 'failure':
        raise PermissionError('isolated fixture access denied')
    if mode == 'waiting':
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
        (Path(__file__).parents[2] / 'owned-pids.json').write_text(json.dumps([os.getpid(), child.pid]))
        downloads.emit('phase', phase='waiting', message='Waiting fixture')
        while True: time.sleep(.1)
    downloads.emit('phase', phase='checking', message='Checking fixture')
    time.sleep(.3)
    downloads.emit('download', current=40, total=100)
    time.sleep(.4)
installer.model = model
raise SystemExit(installer.main())
''', encoding='utf8')
key = 'Software\\LoxtReadOnlyHarness\\' + uuid.uuid4().hex
source = ROOT / 'harness.nsi'
source.write_text(r'''
Unicode true
RequestExecutionLevel user
Name "LOXT isolated installer 2.8 test"
OutFile "harness.exe"
!define VERSION "2.8.0"
!define SORINOTE_INSTALL_KEY "__KEY__"
!define SORINOTE_UNINSTALL_KEY "__KEY__"
!define SORINOTE_DATA_ROOT "__ROOT__\data"
Var newDesktopLink
!include MUI2.nsh
!include "__PROJECT__\build\installer.nsh"
!insertmacro customPageAfterChangeDir
!insertmacro MUI_PAGE_INSTFILES
Page custom SorinotePreparationProgressPage SorinotePreparationProgressLeave
!insertmacro customFinishPage
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  StrCpy $INSTDIR "__ROOT__\app"
  !insertmacro customInit
  StrCpy $SorinoteModelRoot "__ROOT__\data\transcription\models"
  StrCpy $SorinoteOptimizedState 1
  StrCpy $SorinoteStandardState 0
  StrCpy $SorinotePerformanceState 0
  StrCpy $SorinotePrepareState 0
  StrCpy $newDesktopLink "__ROOT__\LOXT.lnk"
  ${GetParameters} $0
  ${GetOptions} $0 "/LANG=" $LANGUAGE
FunctionEnd
Section
  !insertmacro customInstall
SectionEnd
'''.replace('__KEY__', key).replace('__ROOT__', str(ROOT)).replace('__PROJECT__', str(PROJECT)), encoding='utf-8-sig')
compilation = subprocess.run([str(compiler), '/V2', str(source)], cwd=ROOT, capture_output=True, text=True)
(RESULTS / 'nsis-compile.log').write_text(compilation.stdout + compilation.stderr, encoding='utf8')
assert compilation.returncode == 0, compilation.stdout + compilation.stderr
assert 'unknown variable/constant' not in compilation.stdout.lower()
print('PASS: real production NSIS includes compile with Korean/English', flush=True)
print('TEST_PROFILE', ROOT, flush=True)
if '--compile-only' in sys.argv:
    raise SystemExit(0)

api = ctypes.WinDLL('user32')
api.GetDlgItem.argtypes = [wintypes.HWND, ctypes.c_int]
api.GetDlgItem.restype = wintypes.HWND
api.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
api.SendMessageW.restype = ctypes.c_ssize_t
api.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
api.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
api.IsWindowVisible.argtypes = [wintypes.HWND]
api.IsWindowEnabled.argtypes = [wintypes.HWND]
api.GetParent.argtypes = [wintypes.HWND]
api.GetParent.restype = wintypes.HWND
api.GetDC.argtypes = [wintypes.HWND]
api.GetDC.restype = wintypes.HDC
api.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
api.DrawTextW.argtypes = [wintypes.HDC, wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(wintypes.RECT), wintypes.UINT]
api.GetDpiForWindow.argtypes = [wintypes.HWND]
gdi = ctypes.WinDLL('gdi32')
gdi.SelectObject.argtypes = [wintypes.HDC, wintypes.HANDLE]
gdi.SelectObject.restype = wintypes.HANDLE
CALLBACK = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

def snapshot(pid):
    outer, children = [], []
    @CALLBACK
    def child(hwnd, _):
        text = ctypes.create_unicode_buffer(3000)
        api.GetWindowTextW(hwnd, text, len(text))
        children.append((hwnd, api.GetDlgCtrlID(hwnd), text.value))
        return True
    @CALLBACK
    def window(hwnd, _):
        owner = wintypes.DWORD()
        api.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value == pid:
            outer.append(hwnd)
            api.EnumChildWindows(hwnd, child, 0)
        return True
    api.EnumWindows(window, 0)
    return outer, children

def wait(predicate, timeout=15):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        result = predicate()
        if result:
            return result
        time.sleep(.05)
    raise AssertionError('NSIS harness condition timed out')

def click(hwnd):
    api.PostMessageW(hwnd, 0xF5, 0, 0)

def next_page(window):
    api.PostMessageW(window, 0x111, 1, api.GetDlgItem(window, 1))

def measure_label(hwnd, text):
    bounds, page, client = wintypes.RECT(), wintypes.RECT(), wintypes.RECT()
    parent = api.GetParent(hwnd)
    api.GetWindowRect(hwnd, ctypes.byref(bounds))
    api.MapWindowPoints(0, parent, ctypes.byref(bounds), 2)
    api.GetClientRect(parent, ctypes.byref(page))
    api.GetClientRect(hwnd, ctypes.byref(client))
    assert 0 <= bounds.top < bounds.bottom <= page.bottom, (text, bounds.bottom, page.bottom)
    dc = api.GetDC(hwnd)
    font = api.SendMessageW(hwnd, 0x31, 0, 0)
    old = gdi.SelectObject(dc, font) if font else None
    try:
        needed = wintypes.RECT(0, 0, client.right, 0)
        height = api.DrawTextW(dc, text, -1, ctypes.byref(needed), 0x400 | 0x10 | 0x800)
        assert 0 < height <= client.bottom, (text, height, client.bottom)
        return {'text': text, 'needed': height, 'available': client.bottom}
    finally:
        if old: gdi.SelectObject(dc, old)
        api.ReleaseDC(hwnd, dc)

def assert_exited(pid):
    kernel = ctypes.WinDLL('kernel32')
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x100000, False, pid)
    if handle:
        try: assert kernel.WaitForSingleObject(handle, 10000) == 0, pid
        finally: kernel.CloseHandle(handle)

results = []
for language in [1042, 1033]:
    for mode in ['success', 'failure', 'waiting', 'close']:
        (ROOT / 'app/mode.txt').write_text('waiting' if mode == 'close' else mode)
        (ROOT / 'app/owned-pids.json').unlink(missing_ok=True)
        start = subprocess.STARTUPINFO()
        start.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        start.wShowWindow = 0
        process = subprocess.Popen([str(ROOT / 'harness.exe'), f'/LANG={language}'], startupinfo=start)
        try:
            model_word = '저성능 (small)' if language == 1042 else 'Lightweight (small)'
            wait(lambda: any(text.startswith(model_word) for _, _, text in snapshot(process.pid)[1]))
            window = snapshot(process.pid)[0][0]
            labels = [measure_label(hwnd, text) for hwnd, _, text in snapshot(process.pid)[1] if text.startswith(model_word) or text.startswith(('모델 예상 합계:', 'Model estimate:'))]
            dpi = api.GetDpiForWindow(window)
            next_page(window)
            prepare_word = '설치한 모델의 변환 환경까지' if language == 1042 else 'Prepare the conversion environment'
            wait(lambda: any(text.startswith(prepare_word) for _, _, text in snapshot(process.pid)[1]))
            next_page(window)
            wait(lambda: api.IsWindowEnabled(api.GetDlgItem(window, 1)))
            next_page(window)
            ready = '준비 완료' if language == 1042 else 'Ready'
            later = '나중에 준비' if language == 1042 else 'Prepare later'
            stop = '준비 중단' if language == 1042 else 'Stop preparation'
            if mode == 'failure':
                wait(lambda: any(text == later and api.IsWindowVisible(hwnd) for hwnd, _, text in snapshot(process.pid)[1]))
                controls = snapshot(process.pid)[1]
                assert any('권한' in text or 'permissions' in text for _, _, text in controls), controls
                labels.extend(measure_label(hwnd, text) for hwnd, identifier, text in controls if identifier == 1801)
                assert not api.IsWindowEnabled(api.GetDlgItem(window, 1))
                click(next(hwnd for hwnd, _, text in controls if text == later))
            elif mode in ['waiting', 'close']:
                pids = wait(lambda: json.loads((ROOT / 'app/owned-pids.json').read_text()) if (ROOT / 'app/owned-pids.json').exists() else None)
                button = wait(lambda: next((hwnd for hwnd, _, text in snapshot(process.pid)[1] if text == stop and api.IsWindowVisible(hwnd)), None))
                if mode == 'close':
                    api.PostMessageW(window, 0x10, 0, 0)
                    prompt = wait(lambda: next((hwnd for hwnd in snapshot(process.pid)[0] if api.GetDlgItem(hwnd, 7)), None))
                    click(api.GetDlgItem(prompt, 7))
                    time.sleep(.2)
                    assert process.poll() is None
                    api.PostMessageW(window, 0x10, 0, 0)
                    prompt = wait(lambda: next((hwnd for hwnd in snapshot(process.pid)[0] if api.GetDlgItem(hwnd, 6)), None))
                    click(api.GetDlgItem(prompt, 6))
                    process.wait(timeout=10)
                    for pid in pids: assert_exited(pid)
                    results.append({'language':language,'mode':mode,'result':'pass','dpi':dpi,'labels':labels})
                    print('PASS:',language,mode,'confirmation and owned child termination',flush=True)
                    continue
                else:
                    click(button)
                    for pid in pids: assert_exited(pid)
            else:
                wait(lambda: any(text == ready for _, _, text in snapshot(process.pid)[1]))
            wait(lambda: api.IsWindowEnabled(api.GetDlgItem(window, 1)))
            next_page(window)
            launch = 'LOXT 실행하기' if language == 1042 else 'Launch LOXT'
            choices = wait(lambda: [(hwnd, text) for hwnd, _, text in snapshot(process.pid)[1] if text in [launch, '바탕화면 바로가기 만들기' if language == 1042 else 'Create a desktop shortcut']])
            for hwnd, _ in choices:
                api.SendMessageW(hwnd, 0xF1, 0, 0)
            next_page(window)
            assert process.wait(timeout=10) == 0
            assert not (ROOT / 'LOXT.lnk').exists()
            results.append({'language': language, 'mode': mode, 'result': 'pass', 'dpi':dpi, 'labels':labels})
            print('PASS:', language, mode, flush=True)
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
(RESULTS / 'nsis-results.json').write_text(json.dumps({'profile': str(ROOT), 'cases': results, 'scope': 'isolated custom pages; no registry writes, app install or model download'}, indent=2), encoding='utf8')
