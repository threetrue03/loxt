"""Exercise the real NSIS model page/hook without installing/uninstalling the app."""
import ctypes
from ctypes import wintypes
import os
import shutil
from pathlib import Path
import subprocess
import struct
import sys
import tempfile
import time
import zlib

WORKSPACE = Path(__file__).resolve().parents[1]
TEST_ROOT = WORKSPACE / 'test-results'
TEST_ROOT.mkdir(exist_ok=True)
ROOT = Path(tempfile.mkdtemp(prefix='installer-models-', dir=TEST_ROOT))
compiler = next((Path(os.environ['LOCALAPPDATA']) / 'electron-builder/Cache/nsis-3.0.4.1').rglob('Bin/makensis.exe'))
models = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 and sys.argv[1] != '--finish' else ROOT / 'models'
assert models.is_relative_to(TEST_ROOT), 'Only an isolated test cache may be used'
models.mkdir(parents=True, exist_ok=True)
source = ROOT / 'harness.nsi'
source.write_text(r'''
Unicode true
RequestExecutionLevel user
Name "LOXT model installer test"
Var TestDownload
OutFile "harness.exe"
!include MUI2.nsh
!include "__INCLUDE__"
!insertmacro customPageAfterChangeDir
 !insertmacro MUI_PAGE_INSTFILES
Page custom SorinotePreparationProgressPage TestPreparationLeave
!insertmacro MUI_LANGUAGE "Korean"
Function .onInit
  !insertmacro customInit
  StrCpy $INSTDIR "__APP__"
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/APP=" $1
  ${IfNot} ${Errors}
    StrCpy $INSTDIR $1
  ${EndIf}
  StrCpy $SorinoteModelRoot "__MODELS__"
  StrCpy $SorinoteOptimizedState 0
  StrCpy $SorinoteStandardState 0
  StrCpy $SorinotePerformanceState 0
FunctionEnd
Section
  Sleep 1200
  FileOpen $0 "__RESULT__" w
  FileWrite $0 $SorinoteModels
  FileClose $0
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/DOWNLOAD=" $TestDownload
  ${If} $TestDownload == "1"
    !insertmacro customInstall
    FileOpen $0 "__DOWNLOAD_RESULT__" w
    FileWrite $0 $SorinoteModelResult
    FileClose $0
  ${EndIf}
  ${If} $TestDownload != "1"
    StrCpy $SorinoteModels ""
  ${EndIf}
  Sleep 1200
SectionEnd
Function TestPreparationLeave
  Call SorinotePreparationProgressLeave
  FileOpen $0 "__DOWNLOAD_RESULT__" w
  FileWrite $0 $SorinoteModelResult
  FileClose $0
FunctionEnd
'''.replace('__INCLUDE__', str(WORKSPACE / 'build/installer.nsh'))
    .replace('__APP__', str(WORKSPACE / 'release/stage5/win-unpacked'))
    .replace('__MODELS__', str(models))
    .replace('__RESULT__', str(ROOT / 'selection.txt'))
    .replace('__DOWNLOAD_RESULT__', str(ROOT / 'download.txt')), encoding='utf8')
subprocess.run([str(compiler), '/V2', str(source)], cwd=ROOT, check=True)

user32 = ctypes.windll.user32
CALLBACK = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
user32.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.SendMessageW.restype = wintypes.LRESULT if hasattr(wintypes, 'LRESULT') else ctypes.c_ssize_t
user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.GetDlgItem.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetDlgItem.restype = wintypes.HWND

def windows(pid):
    found = []
    @CALLBACK
    def visit(hwnd, _):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value == pid:
            found.append(hwnd)
        return True
    user32.EnumWindows(visit, 0)
    return found

def controls(hwnd):
    found = []
    @CALLBACK
    def visit(child, _):
        label = ctypes.create_unicode_buffer(512)
        user32.GetWindowTextW(child, label, len(label))
        found.append((child, label.value))
        return True
    user32.EnumChildWindows(hwnd, visit, 0)
    return found

def assert_label_fits(child, text):
    """Measure actual Windows font/wrapping and the containing page bounds."""
    user32.GetParent.argtypes = [wintypes.HWND]
    user32.GetParent.restype = wintypes.HWND
    user32.GetDC.argtypes = [wintypes.HWND]
    user32.GetDC.restype = wintypes.HDC
    user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
    user32.DrawTextW.argtypes = [wintypes.HDC, wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(wintypes.RECT), wintypes.UINT]
    gdi = ctypes.WinDLL('gdi32')
    gdi.SelectObject.argtypes = [wintypes.HDC, wintypes.HANDLE]
    gdi.SelectObject.restype = wintypes.HANDLE
    parent = user32.GetParent(child)
    bounds, page, client = wintypes.RECT(), wintypes.RECT(), wintypes.RECT()
    user32.GetWindowRect(child, ctypes.byref(bounds))
    user32.MapWindowPoints(0, parent, ctypes.byref(bounds), 2)
    user32.GetClientRect(parent, ctypes.byref(page))
    user32.GetClientRect(child, ctypes.byref(client))
    assert 0 <= bounds.top < bounds.bottom <= page.bottom, (text, bounds.bottom, page.bottom)
    dc = user32.GetDC(child)
    font = user32.SendMessageW(child, 0x31, 0, 0)  # WM_GETFONT
    previous = gdi.SelectObject(dc, font) if font else None
    try:
        needed = wintypes.RECT(0, 0, client.right, 0)
        height = user32.DrawTextW(dc, text, -1, ctypes.byref(needed), 0x400 | 0x10 | 0x800)
        assert 0 < height <= client.bottom, (text, height, client.bottom)
    finally:
        if previous:
            gdi.SelectObject(dc, previous)
        user32.ReleaseDC(child, dc)

def capture_test_window(hwnd):
    """Capture only this test-owned installer window for layout review."""
    gdi = ctypes.WinDLL('gdi32')
    user32.GetDC.argtypes = [wintypes.HWND]
    user32.GetDC.restype = wintypes.HDC
    user32.PrintWindow.argtypes = [wintypes.HWND, wintypes.HDC, wintypes.UINT]
    user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
    gdi.CreateCompatibleDC.argtypes = [wintypes.HDC]
    gdi.CreateCompatibleDC.restype = wintypes.HDC
    gdi.CreateCompatibleBitmap.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int]
    gdi.CreateCompatibleBitmap.restype = wintypes.HBITMAP
    gdi.SelectObject.argtypes = [wintypes.HDC, wintypes.HANDLE]
    gdi.SelectObject.restype = wintypes.HANDLE
    gdi.GetDIBits.argtypes = [wintypes.HDC, wintypes.HBITMAP, wintypes.UINT, wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT]
    gdi.DeleteObject.argtypes = [wintypes.HANDLE]
    gdi.DeleteDC.argtypes = [wintypes.HDC]
    rect = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    width, height = rect.right - rect.left, rect.bottom - rect.top
    original = user32.GetDC(hwnd)
    dc = gdi.CreateCompatibleDC(original)
    bitmap = gdi.CreateCompatibleBitmap(original, width, height)
    previous = gdi.SelectObject(dc, bitmap)
    try:
        assert user32.PrintWindow(hwnd, dc, 2)
        gdi.SelectObject(dc, previous)
        info = ctypes.create_string_buffer(struct.pack('<IiiHHIIiiII', 40, width, -height, 1, 32, 0, width * height * 4, 0, 0, 0, 0))
        pixels = ctypes.create_string_buffer(width * height * 4)
        assert gdi.GetDIBits(dc, bitmap, 0, height, pixels, info, 0) == height
        source = pixels.raw
        rgb = bytearray(width * height * 3)
        rgb[0::3], rgb[1::3], rgb[2::3] = source[2::4], source[1::4], source[0::4]
        rows = b''.join(b'\0' + rgb[y * width * 3:(y + 1) * width * 3] for y in range(height))
        def chunk(kind, data):
            return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
        (ROOT / 'installer-progress.png').write_bytes(png)
    finally:
        gdi.SelectObject(dc, previous)
        gdi.DeleteObject(bitmap); gdi.DeleteDC(dc); user32.ReleaseDC(hwnd, original)

def wait_for(predicate, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(.1)
    raise RuntimeError('NSIS test timed out')

def run_case(selected, download=False):
    result = ROOT / 'selection.txt'
    result.unlink(missing_ok=True)
    (ROOT / 'download.txt').unlink(missing_ok=True)
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    args = [str(ROOT / 'harness.exe'), f'/DOWNLOAD={int(bool(download))}']
    if download == 'fixture':
        args.append(f'/APP={ROOT / "fixture-app"}')
    process = subprocess.Popen(args, startupinfo=startup)
    try:
        def model_page():
            for hwnd in windows(process.pid):
                checks = [(child, label) for child, label in controls(hwnd)
                          if label.startswith(('저성능 (small)', '표준 (large-v3-turbo)', '고성능 (large-v3)'))]
                if len(checks) == 3:
                    return hwnd, checks
        hwnd, checks = wait_for(model_page)
        user32.ShowWindow(hwnd, 0)
        for child, label in checks:
            name = 'small' if label.startswith('저성능') else 'large-v3-turbo' if label.startswith('표준') else 'large-v3'
            user32.SendMessageW(child, 0xF1, int(name in selected), 0)  # BM_SETCHECK
        # Hidden test dialogs may be inactive; send the button's normal command.
        user32.SendMessageW(hwnd, 0x111, 1, user32.GetDlgItem(hwnd, 1))  # WM_COMMAND / BN_CLICKED
        if selected:
            def preparation_page():
                return next((child for child, label in controls(hwnd) if label.startswith('설치한 모델의 변환 환경까지')), None)
            preparation = wait_for(preparation_page)
            wait_for(lambda: any('체크를 해제하면 모델 파일만' in label for _, label in controls(hwnd)))
            for child, label in controls(hwnd):
                if label.startswith(('기존 모델 선택은 유지됩니다.', '전사 엔진·실행 라이브러리')):
                    assert_label_fits(child, label)
            try:
                gpu = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'],
                                     capture_output=True, text=True, timeout=15)
            except FileNotFoundError:
                gpu = None
            if gpu is not None and gpu.returncode == 0 and gpu.stdout.strip():
                assert any('감지된 GPU: ' + gpu.stdout.strip() in label for _, label in controls(hwnd)), controls(hwnd)
            wait_for(lambda: user32.IsWindowEnabled(user32.GetDlgItem(hwnd, 1)))
            assert user32.SendMessageW(preparation, 0xF0, 0, 0) == 1
            user32.SendMessageW(preparation, 0xF1, 0, 0)
            user32.PostMessageW(hwnd, 0x111, 1, user32.GetDlgItem(hwnd, 1))
        def progress_page():
            items = {user32.GetDlgCtrlID(child): (child, label) for child, label in controls(hwnd)}
            return items if all(key in items for key in [1800, 1801, 1802, 1803, 1804, 1805]) else None
        try:
            items = wait_for(progress_page)
        except RuntimeError:
            import json
            print('TEST_DIALOG', json.dumps([label for _, label in controls(hwnd)]), flush=True)
            raise
        assert '1/3단계' in items[1800][1], items[1800][1]
        assert '프로그램 파일 설치 진행률' == items[1805][1]
        assert '프로그램 설치 중' in items[1801][1]
        assert 1803 in items, 'Separate model download progress bar missing'
        wait_for(lambda: result.exists())
        assert result.read_text('utf8') == ','.join(selected), result.read_bytes()
        if download:
            # App files finish first; preparation uses a cancellable custom page.
            (ROOT / 'download.txt').unlink(missing_ok=True)
            wait_for(lambda: user32.IsWindowEnabled(user32.GetDlgItem(hwnd, 1)))
            user32.PostMessageW(hwnd, 0x111, 1, user32.GetDlgItem(hwnd, 1))
            try: wait_for(lambda: any(label == '프로그램 파일 설치 완료' for _, label in controls(hwnd)))
            except RuntimeError:
                print('PROGRESS_CONTROLS', [label for _,label in controls(hwnd)], flush=True)
                raise
            if download == 'fixture':
                observed = set()
                deadline = time.monotonic() + 30
                while progress_page()[1800][1] != '준비 완료' and time.monotonic() < deadline:
                    current = progress_page()
                    if '40%' in current[1804][1]:
                        observed.add(current[1802][1])
                        assert '2/3단계' in current[1800][1]
                        assert 'MB /' in current[1804][1]
                        assert user32.SendMessageW(current[1803][0], 0x408, 0, 0) == 40
                        if 'large-v3-turbo' in current[1802][1] and not (ROOT / 'installer-progress.png').exists():
                            time.sleep(.4)  # Allow Windows' native progress animation to settle.
                            capture_test_window(hwnd)
                    time.sleep(.1)
                assert any('저성능 (small) · 모델 1/2' in item for item in observed), observed
                assert any('표준 (large-v3-turbo) · 모델 2/2' in item for item in observed), observed
            wait_for(lambda: progress_page()[1800][1] == '준비 완료', timeout=120)
            items = progress_page()
            assert '준비 완료' in items[1800][1]
            assert '선택 모델 설치 중' in items[1801][1]
            assert selected[-1] in items[1802][1]
            assert '무결성 확인 완료' in items[1804][1]
            assert user32.SendMessageW(items[1803][0], 0x408, 0, 0) == 100  # PBM_GETPOS
        wait_for(lambda: user32.IsWindowEnabled(user32.GetDlgItem(hwnd, 1)))
        user32.SendMessageW(hwnd, 0x111, 1, user32.GetDlgItem(hwnd, 1))
        assert process.wait(timeout=10) == 0
    finally:
        if process.poll() is None:
            process.terminate(); process.wait(timeout=10)

def finish_tests():
    app_root = ROOT / 'finish-app'
    desktop = ROOT / 'test-desktop'
    app_root.mkdir(); desktop.mkdir()
    marker = ROOT / 'app-ran.txt'
    shortcut = desktop / 'LOXT.lnk'
    stub = ROOT / 'stub.nsi'
    stub.write_text(r'''
Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "__EXE__"
Section
  FileOpen $0 "__MARKER__" w
  FileWrite $0 "ran"
  FileClose $0
SectionEnd
'''.replace('__EXE__', str(app_root / 'Sorinote.exe')).replace('__MARKER__', str(marker)), encoding='utf8')
    subprocess.run([str(compiler), '/V1', str(stub)], check=True)
    finish = ROOT / 'finish.nsi'
    finish.write_text(r'''
Unicode true
RequestExecutionLevel user
Name "Sorinote"
OutFile "__HARNESS__"
Var newDesktopLink
!include MUI2.nsh
!include "__INCLUDE__"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro customFinishPage
!insertmacro MUI_LANGUAGE "Korean"
Function .onInit
  StrCpy $INSTDIR "__APP__"
  StrCpy $newDesktopLink "__SHORTCUT__"
  StrCpy $SorinoteFinishTitle "LOXT 설치 완료"
  StrCpy $SorinoteFinishText "테스트 설치를 완료했습니다. 마침에서 선택한 동작을 확인합니다."
FunctionEnd
Section
SectionEnd
'''.replace('__HARNESS__', str(ROOT / 'finish.exe'))
        .replace('__INCLUDE__', str(WORKSPACE / 'build/installer.nsh'))
        .replace('__APP__', str(app_root)).replace('__SHORTCUT__', str(shortcut)), encoding='utf-8-sig')
    subprocess.run([str(compiler), '/V1', str(finish)], check=True)
    for run, link in [(False, False), (True, False), (False, True), (True, True)]:
        marker.unlink(missing_ok=True); shortcut.unlink(missing_ok=True)
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
        process = subprocess.Popen([str(ROOT / 'finish.exe')], startupinfo=startup)
        try:
            def find_finish():
                for hwnd in windows(process.pid):
                    choices = {label: child for child, label in controls(hwnd)
                               if label in ['LOXT 실행하기', '바탕화면 바로가기 만들기']}
                    if len(choices) == 2:
                        return hwnd, choices
                    button = user32.GetDlgItem(hwnd, 1)
                    caption = ctypes.create_unicode_buffer(128)
                    user32.GetWindowTextW(button, caption, len(caption))
                    if button and user32.IsWindowEnabled(button) and '다음' in caption.value:
                        user32.SendMessageW(hwnd, 0x111, 1, button)
            hwnd, choices = wait_for(find_finish)
            user32.ShowWindow(hwnd, 0)
            assert user32.SendMessageW(choices['LOXT 실행하기'], 0xF0, 0, 0) == 1
            assert user32.SendMessageW(choices['바탕화면 바로가기 만들기'], 0xF0, 0, 0) == 1
            user32.SendMessageW(choices['LOXT 실행하기'], 0xF1, int(run), 0)
            user32.SendMessageW(choices['바탕화면 바로가기 만들기'], 0xF1, int(link), 0)
            assert not marker.exists() and not shortcut.exists(), 'Actions occurred before Finish'
            if run and link:
                capture_test_window(hwnd)
                (ROOT / 'installer-progress.png').rename(ROOT / 'installer-finish.png')
            user32.SendMessageW(hwnd, 0x111, 1, user32.GetDlgItem(hwnd, 1))
            assert process.wait(timeout=15) == 0
            if run:
                wait_for(marker.exists, timeout=10)
            assert marker.exists() == run
            assert shortcut.exists() == link
        finally:
            if process.poll() is None:
                process.terminate(); process.wait(timeout=10)
    print('PASS: final page has two checked-by-default choices; all four combinations run/create only on Finish')
    print('TEST_PROFILE', ROOT)

if '--finish' in sys.argv:
    finish_tests()
    raise SystemExit(0)

run_case(['small', 'large-v3-turbo', 'large-v3'])
run_case(['large-v3-turbo', 'large-v3'])
run_case([])
print('PASS: real NSIS checkboxes support all three, multiple selection and skipping models')
if (models / 'small/model.bin').is_file():
    run_case(['small'], download=True)
    print('PASS: actual NSIS hook uses bundled Python/shared cache and verifies installed small model')
    (ROOT / 'download.txt').unlink(missing_ok=True)
    subprocess.run([str(ROOT / 'harness.exe'), '/S', '/MODELS=small', '/PREPARE=0', '/DOWNLOAD=1'],
                   check=True, timeout=120)
    assert (ROOT / 'download.txt').read_text() == '0'
    assert (ROOT / 'selection.txt').read_text() == 'small'
    print('PASS: silent selected-model install works without a progress window')

# Isolated event fixture exercises the production helper/UI at intermediate percentages.
# It performs no network downloads and is never included in the installed app.
fixture_resources = ROOT / 'fixture-app/resources'
fixture_python = fixture_resources / 'python'
fixture_python.mkdir(parents=True)
for file in (WORKSPACE / 'python').glob('*.py'):
    shutil.copyfile(file, fixture_python / ('installer_model_real.py' if file.name == 'install_models.py' else file.name))
subprocess.run(['node', '-e', "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')",
                str(WORKSPACE / '.runtime/python'), str(fixture_resources / 'python-runtime')], check=True)
(fixture_python / 'install_models.py').write_text('''
import time
import downloads
import installer_model_real as installer
def model(root, name):
    total = 483546902 if name == 'small' else 1617884929
    for current in [0, (total * 2 + 4) // 5, total]:
        downloads.emit('download', name='model.bin', current=current, total=total)
        time.sleep(1)
installer.model = model
raise SystemExit(installer.main())
''', encoding='utf8')
run_case(['small', 'large-v3-turbo'], download='fixture')
print('PASS: live Unicode model names, counts, MB and separate progress bar update at 40%; next model resets progress')
print('TEST_PROFILE', ROOT)
