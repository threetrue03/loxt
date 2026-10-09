# LOXT 2.4.0 — 기기 간 변경분 동기화

## 구현 범위

`remote-latency-audit-2.3.0.md` R01–R08을 반영했다. 기존 Work·Live 보관함, 모델, 녹음·메모·PDF, SUIT와 다크·라이트 테마를 유지했다. 사용자 프로필을 수정하지 않았으며 모든 쓰기 검증은 별도 예시 프로필에서 진행했다.

| 항목 | 적용 내용 |
| --- | --- |
| R01 진단 | 요청 ID, PC 수신·문서 대기·저장 시작·본문 확정·이벤트 예약 시간을 연결한다. 웹 진단에는 요청 왕복·서버 단계, 문서 입력·전송·완료·알림·적용·렌더 프레임 시점을 기록한다. 기기별 단조 시계의 상대 시간이며 PC와 모바일 시계를 서로 빼지 않는다. |
| R02 저장 지연 | 메모 입력은 120ms 묶음, 계속 입력 시 최대 600ms 간격. 완료된 필기 묶음은 40ms, 최대 1초. 네트워크와 디스크 확정 시간은 별도다. |
| R03 그리는 중 | 50ms 간격으로 임시 펜·도형 미리보기를 보낸다. 객체·좌표를 검증하고 600점으로 전송을 줄인다. 저장 데이터에 넣지 않으며 완료·취소·연결 해제·3초 만료 시 제거한다. |
| R04 변경분·디스크 | 메모 블록/순서와 PDF 객체 변경만 전송. 저장 ACK는 revision/updatedAt만 포함. 최대 64개·2MB 변경 이력, 이력이 없으면 전체 스냅샷으로 복구한다. 작은 JSONL 변경 기록을 fsync한 뒤 ACK하고 64회 또는 1MB 기준으로 원본·백업을 체크포인트한다. 32MiB 문서 캐시 예산과 40개 개수 제한을 함께 적용한다. |
| R05 다중 탭 | HTTPS 위 인증 WebSocket 하나에 각 탭의 JSON 요청·이벤트·필기 미리보기를 함께 보낸다. 쿠키·Origin·CSRF·승인 만료·요청 크기·재시도 중복 방지를 유지한다. 오디오 업로드·파일 다운로드는 HTTPS, 구형 클라이언트용 SSE는 호환 목적으로 남긴다. |
| R06 놓친 갱신 | 로딩·저장·편집 중 받은 목표 버전과 갱신 순서를 기억한다. 안전하게 적용 가능한 시점에 다시 조회한다. 열려 있지 않은 캐시 문서는 갱신 목표만 기억해 불필요한 동시 조회를 줄인다. CAS 충돌 시 초안을 유지하고 최신 확인/초안 내보내기로 안내한다. |
| R07 메모 적용 | 일반 내용 갱신은 바뀐 블록만 updateBlock으로 적용한다. 순서·구조 변경은 전체 적용으로 되돌아가며 가능한 선택 범위와 스크롤 위치를 복원한다. 동시 편집을 자동 병합하는 협업 편집기는 아니다. |
| R08 연결 상태 | 지수 재연결(0.5–5초), heartbeat, 요청 제한 시간과 최대 3회 전송 재시도. 같은 requestId로 재시도해 확인되지 않은 쓰기를 중복 실행하지 않는다. 웹 연결 상태/진단 복사와 PC 내 기기 연결의 진단을 추가한다. |

## 데이터 보호·호환

- 기존 전체 문서 저장 API도 유지한다. 최초 실행 시 기존 JSON을 그대로 읽고, 신규 편집부터 변경 기록을 추가한다.
- 저장된 문서는 JSON 스냅샷과 `.journal`을 함께 복구한다. 파일을 수동 복사할 때도 둘을 함께 가져가야 한다. 앱의 폴더 ZIP 내보내기는 합친 최신 필기·메모를 출력한다.
- 디스크 변경을 확인해 캐시가 오래되면 다시 읽는다. 완료된 기록의 checksum/버전이 잘못되면 빈 문서로 바꾸지 않고 오류를 알린다.
- 중단된 마지막 미확정 기록은 읽을 때 확정 기록까지만 복구한다. 다음 저장 전에 손상 꼬리를 별도 사본으로 보존한 뒤 정리한다.
- 체크포인트 도중 중단돼도 이미 스냅샷에 포함된 버전은 재적용하지 않는다. 이력 부족 시 전체 문서를 조회한다.
- 모델·추론 방식·Live 성능·기기 출력 장치 처리는 이번 변경 범위가 아니다.

## 검증

- `npm run test:release`: 98개 통과. 변경분 저장/ACK, 재실행, 녹음에 처음 붙이는 메모의 저장·재실행, 체크포인트, ZIP 최신 필기, 미확정 꼬리 복구, 충돌, 놓친 알림, 인증/Origin/CSRF/중복 쓰기/연결 해제 포함.
- 앱·웹 검증: 별도 보관함, Windows Electron + Edge HTTPS. 펜/점/지우개/실행 취소/한글 텍스트/페이지 검색, 외부 제목 갱신, 메모, 전경 재조회, 오디오 조각 순서·초안 복구, 정상 종료 시 저장.
- 320·390·768px, 다크·라이트 테마에서 PDF 화면 넘침 없음. 실제 iPad·Apple Pencil·현재 사용자의 Wi-Fi는 미측정.
- 2.217초 동안 그리는 중 PC의 확정 객체 수는 변하지 않고 임시 미리보기 1개가 표시됐다. 손을 뗀 뒤 확정 객체가 추가됐다.
- 브라우저 탭 7개에서 쓰기 요청이 완료됐다. HTTP SSE 연결 6개를 인위적으로 점유해도 WebSocket 조회가 해제 전에 완료됐다.
- WebKit 26.6 엔진에서 연결·메모 갱신·세션 유지·녹음 초안 복구와 구형 API/전체화면 대체 경로를 검증했다. 실제 Safari 기기의 검증은 아니다.
- 약 91.29MiB(48쪽) 합성 이미지 PDF는 원본 다운로드 0B로 페이지를 열고 내부 핀치·전체화면·페이지 이동을 검증했다.
- 2.5초 전송 지연 주입은 진단 분리를 확인하는 시뮬레이션이며 사용자 Wi-Fi 측정이 아니다.

### 비교 측정

동일 PC 127.0.0.1 HTTPS, 각각 5회 중앙값. 시작은 입력/펜 놓기, 끝은 상대 화면 DOM 반영이다. 예시 문서·브라우저 자동화이며 Wi-Fi 성능 보증으로 사용하지 않는다. 메모는 550ms 간격의 입력 시나리오이므로 빠른 연속 입력의 120ms 저장 대기와 구분한다.

| 작업 | 2.3.0 | 2.4.0 |
| --- | --- | --- |
| webMemoToPC | 306 ms | 20 ms |
| pcMemoToWeb | 298 ms | 19 ms |
| directMemoRPC | 43 ms | 29 ms |
| webFolderToPC | 21 ms | 14 ms |
| webStrokeEndToPC | 296 ms | 62 ms |

별도 서비스 본문 측정(네트워크/화면 제외): 필기 1만 개에서 한 객체 변경 ACK는 약 3,975,894B → 53B, 변경 조회는 474B. 저장 중앙값 약 414.69ms → 46.22ms. 초기 검증과 주기적 체크포인트는 여전히 전체 문서 크기에 영향을 받는다. 숫자는 해당 테스트 파일/장비 조건의 결과이며 모든 작업의 지연이 없다는 의미가 아니다.

원본 결과는 `test-results/implementation-2.4.0/`의 UI·요청·본문 JSON과 `test-results/regression-2.4.0-native.log`에 있다. 테스트 폴더는 Git에서 제외된다. 이전 샌드박스 실행의 EPERM/EACCES는 파일 rename·로컬 네트워크 권한 문제였고, 네이티브 승인 실행에서 다시 통과했다.

## 변경 파일

- 서버/저장: `electron/document-sync.cjs`, `sync-trace.cjs`, `device-socket.cjs`, `device-server.cjs`, `library.cjs`, `memos.cjs`, `pdfs.cjs`, `web-services.cjs`, `main.cjs`, `preload.cjs`, `folder-export.cjs`, `request-cache.cjs`.
- 웹/렌더러: `src/webTransport.js`, `documentRefresh.js`, `syncDiagnostics.js`, `memoStore.js`, `pdfStore.js`, `MemoEditor.jsx`, `PdfPage.jsx`, `PdfInkObject.jsx`, `WebSyncStatus.jsx`, `DeviceSettings.jsx`, `main.jsx`, `webAdapter.js`, `web.css`, `shared/document-patch.js`.
- 테스트: `scripts/remote-sync.test.cjs`, `remote-sync-ui.mjs`, `remote-sync-body.mjs`, `sync-pdf-ui.mjs`.

## 공식 자료

- [BlockNote 내용 조작 API](https://www.blocknotejs.org/docs/reference/editor/manipulating-content): 블록 변경/구조 변경 API 확인.
- [ws API 문서](https://github.com/websockets/ws/blob/master/doc/ws.md): HTTPS upgrade와 payload/버퍼/연결 종료 확인.

## 배포

버전은 앱·설치본·README·사이트 모두 2.4.0으로 맞춘다. 소개 사이트는 실제 패키징 앱의 별도 예시 보관함을 다시 촬영한다. 임시 필기 미리보기와 동기화 진단도 포함한다. 공개 GitHub 릴리스 업로드와 Cloudflare Production 배포는 로컬 준비와 별개다.

새 설치 파일로 PC 앱을 업데이트한 후 외부 브라우저를 새로고침해야 새 프로토콜이 적용된다. 서버를 끄고 켜면서 주소/포트가 바뀌면 PC 설정의 현재 재접속 주소를 사용한다.
