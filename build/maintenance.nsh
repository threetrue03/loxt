; Included only for the installer. Tests override these keys with private HKCU keys.
!include WordFunc.nsh
!define /ifndef VERSION "1.10.0"
!ifdef APP_GUID
  !define /ifndef SORINOTE_INSTALL_KEY "Software\${APP_GUID}"
!endif
!ifdef UNINSTALL_APP_KEY
  !define /ifndef SORINOTE_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
!endif
!define /ifndef SORINOTE_INSTALL_KEY "Software\9b83cbcd-63ef-57a3-b4f2-9d795e411c88"
!define /ifndef SORINOTE_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\9b83cbcd-63ef-57a3-b4f2-9d795e411c88"
Var SorinoteAction
Var SorinoteInstalledDir
Var SorinoteInstalledVersion
Var SorinoteInstalledExe
Var SorinoteUninstaller
Var SorinoteVersionState
Var SorinoteToolsRoot
Var SorinoteFirstStage
Var SorinoteChoiceDelete
Var SorinoteChoiceRepair

Function SorinoteNumericVersion
  Pop $0
  StrCpy $1 0
  StrCpy $3 0
  numeric_version_loop:
  StrCpy $2 $0 1 $1
  ${If} $2 == ""
    Push $3
    Return
  ${EndIf}
  ${If} $2 == "."
    ${If} $3 == 0
      Push 0
      Return
    ${EndIf}
    StrCpy $3 0
  ${Else}
    IntFmt $4 "%u" $2
    ${If} $4 != $2
      Push 0
      Return
    ${EndIf}
    StrCpy $3 1
  ${EndIf}
  IntOp $1 $1 + 1
  Goto numeric_version_loop
FunctionEnd

Function SorinoteDetectInstallation
  StrCpy $SorinoteInstalledDir ""
  StrCpy $SorinoteInstalledVersion ""
  StrCpy $SorinoteVersionState "new"
  ReadRegStr $0 HKCU "${SORINOTE_INSTALL_KEY}" InstallLocation
  ${If} ${FileExists} "$0\Sorinote.exe"
  ${OrIf} ${FileExists} "$0\LOXT.exe"
    StrCpy $SorinoteInstalledDir $0
    ReadRegStr $SorinoteInstalledVersion HKCU "${SORINOTE_UNINSTALL_KEY}" DisplayVersion
  ${Else}
    ReadRegStr $0 HKLM "${SORINOTE_INSTALL_KEY}" InstallLocation
    ${If} ${FileExists} "$0\Sorinote.exe"
    ${OrIf} ${FileExists} "$0\LOXT.exe"
      StrCpy $SorinoteInstalledDir $0
      ReadRegStr $SorinoteInstalledVersion HKLM "${SORINOTE_UNINSTALL_KEY}" DisplayVersion
    ${ElseIf} ${FileExists} "$INSTDIR\Sorinote.exe"
      StrCpy $SorinoteInstalledDir $INSTDIR
    ${ElseIf} ${FileExists} "$INSTDIR\LOXT.exe"
      StrCpy $SorinoteInstalledDir $INSTDIR
    ${EndIf}
  ${EndIf}
  ${If} $SorinoteInstalledDir == ""
    Return
  ${EndIf}
  Push $SorinoteInstalledVersion
  Call SorinoteNumericVersion
  Pop $0
  ${If} $0 == 0
    StrCpy $SorinoteInstalledVersion ""
  ${EndIf}
  ; Check the executable too, so stale registry data cannot permit a downgrade.
  ClearErrors
  StrCpy $SorinoteInstalledExe "$SorinoteInstalledDir\LOXT.exe"
  ${IfNot} ${FileExists} "$SorinoteInstalledExe"
    StrCpy $SorinoteInstalledExe "$SorinoteInstalledDir\Sorinote.exe"
  ${EndIf}
  GetDLLVersion "$SorinoteInstalledExe" $1 $2
  ${IfNot} ${Errors}
    IntOp $3 $1 >> 16
    IntOp $4 $1 & 0xFFFF
    IntOp $5 $2 >> 16
    IntOp $6 $2 & 0xFFFF
    StrCpy $7 "$3.$4.$5.$6"
    ${VersionCompare} $7 $SorinoteInstalledVersion $8
    ${If} $SorinoteInstalledVersion == ""
    ${OrIf} $8 == 1
      StrCpy $SorinoteInstalledVersion $7
    ${EndIf}
  ${EndIf}
  ${If} $SorinoteInstalledVersion == ""
    StrCpy $SorinoteVersionState "unknown"
    Return
  ${EndIf}
  ${VersionCompare} $SorinoteInstalledVersion "${VERSION}" $0
  ${If} $0 == 0
    StrCpy $SorinoteVersionState "same"
  ${ElseIf} $0 == 1
    StrCpy $SorinoteVersionState "newer"
  ${Else}
    StrCpy $SorinoteVersionState "older"
  ${EndIf}
FunctionEnd


Function SorinoteMaintenanceInit
  Call SorinoteDetectInstallation
  StrCpy $SorinoteAction "install"
  ${If} $SorinoteVersionState == "older"
    StrCpy $SorinoteAction "update"
  ${ElseIf} $SorinoteVersionState != "new"
    StrCpy $SorinoteAction "repair"
  ${EndIf}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/ACTION=" $1
  ${IfNot} ${Errors}
    StrCpy $SorinoteAction $1
  ${EndIf}
  ${If} ${Silent}
    Call SorinoteGuard
  ${EndIf}
FunctionEnd

Function SorinoteGuard
  Call SorinoteDetectInstallation
  ${If} $SorinoteAction == "delete"
    ${If} $SorinoteInstalledDir == ""
      Goto maintenance_invalid
    ${EndIf}
    StrCpy $INSTDIR $SorinoteInstalledDir
    Return
  ${ElseIf} $SorinoteAction != "install"
  ${AndIf} $SorinoteAction != "repair"
  ${AndIf} $SorinoteAction != "update"
    Goto maintenance_invalid
  ${EndIf}
  ${If} $SorinoteVersionState == "newer"
  ${OrIf} $SorinoteVersionState == "unknown"
    Goto maintenance_invalid
  ${EndIf}
  ${If} $SorinoteAction == "update"
  ${AndIf} $SorinoteVersionState != "older"
    Goto maintenance_invalid
  ${EndIf}
  ${If} $SorinoteVersionState != "new"
    StrCpy $INSTDIR $SorinoteInstalledDir
    ${If} $SorinoteVersionState == "older"
      StrCpy $SorinoteAction "update"
    ${Else}
      StrCpy $SorinoteAction "repair"
    ${EndIf}
  ${EndIf}
  ${If} $SorinoteAction == "update"
    StrCpy $SorinoteFinishTitle "LOXT 업데이트 완료"
    StrCpy $SorinoteFinishText "LOXT 업데이트를 완료했습니다.$\r$\n기존 녹음·스크립트·설정·모델은 유지했습니다."
  ${ElseIf} $SorinoteAction == "repair"
    StrCpy $SorinoteFinishTitle "LOXT 복구 완료"
    StrCpy $SorinoteFinishText "LOXT 앱 복구를 완료했습니다.$\r$\n기존 녹음·스크립트·설정·모델은 유지했습니다."
  ${EndIf}
  Return
  maintenance_invalid:
  MessageBox MB_OK|MB_ICONEXCLAMATION "이 설치 프로그램으로 앱을 복구할 수 없습니다. 현재 앱과 같거나 더 최신 버전의 설치 프로그램을 사용하세요. 앱 삭제는 설치 관리 화면에서 선택할 수 있습니다." /SD IDOK
  SetErrorLevel 3
  Quit
FunctionEnd

Function SorinoteDeleteApp
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "LOXT 앱과 다운로드한 모델, 변환 환경을 삭제할까요?$\r$\n녹음과 스크립트는 보존됩니다." IDYES delete_confirmed
    SetErrorLevel 1
    Quit
  ${EndIf}
  delete_confirmed:
  StrCpy $SorinoteUninstaller "$SorinoteInstalledDir\Uninstall LOXT.exe"
  ${IfNot} ${FileExists} "$SorinoteUninstaller"
    StrCpy $SorinoteUninstaller "$SorinoteInstalledDir\Uninstall Sorinote.exe"
  ${EndIf}
  ${IfNot} ${FileExists} "$SorinoteUninstaller"
    MessageBox MB_OK|MB_ICONSTOP "설치된 제거 프로그램을 찾지 못했습니다. 앱 복구 후 다시 삭제해 주세요." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ClearErrors
  ExecWait '"$SorinoteUninstaller" /S _?=$SorinoteInstalledDir' $0
  ${If} ${Errors}
  ${OrIf} $0 != 0
  ${OrIf} ${FileExists} "$SorinoteInstalledDir\Sorinote.exe"
  ${OrIf} ${FileExists} "$SorinoteInstalledDir\LOXT.exe"
    MessageBox MB_OK|MB_ICONSTOP "앱 삭제를 완료하지 못했습니다. 실행 중인 LOXT를 종료한 뒤 다시 시도해 주세요." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ; Older uninstallers did not remove models. The installer cleans these too.
  !insertmacro SorinoteRemoveEnvironment
  Delete "$SorinoteUninstaller"
  RMDir "$SorinoteInstalledDir"
  SetErrorLevel 0
  ${IfNot} ${Silent}
    MessageBox MB_OK "앱과 모델, 변환 환경을 삭제했습니다. 녹음과 스크립트는 보존했습니다."
  ${EndIf}
  Quit
FunctionEnd

Function SorinoteDirectoryPre
  ${If} $SorinoteAction == "delete"
  ${OrIf} $SorinoteAction == "repair"
  ${OrIf} $SorinoteAction == "update"
    Abort
  ${EndIf}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--updated" $1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
FunctionEnd

!macro customWelcomePage
  Page custom SorinoteMaintenancePage SorinoteMaintenanceLeave

Function SorinoteMaintenancePage
  ${If} $SorinoteVersionState == "new"
    Abort
  ${EndIf}
  ${If} $SorinoteVersionState == "older"
    !insertmacro MUI_HEADER_TEXT "LOXT 업데이트" "새 버전으로 업데이트하거나 앱과 모델을 삭제할 수 있습니다."
  ${Else}
    !insertmacro MUI_HEADER_TEXT "LOXT 설치 관리" "앱을 관리하거나 앱과 모델을 삭제할 수 있습니다."
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  StrCpy $1 $SorinoteInstalledVersion
  ${If} $1 == ""
    StrCpy $1 "버전 확인 불가"
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 18u "설치된 앱: $1 · 설치 프로그램: ${VERSION}"
  Pop $0
  StrCpy $SorinoteChoiceRepair 0
  ${If} $SorinoteVersionState == "older"
    ${NSD_CreateLabel} 0 24u 100% 24u "새 버전으로 업데이트합니다. 기존 녹음·스크립트·설정·모델은 유지하고 필요한 변환 환경을 확인합니다."
    Pop $0
    ${NSD_CreateRadioButton} 0 55u 100% 14u "업데이트"
    Pop $SorinoteChoiceRepair
  ${ElseIf} $SorinoteVersionState == "same"
    ${NSD_CreateLabel} 0 24u 100% 24u "복구하면 앱과 변환 환경을 다시 준비합니다. 녹음·스크립트와 설치된 모델은 유지합니다."
    Pop $0
    ${NSD_CreateRadioButton} 0 55u 100% 14u "앱 복구"
    Pop $SorinoteChoiceRepair
  ${Else}
    ${NSD_CreateLabel} 0 24u 100% 36u "현재 앱과 같거나 더 최신 버전의 설치 프로그램을 사용하세요. 이 설치 프로그램에서는 앱 삭제만 가능합니다."
    Pop $0
  ${EndIf}
  ${NSD_CreateRadioButton} 0 80u 100% 14u "앱 삭제 · 다운로드한 모델과 변환 환경 함께 삭제"
  Pop $SorinoteChoiceDelete
  ${If} $SorinoteChoiceRepair == 0
    ${NSD_CreateLabel} 0 104u 100% 30u "복구에는 현재 앱과 같거나 더 최신 버전의 설치 프로그램이 필요합니다. 앱 삭제 시에도 녹음과 스크립트는 보존됩니다."
  ${Else}
    ${NSD_SetState} $SorinoteChoiceRepair ${BST_CHECKED}
    ${NSD_CreateLabel} 0 104u 100% 30u "앱 삭제 시 모델과 변환 엔진도 삭제합니다. 녹음과 스크립트는 보존됩니다."
  ${EndIf}
  Pop $0
  nsDialogs::Show
FunctionEnd

Function SorinoteMaintenanceLeave
  ${NSD_GetState} $SorinoteChoiceDelete $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SorinoteAction "delete"
    Call SorinoteGuard
    Return
  ${EndIf}
  StrCpy $0 0
  ${If} $SorinoteChoiceRepair != 0
    ${NSD_GetState} $SorinoteChoiceRepair $0
  ${EndIf}
  ${If} $0 != ${BST_CHECKED}
    MessageBox MB_OK|MB_ICONEXCLAMATION "복구하려면 최신 설치 프로그램을 사용하세요. 삭제하려면 앱 삭제를 선택하세요."
    Abort
  ${EndIf}
  StrCpy $SorinoteAction "repair"
  Call SorinoteGuard
FunctionEnd
!macroend
