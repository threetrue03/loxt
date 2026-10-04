"""Run one Python module/script and exit if its preparation owner disappears."""
import runpy
import sys
from watchdog import watch_parent

watch_parent(int(sys.argv[2]))
arguments = sys.argv[3:]
if arguments[0] == '-m':
    sys.argv = [arguments[1], *arguments[2:]]
    runpy.run_module(arguments[1], run_name='__main__', alter_sys=True)
else:
    sys.argv = arguments
    runpy.run_path(arguments[0], run_name='__main__')
