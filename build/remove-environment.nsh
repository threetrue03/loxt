!include "${__FILEDIR__}\installer-language.nsh"
!ifndef SORINOTE_REMOVE_ENVIRONMENT
!define SORINOTE_REMOVE_ENVIRONMENT
!include LogicLib.nsh
!define /ifndef SORINOTE_DATA_ROOT "$APPDATA\sorinote-desktop"

; Delete only the dedicated transcription directory; library recordings stay.
!macro SorinoteRemoveEnvironment
  GetFullPathName $0 "${SORINOTE_DATA_ROOT}"
  GetFullPathName $1 "$0\transcription"
  ${If} $0 == ""
  ${OrIf} $1 != "$0\transcription"
    MessageBox MB_OK|MB_ICONSTOP "$(LoxtInstaller102)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} ${FileExists} "$1"
    ClearErrors
    RMDir /r "$1"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(LoxtInstaller103)" /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ; App upgrades invoke the uninstaller with --updated and preserve models.
  ${IfNot} ${isUpdated}
    !insertmacro SorinoteRemoveEnvironment
  ${EndIf}
!macroend
!endif
