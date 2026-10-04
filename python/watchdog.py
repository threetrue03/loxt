"""Stop private Python work if its owning desktop process disappears."""
import ctypes
from ctypes import wintypes
import os
import threading
import subprocess


def watch_parent(pid):
    if not pid or os.name != "nt":
        return
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE only
    if not handle:
        raise RuntimeError("앱 실행 상태를 확인하지 못했습니다. 앱을 다시 실행해 주세요.")

    def wait():
        status = kernel.WaitForSingleObject(handle, 0xFFFFFFFF)
        kernel.CloseHandle(handle)
        if status == 0:
            # venv/ensurepip can spawn grandchildren without their own watcher.
            # Stop this process's entire tree before releasing its preparation lock.
            try:
                subprocess.run([os.path.join(os.environ['SystemRoot'], 'System32', 'taskkill.exe'),
                                '/PID', str(os.getpid()), '/T', '/F'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=0x08000000, timeout=10)
            except (OSError, KeyError, subprocess.TimeoutExpired):
                pass
            os._exit(1)  # parent is gone; no result should be saved by this worker

    threading.Thread(target=wait, daemon=True).start()
