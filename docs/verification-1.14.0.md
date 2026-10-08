# LOXT 1.14.0 구현·검증 기록

검증일: 2026-10-05. 실제 사용자 보관함·설정·모델 대신 `test-results` 아래 별도 프로필을 사용했다. 외부 Git push, GitHub 릴리스 게시, Cloudflare 배포는 실행하지 않았다.

## 구현 범위

| 범위 | 적용 내용 | 주요 근거 파일 |
| --- | --- | --- |
| 새 탭 | Work·Live 공통 오른쪽 패널, 브라우저·LOXT 폴더 여러 탭, 접기·닫기·전환·복원, 패널 폭 조절 | `src/PanelTabs.jsx`, `electron/browser-tabs.cjs` |
| 브라우저 | 주소·검색·탐색·재시도, 별도 영구 저장 공간, 새 창 요청을 새 탭으로 처리, 메뉴·대화상자에서 네이티브 웹뷰 숨김 | `electron/browser-tabs.cjs`, `src/PanelTabs.jsx` |
| 보관함 1·2·3·4 | 사이드바에서 루트 폴더 이름 입력, 빈 이름 취소, 폴더 빈 공간 생성 메뉴, LOXT 기본 경로와 설정에서 위치 이전 | `src/App.jsx`, `src/LiveWorkspace.jsx`, `src/LibraryView.jsx`, `electron/library-location.cjs` |
| UI 5·6·7·8·9 | 사이드바 토글 이동, 선택 드롭다운 체크 표시, Work 홈 3개 바로가기, 최근 열람 영역 제거, 내 보관함 명칭 | `src/panel.css`, `src/HomePage.jsx`, `src/App.jsx`, `src/LiveWorkspace.jsx` |
| 녹음 10·11·12 | 파형 옆 입력 장치, 시간 왼쪽 화자 1·2·3, Live 독립·녹음 중 메모 | `src/RecordingPage.jsx`, `src/LiveRecorder.jsx`, `src/SpeakerTime.jsx`, `electron/memos.cjs` |
| 관리 13·14·15 | 현재 폴더 제목·내용 검색, 폴더·녹음·메모 선택, 삭제 확인, 이동·휴지통 이동 실행 취소/다시 실행, 탭 단축키 | `src/LibraryView.jsx`, `src/useLibrarySelection.jsx`, `electron/library-actions.cjs` |
| 스크립트 16·17·18·19 | 녹음 중 듣는 커서, Live 중복 표기 제거, 내보내기 꺾쇠, 스크립트·메모 폭 조절 | `src/LiveRecorder.jsx`, `src/NoteDetail.jsx`, `src/MemoEditor.jsx`, `src/ResizableDocuments.jsx` |
| 마무리 20·21·22·23·24·25 | 테마별 녹음 버튼, 뒤로 가기·제목 같은 행, 완료·메모 카드 배지 제거, 토스트 1.5초씩, 홈 생성 메뉴 제거 | `src/panel.css`, `src/NoteCard.jsx`, `src/HomePage.jsx`, `src/MemoPage.jsx` |

Work·Live의 녹음 관리자는 기존 워크스페이스에 유지했다. 폴더 탭은 기존 라이브러리·메모 API를 사용하며 별도 녹음 관리자나 GPU 대기열을 만들지 않는다. 이동과 삭제 이력은 현재 앱 세션의 최대 100개 작업이며 영구 삭제의 복구 이력이 아니다.

## 실행한 검증

| 검증 | 결과 | 증거 |
| --- | --- | --- |
| `npm run test:release` | 72/72 통과 | `test-results/unit-release.log` |
| 소스 앱 패널 검증 | 통과 | `scripts/panel-ui-smoke.mjs` |
| 최종 패키징 앱 패널 검증 | 통과, 렌더러 오류 0개 | `test-results/panel-1.14.0/results.json` |
| 폴더 검색·분리된 탭 상태 | 메인 검색과 오른쪽 검색이 서로 바뀌지 않음 | 패널 검증·`folder-tabs.png` |
| 삭제 확인·실행 취소/다시 실행 | 삭제 확인 취소 시 데이터 유지, 이동 undo/redo 확인 | 패널 검증 |
| 보관함 이전·재시작 | Work·Live 검증 복사, 메모 본문 유지, 새 위치 포인터 재시작 복원 | 패널 검증·단위 테스트 |
| Live 첫 녹음 메모 | 첫 체크포인트 이전 저장과 종료 후 메모 유지 확인 | `scripts/panel.test.cjs` |
| 브라우저 격리 | sandbox/contextIsolation true, nodeIntegration false, preload 없음; file URL 차단 | 패널 검증 |
| 브라우저 저장 | 만료일이 있는 별도 테스트 쿠키를 앱 재시작 후 확인 | 패널 검증; 실제 사이트 로그인 검증은 아님 |
| 작은 앱 창 | 860×640 창, 실제 콘텐츠 848×603에서 전체 가로 넘침 없음 | 패널 검증·`small-window.png` |
| 실제 앱 캡처 | 패키징된 1.14.0에서 23장, 다크·라이트·Live 메모·새 폴더 탭 | `landing/public/assets/screenshots.json` |
| 소개 사이트 | 390·768·1440px 가로 넘침, 이미지 로딩, 테마 전환, FAQ·링크·렌더러 오류 검사 통과 | `test-results/site-release-build.log`, `test-results/site-release-1.14.0.json` |
| Git diff 검사 | 공백 오류 없음; Git의 LF→CRLF 안내는 오류가 아님 | `test-results/git-diff-check.log` |

작은 문서 영역에서는 스크립트와 메모를 위·아래로 배치하고 가로 폭 조절 손잡이를 숨긴다. 충분한 폭에서는 손잡이의 드래그와 방향키 조절을 사용한다. 이번 검사에서 Windows의 모든 배율을 변경해 검증한 것은 아니다.

## 생성 파일과 게시 상태

- 설치 파일: `release/stage5/LOXT-Setup-1.14.0-x64.exe` (168,871,419 bytes).
- SHA-256: `7af26453ab237c92404736814c46798712e18c5359e751f9574606428098eedb`.
- 사이트 ZIP: `landing/loxt-site-v1.14.0.zip`.
- 사이트 원본/배포 폴더: `landing/src/main.jsx` / `landing/dist`.
- 다운로드 기준 버전: `landing/release.mjs`의 `version = '1.14.0'`.
- GitHub 다운로드 주소 HEAD 확인 결과 HTTP 404. 로컬 파일은 완성됐지만 릴리스 설치 파일은 아직 게시되지 않았다. GitHub 릴리스 첨부 후 사이트 Production에 배포해야 한다.

보관함을 이전할 때 기존 기록 폴더와 모델·설정은 삭제하지 않는다. 설정·모델의 기존 사용자 데이터 식별자는 호환성을 위해 유지하며, 보관함 파일만 LOXT 경로로 복사한다. 오류가 나면 원래 파일과 포인터를 보존한다.

## 검증 한계와 ChatGPT 테스트

- 2026-10-06 후속 실제 앱 검증에서 일반 실행한 1.14.0의 오른쪽 브라우저에 직접 로그인했다. 사용자가 Google 이메일 계정으로 로그인 성공을 확인했다. 최초 자동화 실행에서는 Cloudflare 확인 반복이 재현됐고, 일반 실행 비교에서는 로그인에 성공했다. 코드나 브라우저 식별 정보를 바꾸지 않았다. 진행 기록은 `docs/chatgpt-compatibility-1.14.0.md`에 남긴다.

- 이전 비로그인 첫 화면 검사에서 미검증이던 로그인은 위의 일반 실행 비교에서 확인했다. 메시지 전송·응답과 앱 정상 종료 후 동일 프로필의 새 프로세스에서 재로그인 없이 다시 메시지 응답을 받는 것까지 사용자가 직접 확인했다. 전체 로그인 방식이나 장기간 세션 유지까지 보장하는 검사는 아니다.
- 호환성 테스트 도구의 `EPIPE`는 종료된 표준 출력으로 `console.log`를 보내던 오류였다. 테스트 로그를 파일에 기록하도록 바꿨다. 이 수정으로 ChatGPT 로그인 호환성이 검증된 것은 아니다.
- 소개 캡처는 조용한 예시 WAV와 미리 만든 스크립트·화자·Live 이벤트를 사용한다. 실제 GPU 추론, 변환 정확도·속도, 실제 마이크·출력 장치 전환의 성공 증거가 아니다.
- 이번 변경에서는 실제 마이크, 컴퓨터 소리 장치 변경, RTX 2060 추론·화자 모델, 인터넷 다운로드 오류 및 저장 공간 부족을 하드웨어 실험으로 다시 검증하지 않았다. 기존 처리 구조와 관련 단위 검증은 유지했다.
- 영구 쿠키 저장 확인은 각 사이트의 로그인 정책을 보장하지 않는다. 기존 Chrome 프로필과 자동 동기화하지 않는다.
- 설치 패키지는 생성과 패키지 내용 검사를 완료했다. 실제 사용자의 기존 설치를 덮어쓰거나 삭제·복구 설치를 실행하지 않았다.

Electron 공식 `WebContentsView` 문서와 보안 설정을 확인했다: https://www.electronjs.org/docs/latest/api/web-contents-view .
