# LOXT 2.2.0 통합 구현 기록

2026-10-09 · 대상: `remote-sync-audit-2.1.1.md` D01–D16, `pdf-viewer-ui-audit-2.1.1.md` P01–P27.

SUIT, LOXT 자산, 차콜 색상, 기존 다크·라이트 토큰과 Work·Live 보관함 분리를 유지했다. 원본 PDF·녹음과 사용자 보관함을 수정하는 테스트를 수행하지 않았다. 이전 UI 수정 보고서의 녹음 중단/변환 버튼·내보내기·모달·반응형 흐름은 유지하고 현재 실행본으로 재촬영했다.

## 원격 동기화 항목

| ID | 적용 내용 | 주요 코드 | 검증 |
| --- | --- | --- | --- |
| D01 | 제목 초안과 외부 최신 제목 분리, 실제 수정만 저장, 제목 기대값으로 충돌 검사 | `src/useDocumentTitle.js`, `electron/library.cjs` | PDF·메모 외부 이름 변경/미편집 blur 실제 앱, 기대값 충돌 서비스 테스트 |
| D02 | PDF 250ms 저장 묶기와 최대 1초 대기, 저장 중 생긴 변경 후속 저장 | `src/pdfStore.js` | 웹 12획을 입력하는 도중 PC 획 수가 증가함 |
| D03 | 본문별 직렬 저장, 본문 확정과 목록 메타데이터 분리, 짧은 인덱스·묶음 기록 | `electron/library.cjs`, `electron/memos.cjs`, `electron/pdfs.cjs` | 1,000개 예시 부하·재시작·메타데이터 실패 테스트 |
| D04 | 문서 ID/종류/리비전 이벤트, 공유 목록 요청, 해당 문서 캐시 갱신 | `src/LibraryView.jsx`, `src/memoStore.js`, `src/pdfStore.js` | PC·웹 같은 문서의 본문 갱신, 서비스 이벤트 검사 |
| D05 | 목록에는 스크립트 앞 8구간·구간당 최대 500자, 상세 화면/추가 미리보기에서 전체 조회 | `shared/library-summary.cjs`, `src/useFullNote.js`, `src/NoteCard.jsx` | 전체 스크립트 보존·상세 조회 테스트, 상세 로딩/실패 안내 코드 검사 |
| D06 | 목록은 현재 스냅샷 조회, 가져오기 준비와 전역 변경 큐 분리, 본문 저장 응답은 메타데이터 큐를 기다리지 않음 | `electron/library.cjs` | 1.5초 큐 경합 주입 시 메모 저장 16.21ms, 목록 0.31ms |
| D07 | 목록 요청 중 새 무효화 이벤트가 오면 후속 조회, 오래된 리비전 응답 차단 | `src/LibraryView.jsx` | 요청 세대/리비전 가드 코드 검사, 앱 동기화 검증 |
| D08 | 확정 본문 알림을 메타데이터 기록 실패와 분리, 목록 기록 재시도 및 오류 안내 | `electron/library.cjs` | 메타데이터 실패 주입 뒤 본문 보존/문서 이벤트 테스트 |
| D09 | 읽기 요청 캐시 제외, 진행 중 변경 요청 중복 방지, 완료 응답 120초/512개/8MB 제한 | `electron/request-cache.cjs`, `electron/device-server.cjs` | TTL·읽기·크기 상한·진행 중 중복 테스트 |
| D10 | IndexedDB 메타데이터와 불변 녹음 조각 분리, v1 초안 이전 | `src/webRecordingJournal.js` | 이전·순서·동일 조각 재시도·호스트 분리·재접속 복구 테스트 |
| D11 | RPC 45초/바이너리 90초 제한·동일 요청 ID로 최대 3회 시도, 연결 복구·화면 복귀 재동기화, 실패 안내 | `src/webAdapter.js`, `src/web.jsx` | 주소 재입력·승인·세션 유지·복귀 재동기화; 실제 Wi-Fi 단절 실기기 검증은 별도 |
| D12 | 승인된 원본 URL의 Range 읽기, 문서 텍스트 색인 캐시, 같은 문서 재색인 방지 | `src/PdfPage.jsx`, `electron/pdfs.cjs`, `electron/device-server.cjs` | 웹 PDF/검색, 기존 인증·Range 서비스 테스트 |
| D13 | 제목 전용 검색은 본문 I/O 생략, 내용 검색 최대 8개 병렬·300문서/32MB 캐시 | `electron/library-search.cjs` | 공통 PC/웹 검색 경로·캐시 무효화 코드 검사 |
| D14 | 모델 환경의 진행 중 요청 공유·3초 캐시와 엔진 변경 시 무효화 | `electron/conversion-queue.cjs`, `electron/main.cjs` | 기존 변환/대기열 회귀 테스트; GPU 성능 새 실측 없음 |
| D15 | SSE 변경 ID·연결 시 상태 대조, 클라이언트 대기 이벤트 64개 제한·최신 상태 병합, Live 차등 이벤트 | `electron/device-server.cjs`, `electron/main.cjs`, `src/webAdapter.js` | 기존 연결·권한·Live 회귀 테스트; 약한 Wi-Fi 장시간 부하 실측 없음 |
| D16 | 메모 저장 중 변경은 참조/리비전으로 확인, 초안 기록 묶기, 필기 rAF/포인트 간소화·객체 패치 요청 | `src/memoStore.js`, `src/pdfStore.js`, `src/PdfPage.jsx`, `src/pdfGeometry.js` | 객체 패치 서비스 테스트·연속 필기·정상 종료 저장 |

## PDF UI·입력 항목

| ID | 적용 내용 | 주요 코드 | 검증 |
| --- | --- | --- | --- |
| P01 | PDF 영역에 한정한 두 포인터 확대/이동. 전역 접근성 확대 제한 없음 | `src/PdfPage.jsx`, `src/pdf.css` | Edge 터치 자동화: PDF 340→582.84px, 브라우저 배율 1 유지 |
| P02 | pointerId 관리, 펜/손가락 분리, 손가락 이동 기본값·필기 선택, 핀치 시작 시 임시 획 폐기 | 같은 파일 | 다중 터치 자동화·코드 확인; 실제 Apple Pencil 손바닥 입력은 미검증 |
| P03 | 최초 너비 맞춤, 컨테이너 ResizeObserver, 수동 배율과 맞춤 모드 분리 | `src/PdfPage.jsx` | 320/390/768px 다크·라이트에서 문서 폭이 영역 안에 맞음 |
| P04 | 아이콘 중심 한 줄 도구, 작은 화면 가로 스크롤·속성 창·44px 터치 영역 | `src/PdfPage.jsx`, `src/pdf.css` | 도구 높이 53–57px, 실제 캡처 |
| P05 | 단일점 표시·저장·PDF 내보내기 | `src/PdfInkObject.jsx`, `electron/pdfs.cjs` | 앱 점 필기·서비스 내보내기 테스트 |
| P06 | 이동 중 지우개 판정, 한 제스처에 한 번 실행 취소 | `src/PdfPage.jsx`, `src/pdfGeometry.js` | 드래그 삭제 후 실행 취소 실제 앱 |
| P07 | 손 도구·Space 임시 이동 | `src/PdfPage.jsx` | 입력/키보드 경로 코드 확인 |
| P08 | 현재 색/굵기 표시, 색상·굵기 프리셋과 상세 속성 | `src/PdfProperties.jsx`, `src/PdfPage.jsx` | 실제 속성 창 캡처 |
| P09 | 펜·형광펜·도형·텍스트별 속성 저장 | `src/PdfPage.jsx` | 도구별 기본값·저장 코드 확인 |
| P10 | 활성 도형 아이콘/이름/접근성 상태 | `src/PdfPage.jsx` | 실행본 캡처·코드 확인 |
| P11 | 기존 객체 선택·이동·크기와 색상/굵기 수정 | `src/PdfInkObject.jsx`, `src/PdfPage.jsx` | 객체 패치 테스트·코드 확인 |
| P12 | 독립 글꼴 크기, 기존 width×6 자료 호환. Esc 취소·Ctrl+Enter 완료 | `src/PdfPage.jsx`, `electron/pdfs.cjs` | 텍스트 작성·취소 실제 앱, 내보내기 회귀 |
| P13 | 문서 좌표 기준 핀치 중심과 확대 후 스크롤 보정 | `src/PdfPage.jsx` | PDF 내부 핀치 자동화·좌표 코드 확인 |
| P14 | 호스트/Work·Live/문서별 페이지·배율·맞춤·미리보기·위치 저장 | `src/PdfPage.jsx` | 보기 상태 저장/복원 코드 확인 |
| P15 | 일치 문자열 단위 이동, 위치 강조·문맥, 이미지 PDF 검색 한계 안내 | `src/pdfGeometry.js`, `src/PdfPage.jsx` | 4페이지 8개 결과·이동·강조 실제 앱 |
| P16 | 한 줄 제목·폭 제한, 모바일 아이콘 내보내기와 정확한 정렬 선택자 | `src/pdf.css`, `src/PdfPage.jsx` | 긴 제목·320/390/768px 및 다크/라이트 검증 |
| P17 | 데스크톱 페이지 rail, 작은 화면 overlay·닫기, 썸네일 가용 폭 조정 | `src/pdf.css`, `src/PdfThumbnail.jsx` | 페이지 열기/닫기 회귀·모바일 캡처 |
| P18 | 페이지·배율 그룹, 독립 검색줄, 휴대폰 배율 메뉴 | `src/PdfPage.jsx`, `src/pdf.css` | 하단 높이 53–57px |
| P19 | 속성은 dialog 역할·Tab 포커스 제한·Esc 닫기·원래 버튼으로 복귀 | `src/PdfProperties.jsx` | 속성 창 캡처·키보드 코드 확인; 스크린 리더 실기기 미검증 |
| P20 | 아이콘 버튼의 명확한 접근성 이름 | `src/PdfPage.jsx` | 역할/이름 기반 실제 앱 자동화 |
| P21 | 안전한 http/https/mailto 링크와 내부 목적지·목차 탐색 | `src/PdfPage.jsx` | 허용 프로토콜/목차 코드 확인; PDF JavaScript 실행하지 않음 |
| P22 | 현재 획 mutable ref+rAF, 정적 객체 메모화, 미세 포인트 간소화 | `src/PdfPage.jsx`, `src/PdfInkObject.jsx` | 연속 획 자동화; iPad 대용량 문서 FPS 실측 없음 |
| P23 | 저장 중/PC 저장 완료/오류·초안 복구와 재시도 구분 | `src/pdfStore.js`, `src/PdfPage.jsx` | 저장 실패 서비스 테스트·연속 반영·닫기 직전 저장 |
| P24 | D01과 같은 제목 동기화·충돌 보호 | `src/useDocumentTitle.js` | 외부 제목 변경/미편집 blur 실제 앱 |
| P25 | coalesced 입력 사용, 취소된 획 보존 정책·핀치 전환 구분 | `src/PdfPage.jsx` | 입력 경로 코드 확인. 압력 기반 가변 굵기는 이 보고서의 지원 확장 제안으로 남음 |
| P26 | 최초/페이지 렌더 상태·진행 안내·재시도·진단, 재로딩 시 이전 문서 정리 | `src/PdfPage.jsx` | 앱/WebKit PDF 렌더·UI 오류 0개 |
| P27 | 원본/따뜻한 톤/밝기 낮추기 보기 전용 선택 | `src/PdfPage.jsx`, `src/pdf.css` | 속성 창 캡처·원본/내보내기 경로 분리 코드 확인 |

## 검증과 릴리스

- 서비스 회귀 **87/87 통과**, 최종 Windows 패키지 내용과 최신 `dist`/Electron/shared 코드 일치 검사 통과.
- 배포할 실행본과 별도 예시 Edge 브라우저: 제목 동기화, 점, 지우개/실행 취소, 텍스트 작성·취소, 연속 필기, PDF 내부 핀치, 긴 제목, 다크·라이트, 모바일 초안 순서와 정상 종료 저장 통과.
- WebKit 26.6: 기기 승인, 재접속 세션, 모바일 탐색, 메모 갱신, PDF·누락된 최신 API 대체 경로, 녹음 초안 재로딩 통과. 실제 iOS Safari 버전과 동일하다는 뜻은 아니다.
- 실제 2.2.0 패키지의 예시 화면 **38장** 재촬영. 사이트 PC/모바일·테마·다운로드 링크 검사 통과.
- `README.md`, `docs/release-2.2.0.md`, `landing/release.mjs`, 사이트 설명·메타데이터·캡처 manifest를 2.2.0으로 갱신했다.
- 설치 파일: `release/stage5/LOXT-Setup-2.2.0-x64.exe`.
- 사이트 ZIP: `landing/loxt-site-v2.2.0.zip`.
- 외부 GitHub 푸시·Release 업로드·Cloudflare Production 게시는 실행하지 않았다. 준비한 v2.2.0 공개 설치 파일 주소는 확인 시 HTTP 404였다.

측정 조건·원시 결과·검증하지 못한 범위는 [검증 기록](verification-2.2.0.md) 참조.

## 지원 확장 제안의 경계

조사 보고서가 별도 후속 검토로 구분한 필압에 따른 가변 굵기, 부분 지우개, 올가미/다중 객체 선택, Zoom View, 연속 페이지 스크롤, OCR·AI·원본 페이지 구조 편집·공동 편집 병합까지 구현했다는 의미는 아니다. 이번에는 기존 기능의 문제와 D01–D16/P01–P27의 핵심 개선 방향을 적용했다. 실제 Pencil·손바닥 거부, Safari 입력 포커스 확대, 약한 Wi-Fi 장시간 부하와 큰 필기 문서 FPS는 실기기 후속 검증이 필요하다.
