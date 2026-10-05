# LOXT 소개 페이지 — 1.13.0

React + Vite로 만든 소개·다운로드 페이지입니다. 기존 차콜 색상과 SUIT 글꼴을 유지하고 LOXT 1.13.0의 실제 앱 화면을 사용합니다.

브랜드 문구: **LOXT — Local Speech-to-Text powered by your own hardware.**

## 로컬 실행

프로젝트 루트에서 실행합니다.

```powershell
cd landing
npm install
npm run dev
```

개발 서버: http://127.0.0.1:5180/

다운로드 버튼은 아래 GitHub Releases의 설치 파일에 직접 연결합니다.

https://github.com/threetrue03/loxt/releases/download/v1.13.0/LOXT-Setup-1.13.0-x64.exe

개발 서버의 `/downloads/LOXT-Setup-1.13.0-x64.exe`는 로컬 설치 파일 확인용 경로이며 공개 다운로드 버튼에서는 사용하지 않습니다.

## 빌드와 배포

```powershell
npm run build
npm run preview
```

배포 파일은 `landing/dist`에 생성됩니다. 설치 프로그램을 웹사이트에 포함하지 않고 GitHub Releases에서 내려받도록 연결합니다.

Cloudflare Pages의 **loxt → Create deployment → Production**에서 다음 중 하나를 업로드합니다.

- 폴더: `landing/dist`
- 배포 ZIP: `landing/loxt-site-v1.13.0.zip`

ZIP 최상위에는 `index.html`과 `assets/`가 있습니다. 로컬 빌드만으로 공개 사이트가 변경되지는 않으며, Production 업로드 후 반영됩니다.

ZIP을 다시 만들려면 프로젝트 루트에서 실행합니다.

```powershell
Compress-Archive -Path landing/dist/* -DestinationPath landing/loxt-site-v1.13.0.zip -Force
```

## 반영 내용

- 1.13.0 다운로드 주소, 릴리스 링크와 버전 표시.
- Work 녹음 옆 메모 패널·독립 메모·블록 편집·자동 저장·문서 검색·Markdown/HTML/PDF 내보내기 설명과 새 FAQ.
- 실제 앱에서 촬영한 메모 패널·독립 문서·슬래시 메뉴·라이트 메모 화면. 기존 홈·보관함 등 화면도 모두 1.13.0으로 다시 촬영.
- 1.13.0 실제 앱에서 새로 촬영한 홈·보관함·녹음·Live·스크립트·모델·휴지통 화면.
- 다크·라이트 앱 화면을 전환하는 테마 미리보기와 테마 저장 안내.
- YouTube 링크 입력 → 영상 확인 → 폴더·모델 선택 → 음성 가져오기·변환 흐름과 지원 범위.
- Work·Live의 별도 보관함, Live 권한·모델 준비 후 자동 녹음, 화자 구분, 컴퓨터 소리 녹음 설명.
- 모델 다운로드 크기, 최신 FAQ, 검색·공유 메타데이터.
- 공식 GitHub 저장소와 소스 MIT 라이선스 링크. 모델·외부 실행 도구의 라이선스는 별도 조건을 따릅니다.

## 앱 화면 캡처

캡처·버전 동기화·README 홈 이미지 갱신·빌드·반응형 검사·ZIP 생성은 프로젝트 루트의 아래 명령으로 한 번에 실행할 수 있습니다. 먼저 현재 버전의 Windows 설치 파일을 생성하고 사이트 본문/촬영 시나리오를 수정하세요.

```powershell
node landing/scripts/release.mjs
```

자동 마무리 규칙과 Git 명령어는 [릴리스 마무리 절차](../docs/RELEASE-WORKFLOW.md)에 정리했습니다. 다운로드 링크는 `release.mjs`의 `version`에서 만들어집니다. 외부 GitHub/Cloudflare 게시까지 자동 실행하는 명령은 아닙니다.

`landing` 폴더에서:

```powershell
node scripts/capture.mjs
```

먼저 프로젝트의 Windows 앱 빌드가 `release/stage5/win-unpacked/LOXT.exe`에 있어야 합니다. 앱 버전과 `release.mjs`의 버전이 다르면 캡처를 중단합니다.

별도 `test-results/landing-preview-*` 프로필에 예시 녹음·폴더·스크립트를 생성하고 실제 앱에서 **20개 화면**을 촬영합니다. 사용자 보관함이나 모델을 변경하지 않습니다. 다크·라이트 홈 미리보기는 같은 예시 기록을 사용합니다.

예시 오디오는 무음이며 스크립트·화자 데이터는 소개용입니다. Live 화면은 실제 렌더러와 입력 캡처에 예시 상태 이벤트를 제공해 촬영합니다. 해당 캡처는 추론 정확도나 변환 속도의 측정 결과가 아닙니다.

`public/assets/screenshots.json`에 실제 앱 버전, 예시 여부, 촬영 시간, 이미지 크기와 시나리오를 기록합니다.

## 검증

정적 미리보기 서버를 연 상태에서 실행합니다.

```powershell
node scripts/check.mjs http://127.0.0.1:5182/
```

검증 서버 주소는 실제 열린 미리보기 포트로 바꾸세요. 스크립트는 390·768·1440px 화면의 가로 넘침, 이미지, FAQ, 다크·라이트 미리보기 전환, Work·Live 설명, 최신 다운로드 링크와 브라우저 오류를 확인합니다.

1.13.0 다운로드 주소는 설정했으나 확인 당시 GitHub 릴리스 조회가 HTTP 404였습니다. 설치 파일을 GitHub Releases에 게시한 뒤 Production 사이트를 배포하세요.
