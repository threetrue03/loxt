# LOXT 2.4.0 최종 검증

- 회귀 테스트: 98개 통과 (`npm run test:release`).
- 최종 패키징 앱 + Edge의 PDF·메모·오디오 조각·재조회·종료 저장 검증 통과. 320·390·768px 다크/라이트 화면에 문서 전체 넘침 없음, 런타임 오류 없음.
- 별도 패키징 2.4.0 프로필에서 필기 미리보기와 7개 웹 탭 검증. HTTP SSE 6개 점유 중 WebSocket 조회 5ms, 7개 탭 쓰기 ACK 15ms. 해당 예시 환경의 관측값이며 Wi-Fi 속도 보증 아님.
- WebKit 26.6 엔진: 연결 주소 재입력, 승인/세션 유지, 메모 외부 갱신, 녹음 초안 복구, 구형 API/전체화면 대체 검증 통과. 실제 iPad Safari는 미검증.
- 약 91.29MiB·48쪽 합성 PDF: 모바일 원본 전송 0B, 핀치 중 페이지 유지·확대 후 렌더·전체화면·페이지 이동 검증 통과. 실제 사용자의 90MB PDF는 제공받지 않아 시험하지 않음.
- 소개 사이트: 44개 화면을 최종 앱의 별도 예시 프로필에서 촬영. 녹음 중 메모의 실제 저장도 확인. 임시 필기 미리보기·동기화 진단을 추가하고 결과 PNG를 직접 확인.
- 사이트 빌드·데스크톱/모바일 UI·이미지·FAQ·버전·다운로드 URL 검사 통과.
- 앱, 잠금 파일, 설치 매니페스트, 사이트 메타데이터, 스크린샷 매니페스트 모두 2.4.0.

## 산출물

- 설치 파일: `release/stage5/LOXT-Setup-2.4.0-x64.exe`
- 크기: 193,688,938 bytes
- SHA-256: `99600dcbac8870bd24bbe0a6c392cb7c39449df44d392fb0fad2394c2772a3d1`
- 앱: `release/stage5/win-unpacked/LOXT.exe`
- 사이트: `landing/dist`
- 배포 ZIP: `landing/loxt-site-v2.4.0.zip` (3,654,074 bytes)
- 릴리스 문구: `docs/release-2.4.0.md`
- 구현/측정 범위: `docs/implementation-2.4.0.md`

실제 사용자 녹음·메모·폴더·모델·설정을 수정하지 않았다. 로컬 준비만 완료했으며 자동 커밋·push·GitHub 릴리스 업로드·Cloudflare Production 게시를 하지 않았다. 공개 설치 파일 URL은 2026-10-09 HEAD 확인 시 404였다.

PC에 새 설치본을 설치한 다음 외부 기기의 LOXT 웹 화면을 새로고침해야 변경 사항이 적용된다. 기존 JSON 읽기는 유지하지만 신규 변경 기록을 읽으려면 2.4.0이 필요하다. 직접 보관함을 복사할 때 JSON과 `.journal`을 함께 보존한다. 앱의 폴더 ZIP 내보내기는 최신 내용을 합쳐 내보낸다.

## 게시 순서

1. `docs/RELEASE-WORKFLOW.md`의 Git PATH/commit/push 명령으로 소스와 README를 업데이트한다.
2. GitHub `v2.4.0` 릴리스에 설치 파일과 `docs/release-2.4.0.md` 문구를 업로드한다.
3. 공개 다운로드가 작동하는지 확인한다.
4. Cloudflare Pages Production에 `landing/dist` 또는 배포 ZIP을 업로드한다.

다운로드 주소는 `landing/release.mjs`의 `version`에서 구성된다. 현재 값은 `2.4.0`이다.
