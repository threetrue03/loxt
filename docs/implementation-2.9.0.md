# LOXT 2.9.0 구현·검증 기록

대상: [2.8.1 메모·그리기·기기 연결 조사 보고서](ux-review-memo-drawing-devices-2.8.1.md)의 R01–R07, D01–D11. 작성일: 2026-10-11.

## 반영 내용

| 항목 | 적용 |
|---|---|
| R01 그리기 전체화면 | 전체화면의 외부 padding·프레임 테두리·라운드 제거. safe-area, A4 종이 비율, 맞춤·사용자 줌·기존 필기 좌표를 유지. |
| R02 코드 문법 | 마지막 독립 줄의 닫는 삼중 백틱 + Enter에서 구분자를 지우고 다음 문단 생성. 문서 전체 재파싱 없이 같은 블록 ID·언어·본문 유지. 실행 취소 경계를 분리. 문자열 안의 백틱은 원문으로 유지. |
| R03 ROS2 | 표시 ID와 실제 문법을 분리해 Python·C++·YAML·XML·CLI 및 msg/srv/action 8개 분류를 저장·검색. 인터페이스에는 기본 타입·주석·구분선·상수 등의 표시 문법 추가. 단독 `ros2` 입력은 중립 텍스트로 보존. 코드 실행·ROS 패키지 설치·문법 검증 기능은 추가하지 않음. |
| R04·R06 목차 | 전체화면 바로 오른쪽에 배치. 좁은 화면에서도 두 버튼을 한 그룹으로 유지. 실제 heading level 기준 H1 16px/650, H2 14px/600, H3 13px/550, H4 12px/450. 기존 트리·이동·접기·Esc·포커스·터치 대상 유지. |
| R05 메모 … | 해당 툴바 메뉴 제거. 터치 화면에 실행 취소/다시 실행 제공. 코드 블록 안에 코드 복사 및 완료 피드백 제공. 그리기 페이지의 … 메뉴는 유지. |
| R07·D09 홈 | Work·Live 홈에서 공통 내 기기 연결 설정으로 이동. 버튼을 누르는 것만으로 서버를 켜지 않음. 웹 홈에서는 자기 브라우저의 PC 연결 관리 열기. |
| D01 승인 중복 | 같은 출처·유효한 현재 인증 세션은 기존 토큰/CSRF/승인 기한을 재사용. 이름·IP·UA로 다른 브라우저를 합치지 않음. 기존의 의심되는 중복 항목은 자동 삭제하지 않음. |
| D02·D04 연결 흐름 | Wi-Fi/서버 → 인증서 설치·신뢰 → QR/주소 → PC 승인 순서로 안내. 대기 요청과 개수를 설정 상단에 표시. |
| D03 주소 | 기존 Windows 기본 경로 우선순위를 유지해 대표 주소를 먼저 표시. 다른 네트워크 주소는 접기. 모든 주소의 도달 가능성을 보장한다고 표시하지 않음. |
| D05·D06 브라우저 관리 | 실제 WebSocket/SSE 접속과 승인 유효/만료 상태를 구분. 승인한 브라우저의 별명 수정. 최초 연결/재승인 UA 판정 공통화; Mac의 터치 정보로 iPad 데스크톱 모드 구분. 별명을 인증 신원으로 사용하지 않음. |
| D07·D08 해제/문구 | 승인 해제 또는 만료 항목 정리 전에 대상·재승인·저장 대기 영향을 확인. 문서는 삭제하지 않음. 현지 날짜 형식 사용; 주소 복사 중 서버 토글을 ‘준비 중’으로 바꾸지 않음. |
| D10 QR | 서버의 pairExpires로 남은 시간 계산. 만료된 QR을 숨기고 새 QR/주소 생성 안내. |
| D11 웹 복구 | 정상 연결 시 현재 승인 안내; 재승인 주소 입력은 접힌 보조 동작. 만료·해제/PC 변경에서는 주소 입력 우선. 정상 연결에서 hash의 pair가 바뀌어도 불필요한 관리 창을 열지 않음. 원래 초안 백업·주소 변경 확인·복구 사본 기능 유지. |

ROS 인터페이스 표시 문법은 [공식 ROS 인터페이스 문서](https://design.ros2.org/articles/legacy_interface_definition.html)를 참고했다. 완전한 ROS 컴파일러나 정적 분석기는 아니다.

## 검증

- `npm run test:release`: **175/175 통과**. HTTPS/nonce/CSRF/철회·만료, 별도 브라우저, 유효 승인 재사용, 실제 소켓 접속 상태, 별명 수정 시 토큰 보존 포함.
- `node scripts/memo-editing-ui.mjs release/stage5/win-unpacked/LOXT.exe`: 최종 Windows 패키지의 메모 부모 블록 삭제·하위 내용 보존·범위 Tab/Shift+Tab·색상·목록/토글·코드·저장 후 재실행 회귀 검증 통과.
- `node scripts/ux-2.9-ui.mjs`: private 예시 프로필로 최종 Windows 패키지와 Edge 터치 브라우저 검사. 닫는 펜스·Undo/Redo·리터럴 백틱·Markdown 붙여넣기, ROS2 검색/문법 표시/저장/복사, 그리기 전체화면에서 실제 펜 입력 저장, 동일 브라우저 재승인 시 항목 수 보존, 별명/승인 해제 확인, Work·Live 공통 설정 확인.
- 다크·라이트에서 요청 창 너비 390/768/1024/1400px 검사. Windows 화면 배율과 창 테두리 때문에 실제 콘텐츠 너비는 요청값보다 작으며 측정 JSON에 실제 innerWidth를 기록한다. 문서 전체의 가로 넘침 없음. 필기 도구의 내부 가로 스크롤과 A4 종이 스크롤은 정상 동작이다.
- `node landing/scripts/release.mjs`: 현재 패키지 **60개 실제 화면** 재촬영, README 홈 이미지 갱신, 사이트 빌드 및 데스크톱/모바일 검사, `landing/loxt-site-v2.9.0.zip` 생성. 예시 스크립트·모델·Live 상태는 소개용 UI 자료이며 실제 추론 성공 증거가 아니다.
- 기존 사용자 프로필·녹음·스크립트·메모·필기·모델·설정은 테스트 대상으로 사용하거나 변경하지 않았다. 테스트 프로필의 연결 서버는 종료 후 껐다.

증거: `test-results/release-2.9.0.log`, `test-results/ux-2.9.0/results.json`, `test-results/ux-2.9.0/*.png`, `test-results/memo-editing-2.9.0/result.json`, `test-results/site-release-2.9.0.json`, `landing/public/assets/screenshots.json`.

최초 샌드박스 실행의 로컬 TCP·junction·Electron 실행 실패는 환경 제약으로 분리하고 허용된 예시 실행에서 재검증했다. 이전 테스트의 승인 API 모의 응답은 새 세션 확인 흐름에 맞췄다. 초기 예시 라이브러리의 지연 쓰기와 이전/스냅샷 검증이 겹치던 테스트는 flushIndex 이후 실행하도록 고쳤다. DOM 여러 문법 토큰을 단일 요소로 조회하거나 상태 문구의 전체 문자열을 잘못 찾은 테스트 선택자도 수정했다. 이 실패를 앱 버그로 집계하지 않았다.

## 배포 준비

- 앱·설치 파일·사이트·README: **2.9.0**.
- 설치 파일: `release/stage5/LOXT-Setup-2.9.0-x64.exe`.
- 체크섬: `release/stage5/SHA256SUMS.txt`, 빌드 정보: `release/stage5/release.json`.
- 사이트: `landing/dist`, Production 업로드 ZIP: `landing/loxt-site-v2.9.0.zip`.
- 릴리스 문구: [release-2.9.0.md](release-2.9.0.md). Git 및 Production 절차: [RELEASE-WORKFLOW.md](RELEASE-WORKFLOW.md).
- 소스 push, GitHub 릴리스 업로드와 Cloudflare Production 게시는 실행하지 않았다. 다운로드 URL을 맞춘 것이 공개 파일의 존재를 증명하지 않는다.
- GitHub API 조회 당시 `v2.9.0`은 HTTP 404였다. 설치 파일을 해당 태그로 게시한 뒤 사이트를 배포해야 다운로드 링크가 작동한다.

## 아직 확인하지 않은 범위

실제 iPad/iPhone Safari·Apple Pencil·가상 키보드, 다른 Wi-Fi/방화벽 경로, 실제 30일 세션 경과, 실제 사용자 음성·GPU 추론과 ROS 런타임 실행은 이번 변경 검증에 포함하지 않았다. 기존 기능 보호의 자동 테스트와 예시 UI 검증 결과를 실제 장치/추론 성능 보증으로 해석하지 않는다. 연결 승인 대기 취소는 현재 모바일의 대기 중단이며 PC pending 요청은 기존 만료/거절 정책을 따른다.
