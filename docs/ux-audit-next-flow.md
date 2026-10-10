# LOXT 2.7.0 작업 흐름·상태·키보드 UX 조사

조사일: 2026-10-10. 현재 `package.json`과 실제 패키지 앱의 `getAppInfo()` 모두 2.7.0이었다. **조사와 보고만 진행했다.** 앱·설정·설치·사이트 코드는 수정하지 않았다. 사용자 보관함·모델·설정 대신 `test-results/ux-audit-next/flow/`의 별도 프로필을 사용했다.

## 가장 중요한 문제 5개

1. **사이드바 폴더의 이동·휴지통 메뉴가 실패한다(F01, P1).** 폴더 경로를 기록 ID 목록으로 전달한다. Work의 이동/삭제와 Live의 삭제가 실제 패키지에서 실패했으며 폴더는 보존됐다.
2. **새 녹음의 ‘버리기’가 첨부 메모까지 확인 없이 영구 삭제한다(F02, P1).** 합성 녹음과 예시 메모로 재현했다. 이 버튼의 폐기 자체는 의도된 기능이다. 문제는 메모도 사라지고 휴지통·실행 취소로 회복할 수 없다는 범위 안내와 취소 단계가 없다는 것이다.
3. **허용되는 폴더 이름 `library`가 시스템 ‘모든 기록’ 화면과 충돌한다(F03, P2).** 폴더 생성·메모 저장은 성공하지만 그 폴더를 클릭하면 전체 기록이 나타난다. 자료가 삭제되지는 않았다.
4. **제목을 수정해 아직 저장하지 않은 상태도 ‘저장됨’으로 표시한다(F04, P2).** 입력값과 디스크의 제목이 다른 순간을 실제 확인했다. 녹음·스크립트의 제목 저장 상태를 본문 상태와 구분해야 한다.
5. **오른쪽 탭에 방향키 이동·패널 연결 정보가 없고 닫기 후 포커스가 BODY로 떨어진다(F05, P2).** Ctrl+1 이동과 탭 수 유지 자체는 정상이다. 키보드·보조기기 사용자가 다음 행동을 찾기 어려운 문제가 남는다.

P0를 확인하지 않았다. F02는 사용자 데이터 손실 사고를 관찰한 것이 아니라, 임시 자료로 영구 폐기의 범위를 확인한 것이다.

## 실행 조건과 증거

- 실행 파일: `release/stage5/win-unpacked/LOXT.exe`. 소스 개발 서버나 가짜 화면만으로 앱 동작을 판정하지 않았다.
- Windows 패키지 앱에 Playwright Electron을 연결했다. 1440×960 창으로 확인했으며 화면 캡처의 물리 픽셀 크기는 Windows 배율에 따라 달라질 수 있다.
- 예시 프로필에는 Work/Live 각각 `회의`, `회의/하위 자료`, `목적지`, 메모와 8초 무음 WAV·예시 스크립트를 준비했다. 스크립트·화자 A/B는 **UI 예시이며 추론 결과가 아니다.**
- Work 녹음 상태 검증은 실제 MediaRecorder·저장 API를 사용했지만 입력 스트림은 AudioContext oscillator로 대체했다. **실제 마이크 권한·마이크 소리·컴퓨터 루프백 성공의 증거가 아니다.** GPU 추론·모델 다운로드·실제 YouTube 다운로드를 실행하지 않았다.
- 기본 조사 12개 관찰 시나리오, 추가 조사 4개를 실행했다. 이는 16개 기능의 종합 합격 선언이 아니라 정상 동작과 문제를 함께 기록한 조사 결과다. 마지막 실행에서 renderer `pageerror`는 0건이었다.
- [기본 결과](../test-results/ux-audit-next/flow/results.json), [추가 결과](../test-results/ux-audit-next/flow/followup-results.json), [기본 로그](../test-results/ux-audit-next/flow/run.log), [추가 로그](../test-results/ux-audit-next/flow/followup-run.log), [기본 조사 스크립트](../test-results/ux-audit-next/flow/audit.mjs), [추가 조사 스크립트](../test-results/ux-audit-next/flow/followup.mjs).
- 초기 캡처 timeout과 설정을 닫지 않고 홈 버튼을 찾은 locator 실패는 조사 스크립트 문제로 교정했다. 추가 조사 첫 실행은 아직 catalog에 없는 진행 중 녹음 ID를 catalog에서 찾은 스크립트 오류가 있었다. 실제 임시 `note.json`에서 session ID를 확인하는 방식으로 교정했다. 종료 후 이미 닫힌 Playwright app의 process 핸들을 다시 요청한 오류도 스크립트에서 교정했다. 이 실패들은 앱 버그로 집계하지 않았다.
- 실제 기록을 삭제하거나 이동하는 검사는 예시 프로필에만 수행했다. 원본 사용자 앱·프로필은 변경하지 않았다.

## 전체 발견 사항

| ID | 분야 | 우선순위 | 문제 | 근거 | 사용자 영향 | 개선 방향 | 규모 | 검증 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | 폴더·버그 | P1 | 사이드바 폴더 메뉴의 move/trash가 폴더 경로를 기록 ID로 전달 | `App.jsx:337`, `LiveWorkspace.jsx:137`, `library-actions.cjs:25` 및 오류 캡처 | 핵심 정리 동작 실패, 메인 카드 메뉴와 결과 불일치 | target 종류별 ID/폴더 payload를 공통 생성하고 동일 확인 UI 사용 | 소~중 | 실제 재현 |
| F02 | 녹음·회복 UX | P1 | ‘버리기’ 1회 클릭으로 원본·첨부 메모를 영구 폐기 | `RecordingPage.jsx:232`, `:261`, `library.cjs:373` 및 파일 부재 검사 | 녹음만 버린다고 이해하면 작성한 메모까지 복구 불가 | 폐기 범위 확인; 저장된 기록은 휴지통 이동 또는 메모 따로 보관 선택 검토 | 중 | 실제 재현; 의도된 폐기 방식의 UX 위험 |
| F03 | 경로·버그 | P2 | `library` 폴더와 시스템 전체 기록 scope 충돌 | `library.cjs:25`, `LibraryView.jsx:35`, `shared/library-range.cjs:35` | 폴더에 진입한 것처럼 보이지만 전체 기록 표시; 검색·정리 범위 오해 | 시스템 scope와 사용자 경로 분리, 기존 이름 보존·호환 | 중 | 실제 재현 |
| F04 | 저장 상태 | P2 | 제목 dirty 상태와 ‘저장됨’ 표시 불일치 | `useDocumentTitle.js:8`, `DocumentHeader.jsx:3`, `NoteDetail.jsx:74` | 저장 완료를 잘못 확신하고 닫거나 기기 전환 | 제목 저장 중/실패/완료와 본문 저장 상태 통합 | 중 | 실제 재현 |
| F05 | 탭·접근성 | P2 | Arrow 이동/roving tabindex/ARIA 연결·닫기 후 포커스 부재 | `PanelTabs.jsx:15`, `:26`; 실제 focus 결과 | 탭이 많을수록 Tab 이동 증가, 현재 작업으로 복귀 어려움 | 탭 패턴 적용, 닫기 후 인접 탭/패널 열기 버튼으로 포커스 | 중 | 실제 재현 + 코드상 확인 |
| F06 | 오류 회복·문구 | P2 | Electron IPC 오류 prefix가 토스트 앞을 차지하고 실제 원인 잘림 | `App.jsx:344`, `LiveWorkspace.jsx:139`; 삭제 오류 캡처 | 무엇이 실패했는지, 어떻게 다시 시도할지 이해하기 어려움 | cleanError 공통 적용, 작업별 짧은 원인·상세·재시도 제공 | 소~중 | 실제 재현 |
| F07 | 녹음 중 상태 일관성 | P2 | Work 녹음 중 홈 YouTube는 비활성, 사이드바 YouTube는 활성 | `App.jsx:317` 대비 `HomePage.jsx:17`; isDisabled 결과 | 동일 기능이 위치에 따라 가능/불가로 보임 | 진행 중 작업 정책을 공유하고 모든 진입점 일치 | 소 | 실제 재현; 동시 다운로드 실행은 미검증 |
| F08 | 첫 사용·디자인 | P3 | 미설치 기본 모델에 선택 체크가 남아 사용 가능한 모델로 오해 가능 | `HomeModels.jsx:18`, `:19`; 미설치 예시 홈 화면 | 역할·기본 선택·설치 상태 구분에 학습 필요 | ‘기본 선택’과 ‘설치 필요’ 의미를 간결하게 구분, 스토어 링크 유지 | 소 | 디자인 제안; 미설치 UI는 실제 확인 |

## 주요 항목 상세

### F01 — 동일 폴더 메뉴의 서로 다른 동작 계약

위치: [App.jsx:337](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/App.jsx:337), [LiveWorkspace.jsx:137](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LiveWorkspace.jsx:137), [ActionMenu.jsx:56](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/ActionMenu.jsx:56), [LibraryActions:25](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library-actions.cjs:25). 정상 쪽은 [LibraryView.jsx:100](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LibraryView.jsx:100)의 `split()`으로 폴더를 분리한다.

재현: 사이드바 ‘회의’ 우클릭 → 휴지통으로 이동 → 확인 버튼. Work와 Live 모두 오류 토스트가 나타나고 폴더가 남는다. Work에서 우클릭 → 폴더 이동하기 → 목적지도 `선택한 기록을 다시 확인해 주세요.` 오류로 실패한다. 확인 창은 폴더를 ‘1개 기록’으로 설명한다.

기대는 폴더와 하위 기록을 한 작업으로 이동하거나 휴지통에 보존하는 것이다. 실제로는 `ids:['회의'], folders:[]`가 전달되고 기록 존재 검사에서 거부된다. **백엔드가 이를 안전하게 거부한 것이며 폴더 삭제·자료 손실은 발생하지 않았다.** Live 이동은 같은 handler를 코드상 확인했으나 이번 직접 클릭 재현은 Work 이동과 Work/Live 삭제에 한정했다.

증거: [Work 이동 오류](../test-results/ux-audit-next/flow/sidebar-folder-move-error.png), [Work 삭제 오류](../test-results/ux-audit-next/flow/sidebar-folder-delete-error.png), [Live 삭제 오류](../test-results/ux-audit-next/flow/live-sidebar-folder-trash-error.png), 결과 JSON의 `stillThere:true`.

권장: 사이드바·홈 폴더·메인 카드·패널에서 동일한 payload 생성과 확인 문구를 공유한다. 멀티 선택, 자기 하위 이동 거부, tombstone 계층 복구, 실행 취소 기능을 훼손하지 않아야 한다. 확인 UI에서 폴더 이름과 하위 포함 여부도 표시한다.

수용 기준: Work/Live의 사이드바·홈·메인·패널 폴더 각각에 이동/휴지통/복원/실행 취소 검사를 추가하고 기록 ID와 폴더 경로가 섞이지 않는다. 작업 중 연속 확인 클릭도 하나의 작업만 수행한다.

### F02 — 새 녹음 폐기의 메모 포함 범위

위치: [RecordingPage.jsx:218](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/RecordingPage.jsx:218), [RecordingPage.jsx:261](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/RecordingPage.jsx:261), [library.cjs:373](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:373). `discardRecording()`은 `trash-delete.json` journal로 UUID 디렉터리를 영구 제거한다.

재현: 합성 입력으로 Work 녹음 시작 → 해당 세션의 메모 API로 예시 문단 저장 → 녹음 중단 → 메모 열기 → 버리기. 메모 seed는 실제 사용자 입력이 아닌 조사용 데이터다. 버튼 클릭 후 홈으로 돌아가고 확인 창은 없으며, 기록·휴지통에서 ID가 사라지고 UUID 디렉터리도 존재하지 않는다. 메모 읽기는 보관함 확인 오류를 반환한다.

기대는 영구 폐기 범위를 이해하고 최종 선택할 수 있는 것이다. 현재 버튼 이름만으로는 작성한 메모도 함께 영구 삭제됨을 알기 어렵다. 일반 기록 삭제가 확인 후 휴지통 이동이라는 점과도 다르다.

증거: [버리기 전](../test-results/ux-audit-next/flow/discard-with-memo-before.png), [버리기 후](../test-results/ux-audit-next/flow/discard-with-memo-after.png), `followup-results.json`의 `inLibrary:false`, `inTrash:false`, `filesExist:false`. 첫 화면 캡처는 메모 패널 열기 애니메이션 초기 시점일 수 있으므로 메모의 존재·삭제는 API 및 파일 검사를 근거로 한다.

권장: 최소한 ‘녹음과 작성한 메모를 함께 버립니다’라는 확인과 취소를 제공한다. 더 안전한 선택은 이미 확정 저장된 녹음은 휴지통으로 보내는 것이다. 메모를 별도 문서로 유지하는 선택은 설계 확정이 필요하다. 휴지통 방식은 저장 공간을 즉시 확보하지 못하며, 진행 중 part 세션과 저장 완료 기록의 계약을 구분해야 한다.

수용 기준: 메모 없음/있음/저장 실패, 폐기 취소/확인, 재시작 뒤 회복 가능 여부를 검사한다. 영구 폐기를 유지한다면 대상과 복구 불가 여부를 정확히 설명한다.

### F03 — 사용자 경로와 시스템 scope의 이름 충돌

위치: [library.cjs:25](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:25), [LibraryView.jsx:35](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LibraryView.jsx:35), [library-range.cjs:35](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/shared/library-range.cjs:35). `all/recent/trash`는 생성 시 제한하지만 `library`는 제한하지 않고, 조회에서는 시스템 scope로 처리한다.

재현: 임시 프로필에 `library` 폴더 생성 → 그 폴더에 메모 생성 → 사이드바 `library` 클릭. 제목은 ‘모든 기록’이 되고 해당 폴더 밖의 메모·녹음도 표시한다. 실제 메모의 folder 값은 `library`, deleted는 false다. [화면 증거](../test-results/ux-audit-next/flow/reserved-folder-trash.png). 증거 파일명은 초기 조사 시도에서 유지됐지만 **실제 성공 재현 대상은 `library`다.** `trash` 생성은 기존 validation으로 안전하게 거부되어 버그로 집계하지 않았다.

권장: `scope:{kind:'folder',path:...}`와 `scope:{kind:'system',name:...}`처럼 데이터 의미를 분리한다. 당장 추가 금지어만 넣으면 이미 존재하는 사용자 폴더가 해결되지 않는다. 전환 시 저장된 탭 경로·검색·deep link·기존 폴더를 호환해야 한다.

수용 기준: 최상위/하위 폴더의 `library`, 기존 탭 상태, 이름 변경 후 조회가 실제 해당 폴더 범위와 일치한다. 시스템 전체 기록도 유지한다.

### F04 — 제목 편집 상태가 저장 표시와 분리됨

위치: [useDocumentTitle.js:8](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/useDocumentTitle.js:8), [DocumentHeader.jsx:3](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/DocumentHeader.jsx:3), [NoteDetail.jsx:74](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/NoteDetail.jsx:74).

재현: 완료된 예시 스크립트 제목 입력에 새 제목 입력, blur/Enter 전 상태 확인. 상단은 ‘저장됨’, 실제 getNote 제목은 이전 `work 스크립트`다. [화면](../test-results/ux-audit-next/flow/dirty-title-status.png), 기본 결과의 `dirty-title-status`.

제목은 blur/Enter에서 저장하도록 구현되어 있다. 이번에는 저장 실패·앱 종료로 제목을 잃었다고 주장하지 않는다. 본문이 저장됐더라도 제목이 아직 미확정인 상황을 사용자에게 알리는 개선이다.

권장: title hook이 dirty/saving/error 상태를 제공하고 헤더가 이를 우선 반영한다. 저장 중 제목 재편집·다른 기기의 변경도 일관된 상태로 보여야 한다. 키 입력마다 파일을 쓰는 방식으로 바꾸면 원격 저장 요청이 늘 수 있으므로 기존 저장 시점과 debounce 정책을 유지하며 표시부터 맞춘다.

수용 기준: 입력 중/Enter/blur/실패/재시도/충돌/페이지 이동에서 저장 배지가 실제 확정값과 맞는다. 메모·PDF·그리기의 제목 흐름도 동일 hook 사용 범위에 따라 함께 검사한다.

### F05 — 오른쪽 탭의 키보드와 닫기 후 포커스

위치: [PanelTabs.jsx:15](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PanelTabs.jsx:15), [PanelTabs.jsx:26](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PanelTabs.jsx:26).

재현: 폴더와 브라우저 탭 2개 생성 → Ctrl+1 → 첫 tab에 focus → ArrowRight. focus는 그대로 ‘회의’ tab에 남는다. 모든 tab의 기본 tabindex는 0이며 `aria-controls`와 panel `aria-labelledby` 연결이 없다. 새 탭 닫기 버튼을 focus한 뒤 Enter로 닫으면 `document.activeElement`는 BODY다. 마우스 닫기만 확인한 것이 아니다.

기대는 좌우 키로 탭을 찾아 Enter/Space로 활성화하고, 닫으면 인접 탭이나 패널 열기 버튼으로 다음 행동을 이어가는 것이다. [WAI-ARIA 탭 패턴](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)은 이런 키보드 상호작용과 tab/panel 연결을 안내한다. 현재 Ctrl+1과 Ctrl+T, 접기·재열기 중 탭 개수 보존은 정상 확인했다.

권장: roving tabindex와 stable ID 연결, 인접 탭의 합리적인 선택·포커스, 마지막 탭 종료 시 외부 trigger focus를 제공한다. 브라우저 콘텐츠의 실제 WebContents focus와 modal 진입을 함께 고려한다. 방향키 즉시 선택은 무거운 문서 로딩을 유발할 수 있으므로 수동 활성화 방식도 검토한다.

수용 기준: 1/2/10개 탭, 첫/중간/마지막 탭 닫기, 패널 접기, Ctrl+W, 브라우저 내부 키 입력에서도 focus를 잃지 않는다. 실제 화면 읽기 도구 검증은 추가로 필요하다.

## 나머지 개선의 수용 기준

- **F06**: `Error invoking remote method…`와 개인 경로·stack은 상세에 두고 기본 오류에는 원인과 다음 행동을 보인다. 현재도 전체 오류는 Work/Live 토스트의 `title`, Work의 `aria-label`에 남아 있다. 따라서 원인 정보가 완전히 소실되거나 상세가 전혀 없다고 판정하지 않는다. 문제는 짧은 시각 요약과 안정적인 상세·재시도 접근이 부족하다는 점이다. 단순히 문자열을 삭제해 중요한 원인을 숨기지 않는다. move 실패의 전체 오류와 trash 토스트 잘림을 함께 재현하고 키보드로 상세·재시도를 열 수 있는지 확인한다. 연결 담당 조사에도 같은 오류 표현이 있을 수 있으므로 공통 오류 처리 원인으로 묶는다.
- **F07**: `HomePage`와 사이드바의 녹음 중 금지 정책이 일치해야 한다. 현재 홈과 파일 불러오기는 disabled, 사이드바 YouTube만 enabled다. [실제 녹음 중 홈](../test-results/ux-audit-next/flow/recording-home-sidebar-enabled.png). 다운로드 동시 사용을 지원하려는 정책이라면 홈도 가능하게 하고 충돌을 안내할 수 있지만, 이는 추가 설계 결정이다. 이번에는 실제 YouTube 작업을 시작하지 않았으므로 중복 추론·다운로드 오류를 주장하지 않는다.
- **F08**: 체크는 선택된 기본값을 의미한다는 점을 유지하면서 미설치 상태를 알기 쉽게 표현한다. [예시 홈](../test-results/ux-audit-next/flow/home-work.png). disabled 텍스트를 불필요하게 더 어둡게 만들지 말고 기존 테마 토큰과 SUIT를 유지한다. 모델을 자동 설치하거나 새 추천 기능을 추가하자는 제안은 아니다. 미설치/다운로드 중/설치됨/삭제됨에 대한 첫 사용자 과업 검증을 권장한다.

## 정상 확인한 부분과 유지할 구조

- Work/Live 로고 메뉴: ArrowDown으로 항목 이동, Escape 후 로고 trigger focus 복귀.
- Work 일시정지→재개→중단: 중단 즉시 변환 창을 띄우지 않고 원본 저장 후 ‘변환하기’ 버튼으로 전환. 버튼을 누르면 폴더·모델 창이 열리고 Escape로 닫힌다. 실제 마이크·추론 검증은 아니다.
- 페이지 이동한 Work 녹음은 홈 ‘진행 중/돌아가기’에서 접근 가능했다. 녹음이 별도 페이지 이동으로 중단된 것으로 관찰하지 않았다.
- 스크립트 내보내기 메뉴: Home/End/Escape와 trigger focus 복귀 정상. TXT/PDF 파일의 실제 생성·문서 렌더링 품질은 이번 flow 검증 범위에서 제외했다.
- 전체화면 문서의 Tab 순환: 배경 버튼이 DOM에 존재한다는 것만으로 포커스 이탈 버그라고 단정하지 않았다. **실제 Chromium popover에서 25회 Tab 동안 문서 안에 머물렀다.** 다른 브라우저·fallback 구현의 보조기기 동작은 별도 검증 대상이다.
- 설정 메뉴는 일반/녹음/모델/연결/저장/앱 정보로 나뉘고 `aria-current`가 있다. 모델 설치·역할·별명·태그·삭제·진단 코드를 읽었으나 실제 다운로드/모델 제거/성능 측정을 실행하지 않았다.
- Live 준비 화면은 기존 버튼 안에서 모델 준비/취소 상태를 표현하도록 구현돼 있고 실제 녹음 start를 준비 뒤 호출한다. 이번에는 idle 화면과 선택 UI만 직접 확인했고 모델 준비·실제 추론을 검증했다고 쓰지 않았다.
- 공통 Menu는 화면 가장자리 배치, 활성 항목 focus, Escape 복귀를 지원한다. 이미 정상인 메뉴를 모두 새 디자인으로 대체할 이유는 확인하지 못했다.
- Work/Live 별도 보관함, durable journal·folder tombstone·ID 보존, 범위 조회와 summary 경로를 유지하는 것이 적절하다. 이번에 초기화·조회 성능을 다시 측정하지 않았다.

## 공식 자료와 공개 화면을 통한 비교

외부 앱을 직접 설치·로그인해서 실사용 성능을 비교하지 않았다. 공식 문서의 설명과 문서에 포함된 공개 화면을 기준으로 상호작용 원칙을 비교했다. 외형을 복제하거나 LOXT 범위를 Notion 전체 기능으로 넓히자는 뜻은 아니다.

- [Notion 키보드 안내](https://www.notion.com/help/keyboard-shortcuts): 키보드와 Markdown 조작을 하나의 문서에 안내한다. LOXT에서는 기존 단축키 tooltip·문서 안내를 유지하고 실제 탭 동작이 맞는지 확인하는 근거로 사용한다.
- [Obsidian Workspaces](https://obsidian.md/help/Plugins/Workspaces): 열린 파일·탭, 사이드바 폭과 표시 상태를 작업 맥락으로 다룬다. LOXT의 별도 보관함과 오른쪽 탭도 현재 작업으로 돌아올 수 있는 상태·포커스 계약을 명확히 하는 데 참고할 수 있다. Obsidian의 레이아웃 저장 기능을 새로 구현하자는 제안은 아니다.
- [OneDrive 복원 안내·공개 화면](https://support.microsoft.com/en-us/onedrive/restore-your-onedrive-files): 휴지통에서 항목을 선택해 복원하는 흐름과 영구 삭제 후 복원 불가를 구분한다. LOXT F02에서도 임시 폐기와 저장된 자료의 삭제 결과를 구별하고 설명하는 근거다.
- [WAI 탭](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [WAI 모달](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): 키보드 이동·닫기 후 focus와 modal 배경 비활성의 기준. 이번에 모달의 처음 focus가 닫기 버튼이라는 사실만으로 접근성 위반이라고 판정하지 않았다. 입력 중심 모달에 자동 focus를 바꾸는 것은 별도의 작은 UX 선택이다.
- [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md): 현재 지침을 확인하고 포커스·상태·오류·키보드 항목에 적용했다. 일괄 취향 변경보다 실제 흐름에서 확인된 문제를 우선했다.

## 권장 순서와 확인하지 못한 범위

바로 해결할 범위는 F01의 폴더 payload와 F02의 영구 폐기 범위 안내·회복 정책이다. 다음 업데이트에서 F03~F07을 scope·저장 배지·키보드·오류·진행 중 진입점 일관성으로 묶을 수 있다. F08은 가벼운 문구/상태 설계와 첫 사용자 과업 테스트로 충분하다.

다른 담당의 연결·모바일·PDF·설치 조사를 이 보고서와 합칠 때 같은 근본 원인(오류 안내, focus, 저장 상태)은 중복 항목 대신 영향 화면을 추가하는 방식으로 묶는다.

미검증: 물리 마이크·Windows 음소거 루프백·장치 해제/자동 추적, GPU/CPU 추론 정확도와 지연, Live 종료 후 화자 보정, 모델 실제 설치/삭제/benchmark, YouTube 네트워크 다운로드·변환, 실제 손상·장시간 음성, 저장 공간 부족·파일 권한 오류, 전체 OS 설치·업데이트·복구·제거, 실제 NVDA/VoiceOver, iPhone/iPad Safari 물리 기기와 Windows 150/200% 배율. 별도 프로필 패키지 화면의 정상 동작을 이 범위의 성공으로 확대 해석하지 않았다.

구현·버전 상승·패키지 재생성·사이트 배포는 이번 조사에서 진행하지 않았다.
