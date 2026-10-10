!macro SorinotePreparationLabel Y HEIGHT TEXT ID
  ${NSD_CreateLabel} 0 ${Y} 100% ${HEIGHT} "${TEXT}"
  Pop $0
  System::Call 'user32::SetWindowLongW(p r0, i -12, i ${ID})'
!macroend

Function SorinotePreparationCommand
  StrCpy $SorinoteToolsRoot "$INSTDIR\resources"
  StrCpy $SorinotePreparationArgs ""
  StrCpy $SorinoteLanguage "ko"
  ${If} $LANGUAGE == 1033
    StrCpy $SorinoteLanguage "en"
  ${EndIf}
  ${If} $SorinotePrepareState == ${BST_CHECKED}
    StrCpy $SorinotePreparationArgs '--prepare --runtime "$SorinoteToolsRoot\python-runtime" --device $SorinotePrepareDevice'
  ${EndIf}
  ${If} $SorinoteAction == "repair"
    StrCpy $SorinotePreparationArgs "$SorinotePreparationArgs --deep-check"
  ${EndIf}
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  StrCpy $SorinoteInstallerPid $0
  StrCpy $SorinoteCommand '"$SorinoteToolsRoot\python-runtime\python.exe" -u "$SorinoteToolsRoot\python\install_models.py" --root "$SorinoteModelRoot" --models "$SorinoteModels" --parent-pid $SorinoteInstallerPid --installer-log --installer-window $SorinoteInstallPage --installer-result "$SorinoteResultFile" --language $SorinoteLanguage $SorinotePreparationArgs'
FunctionEnd

Function SorinotePreparationStart
  Delete "$SorinoteResultFile"
  Delete "$PLUGINSDIR\prepare-result.pid"
  Delete "$PLUGINSDIR\prepare-result.error.txt"
  Delete "$PLUGINSDIR\prepare-result.summary.txt"
  Delete "$PLUGINSDIR\prepare-result.cancel"
  Delete "$SorinoteModelRoot\installer-error.txt"
  StrCpy $SorinotePreparationDone 0
  StrCpy $SorinotePreparationRunning 1
  StrCpy $SorinotePollCount 0
  ShowWindow $SorinoteRetryButton ${SW_HIDE}
  ShowWindow $SorinoteLaterButton ${SW_HIDE}
  ShowWindow $SorinoteDetailsButton ${SW_HIDE}
  ShowWindow $SorinoteLogButton ${SW_HIDE}
  ShowWindow $SorinoteStopButton ${SW_SHOW}
  EnableWindow $SorinoteStopButton 1
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 0
  GetDlgItem $0 $HWNDPARENT 3
  EnableWindow $0 0
  ; This is a regular custom page: Cancel and window close remain available.
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 1
  Call SorinotePreparationCommand
  ClearErrors
  Exec '$SorinoteCommand'
  ${If} ${Errors}
    StrCpy $SorinoteModelResult 1
    Call SorinotePreparationFailure
    Return
  ${EndIf}
  ${NSD_CreateTimer} SorinotePreparationPoll 250
FunctionEnd

Function SorinotePreparationProgressPage
  ${If} $SorinoteModels == ""
  ${OrIf} $SorinoteAction == "delete"
    Abort
  ${EndIf}
  InitPluginsDir
  StrCpy $SorinoteResultFile "$PLUGINSDIR\prepare-result.txt"
  !insertmacro MUI_HEADER_TEXT "$(LoxtInstaller053)" "$(LoxtInstaller054)"
  nsDialogs::Create 1018
  Pop $SorinoteInstallPage
  !insertmacro SorinotePreparationLabel 0 12u "$(LoxtInstaller055)" 1805
  !insertmacro SorinotePreparationLabel 22u 14u "$(LoxtInstaller056)" 1800
  !insertmacro SorinotePreparationLabel 40u 30u "$(LoxtInstaller057)" 1801
  !insertmacro SorinotePreparationLabel 72u 16u "$(LoxtInstaller058)" 1802
  !insertmacro SorinotePreparationLabel 90u 18u "$(LoxtInstaller059)" 1804
  ${NSD_CreateProgressBar} 0 110u 100% 8u ""
  Pop $0
  System::Call 'user32::SetWindowLongW(p r0, i -12, i 1803)'
  SendMessage $0 0x406 0 100
  ${NSD_CreateButton} 0 122u 24% 16u "$(LoxtInstaller060)"
  Pop $SorinoteRetryButton
  ${NSD_OnClick} $SorinoteRetryButton SorinotePreparationRetry
  ${NSD_CreateButton} 25% 122u 24% 16u "$(LoxtInstaller061)"
  Pop $SorinoteLaterButton
  ${NSD_OnClick} $SorinoteLaterButton SorinotePreparationLater
  ${NSD_CreateButton} 50% 122u 24% 16u "$(LoxtInstaller062)"
  Pop $SorinoteDetailsButton
  ${NSD_OnClick} $SorinoteDetailsButton SorinotePreparationDetails
  ${NSD_CreateButton} 75% 122u 24% 16u "$(LoxtInstaller063)"
  Pop $SorinoteLogButton
  ${NSD_OnClick} $SorinoteLogButton SorinotePreparationLog
  ${NSD_CreateButton} 75% 122u 24% 16u "$(LoxtInstaller064)"
  Pop $SorinoteStopButton
  ${NSD_OnClick} $SorinoteStopButton SorinotePreparationStop
  Call SorinotePreparationStart
  nsDialogs::Show
FunctionEnd

Function SorinotePreparationPoll
  ${If} ${FileExists} "$SorinoteResultFile"
    FileOpen $0 "$SorinoteResultFile" r
    FileRead $0 $SorinoteModelResult
    FileClose $0
    ${NSD_KillTimer} SorinotePreparationPoll
    ${If} $SorinoteModelResult == 0
      Call SorinotePreparationFinish
    ${ElseIf} $SorinoteModelResult == 2
      Call SorinotePreparationSkipped
    ${Else}
      Call SorinotePreparationFailure
    ${EndIf}
    Return
  ${EndIf}
  IntOp $SorinotePollCount $SorinotePollCount + 1
  ${If} ${FileExists} "$PLUGINSDIR\prepare-result.pid"
    FileOpen $0 "$PLUGINSDIR\prepare-result.pid" r
    FileRead $0 $1
    FileClose $0
    System::Call 'kernel32::OpenProcess(i 0x100000, i 0, i r1) p.r0'
    ${If} $0 != 0
      System::Call 'kernel32::WaitForSingleObject(p r0, i 0) i.r1'
      System::Call 'kernel32::CloseHandle(p r0)'
      ${If} $1 != 0
        Return
      ${EndIf}
    ${EndIf}
  ${ElseIf} $SorinotePollCount < 120
    Return
  ${EndIf}
  ; Completion can be published between the first check and the process probe.
  ${If} ${FileExists} "$SorinoteResultFile"
    Return
  ${EndIf}
  ${NSD_KillTimer} SorinotePreparationPoll
  StrCpy $SorinoteModelResult 1
  Call SorinotePreparationFailure
FunctionEnd

Function SorinotePreparationFailure
  StrCpy $SorinotePreparationRunning 0
  StrCpy $SorinoteFailureReason "$(LoxtInstaller065)"
  ClearErrors
  FileOpen $0 "$PLUGINSDIR\prepare-result.error.txt" r
  ${IfNot} ${Errors}
    FileReadUTF16LE $0 $SorinoteFailureReason
    FileClose $0
  ${EndIf}
  ClearErrors
  FileOpen $0 "$PLUGINSDIR\prepare-result.summary.txt" r
  ${IfNot} ${Errors}
    FileReadUTF16LE $0 $1
    FileClose $0
    GetDlgItem $0 $SorinoteInstallPage 1801
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$1"
  ${EndIf}
  GetDlgItem $0 $SorinoteInstallPage 1800
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller066)"
  GetDlgItem $0 $SorinoteInstallPage 1804
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller067)"
  GetDlgItem $0 $SorinoteInstallPage 1803
  SendMessage $0 0x40A 0 0
  ShowWindow $SorinoteStopButton ${SW_HIDE}
  ShowWindow $SorinoteRetryButton ${SW_SHOW}
  ShowWindow $SorinoteLaterButton ${SW_SHOW}
  ShowWindow $SorinoteDetailsButton ${SW_SHOW}
  ShowWindow $SorinoteLogButton ${SW_SHOW}
  Return
FunctionEnd

Function SorinotePreparationRetry
  Pop $0
  Call SorinotePreparationStart
FunctionEnd

Function SorinotePreparationLater
  Pop $0
  Call SorinotePreparationSkipped
FunctionEnd

Function SorinotePreparationSkipped
  StrCpy $SorinotePreparationRunning 0
  StrCpy $SorinoteFinishText "$(LoxtInstaller068)"
  StrCpy $SorinotePreparationDone 1
  GetDlgItem $0 $SorinoteInstallPage 1800
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller069)"
  ShowWindow $SorinoteStopButton ${SW_HIDE}
  ShowWindow $SorinoteRetryButton ${SW_HIDE}
  ShowWindow $SorinoteLaterButton ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 1
FunctionEnd

Function SorinotePreparationDetails
  Pop $0
  MessageBox MB_OK|MB_ICONEXCLAMATION "$SorinoteFailureReason"
FunctionEnd

Function SorinotePreparationLog
  Pop $0
  ${If} ${FileExists} "$PLUGINSDIR\prepare-result.log"
    StrCpy $R0 "$PLUGINSDIR\prepare-result.log"
  ${ElseIf} ${FileExists} "$SorinoteModelRoot\installer-preparation.log"
    StrCpy $R0 "$SorinoteModelRoot\installer-preparation.log"
  ${Else}
    MessageBox MB_OK "$(LoxtInstaller070)"
    Return
  ${EndIf}
  MessageBox MB_YESNO|MB_ICONQUESTION "$(LoxtLogActions)" IDYES preparation_open_log
  StrLen $0 $R0
  IntOp $0 $0 + 1
  IntOp $0 $0 * 2
  System::Call 'kernel32::GlobalAlloc(i 0x42, i r0) p.r1'
  ${If} $1 == 0
    Return
  ${EndIf}
  System::Call 'kernel32::GlobalLock(p r1) p.r2'
  System::Call 'kernel32::lstrcpyW(p r2, w "$R0")'
  System::Call 'kernel32::GlobalUnlock(p r1)'
  System::Call 'user32::OpenClipboard(p $HWNDPARENT) i.r0'
  ${If} $0 != 0
    System::Call 'user32::EmptyClipboard()'
    System::Call 'user32::SetClipboardData(i 13, p r1) p.r0'
    System::Call 'user32::CloseClipboard()'
    ${If} $0 != 0
      Return
    ${EndIf}
  ${EndIf}
  System::Call 'kernel32::GlobalFree(p r1)'
  Return
  preparation_open_log:
  ExecShell "open" "$R0"
FunctionEnd

Function SorinotePreparationStop
  Pop $0
  FileOpen $0 "$PLUGINSDIR\prepare-result.cancel" w
  FileWrite $0 "cancel"
  FileClose $0
  EnableWindow $SorinoteStopButton 0
  GetDlgItem $0 $SorinoteInstallPage 1804
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller071)"
FunctionEnd

Function SorinotePreparationFinish
  StrCpy $SorinotePreparationRunning 0
  ShowWindow $SorinoteStopButton ${SW_HIDE}
  StrCpy $SorinotePreparationDone 1
  StrCpy $SorinoteFinishText "$(LoxtInstaller072)"
  ${If} $SorinotePrepareState == ${BST_CHECKED}
    StrCpy $SorinoteFinishText "$(LoxtInstaller073)"
  ${EndIf}
  ${If} $SorinoteAction == "update"
    StrCpy $SorinoteFinishText "$(LoxtInstaller074)"
    ${If} $SorinotePrepareState == ${BST_CHECKED}
      StrCpy $SorinoteFinishText "$(LoxtInstaller075)"
    ${EndIf}
  ${ElseIf} $SorinoteAction == "repair"
    StrCpy $SorinoteFinishText "$(LoxtInstaller076)"
    ${If} $SorinotePrepareState == ${BST_CHECKED}
      StrCpy $SorinoteFinishText "$(LoxtInstaller077)"
    ${EndIf}
  ${EndIf}
  GetDlgItem $0 $SorinoteInstallPage 1800
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller078)"
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 1
FunctionEnd

Function SorinotePreparationProgressLeave
  ${If} $SorinotePreparationDone != 1
    Abort
  ${EndIf}
  ${NSD_KillTimer} SorinotePreparationPoll
FunctionEnd
