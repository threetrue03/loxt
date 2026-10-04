!ifndef SORINOTE_GPU_DETECTION
!define SORINOTE_GPU_DETECTION
!include x64.nsh

; NSIS runs as a 32-bit process even when installing the x64 application.
; Sysnative bypasses Windows' System32 -> SysWOW64 redirection.
; Return the command exit code in $0 and its output in $1.
!macro SorinoteQueryGpu QUERY
  Push $R9
  StrCpy $R9 "nvidia-smi"
  ${If} ${RunningX64}
    ${If} ${FileExists} "$WINDIR\Sysnative\nvidia-smi.exe"
      StrCpy $R9 "$WINDIR\Sysnative\nvidia-smi.exe"
    ${EndIf}
  ${EndIf}
  nsExec::ExecToStack /TIMEOUT=10000 '"$R9" ${QUERY}'
  Pop $0
  Pop $1
  Pop $R9
!macroend
!endif
