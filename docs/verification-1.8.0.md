# LOXT 1.8.0 검증

검증일: 2026-10-04. Windows x64, 별도 테스트 보관함 사용.

## 결과

- `npm run build`: 통과.
- `npm run test:release`: 기존 보관함·폴더·휴지통·대기열·Live·타임스탬프 등 37개 통과.
- `node scripts/home-smoke.mjs`: 빈 보관함 안내, Work·Live 시작 동선, 전체 기록 이동, 최근 열람 순서·최대 4개·저장 및 분리, 삭제한 기록 제외, 폴더·작업 이동, 실제 진행률, 860×640 화면의 가로 넘침 없음 확인.
- 같은 홈 검사를 최종 `release/stage5/win-unpacked/LOXT.exe`에서 다시 통과. JavaScript 오류 0개. 결과와 스크린샷: `test-results/home-ui-EUxJ9y/`.
- `node scripts/ui-1.7-smoke.mjs`: 카드 클릭·스크립트 영역 제외, 복사 완료 버튼, 화자 배지, 모델 메뉴 폭·분류, Live 보관함 보기·정렬 통과. 결과: `test-results/ui-1.7-yGPGj1/`.
- `node scripts/library-interactions-smoke.mjs`: 폴더 이름 편집·중첩 폴더, 카드·폴더 분리, 영역 선택·그룹 드래그, 실제 녹음 중 홈 이동·일시정지·재개·저장·버리기 통과. 결과: `test-results/library-interactions-ui-7Qh1nq/`.
- 홈 검사의 진행률·대기열 표시는 주입한 테스트 상태로 확인했다. 실제 녹음 검사는 가상 마이크의 WAV 입력을 사용했다. GPU·화자·출력 장치 엔진에는 이번 변경이 없으며 기존 1.7.0 검증 기록은 보존한다.

## 설치 파일

- `release/stage5/LOXT-Setup-1.8.0-x64.exe`
- 138,339,885 bytes
- SHA-256: `b185c7a588835aeee0e47fac8a6b7db585d5e4c6f1d6d003451cbb6cea7a2cf3`
- 앱·잠금 파일·설치 프로그램 버전 일치 및 패키지 소스 일치 검사 통과. 테스트 보관함과 스크린샷은 배포 앱에서 제외한다.

기존 원본·스크립트·폴더·모델·설정 저장 방식은 유지한다. 홈 열람 이력만 Work·Live별 버전 1 로컬 저장소에 추가하고, 현재 보관함에 없는 기록과 휴지통 기록은 표시하지 않는다.
