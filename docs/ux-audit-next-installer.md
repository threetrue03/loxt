# LOXT 2.7.0 Windows 설치 런처 UX 조사

조사일: 2026-10-10. 조사·보고만 진행했으며 앱, 설정, 설치 스크립트, 사이트, 버전과 사용자 자료는 수정하지 않았다.

## 우선 확인할 문제 5개

1. **업데이트·복구가 모델 스토어에서 고정한 공급자·버전을 무시할 수 있다.** 설치용 helper는 같은 기본 모델 ID에 고정 공급자의 최신 파일을 덮어쓴다. 스토어 메타데이터는 이전 공급자·버전으로 남는다. 연결이 중간에 끊기면 설정 파일만 새 것으로 바뀌기도 한다. 수 바이트 예시 모델을 사용한 helper 재현 결과이며 실제 사용자 모델을 바꾸지 않았다. I01, P1.
2. **이미 설치한 모델도 오프라인 확인·복구가 먼저 실패한다.** 로컬 파일 확인 전에 Hugging Face 메타데이터를 요청한다. 따라서 ‘설치된 파일 재사용’은 인터넷 없이 동작한다는 의미가 아니다. I02, P1.
3. **앱 설치 위치와 별도 모델·환경 저장 위치의 용량을 함께 안내하지 않는다.** 모델은 `%APPDATA%`에 저장되므로 앱을 다른 드라이브에 설치해도 시스템 드라이브 공간이 부족할 수 있다. I03, P2.
4. **진행 바가 100%에서 0%로 돌아가고 준비·검사·재시도 중 활동을 충분히 표현하지 않는다.** 텍스트는 단계에 맞게 바뀌지만, 검사 중 막대는 정지한 0%이며 다운로드 재시도 이벤트도 없다. I05, P2.
5. **초기 경로 접근 실패는 자세한 오류·결과 파일을 남기는 처리 밖에 있다.** 모델 폴더 권한 오류를 주입하면 원래 오류와 결과를 전달하지 못하고 NSIS의 일반적인 ‘저장 공간과 설치 로그 확인’ 안내로 내려간다. I06, P2.

P0를 확인한 것은 아니다. I01은 모델 구성 보존 문제이며 녹음·메모 손실이 재현됐다는 뜻이 아니다.

## 현재 상태와 검증 범위

| 항목 | 확인 결과 |
| --- | --- |
| package.json / 설치 파일 버전 | 2.7.0 / 파일 버전 2.7.0 |
| 조사한 기존 설치 파일 | `release/stage5/LOXT-Setup-2.7.0-x64.exe` |
| 파일 크기 | 193,806,391 bytes, 약 184.83 MiB |
| SHA-256 | `4FB07FAC534E40A3174E76FB52DA41CADA22921D394023701C4182C804129407` |
| Authenticode | `NotSigned` |
| 설치 방식 | NSIS, 사용자 단위, 관리자 권한 상승 없음, 설치 폴더 선택 가능 |
| 삭제 설정 | 앱 데이터 전체 삭제 없음. 별도 제거 hook은 전용 `transcription` 폴더 삭제 |
| 실행·바로가기 | 완료 화면 체크박스에서 선택. 기본 electron-builder `runAfterFinish`는 false |
| 언어 구성 | 한국어·영어 언어를 패키지에 포함하지만 사용자 정의 화면 문구는 한국어 상수 |

증거: [환경·설치 파일 정보](../test-results/ux-audit-next/installer/environment.json), [패키지 helper 동일성](../test-results/ux-audit-next/installer/helper-parity.json). `install_models.py`, `downloads.py`, `engine_prepare.py`, `installer_progress.py`는 현재 패키지 resources의 사본과 각각 SHA-256이 동일했다. NSIS 코드 자체의 화면 검증을 대신하는 증거는 아니다.

안전한 Windows VM/Windows Sandbox를 이번 환경에서 확보하지 못했다. 명령 탐색에서는 WSL만 반환됐고, Computer Use 앱 목록에도 격리된 Windows 테스트 창이 없었다. CIM 접근도 제한됐다. 이는 해당 기능이 영구적으로 설치 불가능하다는 판단이 아니다. 새 앱 프로필이나 다른 설치 폴더만으로는 HKCU/HKLM 설치 탐지, 동일 앱 ID의 제거 프로그램, 바로가기 변경을 격리할 수 없다. 따라서 **실제 설치 파일을 host에서 실행·업데이트·복구·제거하지 않았다.** Computer Use skill과 안내를 읽었고 sky 초기화·앱 열거는 성공했다. 사용자의 열린 앱에는 입력하지 않았다.

실행한 검증:

- `test-results/ux-audit-next/installer/probes.py`: 실제 Python helper를 사용하는 작은 테스트 폴더와 네트워크·오류 대역. **6/6 통과**. 로컬 모델·프로그램 설치, 외부 다운로드, GPU 추론, 레지스트리 변경 없음.
- 기존 `scripts/release.test.cjs` 중 `unsupported paths/settings` 검사: **1/1 통과**. 설정 검증, 기본 하드웨어 추천, 지원 연산 선택의 순수 함수만 실행했다.
- 기존 `scripts/installer-lifecycle-smoke.py`와 `installer-models-smoke.py` 내용을 읽었다. 전자는 private HKCU 키와 제거 stub을 쓰고, 후자는 NSIS 하네스·Win32 조작을 사용한다. 이번 조사에서는 실행하지 않았다. `test-results/improvements-1.11.0/installer-lifecycle.log`의 과거 성공은 현재 2.7.0 실제 설치 성공으로 간주하지 않았다.

로그: [helper 검사](../test-results/ux-audit-next/installer/probes.log), [결과 상세](../test-results/ux-audit-next/installer/probe-results.json), [기존 테스트](../test-results/ux-audit-next/installer/existing-test.log). Python runtime은 `Failed to find real location ...` 경고를 stderr에 출력했지만 runner와 테스트는 정상 종료했다. 해당 경고는 설치·추론 실패의 증거가 아니다.

## 전체 발견 사항

| ID | 분야 | 우선순위 | 문제 | 근거 | 사용자 영향 | 개선 방향 | 규모 | 검증 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I01 | 버그·모델 보존 | P1 | 설치용 모델 갱신이 스토어의 repo/revision을 무시하고 구성 파일을 개별 교체 | `downloads.py:143`, `:144`, `:153`, `:167`; 실제 helper 예시 | 사용자 선택 모델과 표시 정보 불일치, 실패 후 신·구 파일 혼합 가능 | 고정 계획과 기존 모델 정보 존중, 전체 디렉터리 staging·검증·commit·복구 | 중 | 실제 재현: helper 범위 |
| I02 | 실패·복구 UX | P1 | 기존 모델 재사용도 서버 metadata 요청 실패 시 중단 | `downloads.py:144`; local hash 전에 오류 | 오프라인 업데이트·복구에서 불필요한 실패, 대용량 파일 다시 받을 것으로 오해 | 저장된 검증 manifest를 통한 오프라인 확인과 모델 업데이트 분리 | 중 | 실제 재현: helper 범위 |
| I03 | 설치 선택 UX | P2 | 모델·환경 용량 합계와 AppData 대상 드라이브 공간 확인 부재 | `installer.nsh:69`, `:214`, `:240`; helper 경로 | 다른 드라이브 설치로도 부족 공간 해결 못 함, 후반 실패 비용 | 앱/모델/환경 대상별 예상·최소 필요 용량과 여유 공간 표시 | 중 | 코드상 확인; 디스크 부족 실험 미실행 |
| I04 | 취소·완료 UX | P2 | ‘취소’가 이미 설치된 앱 보존 또는 준비 건너뛰기와 혼용 | `preparation-page.nsh:49`, `:111`, `:112` | 설치 전체가 취소되는지, 앱을 사용해도 되는지 이해 어려움 | 준비 중단과 설치 종료 구분, 실패 창의 ‘나중에 준비’, 결과 상태 명시 | 소~중 | 코드상 확인; 실제 NSIS 미검증 |
| I05 | 진행 UX | P2 | 준비·검사는 정지 0%, download 재시도·lock 대기 안내 부족 | `installer_progress.py:51`, `:58`; `downloads.py:65`, `:89`, `:129` | 멈춘 것으로 오해해 창을 닫거나 반복 실행 | 측정 가능한 파일 진행률과 미측정 단계의 indeterminate 활동 구분, 실제 재시도 안내 | 중 | 실제 event·retry 대역 재현; 화면 미검증 |
| I06 | 오류·재시도 | P2 | log/root 초기화 실패가 structured 오류 처리 밖이고 로그 경로만 제시 | `install_models.py:44`, `:47`, `:75`; `preparation-page.nsh:103` | 권한 실패 원인 없이 없을 수도 있는 로그를 찾아야 함 | 초기화 포함 오류 처리, 원인·대응 안내, 로그 열기/복사 | 중 | 실제 예외 주입 재현; 오류 UI 미검증 |
| I07 | 업데이트·성능 UX | P2 | 복구/업데이트에도 체크된 모든 기본 모델과 환경 검사 경로 반복 | `installer.nsh:73`, `:88`; `engine_prepare.py:138`, `:151`, `:161` | 앱 파일만 업데이트하려는 사용자가 범위·대기 비용 예측 어려움 | 앱 갱신/선택 모델 검사를 구분, fingerprint 기반 유효성 재사용 | 중 | 코드상 확인; 실제 시간/용량 미측정 |
| I08 | 작은 창·접근성 | P2 | 동적 장문 오류·경로·GPU 라벨의 DPI·키보드 회귀 검증 미확보 | 고정 dialog-unit 높이, 과거 harness만 있음 | 잘림·포커스 문제 가능; 현재 발생했다는 뜻은 아님 | Windows VM에서 100/150/200%·작은 작업 영역·Tab/Space/Enter 검사 | 소~중 | 의심·추가 검증 필요 |
| I09 | 배포·첫 실행 UX | P2 | 현재 배포용 exe에 Authenticode 서명 없음 | 실제 파일 `NotSigned` | 게시자 식별·신뢰 확인 어려움; 경고 발생 여부는 별도 | 정식 서명과 timestamp 검토, 파일 검증 안내 | 중 | 코드상/실물 메타데이터 확인; 경고 미재현 |
| I10 | 문구·언어 UX | P3 | 앱 역할명·로그의 ‘최적화’, ‘전사’, English 선택 시 Korean 커스텀 문구 | `install_models.py:9`, `:84`; `installer_progress.py:66`; `package.json:144` | 설치 화면과 앱 용어가 다르고 영어 사용자는 부분 번역 화면 | 공통 사용자 명칭과 LangString, 내부 정밀 정보는 상세 로그로 | 소~중 | 코드상 확인; 언어 UI 미검증 |

## 중요한 항목 상세

### I01 — 모델 스토어와 설치 런처의 설치 계약 불일치

관련 위치:

- [install_models.py:20](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/install_models.py:20): 선택된 ID를 기본 downloader로 그대로 전달.
- [downloads.py:143](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/downloads.py:143): 기본 공급자 표를 사용하고 최신 metadata 조회.
- [downloads.py:167](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/downloads.py:167): config/tokenizer를 실행 중인 모델 디렉터리에 각각 교체.
- [model-store.cjs:11](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/model-store.cjs:11): Dropbox turbo도 기본 ID `large-v3-turbo`로 관리.
- [transcriber.cjs:257](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/transcriber.cjs:257): 앱 스토어 설치는 journal/staging/revision registry를 함께 사용.

재현: 예시 `store-models.json`에 Dropbox turbo와 revision `a…a`를 저장하고 모델 3개 파일에 `OLD`를 넣었다. 기본 installer helper의 `install(..., ['large-v3-turbo'])`를 호출했다. 외부 서버는 revision `b…b`, `NEW`의 수 바이트 응답으로 대역 처리했다. 실제 요청은 mobiuslabsgmbh의 최신 metadata 주소로 향했고 모델은 `NEW`로 바뀌었지만 registry의 Dropbox/revision `a…a`는 그대로였다. 별도 사례에서 tokenizer 응답만 실패시키면 config는 새 파일, tokenizer와 model.bin은 OLD로 남았다. 순서/보존 문제의 재현이며 예시 model.bin은 추론 가능한 모델이 아니다.

기대: 기존 공급자와 선택 버전을 유지하며 필요한 검사만 하거나, 모델 업데이트를 별도로 명시적으로 선택한다. 실패 시 이전의 완전한 구성이 유지된다.

권장: installer와 앱이 동일한 고정 다운로드 계획·staging commit/recovery를 사용하게 한다. 앱의 모델 역할·별명과 파일 공급자 정보를 별개로 보존한다. 비용은 모델 교체 중 임시 공간이 더 필요하고 기존 manifest 없는 설치에 대한 이전 처리 정책이 필요하다는 점이다.

수용 기준: 다른 공급자 turbo/이전 revision/외부 역할 모델 설치 후 앱만 업데이트, 준비 취소, config 성공 후 bin 실패 모두에서 기존 파일과 registry가 일치한다. 새 모델 갱신은 승인된 repo/revision 전체가 commit된 경우에만 성공으로 표시한다.

### I02 — 기존 모델 재사용이 네트워크에 종속

[downloads.py:144](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/downloads.py:144)의 metadata 조회가 로컬 bin 크기/hash 확인보다 먼저다. 기존 파일을 넣고 metadata 요청에 오프라인 오류를 주입했을 때 파일은 보존됐지만 `sha256`은 호출되지 않고 오류가 전달됐다.

기대: 기존 pinned manifest로 검사 가능한 경우 인터넷 없이 재사용하고, 확인 불가능한 경우 ‘로컬 모델이 삭제되었다’고 표현하지 않는다. 현재도 모든 모델 체크를 해제하면 앱 설치 자체를 계속할 수 있으므로 오프라인 앱 설치 전체가 불가능하다는 주장은 아니다. Python/pip 환경 준비에도 별도 네트워크 의존이 있으므로 모델 manifest 변경만으로 전체 오프라인 준비가 해결되지는 않는다.

권장: 검증 manifest와 완료 marker를 저장하고 ‘설치된 버전 확인’과 ‘새 버전 받기’를 분리한다. hash 검사 비용, 위·변조되거나 오래된 manifest의 처리와 출처 인증을 고려한다.

수용 기준: 정상 manifest/파일로 오프라인 앱 업데이트가 가능하다. 손상되거나 출처 미확인 파일에는 재사용 성공을 주장하지 않고 모델 준비를 뒤로 미룰 수 있다. 네트워크 재연결 시 명시적 갱신·재시도가 정상 동작한다.

### I03 — 모델 용량과 실제 저장 드라이브

앱 설치 위치는 바꿀 수 있지만 [installer.nsh:69](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/installer.nsh:69)의 모델 root는 AppData다. 모델 행은 bin 대략 크기를 보여주며 Python/GPU/화자 분석 환경의 다운로드·설치 추가 비용은 ‘추가 다운로드와 저장 공간 필요’로만 표시한다. 해당 helper들에서 총 용량 계산/여유 공간 사전 검사를 확인하지 못했다. 기본 NSIS 앱 공간 검사까지 없다고 주장하는 것은 아니다.

예상 재현 조건: D:에는 공간이 있고 AppData가 위치한 C:에는 모델·임시 환경 공간이 부족한 별도 VM에서 D:에 앱을 설치하고 표준/고성능을 선택한다. 기대는 대상별 안내와 부족 공간 선제 발견이며, 현재 전체 흐름은 실험하지 않았다. 사용자 드라이브를 채우지 않았다.

권장: 실제 모델 metadata와 실행 환경 계획을 바탕으로 AppData 드라이브와 임시 설치 드라이브를 확인한다. 다운로드 크기와 설치 후 용량은 분리한다. 정확한 크기를 모를 때 범위/최소 필요로 표현하고 계산값을 확정값처럼 표시하지 않는다.

수용 기준: C: 부족/D: 충분 사례에서 잘못된 설치 위치 변경 안내를 하지 않는다. 런타임·staging 추가 공간과 모델 재사용 여부가 반영된다. 실행 중 공간 부족도 파일 보존·재시도 가능한 오류로 처리한다.

### I04 — 취소와 부분 완료

[preparation-page.nsh:49](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh:49)는 취소가 준비 중단이고 이미 받은 파일은 재사용된다고 안내한다. 모델 준비는 앱 파일 설치 뒤이므로 앱은 이미 남아 있다. 실패 창 [111행](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh:111)의 MB_RETRYCANCEL에서 Cancel을 선택하면 준비 완료 flag를 세우고 다음 버튼을 활성화하며 ‘앱은 설치했지만 변환 준비 미완료’ 완료 문구를 사용한다.

이는 코드가 실패를 성공으로 숨기는 동작은 아니다. 다만 동일한 ‘취소’가 전체 설치 취소·준비 중단·준비 건너뛰기를 뜻해 사용자가 현재 보존 상태를 알기 어렵다.

권장: 실패 선택지는 ‘다시 시도 / 나중에 준비’, 진행 버튼은 ‘준비 중단’처럼 동작에 맞는 문구를 검토한다. 완료 화면은 앱 설치됨과 선택 모델 준비 여부를 분리한다. 종료 확인은 앱·받은 파일이 남는지 짧게 설명한다. 외부 다운로드를 다시 받지 않는 재시도 정책은 유지한다.

수용 기준: 앱 파일 설치 전·후, 다운로드 중, 검사 중, 실패 창에서 각각 취소했을 때 앱·모델·사용자 자료의 보존 여부와 다음 행동이 맞게 안내된다. 취소 시 소유한 모든 준비 자식 프로세스가 종료되는지 실제 VM에서 재검증한다.

### I05 — 진행 중임을 이해하기 어려운 구간

[installer_progress.py:42](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/installer_progress.py:42)를 UI 메시지 전송 없이 실제로 호출해 기록했다. 모델 파일 100% 후 engine-start/validation-start는 bar 값 0을 보낸다. 단계 문구는 3/5, 4/5로 바뀐다. 이 막대는 전체 설치 진척이 아니라 현재 파일/단계 값이지만 동일 위치라 혼동 가능하다.

[downloads.py:65](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/downloads.py:65)의 한 청크에 5회 오류를 주입한 결과 요청 5번, sleep 요청 1/2/3/4/5초, phase 이벤트 하나만 기록됐다. 실제 sleep은 대역으로 처리했으므로 **15초나 네트워크 timeout을 실제 측정했다는 뜻은 아니다.** lock은 [129행](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/downloads.py:129)에서 대기한다. installer의 install()은 root lock 획득 후에 model-start를 보낸다.

권장: 측정 불가능한 설치·검사·다른 작업 대기는 indeterminate 상태/활동 표시와 현재 단계 문구를 사용한다. 실제 횟수를 기반으로 재시도 중임을 알리고 재시도 마지막 종료가 임박했음을 안내한다. 진행률을 가짜로 증가시키지 않는다. 현재 파일 진행과 전체 단계를 명확히 구별한다. 너무 빈번한 상태 업데이트로 UI를 방해하지 않도록 제한한다.

수용 기준: 응답 없는 서버, 같은 root의 다른 준비 작업, 모델 로딩, 다중 모델 설치에서 현재 무엇을 기다리는지 알 수 있다. 완료 100%는 해당 완료 대상과 일치하고 불확정 단계에서 가짜 퍼센트를 만들지 않는다.

### I06 — 초기 오류의 원인 전달

[install_models.py:47](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/install_models.py:47)의 root.mkdir에 권한 오류를 주입했을 때 상세 try/except에 도달하지 않아 `result.txt`, `installer-error.txt`, log가 모두 생성되지 않았다. pid 파일은 먼저 생성된다. NSIS는 자식 종료를 감지하고 [preparation-page.nsh:104](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh:104)의 일반 오류를 사용한다. 즉 무한 대기를 재현한 것이 아니라 **오류 원인을 잃는 문제**다.

권장: 디렉터리·로그·진행 초기화까지 structured handler에 넣고 모델 root가 쓰기 불가해도 installer plugin temp에 실패 이유를 전달한다. 사용자에게 원인에 맞는 짧은 안내를 먼저 표시하고 log 열기·경로 복사·고급 상세를 제공한다. 개인정보 포함 로그를 자동 전송하지 않는다.

수용 기준: 모델 폴더 권한 없음, log 생성 실패, result 쓰기 실패, 잘못된 선택, 자식 조기 종료에서 긴 경로와 traceback만 보여주지 않고 원인과 선택지가 나타난다. 재시도는 부분 파일을 안전하게 재사용하며 이후 정상 준비가 가능하다.

## 나머지 항목의 검증 계획과 부작용

### I07 — 업데이트/복구 범위

[installer.nsh:73](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/installer.nsh:73)는 설치된 세 기본 모델을 모두 체크한다. [engine_prepare.py:138](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/engine_prepare.py:138) 이후는 venv/pip/환경 및 기본 화자·출력 장치 준비, 선택 모델별 probe/실제 준비 검사를 수행한다. 캐시 파일이 곧바로 매번 재다운로드된다는 뜻은 아니고, 체크한 전체 범위의 준비 경로를 반복 실행한다는 뜻이다.

앱 파일 갱신과 깊은 복구를 분리하고 환경 버전·드라이버·모델 fingerprint가 유효한 경우 재사용한다. 캐시 재사용 때문에 드라이버 변경·손상 환경을 놓치지 않도록 깊은 검사 경로는 유지해야 한다. 수용 기준은 정상 update/강제 복구/드라이버 변경/손상 marker를 별도 VM에서 확인하고 실제 시간·다운로드 bytes를 기록하는 것이다. 이번에 시간·속도 향상은 측정하지 않았다.

### I08 — DPI·키보드는 현재 판정 유보

모델 화면은 100% 너비와 dialog-unit 단위를 사용한다. 1.3.1 이전 잘림이 현재도 재현된다고 가정하지 않는다. 다만 [installer.nsh:216](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/installer.nsh:216)의 14u 모델 행과 12u 상태, [preparation-page.nsh:56](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh:56)의 22u 동적 상세에는 긴 GPU 이름·실제 파일명·장문 오류가 들어간다. 이번에는 실제 글꼴 폭/렌더링/Tab 순서를 측정하지 않았다.

VM에서 Windows 100/150/200%, 1280×720 작업 영역, 키보드 전용 Tab/Shift+Tab·Space·방향키·Enter·Esc, 화면 읽기 도구를 확인한다. checkbox/radio/drop-list를 표준 NSIS 컨트롤로 구현한 것은 좋은 기반이다. 복잡한 사용자 정의 테마로 바꾸기보다 실제 측정된 잘림만 높이·줄바꿈·간결한 요약/상세 창으로 조정한다. 수용 기준은 완료·오류·취소까지 모든 조작이 키보드로 가능하고 장문 상태가 핵심 행동 버튼과 겹치지 않는 것이다.

### I09 — unsigned 배포

`Get-AuthenticodeSignature`로 현재 exe의 NotSigned를 확인했다. package.json의 `signAndEditExecutable: true`나 빌드 로그 ‘signing’은 인증서가 실제로 적용됐다는 증거가 아니다. SmartScreen이 반드시 막는지·어떤 경고가 뜨는지는 깨끗한 다운로드 환경에서 재현하지 않았다.

정식 코드 서명·timestamp와 게시자 일관성을 검토한다. 비용·인증서 관리·배포 파이프라인 변경이 필요하며 서명만으로 평판 경고가 즉시 사라진다고 보장하지 않는다. 수용 기준: 실제 배포 asset의 서명이 Valid이고 인증서 게시자·timestamp가 기대값과 일치한다. 깨끗한 VM에서 웹 다운로드부터 실행까지 기록한다. 보안 경고를 자동 우회하지 않는다.

서명과 파일 평판을 구별하는 판단은 [Microsoft의 SmartScreen 개발자 안내](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)를 참고했다. 현재 LOXT의 실제 경고 발생 여부를 이 문서만으로 확정하지 않는다.

### I10 — 사용자 용어와 언어

화면의 기본 역할명은 앱과 동일하게 저성능·표준·고성능이다. 설치 log의 `PRESETS['small']='최적화'`와 완료/환경 상태의 ‘전사’가 섞여 있고, English 언어를 포함하면서 custom 화면은 LangString 대신 Korean 상수다. 사용자 모델 역할을 변경할 수 있는 앱에서는 installer의 3개 기본 모델은 ‘기본 제공 모델’로 명확하게 구분할 필요도 있다.

같은 역할/내부 모델 ID/사용자 별명을 구별하고 용어를 통일한다. CPU/GPU/int8 같은 세부 정보는 실제 대응에 필요한 경우 상세로 보인다. 기존 동작을 숨기면서 단순화하지 않는다. 수용 기준: 한국어의 기능명과 모델명이 앱/installer/log에서 대응되고 English 모드의 custom 화면과 오류 안내가 일관된다. 로그 내부 기술 용어까지 전부 없앨 필요는 없다.

## 공식 문서와 공개 UI 참고

기준은 LOXT의 기존 로고·차콜·SUIT 스타일과 단순한 작업 흐름이다. 타 제품의 기능·외형을 그대로 복제하자는 제안이 아니다.

- [VS Code Windows 설치 문서](https://code.visualstudio.com/docs/setup/windows): 사용자 단위 설치를 권장하며 관리자 권한이 필요 없고 background update와 ZIP 대안을 설명한다. LOXT의 사용자 단위 설치 선택은 유지할 만하다. 문서 확인이지 VS Code installer를 직접 실행한 비교는 아니다.
- [Visual Studio 공식 설치 안내](https://learn.microsoft.com/en-us/visualstudio/install/install-visual-studio?view=visualstudio), [설치 수정 안내](https://learn.microsoft.com/en-us/visualstudio/install/modify-visual-studio?view=visualstudio): 선택 가능한 component와 뒤에서 수정하는 흐름, 진행 상태와 Launch를 구분한다. [공개 구성 선택 화면](https://learn.microsoft.com/en-us/visualstudio/install/media/visualstudio/new-installer-experience.png?view=visualstudio)도 제공된다. 이미지 URL 응답은 확인했지만 Browser Use에서 iab·chrome provider가 모두 unavailable로 반환되어 직접 화면 렌더링 비교까지 완료하지 못했다.
- [Microsoft Progress Bars 지침과 공개 화면](https://learn.microsoft.com/en-us/windows/win32/uxguide/progress-bars): 측정 불가능한 작업은 indeterminate 활동으로 표현하고, 중단이 부분 상태를 남기는 경우 Cancel/Stop 의미를 구분한다. [공개 Stop 화면](https://learn.microsoft.com/en-us/windows/win32/uxguide/images/progress-bars-image4.png)은 접근 가능한 참고 링크다. LOXT 실제 화면 재현 증거로 사용하지 않는다.
- [NSIS nsDialogs 공식 문서](https://nsis.sourceforge.io/Docs/nsDialogs/Readme.html): pixels/dialog units/percentage 배치 단위와 focus/control APIs를 확인했다. dialog-unit 사용이 모든 DPI 문제 해결을 보증하지는 않는다.
- [Windows Sandbox 공식 설명](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/): 별도 hypervisor 기반 Windows 환경이며 종료 시 내용이 폐기된다. 기존 host 설치와 별도 앱 프로필은 이에 해당하지 않는다.

## 유지해도 괜찮은 부분

- 사용자 단위 설치·관리자 권한 상승 없음, 기본 앱 파일 설치와 선택 모델 다운로드 분리.
- GPU 감지와 CPU 대체, 기존 모델 선택/장치 설정을 성공 후 처리하는 기본 방침.
- 모델 파일 크기·hash 검증, range 기반 다운로드·부분 청크 manifest, 준비 parent/child 종료 감시.
- 모델 체크를 전부 해제해 추후 준비 가능, 실패 시 재시도와 미완료 안내.
- 버전 비교로 downgrade를 막고 같은 버전 복구와 이전 버전 업데이트를 나누는 관리 화면.
- 제거 범위를 전용 transcription 폴더로 제한하고 appData 전체/보관함을 지우지 않는 구조. 모델 제거가 OS 휴지통으로 이동한다는 안내는 없으며 이번 검사에서도 복구 가능하다고 주장하지 않는다.

## 권장 순서와 남은 범위

먼저 I01의 모델 보존·원자적 교체와 I02의 오프라인 재사용 계약을 해결하고 helper 회귀 테스트를 추가한다. 다음 업데이트에서는 I03~I07을 설치 선택·진행·실패 UX로 묶는다. I08은 실제 Windows VM을 확보한 뒤 현재 설치 파일로 확인해 실제 잘림/포커스 문제만 수정한다. I09는 코드 수정과 별도로 배포·서명 준비가 필요하다. I10의 문구는 위 상태 변경과 함께 맞추는 편이 좋다.

실제 first install·update·repair·uninstall, 파일 복사 중 Cancel, 설치 후 실행·바로가기, 150/200% DPI, keyboard/screen reader, 실제 Windows 보안 경고, GPU/CPU 실행 검사, 진짜 인터넷 오류·디스크 부족·model lock 경쟁은 현재 미검증이다. host 설치를 대신 실행하거나 과거 성공 로그를 현재 검증으로 바꾸지 않았다. 향후 VM에서는 예시 녹음·스크립트·메모·PDF·그리기·사용자 지정 보관함의 hash를 설치 전후 비교하고, 업데이트는 모델을 보존하며 제거는 전용 환경만 없애는지 확인해야 한다.

앱·설치·사이트 코드를 개선하거나 새 버전/설치 파일을 만들지 않았으며, 이 보고서의 제안에는 아직 구현 승인이 포함되지 않는다.
