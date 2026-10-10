!include "${__FILEDIR__}\remove-environment.nsh"
!ifndef BUILD_UNINSTALLER
!include MUI2.nsh
; Create the desktop link only when selected on the final page.
; The uninstaller still includes electron-builder's normal shortcut cleanup.
!ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
  !define DO_NOT_CREATE_DESKTOP_SHORTCUT
!endif
!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh
!include "${__FILEDIR__}\gpu-detection.nsh"
!define MUI_CUSTOMFUNCTION_ABORT SorinoteInstallerAbort

Var SorinoteModels
Var SorinoteModelRoot
Var SorinoteOptimized
Var SorinoteStandard
Var SorinotePerformance
Var SorinoteOptimizedState
Var SorinoteStandardState
Var SorinotePerformanceState
Var SorinoteModelsDialog
Var SorinoteModelResult
Var SorinoteInstallerPid
Var SorinoteInstallPage
Var SorinoteInstallFont
Var SorinoteFinishText
Var SorinoteFinishTitle
Var SorinotePrepareState
Var SorinotePrepareChoice
Var SorinoteDeviceChoice
Var SorinotePrepareDevice
Var SorinotePreparationArgs
Var SorinoteHardwareLabel
Var SorinoteFailureReason
Var SorinoteResultFile
Var SorinoteCommand
Var SorinotePreparationDone
Var SorinotePollCount
Var SorinoteRetryButton
Var SorinoteLaterButton
Var SorinoteLogButton
Var SorinoteDetailsButton
Var SorinoteStopButton
Var SorinoteLanguage
Var SorinoteSpaceLabel
Var SorinotePreparationRunning
!include "${__FILEDIR__}\maintenance.nsh"

!macro customInit
  StrCpy $SorinoteFinishTitle "$(LoxtInstaller000)"
  StrCpy $SorinoteModels ""
  StrCpy $SorinoteInstallPage 0
  StrCpy $SorinotePreparationRunning 0
  StrCpy $SorinoteToolsRoot ""
  StrCpy $SorinoteModelResult 0
  StrCpy $SorinoteFirstStage "$(LoxtInstaller001)"
  StrCpy $SorinotePrepareState ${BST_CHECKED}
  StrCpy $SorinotePrepareDevice "auto"
  StrCpy $SorinoteHardwareLabel "$(LoxtInstaller002)"
  !insertmacro SorinoteQueryGpu "--query-gpu=name,memory.total --format=csv,noheader"
  ${If} $0 == 0
    StrCpy $SorinoteHardwareLabel "$(LoxtInstaller003)"
  ${EndIf}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/PREPARE=" $1
  ${If} $1 == "0"
    StrCpy $SorinotePrepareState ${BST_UNCHECKED}
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/DEVICE=" $1
  ${If} $1 == "cpu"
  ${OrIf} $1 == "cuda"
    StrCpy $SorinotePrepareDevice $1
  ${EndIf}
  StrCpy $SorinoteFinishText "$(LoxtInstaller004)"
  StrCpy $SorinoteModelRoot "$APPDATA\sorinote-desktop\transcription\models"
  StrCpy $SorinoteOptimizedState ${BST_UNCHECKED}
  StrCpy $SorinoteStandardState ${BST_UNCHECKED}
  StrCpy $SorinotePerformanceState ${BST_UNCHECKED}
  ${If} ${FileExists} "$SorinoteModelRoot\small\model.bin"
  ${AndIf} ${FileExists} "$SorinoteModelRoot\small\config.json"
  ${AndIf} ${FileExists} "$SorinoteModelRoot\small\tokenizer.json"
    StrCpy $SorinoteOptimizedState ${BST_CHECKED}
  ${EndIf}
  ${If} ${FileExists} "$SorinoteModelRoot\large-v3-turbo\model.bin"
  ${AndIf} ${FileExists} "$SorinoteModelRoot\large-v3-turbo\config.json"
  ${AndIf} ${FileExists} "$SorinoteModelRoot\large-v3-turbo\tokenizer.json"
    StrCpy $SorinoteStandardState ${BST_CHECKED}
  ${EndIf}
  ${If} ${FileExists} "$SorinoteModelRoot\large-v3\model.bin"
  ${AndIf} ${FileExists} "$SorinoteModelRoot\large-v3\config.json"
  ${AndIf} ${FileExists} "$SorinoteModelRoot\large-v3\tokenizer.json"
    StrCpy $SorinotePerformanceState ${BST_CHECKED}
  ${EndIf}
  ${If} $SorinoteOptimizedState == ${BST_UNCHECKED}
  ${AndIf} $SorinoteStandardState == ${BST_UNCHECKED}
  ${AndIf} $SorinotePerformanceState == ${BST_UNCHECKED}
    StrCpy $SorinoteOptimizedState ${BST_CHECKED}
    !insertmacro SorinoteQueryGpu "--query-gpu=memory.total --format=csv,noheader,nounits"
    ${If} $0 == 0
      ${If} $1 >= 12000
        StrCpy $SorinoteOptimizedState ${BST_UNCHECKED}
        StrCpy $SorinotePerformanceState ${BST_CHECKED}
      ${ElseIf} $1 >= 4000
        StrCpy $SorinoteOptimizedState ${BST_UNCHECKED}
        StrCpy $SorinoteStandardState ${BST_CHECKED}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  # Silent installs do not download models unless explicitly requested.
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/MODELS=" $SorinoteModels
  ${If} ${Errors}
    StrCpy $SorinoteModels ""
  ${EndIf}
  ${If} $SorinoteModels == "none"
    StrCpy $SorinoteModels ""
  ${EndIf}
  Call SorinoteMaintenanceInit
!macroend

!macro customFinishPage
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SorinotePublisherFinish
  !define MUI_FINISHPAGE_TITLE "$SorinoteFinishTitle"
  !define MUI_FINISHPAGE_TEXT "$SorinoteFinishText"
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "$(LoxtInstaller005)"
  !define MUI_FINISHPAGE_RUN_FUNCTION SorinoteRunApp
  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "$(LoxtInstaller006)"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION SorinoteCreateDesktopLink
  !insertmacro MUI_PAGE_FINISH

Function SorinotePublisherFinish
  StrCpy $SorinoteFinishText "$SorinoteFinishText$\r$\n$\r$\n$(LoxtPublisher)"
FunctionEnd

Function SorinoteRunApp
  ClearErrors
  ExecShell "open" "$INSTDIR\LOXT.exe"
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(LoxtInstaller007)"
  ${EndIf}
FunctionEnd

Function SorinoteCreateDesktopLink
  ClearErrors
  CreateShortCut "$newDesktopLink" "$INSTDIR\LOXT.exe" "" "$INSTDIR\LOXT.exe" 0
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(LoxtInstaller008)"
  ${EndIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
FunctionEnd
!macroend

!macro SorinoteProgressControl CLASS TEXT Y HEIGHT ID
  # Dialog units follow the installer's existing font and Windows DPI setting.
  System::Call '*(i 0, i ${Y}, i 300, i ${HEIGHT}) p.r0'
  System::Call 'user32::MapDialogRect(p $SorinoteInstallPage, p r0)'
  System::Call '*$0(i .r1, i .r2, i .r3, i .r4)'
  System::Free $0
  System::Call 'user32::CreateWindowExW(i 0, w "${CLASS}", w "${TEXT}", i 0x50000000, i r1, i r2, i r3, i r4, p $SorinoteInstallPage, p ${ID}, p 0, p 0) p.r0'
  SendMessage $0 ${WM_SETFONT} $SorinoteInstallFont 1
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW SorinoteInstallShow
  Page custom SorinoteModelsPage SorinoteModelsLeave
  Page custom SorinotePreparationPage SorinotePreparationLeave

Function SorinotePreparationPage
  ${If} $SorinoteModels == ""
  ${OrIf} $SorinoteAction == "delete"
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "$(LoxtInstaller009)" "$(LoxtInstaller010)"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 0 100% 16u "$(LoxtInstaller011)"
  Pop $SorinotePrepareChoice
  ${NSD_SetState} $SorinotePrepareChoice $SorinotePrepareState
  ${NSD_CreateLabel} 0 22u 100% 16u "$SorinoteHardwareLabel"
  Pop $0
  ${NSD_CreateLabel} 0 42u 100% 28u "$(LoxtInstaller012)"
  Pop $0
  ${NSD_CreateLabel} 0 72u 100% 12u "$(LoxtInstaller013)"
  Pop $0
  ${NSD_CreateDropList} 0 86u 100% 80u ""
  Pop $SorinoteDeviceChoice
  ${NSD_CB_AddString} $SorinoteDeviceChoice "$(LoxtInstaller014)"
  ${NSD_CB_AddString} $SorinoteDeviceChoice "$(LoxtInstaller015)"
  ${NSD_CB_AddString} $SorinoteDeviceChoice "CPU"
  SendMessage $SorinoteDeviceChoice ${CB_SETCURSEL} 0 0
  ${If} $SorinotePrepareDevice == "cuda"
    SendMessage $SorinoteDeviceChoice ${CB_SETCURSEL} 1 0
  ${ElseIf} $SorinotePrepareDevice == "cpu"
    SendMessage $SorinoteDeviceChoice ${CB_SETCURSEL} 2 0
  ${EndIf}
  ${NSD_CreateLabel} 0 104u 100% 34u "$(LoxtInstaller016)"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function SorinotePreparationLeave
  ${NSD_GetState} $SorinotePrepareChoice $SorinotePrepareState
  SendMessage $SorinoteDeviceChoice ${CB_GETCURSEL} 0 0 $0
  StrCpy $SorinotePrepareDevice "auto"
  ${If} $0 == 1
    StrCpy $SorinotePrepareDevice "cuda"
  ${ElseIf} $0 == 2
    StrCpy $SorinotePrepareDevice "cpu"
  ${EndIf}
FunctionEnd

Function SorinoteModelsPage
  ${If} $SorinoteAction == "delete"
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "$(LoxtInstaller017)" "$(LoxtInstaller018)"
  nsDialogs::Create 1018
  Pop $SorinoteModelsDialog
  ${If} $SorinoteModelsDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 25u "$(LoxtInstaller019)"
  Pop $0
  ${NSD_CreateCheckbox} 0 28u 100% 14u "$(LoxtInstaller020)"
  Pop $SorinoteOptimized
  ${NSD_SetState} $SorinoteOptimized $SorinoteOptimizedState
  ${NSD_OnClick} $SorinoteOptimized SorinoteUpdateSpace
  Push "small"
  Call SorinoteModelStatus
  Pop $1
  ${NSD_CreateLabel} 12u 42u 95% 12u "$1"
  Pop $0
  ${NSD_CreateCheckbox} 0 56u 100% 14u "$(LoxtInstaller021)"
  Pop $SorinoteStandard
  ${NSD_SetState} $SorinoteStandard $SorinoteStandardState
  ${NSD_OnClick} $SorinoteStandard SorinoteUpdateSpace
  Push "large-v3-turbo"
  Call SorinoteModelStatus
  Pop $1
  ${NSD_CreateLabel} 12u 70u 95% 12u "$1"
  Pop $0
  ${NSD_CreateCheckbox} 0 84u 100% 14u "$(LoxtInstaller022)"
  Pop $SorinotePerformance
  ${NSD_SetState} $SorinotePerformance $SorinotePerformanceState
  ${NSD_OnClick} $SorinotePerformance SorinoteUpdateSpace
  Push "large-v3"
  Call SorinoteModelStatus
  Pop $1
  ${NSD_CreateLabel} 12u 98u 95% 12u "$1"
  Pop $0
  ${NSD_CreateLabel} 0 112u 100% 24u ""
  Pop $SorinoteSpaceLabel
  Call SorinoteUpdateSpaceText
  ${NSD_CreateLink} 0 136u 100% 10u "$(LoxtModelLocation)"
  Pop $0
  ${NSD_OnClick} $0 SorinoteModelLocation
  nsDialogs::Show
FunctionEnd

Function SorinoteModelLocation
  Pop $0
  StrCpy $0 $SorinoteModelRoot
  MessageBox MB_OK "$(LoxtModelLocationDetail)"
FunctionEnd

Function SorinoteUpdateSpace
  Pop $0
  Call SorinoteUpdateSpaceText
FunctionEnd

Function SorinoteUpdateSpaceText
  StrCpy $1 0
  ${NSD_GetState} $SorinoteOptimized $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $1 $1 + 486
  ${EndIf}
  ${NSD_GetState} $SorinoteStandard $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $1 $1 + 1620
  ${EndIf}
  ${NSD_GetState} $SorinotePerformance $0
  ${If} $0 == ${BST_CHECKED}
    IntOp $1 $1 + 3090
  ${EndIf}
  System::Call 'kernel32::GetDiskFreeSpaceExW(w "$APPDATA", *l.r2, p 0, p 0) i.r0'
  ${If} $0 != 0
    System::Int64Op $2 / 1000000
    Pop $2
  ${Else}
    StrCpy $2 "?"
  ${EndIf}
  StrCpy $3 "$(LoxtInstaller023)"
  ${NSD_SetText} $SorinoteSpaceLabel $3
FunctionEnd

Function SorinoteModelStatus
  Pop $0
  StrCpy $1 "$(LoxtInstaller024)"
  ${If} ${FileExists} "$SorinoteModelRoot\$0\model.bin.part"
    StrCpy $1 "$(LoxtInstaller025)"
  ${ElseIf} ${FileExists} "$SorinoteModelRoot\.installer-stage-$0\model.bin.part"
    StrCpy $1 "$(LoxtInstaller025)"
  ${ElseIf} ${FileExists} "$SorinoteModelRoot\$0\model.bin"
    StrCpy $1 "$(LoxtInstaller026)"
    ${If} ${FileExists} "$SorinoteModelRoot\$0\config.json"
    ${AndIf} ${FileExists} "$SorinoteModelRoot\$0\tokenizer.json"
      ClearErrors
      FileOpen $2 "$SorinoteModelRoot\$0\model.bin" r
      ${IfNot} ${Errors}
        FileSeek $2 0 END $3
        FileClose $2
        ${If} $3 != 0
          StrCpy $1 "$(LoxtInstaller027)"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Push $1
FunctionEnd

Function SorinoteModelsLeave
  ${NSD_GetState} $SorinoteOptimized $SorinoteOptimizedState
  ${NSD_GetState} $SorinoteStandard $SorinoteStandardState
  ${NSD_GetState} $SorinotePerformance $SorinotePerformanceState
  StrCpy $SorinoteModels ""
  ${If} $SorinoteOptimizedState == ${BST_CHECKED}
    StrCpy $SorinoteModels "small"
  ${EndIf}
  ${If} $SorinoteStandardState == ${BST_CHECKED}
    ${If} $SorinoteModels != ""
      StrCpy $SorinoteModels "$SorinoteModels,"
    ${EndIf}
    StrCpy $0 $SorinoteModels
    StrCpy $SorinoteModels "$0large-v3-turbo"
  ${EndIf}
  ${If} $SorinotePerformanceState == ${BST_CHECKED}
    ${If} $SorinoteModels != ""
      StrCpy $SorinoteModels "$SorinoteModels,"
    ${EndIf}
    StrCpy $0 $SorinoteModels
    StrCpy $SorinoteModels "$0large-v3"
  ${EndIf}
FunctionEnd

Function SorinoteInstallShow
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 1
  StrCpy $SorinoteInstallPage 0
  install_page_search:
  FindWindow $SorinoteInstallPage "#32770" "" $HWNDPARENT $SorinoteInstallPage
  ${If} $SorinoteInstallPage == 0
    Return
  ${EndIf}
  GetDlgItem $0 $SorinoteInstallPage 1004
  ${If} $0 == 0
    Goto install_page_search
  ${EndIf}
  GetDlgItem $0 $SorinoteInstallPage 1006
  SendMessage $0 ${WM_GETFONT} 0 0 $SorinoteInstallFont
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $SorinoteInstallPage 1016
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $SorinoteInstallPage 1027
  ShowWindow $0 ${SW_HIDE}
  ${If} $SorinoteAction == "delete"
    !insertmacro MUI_HEADER_TEXT "$(LoxtInstaller028)" "$(LoxtInstaller029)"
    !insertmacro SorinoteProgressControl "STATIC" "$(LoxtInstaller030)" 0 12 1805
    !insertmacro SorinoteProgressControl "STATIC" "$(LoxtInstaller031)" 37 14 1800
    !insertmacro SorinoteProgressControl "STATIC" "$(LoxtInstaller032)" 54 38 1801
    Return
  ${ElseIf} $SorinoteAction == "update"
    !insertmacro MUI_HEADER_TEXT "$(LoxtInstaller033)" "$(LoxtInstaller034)"
  ${ElseIf} $SorinoteAction == "repair"
    !insertmacro MUI_HEADER_TEXT "$(LoxtInstaller035)" "$(LoxtInstaller036)"
  ${EndIf}
  !insertmacro SorinoteProgressControl "STATIC" "$(LoxtInstaller037)" 0 12 1805
  !insertmacro SorinoteProgressControl "STATIC" "$(LoxtInstaller038)" 37 14 1800
  !insertmacro SorinoteProgressControl "STATIC" "$(LoxtInstaller039)" 54 38 1801
  !insertmacro SorinoteProgressControl "STATIC" "$(LoxtInstaller040)" 95 12 1802
  !insertmacro SorinoteProgressControl "STATIC" "$(LoxtInstaller041)" 109 12 1804
  !insertmacro SorinoteProgressControl "msctls_progress32" "" 123 10 1803
  ${If} $SorinoteModels == ""
    GetDlgItem $0 $SorinoteInstallPage 1801
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller042)"
    GetDlgItem $0 $SorinoteInstallPage 1802
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller043)"
    GetDlgItem $0 $SorinoteInstallPage 1804
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller044)"
    GetDlgItem $0 $SorinoteInstallPage 1803
    ShowWindow $0 ${SW_HIDE}
  ${EndIf}
  ${If} $SorinoteAction == "models"
    StrCpy $SorinoteFirstStage "$(LoxtInstaller045)"
    GetDlgItem $0 $SorinoteInstallPage 1805
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller046)"
    GetDlgItem $0 $SorinoteInstallPage 1800
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller047)"
    GetDlgItem $0 $SorinoteInstallPage 1801
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller048)"
    GetDlgItem $0 $SorinoteInstallPage 1802
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller049)"
    GetDlgItem $0 $SorinoteInstallPage 1804
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller050)"
  ${EndIf}
  ${If} $SorinoteModels != ""
  ${AndIf} $SorinotePrepareState == ${BST_CHECKED}
    GetDlgItem $0 $SorinoteInstallPage 1800
    ${If} $SorinoteAction == "models"
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller051)"
    ${Else}
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(LoxtInstaller052)"
    ${EndIf}
  ${EndIf}
FunctionEnd

!macroend

!macro customInstall
  Call SorinoteInstallModels
!macroend

Function SorinoteInstallModels
  ; GUI preparation runs on the following cancellable custom page.
  ${If} ${Silent}
    ${If} $SorinoteModels != ""
      InitPluginsDir
      StrCpy $SorinoteInstallPage 0
      StrCpy $SorinoteResultFile "$PLUGINSDIR\prepare-result.txt"
      Call SorinotePreparationCommand
      nsExec::ExecToLog '$SorinoteCommand'
      Pop $SorinoteModelResult
      ${If} $SorinoteModelResult != 0
        SetErrorLevel 2
        Quit
      ${EndIf}
      Call SorinotePreparationFinish
    ${EndIf}
  ${EndIf}
FunctionEnd

!include "${__FILEDIR__}\preparation-page.nsh"

Function SorinoteInstallerAbort
  ${If} $SorinotePreparationRunning == 1
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(LoxtPreparationExit)" IDYES preparation_exit
    Abort
  ${EndIf}
  preparation_exit:
FunctionEnd
!endif
