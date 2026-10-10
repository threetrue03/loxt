# LOXT 2.7.0 — 다음 UI·UX 개선 조사 보고서

조사일: 2026-10-10. 이번 목표는 **조사·검증·보고서 작성까지**다. 앱·사이트·설치 프로그램을 구현하거나 수정하지 않았고 버전도 **2.7.0**으로 유지했다. 아래 와이어프레임과 해결 방법은 승인 전 제안이다.

## 가장 중요한 문제 5개

1. **승인 취소·만료 뒤 실행 중 웹앱이 재승인 경로 없이 계속 재연결한다(C01, P1).** 처음 접속/전체 새로고침 화면에는 새 주소 폼이 있지만, 이미 열린 앱에는 해당 복구 동작이 없다. 인증 실패와 PC 종료·네트워크 단절을 나눠 안내해야 한다.
2. **설치·복구 helper가 스토어에서 선택한 모델 공급자·revision을 보존하지 않는다(I01, P1).** 수 바이트 예시 모델과 네트워크 대역으로 실제 helper를 실행해 확인했다. 파일 교체 중 실패하면 신·구 파일 혼합도 가능하다. 사용자 모델이나 실제 설치 환경을 바꾼 결과는 아니다.
3. **녹음의 ‘버리기’가 작성한 메모까지 별도 확인 없이 영구 삭제한다(F02, P1).** 임시 프로필에서 원본·memo.json과 휴지통 부재를 확인했다. 폐기 기능 자체보다 대상 범위와 복구 불가 고지가 문제다.
4. **사이드바 폴더 메뉴의 이동·휴지통 작업이 실패한다(F01, P1).** 폴더 경로를 기록 ID로 보내는 계약 오류다. 백엔드가 요청을 거부해 예시 폴더는 남았다. 메인 보관함 카드 메뉴와 결과가 다르다.
5. **모바일 PDF·그리기 컨트롤이 화면 가장자리·회전에서 잘린다(M02 P1, M01 P2).** 390px에서 텍스트 입력창이 오른쪽으로 78px 넘었고, 가로 화면에서 연 필기 옵션은 세로 회전 후 화면 밖에 남았다. 실제 Safari가 아닌 승인된 웹앱 Chromium touch 재현이다.

별도로 주소 변경 시 예전 origin의 미저장 초안을 새 주소에서 읽지 못하고(C03), 서버가 멈춘 주소로 cold launch하면 복구 UI 자체를 받을 수 없다(C04). 저장소가 삭제된 것과 새 주소에서 접근 불가능한 것을 구분해야 한다. **P0 사고를 확인하지 않았다.**

## 현재 상태와 실제 구현

- package.json·패키지 앱·설치 파일 버전: 2.7.0. 조사 대상은 release/stage5/win-unpacked/LOXT.exe와 기존 2.7.0 x64 installer다. 파일 SHA-256과 상세는 설치 분야 근거에 기록했다.
- Work와 Live는 별도 보관함이며, 녹음·스크립트·메모·PDF·그리기·폴더를 공통 탐색 UI에서 다룬다. 서버의 원본/문서/인덱스·journal과 브라우저의 draft 저장소는 역할이 다르다.
- Work는 녹음/불러오기→원본 저장→변환 선택→대기열/결과→재생·메모·내보내기 흐름이다. Live 준비·캡처·추론과 GPU 조정은 코드에서 확인했지만 이번에 실제 모델 추론을 성공시켰다는 뜻은 아니다.
- PC의 개인 HTTPS 서버는 승인된 기기에 보관함 서비스를 제공한다. HTTP 초기 인증서 안내, 최초 pairing URL, 재접속 URL이 별개다. 쿠키·기기 기한·CSRF·Host·Origin 검사를 유지해야 한다.
- 브라우저 메모/PDF 임시 작업은 localStorage, 녹음 조각은 IndexedDB에 보관한다. hostId를 키에 넣어도 브라우저 origin 분리는 없어지지 않는다. 본문 확인 요청이 실패하면 cold start에서 초안 UI도 시작되지 않는 경로가 있다.
- SUIT, LOXT 로고, 기존 차콜·다크/라이트 토큰과 작업 중심 UI를 유지하는 방향이다. 새 브랜드 색상·모델·협업/계정 시스템·Notion 전체 기능을 추가하자는 제안은 없다.

## 검증 방법·한계

| 분야 | 이번에 수행한 검증 | 수행하지 않은 검증 |
| --- | --- | --- |
| 모바일·태블릿 | 패키지 PC 서버에 실제 승인한 Chromium touch 웹앱, 다크/라이트 168 화면 조합, 화면 회전·터치·PDF 확대·검색·메모 목차·합성 녹음 조작 | 물리 iPad/iPhone Safari·Pencil·소프트 키보드·standalone PWA·실제 Wi-Fi |
| 전체 흐름 | 별도 패키지 프로필, 기본12+추가4 관찰 시나리오, 실제 저장/폐기·메뉴·키보드 포커스 검사 | 실제 마이크·루프백·GPU 추론·YouTube 다운로드·장시간 음성 |
| 연결 | 11개 주 관찰 사례+10개 별도 보완 사례, revoke/expire/CSRF/server off/on/포트 이동/초안 보존과 저장 확인 | 실제 LAN IP 이동·인증서 신뢰 설치·Safari 홈 화면 저장소 유지 |
| 설치 | 현 installer 서명/크기/버전, 패키지 helper 동일성, 작은 격리 모델·오류 대역 6/6, 기존 순수 검사1/1 | Windows VM/Sandbox 미확보로 실제 설치·업데이트·복구·제거·DPI GUI 미실행 |
| 기존 연결·문서 테스트 | 관련 Node 테스트15/15 통과, 인증·CSRF·중복 요청·journal·충돌·내보내기 검사 | 전체 테스트 모두 합격 또는 모든 앱 기능 검증이라는 의미는 아님 |

화면 조합 개수는 UI 조사 수이고 합격 기능 수가 아니다. 합성 녹음·예시 스크립트·작은 가짜 모델은 UI/API/파일 처리 근거이며 실제 음성 정확도·GPU 성능 증거로 사용하지 않았다. 조사 하네스의 selector/타이밍/이미 닫힌 프로세스 핸들 오류는 앱 버그에서 제외했다. 최초 로컬 TCP EACCES 테스트 두 개는 제한 환경 실패로 분리하고 허용된 예시 환경에서 다시 실행해 15/15를 확인했다.

앱·설치·사이트 관련 **306개 파일의 SHA-256이 조사 시작과 동일**, 변경0, 버전2.7.0 유지: [소스 보존 검증](../test-results/ux-audit-next/source-verification.json). 예시 데이터는 test-results/ux-audit-next의 별도 프로필에만 만들었다. 사용자 데이터 초기화·모델 제거·실제 기기 해제는 수행하지 않았다.

## 전체 발견 사항 — 원인별 단일 목록

검증 상태의 ‘실제 재현’은 해당 범위를 따른다. helper 재현을 실제 NSIS GUI 재현으로, Chromium touch를 실제 Safari 재현으로 바꾸어 읽으면 안 된다. 동일 원인의 반복 화면은 한 ID 안에 묶었다. C01은 취소·만료·CSRF 불일치, F01은 Work/Live 폴더 진입점, I01은 공급자/revision 보존·부분 교체를 각각 묶은 항목이다. F04의 제목 상태와 C02의 연결/저장 상태는 영향을 함께 개선하되 저장 계약이 달라 별도 검증한다.

| ID | 분야 | 우선순위 | 문제 | 근거 | 사용자 영향 | 개선 방향 | 예상 작업 규모 | 검증 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | 승인·인증 복구 | P1 | 실행 중 앱은 승인 취소/만료와 오래된 CSRF를 모두 반복 연결로 처리하며 재승인 UI가 없음 | webTransport.js:18, web.jsx:24·76, 실제 401/200 사례 | 기다려도 회복하지 않는 승인 상태, 웹앱 초기화로 해결하려다 초안 위험 | session 재확인·원인별 상태·같은 앱 안 재승인 sheet, PC 명시적 승인 유지 | 중~대 | 실제 재현 |
| C02 | 연결·저장 상태 | P1 | 단절한 RPC는 약25.5초 후 실패하고 연결 복귀 후 실패한 메모 저장은 자동 재개되지 않음 | webTransport.js:20, webAdapter.js:14, memoStore.js:89, 25,523ms | 멈춘 것으로 보이고 ‘PC 연결됨’ 상태에서 저장 실패/초안 남음 | 연결 상태와 저장 상태 구분, 안전한 대기·명시적 재시도·revision 확인 후 재전송 | 중 | 실제 재현 |
| C03 | 주소 변경·초안 | P1 | 주소/포트 변경 때 origin별 저장소가 분리되어 이전 메모 초안을 새 주소에서 읽을 수 없음 | memoStore.js:11, pdfStore.js:7·10, webRecordingJournal.js:17, 실제 포트 변경 | 저장 대기 작업이 새 연결에서 사라진 것처럼 보임 | 안정된 접속 origin 우선, 기존 창의 초안 내보내기와 별도 가져오기·충돌 검토 | 대 | 메모 실제 재현; PDF/녹음은 코드상 동일 제한 |
| C04 | 웹앱 재시작 | P1 | PC 서버 중지/이전 주소 종료 상태에서 cold launch하면 앱 복구 화면 자체를 받을 수 없음 | web.html:1, web.jsx:21·24, SW 등록 부재, ERR_CONNECTION_REFUSED | 설치한 웹앱이 먹통으로 느껴지고 주소 입력·로컬 초안 접근 불가 | 최소 offline shell·연결 입력·로컬 초안 접근을 조사, 문서/개인 데이터 자동 cache는 금지 | 대 | Chromium cold navigation 실제 재현; iOS standalone 미검증 |
| C05 | 상태 안내·접근성 | P2 | 단절 banner가 CSS pseudo-element로 상단 로고를 가리고 행동/알림 semantics가 없음 | web.css:2, WebSyncStatus.jsx:6, 실제 390px 캡처 | 원인·다음 행동 불명확, 상단 조작 가림, 스크린리더 안내 부재 | 흐름 안 DOM status, 상세 복구 버튼, 상단 레이아웃 공간 확보 | 소~중 | 시각 실제 재현; semantics 코드상 확인 |
| C06 | 최초 승인 UX | P2 | PC에서 거절해도 요청 만료라고 표시 | device-server.cjs:43·48, 실제 deny 결과 | 거절과 만료 혼동, QR 반복 생성 | 최소 시간의 거절 상태 유지·안내, 새 요청은 명시적 사용자 동작 | 소~중 | 실제 재현 |
| C07 | 만료 기기 관리 | P2 | 만료 기기도 20개 제한에 계산되고 목록에 만료 상태/기한을 표시하지 않음 | device-server.cjs:24·40·43 | 사용하지 못하는 기기로 승인 슬롯이 찰 가능성 | 만료 표시·사용자 해제, 유효 기기 제한과 보존 정책 분리 | 소~중 | 코드상 확인; 20기기 실제 UI 미검증 |
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
| F01 | 폴더·버그 | P1 | 사이드바 폴더 메뉴의 move/trash가 폴더 경로를 기록 ID로 전달 | `App.jsx:337`, `LiveWorkspace.jsx:137`, `library-actions.cjs:25` 및 오류 캡처 | 핵심 정리 동작 실패, 메인 카드 메뉴와 결과 불일치 | target 종류별 ID/폴더 payload를 공통 생성하고 동일 확인 UI 사용 | 소~중 | 실제 재현 |
| F02 | 녹음·회복 UX | P1 | ‘버리기’ 1회 클릭으로 원본·첨부 메모를 영구 폐기 | `RecordingPage.jsx:232`, `:261`, `library.cjs:373` 및 파일 부재 검사 | 녹음만 버린다고 이해하면 작성한 메모까지 복구 불가 | 폐기 범위 확인; 저장된 기록은 휴지통 이동 또는 메모 따로 보관 선택 검토 | 중 | 실제 재현; 의도된 폐기 방식의 UX 위험 |
| F03 | 경로·버그 | P2 | `library` 폴더와 시스템 전체 기록 scope 충돌 | `library.cjs:25`, `LibraryView.jsx:35`, `shared/library-range.cjs:35` | 폴더에 진입한 것처럼 보이지만 전체 기록 표시; 검색·정리 범위 오해 | 시스템 scope와 사용자 경로 분리, 기존 이름 보존·호환 | 중 | 실제 재현 |
| F04 | 저장 상태 | P2 | 제목 dirty 상태와 ‘저장됨’ 표시 불일치 | `useDocumentTitle.js:8`, `DocumentHeader.jsx:3`, `NoteDetail.jsx:74` | 저장 완료를 잘못 확신하고 닫거나 기기 전환 | 제목 저장 중/실패/완료와 본문 저장 상태 통합 | 중 | 실제 재현 |
| F05 | 탭·접근성 | P2 | Arrow 이동/roving tabindex/ARIA 연결·닫기 후 포커스 부재 | `PanelTabs.jsx:15`, `:26`; 실제 focus 결과 | 탭이 많을수록 Tab 이동 증가, 현재 작업으로 복귀 어려움 | 탭 패턴 적용, 닫기 후 인접 탭/패널 열기 버튼으로 포커스 | 중 | 실제 재현 + 코드상 확인 |
| F06 | 오류 회복·문구 | P2 | Electron IPC 오류 prefix가 토스트 앞을 차지하고 실제 원인 잘림 | `App.jsx:344`, `LiveWorkspace.jsx:139`; 삭제 오류 캡처 | 무엇이 실패했는지, 어떻게 다시 시도할지 이해하기 어려움 | cleanError 공통 적용, 작업별 짧은 원인·상세·재시도 제공 | 소~중 | 실제 재현 |
| F07 | 녹음 중 상태 일관성 | P2 | Work 녹음 중 홈 YouTube는 비활성, 사이드바 YouTube는 활성 | `App.jsx:317` 대비 `HomePage.jsx:17`; isDisabled 결과 | 동일 기능이 위치에 따라 가능/불가로 보임 | 진행 중 작업 정책을 공유하고 모든 진입점 일치 | 소 | 실제 재현; 동시 다운로드 실행은 미검증 |
| F08 | 첫 사용·디자인 | P3 | 미설치 기본 모델에 선택 체크가 남아 사용 가능한 모델로 오해 가능 | `HomeModels.jsx:18`, `:19`; 미설치 예시 홈 화면 | 역할·기본 선택·설치 상태 구분에 학습 필요 | ‘기본 선택’과 ‘설치 필요’ 의미를 간결하게 구분, 스토어 링크 유지 | 소 | 디자인 제안; 미설치 UI는 실제 확인 |
| M01 | PDF·그리기 / 편집 | P2 | 가장자리 텍스트 편집 UI에 가용 공간 제한이 없음 | PdfPage.jsx:168–169, pdf.css:1, 390px에서 right=468px | 입력 내용 잘림, 완료·취소 세로 줄바꿈 | 실제 주석 좌표와 편집 UI 위치를 분리하고 보이는 페이지/viewport 안으로 제한 | 중 | 실제 재현 |
| M02 | PDF / 회전·팝오버 | P1 | 필기 옵션 위치가 화면 변화 후 갱신되지 않음 | PdfProperties.jsx:7, 1180→820/932→430 재현 | 도구 설정이 화면 밖에 남아 찾기 어려움 | 앵커·창·visual viewport 변화에 재배치, cleanup 유지 | 소~중 | 실제 재현 |
| M03 | 스크립트 / 반응형 | P2 | ‘녹음 지우기’가 좁은 재생바 열에서 세로로 줄바꿈됨 | NoteDetail.jsx:83, styles.css:181, 390px 양 테마 캡처 | 기능 이름 가독성·주변 정렬 저하 | 오디오 동작 영역을 별도 행으로 배치하거나 명시적 grid-column 지정 | 소 | 실제 재현 |
| M04 | 터치 / 일관성 | P2 | 일부 작은 버튼이 기존 44px 터치 목표를 충족하지 않음 | web.css:4–5, styles.css:35, pdf.css:1·4, memo.css:3, JSON | 작은 화살표·뒤로·관리 버튼 오조작 가능 | 컴포넌트별 coarse hit box 보장, 현재 시각 크기·간격 유지 검토 | 소~중 | 크기 실제 측정; 오조작 빈도 미측정 |
| M05 | 문서 / 공간 배분 | P2 | 낮은 가로 화면에서 상단과 도구가 본문 대부분을 점유 | document.css:1, memo.css:5·7, PDF 568×320 본문 32px | 한 번에 읽고 필기할 수 있는 공간 감소 | 낮은 높이에서 메타·부수 기능을 축약하고 도구 접근은 유지 | 중 | 실제 측정 + 디자인 제안 |

## 우선 수정과 구현 순서 제안

### 바로 해결할 항목

- C01·C02: 인증/연결/저장 상태와 복구 동작을 분리. 열린 앱의 문서·초안을 유지하고 PC의 명시적 승인으로만 회복한다.
- I01·I02: 모델 설치 계약을 단일 계획·pinned manifest·전체 staging commit으로 통일. 기존 정상 모델 재사용을 네트워크 최신 metadata와 분리한다.
- F01·F02: 폴더/기록 대상 payload를 통일하고 영구 폐기 범위를 확인·취소할 수 있게 한다.
- M01·M02: 화면 끝 텍스트 입력과 회전된 옵션 패널의 좌표·overflow를 먼저 수정한다.

### 다음 업데이트에서 묶을 항목

1. **저장·복구 계약:** C01/C02/F02/F04, 원본/메모/필기 보존과 충돌사본, 상태 UI. 기존 revision/journal/requestId 보호를 유지한다.
2. **탐색·조작 계약:** F01/F03/F05/F06/F07와 모바일 touch/focus/문서 헤더. 같은 기능의 진입점마다 정책·문구·결과가 일치해야 한다.
3. **모바일 적응형 UI:** M 항목의 viewport·safe area·팝오버·작은 가로 창·터치 표적. PC 메뉴를 일괄 교체하기보다 작은 화면에 필요한 패널만 조정한다.
4. **설치 UX:** I03–I10의 공간·취소·진행·원인·업데이트 범위·언어. Windows VM에서 현상부터 확인하고 DPI 의심을 확정 버그처럼 고치지 않는다.
5. **연결 안내:** C05–C07의 상태 banner·거절/만료·기기 기한, 최초 연결/재접속 주소의 의미. 권한 검사를 줄이지 않는다.

### 장기 검토

C03·C04의 안정된 origin·접속 이름/포트·인증서와 offline shell은 별도 설계가 필요하다. 새 주소에서 이전 origin 저장소를 직접 읽을 수 없으므로 키 이름만 바꾸거나 새 QR만 제공해서 해결됐다고 판단할 수 없다. 브라우저 초안 export/import, 로컬 사본 접근·shared device·기기 해제 정책·캐시 버전 관리까지 결정해야 한다. 실제 모바일 입력/Pencil/대용량 PDF 성능과 정식 설치 서명은 별도 환경에서 검증한다.

## 제안 와이어프레임 — 구현하지 않음

### 열린 웹앱의 승인 복구

```text
[LOXT Work ▾]                 [PC 연결 · 저장 대기 1개]
─────────────────────────────────────────────────────
이 기기의 승인이 필요해요. 작성한 내용은 이 기기에 보관했어요.
[다시 승인 요청] [새 연결 주소 입력] [초안 받기]
─────────────────────────────────────────────────────
현재 문서와 메모 유지 · 서버 작업만 승인 전 잠금

새 연결 주소 입력                                 ×
[ PC에서 복사한 연결 주소                          ]
PC의 설정 → 내 기기 연결 → 연결 주소 복사
[취소]                              [연결 요청]
→ PC 승인 대기 → revision 확인 → 안전 저장 또는 충돌 사본
```

주소 이동 전에 ‘새 주소에서는 현재 주소의 초안을 직접 읽을 수 없음’을 설명하고 사본 보존을 제공한다. 연결 실패만으로 ‘승인 취소’나 ‘PC 꺼짐’을 확정하지 않는다. soft keyboard·회전·safe area에서도 주요 동작을 누를 수 있어야 한다.

### 모바일 PDF·그리기

```text
[‹] [파일 이름…]                   [저장 상태] [⋯]
[페이지] [선택] [펜] [지우개] [텍스트] [도구…]
─────────────────────────────────────────────────
PDF / 그리기 — 두 손가락 확대는 문서 내부만 적용
텍스트 입력 UI는 화면 가장자리 안으로 이동
─────────────────────────────────────────────────
[현재/전체 페이지]           [맞춤] [−] [배율] [+]

필기 옵션 sheet — 작은 화면·회전에서 화면 안 유지
[색상] [두께] …                           [닫기]
```

기존 PC toolbar와 SUIT/테마 토큰은 유지한다. 화면 너비에 맞춰 덜 쓰는 도구를 묶는 제안이며 새 도구를 추가하자는 뜻이 아니다. 선택 중 문서를 불필요하게 다시 그리거나 입력 포커스를 잃지 않도록 검증한다.

### 설치·모델 준비

```text
LOXT 설치                       앱 파일 / 선택 모델 / 준비
앱 위치 …                     모델·환경 위치 …
선택 모델 [✓ 표준]             추가 필요 공간: 측정값 또는 범위
기존 모델: 설치된 공급자·버전 유지

모델 다운로드      [실제 진행률 ━━━━━      ] 42%
환경 확인           [진행 중…]  — 측정하지 않은 % 금지
[상세 로그]         [준비 중단] / 실패 후 [다시 시도] [나중에 준비]
앱 설치 결과와 모델 준비 결과를 따로 안내
```

‘나중에 준비’와 ‘앱 설치 취소’는 같은 결과가 아니다. 삭제 시 앱 파일/모델·실행 환경/사용자 문서의 실제 제거 범위를 설명하고 기존 사용자 자료를 보존한다.

## 상세 근거·재현·완료 조건

아래 상세에는 정확한 위치, 실제/기대 동작, 화면·로그, 권장 방향과 부작용, 항목별 수용 기준이 있다. 이를 실제 구현 지시로 사용하려면 먼저 범위와 정책을 선택해야 한다.

## 교차 검토 결과

| 검토 대상 | 교차 검토 | 반영 결과 |
| --- | --- | --- |
| 설치 I01–I10 | 전체 흐름 담당이 실제 helper·NSIS 소스와 예시 로그/JSON·패키지 동일성을 대조 | 공급자/revision·부분 교체·오프라인 문제는 helper 재현에 한정. 실제 설치 GUI·DPI·SmartScreen 성공/실패는 미검증 유지 |
| 흐름 F01–F08 | 설치 담당이 현재 소스·캡처·두 실행 JSON과 공식 탭 기준을 대조 | Work 이동/Work·Live 삭제만 직접 재현으로 표시. Live 이동은 코드상. 버리기는 의도된 폐기의 UX 위험. F06 전체 오류는 title/Work aria-label에 남음을 보완. F08은 P3 제안 유지 |
| 연결 C01–C07 | 모바일 담당이 origin·cold start·복구 제안의 모바일 조건을 검토 | 키보드/visualViewport/safe area·회전 접근성, PWA 캐시·버전 불일치·초안 노출 정책을 수용 조건에 추가 |
| 모바일 M01–M05 | 통합 담당이 최종 측정 JSON·정적 overflow와 조작 증거를 대조 | scroll 밖 요소를 버그로 집계하지 않음. M01 실제 재현은 그리기/PDF는 코드상. M02만 P1. 최종 pinch 340→680/scale1, 회전 안정화 대기 조건 확인 |

중복 상태 안내는 C01/C02/C05로, 원인별 다른 제목 저장·설치 진행 상태는 F04/I05로 구분했다. M05는 측정된 공간 부족에 대한 디자인 제안이며, M04는 버튼 크기 측정으로 오조작률이나 모든 접근성 표준 위반을 주장하지 않는다. 검증하지 않은 효과·성능 개선율을 작성하지 않았다.

---

## 기기 승인·연결 상세

### 중요한 항목 상세

#### C01 — 실행 중 웹앱의 재승인 경로

- 위치: [webTransport.js:18](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webTransport.js:18), [web.jsx:24](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/web.jsx:24), [web.jsx:76](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/web.jsx:76), [device-socket.cjs:26](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-socket.cjs:26).
- 재현: private profile 승인 → 웹에서 메모 편집 → PC에서 기기 해제 → session 401 확인 → 열린 앱의 연결 상태 확인 → 새 pairing URL의 hash 적용.
- 기대: 승인이 더 필요하다는 설명과 새 연결 주소 입력, PC 승인 요청, 기존 문서/초안 유지. 실제: 계속 reconnecting, 새 hash의 pending 0, 주소 폼 0. **처음 접속/전체 reload 화면에는 주소 폼이 이미 있다. 모든 화면에 폼이 없다는 뜻이 아니다.**
- [승인 취소 화면](../test-results/ux-audit-next/connection/04-approval-revoked.png), [만료 후 reload 폼](../test-results/ux-audit-next/connection/07-expired-reload-form.png), [CSRF 불일치](../test-results/ux-audit-next/connection-extra/10-stale-csrf.png).
- 권장: 실패 시 session을 재확인해 401과 유효 session/새 CSRF, reachability 실패를 나눈다. 1008은 일반 정책 위반 코드이므로 승인 취소라고 단정하지 않는다. [MDN CloseEvent](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code). fetch 실패만으로 네트워크/서버 종료/인증서 문제를 확정할 수 없으므로 사용자 문구는 가능한 확인 행동을 제시한다. navigator.onLine 역시 LAN 서버 도달성을 보장하지 않는다. [MDN onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).
- 부작용: 인증 오류에 새 approve를 무조건 요구하면 유효한 cookie도 불필요하게 재승인시킨다. 재연결 세대/CSRF 갱신 시 오래된 RPC 응답을 배제하고 중복 저장을 방지해야 한다. 기기 승인·Host·Origin·CSRF 검사를 유지한다.
- 완료 조건: revoke/expire 시 `재승인 필요`와 주소 입력을 같은 열린 앱에서 제공; valid session/CSRF 갱신은 승인 없이 회복; 이전 문서·메모 초안 유지; PC deny는 승인으로 처리하지 않음; 재연결 후 revision이 달라지면 덮어쓰지 않고 충돌 사본을 제공.

#### C02 — 연결됨과 저장 완료는 별개

- 위치: [webTransport.js:20](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webTransport.js:20), [webAdapter.js:14](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webAdapter.js:14), [memoStore.js:89](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:89), [documentRefresh.js:8](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/documentRefresh.js:8).
- 재현: 네트워크 단절 중 NETWORK-DRAFT 입력, RPC의 8초 availability wait×3 + 0.5/1초 retry를 기다림. 연결 복귀 후 status는 online, 메모 저장 실패와 local draft는 남음. 다시 시도하면 실제 PC memo에 NETWORK-DRAFT 저장.
- [복귀했지만 저장 실패](../test-results/ux-audit-next/connection/03-network-return-save-failed.png). 25,523ms는 단절 상태 실패 판정 시간 1회 측정이며 정상 Wi-Fi 동기화 지연이나 평균 처리속도가 아니다.
- 권장: `PC 연결됨 · 저장 대기 1개`처럼 분리하고 서버 응답을 기다리는 상태를 즉시 보여준다. 연결 회복 이벤트에서 변경되지 않은 revision은 저장 재시도, 수정된 revision은 충돌 검토. 인증 무효에는 일반 retry를 무한 적용하지 않는다.
- 부작용: 안전하게 실패시키기 위해 원래 기다리는 요청을 전부 취소하면 실제 서버에서 commit된 작업을 중복 전송할 수 있다. 기존 requestId 중복 방지와 완료 조회가 필요하다.
- 완료 조건: 단절/승인 필요/저장 충돌/저장 완료가 화면에서 구분되고 재연결 후 safe save 성공 또는 명시적 충돌 선택이 나타남. ‘연결됨’만으로 ‘모두 저장됨’을 표시하지 않음.

#### C03·C04 — 주소 변경과 cold start의 한계

메모/PDF는 localStorage, 미업로드 녹음은 IndexedDB에 저장한다. 키에 hostId를 넣어도 저장소 자체는 scheme/host/port의 origin별로 분리된다. [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage). 실제 포트 변경에서는 `https://127.0.0.1:49588`에 ADDRESS-DRAFT가 남았지만 `:59595`에는 같은 hostId의 초안이 없었다. cookie는 같은 hostname·다른 port에서 유효하여 새 포트의 앱은 승인 없이 열렸다. 따라서 **인증이 회복된 것과 초안이 옮겨진 것은 다르다.** IP hostname이 바뀌면 cookie도 별도여서 또 다른 결과가 가능하며 이번에 실제 LAN IP를 바꾸지는 않았다.

- 위치: [memoStore.js:11](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:11), [memoStore.js:51](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:51), [pdfStore.js:15](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/pdfStore.js:15), [webRecordingJournal.js:17](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webRecordingJournal.js:17), [WebRecordingRecovery.jsx:12](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/WebRecordingRecovery.jsx:12), [web.html:1](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/web.html:1).
- 재현: private port 이동 후 기존 탭에 입력/backup → 새 주소에서 같은 메모 열기 → 이전 draft 부재 확인 → 종료된 예전 주소로 전체 navigation → browser ERR_CONNECTION_REFUSED.
- [새 주소에서는 저장된 기준 문장만 표시](../test-results/ux-audit-next/connection-extra/14-new-origin-no-draft.png), [예전 주소 실패](../test-results/ux-audit-next/connection-extra/13-old-address-browser-error.png).
- 기대: 기존 앱 삭제/데이터 초기화 없이 주소를 변경하고 초안의 위치·내보내기·복구를 안내. 실제: 저장소는 보존되지만 새 origin에서 접근 불가, 예전 서버가 없으면 앱 UI를 실행하지 못함.
- 권장: 단기에는 열린 기존 origin에서 이동 전 모든 미저장 작업 사본을 내보내고 새 주소에서 사용자 확인 후 가져오는 절차를 제공한다. 장기에는 안정된 접속 이름/포트와 인증서·LAN 접근성 설계를 검토한다. offline shell은 최소 연결/복구 코드와 필요 local assets만 캐시하도록 별도 보안/업데이트 검토가 필요하다. 개인 문서·모델·인증 토큰을 Service Worker에 자동 캐시하지 않는다.
- 부작용: 새 origin의 JS가 기존 origin 저장소를 직접 읽는 것은 불가능하다. 새 QR, hostId key 변경, localStorage key 이름만 바꾸는 것으로 해결했다고 주장하면 안 된다. offline cache는 revoke 이후 로컬 사본 정책, shared device의 잠금/삭제, 앱 버전 호환·캐시 갱신이 필요하다. PC 재승인이 로컬 사본 접근 범위를 무조건 확대해서도 안 된다.
- 완료 조건: 같은 주소 재승인 후 초안 복구, 다른 주소 이동 전 export/import, 멈춘 서버에 홈 화면 cold launch 시 최소 복구 shell 제공 여부를 실제 Safari/PWA에서 검증. revision 충돌 시 서버판과 로컬판 둘 다 남기고 선택 가능. server asset이 없는데 온라인 앱 전체가 열릴 것이라고 안내하지 않음.

#### C05·C06·C07 — 안내와 상태 구분

C05: 390px 단절 화면의 fixed pseudo banner가 LOXT 로고 영역을 가리고 Work 표시만 남는다. DOM `role=status`/`aria-live`와 위치 공간을 확보하고 상세에서 ‘다시 확인’, ‘새 연결 주소’, ‘초안 받기’를 제시하는 방향이다. 진단의 ‘새로 확인’은 현재 snapshot을 다시 읽는 동작이며 재승인이나 새로운 연결 시도를 직접 하는 버튼은 아니다. 완료 조건은 긴 한국어 문구·safe area·키보드 상태에서도 제목/탐색을 가리지 않고 screen reader가 새 상태를 한 번 안내하는 것이다.

C06: [device-server.cjs:43](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-server.cjs:43)에서 deny는 pending을 삭제한다. 다음 polling은 [:48](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-server.cjs:48)의 absent/expired 공통 오류를 받아 만료라고 표시한다. [거절 캡처](../test-results/ux-audit-next/connection-extra/09-pair-denied.png). 일정 TTL의 거절 결과를 유지하되 자동 새 요청·자동 승인은 하지 않는다. 완료 조건: 거절/만료/다른 기기 사용을 정확히 구분하고 사용자 동작으로만 새 승인 요청한다.

C07: session은 expires를 검사하지만 snapshot 목록에는 expires가 없고 approve 제한은 전체 devices.length다. 만료 레코드 20개인 private server에 새 approve를 넣는 추가 UI 실험은 하지 않았다. 만료 기기를 삭제해 인증 기록이 사라지는 정책을 임의로 적용하기보다 ‘만료됨’ 표시와 사용자 해제, 제한의 대상 정의를 먼저 결정한다. 완료 조건: 20개 유효/20개 만료/취소 섞인 예시에서 안내·정리·추가 승인 경로를 검증한다.

### 권장 상태와 와이어프레임 — 제안이며 구현하지 않음

연결 상태는 `확인 중 / 연결됨 / 일시 연결 끊김 / 재승인 필요 / PC 확인 필요`로, 문서 상태는 `저장됨 / 이 기기에 임시 저장 / 전송 중 / 충돌 검토`로 구분한다. 네트워크/서버/인증서 장애를 응답 없이 정확히 식별하지 못하면 ‘PC에 도달하지 못했어요’로 표현하고 확인 순서를 제시한다.

```text
[LOXT Work ▾]                            [PC 연결 · 저장 대기 1개]
──────────────────────────────────────────────────────────────
이 기기의 승인이 필요해요. 작성 중인 내용은 이 기기에 보관했어요.
[다시 승인 요청] [새 연결 주소 입력] [초안 받기]
──────────────────────────────────────────────────────────────
기존 문서/메모 유지 · 서버 작업은 승인 완료 전 잠금

새 연결 주소 입력                  ×
[ PC에서 복사한 연결 주소                         ]
PC의 설정 → 내 기기 연결 → 연결 주소 복사
[취소]                            [연결 요청]
→ PC에서 승인 대기 → 승인 후 revision 확인 → 안전 저장/충돌 사본
```

주소를 바꿔 다른 origin으로 이동하기 전:

```text
저장 대기 중인 작업 2개가 있어요.
새 주소에서는 이 주소에 남은 초안을 바로 읽을 수 없어요.
[현재 주소에서 다시 시도] [초안 사본 받기]
사본 저장 확인 후 [새 주소로 이동]
```

상태 icon을 눌러 동기화/오류/다음 행동을 보여주고 인증 오류와 네트워크 재시도를 분리하는 근거는 [Obsidian Sync 상태·메시지 공식 설명](https://obsidian.md/help/sync/messages)이다. 충돌 사본을 남겨 두 버전을 비교할 수 있게 하는 방향은 [Obsidian 충돌 처리](https://obsidian.md/help/sync/troubleshoot)를 참고했다. LOXT 블록 JSON과 PDF 필기는 Markdown 자동 merge와 동일하지 않으므로 그대로 이식하지 않는다. 새 색상/새 글꼴/계정 시스템을 추가하자는 제안이 아니다.

### 추가 실제 기기 검증

이번 Safari 기기 검증 응답은 아직 없으므로 실기기 성공을 주장하지 않는다. 승인한 예시 보관함에서 Safari 탭과 홈 화면 웹앱 각각: 편집→PC revoke→초안 backup→재승인→서버 수정과 충돌 확인; Wi-Fi off/on; PC 서버 off/on; 인증서 갱신; 다른 IP/포트 이동; 앱 강제 종료 후 offline cold launch; Safari/PWA 저장소/세션 차이와 브라우저 storage eviction을 검증해야 한다. 비밀번호/인증 코드 입력 자동화, 실제 승인 bypass, 실제 모델/GPU 녹음 추론은 수행하지 않았다.

모바일 분야 교차 검토를 반영한 완료 조건: 키보드가 열린 visualViewport·safe area·화면 회전에서도 주소 입력·연결 요청·초안 받기와 시트 닫기에 접근할 수 있어야 한다. offline shell은 저장 공간 정리, 서버/클라이언트 버전 불일치, 기기 해제 후 로컬 초안 노출 정책까지 검증한다. PDF·메모에서 모바일 풋바가 숨겨지는 경우 상태칩의 bottom 78px 예약을 일률 적용하지 않고 문서를 가리지 않는 위치를 선택한다.

---

## 설치 런처 상세

### 중요한 항목 상세

#### I01 — 모델 스토어와 설치 런처의 설치 계약 불일치

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

#### I02 — 기존 모델 재사용이 네트워크에 종속

[downloads.py:144](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/downloads.py:144)의 metadata 조회가 로컬 bin 크기/hash 확인보다 먼저다. 기존 파일을 넣고 metadata 요청에 오프라인 오류를 주입했을 때 파일은 보존됐지만 `sha256`은 호출되지 않고 오류가 전달됐다.

기대: 기존 pinned manifest로 검사 가능한 경우 인터넷 없이 재사용하고, 확인 불가능한 경우 ‘로컬 모델이 삭제되었다’고 표현하지 않는다. 현재도 모든 모델 체크를 해제하면 앱 설치 자체를 계속할 수 있으므로 오프라인 앱 설치 전체가 불가능하다는 주장은 아니다. Python/pip 환경 준비에도 별도 네트워크 의존이 있으므로 모델 manifest 변경만으로 전체 오프라인 준비가 해결되지는 않는다.

권장: 검증 manifest와 완료 marker를 저장하고 ‘설치된 버전 확인’과 ‘새 버전 받기’를 분리한다. hash 검사 비용, 위·변조되거나 오래된 manifest의 처리와 출처 인증을 고려한다.

수용 기준: 정상 manifest/파일로 오프라인 앱 업데이트가 가능하다. 손상되거나 출처 미확인 파일에는 재사용 성공을 주장하지 않고 모델 준비를 뒤로 미룰 수 있다. 네트워크 재연결 시 명시적 갱신·재시도가 정상 동작한다.

#### I03 — 모델 용량과 실제 저장 드라이브

앱 설치 위치는 바꿀 수 있지만 [installer.nsh:69](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/installer.nsh:69)의 모델 root는 AppData다. 모델 행은 bin 대략 크기를 보여주며 Python/GPU/화자 분석 환경의 다운로드·설치 추가 비용은 ‘추가 다운로드와 저장 공간 필요’로만 표시한다. 해당 helper들에서 총 용량 계산/여유 공간 사전 검사를 확인하지 못했다. 기본 NSIS 앱 공간 검사까지 없다고 주장하는 것은 아니다.

예상 재현 조건: D:에는 공간이 있고 AppData가 위치한 C:에는 모델·임시 환경 공간이 부족한 별도 VM에서 D:에 앱을 설치하고 표준/고성능을 선택한다. 기대는 대상별 안내와 부족 공간 선제 발견이며, 현재 전체 흐름은 실험하지 않았다. 사용자 드라이브를 채우지 않았다.

권장: 실제 모델 metadata와 실행 환경 계획을 바탕으로 AppData 드라이브와 임시 설치 드라이브를 확인한다. 다운로드 크기와 설치 후 용량은 분리한다. 정확한 크기를 모를 때 범위/최소 필요로 표현하고 계산값을 확정값처럼 표시하지 않는다.

수용 기준: C: 부족/D: 충분 사례에서 잘못된 설치 위치 변경 안내를 하지 않는다. 런타임·staging 추가 공간과 모델 재사용 여부가 반영된다. 실행 중 공간 부족도 파일 보존·재시도 가능한 오류로 처리한다.

#### I04 — 취소와 부분 완료

[preparation-page.nsh:49](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh:49)는 취소가 준비 중단이고 이미 받은 파일은 재사용된다고 안내한다. 모델 준비는 앱 파일 설치 뒤이므로 앱은 이미 남아 있다. 실패 창 [111행](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh:111)의 MB_RETRYCANCEL에서 Cancel을 선택하면 준비 완료 flag를 세우고 다음 버튼을 활성화하며 ‘앱은 설치했지만 변환 준비 미완료’ 완료 문구를 사용한다.

이는 코드가 실패를 성공으로 숨기는 동작은 아니다. 다만 동일한 ‘취소’가 전체 설치 취소·준비 중단·준비 건너뛰기를 뜻해 사용자가 현재 보존 상태를 알기 어렵다.

권장: 실패 선택지는 ‘다시 시도 / 나중에 준비’, 진행 버튼은 ‘준비 중단’처럼 동작에 맞는 문구를 검토한다. 완료 화면은 앱 설치됨과 선택 모델 준비 여부를 분리한다. 종료 확인은 앱·받은 파일이 남는지 짧게 설명한다. 외부 다운로드를 다시 받지 않는 재시도 정책은 유지한다.

수용 기준: 앱 파일 설치 전·후, 다운로드 중, 검사 중, 실패 창에서 각각 취소했을 때 앱·모델·사용자 자료의 보존 여부와 다음 행동이 맞게 안내된다. 취소 시 소유한 모든 준비 자식 프로세스가 종료되는지 실제 VM에서 재검증한다.

#### I05 — 진행 중임을 이해하기 어려운 구간

[installer_progress.py:42](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/installer_progress.py:42)를 UI 메시지 전송 없이 실제로 호출해 기록했다. 모델 파일 100% 후 engine-start/validation-start는 bar 값 0을 보낸다. 단계 문구는 3/5, 4/5로 바뀐다. 이 막대는 전체 설치 진척이 아니라 현재 파일/단계 값이지만 동일 위치라 혼동 가능하다.

[downloads.py:65](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/downloads.py:65)의 한 청크에 5회 오류를 주입한 결과 요청 5번, sleep 요청 1/2/3/4/5초, phase 이벤트 하나만 기록됐다. 실제 sleep은 대역으로 처리했으므로 **15초나 네트워크 timeout을 실제 측정했다는 뜻은 아니다.** lock은 [129행](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/downloads.py:129)에서 대기한다. installer의 install()은 root lock 획득 후에 model-start를 보낸다.

권장: 측정 불가능한 설치·검사·다른 작업 대기는 indeterminate 상태/활동 표시와 현재 단계 문구를 사용한다. 실제 횟수를 기반으로 재시도 중임을 알리고 재시도 마지막 종료가 임박했음을 안내한다. 진행률을 가짜로 증가시키지 않는다. 현재 파일 진행과 전체 단계를 명확히 구별한다. 너무 빈번한 상태 업데이트로 UI를 방해하지 않도록 제한한다.

수용 기준: 응답 없는 서버, 같은 root의 다른 준비 작업, 모델 로딩, 다중 모델 설치에서 현재 무엇을 기다리는지 알 수 있다. 완료 100%는 해당 완료 대상과 일치하고 불확정 단계에서 가짜 퍼센트를 만들지 않는다.

#### I06 — 초기 오류의 원인 전달

[install_models.py:47](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/install_models.py:47)의 root.mkdir에 권한 오류를 주입했을 때 상세 try/except에 도달하지 않아 `result.txt`, `installer-error.txt`, log가 모두 생성되지 않았다. pid 파일은 먼저 생성된다. NSIS는 자식 종료를 감지하고 [preparation-page.nsh:104](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh:104)의 일반 오류를 사용한다. 즉 무한 대기를 재현한 것이 아니라 **오류 원인을 잃는 문제**다.

권장: 디렉터리·로그·진행 초기화까지 structured handler에 넣고 모델 root가 쓰기 불가해도 installer plugin temp에 실패 이유를 전달한다. 사용자에게 원인에 맞는 짧은 안내를 먼저 표시하고 log 열기·경로 복사·고급 상세를 제공한다. 개인정보 포함 로그를 자동 전송하지 않는다.

수용 기준: 모델 폴더 권한 없음, log 생성 실패, result 쓰기 실패, 잘못된 선택, 자식 조기 종료에서 긴 경로와 traceback만 보여주지 않고 원인과 선택지가 나타난다. 재시도는 부분 파일을 안전하게 재사용하며 이후 정상 준비가 가능하다.

### 나머지 항목의 검증 계획과 부작용

#### I07 — 업데이트/복구 범위

[installer.nsh:73](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/installer.nsh:73)는 설치된 세 기본 모델을 모두 체크한다. [engine_prepare.py:138](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/engine_prepare.py:138) 이후는 venv/pip/환경 및 기본 화자·출력 장치 준비, 선택 모델별 probe/실제 준비 검사를 수행한다. 캐시 파일이 곧바로 매번 재다운로드된다는 뜻은 아니고, 체크한 전체 범위의 준비 경로를 반복 실행한다는 뜻이다.

앱 파일 갱신과 깊은 복구를 분리하고 환경 버전·드라이버·모델 fingerprint가 유효한 경우 재사용한다. 캐시 재사용 때문에 드라이버 변경·손상 환경을 놓치지 않도록 깊은 검사 경로는 유지해야 한다. 수용 기준은 정상 update/강제 복구/드라이버 변경/손상 marker를 별도 VM에서 확인하고 실제 시간·다운로드 bytes를 기록하는 것이다. 이번에 시간·속도 향상은 측정하지 않았다.

#### I08 — DPI·키보드는 현재 판정 유보

모델 화면은 100% 너비와 dialog-unit 단위를 사용한다. 1.3.1 이전 잘림이 현재도 재현된다고 가정하지 않는다. 다만 [installer.nsh:216](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/installer.nsh:216)의 14u 모델 행과 12u 상태, [preparation-page.nsh:56](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh:56)의 22u 동적 상세에는 긴 GPU 이름·실제 파일명·장문 오류가 들어간다. 이번에는 실제 글꼴 폭/렌더링/Tab 순서를 측정하지 않았다.

VM에서 Windows 100/150/200%, 1280×720 작업 영역, 키보드 전용 Tab/Shift+Tab·Space·방향키·Enter·Esc, 화면 읽기 도구를 확인한다. checkbox/radio/drop-list를 표준 NSIS 컨트롤로 구현한 것은 좋은 기반이다. 복잡한 사용자 정의 테마로 바꾸기보다 실제 측정된 잘림만 높이·줄바꿈·간결한 요약/상세 창으로 조정한다. 수용 기준은 완료·오류·취소까지 모든 조작이 키보드로 가능하고 장문 상태가 핵심 행동 버튼과 겹치지 않는 것이다.

#### I09 — unsigned 배포

`Get-AuthenticodeSignature`로 현재 exe의 NotSigned를 확인했다. package.json의 `signAndEditExecutable: true`나 빌드 로그 ‘signing’은 인증서가 실제로 적용됐다는 증거가 아니다. SmartScreen이 반드시 막는지·어떤 경고가 뜨는지는 깨끗한 다운로드 환경에서 재현하지 않았다.

정식 코드 서명·timestamp와 게시자 일관성을 검토한다. 비용·인증서 관리·배포 파이프라인 변경이 필요하며 서명만으로 평판 경고가 즉시 사라진다고 보장하지 않는다. 수용 기준: 실제 배포 asset의 서명이 Valid이고 인증서 게시자·timestamp가 기대값과 일치한다. 깨끗한 VM에서 웹 다운로드부터 실행까지 기록한다. 보안 경고를 자동 우회하지 않는다.

서명과 파일 평판을 구별하는 판단은 [Microsoft의 SmartScreen 개발자 안내](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)를 참고했다. 현재 LOXT의 실제 경고 발생 여부를 이 문서만으로 확정하지 않는다.

#### I10 — 사용자 용어와 언어

화면의 기본 역할명은 앱과 동일하게 저성능·표준·고성능이다. 설치 log의 `PRESETS['small']='최적화'`와 완료/환경 상태의 ‘전사’가 섞여 있고, English 언어를 포함하면서 custom 화면은 LangString 대신 Korean 상수다. 사용자 모델 역할을 변경할 수 있는 앱에서는 installer의 3개 기본 모델은 ‘기본 제공 모델’로 명확하게 구분할 필요도 있다.

같은 역할/내부 모델 ID/사용자 별명을 구별하고 용어를 통일한다. CPU/GPU/int8 같은 세부 정보는 실제 대응에 필요한 경우 상세로 보인다. 기존 동작을 숨기면서 단순화하지 않는다. 수용 기준: 한국어의 기능명과 모델명이 앱/installer/log에서 대응되고 English 모드의 custom 화면과 오류 안내가 일관된다. 로그 내부 기술 용어까지 전부 없앨 필요는 없다.

### 공식 문서와 공개 UI 참고

기준은 LOXT의 기존 로고·차콜·SUIT 스타일과 단순한 작업 흐름이다. 타 제품의 기능·외형을 그대로 복제하자는 제안이 아니다.

- [VS Code Windows 설치 문서](https://code.visualstudio.com/docs/setup/windows): 사용자 단위 설치를 권장하며 관리자 권한이 필요 없고 background update와 ZIP 대안을 설명한다. LOXT의 사용자 단위 설치 선택은 유지할 만하다. 문서 확인이지 VS Code installer를 직접 실행한 비교는 아니다.
- [Visual Studio 공식 설치 안내](https://learn.microsoft.com/en-us/visualstudio/install/install-visual-studio?view=visualstudio), [설치 수정 안내](https://learn.microsoft.com/en-us/visualstudio/install/modify-visual-studio?view=visualstudio): 선택 가능한 component와 뒤에서 수정하는 흐름, 진행 상태와 Launch를 구분한다. [공개 구성 선택 화면](https://learn.microsoft.com/en-us/visualstudio/install/media/visualstudio/new-installer-experience.png?view=visualstudio)도 제공된다. 이미지 URL 응답은 확인했지만 Browser Use에서 iab·chrome provider가 모두 unavailable로 반환되어 직접 화면 렌더링 비교까지 완료하지 못했다.
- [Microsoft Progress Bars 지침과 공개 화면](https://learn.microsoft.com/en-us/windows/win32/uxguide/progress-bars): 측정 불가능한 작업은 indeterminate 활동으로 표현하고, 중단이 부분 상태를 남기는 경우 Cancel/Stop 의미를 구분한다. [공개 Stop 화면](https://learn.microsoft.com/en-us/windows/win32/uxguide/images/progress-bars-image4.png)은 접근 가능한 참고 링크다. LOXT 실제 화면 재현 증거로 사용하지 않는다.
- [NSIS nsDialogs 공식 문서](https://nsis.sourceforge.io/Docs/nsDialogs/Readme.html): pixels/dialog units/percentage 배치 단위와 focus/control APIs를 확인했다. dialog-unit 사용이 모든 DPI 문제 해결을 보증하지는 않는다.
- [Windows Sandbox 공식 설명](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/): 별도 hypervisor 기반 Windows 환경이며 종료 시 내용이 폐기된다. 기존 host 설치와 별도 앱 프로필은 이에 해당하지 않는다.

### 유지해도 괜찮은 부분

- 사용자 단위 설치·관리자 권한 상승 없음, 기본 앱 파일 설치와 선택 모델 다운로드 분리.
- GPU 감지와 CPU 대체, 기존 모델 선택/장치 설정을 성공 후 처리하는 기본 방침.
- 모델 파일 크기·hash 검증, range 기반 다운로드·부분 청크 manifest, 준비 parent/child 종료 감시.
- 모델 체크를 전부 해제해 추후 준비 가능, 실패 시 재시도와 미완료 안내.
- 버전 비교로 downgrade를 막고 같은 버전 복구와 이전 버전 업데이트를 나누는 관리 화면.
- 제거 범위를 전용 transcription 폴더로 제한하고 appData 전체/보관함을 지우지 않는 구조. 모델 제거가 OS 휴지통으로 이동한다는 안내는 없으며 이번 검사에서도 복구 가능하다고 주장하지 않는다.

### 권장 순서와 남은 범위

먼저 I01의 모델 보존·원자적 교체와 I02의 오프라인 재사용 계약을 해결하고 helper 회귀 테스트를 추가한다. 다음 업데이트에서는 I03~I07을 설치 선택·진행·실패 UX로 묶는다. I08은 실제 Windows VM을 확보한 뒤 현재 설치 파일로 확인해 실제 잘림/포커스 문제만 수정한다. I09는 코드 수정과 별도로 배포·서명 준비가 필요하다. I10의 문구는 위 상태 변경과 함께 맞추는 편이 좋다.

실제 first install·update·repair·uninstall, 파일 복사 중 Cancel, 설치 후 실행·바로가기, 150/200% DPI, keyboard/screen reader, 실제 Windows 보안 경고, GPU/CPU 실행 검사, 진짜 인터넷 오류·디스크 부족·model lock 경쟁은 현재 미검증이다. host 설치를 대신 실행하거나 과거 성공 로그를 현재 검증으로 바꾸지 않았다. 향후 VM에서는 예시 녹음·스크립트·메모·PDF·그리기·사용자 지정 보관함의 hash를 설치 전후 비교하고, 업데이트는 모델을 보존하며 제거는 전용 환경만 없애는지 확인해야 한다.

앱·설치·사이트 코드를 개선하거나 새 버전/설치 파일을 만들지 않았으며, 이 보고서의 제안에는 아직 구현 승인이 포함되지 않는다.

---

## 전체 사용 흐름 상세

### 주요 항목 상세

#### F01 — 동일 폴더 메뉴의 서로 다른 동작 계약

위치: [App.jsx:337](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/App.jsx:337), [LiveWorkspace.jsx:137](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LiveWorkspace.jsx:137), [ActionMenu.jsx:56](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/ActionMenu.jsx:56), [LibraryActions:25](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library-actions.cjs:25). 정상 쪽은 [LibraryView.jsx:100](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LibraryView.jsx:100)의 `split()`으로 폴더를 분리한다.

재현: 사이드바 ‘회의’ 우클릭 → 휴지통으로 이동 → 확인 버튼. Work와 Live 모두 오류 토스트가 나타나고 폴더가 남는다. Work에서 우클릭 → 폴더 이동하기 → 목적지도 `선택한 기록을 다시 확인해 주세요.` 오류로 실패한다. 확인 창은 폴더를 ‘1개 기록’으로 설명한다.

기대는 폴더와 하위 기록을 한 작업으로 이동하거나 휴지통에 보존하는 것이다. 실제로는 `ids:['회의'], folders:[]`가 전달되고 기록 존재 검사에서 거부된다. **백엔드가 이를 안전하게 거부한 것이며 폴더 삭제·자료 손실은 발생하지 않았다.** Live 이동은 같은 handler를 코드상 확인했으나 이번 직접 클릭 재현은 Work 이동과 Work/Live 삭제에 한정했다.

증거: [Work 이동 오류](../test-results/ux-audit-next/flow/sidebar-folder-move-error.png), [Work 삭제 오류](../test-results/ux-audit-next/flow/sidebar-folder-delete-error.png), [Live 삭제 오류](../test-results/ux-audit-next/flow/live-sidebar-folder-trash-error.png), 결과 JSON의 `stillThere:true`.

권장: 사이드바·홈 폴더·메인 카드·패널에서 동일한 payload 생성과 확인 문구를 공유한다. 멀티 선택, 자기 하위 이동 거부, tombstone 계층 복구, 실행 취소 기능을 훼손하지 않아야 한다. 확인 UI에서 폴더 이름과 하위 포함 여부도 표시한다.

수용 기준: Work/Live의 사이드바·홈·메인·패널 폴더 각각에 이동/휴지통/복원/실행 취소 검사를 추가하고 기록 ID와 폴더 경로가 섞이지 않는다. 작업 중 연속 확인 클릭도 하나의 작업만 수행한다.

#### F02 — 새 녹음 폐기의 메모 포함 범위

위치: [RecordingPage.jsx:218](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/RecordingPage.jsx:218), [RecordingPage.jsx:261](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/RecordingPage.jsx:261), [library.cjs:373](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:373). `discardRecording()`은 `trash-delete.json` journal로 UUID 디렉터리를 영구 제거한다.

재현: 합성 입력으로 Work 녹음 시작 → 해당 세션의 메모 API로 예시 문단 저장 → 녹음 중단 → 메모 열기 → 버리기. 메모 seed는 실제 사용자 입력이 아닌 조사용 데이터다. 버튼 클릭 후 홈으로 돌아가고 확인 창은 없으며, 기록·휴지통에서 ID가 사라지고 UUID 디렉터리도 존재하지 않는다. 메모 읽기는 보관함 확인 오류를 반환한다.

기대는 영구 폐기 범위를 이해하고 최종 선택할 수 있는 것이다. 현재 버튼 이름만으로는 작성한 메모도 함께 영구 삭제됨을 알기 어렵다. 일반 기록 삭제가 확인 후 휴지통 이동이라는 점과도 다르다.

증거: [버리기 전](../test-results/ux-audit-next/flow/discard-with-memo-before.png), [버리기 후](../test-results/ux-audit-next/flow/discard-with-memo-after.png), `followup-results.json`의 `inLibrary:false`, `inTrash:false`, `filesExist:false`. 첫 화면 캡처는 메모 패널 열기 애니메이션 초기 시점일 수 있으므로 메모의 존재·삭제는 API 및 파일 검사를 근거로 한다.

권장: 최소한 ‘녹음과 작성한 메모를 함께 버립니다’라는 확인과 취소를 제공한다. 더 안전한 선택은 이미 확정 저장된 녹음은 휴지통으로 보내는 것이다. 메모를 별도 문서로 유지하는 선택은 설계 확정이 필요하다. 휴지통 방식은 저장 공간을 즉시 확보하지 못하며, 진행 중 part 세션과 저장 완료 기록의 계약을 구분해야 한다.

수용 기준: 메모 없음/있음/저장 실패, 폐기 취소/확인, 재시작 뒤 회복 가능 여부를 검사한다. 영구 폐기를 유지한다면 대상과 복구 불가 여부를 정확히 설명한다.

#### F03 — 사용자 경로와 시스템 scope의 이름 충돌

위치: [library.cjs:25](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:25), [LibraryView.jsx:35](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LibraryView.jsx:35), [library-range.cjs:35](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/shared/library-range.cjs:35). `all/recent/trash`는 생성 시 제한하지만 `library`는 제한하지 않고, 조회에서는 시스템 scope로 처리한다.

재현: 임시 프로필에 `library` 폴더 생성 → 그 폴더에 메모 생성 → 사이드바 `library` 클릭. 제목은 ‘모든 기록’이 되고 해당 폴더 밖의 메모·녹음도 표시한다. 실제 메모의 folder 값은 `library`, deleted는 false다. [화면 증거](../test-results/ux-audit-next/flow/reserved-folder-trash.png). 증거 파일명은 초기 조사 시도에서 유지됐지만 **실제 성공 재현 대상은 `library`다.** `trash` 생성은 기존 validation으로 안전하게 거부되어 버그로 집계하지 않았다.

권장: `scope:{kind:'folder',path:...}`와 `scope:{kind:'system',name:...}`처럼 데이터 의미를 분리한다. 당장 추가 금지어만 넣으면 이미 존재하는 사용자 폴더가 해결되지 않는다. 전환 시 저장된 탭 경로·검색·deep link·기존 폴더를 호환해야 한다.

수용 기준: 최상위/하위 폴더의 `library`, 기존 탭 상태, 이름 변경 후 조회가 실제 해당 폴더 범위와 일치한다. 시스템 전체 기록도 유지한다.

#### F04 — 제목 편집 상태가 저장 표시와 분리됨

위치: [useDocumentTitle.js:8](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/useDocumentTitle.js:8), [DocumentHeader.jsx:3](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/DocumentHeader.jsx:3), [NoteDetail.jsx:74](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/NoteDetail.jsx:74).

재현: 완료된 예시 스크립트 제목 입력에 새 제목 입력, blur/Enter 전 상태 확인. 상단은 ‘저장됨’, 실제 getNote 제목은 이전 `work 스크립트`다. [화면](../test-results/ux-audit-next/flow/dirty-title-status.png), 기본 결과의 `dirty-title-status`.

제목은 blur/Enter에서 저장하도록 구현되어 있다. 이번에는 저장 실패·앱 종료로 제목을 잃었다고 주장하지 않는다. 본문이 저장됐더라도 제목이 아직 미확정인 상황을 사용자에게 알리는 개선이다.

권장: title hook이 dirty/saving/error 상태를 제공하고 헤더가 이를 우선 반영한다. 저장 중 제목 재편집·다른 기기의 변경도 일관된 상태로 보여야 한다. 키 입력마다 파일을 쓰는 방식으로 바꾸면 원격 저장 요청이 늘 수 있으므로 기존 저장 시점과 debounce 정책을 유지하며 표시부터 맞춘다.

수용 기준: 입력 중/Enter/blur/실패/재시도/충돌/페이지 이동에서 저장 배지가 실제 확정값과 맞는다. 메모·PDF·그리기의 제목 흐름도 동일 hook 사용 범위에 따라 함께 검사한다.

#### F05 — 오른쪽 탭의 키보드와 닫기 후 포커스

위치: [PanelTabs.jsx:15](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PanelTabs.jsx:15), [PanelTabs.jsx:26](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PanelTabs.jsx:26).

재현: 폴더와 브라우저 탭 2개 생성 → Ctrl+1 → 첫 tab에 focus → ArrowRight. focus는 그대로 ‘회의’ tab에 남는다. 모든 tab의 기본 tabindex는 0이며 `aria-controls`와 panel `aria-labelledby` 연결이 없다. 새 탭 닫기 버튼을 focus한 뒤 Enter로 닫으면 `document.activeElement`는 BODY다. 마우스 닫기만 확인한 것이 아니다.

기대는 좌우 키로 탭을 찾아 Enter/Space로 활성화하고, 닫으면 인접 탭이나 패널 열기 버튼으로 다음 행동을 이어가는 것이다. [WAI-ARIA 탭 패턴](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)은 이런 키보드 상호작용과 tab/panel 연결을 안내한다. 현재 Ctrl+1과 Ctrl+T, 접기·재열기 중 탭 개수 보존은 정상 확인했다.

권장: roving tabindex와 stable ID 연결, 인접 탭의 합리적인 선택·포커스, 마지막 탭 종료 시 외부 trigger focus를 제공한다. 브라우저 콘텐츠의 실제 WebContents focus와 modal 진입을 함께 고려한다. 방향키 즉시 선택은 무거운 문서 로딩을 유발할 수 있으므로 수동 활성화 방식도 검토한다.

수용 기준: 1/2/10개 탭, 첫/중간/마지막 탭 닫기, 패널 접기, Ctrl+W, 브라우저 내부 키 입력에서도 focus를 잃지 않는다. 실제 화면 읽기 도구 검증은 추가로 필요하다.

### 나머지 개선의 수용 기준

- **F06**: `Error invoking remote method…`와 개인 경로·stack은 상세에 두고 기본 오류에는 원인과 다음 행동을 보인다. 현재도 전체 오류는 Work/Live 토스트의 `title`, Work의 `aria-label`에 남아 있다. 따라서 원인 정보가 완전히 소실되거나 상세가 전혀 없다고 판정하지 않는다. 문제는 짧은 시각 요약과 안정적인 상세·재시도 접근이 부족하다는 점이다. 단순히 문자열을 삭제해 중요한 원인을 숨기지 않는다. move 실패의 전체 오류와 trash 토스트 잘림을 함께 재현하고 키보드로 상세·재시도를 열 수 있는지 확인한다. 연결 담당 조사에도 같은 오류 표현이 있을 수 있으므로 공통 오류 처리 원인으로 묶는다.
- **F07**: `HomePage`와 사이드바의 녹음 중 금지 정책이 일치해야 한다. 현재 홈과 파일 불러오기는 disabled, 사이드바 YouTube만 enabled다. [실제 녹음 중 홈](../test-results/ux-audit-next/flow/recording-home-sidebar-enabled.png). 다운로드 동시 사용을 지원하려는 정책이라면 홈도 가능하게 하고 충돌을 안내할 수 있지만, 이는 추가 설계 결정이다. 이번에는 실제 YouTube 작업을 시작하지 않았으므로 중복 추론·다운로드 오류를 주장하지 않는다.
- **F08**: 체크는 선택된 기본값을 의미한다는 점을 유지하면서 미설치 상태를 알기 쉽게 표현한다. [예시 홈](../test-results/ux-audit-next/flow/home-work.png). disabled 텍스트를 불필요하게 더 어둡게 만들지 말고 기존 테마 토큰과 SUIT를 유지한다. 모델을 자동 설치하거나 새 추천 기능을 추가하자는 제안은 아니다. 미설치/다운로드 중/설치됨/삭제됨에 대한 첫 사용자 과업 검증을 권장한다.

### 정상 확인한 부분과 유지할 구조

- Work/Live 로고 메뉴: ArrowDown으로 항목 이동, Escape 후 로고 trigger focus 복귀.
- Work 일시정지→재개→중단: 중단 즉시 변환 창을 띄우지 않고 원본 저장 후 ‘변환하기’ 버튼으로 전환. 버튼을 누르면 폴더·모델 창이 열리고 Escape로 닫힌다. 실제 마이크·추론 검증은 아니다.
- 페이지 이동한 Work 녹음은 홈 ‘진행 중/돌아가기’에서 접근 가능했다. 녹음이 별도 페이지 이동으로 중단된 것으로 관찰하지 않았다.
- 스크립트 내보내기 메뉴: Home/End/Escape와 trigger focus 복귀 정상. TXT/PDF 파일의 실제 생성·문서 렌더링 품질은 이번 flow 검증 범위에서 제외했다.
- 전체화면 문서의 Tab 순환: 배경 버튼이 DOM에 존재한다는 것만으로 포커스 이탈 버그라고 단정하지 않았다. **실제 Chromium popover에서 25회 Tab 동안 문서 안에 머물렀다.** 다른 브라우저·fallback 구현의 보조기기 동작은 별도 검증 대상이다.
- 설정 메뉴는 일반/녹음/모델/연결/저장/앱 정보로 나뉘고 `aria-current`가 있다. 모델 설치·역할·별명·태그·삭제·진단 코드를 읽었으나 실제 다운로드/모델 제거/성능 측정을 실행하지 않았다.
- Live 준비 화면은 기존 버튼 안에서 모델 준비/취소 상태를 표현하도록 구현돼 있고 실제 녹음 start를 준비 뒤 호출한다. 이번에는 idle 화면과 선택 UI만 직접 확인했고 모델 준비·실제 추론을 검증했다고 쓰지 않았다.
- 공통 Menu는 화면 가장자리 배치, 활성 항목 focus, Escape 복귀를 지원한다. 이미 정상인 메뉴를 모두 새 디자인으로 대체할 이유는 확인하지 못했다.
- Work/Live 별도 보관함, durable journal·folder tombstone·ID 보존, 범위 조회와 summary 경로를 유지하는 것이 적절하다. 이번에 초기화·조회 성능을 다시 측정하지 않았다.

### 공식 자료와 공개 화면을 통한 비교

외부 앱을 직접 설치·로그인해서 실사용 성능을 비교하지 않았다. 공식 문서의 설명과 문서에 포함된 공개 화면을 기준으로 상호작용 원칙을 비교했다. 외형을 복제하거나 LOXT 범위를 Notion 전체 기능으로 넓히자는 뜻은 아니다.

- [Notion 키보드 안내](https://www.notion.com/help/keyboard-shortcuts): 키보드와 Markdown 조작을 하나의 문서에 안내한다. LOXT에서는 기존 단축키 tooltip·문서 안내를 유지하고 실제 탭 동작이 맞는지 확인하는 근거로 사용한다.
- [Obsidian Workspaces](https://obsidian.md/help/Plugins/Workspaces): 열린 파일·탭, 사이드바 폭과 표시 상태를 작업 맥락으로 다룬다. LOXT의 별도 보관함과 오른쪽 탭도 현재 작업으로 돌아올 수 있는 상태·포커스 계약을 명확히 하는 데 참고할 수 있다. Obsidian의 레이아웃 저장 기능을 새로 구현하자는 제안은 아니다.
- [OneDrive 복원 안내·공개 화면](https://support.microsoft.com/en-us/onedrive/restore-your-onedrive-files): 휴지통에서 항목을 선택해 복원하는 흐름과 영구 삭제 후 복원 불가를 구분한다. LOXT F02에서도 임시 폐기와 저장된 자료의 삭제 결과를 구별하고 설명하는 근거다.
- [WAI 탭](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [WAI 모달](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): 키보드 이동·닫기 후 focus와 modal 배경 비활성의 기준. 이번에 모달의 처음 focus가 닫기 버튼이라는 사실만으로 접근성 위반이라고 판정하지 않았다. 입력 중심 모달에 자동 focus를 바꾸는 것은 별도의 작은 UX 선택이다.
- [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md): 현재 지침을 확인하고 포커스·상태·오류·키보드 항목에 적용했다. 일괄 취향 변경보다 실제 흐름에서 확인된 문제를 우선했다.

### 권장 순서와 확인하지 못한 범위

바로 해결할 범위는 F01의 폴더 payload와 F02의 영구 폐기 범위 안내·회복 정책이다. 다음 업데이트에서 F03~F07을 scope·저장 배지·키보드·오류·진행 중 진입점 일관성으로 묶을 수 있다. F08은 가벼운 문구/상태 설계와 첫 사용자 과업 테스트로 충분하다.

다른 담당의 연결·모바일·PDF·설치 조사를 이 보고서와 합칠 때 같은 근본 원인(오류 안내, focus, 저장 상태)은 중복 항목 대신 영향 화면을 추가하는 방식으로 묶는다.

미검증: 물리 마이크·Windows 음소거 루프백·장치 해제/자동 추적, GPU/CPU 추론 정확도와 지연, Live 종료 후 화자 보정, 모델 실제 설치/삭제/benchmark, YouTube 네트워크 다운로드·변환, 실제 손상·장시간 음성, 저장 공간 부족·파일 권한 오류, 전체 OS 설치·업데이트·복구·제거, 실제 NVDA/VoiceOver, iPhone/iPad Safari 물리 기기와 Windows 150/200% 배율. 별도 프로필 패키지 화면의 정상 동작을 이 범위의 성공으로 확대 해석하지 않았다.

구현·버전 상승·패키지 재생성·사이트 배포는 이번 조사에서 진행하지 않았다.

---

## 모바일·태블릿 상세

#### M01 — 가장자리 텍스트 편집

- 위치: [PdfPage.jsx:169](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:169), [완료·취소 위치:168](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:168), [pdf.css:1](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/pdf.css:1), [improvements-2.5.css:1](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/improvements-2.5.css:1).
- 재현: 390×844 승인된 웹 → 그리기 → 텍스트 도구 → 페이지 오른쪽에서 8px 안쪽 터치 → ‘가장자리 입력’. 텍스트 편집창 x=278, width=190, right=468, viewport=390. [캡처](../test-results/ux-audit-next/mobile/drawing-text-right-edge.png).
- 기대: 원본 주석의 위치는 유지하면서 입력창과 완료·취소는 보이는 공간에서 사용할 수 있어야 한다. 실제: 입력창 오른쪽 78px가 밖에 있고 완료·취소의 한국어가 한 글자씩 나뉜다. PDF와 그리기는 같은 컴포넌트를 사용한다. 실제 재현은 그리기이며 PDF 적용은 코드상 확인이다.
- 권장: 주석의 PDF 좌표는 그대로 두고 편집 UI만 anchor 기반으로 제한한다. 위·아래도 동일하게 계산하며 사용자가 PDF를 확대하거나 이동하면 다시 위치를 맞춘다. 단순히 저장할 좌표를 왼쪽으로 옮기면 원하는 위치에 텍스트를 넣을 수 없게 된다.
- 완료 조건: 네 모서리, 확대 후 페이지 밖 영역, 키보드 표시, 화면 회전에서 입력과 완료·취소 접근 가능. Esc 취소와 Ctrl+Enter 완료, 저장된 PDF 좌표가 유지됨. 실제 Safari 키보드 검증이 추가로 필요하다.

#### M02 — 열린 옵션의 화면 회전

- 위치: [PdfProperties.jsx:7](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfProperties.jsx:7). 최초 위치를 계산하고 패널 자체 ResizeObserver만 구독한다. 창·앵커·visualViewport 변화 구독은 없다.
- 재현: 1180×820 → PDF → 필기 옵션 열기 → 820×1180으로 변경. 패널 x=679.125, width=300, right=979.125; 오른쪽 159.125px가 벗어난다. [태블릿 회전 캡처](../test-results/ux-audit-next/mobile/pdf-options-1180-to-820.png). 휴대폰 932→430에서는 x=624, right=924라 전체 패널이 보이지 않는다. [휴대폰 캡처](../test-results/ux-audit-next/mobile/pdf-options-932-to-430.png).
- 기대: 열린 메뉴가 보이는 공간으로 이동하거나 안전하게 닫히고 앵커로 포커스가 돌아와야 한다. 실제: 오래된 좌표가 유지된다. Esc로 닫는 것은 정상이며, 키보드가 없는 사용자에게도 명확한 복귀가 필요하다.
- 권장: popup 공통 배치 기준으로 resize/앵커 이동/필요 scroll을 처리하고 visualViewport를 고려한다. 한 프레임에 재계산을 모아 관찰 루프·불필요한 연산을 피한다. 이벤트 해제, 바깥 터치, 포커스 복귀는 유지한다.
- 완료 조건: 열어 둔 상태에서 가로↔세로·분할 화면·키보드 변화, 다크/라이트와 fullscreen 모두 bounds 내 배치. 초점과 선택 값 유지, 닫힌 팝오버 이벤트 누수 없음. 현재 evidence는 Chromium viewport 변경이며 물리 회전 성공을 뜻하지 않는다.

#### M03 — 녹음 원본 삭제 버튼

- 위치: [NoteDetail.jsx:83](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/NoteDetail.jsx:83), [styles.css:181](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/styles.css:181). 좁은 container에서 플레이어는 48px + 나머지 두 열인데 추가된 원본 삭제 동작의 열 배치가 지정되지 않는다.
- 재현: 녹음+스크립트 예시 파일 → 390×844 → 아래 플레이어. [라이트 캡처](../test-results/ux-audit-next/mobile/script-390x844-light.png), [다크 캡처](../test-results/ux-audit-next/mobile/script-390x844-dark.png). ‘녹음 지우기’가 한 글자씩 세로로 늘어난다. 재생·다시 변환 기능 자체를 실패로 판정하지 않았다.
- 권장: 재생 조작과 원본 관리 조작을 명확한 두 행으로 나누고 삭제 버튼에는 충분한 가로 공간을 보장한다. 글자를 숨겨 아이콘만 만드는 것보다 기존 확인 경고를 유지하며 현재 스타일의 텍스트 버튼을 보존한다.
- 완료 조건: 320/390/430px, 긴 번역 문자열·폰트 크기 변경·원본 없음·삭제 대기·복원 상태에서 가로 레이블과 경고 의미가 유지됨. 스크립트는 지우지 않고 오디오만 휴지통 이동하는 기존 동작을 별도 회귀 검증한다.

#### M04 — 터치 목표

현재 44px 최소 목표와 충돌하는 대표 실측은 녹음 장치 선택 19.796875×44px, PDF 내보내기 약104.5×34px, 메모 뒤로 32×44px, 보기 전환 35×44px다. 페이지 관리도 [improvements-2.5.css:3](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/improvements-2.5.css:3)에 coarse 34px가 명시되어 있다. 예시 페이지 관리의 터치 추가·복제는 실제로 성공했다. 작다는 이유로 기능 불가나 모든 접근성 표준 위반이라고 단정하지 않는다.

권장: 데스크톱 시각 크기를 키우기보다 coarse 환경의 실제 버튼 영역을 보장한다. 특히 녹음 버튼 9:1은 좁은 화면에서 화살표 최소 너비를 확보할 수 있는 비율로 조정한다. 투명 hit box 확장은 이웃 버튼과 겹치지 않아야 한다. 완료 조건은 대표 모든 버튼 bounds·간격 자동 검사와 실제 손가락 오조작 검증이다. 펜 도구 선택·페이지 번호·목차 대부분은 이미 44px coarse 규칙이 적용되며 전체를 다시 설계할 필요는 없다.

#### M05 — 낮은 화면에서 본문 확보

568×320 PDF에서 상단 앱바 52px, 문서 헤더 100px, 필기 도구 53px, 하단 53px가 남기는 `.pdf-scroll` 높이는 **32px**다. 844×390에서는 137px다. 메모는 320×568에서 헤더 207px, 본문 279px; 568×320에서 헤더 117px, 본문 121px다. 모든 값은 CSS px이며 JSON에 남겼다. 이 측정은 브라우저 전체가 가로로 넘치는 버그가 아니라 좁은 공간 사용성 문제다.

권장: 짧은 높이에서는 파일 경로·날짜를 보조 메뉴로 묶고 필요한 제목·뒤로·도구·페이지 접근을 남기는 축약 상태를 검토한다. 기존 fullscreen 버튼을 더 쉽게 찾게 하는 것도 작은 변경이다. 웹앱 전체 확대 금지는 기존 사용자의 의도이므로 임의로 해제하자는 제안이 아니다. 메모의 글꼴 확대나 모바일 읽기 모드는 별도 선택 범위로 검토할 수 있다.

부작용: 모든 도구를 한 메뉴로 숨기면 반복 필기 클릭이 늘고, height breakpoint에 따라 갑자기 재배치하면 편집 중 포커스를 잃을 수 있다. 완료 조건은 320px 높이·split screen·키보드 표시에서 현재 작업과 필수 조작을 유지하고 읽을 수 있는 본문 영역이 확보되는지 실기기로 확인하는 것이다.

### 이번에 정상 확인한 흐름

| 흐름 | 현재 검증 결과 | 한계 |
| --- | --- | --- |
| 두 손가락 PDF 확대 | PDF 너비 340→680px, browser visualViewport.scale=1 | CDP touch 모사; 실제 Safari/Pencil 아님 |
| PDF 검색 | ‘Searchable’ → 1/3과 문맥 표시 | 3쪽 텍스트 예시; 스캔·90MB 문서 아님 |
| 페이지 추가·복제 | 터치 추가 1→2쪽, 관리 메뉴 복제 2→3쪽 | 삭제/물리 long press/대량 페이지 별도 검증 필요 |
| 메모 목차 | 터치로 h2 이동 후 좁은 overlay 닫힘 | VoiceOver, Pencil, 분할 키보드 미검증 |
| 메모 검색 | ‘모바일’ 15개 결과 | IME·물리 외장키보드 미검증 |
| 녹음 중단 | 가짜 마이크 00:00:01, 원본 저장 완료, 버리기/변환하기 표시 | 실제 입력 장치·iOS 미검증 |
| 변환 선택 창 | 390px에서 x20,w350,h433.1875로 접근 가능 | 설치 모델은 독립 프로필에 없음; 추론 안 함 |
| 홈·보관함 풋바 | 현재 3개 버튼과 문서 뒤로 동작 확인 | landscape >900px에서 데스크톱 탐색으로 바뀌는 정책은 취향/추가 UX 검토 |

### 공식 앱 참고와 적용 범위

[Goodnotes의 확대·이동 공식 설명](https://support.goodnotes.com/hc/en-us/articles/6554036735631-Zoom-pan-and-scroll-through-pages-in-Goodnotes)은 문서 내부 두 손가락 확대와 이동, 플랫폼별 조작을 구분한다. LOXT도 현재 PDF 내부 확대를 유지하고 브라우저 전체 확대와 혼동하지 않는 방식이 맞다. [Goodnotes 도구 모음 사용자화](https://support.goodnotes.com/hc/en-us/articles/8900755183631-Customize-the-toolbar)는 자주 쓰는 도구 접근의 참고이며, 동일 디자인을 이식하거나 모든 기능을 추가하자는 뜻은 아니다.

[Goodnotes palm rejection](https://support.goodnotes.com/hc/en-us/articles/7353727026959-Configure-palm-rejection-for-comfortable-writing)은 Apple Pencil 계열과 손가락·일반 스타일러스 입력 조건을 구분한다. 따라서 Chromium의 touch/pen 이벤트만으로 LOXT의 실제 손바닥 방지를 완료했다고 판단할 수 없다. [Notion 모바일 설명](https://www.notion.com/en-us/help/workspaces-on-mobile)의 모바일 탐색·편집 도구는 LOXT의 좁은 문서 헤더와 보조 조작 분리 검토에 참고할 수 있다. 비교 자료는 공식 공개 설명·화면이며 사용자 조사나 LOXT 성능 측정의 대체 증거가 아니다.

### 연결 보고서 교차 검토와 후속 검증

[연결·초안 복구 보고서](ux-audit-next-connection.md)의 C01–C04와 중복하여 새 ID를 만들지 않았다. 승인 재요청·주소 입력·초안 받기 UI는 키보드가 열린 visualViewport, safe area, 화면 회전에서도 완료 버튼이 보여야 한다. 연결됨과 저장됨을 분리하고, 문서에서 풋바가 숨겨질 때에도 상태칩이 항상 78px 아래 여백을 예약하는 [web.css:24](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/web.css:24)는 본문 가림을 줄이는 방향으로 함께 검토할 수 있다. 현재 칩이 실제 문서 텍스트 위에 겹치는 것은 캡처에서 확인했지만 별도 핵심 동작 실패로 확대 해석하지 않았다.

offline shell을 도입한다면 Safari/PWA의 cold launch·저장소 eviction·서버/클라이언트 버전 불일치·기기 해제 후 로컬 초안 접근 정책이 필요하다. 인증서 문제를 단순 network 상태로 확정하거나 새 origin에서 예전 localStorage를 읽을 수 있다고 설계하면 안 된다. 개인정보 캐시를 무조건 늘리자는 제안은 하지 않는다.

바로 검토할 것은 M02의 popup 위치 갱신, 다음 UI 묶음은 M01·M03·M04다. M05의 문서 헤더 축약은 현재 스타일을 유지하는 별도 UX 선택이 필요하다. SUIT·차콜·라이트 테마 토큰, 문서 내부 줌, 현재 공통 메모/필기 컴포넌트는 유지해도 된다.

미확인 범위: 실제 iPhone/iPad Safari·홈 화면 웹앱, 인증서 신뢰, Apple Pencil 압력·기울기·손바닥, 키보드 표시/분할·한글 IME·VoiceOver·큰 텍스트 설정, 실제 마이크/출력 장치, Live 추론·GPU, 90MB PDF·메모리 압박, 첨부 메모의 터치 리사이저와 동시 편집, 실제 Wi-Fi에서의 지연. 최신 사용자 답변에 실기기 검증 결과가 없으므로 성공으로 기록하지 않는다.

## 통합 완료 검증 기준과 출시 판단

- 원인별 각 ID의 수용 기준을 모두 통과하고, 의심·디자인 제안은 실제 과업/환경 검증으로 채택 여부를 결정한다. 실제 설치 UI·Safari·마이크·추론 미검증을 그대로 남긴 채 ‘모든 문제 해결’로 선언하지 않는다.
- C01–C07: revoke/expire/deny/CSRF/서버 off/on/주소 이동을 구분, PC 승인 유지, 초안 사본과 revision 충돌 보호. 열린 앱과 cold launch·홈 화면 PWA를 별도 검증.
- F01–F08: 각 진입점과 Work/Live, 폴더 scope, 제목 상태, 폐기 범위, Tab/Arrow/Esc/Ctrl+W/닫기 focus, 진행 중 정책을 실제 사용자 과업으로 확인.
- I01–I10: 최초 설치·기존 버전 업데이트·동일 버전 복구·기존 자료 유지·준비 실패/취소·오프라인·부분 다운로드·공간 부족, 100/150/200% DPI·키보드를 격리 Windows에서 검증.
- M 항목: 320–1366 CSS px, 두 테마, 가로/세로·팝오버 열린 채 회전·문서 가장자리 텍스트·키보드/safe area·물리 Safari/Pencil에서 해당 상세 수용 기준을 확인.
- 보고서 범위를 구현하기로 승인한 뒤에만 현재 버전 기준 기능/수정에 맞게 버전을 결정하고 Windows installer·README·release·소개 사이트·다운로드 URL을 일치시킨다. 지금은 코드·버전·배포를 변경하지 않았다.

## 유지해도 괜찮은 부분

Work/Live 데이터 분리, 원본/문서별 저장과 journal·revision 충돌 거부, 요청 ID 중복 방지, 모델 선택 역할과 스토어 분리, 일반 Menu의 Escape/focus 복귀, 문서 내부 PDF pinch 확대, 페이지 이동 중 녹음의 복귀 경로, 기존 SUIT·차콜·브랜드/다크·라이트 토큰은 유지할 만하다. ‘정상 확인’은 각 분야에 기록한 환경·동작에 한정한다.

## 확인하지 못한 범위와 다음 검증

물리 Safari/VoiceOver/Pencil·소프트 키보드·실제 Wi-Fi/PWA·인증서 신뢰, Windows 실제 설치 lifecycle·DPI·SmartScreen, 실제 마이크/음소거 loopback·GPU/CPU·Live 화자 보정·YouTube·대용량 문서/장시간 음성·저장 공간 부족/권한 실패를 성공으로 주장하지 않는다. 관련 세부 추가 검증 절차는 위 분야별 상세를 따른다. 실제 기기 가능 여부 질문에 아직 답이 없어 물리 검증은 미검증으로 남겼다.

## 근거 파일

- [모바일 분야](ux-audit-next-mobile.md), [설치 분야](ux-audit-next-installer.md), [전체 흐름](ux-audit-next-flow.md), [연결 분야](ux-audit-next-connection.md).
- test-results/ux-audit-next 아래 화면·JSON·로그·조사 스크립트. 실제 사용자 자료나 계정 정보 대신 예시 프로필만 사용했다.
- 공식 자료의 앱 UI·동작 원칙은 분야별 출처에 남겼다. 외부 앱의 실사용 속도나 실제 추론 성능을 비교 측정한 보고서는 아니다.
