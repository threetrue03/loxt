# LOXT 1.10.0 — 테마 검증

2026-10-04, Windows / NVIDIA GeForce RTX 2060.

## 변경

- 설정 → 일반에 기존 드롭다운으로 다크 테마 / 라이트 테마 추가. 기존 다크가 기본값.
- 배치·SUIT·로고의 형태를 유지하고 색상만 테마 변수로 전환.
- Work / Live 전체에 즉시 적용하며 공유 설정을 appearance.json에 원자적으로 저장.
- 라이트에서는 차콜 로고, 옅은 회색 배경, 흰 패널, 어두운 글자와 상태 색 사용.
- 저장한 테마를 Electron 초기 창 배경·기본 창 테마·preload·시작 창에 적용.
- 사용자 녹음·모델·변환 설정의 경로와 데이터 형식 유지. 워크스페이스를 재마운트하지 않음.

## 실행한 검증

- `npm run test:release`: 44 / 44 통과. 테마 저장·재시작·잘못된 값·손상된 설정·저장 실패 후 복구 포함.
- `node scripts/theme-smoke.mjs`: 변경 전 앱에서 수집한 다크 색상·테두리·글꼴 기준과 일치. 실제 설정을 통한 Work / Live 공유·원래 로고 복원·기본 창 테마·작은 창·보관함 보존·재실행 확인.
- 같은 화면 검사에서 모델 메뉴·우클릭 폴더 이동·YouTube 오류·모델 다운로드 진행·스크립트 스켈레톤과 진행률·내보내기 토스트 확인. 다운로드와 변환 진행 화면은 테스트에서 상태 이벤트를 주입하여 검사했으며 실제 모델 다운로드를 수행한 검사는 아님.
- `node scripts/library-interactions-smoke.mjs --theme`: 테스트 음성을 실제 MediaRecorder로 녹음하면서 일반 설정에서 라이트로 전환. 녹음 유지·타이머 증가·일시정지·다른 페이지 이동·재개·WAV 디코딩·저장·버리기·기존 선택/드래그 동작 통과.
- `node scripts/live-smoke.mjs --theme`: 실제 RTX 2060 CUDA / large-v3-turbo로 Live를 시작하고 일반 설정에서 라이트로 전환. 실시간 스크립트 누적·녹음 유지·Work 대기열 조정·일시정지/재개·종료 후 화자 표시·WAV 길이와 스크립트 범위·재생/탐색·복사/내보내기·재실행 통과.
- `node scripts/ui-1.7-smoke.mjs`, `node scripts/home-smoke.mjs`: 기존 다크 UI의 카드·텍스트 선택·복사·화자 배지·모델 메뉴·Work / Live 보관함·홈·이력·반응형 동작 통과.
- `node scripts/splash-smoke.mjs` 및 `--light`: 두 테마의 로고 하나만 표시, 기존 1.5초 애니메이션, 자동 종료 확인.

실제 사용자 보관함은 수정하지 않았음. 녹음과 환경 설정은 모두 별도 테스트 프로필에서 생성. Live GPU 검사에 기존 설치된 엔진과 모델 파일을 재사용.

## 배포 실행본

`npm run package:installer`로 Windows 설치 파일 생성. 최종 `release/stage5/win-unpacked/LOXT.exe`에서 새 테스트 프로필로 테마 검사와 다크·라이트 시작 창 검사 통과. 포함된 모든 dist 파일이 최종 화면 빌드와 일치함을 확인. 기존 release-manifest 검사에서 Electron / Python / YouTube 도구 원본 일치, 앱 버전, 테스트 파일 제외 확인.

- 설치 파일: `release/stage5/LOXT-Setup-1.10.0-x64.exe`
- 크기: 155,810,413 bytes
- SHA-256: `a56405e30052f609d358e82767259232ee58556f008cf472f0873733a5471c75`

화면 캡처:

- `test-results/theme-jZ7yjs`: 최종 배포 실행본의 다크 / 라이트 화면과 메뉴.
- `test-results/library-interactions-ui-efZhXc`: 실제 Work 녹음 중 테마 전환.
- `test-results/live-smoke-NLeEX6`: 실제 Live GPU 녹음 중 테마 전환.
- `test-results/splash-50Knwf`, `test-results/splash-nGeS12`: 배포 실행본의 라이트 / 다크 시작 창.

시스템 테마 자동 전환, 설치 마법사의 별도 라이트/다크 디자인, 소개 사이트 수정은 이번 범위에 포함하지 않음.
