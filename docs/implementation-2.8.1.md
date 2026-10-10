# LOXT 2.8.1 — 메모 세로 안내선 제거

사용자가 요청한 메모 중첩 목록의 세로 안내선 제거만 앱 동작에 적용했다. 메모 데이터·들여쓰기·글자 색상·목록 기호·접기 기능은 유지한다.

## 원인과 수정

`src/memo.css`의 중첩 group border와 BlockNote의 nested block outer `::before` 안내선이 동시에 표시됐다. LOXT의 border를 제거하고 기본 pseudo 안내선을 숨긴다. 원래 border1px+padding4px는 border0+padding5px로 바꿔 기존 내용의 수평 간격을 유지한다. 목록 기호는 block content의 별도 pseudo element여서 숨기지 않는다.

안내선 색상에만 사용하던 `src/memoEditing.js` decoration plugin도 제거했다. 글자 색상과 키보드·입력 규칙은 변경하지 않는다. 저장 형식이나 기존 문서의 깊이를 재작성하지 않는다.

## 검증

별도 예시 프로필의 실제 Electron 메모 화면에서 3단계 중첩 목록을 다크·라이트로 확인했다. nested group border0과 기본 pseudo 안내선 미표시, 네 목록 기호 보존, 기존20px margin을 확인했다. 부모 삭제·실행 취소/다시 실행, 여러 블록 Tab/Shift+Tab·마우스 선택, 접기·Esc 복원, Docker 코드 언어 검색과 저장, 글자 색상과 저장된 하위 문서 구조도 기존 회귀로 확인했다.

로그: `test-results/implementation-2.8.1/memo-ui-source.log`. 화면·결과: `test-results/memo-editing-2.8.1/`.

실제 마이크·GPU 추론·iPad Safari 검증이 필요한 동작은 이번 변경 범위가 아니다.

## 최종 산출물 확인

- 관련 Node 회귀11/11 통과: `test-results/implementation-2.8.1/memo-regression.log`.
- 수정 소스와 최종 `release/stage5/win-unpacked/LOXT.exe`의 메모 UI 회귀 모두 통과, 런타임 오류0. 패키지 결과는 `test-results/implementation-2.8.1/memo-ui-packaged.log`와 `test-results/memo-editing-2.8.1/result.json`의 `version=2.8.1`, `packaged=true`, `passed=true`로 확인한다.
- 새 설치 파일의 버전·renderer·Electron/shared·Python·YouTube 구성요소 일치 검사 통과. 설치 EXE의 제품 버전2.8.1, 크기194,441,295 bytes, 서명 상태 `NotSigned`.
- `node landing/scripts/release.mjs` 완료: 최신 앱 예시57장, README 홈 이미지, 소개 사이트의 메모 설명·버전·다운로드 링크 갱신. 390/768/1440px 화면·테마·이미지·FAQ·연결·링크 검사 통과.
- 중첩 목록이 보이는 예시 메모를 다시 촬영하고 세로선 없이 기존 들여쓰기·목록 기호가 남는지 시각 확인했다. [메모 화면](../landing/public/assets/memo.png).
- `landing/loxt-site-v2.8.1.zip` 크기5,289,133 bytes, ZIP 루트 `index.html` 확인. `externallyPublished=false`.

```text
08435161f39047ebc08e0628f29f54bccc865a871a53b596de96c6505ecac525  LOXT-Setup-2.8.1-x64.exe
```

동일 SHA-256은 `release/stage5/SHA256SUMS.txt`와 설치 파일명 뒤 `.sha256` 파일에 있다. GitHub v2.8.1 릴리스 읽기 확인은404였으며 업로드·push·Cloudflare Production 게시를 수행하지 않았다. [게시 절차와 PowerShell 명령](RELEASE-WORKFLOW.md)을 참고한다.
