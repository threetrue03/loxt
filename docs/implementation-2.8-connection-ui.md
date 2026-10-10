# 2.8.0 연결 복구 UI 실제 검증

`scripts/connection-recovery-ui.mjs`는 별도 예시 보관함과 localhost HTTPS DeviceServer를 실행하고 PC에서 브라우저를 승인한 뒤 실제 UI를 조작한다. 사용자 녹음·메모·모델·연결 기기는 건드리지 않는다. 결과와 화면은 `test-results/connection-recovery-2.8.0/`에 저장한다.

## 검사 범위

| 항목 | 동작과 확인 기준 |
| --- | --- |
| C01 | 열린 메모에서 승인 취소 후 입력한 문장이 화면·localStorage에 남음. RPC는 `APPROVAL_REQUIRED`로 즉시 실패. 연결 관리에서 같은 origin의 새 pair 주소를 입력하고 PC 승인 후 같은 문서의 초안을 저장. 필기 또한 승인 취소 중 그린 선이 유지되고 재승인 후 PC의 objects에 저장 |
| C02 | 브라우저 네트워크 차단과 테스트 서버 소켓 종료. `server-unreachable`, 명시적 RPC 실패, 초안 유지. 네트워크 복구 후 같은 문서 저장 |
| C03 | 다른 origin 주소는 곧바로 열리지 않고 백업 확인 전 버튼 비활성화. 실제 미저장 문장이 들어 있는 초안 JSON 다운로드. 온라인에서 가져오기 후 기존 문서와 별도 UUID의 복구 메모 생성, PC에서 내용과 원본 blocks 유지 확인 |
| C04 | SW의 active/controller와 recovery cache 확인. 서버 종료 후 기존 문서의 미저장 초안을 남기고 탭을 닫음. 같은 브라우저 프로필의 새 탭에서 `/web.html`을 열어 공개 복구 shell 표시, 실제 초안 JSON 다운로드, 새 origin 백업 확인 가드 확인 |
| C05 | 320×568 / 568×320, 다크·라이트의 연결 관리 창이 화면 안에 있고 주소 입력·초안 버튼·Esc 접근 가능. 홈의 연결 상태는 로고와 풋바를 덮지 않음. PDF·메모 화면에서 연결 표시와 문서 제목·도구·PDF 하단 버튼의 교차 영역 없음 |

최종 실행 결과는 `results.json`의 `completed`, `errors`와 검사 목록을 기준으로 한다. 실행 경로·시간·앱 버전·`runtime`을 기록하며 소스 결과는 `results-source.json`, 패키지 결과는 `results-packaged.json`으로 따로 보존한다. 로컬 개발 실행을 설치 파일 검증으로 표기하지 않는다.

2026-10-10 최신 소스 빌드에서 20개 검사를 완료했고 `results-source.json`에 `runtime="source"`, 앱 버전 `2.8.0`, `completed=true`, `errors=[]`를 기록했다. 실제 미저장 `BACKUP-MEMO`를 다운로드하고 별도 UUID의 복구 메모에 가져온 뒤 원본 blocks가 그대로임을 비교했다. SW active/controller와 `loxt-recovery-2.8.0` cache를 확인하고, DeviceServer 종료 후 새 탭에서 `COLDLAUNCH-DRAFT`를 다운로드했다.

같은 날 최종 패키지 `release/stage5/win-unpacked/LOXT.exe`를 `LOXT_ELECTRON`으로 전달해 동일20개 검사를 모두 통과했다. `results-packaged.json`과 최신 `results.json`에 `runtime="packaged"`, 해당 절대 실행 경로, 앱 버전 `2.8.0`, `completed=true`, `errors=[]`가 기록돼 있다. 실제 초안 다운로드·별도 복구 사본·원본 blocks 유지·서버 종료 후 새 탭 복구를 패키지에서도 재확인했다. 이는 패키지 실행 파일의 UI 검증이며 설치 마법사 실행이나 실제 Safari 검증을 뜻하지 않는다.

## 증거

- `01-memo-revoked.png`, `02-memo-reapproved.png`: 메모 초안 보존·재승인.
- `03-ink-revoked.png`: 취소된 승인 상태에서도 원래 문서와 필기 초안 유지.
- `04-network-offline.png`: PC에 연결하지 못함과 문서 저장 실패를 구분.
- `05-recovery-{dark,light}-{320,568}.png`: 작은 모바일 창의 연결 관리·주소 입력·백업 접근.
- `home-status-{320,568}.png`: 홈 풋바와 상태창 위치.
- `pdf-status-{dark,light}-{320,568}.png`: PDF 제목·도구·하단 버튼과 연결 표시의 교차 영역 검사.
- `06-origin-backup-confirmation.png`, `draft-backup.json`: 실제 미저장 문장을 포함한 백업 및 이동 확인.
- `07-offline-coldlaunch.png`, `coldlaunch-draft-backup.json`: 서버 종료 후 새 탭 복구 shell 및 실제 초안 다운로드.

중간 빌드에서 `resync is not defined`가 실제 발생했다. 선언/할당 범위를 고친 최신 소스로 재빌드하고 위 소스 회귀를 통과했다. 원래 실패는 `results-before-resync-fix.json`에 보존하며 삭제하거나 성공으로 바꾸지 않는다.

## 검증의 한계

- Chromium touch 모사와 Windows Electron 소스·최종 패키지 실행이다. 실제 iPad/iPhone Safari, Apple Pencil, iOS 가상 키보드, 홈 화면 PWA cold launch는 이번에 검증하지 않았다.
- 테스트 브라우저는 자체 서명 인증서를 사용하는 private 서버에 대해 `--ignore-certificate-errors`를 사용했다. 따라서 SW 등록·fallback 동작은 실제 확인했지만, 사용자의 기기에서 인증서를 설치·신뢰하는 절차가 성공했다는 증거는 아니다. 인증서가 신뢰되지 않는 실제 브라우저는 SW가 설치되지 않을 수 있다.
- PC와 실제 Wi-Fi를 통한 통신, 배터리 절약 시 탭 중단, 브라우저 저장소 강제 삭제·용량 초과는 미검증이다.
- 새 origin 경고와 백업 다운로드, 같은 PC의 복구 사본 가져오기는 확인했다. 다른 IP·포트의 실제 서버로 이동한 뒤 인증서 재신뢰와 승인까지 연속 수행한 사례는 별도 검증이 필요하다.
- 복구 shell은 공개 UI 자산만 캐시한다. 서버 없이 정상 LOXT 전체를 사용하거나 원본 PDF·녹음·첨부파일을 자동 복구하는 기능이라고 설명하면 안 된다.

실제 모바일 완료 조건은 신뢰된 인증서로 연결 → 미저장 메모·필기·녹음 → 서버 종료와 Safari/PWA 종료 → 재실행 → 초안 사본 받기 → 서버 복구·재승인 → 원본을 덮어쓰지 않는 복구 사본 확인이다.
