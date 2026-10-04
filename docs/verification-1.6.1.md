# LOXT 1.6.1 검증

검증일: 2026-10-04

## 결과

- Vite 배포 빌드 성공. SUIT와 기존 차콜 UI를 유지했다.
- `npm run test:release`: 36개 통과. Live 모델 준비와 실제 녹음 시작 분리, 준비 중 오디오 저장 거부, 모델 변경, 실패 재시도, 다운로드 이벤트 전달을 포함한다.
- `scripts/library-interactions-smoke.mjs`: 실제 Electron에서 카드/작은 카드의 폴더 분리, Work 제목 너비·타이머, 버리기/변환하기 위치, 선택 영역과 그룹 드래그, 녹음 중단·페이지 이동·재개·원본 저장·버리기를 확인했다.
- `scripts/workspace-switch-smoke.mjs`: Work/Live 저장소 분리, Work 녹음 중 워크스페이스 전환, 숨겨진 Work 대기열 이벤트, 탐색·사이드바·모드 재실행 유지 통과.
- `scripts/recording-ui-smoke.mjs release/stage5/win-unpacked/LOXT.exe`: 배포본의 로고 테두리 제거와 선택 체크/호버, Live 제목 길이, 하단 모델/시작 버튼 정렬, 최소 860×640 창, 준비 중 무오디오 입력, 실패·재시도, 토스트 2.5초 확인. 준비 42%/불러오는 중/실패 이벤트는 UI 검증을 위해 테스트 프로세스에서만 주입했다.
- `scripts/live-smoke.mjs release/stage5/win-unpacked/LOXT.exe`: 실제 RTX 2060 CUDA와 표준 모델로 준비 완료 후 두 번째 클릭에서 녹음 시작. 준비 중 파일·시간·파형 미작동, 모델 변경 시 준비 해제, 페이지 이동 중 녹음, Work 대기열 유지, 일시정지 제외, WAV/스크립트 경계, 재생·구간 이동·복사·내보내기·재실행 통과.
- 실제 배포본 GPU 검사: 9.490625초 원본, 확정 구간 2개, JavaScript 오류 0개. 모델 캐시를 재사용했으며 이번 실제 GPU 검사에서 새 모델 다운로드는 수행하지 않았다.
- 테스트 기록·설정은 `test-results`의 별도 프로필에 저장했다. 실제 보관함의 녹음·스크립트·설정은 변경하지 않았다.

## 증거 위치

- Work UI: `test-results/library-interactions-ui-e11IpB/`
- 워크스페이스: `test-results/workspace-switch-HwieBo/`
- 배포본 UI: `test-results/recording-ui-EHgEJy/`
- 배포본 GPU: `test-results/live-smoke-Bx0SlP/result.json`

## 설치 파일

- `release/stage5/LOXT-Setup-1.6.1-x64.exe`
- 크기: 138,328,527 bytes
- SHA-256: `06a72d658c5bd77d96fb3d8c3c72cb58c817877cc545a146622129933f0386b8`
- 배포 압축 안의 버전, Electron 코드, Python 코드와 소스의 일치를 검사했다.

출력 장치 자동 추적과 화자 분리는 각각 후속 설계 문서에만 기록했다.
