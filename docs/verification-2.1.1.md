# LOXT 2.1.1 검증

기존 사용자 데이터를 변경하지 않고 별도 `test-results` 프로필과 예시 기록으로 검증했습니다.

## 변경 범위

- PC가 제공하는 `/web.html`의 승인 전 화면에 연결 주소 재입력 폼을 추가했습니다.
- 소개 사이트와 PC 웹은 같은 HTTPS 개인 네트워크 URL 검사를 사용합니다. PC 웹의 첫 연결은 `#pair` 토큰을 요구합니다.
- 주소 변경 시 이전 승인 대기 타이머·요청을 정리합니다. 같은 페이지의 hash 변경에도 새 연결 요청을 시작합니다.
- 서버의 QR 발급·PC 승인·쿠키·CSRF·Host/Origin 인증 정책은 변경하지 않았습니다.

## 확인

- `npm run test:release`: **82/82 통과**, `test-results/release-2.1.1.log`.
- Electron/WebKit UI 테스트: 일반 주소로 진입해 입력칸 표시 → 재접속 주소·잘못된 공개 주소·JavaScript URL 거부 → 만료 토큰 안내 → 새 주소 입력 → PC 승인 → 홈 표시 확인.
- 소스 및 최종 `release/stage5/win-unpacked/LOXT.exe`에서 Electron/WebKit UI 테스트가 통과했습니다. 최종 로그: `test-results/packaged-ui-2.1.1.log`.
- 주소 복사, 모바일 탐색, 테마, 기존 PDF·메모·녹음 초안 복구·승인 재접속을 함께 확인했습니다. WebKit 테스트는 실제 iPhone Safari 검증이 아니며, GPU 추론도 이번 수정에서 검증하지 않았습니다.

초기 UI 테스트에서 같은 페이지의 hash만 변경하면 문서가 다시 로드되지 않아 요청이 시작되지 않는 문제를 실제 재현했고 `hashchange` 처리 후 같은 시나리오가 통과했습니다.

## 배포 준비

- Windows 설치 파일: `release/stage5/LOXT-Setup-2.1.1-x64.exe`, 193,656,057 bytes. 설치 파일은 서명되지 않았습니다.
- SHA256: `cf8036bbc86ba39242ba5f0f8b4438e62ba870c06e58117a67f6fcb0c708b364`.
- `node landing/scripts/release.mjs` 완료: 별도 예시 프로필에서 현재 앱 화면 36개 촬영, README 홈 이미지 갱신, 사이트 빌드 및 320·390·768·1440px 레이아웃·이미지·다운로드 링크·주소 입력 검증 통과.
- 사이트 ZIP: `landing/loxt-site-v2.1.1.zip`, 3,089,336 bytes. 로그: `test-results/site-release-2.1.1.log`.
- `git diff --check` 통과.
- GitHub v2.1.1 설치 파일 URL 확인 결과 HTTP 404. 로컬 배포 준비만 완료했으며 GitHub 업로드·소스 push·Cloudflare Production 배포는 실행하지 않았습니다.

## 사용자 적용

연결 화면은 소개 사이트와 별도로 PC 앱이 제공합니다. PC 앱을 새 설치본으로 업데이트하고 웹 페이지를 새로고침해야 새 입력칸을 사용할 수 있습니다. PC 승인과 모바일의 인증서 신뢰는 계속 필요합니다.

원래 주소가 만료되면 PC 설정에서 새 연결 주소를 복사하세요. 이 수정은 일반 주소만으로 승인을 요청하는 기능을 추가하지 않습니다.
