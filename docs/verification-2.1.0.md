# LOXT 2.1.0 검증

기존 사용자 보관함과 설정 대신 `test-results` 아래의 독립 테스트 프로필·예시 데이터를 사용했습니다.

## 구현과 조건

- 좁은 모바일 웹(900px 이하) 하단 탐색, Work·Live 공통 적용, 상세 화면 탐색 숨김, 보관함 휴지통 접근.
- Windows 연결 주소 복사는 Electron 메인 프로세스의 비동기 클립보드 API를 사용합니다. 쓰기 완료와 실제 읽기 결과를 확인한 뒤 성공을 표시합니다. [공식 API 문서](https://www.electronjs.org/docs/latest/api/clipboard)
- 처음 연결 주소와 QR은 같은 5분 승인 토큰을 사용하고, 만료·사용 후 복사하면 새 토큰을 발급합니다. 토큰은 설정 파일이나 사이트 localStorage에 저장하지 않습니다.
- 사이트가 받는 주소는 HTTPS 개인 네트워크 주소만 허용합니다. 다른 프로토콜·공개 도메인·자격 증명·임의 경로·쿼리·잘못된 승인 토큰을 거부합니다.
- HTTPS·기기별 승인·쿠키·CSRF·Host/Origin 검사와 승인 취소를 유지합니다.

## 검증 기록

| 항목 | 결과와 근거 |
| --- | --- |
| 기존 기능과 새 URL·주소 수명 회귀 | `npm run test:release`: 82/82 통과. `test-results/release-2.1.0.log` |
| 실제 앱의 주소 복사 | 현재 패키징된 2.1.0 앱에서 버튼 클릭·성공 표시와 시스템 클립보드 텍스트 비교 통과. 테스트 후 원래 클립보드 텍스트 복원 |
| 웹 연결과 화면 | 현재 패키징된 앱과 WebKit 자동화에서 새 기기 승인, Work·Live 하단 이동, 390·768px 탐색 표시 및 1024px 사이드바, 다크·라이트 테마, 상세 탐색 숨김 통과 |
| 기존 모바일 기능 회귀 | PDF 렌더·기존 Safari API 호환 경로, 재접속 승인 유지, PC 변경 메모 반영, 녹음 초안 재로딩 통과 |
| 소개 사이트 | 320·390·768·1440px 넘침 없음, 설치본 예시 화면 34장, 다운로드 버전·이미지·FAQ 검사 통과 |
| 사이트 개인 PC 이동 | 잘못된 주소 거부, 연결 창 Escape 닫기, 첫 승인 URL로 이동, 승인 토큰 없는 재접속 주소 저장, 주소 변경·삭제 통과. LAN 페이지 이동은 Playwright 응답으로 대체하여 확인 |
| Windows 설치 파일 | `LOXT-Setup-2.1.0-x64.exe`, 193,652,514 bytes. 앱·설치본 2.1.0 일치 및 배포 아카이브 검사 통과. 코드 서명 없음 |
| 소개 사이트 배포 파일 | `landing/loxt-site-v2.1.0.zip`, 3,034,664 bytes. `node landing/scripts/release.mjs` 완료 |

근거: `scripts/connection.test.cjs`, `scripts/v2-ui-smoke.mjs`, `test-results/v2-ui/results.json`, `test-results/packaged-ui-2.1.0.log`. UI 캡처는 예시이며 실제 GPU 변환의 성능·정확도 증거로 사용하지 않습니다.

## 한계

이번 변경은 자동화된 Electron·Edge·WebKit 환경에서 검증합니다. 실제 iPhone/iPad의 새 하단 탐색과 소개 사이트 연결은 이번 버전에서 물리 기기로 다시 검증하지 않았습니다. 2.0.0에서 사용자가 확인한 Safari 필기·메모·녹음·GPU 변환 결과는 [이전 검증 기록](./verification-2.0.0.md)에 별도로 유지합니다.

인증서 설치·신뢰는 사용자가 기기에서 해야 하며 웹사이트가 이를 자동 처리하지 않습니다. PC가 종료되었거나 같은 네트워크가 아니면 연결되지 않습니다. 소개 사이트는 사용자 PC를 검색하거나 접속 전 상태를 조회하지 않습니다. 사이트 저장소를 차단·삭제하면 등록 주소를 다시 입력해야 합니다.

## 게시

GitHub 소스 푸시·릴리스 업로드·Cloudflare Production 배포는 자동 수행하지 않습니다. 설정된 다운로드 URL과 공개 설치 파일의 존재는 별개입니다.

2026-10-08 새 설치 파일 URL의 HEAD 확인 결과는 HTTP 404입니다. 릴리스 태그 `v2.1.0`에 설치 파일을 첨부한 뒤 사이트 Production 배포를 진행하세요.

설치 파일 SHA-256: `c3ba364ea1c92ddee7e9ae2a711b3261834ce0a17d65e78ca4d87e89d41b6597`

사이트 근거: `test-results/site-release-2.1.0.log`, `test-results/site-release-2.1.0.json`, `landing/public/assets/screenshots.json`.
