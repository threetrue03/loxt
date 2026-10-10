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
    StrCpy $SorinoteFinishTitle "$(LoxtInstaller079)"
    StrCpy $SorinoteFinishText "$(LoxtInstaller080)"
  ${ElseIf} $SorinoteAction == "repair"
    StrCpy $SorinoteFinishTitle "$(LoxtInstaller081)"
    StrCpy $SorinoteFinishText "$(LoxtInstaller082)"
  ${EndIf}
  Return
  maintenance_invalid:
  MessageBox MB_OK|MB_ICONEXCLAMATION "$(LoxtInstaller083)" /SD IDOK
  SetErrorLevel 3
  Quit
FunctionEnd

Function SorinoteDeleteApp
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "$(LoxtInstaller084)" IDYES delete_confirmed
    SetErrorLevel 1
    Quit
  ${EndIf}
  delete_confirmed:
  StrCpy $SorinoteUninstaller "$SorinoteInstalledDir\Uninstall LOXT.exe"
  ${IfNot} ${FileExists} "$SorinoteUninstaller"
    StrCpy $SorinoteUninstaller "$SorinoteInstalledDir\Uninstall Sorinote.exe"
  ${EndIf}
  ${IfNot} ${FileExists} "$SorinoteUninstaller"
    MessageBox MB_OK|MB_ICONSTOP "$(LoxtInstaller085)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ClearErrors
  ExecWait '"$SorinoteUninstaller" /S _?=$SorinoteInstalledDir' $0
  ${If} ${Errors}
  ${OrIf} $0 != 0
  ${OrIf} ${FileExists} "$SorinoteInstalledDir\Sorinote.exe"
  ${OrIf} ${FileExists} "$SorinoteInstalledDir\LOXT.exe"
    MessageBox MB_OK|MB_ICONSTOP "$(LoxtInstaller086)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ; Older uninstallers did not remove models. The installer cleans these too.
  !insertmacro SorinoteRemoveEnvironment
  Delete "$SorinoteUninstaller"
  RMDir "$SorinoteInstalledDir"
  SetErrorLevel 0
  ${IfNot} ${Silent}
    MessageBox MB_OK "$(LoxtInstaller087)"
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
    !insertmacro MUI_HEADER_TEXT "$(LoxtInstaller033)" "$(LoxtInstaller088)"
  ${Else}
    !insertmacro MUI_HEADER_TEXT "$(LoxtInstaller089)" "$(LoxtInstaller090)"
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  StrCpy $1 $SorinoteInstalledVersion
  ${If} $1 == ""
    StrCpy $1 "$(LoxtInstaller091)"
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 18u "$(LoxtInstaller092)"
  Pop $0
  StrCpy $SorinoteChoiceRepair 0
  ${If} $SorinoteVersionState == "older"
    ${NSD_CreateLabel} 0 24u 100% 24u "$(LoxtInstaller093)"
    Pop $0
    ${NSD_CreateRadioButton} 0 55u 100% 14u "$(LoxtInstaller094)"
    Pop $SorinoteChoiceRepair
  ${ElseIf} $SorinoteVersionState == "same"
    ${NSD_CreateLabel} 0 24u 100% 24u "$(LoxtInstaller095)"
    Pop $0
    ${NSD_CreateRadioButton} 0 55u 100% 14u "$(LoxtInstaller096)"
    Pop $SorinoteChoiceRepair
  ${Else}
    ${NSD_CreateLabel} 0 24u 100% 36u "$(LoxtInstaller097)"
    Pop $0
  ${EndIf}
  ${NSD_CreateRadioButton} 0 80u 100% 14u "$(LoxtInstaller098)"
  Pop $SorinoteChoiceDelete
  ${If} $SorinoteChoiceRepair == 0
    ${NSD_CreateLabel} 0 104u 100% 30u "$(LoxtInstaller099)"
  ${Else}
    ${NSD_SetState} $SorinoteChoiceRepair ${BST_CHECKED}
    ${NSD_CreateLabel} 0 104u 100% 30u "$(LoxtInstaller100)"
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
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(LoxtInstaller101)"
    Abort
  ${EndIf}
  StrCpy $SorinoteAction "repair"
  Call SorinoteGuard
FunctionEnd
!macroend
