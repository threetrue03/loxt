# 구현 후 릴리스 마무리

사용자 요청에 따라 승인된 앱 기능 구현에는 릴리스 준비까지 포함한다. 이 규칙은 루트 `AGENTS.md`에 기록되어 있어 다음 작업에서도 적용한다. 조사·논의 요청에는 적용하지 않는다.

## 준비 순서

1. 승인된 기능을 구현하고 관련 회귀·실제 화면 검증을 완료한다. 기능 추가는 minor, 버그 수정은 patch를 기본으로 버전을 올린다.
2. `package.json`과 잠금 파일 버전을 맞추고 `npm run package:installer`를 실행한다. 설치 파일과 `release.json`·SHA256SUMS의 버전/체크섬을 확인한다.
3. `docs/release-<version>.md`와 `README.md`의 버전·기능·스크린샷·사용법을 갱신한다. 구현하지 않은 기능과 측정하지 않은 성능을 넣지 않는다.
4. 사이트에 변경 기능 설명·FAQ·메타데이터를 반영한다. `landing/scripts/capture.mjs`에 필요한 촬영 시나리오와 별도 예시 데이터를 추가하고 `check.mjs` 검사 범위를 맞춘다.
5. 프로젝트 루트에서 아래 명령을 실행한다.

```powershell
node landing/scripts/release.mjs
```

이 명령은 버전 메타데이터 동기화 → 현재 패키징된 앱의 예시 화면 촬영 → README용 홈 이미지 갱신 → 사이트 빌드 → 390·768·1440px 화면/이미지/FAQ/링크 검사 → 배포 ZIP 생성을 처리한다. 실제 앱 버전이 다르면 중단한다. 의미 있는 기능 설명과 README 본문은 구현한 내용을 알고 있는 작업자가 작성해야 한다.

6. 공개 GitHub 릴리스·설치 파일이 존재하는지 확인한다. 아직 없으면 다운로드 URL 준비와 실제 게시 상태를 구분해서 알린다.
7. 최종 답변에 릴리스 문구, README 변경, Git 명령어, 설치 파일·사이트 ZIP·검증 결과, 사용자가 남은 게시 작업을 할 순서를 제공한다.

## 다운로드 링크 변경

`landing/release.mjs`의 첫 줄이 기준이다.

```js
export const version = '2.5.0';
```

`installer`, `releaseUrl`, `download`가 이 값으로 구성되므로 기본 파일명 규칙을 따르면 다른 URL을 일일이 바꾸지 않는다. 사이트 모든 다운로드 버튼과 릴리스 링크가 이를 사용한다. 앱 버전을 올린 뒤 위 마무리 명령을 실행하면 사이트 버전도 동기화된다.

공개 파일명은 정확히 `LOXT-Setup-<version>-x64.exe`, 릴리스 태그는 `v<version>`이어야 한다. 다른 저장소나 파일명을 사용할 때는 `release.mjs`의 URL 구성도 바꾼다. 루트 README의 다운로드 링크·소스 배지·최신 설명도 갱신한다.

## 게시 순서

1. 소스·README를 GitHub에 커밋/푸시한다.
2. GitHub **Releases → Draft a new release**에서 `v<version>` 태그를 정하고 설치 파일을 첨부한다. 같은 버전의 릴리스 문구를 붙여 넣고 Publish한다.
3. 다운로드 링크가 실제 설치 파일을 반환하는지 확인한다.
4. Cloudflare Pages **loxt → Create deployment → Production**에 `landing/dist` 또는 `landing/loxt-site-v<version>.zip`을 올린다. ZIP 루트에는 `index.html`·`assets/`가 있어야 한다.

로컬 수정/빌드만으로 GitHub README나 공개 사이트가 바뀌지는 않는다. 외부 푸시·릴리스 업로드·Production 게시를 직접 실행할 때는 사용자의 해당 실행 지시가 필요하다.

## PowerShell Git 준비와 업로드

일반적인 설치 경로인 `C:\Program Files\Git\cmd\git.exe`가 있을 때 사용자 PATH에 영구 등록한다. 다른 위치라면 `$gitDir`를 설치 경로로 바꾼다. Git 자체를 설치하지 않았다면 Git for Windows를 먼저 설치한다.

```powershell
$gitDir = 'C:\Program Files\Git\cmd'
if (-not (Test-Path "$gitDir\git.exe")) { throw 'Git 설치 경로를 확인하세요.' }
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $gitDir) {
    [Environment]::SetEnvironmentVariable('Path', "$gitDir;$userPath", 'User')
}
if (($env:Path -split ';') -notcontains $gitDir) { $env:Path = "$gitDir;$env:Path" }
git --version

cd 'C:\Users\simky\OneDrive\Dokumen\ChatGPT\buzz_interface'
git status
git add .
git diff --cached --stat
git commit -m "Release v2.5.0: Improve library and document management"
git push origin main
```

다음 업데이트에서는 커밋 메시지 버전/내용을 바꾼다. 이 저장소의 remote는 이미 등록되어 있으므로 `git remote add origin`을 반복하지 않는다. push가 원격 변경 때문에 거절되면 강제 push하지 않고 아래처럼 통합한다.

```powershell
git pull --rebase origin main
# 충돌이 발생하면 해당 파일을 해결하고 git add 후 git rebase --continue
git push origin main
```

프로젝트 `.gitignore`는 설치 파일, 런타임, 사용자/테스트 프로필, node_modules, dist 및 사이트 배포 ZIP을 제외한다. 커밋 전 staged 파일을 확인한다. 이후에도 Git이 보이지 않으면 새 PowerShell/Codex 창을 연다. 실행 중인 앱의 부모 프로세스는 이전 PATH를 유지할 수 있다.
