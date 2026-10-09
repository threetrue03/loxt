# LOXT 2.2.0 검증 기록

2026-10-09 · 최종 실행본: Windows x64, 별도 예시 프로필. 기존 사용자 녹음·스크립트·폴더·메모·모델과 설정은 테스트 대상으로 사용하지 않았다.

## 통과한 검증

| 검증 | 결과 | 근거 |
| --- | --- | --- |
| 서비스 회귀 | 87/87, 실패 0 | `test-results/implementation-2.2.0/services-final.log` |
| 최종 패키지 | 앱/설치 버전 2.2.0, renderer/Electron/shared/Python/YouTube 포함 내용 일치 | `scripts/release-manifest.mjs`, `release/stage5/release.json` |
| 실제 패키징 앱 + Edge 웹 | 완료, JavaScript 오류 0 | `test-results/implementation-2.2.0/ui-results.json` |
| PDF 입력 | 점·드래그 지우개·undo·텍스트 작성과 Esc 취소·8개 검색 결과 강조/이동 | 같은 결과 JSON |
| 제목 | 외부 PDF/메모 제목 갱신, 변경 없는 blur가 새 제목을 덮어쓰지 않음 | 같은 결과 JSON + 서비스 CAS 테스트 |
| 저장 | 연속 12획을 입력하는 중에 PC 필기가 갱신됨. 마지막 변경 직후 정상 종료한 앱을 다시 읽어 필기 보존 확인 | 같은 결과 JSON |
| 복귀 | visibilitychange로 현재 상태 재조회 확인 | `foregroundResync: true` |
| 모바일 크기 | 320/390/768px, 다크·라이트, 긴 제목에서 페이지 넘침 없음, 문서 너비 맞춤 유지 | 같은 결과 JSON의 `screens` |
| PDF 핀치 | 문서 폭 340→582.84375px, 브라우저 visualViewport 배율 1→1 | Edge CDP 두 포인터 입력; 실제 Safari 측정 아님 |
| WebKit | 연결 주소 재입력·승인·세션 재접속·모바일 탐색·PDF·메모 갱신·녹음 초안 재로딩 통과 | `test-results/v2-ui/results.json` |
| 오래된 Safari API 대체 경로 | stream async iterator와 최신 배열/iterator API를 제거한 환경에서도 PDF 통과 | WebKit 26.6 자동화; iOS 실기기 아님 |
| 녹음 임시 저장 | v1→v2 이전·조각 순서·중복 재시도·호스트 분리·삭제 통과 | `test-results/implementation-2.2.0/journal-results.json` |
| 녹음 재로딩 | 1MB 조각 4개를 체크포인트 후 재로딩, 총 4MB·순서 [1,2,3,4] 보존 | 실제 웹 결과 JSON; 가상 바이트이며 음성 추론 증거 아님 |
| 소개 사이트 | 38장 실제 패키지 예시 캡처, 320/390/768/1440px·테마·다운로드 링크·이미지 검사 통과 | `test-results/implementation-2.2.0/site-release.log`, `landing/public/assets/screenshots.json` |
| ZIP | index.html과 assets/가 최상위에 있음 | `landing/loxt-site-v2.2.0.zip` |

## 성능 측정

Windows, AMD Ryzen 7 4800H, 프로젝트 아래 별도 예시 보관함. 1,000개 녹음 × 각 100개 구간. 서비스 직접 호출 각 5회 중앙값으로, 실제 Wi-Fi/iPad나 GPU 추론을 측정한 것이 아니다.

| 항목 | 2.1.1 조사 | 2.2.0 | 해석 |
| --- | --- | --- | --- |
| 메모 본문 저장 요청 | 431.82ms | 18.5ms | 새 경로는 본문 내구 저장 응답. 목록 인덱스 기록은 별도 처리 |
| PDF 본문 저장 요청 | 394.17ms | 12.95ms | 메타데이터 큐 대기를 본문 응답과 분리 |
| 목록 생성 | 71.00ms | 0.49ms | 전체 스크립트 복제 대신 짧은 목록 |
| 목록 응답 | 약 13.35MB | 1.30MB | 별도 상세 조회에서 전체 스크립트 제공 |
| 인덱스 파일 | 약 18.85MB | 1.86MB | 본문 note.json은 그대로 보존 |
| 이벤트 루프 최대 지연 | 449.05ms | 21.25ms | 이 예시 작업 루프에서만 측정한 최댓값 |

단순 소형 문서의 웹 입력→PC 본문은 300, 302, 290ms였다. 이전 조사도 소형 문서는 290–313ms였으므로 이 수치를 소형 문서 전체가 수십 배 빨라졌다는 주장으로 쓰지 않는다. 이번 효과는 큰 보관함의 전역 처리 비용과 연속 필기 저장 누락에 집중된다.

인위적인 전역 큐 대기 1,500ms를 주입했을 때 본문 저장 16.21ms, 목록 0.31ms였다. 실제 파일 가져오기나 GPU 지연의 측정치는 아니다. 연속 필기는 입력이 모두 끝나기 전에 PC가 갱신됐으며, 획 미리보기를 매 포인터 이벤트마다 전송하는 공동 편집 기능은 아니다.

원시 벤치마크: `test-results/implementation-2.2.0/backend-results.json`. 정상 종료와 저장 플러시 확인은 약 356ms로 완료했다.

## 산출물·공개 상태

- 설치 파일: `release/stage5/LOXT-Setup-2.2.0-x64.exe`, 193,667,236바이트.
- SHA-256: `ed510b8aa7eda879e8f2996f2b560a8c117b9000b3d40c03eb2a0ffe7600b661`.
- `release/stage5/SHA256SUMS.txt`와 `release.json` 생성 완료. 설치 파일은 코드 서명되지 않았다.
- 사이트 ZIP: `landing/loxt-site-v2.2.0.zip`, 실제 캡처 38장.
- 릴리스 문구: `docs/release-2.2.0.md`.
- README·사이트·다운로드 URL 기준은 2.2.0이다. 게시 준비 URL: `https://github.com/threetrue03/loxt/releases/download/v2.2.0/LOXT-Setup-2.2.0-x64.exe`.
- 위 공개 파일은 HEAD 확인 시 HTTP 404였다. 로컬 준비 완료와 공개 게시 완료를 구분한다. Git commit/push, Release 업로드, Cloudflare 게시를 실행하지 않았다.

## 검증 과정에서 수정한 시험 문제

초기 패키지 검사에서 아카이브 내용 불일치가 발생해 소스 변경을 마친 뒤 다시 생성했고 최종 일치 검사를 통과했다. 초안 시험은 활성 녹음을 복구 목록에 표시하지 않는 정책을 반영해 재로딩 뒤 검사하도록 수정했다. 종료 검증의 PDF 서비스 함수 이름과 시험 변수 충돌을 고쳤다. 처음 WebKit 실행은 테스트 엔진 미설치로 중단되어 별도 테스트 폴더에 설치 후 통과했다. 이러한 초기 시험 중단을 앱에서 실제 재현된 기능 실패로 기록하지 않는다.

## 이번에 새로 검증하지 못한 범위

- 실제 iPhone/iPad Safari에서의 핀치, Apple Pencil 필압·손바닥 거부, 키보드 표시/화면 회전.
- 실제 Wi-Fi 단절·장시간 저속 연결·다중 탭에서의 SSE 역압 부하.
- 큰 이미지 PDF·수만 획 문서의 실기기 FPS·배터리·메모리.
- 실제 마이크·음소거 시스템 루프백·GPU 음성 추론·화자 정확도. 기존 기능 테스트가 이번 실기기 실측을 대신하지 않는다.
- 설치/복구/삭제의 Windows 관리자 UI를 새로 자동 설치해 검증하지 않았다. 패키지 생성·내용 검증과 기존 서비스 테스트를 수행했다.

예시 Live 스크립트·무음 오디오·가상 바이트·화면 캡처는 변환 성공·정확도·속도의 증거로 사용하지 않았다.
