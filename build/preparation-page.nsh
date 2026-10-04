!macro SorinotePreparationLabel Y HEIGHT TEXT ID
  ${NSD_CreateLabel} 0 ${Y} 100% ${HEIGHT} "${TEXT}"
  Pop $0
  System::Call 'user32::SetWindowLongW(p r0, i -12, i ${ID})'
!macroend

Function SorinotePreparationCommand
  StrCpy $SorinoteToolsRoot "$INSTDIR\resources"
  StrCpy $SorinotePreparationArgs ""
  ${If} $SorinotePrepareState == ${BST_CHECKED}
    StrCpy $SorinotePreparationArgs '--prepare --runtime "$SorinoteToolsRoot\python-runtime" --device $SorinotePrepareDevice'
  ${EndIf}
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  StrCpy $SorinoteInstallerPid $0
  StrCpy $SorinoteCommand '"$SorinoteToolsRoot\python-runtime\python.exe" -u "$SorinoteToolsRoot\python\install_models.py" --root "$SorinoteModelRoot" --models "$SorinoteModels" --parent-pid $SorinoteInstallerPid --installer-log --installer-window $SorinoteInstallPage --installer-result "$SorinoteResultFile" $SorinotePreparationArgs'
FunctionEnd

Function SorinotePreparationStart
  Delete "$SorinoteResultFile"
  Delete "$PLUGINSDIR\prepare-result.pid"
  Delete "$SorinoteModelRoot\installer-error.txt"
  StrCpy $SorinotePreparationDone 0
  StrCpy $SorinotePollCount 0
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
  !insertmacro MUI_HEADER_TEXT "모델과 전사 환경 준비" "취소하면 준비를 중단합니다. 받은 파일은 다음 준비에서 재사용합니다."
  nsDialogs::Create 1018
  Pop $SorinoteInstallPage
  !insertmacro SorinotePreparationLabel 0 12u "프로그램 파일 설치 완료" 1805
  !insertmacro SorinotePreparationLabel 22u 14u "선택한 모델 확인 중" 1800
  !insertmacro SorinotePreparationLabel 40u 32u "모델과 전사 환경을 준비합니다." 1801
  !insertmacro SorinotePreparationLabel 78u 16u "설치된 모델은 검증 후 재사용합니다." 1802
  !insertmacro SorinotePreparationLabel 98u 22u "준비 결과를 확인하고 있습니다." 1804
  ${NSD_CreateProgressBar} 0 124u 100% 10u ""
  Pop $0
  System::Call 'user32::SetWindowLongW(p r0, i -12, i 1803)'
  SendMessage $0 0x406 0 100
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
  StrCpy $SorinoteFailureReason "준비 작업이 종료됐습니다. 저장 공간과 설치 로그를 확인해 주세요."
  ClearErrors
  FileOpen $0 "$SorinoteModelRoot\installer-error.txt" r
  ${IfNot} ${Errors}
    FileReadUTF16LE $0 $SorinoteFailureReason
    FileClose $0
  ${EndIf}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "전사 준비를 완료하지 못했습니다.$\r$\n$\r$\n$SorinoteFailureReason$\r$\n$\r$\n로그: $SorinoteModelRoot\installer-preparation.log$\r$\n다시 시도하면 받은 파일을 재사용합니다." IDRETRY preparation_retry
  StrCpy $SorinoteFinishText "앱은 설치했지만 전사 준비는 미완료입니다.$\r$\n앱 설정에서 전사 준비를 다시 실행할 수 있습니다."
  StrCpy $SorinotePreparationDone 1
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 1
  Return
  preparation_retry:
  Call SorinotePreparationStart
FunctionEnd

Function SorinotePreparationFinish
  StrCpy $SorinotePreparationDone 1
  StrCpy $SorinoteFinishText "선택한 모델 설치를 완료했습니다.$\r$\n앱에서 사용할 모델을 선택할 수 있습니다."
  ${If} $SorinotePrepareState == ${BST_CHECKED}
    StrCpy $SorinoteFinishText "선택한 모델의 전사 준비와 실제 실행 검사를 완료했습니다.$\r$\n기존 모델 선택은 유지합니다. 앱에서 사용할 모델을 확인하세요."
  ${EndIf}
  ${If} $SorinoteAction == "update"
    StrCpy $SorinoteFinishText "소리노트 업데이트와 선택한 모델 설치를 완료했습니다.$\r$\n기존 녹음·전사문·설정·모델은 유지했습니다."
    ${If} $SorinotePrepareState == ${BST_CHECKED}
      StrCpy $SorinoteFinishText "소리노트 업데이트와 전사 환경 실행 검사를 완료했습니다.$\r$\n기존 녹음·전사문·설정·모델은 유지했습니다."
    ${EndIf}
  ${ElseIf} $SorinoteAction == "repair"
    StrCpy $SorinoteFinishText "소리노트 앱 복구와 선택한 모델 설치를 완료했습니다.$\r$\n기존 녹음·전사문·설정·모델은 유지했습니다."
    ${If} $SorinotePrepareState == ${BST_CHECKED}
      StrCpy $SorinoteFinishText "소리노트 앱 복구와 전사 환경 실행 검사를 완료했습니다.$\r$\n기존 녹음·전사문·설정·모델은 유지했습니다."
    ${EndIf}
  ${EndIf}
  GetDlgItem $0 $SorinoteInstallPage 1800
  SendMessage $0 ${WM_SETTEXT} 0 "STR:준비 완료"
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 1
FunctionEnd

Function SorinotePreparationProgressLeave
  ${If} $SorinotePreparationDone != 1
    Abort
  ${EndIf}
  ${NSD_KillTimer} SorinotePreparationPoll
FunctionEnd
