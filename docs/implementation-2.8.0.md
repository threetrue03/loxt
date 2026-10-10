# LOXT 2.8.0 구현·검증 보고서

대상: `docs/ux-audit-next.md`의 C01–C07, I01–I10, F01–F08, M01–M05. 기존 SUIT, 차콜/라이트 테마, 보관함과 문서 형식을 유지하면서 승인된 개선을 적용했다. 조사 당시 2.7.0의 결과는 원본 보고서에 남기고 아래에 구현 결과를 구분한다.

## 변경 범위

| ID | 적용 내용 | 검증·한계 |
| --- | --- | --- |
| C01 | 세션 재확인, 승인 필요·서버 불가·다른 PC 상태 분리. 열린 문서를 유지하며 같은 origin에서 명시적 PC 재승인 후 CSRF/소켓 갱신 | private HTTPS 웹에서 메모·필기 보존 → 재승인 → PC 저장 |
| C02 | 미연결 RPC는 즉시 안내. 재연결 시 실패한 본문 저장 재개, revision 충돌이면 초안 보존 | 단위 경계 및 실제 오프라인·재접속 저장 검증 |
| C03 | 주소 변경 전 사본 안내. 메모·필기 JSON과 녹음 원본 개별 다운로드, 같은 PC로 사본 가져오기 | 다른 PC 사본 거절, 새 문서 생성·원본 불변. 원본 PDF/첨부파일이 PC에 필요 |
| C04 | 공개 복구 shell만 Service Worker에 저장. PC 서버 중지 후 다시 여는 화면에서 주소 입력·초안 다운로드 | HTTPS Chromium 실제 cold launch. 실제 iOS standalone과 저장 공간 회수 상황은 미검증 |
| C05 | 로고를 가리는 pseudo banner 제거, DOM status와 연결 관리·오류·다음 행동 제공 | 320px·낮은 가로 화면 양 테마 UI 검사. 실제 스크린리더 청취는 미검증 |
| C06 | 거절된 요청을 제한 시간 보관해 거절 안내, 중복 승인 멱등 처리 | private 서버의 거절·만료·승인 경계 회귀 |
| C07 | 유효 기기만 승인 한도에 계산, 만료 상태·유효 기간 표시와 해제 유지 | 만료된 20개 장치 fixture와 실제 승인 검증 |
| I01 | 선택된 제공처·고정 revision 존중. 전체 모델 디렉터리 staging·검증·commit·복구 기록 | Python/앱 복구 회귀. 실제 대용량 다운로드 성공을 fixture로 주장하지 않음 |
| I02 | 검증 manifest와 실제 해시가 일치한 모델은 네트워크 없이 재사용 | 오프라인 검증·손상 파일 회귀 |
| I03 | 모델 staging·runtime 복사 대상 공간과 환경의 최소 여유 기준 확인 | 공간 부족 대역 검사. 전체 설치 용량 확정치가 아니며 별도 pip/TEMP 드라이브 예약은 후속 확인 필요 |
| I04 | 준비 중단·나중에 준비·설치된 앱 보존의 의미를 분리 | 설치 helper/화면 검증 범위는 아래 설치 보고서 참조 |
| I05 | 측정 가능한 다운로드만 % 표시. 검사·로딩·lock 대기 활동과 실제 재시도 안내 | 상태 이벤트·재시도 대역 검사 |
| I06 | 초기화 실패도 구조화 오류로 처리, 원인·대응·로그 열기/복사 제공 | 권한·네트워크·공간 부족 오류 fixture |
| I07 | 앱 갱신과 선택 모델 검사 범위 구분, 유효 환경 fingerprint 재사용 | 준비 재사용·deep check 회귀. 실제 설치 시간 개선은 측정하지 않음 |
| I08 | 설치 화면의 긴 안내·에러·경로 배치를 보강하고 잘린 용량 문구 수정 | 실제 한·영 custom page 96 DPI 검사. 150/200%·키보드·전체 설치·수리·삭제 VM 검증은 별도 필요 |
| I09 | 공식 배포 경로·미서명 상태·SHA-256 비교 안내 및 해시 산출물 | 정식 Authenticode 인증서가 없어 서명은 적용하지 못함. 체크섬은 서명 대체가 아님 |
| I10 | 저성능·표준·고성능/변환 명칭과 한국어·영어 사용자 안내 정리 | 번역·로그·NSIS 검증. 내부 파일명·기존 사용자 경로는 바꾸지 않음 |
| F01 | 폴더 경로와 기록 ID payload를 구분, 동일 이동/휴지통 확인 흐름 | Work·Live 사이드바 실제 이동·휴지통 회귀 |
| F02 | 녹음 버리기 범위 확인 후 원본과 연결 메모를 휴지통 이동 | 실제 디렉터리·본문 보존과 복구 검증 |
| F03 | 시스템 scope와 사용자 폴더 경로 분리, 기존 탭 호환 | `library` 사용자 폴더·검색·탭 상태 검사 |
| F04 | 제목 dirty/saving/failure를 본문 저장 상태와 합쳐 표시. 저장 실패 시 뒤로 이동 차단 | 빠른 수정·비동기 응답·재시도 실제 UI |
| F05 | 탭 ARIA 연결, roving tabindex, 방향키/Home/End, 닫은 후 인접 탭 포커스 | 실제 키보드·닫기 회귀 |
| F06 | IPC prefix를 정리한 원인, 상세와 재시도 제공 | 강제 실패 예시 UI·재시도 검사 |
| F07 | Work 녹음 중 새 녹음·불러오기·YouTube 진입점의 비활성 일치 | 가상 마이크 예시 녹음, 양 진입점 확인 |
| F08 | 기본 선택 역할과 실제 설치 상태를 구분 | 미설치 기본 모델 예시 UI |
| M01 | PDF 좌표와 텍스트 편집 UI를 분리, viewport/키보드 안으로 제한 | 네 모서리×양 테마, 저장 좌표 불변 |
| M02 | 회전·resize·visual viewport·앵커에 따라 옵션 재배치, observer/RAF 정리 | 회전·높이 감소·Tab/Esc·전체화면 UI |
| M03 | 좁은 재생바의 속도/원본 관리 영역을 별도 행으로 배치 | 390px 양 테마 버튼 가독성·크기 |
| M04 | coarse 입력의 작은 버튼에 44px 조작 영역 확보 | 대표 장치·보기·정렬·페이지·뒤로 버튼 측정 |
| M05 | 낮은 가로 화면의 메타를 접근 가능한 문서 정보로 묶고 공간 축약 | 568×320 PDF본문32→105px, 메모본문121→207px |

## 초안 복구 동작

이전 주소의 localStorage/IndexedDB를 새 origin에서 읽을 수 있는 것으로 가정하지 않는다. 사용자가 이전 화면에서 사본을 내려받고, 새 연결에서 같은 PC의 승인과 파일 검증을 거쳐 가져온다. 메모·필기 사본은 새 UUID 문서를 만들며 기존 revision을 강제로 덮어쓰지 않는다. 메모 첨부파일은 PC의 원본 첨부파일을 찾아 한 번에 한 파일씩 복사한다. PDF 사본은 PC 원본을 사용하고 필기를 별도로 저장한다. 녹음 원본은 JSON에 포함하거나 자동으로 메모리에 합치지 않고 사용자가 개별 다운로드한다.

Service Worker는 공개 복구 HTML·스크립트·스타일·SUIT·로고만 보관한다. API 응답, 세션, 모델, 원본 문서·오디오와 앱 화면은 이 캐시에 저장하지 않는다. 이미 사용하던 브라우저의 초안 저장소는 기존 방식대로 유지한다. HTTPS와 브라우저 지원·보관 공간이 필요하며 처음 방문 전 오프라인 실행이나 저장 공간 삭제 후 복구를 보장하지 않는다. 구현 근거: [MDN Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [MDN CacheStorage](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage).

## 검증 기록

- 원래 회귀와 F/M 신규 회귀: `test-results/implementation-2.8.0-release.log`. 초기 sandbox의 임시 파일 rename/hardlink·localhost TCP 차단은 실행 환경 실패로 분리하고, 예시 프로필의 정상 권한 검사로 재실행했다.
- 작업 흐름: `test-results/implementation-2.8.0/flow/results.json`, [세부 결과](implementation-2.8-flow.md).
- 문서 모바일: `test-results/mobile-documents-2.8.0/results.json`, [측정 조건](mobile-documents-verification-2.8.0.md).
- 연결: `scripts/connection-recovery-2.8.test.cjs`, `scripts/connection-recovery-2.8.test.mjs`, [실제 UI 결과](implementation-2.8-connection-ui.md).
- 설치: [helper·NSIS 검증과 범위](implementation-2.8-installer.md).
- 최종 패키지·사이트 결과는 아래 기록과 분야별 보고서를 참고한다.

## 최종 릴리스 검증

2026-10-10 승인 범위의 로컬 준비를 완료했다. 기존 사용자 프로필 대신 테스트가 만든 private profile만 사용했다.

| 검사 | 결과 | 근거 |
| --- | --- | --- |
| 전체 Node 회귀 | 171/171, 실패·건너뜀0 | `test-results/implementation-2.8.0-release.log` |
| 최종 패키지 작업 흐름 | 8/8, 런타임 오류0 | `test-results/implementation-2.8.0/flow-packaged.log` |
| 최종 패키지 연결 복구 | 20/20, 오류0 | `test-results/connection-recovery-2.8.0/results-packaged.json` |
| 최종 패키지 모바일 문서·녹음 UI | 28/28, 오류0 | `test-results/mobile-documents-2.8.0/results-packaged.json` |
| Python 설치 helper | 20/20 | `test-results/implementation-2.8.0/installer/helper-regression.log` |
| 실제 NSIS custom page | 한·영8/8, 96 DPI | `test-results/implementation-2.8.0/installer/nsis-results.json` |
| 패키지 일치 | 버전·renderer·Electron/shared·Python·YouTube 구성요소 일치 | `test-results/implementation-2.8.0/package-final.log` |
| 소개 사이트 | 실제 앱 예시57장, 390/768/1440px·이미지·테마·FAQ·연결·다운로드 링크 검사 통과 | `test-results/implementation-2.8.0/site-release.log` |
| 배포 ZIP | 루트 `index.html`, `assets/`65개 확인 | `landing/loxt-site-v2.8.0.zip` |
| Git diff | `diff --check` 종료0 | `test-results/implementation-2.8.0/git-diff-check.log` |

화면 확인에서 새 연결 표시가 모바일 재생 슬라이더와 녹음 제어를 가리는 회귀를 발견했다. 해당 화면에만 하단 공간을 확보한 뒤 패키지에서도 겹침0을 확인했다. PDF·메모의 낮은 가로 화면 공간은 유지한다. 이전 실패·화면은 분야별 테스트 폴더에 남겼다.

설치 파일: `release/stage5/LOXT-Setup-2.8.0-x64.exe`, 194,441,249 bytes. Windows 파일/제품 버전 모두2.8.0이고 `Get-AuthenticodeSignature` 결과는 `NotSigned`다.

```text
0e8c3ae1cb19763ce2ca41ac7c942105e3f3b90c356ba869ef2f53a3d5be160c  LOXT-Setup-2.8.0-x64.exe
```

동일 값은 `release/stage5/SHA256SUMS.txt`와 `LOXT-Setup-2.8.0-x64.exe.sha256`에 있다. 사이트 ZIP은5,231,052 bytes이며 `test-results/site-release-2.8.0.json`의 `externallyPublished=false`를 유지했다. README 홈 스크린샷과 사이트의 재승인 화면도 새 패키지에서 갱신했다. 예시 오디오·스크립트·Live 상태는 추론 정확도/속도 증거가 아니다.

GitHub API의 `releases/tags/v2.8.0` 읽기 확인은404였다. 공개 릴리스·설치 파일 업로드와 Cloudflare Production 배포는 수행하지 않았다. [게시 순서와 PowerShell 명령](RELEASE-WORKFLOW.md)에 따라 별도로 게시해야 다운로드 URL이 실제 설치 파일을 제공한다.

## 남은 검증·외부 준비

실제 iPhone/iPad Safari와 홈 화면 실행, 한글 가상 키보드·Apple Pencil, Windows VM의 전체 설치·수리·제거, 물리 장치·실제 모델/GPU 성능은 이번 fixture·Chromium UI 검증과 구분한다. 정식 코드 서명은 인증서 확보 뒤 적용해야 한다. GitHub 릴리스 업로드와 Cloudflare Production 게시 전에는 공개 다운로드가 준비됐다고 주장하지 않는다.
