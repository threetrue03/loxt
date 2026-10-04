"""Private registry/app fixtures: repair, removal, cancellation, optional real CPU preparation."""
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
import winreg

WORKSPACE = Path(__file__).resolve().parents[1]
VERSION = json.loads((WORKSPACE / "package.json").read_text(encoding="utf-8"))["version"]
ROOT = Path(tempfile.mkdtemp(prefix='installer-lifecycle-', dir=WORKSPACE / 'test-results'))
APP = ROOT / 'app'
DATA = ROOT / 'data'
MODELS = DATA / 'transcription/models'
APP.mkdir(); MODELS.mkdir(parents=True)
library = DATA / 'library'
library.mkdir()
library.joinpath('recording.webm').write_bytes(b'preserve recording')
library.joinpath('transcript.txt').write_text('preserve transcript')
KEY = 'Software\\SorinoteInstallerTests\\' + uuid.uuid4().hex
compiler = next((Path(os.environ['LOCALAPPDATA']) / 'electron-builder/Cache/nsis-3.0.4.1').rglob('Bin/makensis.exe'))

def compile_source(name, code):
    source = ROOT / (name + '.nsi')
    source.write_text(code, encoding='utf-8-sig')
    subprocess.run([str(compiler), '/V2', str(source)], cwd=ROOT, check=True)
    return ROOT / (name + '.exe')

def register(version, brand='Sorinote'):
    exe = compile_source('stub', rf'''
Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "stub.exe"
VIProductVersion "{version}.0"
VIAddVersionKey ProductName "Isolated test"
VIAddVersionKey FileDescription "Isolated test"
VIAddVersionKey FileVersion "{version}.0"
VIAddVersionKey LegalCopyright "Test"
Section
SectionEnd
''')
    APP.joinpath(brand + '.exe').write_bytes(exe.read_bytes())
    for suffix, name, value in [('Install', 'InstallLocation', str(APP)), ('Uninstall', 'DisplayVersion', version)]:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, KEY + '\\' + suffix, 0, winreg.KEY_WRITE | winreg.KEY_WOW64_64KEY) as key:
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)

uninstaller = compile_source('uninstall-stub', rf'''
Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "uninstall-stub.exe"
Section
  Delete "{APP / 'Sorinote.exe'}"
  Delete "{APP / 'LOXT.exe'}"
SectionEnd
''')
APP.joinpath('Uninstall Sorinote.exe').write_bytes(uninstaller.read_bytes())
resources = APP / 'resources'
helpers = resources / 'python'
helpers.mkdir(parents=True)
subprocess.run(['node', '-e', "require('fs').symlinkSync(process.argv[1],process.argv[2],'junction')",
                str(WORKSPACE / '.runtime/python'), str(resources / 'python-runtime')], check=True)
for filename in (WORKSPACE / 'python').glob('*'):
    if filename.suffix in ['.py', '.txt']:
        shutil.copyfile(filename, helpers / filename.name)
# Simulated preparation uses the real helper/watchdog/progress protocol.
# Its owned child allows cancellation to be checked without downloading models.
helpers.joinpath('engine_prepare.py').write_text('''
import os, subprocess, sys, time
from pathlib import Path
def prepare(root, runtime, names, device, notify, models_verified=False):
    notify('engine-start', message='Cancellation test: preparing engine')
    child = subprocess.Popen([sys.executable, str(Path(__file__).with_name('owned_process.py')),
                              '--owner', str(os.getpid()), str(Path(__file__).with_name('heartbeat.py')), str(root)])
    (root / 'owned-pids.json').write_text(__import__('json').dumps([os.getpid(), child.pid]))
    child.wait()
''', encoding='utf8')
helpers.joinpath('heartbeat.py').write_text('''
import subprocess, sys, time
from pathlib import Path
root = Path(sys.argv[1])
child = subprocess.Popen([sys.executable, str(Path(__file__).with_name('unwatched.py')), str(root)])
(root / 'unwatched-pid.txt').write_text(str(child.pid))
while True:
    (root / 'heartbeat.txt').write_text(str(time.time()))
    time.sleep(.1)
''', encoding='utf8')
helpers.joinpath('unwatched.py').write_text('''
import sys, time
from pathlib import Path
root = Path(sys.argv[1])
while True:
    (root / 'unwatched-heartbeat.txt').write_text(str(time.time()))
    time.sleep(.1)
''', encoding='utf8')
shutil.copyfile(helpers / 'install_models.py', helpers / 'installer_real.py')
helpers.joinpath('install_models.py').write_text('''
import installer_real as installer
installer.model = lambda root, name: None
raise SystemExit(installer.main())
''', encoding='utf8')

harness = compile_source('harness', rf'''
Unicode true
RequestExecutionLevel user
Name "Sorinote lifecycle test"
OutFile "harness.exe"
!define VERSION "{VERSION}"
!define SORINOTE_INSTALL_KEY "{KEY}\Install"
!define SORINOTE_UNINSTALL_KEY "{KEY}\Uninstall"
!define SORINOTE_DATA_ROOT "{DATA}"
Var newDesktopLink
!include MUI2.nsh
!include "{WORKSPACE / 'build/installer.nsh'}"
!insertmacro customWelcomePage
!define MUI_PAGE_CUSTOMFUNCTION_PRE SorinoteDirectoryPre
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro customPageAfterChangeDir
!insertmacro MUI_PAGE_INSTFILES
Page custom SorinotePreparationProgressPage SorinotePreparationProgressLeave
!insertmacro customFinishPage
!insertmacro MUI_LANGUAGE "Korean"
Function .onInit
  SetRegView 64
  StrCpy $INSTDIR "{APP}"
  !insertmacro customInit
  StrCpy $SorinoteModelRoot "{MODELS}"
  StrCpy $SorinoteOptimizedState 1
  StrCpy $SorinoteStandardState 0
  StrCpy $SorinotePerformanceState 0
FunctionEnd
Section
  Call SorinoteGuard
  ${{If}} $SorinoteAction == "delete"
    Call SorinoteDeleteApp
  ${{EndIf}}
  ${{GetParameters}} $0
  ${{GetOptions}} $0 "/COPYWAIT=" $1
  ${{If}} $1 == "1"
    Sleep 8000
  ${{EndIf}}
  !insertmacro customInstall
  FileOpen $0 "{ROOT / 'route.txt'}" w
  FileWrite $0 "$SorinoteVersionState|$SorinoteAction"
  FileClose $0
SectionEnd
''')
api = ctypes.WinDLL('user32')
api.GetDlgItem.argtypes = [wintypes.HWND, ctypes.c_int]
api.GetDlgItem.restype = wintypes.HWND
api.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
api.SendMessageW.restype = ctypes.c_ssize_t
api.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
api.GetParent.argtypes = [wintypes.HWND]
api.GetParent.restype = wintypes.HWND
CALLBACK = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

def controls(pid):
    found = []
    @CALLBACK
    def visit(hwnd, _):
        owner = wintypes.DWORD()
        api.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value == pid:
            label = ctypes.create_unicode_buffer(1000)
            api.GetWindowTextW(hwnd, label, len(label))
            found.append((hwnd, label.value))
        return True
    @CALLBACK
    def window(hwnd, _):
        owner = wintypes.DWORD()
        api.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value == pid:
            visit(hwnd, 0)
            api.EnumChildWindows(hwnd, visit, 0)
        return True
    api.EnumWindows(window, 0)
    return found

def wait(predicate, timeout=30):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        result = predicate()
        if result:
            return result
        time.sleep(.1)
    raise AssertionError('Timeout: ' + repr(controls(process.pid)))

def page(text):
    wait(lambda: any(text in label for _, label in controls(process.pid)))
    return next(hwnd for hwnd, label in controls(process.pid) if 'Sorinote lifecycle test' in label)

def next_page(hwnd):
    wait(lambda: api.IsWindowEnabled(api.GetDlgItem(hwnd, 1)))
    api.PostMessageW(hwnd, 0x111, 1, api.GetDlgItem(hwnd, 1))

def launch(*args):
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    return subprocess.Popen([str(harness), *args], startupinfo=startup)

def reach_preparation(*args):
    global process
    process = launch(*args)
    hwnd = page('업데이트')
    wait(lambda: any(label.startswith('앱 삭제') for _, label in controls(process.pid)))
    labels = [label for _, label in controls(process.pid)]
    assert any(label.startswith('앱 삭제') for label in labels)
    assert not any(label.startswith(('모델 추가 설치', '설치된 소리노트 실행')) for label in labels)
    next_page(hwnd)
    hwnd = page('저성능 (small)')
    next_page(hwnd)
    hwnd = page('변환 실행 장치')
    wait(lambda: any('체크를 해제하면 모델 파일만' in label for _, label in controls(process.pid)))
    # CPU keeps real preparation independent of GPU wheel downloads.
    def class_name(child):
        name = ctypes.create_unicode_buffer(100)
        api.GetClassNameW(child, name, len(name))
        return name.value
    combo = next(child for child, _ in controls(process.pid) if class_name(child) == 'ComboBox')
    api.SendMessageW(combo, 0x14E, 2, 0)
    next_page(hwnd)
    if '/COPYWAIT=1' in args:
        return page('프로그램 파일 설치 진행률')
    hwnd = page('프로그램 파일 설치 완료')
    return hwnd

def assert_exited(pid):
    kernel = ctypes.WinDLL('kernel32')
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x100000, False, pid)
    if handle:
        try:
            assert kernel.WaitForSingleObject(handle, 5000) == 0, pid
        finally:
            kernel.CloseHandle(handle)

process = None
try:
    # Check version-dependent menu and route using isolated registry and files.
    for version, choice, forbidden, route in [
        ('0.7.2', '업데이트', '앱 복구', 'older|update'),
        (VERSION, '앱 복구', '업데이트', 'same|repair'),
        ('99.0.0', '앱 삭제 ·', '앱 복구', None),
    ]:
        register(version)
        process = launch()
        hwnd = page(choice)
        labels = [label for _, label in controls(process.pid)]
        assert forbidden not in labels, labels
        if route is None:
            assert '업데이트' not in labels
        api.PostMessageW(hwnd, 0x10, 0, 0)
        process.wait(10)
        if route:
            process = launch('/S', '/MODELS=none')
            assert process.wait(20) == 0
            assert ROOT.joinpath('route.txt').read_text() == route
            assert library.joinpath('recording.webm').read_bytes() == b'preserve recording'
    process = launch('/S', '/ACTION=update', '/MODELS=none')
    assert process.wait(20) == 3  # Newer installed version cannot be overwritten.
    for suffix in ['Install', 'Uninstall']:
        winreg.DeleteKeyEx(winreg.HKEY_CURRENT_USER, KEY + '\\' + suffix, winreg.KEY_WOW64_64KEY)
    APP.joinpath('Sorinote.exe').unlink()
    process = launch()
    hwnd = page('설치 위치 선택')
    next_page(hwnd)
    hwnd = page('저성능 (small)')
    labels = [label for _, label in controls(process.pid)]
    assert '앱 복구' not in labels and '업데이트' not in labels
    api.PostMessageW(hwnd, 0x10, 0, 0)
    process.wait(10)
    print('PASS: new/older/same/newer menus and update/repair routes; library preserved', flush=True)
    register('0.7.2')
    partial = MODELS / 'small/model.bin.part'
    partial.parent.mkdir()
    partial.write_bytes(b'resume this download')
    for close in [False, True]:
        MODELS.parent.joinpath('owned-pids.json').unlink(missing_ok=True)
        MODELS.parent.joinpath('unwatched-pid.txt').unlink(missing_ok=True)
        hwnd = reach_preparation()
        wait(lambda: MODELS.parent.joinpath('owned-pids.json').exists())
        pids = json.loads(MODELS.parent.joinpath('owned-pids.json').read_text())
        wait(lambda: MODELS.parent.joinpath('heartbeat.txt').exists())
        wait(lambda: MODELS.parent.joinpath('unwatched-pid.txt').exists())
        pids.append(int(MODELS.parent.joinpath('unwatched-pid.txt').read_text()))
        # Refresh the outer window after the asynchronous page transition.
        hwnd = page('Cancellation test: preparing engine')
        assert api.IsWindowEnabled(api.GetDlgItem(hwnd, 2))
        if close:
            api.PostMessageW(hwnd, 0x10, 0, 0)
        else:
            api.PostMessageW(hwnd, 0x111, 2, api.GetDlgItem(hwnd, 2))
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            print('CANCEL_TIMEOUT', repr(controls(process.pid)), flush=True)
            raise
        for pid in pids:
            assert_exited(pid)
        assert library.joinpath('recording.webm').read_bytes() == b'preserve recording'
        assert partial.read_bytes() == b'resume this download'
    print('PASS: Cancel and window close stop preparation and its owned child; library preserved', flush=True)
    hwnd = reach_preparation('/COPYWAIT=1')
    assert api.IsWindowEnabled(api.GetDlgItem(hwnd, 2))
    api.PostMessageW(hwnd, 0x111, 2, api.GetDlgItem(hwnd, 2))
    process.wait(timeout=5)
    print('PASS: cancellation during app-file stage', flush=True)
    register('99.0.0')
    process = launch('/S', '/ACTION=repair', '/MODELS=none')
    assert process.wait(20) == 3
    process = launch('/S', '/ACTION=delete')
    assert process.wait(20) == 0
    assert not APP.joinpath('Sorinote.exe').exists()
    assert not MODELS.parent.exists()
    assert library.joinpath('recording.webm').read_bytes() == b'preserve recording'
    assert library.joinpath('transcript.txt').read_text() == 'preserve transcript'
    print('PASS: newer-version repair blocked; old uninstaller removes app plus models/environment, preserves library', flush=True)
    register(VERSION, 'LOXT')
    APP.joinpath('Uninstall LOXT.exe').write_bytes(uninstaller.read_bytes())
    MODELS.mkdir(parents=True)
    MODELS.joinpath('model.bin').write_bytes(b'remove model')
    process = launch()
    hwnd = page('앱 복구')
    radio = next(child for child, label in controls(process.pid) if label.startswith('앱 삭제 ·'))
    api.SendMessageW(radio, 0xF5, 0, 0)  # BM_CLICK
    next_page(hwnd)
    wait(lambda: any('LOXT 앱과 다운로드한 모델' in label for _, label in controls(process.pid)))
    prompt = api.GetParent(next(child for child, label in controls(process.pid) if 'LOXT 앱과 다운로드한 모델' in label))
    yes = wait(lambda: api.GetDlgItem(prompt, 6))
    api.PostMessageW(prompt, 0x111, 6, yes)
    wait(lambda: any('앱과 모델, 변환 환경을 삭제했습니다.' in label for _, label in controls(process.pid)))
    prompt = api.GetParent(next(child for child, label in controls(process.pid) if '앱과 모델, 변환 환경을 삭제했습니다.' in label))
    ok = wait(lambda: next((child for child, label in controls(process.pid) if label in ['확인', 'OK']), None))
    api.PostMessageW(ok, 0xF5, 0, 0)  # BM_CLICK respects the dialog's actual control ID.
    assert process.wait(10) == 0
    assert not APP.joinpath('LOXT.exe').exists()
    assert not MODELS.parent.exists()
    assert library.joinpath('recording.webm').read_bytes() == b'preserve recording'
    print('PASS: GUI delete choice confirms removal and preserves recordings', flush=True)
    hook_data = ROOT / 'hook-data'
    hook_data.joinpath('transcription/models').mkdir(parents=True)
    hook_data.joinpath('transcription/models/model.bin').write_bytes(b'model')
    hook_data.joinpath('library').mkdir()
    hook_data.joinpath('library/recording.webm').write_bytes(b'keep')
    for updated in [True, False]:
        hook = compile_source('uninstall-hook-' + str(updated), rf'''
Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "uninstall-hook-{updated}.exe"
!define SORINOTE_DATA_ROOT "{hook_data}"
!define isUpdated "1 = {1 if updated else 0}"
!include "{WORKSPACE / 'build/remove-environment.nsh'}"
Section
  !insertmacro customUnInstall
SectionEnd
''')
        subprocess.run([str(hook)], check=True, timeout=10)
        assert hook_data.joinpath('transcription').exists() == updated
        assert hook_data.joinpath('library/recording.webm').read_bytes() == b'keep'
    print('PASS: uninstaller preserves models on upgrade, deletes them on removal, keeps recordings', flush=True)
    if len(sys.argv) > 1:
        cached = Path(sys.argv[1]).resolve()
        assert cached.is_relative_to(WORKSPACE / 'test-results')
        MODELS.mkdir(parents=True)
        shutil.copytree(cached / 'small', MODELS / 'small')
        for name in ['engine_prepare.py', 'install_models.py']:
            shutil.copyfile(WORKSPACE / 'python' / name, helpers / name)
        register('0.7.2')
        hwnd = reach_preparation()
        wait(lambda: any(label == '준비 완료' for _, label in controls(process.pid)), timeout=240)
        prepared = json.loads(MODELS.parent.joinpath('prepared.json').read_text())
        assert prepared['validations']['small:cpu:int8']
        assert MODELS.joinpath('installer-preparation.log').exists()
        next_page(hwnd)
        page('LOXT 실행하기')
        for child, label in controls(process.pid):
            if label in ['LOXT 실행하기', '바탕화면 바로가기 만들기']:
                api.SendMessageW(child, 0xF1, 0, 0)
        next_page(hwnd)
        assert process.wait(10) == 0
        print('PASS: checked GUI preparation installs real CPU engine and validates small before Finish', flush=True)
finally:
    if process and process.poll() is None:
        process.terminate(); process.wait(10)
    for suffix in ['Install', 'Uninstall', '']:
        try:
            winreg.DeleteKeyEx(winreg.HKEY_CURRENT_USER, KEY + ('\\' + suffix if suffix else ''), winreg.KEY_WOW64_64KEY, 0)
        except FileNotFoundError:
            pass
print('TEST_PROFILE', ROOT)
