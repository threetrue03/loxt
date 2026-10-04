"""Compatibility entry point for the current installer lifecycle checks."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('installer-lifecycle-smoke.py')), run_name='__main__')
