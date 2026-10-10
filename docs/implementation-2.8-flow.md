# LOXT 2.8.0 작업 흐름·저장·탭 개선 검증

2026-10-10. `docs/ux-audit-next.md`와 세부 작업 흐름 보고서의 F01–F08을 구현했다. 기존 SUIT, 차콜 표면, 다크·라이트 토큰과 컴포넌트 형태를 유지했다. 사용자 녹음·폴더·메모·모델·설정은 사용하거나 변경하지 않았다.

## 항목별 적용

| ID | 적용 결과 | 주요 위치 | 검증 |
| --- | --- | --- | --- |
| F01 | Work·Live 사이드바 메뉴에서 폴더 경로와 기록 ID를 각각 `folders`와 `ids`로 전달한다. 폴더 및 하위 기록의 휴지통·복구 범위를 설명하고 처리 중 확인을 막는다. | `src/App.jsx:337`, `src/LiveWorkspace.jsx`, `src/ActionMenu.jsx` | Work 폴더 이동·휴지통·복구, Live 폴더 휴지통 실제 UI; 두 보관함 계층 이동·복구 단위 회귀 |
| F02 | 새 녹음의 버리기는 원본과 첨부 메모를 휴지통으로 보내도록 확인한다. WAV 헤더 및 진행 중 세션을 안전하게 마무리하고 녹음·메모·첨부파일을 복구 가능하게 보존한다. journal로 중단 뒤에도 휴지통 상태를 복원한다. | `src/RecordingPage.jsx:271`, `electron/library.cjs:discardRecording`, `src/App.jsx` | 합성 입력 녹음의 취소·확인 실제 UI, 첨부 메모 유지; 재시작·영구 삭제·중단 journal 단위 회귀 |
| F03 | 사용자 폴더 경로와 시스템 화면의 scope를 분리한다. 기존 `library` 폴더·저장된 패널 경로는 실제 폴더로 해석하고, 시스템 모든 기록은 명시적 scope로 조회한다. | `src/LibraryView.jsx`, `shared/library-range.cjs`, `src/App.jsx`, `src/LiveWorkspace.jsx` | 메인·사이드바·오른쪽 패널의 `library` 폴더 실제 UI; 기존 입력·명시적 시스템 조회 단위 회귀 |
| F04 | 제목의 저장 대기·저장 중·실패·완료를 표시한다. 메모·PDF·그리기 본문 상태와 통합하고 실패 후 재시도를 제공한다. 저장 중 새로 입력한 제목이 오래된 응답으로 덮이지 않게 한다. | `src/useDocumentTitle.js`, `src/DocumentHeader.jsx`, `src/MemoPage.jsx`, `src/MemoEditor.jsx`, `src/NoteDetail.jsx`; PDF 연결은 모바일 담당 | 제목 dirty/실패/재시도, 지연 응답 중 연속 수정 실제 UI |
| F05 | 오른쪽 탭에 stable ID·tab/panel ARIA 연결·roving tabindex와 방향키/Home/End 탐색을 적용한다. Enter로 활성화하며 닫으면 인접 탭, 마지막 탭이면 패널 열기 버튼으로 포커스를 돌린다. | `src/PanelTabs.jsx` | Arrow/End/Enter·Ctrl+W·인접 탭·마지막 닫기 포커스 실제 UI |
| F06 | IPC 오류를 `cleanError`로 정리한다. 메뉴와 보관함 실패에는 짧은 원인, 재시도 및 접힌 기술 상세를 제공한다. | `src/ActionMenu.jsx`, `src/LibraryView.jsx`, Work·Live toast | 자기 하위 폴더로 이동 실패 및 재시도 UI 실제 확인; 최종 보관함 상세 패치는 통합 빌드 대상 |
| F07 | 진행 중 녹음의 신규 녹음·파일·YouTube 진입 상태를 일치시킨다. Live 파일 가져오기도 녹음 중 가드한다. | `src/App.jsx:316`, `src/LiveWorkspace.jsx` | 합성 입력 녹음 중 홈/사이드바 비활성 실제 확인 |
| F08 | 미설치 기본 모델은 `기본 선택 · 설치 필요`로 표시한다. 설치된 모델만 선택 체크를 보여 기본 지정과 사용 가능 상태를 구분한다. | `src/HomeModels.jsx` | 미설치 모델의 문구·체크·aria 상태 실제 UI |

## 검증 증거와 범위

- `scripts/flow-2.8.test.cjs` 신규 5개와 관련 library/panel/folder 회귀를 함께 실행해 **18/18 통과**했다. 로그: `test-results/implementation-2.8.0/flow-unit.log`.
- `scripts/flow-2.8-ui.mjs`는 별도 프로필의 실제 Electron 창에서 **8/8 통과**, renderer 오류 **0개**였다. 로그: `test-results/implementation-2.8.0/flow-ui.log`. 결과·화면: `test-results/implementation-2.8.0/flow/results.json`과 같은 폴더의 PNG.
- UI 검증은 source Electron 실행 + 당시 빌드된 renderer를 사용했다. 최종 설치 파일은 루트의 통합 패키지 검증으로 별도 확인한다.
- 무음 WAV·예시 스크립트·합성 oscillator를 사용했다. 실제 마이크 입력, 모델 다운로드, GPU 변환 성공이나 변환 정확도를 이 결과로 주장하지 않는다.
- 실패/지연 제목 저장은 별도 테스트 프로필의 IPC handler에 일시적인 오류·지연을 주입했다. 테스트 종료 뒤 handler와 앱을 정리했다.
- 초기 UI harness의 executablePath/argv, 잘못된 DOM 기대, frozen preload API 대체 실패는 테스트 문제였다. 실제 IPC 주입과 정상 실행 경로로 고쳐 최종 재검증했다.

## 추가 연결·초안·설치 복구 경계 검증

루트의 신규 연결/오프라인 회복 구현을 검토하며 다음 경계를 보완했다.

1. 온라인 소켓 교체 후 이전 RPC가 일반 timeout까지 남는 문제를 즉시 거부로 바꿨다. 다른 PC의 hostId를 받으면 이전 소켓과 preview/RPC를 차단하고, dispose 뒤에도 RPC가 즉시 실패한다. 새 승인 뒤 CSRF를 갱신하며 오래된 session 확인 응답은 generation으로 무시한다.
2. 같은 QR의 중복 승인은 하나의 진행 중 Promise를 공유하고 이후 멱등 처리한다. 거절된 QR을 다시 승인해 사용할 수 없는 장치를 만드는 경로를 막고 새 QR을 안내한다.
3. 모델 설치의 rollback에서 `hadTarget=true`인데 이전 target·backup이 모두 없으면 journal을 지우지 않고 보존하는 오류를 반환한다.
4. 그리기 초안의 중복·누락 페이지 ID와 범위를 새 사본 생성 전에 검사한다. 원래 문서는 변경하지 않고 유효한 필기만 별도 사본에 저장한다.
5. 메모 첨부 복구는 루트의 파일별 복사 구현을 검증했다. 원본 문서를 영구 삭제한 뒤에도 복구 메모의 첨부 바이트를 읽을 수 있었다.
6. 웹 adapter의 연결 초기화 전체를 정리 범위에 넣었다. 소켓은 준비됐지만 초기 설정 RPC가 실패한 경우에도 소켓과 online/pagehide/pageshow/visibilitychange 리스너를 제거한다. 실패 뒤 재시도가 이전 연결을 누적하지 않으며, 초기 ready/resync 이벤트도 바깥 scope의 callback으로 안전하게 처리한다.

신규 `scripts/connection-recovery-2.8.test.cjs` **11개**, `scripts/connection-recovery-2.8.test.mjs` **9개**가 통과했다. 기존 연결·v2 서비스·모델 스토어 회귀를 함께 실행해 **36/36 통과**했다. 최종 로그: `test-results/implementation-2.8.0/connection-regression.log`. 이후 추가한 초기 ready/resync 및 dispose 후 reconnect 즉시 실패 검사도 `transport-final.log`의 **9/9 통과**로 확인했다.

실제 별도 HTTPS 서버와 WebSocket에서 승인 → hello → revoke close(1008) → HTTP 401 → 재승인 → 새 CSRF를 확인했다. 이전 CSRF의 HTTP RPC는 403, 새 CSRF는 200이었다. 브라우저 transport 부분은 가짜 DOM/WebSocket/fetch로 이벤트 순서를 검증하는 단위 테스트이며 Safari·실제 Wi-Fi 단절 증거와 구분한다.

함께 확인한 조건: 거절/만료 문구 구분, 20개 만료 pending 청소, 승인의 동시 중복, 다른 host 초안 거부, unreadable 첨부의 사본 미생성, Work/Live 사본 격리, 다중 페이지 그리기·원본 불변, 설치 rollback/commit/첫 설치/중복 경로/원본 누락/경로 traversal/Windows junction 거부. 모든 파일은 테스트가 생성한 별도 디렉터리에 한정했다.

## 패키지 작업 흐름 회귀

2026-10-10 `node scripts/flow-2.8-ui.mjs release/stage5/win-unpacked/LOXT.exe`를 별도 예시 프로필로 실행해 8/8 통과했다. 사이드바 폴더 이동/휴지통, 사용자 `library` 폴더, 제목 저장 실패·재시도, 오른쪽 탭 키보드, 기본 모델 안내, 녹음 중 진입점과 안전한 버리기, Live 폴더 휴지통을 확인했다. 로그는 `test-results/implementation-2.8.0/flow-packaged.log`, 결과는 `flow/results.json`이다. 실제 마이크·GPU 추론 검증을 의미하지 않는다.

## 유지한 동작·제약

- 휴지통 이동은 즉시 디스크 공간을 회수하지 않는다. 확인창에 이를 명시한다.
- 기존 사용자 폴더 이름이나 문서 ID를 변경하지 않는다. 시스템 scope는 조회 의미를 분리하는 변경이다.
- 제목 저장은 기존 blur/Enter 시점을 유지한다. 매 키 입력마다 원격 저장 요청을 만들지 않는다.
- 탭 방향키는 선택을 즉시 바꾸지 않는 수동 활성화 방식을 사용해 무거운 문서의 불필요한 열기를 피한다.
- 복구 사본은 현재 원본의 첨부·PDF 파일을 필요로 한다. 원본 PC가 달라지거나 파일을 읽을 수 없으면 안내하고 초안 자체는 삭제하지 않는다.
- 오프라인 연결 배너·Safari·모바일 뷰포트·설치 GUI와 최종 릴리스 검증은 각각 담당 에이전트/루트의 별도 기록을 따른다.
