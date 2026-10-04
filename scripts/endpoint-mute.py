"""Test helper: read/temporarily set mute; callers must restore the prior value."""
import ctypes as c
import sys
import soundcard as sc
from soundcard.mediafoundation import _ffi, _guidof, _com
p = sc.default_speaker()._device_ptr()
out = _ffi.new('void**')
iid = _guidof('{5CDF2C82-841E-4546-9722-0CF74078229A}')
_com.check_error(p[0][0].lpVtbl.Activate(p[0],iid,23,_ffi.NULL,out))
addr = int(_ffi.cast('uintptr_t',out[0]))
v = c.cast(addr,c.POINTER(c.POINTER(c.c_void_p))).contents
try:
    mute = c.c_int()
    c.WINFUNCTYPE(c.c_long,c.c_void_p,c.POINTER(c.c_int))(v[15])(addr,c.byref(mute))
    print(mute.value)
    if len(sys.argv) > 1:
        c.WINFUNCTYPE(c.c_long,c.c_void_p,c.c_int,c.c_void_p)(v[14])(addr,int(sys.argv[1]),None)
finally:
    c.WINFUNCTYPE(c.c_long,c.c_void_p)(v[2])(addr)
    _com.release(p)
