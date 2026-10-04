"""Check GPU queries from the same 32-bit NSIS host used by the installer."""
import os
from pathlib import Path
import subprocess
import tempfile

workspace = Path(__file__).resolve().parents[1]
root = Path(tempfile.mkdtemp(prefix='installer-gpu-', dir=workspace / 'test-results'))
compiler = next((Path(os.environ['LOCALAPPDATA']) / 'electron-builder/Cache/nsis-3.0.4.1').rglob('Bin/makensis.exe'))
expected = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'],
                          capture_output=True, text=True, check=True).stdout.strip()
expected_memory = subprocess.run(['nvidia-smi', '--query-gpu=memory.total', '--format=csv,noheader,nounits'],
                                 capture_output=True, text=True, check=True).stdout.strip()
source = root / 'gpu.nsi'
source.write_text(r'''
Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "Sorinote isolated GPU detection test"
OutFile "gpu.exe"
!include LogicLib.nsh
!include FileFunc.nsh
!include "__INCLUDE__"
Section
  nsExec::ExecToStack /TIMEOUT=10000 'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader'
  Pop $0
  Pop $1
  FileOpen $2 "__BASELINE__" w
  FileWriteUTF16LE $2 "$0|$1"
  FileClose $2
  !insertmacro SorinoteQueryGpu "--query-gpu=name,memory.total --format=csv,noheader"
  FileOpen $2 "__HARDWARE__" w
  FileWriteUTF16LE $2 "$0|$1"
  FileClose $2
  !insertmacro SorinoteQueryGpu "--query-gpu=memory.total --format=csv,noheader,nounits"
  FileOpen $2 "__MEMORY__" w
  FileWriteUTF16LE $2 "$0|$1"
  FileClose $2
SectionEnd
'''.replace('__INCLUDE__', str(workspace / 'build/gpu-detection.nsh'))
    .replace('__BASELINE__', str(root / 'baseline.txt'))
    .replace('__HARDWARE__', str(root / 'hardware.txt'))
    .replace('__MEMORY__', str(root / 'memory.txt')), encoding='utf-8-sig')
subprocess.run([str(compiler), '/V2', str(source)], cwd=root, check=True)
subprocess.run([str(root / 'gpu.exe')], cwd=root, check=True, timeout=40)
hardware = (root / 'hardware.txt').read_text(encoding='utf-16-le').strip()
memory = (root / 'memory.txt').read_text(encoding='utf-16-le').strip()
assert hardware == '0|' + expected, hardware
assert memory == '0|' + expected_memory, memory
print('PASS: native NSIS detects ' + expected)
print('PASS: model recommendation query sees ' + expected_memory + ' MiB')
print('Original 32-bit query: ' + (root / 'baseline.txt').read_text(encoding='utf-16-le').strip())
