# LOXT 2.7.0 모바일·태블릿 UI/UX 조사

조사일: 2026-10-10. **조사와 보고만 수행했다. 앱·설정·사이트·설치 코드는 수정하지 않았다.** 현재 패키지 2.7.0을 사용했고 사용자 보관함 대신 독립 예시 프로필을 만들었다. 이전 감사 결과와 기존 green 테스트를 이번 문제의 증거로 재사용하지 않았다.

## 먼저 볼 사항 5개

1. **M02 / P1 — 열린 PDF 필기 옵션이 회전 후 화면 밖에 남는다.** 태블릿 1180→820px에서도 오른쪽 159.125px가 벗어난다. 휴대폰 932→430px에서는 패널 전체가 화면 밖에 있다.
2. **M01 / P2 — PDF·그리기 가장자리 텍스트 입력창이 잘린다.** 390px 화면에서 입력창 오른쪽은 468px다. 완료·취소 글자도 한 글자씩 줄바꿈된다.
3. **M03 / P2 — 작은 스크립트 화면의 ‘녹음 지우기’가 세로 글자 버튼이 된다.** 재생바의 두 열 배치에 추가 버튼이 잘못 들어간다. 다크·라이트 모두 같은 구조다.
4. **M04 / P2 — 터치 목표 크기가 일부 컴포넌트에서 다시 작아진다.** 녹음 장치 화살표는 약 19.8×44px, PDF 내보내기는 높이 34px, 메모 뒤로는 너비 32px다. 전역 coarse 규칙만으로 해결되지 않는다.
5. **M05 / P2 — 낮은 가로 화면에서 PDF 본문과 메모에 남는 높이가 적다.** 568×320px PDF 본문은 32px이고 메모 상단은 117px를 사용한다. 넘침 버그와 구분되는 화면 공간 배분 문제다.

P0나 데이터 손실은 이번 검증에서 확인하지 않았다. P1은 문서 도구에 다시 접근하기 어려운 M02에만 부여했다.

## 검증 조건과 자료

- 실행본: `release/stage5/win-unpacked/LOXT.exe`, 앱 API에서 버전 **2.7.0** 확인.
- PC 예시 프로필별 연결 서버와 포트를 별도로 실행하고 웹 클라이언트를 PC에서 실제 승인했다. localhost HTTPS, Edge Chromium, touch/mobile 모사, DPR 2를 사용했다. 인증서 경고를 무시한 자동화이므로 실제 인증서 설치·신뢰 성공의 증거가 아니다.
- 크기: 320×568, 568×320, 390×844, 844×390, 430×932, 932×430, 768×1024, 1024×768, 820×1180, 1180×820, 1024×1366, 1366×1024. 다크·라이트 × 홈/보관함/독립 메모/PDF/그리기/녹음 준비/스크립트 = **168개 측정**.
- 해당 168개 정적 화면에서 문서 전체의 가로 넘침은 0px였다. 이것이 팝오버·키보드·페이지 내부 편집 UI의 정상 동작을 보장하지 않는다. 실제로 M01·M02는 별도 조작에서 드러났다.
- 두 손가락 확대 수치는 회전 후 너비 맞춤이 안정화되도록 700ms 기다린 최종 실행의 값이다. 최신 `results-deep.json`(수정 UTC 2026-10-09T18:09:12.588Z)에 before=340, after=680, browserScale=1이 남아 있다. 이전 실행의 380→340은 화면 너비 변경 직후 맞춤 갱신과 겹친 측정이므로 확대 성공·실패의 근거로 사용하지 않았다.
- PDF는 3쪽의 작은 텍스트 예시다. 90MB PDF, 스캔 문서, Apple Pencil, 실제 iOS Safari, 홈 화면 PWA, Wi-Fi 지연·GPU 추론은 이번 검증 대상이 아니다.
- 녹음은 브라우저의 가짜 마이크로 약 1초 녹음하고 개인 테스트 보관함에 원본 저장을 확인했다. 실제 마이크·컴퓨터 소리·음성 인식 성공을 주장하지 않는다. 변환 창에 설치 모델이 없는 것은 독립 프로필에 모델을 설치하지 않은 조건이다.
- 자동화 초반의 실패는 홈 버튼 accessible name에 설명이 포함된 것, 가상 카드의 화면 밖 제목 버튼, 경로와 사이드바의 동명 버튼 선택자 때문이었다. 하네스를 고친 뒤 완료했다. 앱 버그로 분류하지 않았다.

자료: [168개 측정 JSON](../test-results/ux-audit-next/mobile/results.json), [터치·회전 검증 JSON](../test-results/ux-audit-next/mobile/results-deep.json), [조사 하네스](../test-results/ux-audit-next/mobile/audit.mjs). 스크린샷은 CSS 크기의 2배 픽셀로 저장했다. JSON의 `screenshot` 이름 중 실제 저장된 대표 화면만 인용했다. 일부 스크립트의 `layout` 값은 첫 숨겨진 앱 노드 선택 때문에 null이며, 그 값을 화면 부재의 증거로 사용하지 않았다. 해당 화면은 실제 캡처와 보이는 버튼 측정으로 판정했다.

## 발견 사항

| ID | 분야 | 우선순위 | 문제 | 근거 | 사용자 영향 | 개선 방향 | 규모 | 검증 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | PDF·그리기 / 편집 | P2 | 가장자리 텍스트 편집 UI에 가용 공간 제한이 없음 | PdfPage.jsx:168–169, pdf.css:1, 390px에서 right=468px | 입력 내용 잘림, 완료·취소 세로 줄바꿈 | 실제 주석 좌표와 편집 UI 위치를 분리하고 보이는 페이지/viewport 안으로 제한 | 중 | 실제 재현 |
| M02 | PDF / 회전·팝오버 | P1 | 필기 옵션 위치가 화면 변화 후 갱신되지 않음 | PdfProperties.jsx:7, 1180→820/932→430 재현 | 도구 설정이 화면 밖에 남아 찾기 어려움 | 앵커·창·visual viewport 변화에 재배치, cleanup 유지 | 소~중 | 실제 재현 |
| M03 | 스크립트 / 반응형 | P2 | ‘녹음 지우기’가 좁은 재생바 열에서 세로로 줄바꿈됨 | NoteDetail.jsx:83, styles.css:181, 390px 양 테마 캡처 | 기능 이름 가독성·주변 정렬 저하 | 오디오 동작 영역을 별도 행으로 배치하거나 명시적 grid-column 지정 | 소 | 실제 재현 |
| M04 | 터치 / 일관성 | P2 | 일부 작은 버튼이 기존 44px 터치 목표를 충족하지 않음 | web.css:4–5, styles.css:35, pdf.css:1·4, memo.css:3, JSON | 작은 화살표·뒤로·관리 버튼 오조작 가능 | 컴포넌트별 coarse hit box 보장, 현재 시각 크기·간격 유지 검토 | 소~중 | 크기 실제 측정; 오조작 빈도 미측정 |
| M05 | 문서 / 공간 배분 | P2 | 낮은 가로 화면에서 상단과 도구가 본문 대부분을 점유 | document.css:1, memo.css:5·7, PDF 568×320 본문 32px | 한 번에 읽고 필기할 수 있는 공간 감소 | 낮은 높이에서 메타·부수 기능을 축약하고 도구 접근은 유지 | 중 | 실제 측정 + 디자인 제안 |

### M01 — 가장자리 텍스트 편집

- 위치: [PdfPage.jsx:169](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:169), [완료·취소 위치:168](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:168), [pdf.css:1](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/pdf.css:1), [improvements-2.5.css:1](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/improvements-2.5.css:1).
- 재현: 390×844 승인된 웹 → 그리기 → 텍스트 도구 → 페이지 오른쪽에서 8px 안쪽 터치 → ‘가장자리 입력’. 텍스트 편집창 x=278, width=190, right=468, viewport=390. [캡처](../test-results/ux-audit-next/mobile/drawing-text-right-edge.png).
- 기대: 원본 주석의 위치는 유지하면서 입력창과 완료·취소는 보이는 공간에서 사용할 수 있어야 한다. 실제: 입력창 오른쪽 78px가 밖에 있고 완료·취소의 한국어가 한 글자씩 나뉜다. PDF와 그리기는 같은 컴포넌트를 사용한다. 실제 재현은 그리기이며 PDF 적용은 코드상 확인이다.
- 권장: 주석의 PDF 좌표는 그대로 두고 편집 UI만 anchor 기반으로 제한한다. 위·아래도 동일하게 계산하며 사용자가 PDF를 확대하거나 이동하면 다시 위치를 맞춘다. 단순히 저장할 좌표를 왼쪽으로 옮기면 원하는 위치에 텍스트를 넣을 수 없게 된다.
- 완료 조건: 네 모서리, 확대 후 페이지 밖 영역, 키보드 표시, 화면 회전에서 입력과 완료·취소 접근 가능. Esc 취소와 Ctrl+Enter 완료, 저장된 PDF 좌표가 유지됨. 실제 Safari 키보드 검증이 추가로 필요하다.

### M02 — 열린 옵션의 화면 회전

- 위치: [PdfProperties.jsx:7](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfProperties.jsx:7). 최초 위치를 계산하고 패널 자체 ResizeObserver만 구독한다. 창·앵커·visualViewport 변화 구독은 없다.
- 재현: 1180×820 → PDF → 필기 옵션 열기 → 820×1180으로 변경. 패널 x=679.125, width=300, right=979.125; 오른쪽 159.125px가 벗어난다. [태블릿 회전 캡처](../test-results/ux-audit-next/mobile/pdf-options-1180-to-820.png). 휴대폰 932→430에서는 x=624, right=924라 전체 패널이 보이지 않는다. [휴대폰 캡처](../test-results/ux-audit-next/mobile/pdf-options-932-to-430.png).
- 기대: 열린 메뉴가 보이는 공간으로 이동하거나 안전하게 닫히고 앵커로 포커스가 돌아와야 한다. 실제: 오래된 좌표가 유지된다. Esc로 닫는 것은 정상이며, 키보드가 없는 사용자에게도 명확한 복귀가 필요하다.
- 권장: popup 공통 배치 기준으로 resize/앵커 이동/필요 scroll을 처리하고 visualViewport를 고려한다. 한 프레임에 재계산을 모아 관찰 루프·불필요한 연산을 피한다. 이벤트 해제, 바깥 터치, 포커스 복귀는 유지한다.
- 완료 조건: 열어 둔 상태에서 가로↔세로·분할 화면·키보드 변화, 다크/라이트와 fullscreen 모두 bounds 내 배치. 초점과 선택 값 유지, 닫힌 팝오버 이벤트 누수 없음. 현재 evidence는 Chromium viewport 변경이며 물리 회전 성공을 뜻하지 않는다.

### M03 — 녹음 원본 삭제 버튼

- 위치: [NoteDetail.jsx:83](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/NoteDetail.jsx:83), [styles.css:181](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/styles.css:181). 좁은 container에서 플레이어는 48px + 나머지 두 열인데 추가된 원본 삭제 동작의 열 배치가 지정되지 않는다.
- 재현: 녹음+스크립트 예시 파일 → 390×844 → 아래 플레이어. [라이트 캡처](../test-results/ux-audit-next/mobile/script-390x844-light.png), [다크 캡처](../test-results/ux-audit-next/mobile/script-390x844-dark.png). ‘녹음 지우기’가 한 글자씩 세로로 늘어난다. 재생·다시 변환 기능 자체를 실패로 판정하지 않았다.
- 권장: 재생 조작과 원본 관리 조작을 명확한 두 행으로 나누고 삭제 버튼에는 충분한 가로 공간을 보장한다. 글자를 숨겨 아이콘만 만드는 것보다 기존 확인 경고를 유지하며 현재 스타일의 텍스트 버튼을 보존한다.
- 완료 조건: 320/390/430px, 긴 번역 문자열·폰트 크기 변경·원본 없음·삭제 대기·복원 상태에서 가로 레이블과 경고 의미가 유지됨. 스크립트는 지우지 않고 오디오만 휴지통 이동하는 기존 동작을 별도 회귀 검증한다.

### M04 — 터치 목표

현재 44px 최소 목표와 충돌하는 대표 실측은 녹음 장치 선택 19.796875×44px, PDF 내보내기 약104.5×34px, 메모 뒤로 32×44px, 보기 전환 35×44px다. 페이지 관리도 [improvements-2.5.css:3](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/improvements-2.5.css:3)에 coarse 34px가 명시되어 있다. 예시 페이지 관리의 터치 추가·복제는 실제로 성공했다. 작다는 이유로 기능 불가나 모든 접근성 표준 위반이라고 단정하지 않는다.

권장: 데스크톱 시각 크기를 키우기보다 coarse 환경의 실제 버튼 영역을 보장한다. 특히 녹음 버튼 9:1은 좁은 화면에서 화살표 최소 너비를 확보할 수 있는 비율로 조정한다. 투명 hit box 확장은 이웃 버튼과 겹치지 않아야 한다. 완료 조건은 대표 모든 버튼 bounds·간격 자동 검사와 실제 손가락 오조작 검증이다. 펜 도구 선택·페이지 번호·목차 대부분은 이미 44px coarse 규칙이 적용되며 전체를 다시 설계할 필요는 없다.

### M05 — 낮은 화면에서 본문 확보

568×320 PDF에서 상단 앱바 52px, 문서 헤더 100px, 필기 도구 53px, 하단 53px가 남기는 `.pdf-scroll` 높이는 **32px**다. 844×390에서는 137px다. 메모는 320×568에서 헤더 207px, 본문 279px; 568×320에서 헤더 117px, 본문 121px다. 모든 값은 CSS px이며 JSON에 남겼다. 이 측정은 브라우저 전체가 가로로 넘치는 버그가 아니라 좁은 공간 사용성 문제다.

권장: 짧은 높이에서는 파일 경로·날짜를 보조 메뉴로 묶고 필요한 제목·뒤로·도구·페이지 접근을 남기는 축약 상태를 검토한다. 기존 fullscreen 버튼을 더 쉽게 찾게 하는 것도 작은 변경이다. 웹앱 전체 확대 금지는 기존 사용자의 의도이므로 임의로 해제하자는 제안이 아니다. 메모의 글꼴 확대나 모바일 읽기 모드는 별도 선택 범위로 검토할 수 있다.

부작용: 모든 도구를 한 메뉴로 숨기면 반복 필기 클릭이 늘고, height breakpoint에 따라 갑자기 재배치하면 편집 중 포커스를 잃을 수 있다. 완료 조건은 320px 높이·split screen·키보드 표시에서 현재 작업과 필수 조작을 유지하고 읽을 수 있는 본문 영역이 확보되는지 실기기로 확인하는 것이다.

## 이번에 정상 확인한 흐름

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

## 공식 앱 참고와 적용 범위

[Goodnotes의 확대·이동 공식 설명](https://support.goodnotes.com/hc/en-us/articles/6554036735631-Zoom-pan-and-scroll-through-pages-in-Goodnotes)은 문서 내부 두 손가락 확대와 이동, 플랫폼별 조작을 구분한다. LOXT도 현재 PDF 내부 확대를 유지하고 브라우저 전체 확대와 혼동하지 않는 방식이 맞다. [Goodnotes 도구 모음 사용자화](https://support.goodnotes.com/hc/en-us/articles/8900755183631-Customize-the-toolbar)는 자주 쓰는 도구 접근의 참고이며, 동일 디자인을 이식하거나 모든 기능을 추가하자는 뜻은 아니다.

[Goodnotes palm rejection](https://support.goodnotes.com/hc/en-us/articles/7353727026959-Configure-palm-rejection-for-comfortable-writing)은 Apple Pencil 계열과 손가락·일반 스타일러스 입력 조건을 구분한다. 따라서 Chromium의 touch/pen 이벤트만으로 LOXT의 실제 손바닥 방지를 완료했다고 판단할 수 없다. [Notion 모바일 설명](https://www.notion.com/en-us/help/workspaces-on-mobile)의 모바일 탐색·편집 도구는 LOXT의 좁은 문서 헤더와 보조 조작 분리 검토에 참고할 수 있다. 비교 자료는 공식 공개 설명·화면이며 사용자 조사나 LOXT 성능 측정의 대체 증거가 아니다.

## 연결 보고서 교차 검토와 후속 검증

[연결·초안 복구 보고서](ux-audit-next-connection.md)의 C01–C04와 중복하여 새 ID를 만들지 않았다. 승인 재요청·주소 입력·초안 받기 UI는 키보드가 열린 visualViewport, safe area, 화면 회전에서도 완료 버튼이 보여야 한다. 연결됨과 저장됨을 분리하고, 문서에서 풋바가 숨겨질 때에도 상태칩이 항상 78px 아래 여백을 예약하는 [web.css:24](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/web.css:24)는 본문 가림을 줄이는 방향으로 함께 검토할 수 있다. 현재 칩이 실제 문서 텍스트 위에 겹치는 것은 캡처에서 확인했지만 별도 핵심 동작 실패로 확대 해석하지 않았다.

offline shell을 도입한다면 Safari/PWA의 cold launch·저장소 eviction·서버/클라이언트 버전 불일치·기기 해제 후 로컬 초안 접근 정책이 필요하다. 인증서 문제를 단순 network 상태로 확정하거나 새 origin에서 예전 localStorage를 읽을 수 있다고 설계하면 안 된다. 개인정보 캐시를 무조건 늘리자는 제안은 하지 않는다.

바로 검토할 것은 M02의 popup 위치 갱신, 다음 UI 묶음은 M01·M03·M04다. M05의 문서 헤더 축약은 현재 스타일을 유지하는 별도 UX 선택이 필요하다. SUIT·차콜·라이트 테마 토큰, 문서 내부 줌, 현재 공통 메모/필기 컴포넌트는 유지해도 된다.

미확인 범위: 실제 iPhone/iPad Safari·홈 화면 웹앱, 인증서 신뢰, Apple Pencil 압력·기울기·손바닥, 키보드 표시/분할·한글 IME·VoiceOver·큰 텍스트 설정, 실제 마이크/출력 장치, Live 추론·GPU, 90MB PDF·메모리 압박, 첨부 메모의 터치 리사이저와 동시 편집, 실제 Wi-Fi에서의 지연. 최신 사용자 답변에 실기기 검증 결과가 없으므로 성공으로 기록하지 않는다.
