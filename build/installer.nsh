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
!include "${__FILEDIR__}\maintenance.nsh"

!macro customInit
  StrCpy $SorinoteFinishTitle "LOXT 설치 완료"
  StrCpy $SorinoteModels ""
  StrCpy $SorinoteInstallPage 0
  StrCpy $SorinoteToolsRoot ""
  StrCpy $SorinoteModelResult 0
  StrCpy $SorinoteFirstStage "프로그램 설치 완료"
  StrCpy $SorinotePrepareState ${BST_CHECKED}
  StrCpy $SorinotePrepareDevice "auto"
  StrCpy $SorinoteHardwareLabel "NVIDIA GPU 미감지 · 자동 선택 시 CPU 사용"
  !insertmacro SorinoteQueryGpu "--query-gpu=name,memory.total --format=csv,noheader"
  ${If} $0 == 0
    StrCpy $SorinoteHardwareLabel "감지된 GPU: $1"
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
  StrCpy $SorinoteFinishText "LOXT 설치가 완료되었습니다.$\r$\n$\r$\n원하는 항목을 체크한 뒤 마침을 눌러 주세요."
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
  !define MUI_FINISHPAGE_TITLE "$SorinoteFinishTitle"
  !define MUI_FINISHPAGE_TEXT "$SorinoteFinishText"
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "LOXT 실행하기"
  !define MUI_FINISHPAGE_RUN_FUNCTION SorinoteRunApp
  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "바탕화면 바로가기 만들기"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION SorinoteCreateDesktopLink
  !insertmacro MUI_PAGE_FINISH

Function SorinoteRunApp
  ClearErrors
  ExecShell "open" "$INSTDIR\LOXT.exe"
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "LOXT를 실행하지 못했습니다. 시작 메뉴에서 LOXT를 실행해 주세요."
  ${EndIf}
FunctionEnd

Function SorinoteCreateDesktopLink
  ClearErrors
  CreateShortCut "$newDesktopLink" "$INSTDIR\LOXT.exe" "" "$INSTDIR\LOXT.exe" 0
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "바탕화면 바로가기를 만들지 못했습니다. 시작 메뉴에서 LOXT를 실행할 수 있습니다."
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
  !insertmacro MUI_HEADER_TEXT "변환 환경 준비" "모델 설치부터 실제 실행 검사까지 진행합니다."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 0 100% 16u "설치한 모델의 변환 환경까지 준비하기 (권장)"
  Pop $SorinotePrepareChoice
  ${NSD_SetState} $SorinotePrepareChoice $SorinotePrepareState
  ${NSD_CreateLabel} 0 22u 100% 16u "$SorinoteHardwareLabel"
  Pop $0
  ${NSD_CreateLabel} 0 42u 100% 28u "변환 엔진·실행 라이브러리를 설치하고, 선택한 모델을 실행 검사합니다.$\r$\n처음 준비할 때는 추가 다운로드와 저장 공간이 필요합니다."
  Pop $0
  ${NSD_CreateLabel} 0 72u 100% 12u "변환 실행 장치"
  Pop $0
  ${NSD_CreateDropList} 0 86u 100% 80u ""
  Pop $SorinoteDeviceChoice
  ${NSD_CB_AddString} $SorinoteDeviceChoice "자동 · 기존 장치 설정 우선, 처음 설치는 PC에 맞춰 선택"
  ${NSD_CB_AddString} $SorinoteDeviceChoice "NVIDIA GPU · 호환 GPU와 드라이버 필요"
  ${NSD_CB_AddString} $SorinoteDeviceChoice "CPU"
  SendMessage $SorinoteDeviceChoice ${CB_SETCURSEL} 0 0
  ${If} $SorinotePrepareDevice == "cuda"
    SendMessage $SorinoteDeviceChoice ${CB_SETCURSEL} 1 0
  ${ElseIf} $SorinotePrepareDevice == "cpu"
    SendMessage $SorinoteDeviceChoice ${CB_SETCURSEL} 2 0
  ${EndIf}
  ${NSD_CreateLabel} 0 104u 100% 34u "기존 모델 선택은 유지됩니다. 장치 변경은 준비 성공 후 적용합니다.$\r$\n실패하면 앱에서 다시 준비할 수 있습니다.$\r$\n체크를 해제하면 모델 파일만 설치합니다."
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
  !insertmacro MUI_HEADER_TEXT "변환 모델 선택" "설치할 모델을 선택하세요. 여러 개를 설치할 수 있습니다."
  nsDialogs::Create 1018
  Pop $SorinoteModelsDialog
  ${If} $SorinoteModelsDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 25u "체크한 모델만 인터넷으로 다운로드합니다. PC에 맞는 기본 후보를 체크했습니다. 모두 해제하면 앱에서 나중에 설치할 수 있습니다."
  Pop $0
  ${NSD_CreateCheckbox} 0 28u 100% 14u "저성능 (small) · 약 486 MB · 가볍게 사용"
  Pop $SorinoteOptimized
  ${NSD_SetState} $SorinoteOptimized $SorinoteOptimizedState
  Push "small"
  Call SorinoteModelStatus
  Pop $1
  ${NSD_CreateLabel} 12u 42u 95% 12u "$1"
  Pop $0
  ${NSD_CreateCheckbox} 0 56u 100% 14u "표준 (large-v3-turbo) · 약 1.62 GB · 속도와 정확도 균형"
  Pop $SorinoteStandard
  ${NSD_SetState} $SorinoteStandard $SorinoteStandardState
  Push "large-v3-turbo"
  Call SorinoteModelStatus
  Pop $1
  ${NSD_CreateLabel} 12u 70u 95% 12u "$1"
  Pop $0
  ${NSD_CreateCheckbox} 0 84u 100% 14u "고성능 (large-v3) · 약 3.09 GB · 정확도 우선"
  Pop $SorinotePerformance
  ${NSD_SetState} $SorinotePerformance $SorinotePerformanceState
  Push "large-v3"
  Call SorinoteModelStatus
  Pop $1
  ${NSD_CreateLabel} 12u 98u 95% 12u "$1"
  Pop $0
  ${NSD_CreateLabel} 0 112u 100% 24u "설치된 모델은 검증 후 재사용하고, 중단된 다운로드는 이어받습니다.$\r$\n모델은 앱 설정에서 선택하세요. 기존 녹음·스크립트는 유지됩니다."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function SorinoteModelStatus
  Pop $0
  StrCpy $1 "미설치"
  ${If} ${FileExists} "$SorinoteModelRoot\$0\model.bin.part"
    StrCpy $1 "이어받기 가능 · 다운로드 중단됨"
  ${ElseIf} ${FileExists} "$SorinoteModelRoot\$0\model.bin"
    StrCpy $1 "이어받기 가능 · 설치 파일 확인 필요"
    ${If} ${FileExists} "$SorinoteModelRoot\$0\config.json"
    ${AndIf} ${FileExists} "$SorinoteModelRoot\$0\tokenizer.json"
      ClearErrors
      FileOpen $2 "$SorinoteModelRoot\$0\model.bin" r
      ${IfNot} ${Errors}
        FileSeek $2 0 END $3
        FileClose $2
        ${If} $3 != 0
          StrCpy $1 "설치됨 · 체크하면 무결성 확인 후 재사용"
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
    !insertmacro MUI_HEADER_TEXT "LOXT 삭제" "앱과 모델, 변환 환경을 삭제합니다. 녹음과 스크립트는 보존합니다."
    !insertmacro SorinoteProgressControl "STATIC" "앱과 모델 삭제" 0 12 1805
    !insertmacro SorinoteProgressControl "STATIC" "LOXT 삭제 준비 중" 37 14 1800
    !insertmacro SorinoteProgressControl "STATIC" "앱·모델·변환 환경 삭제$\r$\n녹음·스크립트 보존" 54 38 1801
    Return
  ${ElseIf} $SorinoteAction == "update"
    !insertmacro MUI_HEADER_TEXT "LOXT 업데이트" "기존 기록과 모델을 유지하며 새 버전과 변환 환경을 준비합니다."
  ${ElseIf} $SorinoteAction == "repair"
    !insertmacro MUI_HEADER_TEXT "LOXT 복구" "앱 파일을 복구한 뒤 모델과 변환 환경을 확인합니다."
  ${EndIf}
  !insertmacro SorinoteProgressControl "STATIC" "프로그램 파일 설치 진행률" 0 12 1805
  !insertmacro SorinoteProgressControl "STATIC" "전체 설치: 1/3단계 · LOXT 프로그램 설치 중" 37 14 1800
  !insertmacro SorinoteProgressControl "STATIC" "1. 프로그램 설치 중$\r$\n2. 선택 모델 다운로드 대기$\r$\n3. 설치 마무리 대기" 54 38 1801
  !insertmacro SorinoteProgressControl "STATIC" "모델 다운로드 · 프로그램 설치 후 시작합니다." 95 12 1802
  !insertmacro SorinoteProgressControl "STATIC" "체크한 모델만 다운로드합니다. 이미 설치된 파일은 확인 후 재사용합니다." 109 12 1804
  !insertmacro SorinoteProgressControl "msctls_progress32" "" 123 10 1803
  ${If} $SorinoteModels == ""
    GetDlgItem $0 $SorinoteInstallPage 1801
    SendMessage $0 ${WM_SETTEXT} 0 "STR:1. 프로그램 설치 중$\r$\n2. 모델 다운로드 생략$\r$\n3. 설치 마무리 대기"
    GetDlgItem $0 $SorinoteInstallPage 1802
    SendMessage $0 ${WM_SETTEXT} 0 "STR:모델 다운로드 생략 · 앱 설정에서 나중에 설치할 수 있습니다."
    GetDlgItem $0 $SorinoteInstallPage 1804
    SendMessage $0 ${WM_SETTEXT} 0 "STR:프로그램만 설치합니다."
    GetDlgItem $0 $SorinoteInstallPage 1803
    ShowWindow $0 ${SW_HIDE}
  ${EndIf}
  ${If} $SorinoteAction == "models"
    StrCpy $SorinoteFirstStage "기존 앱 유지 · 모델 설치 도구 준비 완료"
    GetDlgItem $0 $SorinoteInstallPage 1805
    SendMessage $0 ${WM_SETTEXT} 0 "STR:모델 설치 도구 준비 진행률 · 앱 파일은 유지합니다."
    GetDlgItem $0 $SorinoteInstallPage 1800
    SendMessage $0 ${WM_SETTEXT} 0 "STR:전체 설치: 1/3단계 · 모델 설치 도구 준비 중"
    GetDlgItem $0 $SorinoteInstallPage 1801
    SendMessage $0 ${WM_SETTEXT} 0 "STR:1. 기존 앱 유지 · 모델 설치 도구 준비 중$\r$\n2. 선택 모델 다운로드 대기$\r$\n3. 설치 마무리 대기"
    GetDlgItem $0 $SorinoteInstallPage 1802
    SendMessage $0 ${WM_SETTEXT} 0 "STR:모델 추가 설치 · 선택한 모델만 확인합니다."
    GetDlgItem $0 $SorinoteInstallPage 1804
    SendMessage $0 ${WM_SETTEXT} 0 "STR:앱 버전, 현재 모델 선택과 보관함은 유지합니다."
  ${EndIf}
  ${If} $SorinoteModels != ""
  ${AndIf} $SorinotePrepareState == ${BST_CHECKED}
    GetDlgItem $0 $SorinoteInstallPage 1800
    ${If} $SorinoteAction == "models"
      SendMessage $0 ${WM_SETTEXT} 0 "STR:전체 설치: 1/5단계 · 모델 설치 도구 준비 중"
    ${Else}
      SendMessage $0 ${WM_SETTEXT} 0 "STR:전체 설치: 1/5단계 · LOXT 프로그램 설치 중"
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
!endif
