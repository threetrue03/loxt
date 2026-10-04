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
    MessageBox MB_OK|MB_ICONSTOP "전사 환경의 삭제 경로를 확인하지 못했습니다." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} ${FileExists} "$1"
    ClearErrors
    RMDir /r "$1"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "모델 또는 전사 환경이 사용 중이어서 모두 삭제하지 못했습니다. 소리노트를 종료한 뒤 다시 삭제해 주세요." /SD IDOK
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
