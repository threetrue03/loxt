# LOXT 1.12.0 설정 개선 검증

검증일: 2026-10-05. 승인된 S01–S29 범위를 구현하고 별도 테스트 프로필에서 검사했다. 사용자 녹음·스크립트·폴더·모델을 테스트 입력으로 사용하거나 삭제하지 않았다. GitHub 업로드, 커밋·푸시, 소개 사이트 수정·외부 배포를 실행하지 않았다.

## 변경 구조와 데이터 보존

- `src/SettingsProvider.jsx`, `SettingsSidebar.jsx`, `SettingsPage.jsx`를 Work·Live가 함께 사용한다. 설정 탭과 열림 상태는 공유하고 원래 페이지 상태는 각 모드에 남는다. 녹음 컴포넌트를 설정 때문에 제거하지 않는다.
- 새 `<userData>/workspace-preferences.json`에 모드별 기본 모델·입력 장치·보기를 저장한다. 기존 `transcription/settings.json`의 Work 모델과 기존 localStorage의 장치·보기를 한 번만 이전한다. 기존 파일·키는 삭제하지 않는다.
- 저장 요청을 직렬화하고 임시 파일 쓰기·교체가 성공한 뒤에만 실제 값과 UI를 갱신한다. 손상된 설정은 읽기만으로 덮어쓰지 않고, 사용자가 값을 다시 선택하면 원래 바이트를 `.invalid-…` 파일에 보존한다. revision으로 늦게 도착한 응답이 최신 상태를 되돌리지 않도록 한다.
- Work 큐와 Live의 실행 모델은 일시적인 엔진 설정이다. Work 큐 configure는 `persist:false`, Python 준비는 `--transient`를 사용한다. 설치 프로그램의 기존 준비·복구 모드는 transient 기본 false를 유지한다.
- 모델 오류와 현재 작업은 `ModelActions`에서 공통 관리한다. 정상 종료·취소·실패를 구분하고 오류를 행에 유지한다. 안내 기록 저장이 실패해도 현재 오류는 메모리에 남으며 실패 사실을 안내한다.
- 기존 토스트 시간, 녹음·스크립트 직렬화, Work·Live 보관함 경로, 출력 추적·화자 엔진, GPU 큐와 Work 유휴 해제 정책을 유지한다.

## S01–S29 대응

모든 항목의 구현은 완료했다. 아래의 ‘해결’은 코드와 명시한 검증 범위의 상태이며 물리 장치·전체 설치 환경까지 검증했다는 뜻이 아니다.

| ID | 상태 | 변경 및 근거 | 검증 |
|---|---|---|---|
| S01 | 해결 | 공통 5개 설정 메뉴·본문. `src/SettingsSidebar.jsx:5`, `src/SettingsPage.jsx:14` | 두 모드 실제 화면·설정 탭 유지 |
| S02 | 해결 | 기본값 저장과 작업 모델 분리. `electron/conversion-queue.cjs:31`, `:46`, `python/engine_prepare.py:88` | 큐 기본값·일시 configure·이전 설정 바이트 보존·Python 준비 회귀 |
| S03 | 해결 | Live 초기 모델·장치가 모드별 저장값 사용. `src/LiveRecorder.jsx:11` | UI 초기값·재실행, 실제 CUDA Live가 저장된 small 모델 사용 |
| S04 | 해결 | Work 녹음·Live 준비/녹음·변환·엔진 작업의 공통 잠금. `electron/main.cjs:144` | 실제 Live 중 Work 버튼 비활성·백엔드 거절 |
| S05 | 해결 | 하드웨어 감지와 선택·실행 결과 분리. 미확인 초기값. `electron/transcriber.cjs:37`, `:368`, `src/SettingsPage.jsx:111` | GPU가 감지됐어도 CPU 선택을 CPU로 표시하는 화면 fixture, 실제 CUDA 실행 |
| S06 | 해결 | 설치 상태·추천·기본값을 독립 표시. `src/SettingsPage.jsx:82` | 같은 행에 설치됨+추천+기본값 함께 표시 |
| S07 | 해결 | 모드별 ‘기본으로 사용’, 현재 기본값은 배지. `src/SettingsPage.jsx:91` | Work·Live 기본값 독립 저장·선택 |
| S08 | 해결 | 준비 검증 기록과 현재 장치를 기준으로 실행 확인 표시. `electron/transcriber.cjs:146`, `src/SettingsPage.jsx:81` | 파일 있음/검증 없음 fixture, 실제 엔진 추론·자동 준비 회귀 |
| S09 | 해결 | 공통 제한 이유를 모델 섹션에 표시. `src/SettingsPage.jsx:73` | 상태 fixture·실제 Live 잠금 및 자동 갱신 |
| S10 | 해결 | 실제 다운로드 %, 준비·검사 단계, 취소 결과와 재사용 안내. `electron/transcriber.cjs:190`, `electron/model-actions.cjs:24` | 모의 다운로드 단계·페이지/모드 이동·취소, 엔진 프로토콜 회귀. 실제 새 다운로드는 미실행 |
| S11 | 해결 | 모델명·원본 보존·기본값 영향, 위험색의 행 내 확인. `src/SettingsPage.jsx:93` | 확인 UI·중복 방지, 기존 모델 삭제 단위 테스트는 사설 fixture 파일로 검사 |
| S12 | 해결 | 공통 오류 기록·재시도·모드 정보 유지, IPC 접두어/스택·파일 접근 오류 정리. `electron/model-actions.cjs:4`, `src/SettingsProvider.jsx:4` | 오류 재실행 복원 단위 테스트, 화면 이동 후 재시도·안내 기록 실패 |
| S13 | 해결 | 연결되지 않은 이전 마이크와 기본 장치 복구 행동. `src/SettingsPage.jsx:62`, `:69` | 모의 연결 해제 ID와 UI 복구. 물리 연결 해제는 미확인 |
| S14 | 해결 | 조회·권한·로딩 상태와 devicechange 갱신. `src/useInputDevices.js:2` | 열거 실패/빈 장치 fixture. 실제 OS 권한 변경은 미실행 |
| S15 | 해결 | ‘보관함 보기’ 표현, 모드별 현재 보기와 저장값 일치. `src/SettingsPage.jsx:68` | 각 모드 화면과 저장값·재실행 복원 |
| S16 | 해결 | 쓰기 성공 후에만 적용, 실패와 재시도. `electron/workspace-preferences.cjs:21`, `src/SettingsProvider.jsx:35` | 실제 사설 설정 파일 쓰기 실패, 원래 값·페이지 이동·재시도·재실행 |
| S17 | 해결 | ‘돌아가기’와 모드별 원래 화면 유지. `src/SettingsSidebar.jsx:6` | Live 녹음 복귀, Work 녹음/스크립트 컴포넌트 유지·회귀 |
| S18 | 해결 | 앱 공통/모드별 적용 범위를 섹션에서 안내. `src/SettingsPage.jsx:65` | 두 모드 화면·테마 공유·기본값 분리 |
| S19 | 해결 | 하나의 본문·제목·폭·여백 CSS. `src/styles.css:189` | Work·Live와 다크·라이트 화면 확인 |
| S20 | 해결 | 설정 내부 중복 경로·페이지 제목 제거, 기존 행 구조로 간격 정리. `src/App.jsx:317`, `src/LiveWorkspace.jsx:117` | 실제 일반/모델/저장 화면 확인 |
| S21 | 해결 | 상태·버튼 12–13px, ID 보조 정보, SUIT 유지. `src/styles.css:200` | 계산 스타일·캡처 확인 |
| S22 | 해결 | 색상에 의존하지 않는 미설치/설치됨/확인 필요/추천/기본 모델 문구. `src/SettingsPage.jsx:81` | 다양한 상태 fixture 캡처 |
| S23 | 해결 | 작은 창에서 용량을 이름 아래로 이동, 긴 이름·버튼·설명 분리. `src/styles.css:229` | 860×640+Electron 150%에서 넘침 없음, 모든 행 용량 표시 |
| S24 | 해결 | 두 보관함과 모델 경로의 같은 프레임·열기/복사·실패 안내. `src/SettingsPage.jsx:106`, `electron/main.cjs:173` | 저장 공간 실제 화면, 경로 화이트리스트 코드 확인 |
| S25 | 해결 | 실제 파일 사용량·여유 공간, junction/링크 제외·hardlink 중복 제거·15초 캐시·동시 요청 통합. `electron/settings-support.cjs:4`, `:27` | 실제 사설 파일·hardlink·junction·캐시·새로 계산 단위 검사 |
| S26 | 해결 | 존재하는 설치 로그 열기·안전한 진단 복사·로그 없음/열기 실패 안내. `electron/main.cjs:179`, `electron/settings-support.cjs:48` | 진단 실제 IPC/클립보드, 개인정보 제외·로그 없음 단위 검사 |
| S27 | 해결 | 현재 버전·공식 릴리스·변경 사항·라이선스·고지 링크. `src/SettingsPage.jsx:110`, `electron/main.cjs:181` | 코드의 공식 주소 화이트리스트·패키지 표시 버전. 외부 페이지 게시 안 함 |
| S28 | 해결·기존 조작 유지 | aria-current, 읽을 수 있는 숨김 status, %마다 중복 안내하지 않는 단계 메시지. 기존 Menu 포커스·reduced-motion 유지. `src/SettingsSidebar.jsx:6`, `src/SettingsPage.jsx:100`, `src/styles.css:232` | Tab/Shift+Tab·화살표·End·Enter·Escape, DOM 접근성 의미. 실제 화면 읽기 도구 낭독은 미검사 |
| S29 | 해결 | 모델 목록 확인 중/실패/없음 구분, 검사 전 미설치라고 단정하지 않음. `electron/transcriber.cjs:37`, `:253`, `src/SettingsPage.jsx:58` | 실제 손상 registry 단위 검사와 로딩·실패·재시도 화면 fixture |

## 검증 결과와 증거

- `npm run test:release`: **61/61 통과**. 기존 52개 및 새 설정 9개. 결과: `test-results/settings-1.12.0/unit.log`.
- `npm run test:worker-pool`: **4/4 통과**. 기존 재사용·모델 변경·취소·Live 자원 반환 유지.
- `.runtime/python/python.exe -X utf8 scripts/engine-prepare.test.py`: **5/5 통과**. 설치 프로그램의 기존 선택 보존, 실패 시 설정 보존, transient 작업 모델 검사.
- 설치된 별도 auxiliary venv에서 `scripts/auxiliary.test.py`: **2/2 통과**. 번들링용 Python에는 numpy가 없으므로 추론 엔진 Python으로 검사했다.
- `scripts/settings-ui-smoke.mjs`: 별도 프로필의 실제 Electron 소스 화면과 새 실행본에서 검사. 저장 실패는 실제 임시 파일 경로에 디렉터리를 만들어 유발했으며, 재시도 전 저장된 값이 유지됨을 확인했다. 모델 목록·진행률·오류·장치 열거는 명시한 fixture를 사용했다. **다운로드·물리 마이크·GPU 추론 성공 증거로 쓰지 않았다.** 결과: `test-results/settings-1.12.0/source.json`, `packaged.json` 및 로그.
- `scripts/live-smoke.mjs --theme --settings`: **실제 NVIDIA CUDA 추론 통과**. private 프로필의 합성 한국어 음성을 가짜 입력 장치로 공급했고 기존 설치된 모델·런타임은 읽기용 경로로 재사용했다. 저장된 small 모델, 권한 확인 후 준비, 준비 중 녹음/타이머 없음, 녹음 자동 시작, 설정 중 테마 변경, 페이지 이동, 실제 Live의 Work 모델 변경 제한, Work 대기/취소, 일시정지/재개, 최종 WAV/스크립트 시간, 화자 포함 복사·내보내기, 재실행을 확인했다. 근거: `test-results/settings-1.12.0/live.log`가 가리키는 최종 테스트 프로필의 `result.json`과 PNG.
- `scripts/improvements-ui-smoke.mjs`: 소스/새 실행본에서 Work 합성 입력 녹음·중단 후 재개·버리기, 숨겨진 워크스페이스의 녹음 유지, 스트림/AudioContext 정리, 카드 미리보기·스크롤·키보드, 폴더 드래그, Live 폴더/내보내기, 빠른 제목 저장, 복구 화면 통과. 결과: `regression-ui.log`, `packaged-regression.log`.
- `scripts/theme-smoke.mjs --fresh`: 기존 다크 색·테두리·배치와 라이트/로고/창 배경, 메뉴·오류·작은 화면·보관함 보존·재실행 통과. 오래된 1.10 테마 기준의 글꼴 크기 3개만 이전에 승인된 1.11 A16 값으로 정리했으며, 그 외 기준은 그대로 비교했다. 결과: `theme.log`.
- 처음 발생한 sandbox `spawn EPERM`/임시 폴더 접근 제한은 허용된 외부 실행으로 재검사했다. 일부 UI 테스트는 숨겨진 공통 화면까지 찾거나 이미 설치된 모델에 설치 버튼을 찾던 테스트 선택자를 바로잡았다. 앱 오류와 테스트 준비 오류를 구분했다.
- 최종 패키지 검사는 Electron·shared·Python 파일뿐 아니라 렌더러 dist 파일까지 현재 빌드와 바이트 단위로 비교한다. 개발/테스트 파일의 패키지 포함 여부와 YouTube 도구 체크섬도 확인한다. 중간 빌드 도중 소스가 변경된 경우 무결성 검사가 일치하지 않는 산출물을 거절했으며, 최종 소스를 고정해 다시 생성했다.

## 실제 화면

- `test-results/settings-1.12.0/work-general-dark.png`, `live-general-light.png`
- `models-light.png`, `models-small-150-dark.png`, `model-lock.png`
- `disconnected-device.png`, `catalog-error.png`, `persistent-model-error.png`, `storage-light.png`

일반·모델·저장 화면은 기존 차콜 표면/테두리와 SUIT를 사용한다. 큰 창은 좌측 설명/우측 컨트롤, 작은 창은 세로 배치다. 150% 확대 시 내용은 세로 스크롤하며, 모델 행의 가로 넘침과 용량 숨김은 없다. 구체적인 치수는 source.json/packaged.json에 남겼다.

## 릴리스 산출물

- 소스/잠금 파일/실행본 앱 정보/설치 파일 ProductVersion·FileVersion/릴리스 문서: **1.12.0** 일치.
- Windows 설치 파일: `release/stage5/LOXT-Setup-1.12.0-x64.exe` (155,823,441바이트).
- SHA-256: `421e8ea9f2c57330240738bb5a9a087b46a3868959f73c3fee7b26d909d108d8`.
- `release/stage5/release.json`, `SHA256SUMS.txt`와 일치. 최종 `test-results/settings-1.12.0/manifest.log`에 renderer/Electron/shared/Python/YouTube 도구의 패키지 무결성 통과 기록.
- 모델 기본 제공/외부 분류를 포함한 최종 패키지 UI 검사: True. 모델 목록 로딩/오류, 저장 실패 재시도, 모델 진행·취소, 기본값 분리·재실행, 장치 복구, 잠금 안내, CPU 표시, 키보드, 작은 창 검사 통과. 페이지 오류 0개.
- 최종 실제 Live: CUDA, 저장된 `small` 모델, 원본 9.68531초, 스크립트 4구간, 페이지 오류 0개. 합성 음성·가짜 입력을 사용한 실제 추론 결과이며 물리 마이크 녹음 결과는 아니다.
- NSIS 패키징과 실행본 생성은 완료했다. 추가한 렌더러 검증기의 Windows 경로 구분자를 바로잡은 뒤 최종 manifest를 별도로 실행해 통과했다. 해당 검증기 문제를 앱 오류나 소스 불일치로 분류하지 않는다.
- 설치 파일은 코드 서명되지 않았으며 release.json의 `signed:false`를 유지한다. 코드 서명 인증서를 새로 추가하지 않았다.
- 새 릴리스는 게시하지 않았다. 소개 사이트와 이미 공개된 다운로드 주소는 이번 작업에서 수정하지 않았다.


## 확인하지 못한 범위와 남은 위험

- 실제 Windows 100/125/150/200% DPI 변경은 하지 않았다. 앱 최소 창 크기와 Electron 150% 확대는 OS DPI 검증을 대체하지 않는다. 별도 Windows 테스트 PC에서 각 배율로 다시 확인해야 한다.
- 물리 마이크/스피커/USB·블루투스 헤드셋의 연결 해제·재연결, 실제 OS 권한 거절은 수행하지 않았다. 장치 목록 이벤트와 연결 해제 안내는 모의 열거 결과로 확인했다. 기존 출력 장치 추적 엔진을 변경하지 않았다.
- 실제 새 모델 네트워크 다운로드·중단 후 이어받기와 디스크 전체 용량 부족은 강제로 만들지 않았다. 설치/취소 UI는 실제 journal과 모의 엔진을 결합했고, 저장 실패는 격리 파일 쓰기 실패로 검증했다. 별도 테스트 PC에서 네트워크 단절·부분 파일·재설치·사용 확인을 확인해야 한다.
- 사용자 PC의 기존 설치 상태를 바꾸지 않았다. 전체 신규 설치→모델 설치→업데이트/복구→제거는 깨끗한 Windows VM에서 추가 확인이 필요하다. 이번에는 설치 파일 생성·무결성·새 패키지 실행을 확인했다.
- 실제 화면 읽기 도구의 낭독 순서와 모든 Windows 언어/글꼴 배율은 확인하지 않았다. Narrator로 메뉴 선택·진행 단계·제한 이유를 추가 확인해야 한다.
- 장시간 다화자 품질·60분 이상의 실제 GPU 세션·VRAM 강제 OOM은 이번 설정 범위의 검증에서 추가하지 않았다. 기존 화자·출력 추적 구현과 모델 수명/GPU 조정을 유지했으며 별도 전용 환경에서 장시간 검사해야 한다.
