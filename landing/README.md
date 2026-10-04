# LOXT 소개 페이지 — 1.8.0

React + Vite, 기존 차콜 색상과 SUIT, 최신 앱 화면을 사용하는 소개 페이지입니다. 브랜드 문구는 LOXT — Local Speech-to-Text powered by your own hardware. 입니다.

## 로컬 확인

```powershell
cd landing
npm run dev
```

개발 서버는 http://127.0.0.1:5180 입니다. 다운로드 버튼은 GitHub Releases의 v1.8.0 설치 파일에 연결합니다. 개발 서버의 /downloads/LOXT-Setup-1.8.0-x64.exe는 로컬 설치 파일 확인용입니다.

## 배포

```powershell
npm run build
npm run preview
```

배포 파일은 `landing/dist`입니다. 설치 파일을 포함하지 않고 GitHub Releases의 공식 다운로드 주소로 연결합니다.

https://github.com/threetrue03/loxt/releases/download/v1.8.0/LOXT-Setup-1.8.0-x64.exe

Cloudflare Pages의 loxt 프로젝트에서 Create deployment → Production을 선택하고 `landing/dist` 폴더 또는 `landing/loxt-site-v1.8.0.zip`을 업로드합니다. ZIP의 최상위에 index.html과 assets가 들어 있습니다. 로컬 빌드만으로 공개 사이트가 갱신되지는 않습니다.

## 최신 반영 내용

- 1.8.0 다운로드·릴리스 링크와 브랜드 문구를 release.mjs에서 관리합니다.
- 새 홈, 최근 열람, 진행 중인 작업, 폴더 바로가기를 소개합니다.
- Work 파일 변환과 Live 실시간 스크립트, 워크스페이스 전환과 별도 보관함을 설명합니다.
- Live의 권한 확인 → 모델 준비 → 자동 녹음과 종료 후 화자 보정을 안내합니다.
- 화자 표시, 원본 구간 재생, 전체 복사·내보내기·다시 변환하기를 소개합니다.
- 컴퓨터 소리의 기본 출력 장치 추적·재연결, 모델 설치·외부 모델, 폴더·드래그·휴지통을 설명합니다.
- 기능, FAQ, 검색·공유 메타데이터와 모든 앱 캡처를 갱신했습니다. 예전 로고 홈 이동 설명을 제거했습니다.

## 캡처와 검증

`node scripts/capture.mjs`는 별도의 `test-results/landing-preview-*` 보관함에 예시 녹음·폴더·스크립트를 만들고 패키지된 LOXT 1.8.0에서 11개 화면을 캡처합니다. 사용자 녹음이나 모델을 변경하지 않습니다.

예시 오디오는 무음이며 스크립트·화자 데이터는 소개용입니다. Live 화면은 실제 앱 렌더러와 입력 캡처에 예시 상태 이벤트를 제공해 촬영하며 모델 추론 성능·정확도를 측정하지 않습니다. screenshots.json에 앱 버전, 예시 여부, 이미지 크기와 시나리오를 기록합니다.

`node scripts/check.mjs http://127.0.0.1:5182/`는 정적 미리보기 서버에서 PC·모바일 넘침, 이미지, FAQ, Work·Live 설명과 다운로드 링크를 검사합니다. 1.8.0 링크는 HTTP 200, 138,339,885 bytes 응답으로 로컬 설치 파일과 같은 크기임을 확인했습니다.
