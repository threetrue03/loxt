# LOXT 2.0.0 검증 기록

검증일: 2026-10-08. 프로젝트의 실제 코드·별도 예시 보관함·Windows 실행 환경을 기준으로 기록한다. 기존 사용자 보관함은 변경하지 않았다. 화면 예시는 추론 성공이나 속도의 증거가 아니다.

## 실제 iPhone Safari 검증

같은 Wi-Fi의 비공개 테스트 서버를 연결하고 사용자가 직접 조작한 결과다. 정확한 iOS 버전은 제공받지 못했다.

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 인증서 설치·신뢰 → QR → PC 승인 → 홈 | 확인 | 사용자: “홈이 열림” |
| 메모 수정 | 확인 | 사용자: “메모는 잘 작성됨”, “메모는 문제없음” |
| PDF 펜 입력·다시 열어 저장 확인 | 확인 | 사용자: “필기가 되고 다시 열어도 유지됨” |
| 모바일 마이크 녹음의 PC 저장·변환 | 확인 | 약 3.55초 파일의 실제 완료 기록, device=cuda, model=large-v3-turbo, computeType=int8_float16 |
| 저성능·표준·고성능·medium 목록 | 확인 | PC 원본 모델을 예시 프로필에 읽기 전용 복사한 뒤 사용자: “모델 네 개·스크립트·재생 모두 정상” |
| 완료 스크립트·원본 재생 | 확인 | 같은 사용자 응답 |

녹음 내용은 검증 문서나 소개 사이트에 게시하지 않는다. 이 결과는 해당 환경에서 한 짧은 녹음의 성공 확인이며 일반적인 속도·정확도 벤치마크가 아니다. 처음에는 예시 프로필의 CUDA 실행 라이브러리 준비가 필요해 변환 전 다운로드 시간이 길었다. 모델 파일 설치와 실행 환경 준비 상태를 작업 목록에서 구분한다.

### Safari 오류의 원인과 수정

사용자가 제공한 스택은 PDF.js `getTextContent`에서 `undefined is not a function`이었다. PDF.js 6의 해당 구현은 ReadableStream의 async iterator를 사용한다. 레거시 빌드 전환만으로 실제 Safari 문제가 해결되지 않아, 공개 `streamTextContent()`의 `getReader()/read()`로 텍스트를 읽는 `src/pdfText.js`로 교체했다. 필기 포인터 처리에서 터치 입력을 허용하고 빈 종이의 SVG hit 영역과 그리기 모드 touch-action을 지정했다. 이후 사용자가 필기와 재열기 유지에 성공했다.

## 자동 검증

- `npm run test:release`: **80/80 통과**. Work·Live 분리, 변환 대기열, 모델, 휴지통/폴더, 메모 CAS, 패널, 내보내기와 신규 서버/PDF 검사.
- `scripts/v2-services.test.cjs`: 필기 revision 충돌, 원본 보존, 손상·암호화 PDF 거절, HTTPS CA 신뢰·SAN, PC 승인 전 차단, 다른 브라우저의 승인 토큰 탈취 방지, CSRF/Host 검증, 재시작 뒤 세션·포트 유지, 기기 해제, 기기별 실행 취소·오래된 메타데이터 거절.
- PDF 한글 내보내기는 텍스트 추출 결과로 “한국어 필기”를 확인했다. CropBox·90도 회전 메타데이터 유지, 원본/필기 JSON의 폴더 ZIP 포함도 검사했다. PDF 문서 리소스 정리는 PDF.js 6의 `loadingTask.destroy()`를 사용한다.
- `scripts/v2-ui-smoke.mjs --webkit`: WebKit 26.6에서 PDF 표시·펜·T 텍스트·페이지 패널·HTTPS 승인·새로고침 뒤 세션·원격 메모 갱신·IndexedDB 녹음 초안 복구를 검사한다. ReadableStream async iterator 및 일부 최신 API를 의도적으로 제거한 조건도 검사한다. **실제 Safari 검사와 구분한다.**
- WebKit의 IndexedDB Blob 저장 호환성 문제는 ArrayBuffer 저장으로 수정했다. 복구 시 Blob으로 합쳐 원본 파일을 제공한다. 자동 검사의 승인 타이밍과 Playwright 바이너리 결과 직렬화 문제는 테스트 자체를 수정했다.
- 설치본 화면·반응형·버튼 대비와 사이트 결과는 아래 최종 산출물 검증에 기록한다.

## U01–U09 반영

| ID | 변경 | 관련 코드 |
| --- | --- | --- |
| U01 | 녹음 상태·호버·포커스의 배경/문자 대비 정리 | `src/v2.css`, `src/RecordingPage.jsx` |
| U02 | 좁은 보관함 도구 모음 줄바꿈 | `src/v2.css`, `src/LibraryView.jsx` |
| U03 | 설정 탐색과 모델 행 최소 너비·텍스트 흐름 | `src/v2.css`, `src/SettingsSidebar.jsx` |
| U04 | 최종 중단 저장 → 밖의 버리기/단독 변환하기, 선택 창 내부 버리기 제거 | `src/RecordingPage.jsx`, `src/ConversionDialog.jsx` |
| U05 | 제목·뒤로·경로의 사용 가능 폭 제한 | `src/v2.css` |
| U06 | 스크립트 내보내기 주변 버튼과 크기 맞춤, 모바일은 터치 영역 유지 | `src/v2.css` |
| U07 | 모달이 헤더/로고까지 차광하고 배경 조작 차단 | `src/v2.css`, `src/App.jsx` |
| U08 | 조작 대상의 keyboard focus-visible 유지 | `src/v2.css` |
| U09 | 변환은 실행 색상, 버리기는 위험 동작 색상 | `src/RecordingPage.jsx`, `src/v2.css` |

## 저장·인증·배포 조건

- 모바일 연결은 기본 off, 승인 기기만 보관함 접근. 세션 토큰은 PC에서 해시 저장, 쿠키 HttpOnly/Secure/SameSite, 변경 요청 CSRF 검증, 로컬 주소/Host/Origin 검사.
- 원본·메모·필기는 공유 Library의 쓰기 큐와 revision으로 보호한다. 클라이언트가 임의 PC 파일 경로나 쉘을 지정할 수 없다.
- 미완료 모바일 음성은 호스트별 임시 IndexedDB에 보관하며 확인된 완료/버리기 때 제거한다. PC 원본을 조용히 덮어쓰지 않고 복구 사본을 만든다. 128 MB 한도와 브라우저 저장 공간/삭제 정책이 적용된다.
- PDF.js·폰트·worker·CMap·WASM을 설치본에 포함해 CDN에 의존하지 않는다. Noto Sans KR의 공식 OFL 고지를 `public/pdf-font-LICENSE.txt`, `docs/licenses/NotoSansKR-OFL.txt`에 포함한다. [공식 고지](https://github.com/google/fonts/blob/main/ofl/notosanskr/OFL.txt)
- 패키징의 라이선스 수집은 Windows에 실제 설치하지 않는 다른 플랫폼 optional 패키지만 건너뛴다. 설치되는 패키지의 원문은 계속 포함한다.

## 남은 검증 범위·알려진 제한

- 실제 iPad Apple Pencil 압력·손바닥 거부, iPad 외장 키보드, 모든 iOS/Safari 버전은 미검증. 마우스/터치/펜 입력 경로는 구현했으나 해당 기기 성능을 보장하지 않는다.
- Windows 실제 OS 화면 배율 변경은 미검증. 자동 검사는 Electron 줌 150%와 창/분할 폭으로 구분한다.
- 모바일 새 Live 녹음·로컬 GPU 실행·백그라운드 지속 녹음·인터넷 원격 접속·네이티브 iOS/macOS/Linux 배포는 범위 밖.
- 매우 긴 녹음, 모든 손상 PDF, 저장 공간 소진·네트워크 기기 격리의 실기기 조합을 모두 시험하지 않았다. API 한도/오류 처리와 원본 보존 검사는 정상 실제 기기 검증을 대체하지 않는다.
- 의존성 audit 기록 `test-results/v2-audit.json`: low 2 / moderate 8 / high 2 / critical 0. node-forge의 RSA 서명 검증 경로는 앱에서 사용하지 않으며 인증서 생성 키는 Node crypto를 사용한다. 빌드 다운로드 의존성·편집기 전이 의존성에도 경고가 남아 있어 “취약점 없음”으로 표기하지 않는다. 이는 전체 보안 감사나 인터넷 공개용 인증 서비스 검증이 아니다.
- 기존 Live 속도·정확도 및 모델 구성 개편은 하지 않았다. PDF에 원본 스크립트를 실행하는 기능이나 OCR은 넣지 않았다.

## 최종 산출물 검증

- 최종 설치본 화면 검사: 180개 Work/Live·테마·창·분할·Electron 150% 줌 조합, clipped=[] 및 가로 넘침 0. 코드 변경 없이 같은 배치를 유지한다.
- 녹음 버튼 검사: 24가지 상태·테마·기본/호버/키보드 조합, 대비 최소 5.47:1. 중단 뒤 장치 화살표와 창 내부 버리기 제거 확인.
- PDF 이미지 검사에서 가변 글꼴 부분 포함은 한글 추출만 정상이고 실제 글자가 누락되는 문제가 발견됐다. LOXT PDF Sans를 Noto Sans KR weight 400에서 정적화하고 GSUB 대체를 제거해 공백의 잘못된 Unicode 매핑을 수정했다. PDF에는 전체 글꼴을 포함한다. 글꼴이 필요한 내보내기는 파일 크기가 증가한다.
- `scripts/v2-pdf-export-render.mjs`는 실제 내보낸 PDF를 PNG로 렌더링하며 제목의 검은 픽셀 분포·폭과 한글 텍스트 추출을 모두 검사한다. `test-results/v2-pdf-render/annotated.png`를 직접 확인했다.
- 최종 확인: `release/stage5/LOXT-Setup-2.0.0-x64.exe` (193,651,208 bytes), SHA-256 `c295165bbe5c79fd44767d1f09da867e1c978d4c76d5129d7cd5f08689d0ef93`. 서명된 설치 파일로 표기하지 않는다.
- 마지막 패키징에서 renderer·electron·shared·Python 파일을 소스와 비교하고 production archive를 검사했다.
- 최종 설치본 PDF·개인 기기 연결 설정 및 WebKit 세션·메모 갱신·녹음 초안 복구 검사 통과. `test-results/v2-ui/results.json`, `test-results/v2-webkit-packaged.log`.
- 최종 설치본 중단→원본 보존→변환 창 닫기→Work/Live 이동→변환 요청 1회→버리기 흐름 통과. 가상 마이크/추론 요청 가로채기 검사이며 실물 녹음·GPU 성공 증거는 아니다. `test-results/recording-review-2.0.0/packaged.json`.
- `node landing/scripts/release.mjs` 완료: **31장** 실제 패키징 앱/모바일 화면 크기 예시, README 홈 이미지, 버전 2.0.0, 사이트 build·390/768/1440px overflow/이미지/FAQ/URL 검사 통과, `landing/loxt-site-v2.0.0.zip` 생성.
- 모바일 소개 이미지는 Edge 390px viewport에서 촬영했으며 실제 iPhone 캡처라고 표시하지 않는다.
- GitHub 2.0.0 설치 파일 URL의 읽기 전용 HEAD 확인은 **HTTP 404**였다. 로컬 자료만 준비했고 소스 push·릴리스 업로드·Cloudflare 게시를 실행하지 않았다.
- 테스트 보관함·인증서·세션·모델 복사본·브라우저 런타임은 `test-results/`, `.runtime/`에 있고 Git ignore 대상이다. 기존 사용자 자료는 보존한다.

검증 완료 후 별도 예시 서버의 hostId를 확인하고 연결 설정을 꺼 정상 종료했다. 테스트 기록·모델·인증서는 복구용으로 보존했으며 실제 사용자 설정은 변경하지 않았다. 설치 후 개인 보관함의 연결은 설정 → 내 기기 연결 안내를 새로 사용한다.
