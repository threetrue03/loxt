# LOXT 2.7.0 구현·검증

기준: [조사 보고서 v2.7.0](./v2.7.0.md), 실제 조사 버전 2.6.0. 구현은 보고서 V01–V23 전체를 대상으로 한다. 원본 보고서의 조사 결과와 이번 수정 결과는 구분한다.

## 적용 항목

| ID | 구현 |
|---|---|
| V01 | 공통 메모의 내부 목차, h1–h4, 블록 ID 이동, 좁은 화면 overlay, 닫힘 애니메이션·Esc·포커스·reduced motion |
| V02 | 공통 파일 유형과 동일/혼합 선택 설명, 카드 아이콘·미리보기·관리 메뉴·이름 변경 aria |
| V03 | 새 녹음/Live 시작의 상시 사이드바 테두리 제거; 기존 상태 유지 |
| V04 | summary의 멱등성, 실제 segmentCount 보존 |
| V05 | 카드 상세 조회에 Work/Live mode 전달 |
| V06 | 정상 드롭 클릭 억제와 Esc/pointercancel/비활성화 취소 분리 |
| V07 | 같은 블록 안의 서식 경계를 넘는 DOM offset 검색, debounce·결과/문자 상한 |
| V08 | 검색 최초 결과와 Enter·Shift+Enter 이동 일치 |
| V09 | durable 폴더 휴지통 항목, 빈 폴더·부분 복구·동명 충돌·원본 분리 복구·재실행 대응 |
| V10 | 단일 폴더 이동 메뉴, 기존 자기 자신/하위 이동 거부 유지 |
| V11 | 터치 메모 도구 44px hit area, 좁은 도구 모음 wrapping |
| V12 | 빈 공간 메뉴와 일반 메뉴의 공통 키보드 controller |
| V13 | YouTube 모델 선택에 공통 Work 역할·별명 옵션 사용 |
| V14 | 초기 파일 읽기 8개 제한 병렬화, ID Map·폴더 Set; 복구 검증 유지 |
| V15 | 본문 없는 탐색 catalog, revision 기반 증분 목록, 현재 폴더 120개 단위 미리보기, mutation 응답 경량화 |
| V16 | 영역 선택 RAF 병합, 경계 캐시·ResizeObserver, 선택 Set; 화면 밖 Ctrl+A 대상 유지 |
| V17 | 메모 미리보기 조기 종료, 검증된 변경 없는 블록 재사용, 초안/checkpoint 비용 관리 |
| V18 | 원격 렌더 요청 지연 병합·동일 scale 공유, 미시작 취소, PC 대기열 취소·우선순위, 기기별 격리 |
| V19 | 모델 검색 캐시 TTL·80개/16MiB 상한, 마지막 featured 오프라인 목록 보호 |
| V20 | 어댑터별 공유 모델 snapshot, 중복 요청·구독 제거, 홈에서 환경 진행률 구독 제외 |
| V21 | 문서 캐시 건수+추정 바이트 LRU, remote 16MiB/PC 32MiB, 활성·dirty·saving 항목 보호 |
| V22 | 해시 asset immutable, HTML 재검증, ETag·304·Content-Length·선택적 gzip; API no-store 유지 |
| V23 | UI 테스트의 현재 package 버전 참조와 삭제된 블록 UI 기대 제거, 신규 회귀 테스트 |

## 동작 정책

### 추가 승인된 메모 개선

1. 중간 블록 삭제는 선택한 블록만 제거하고 선택되지 않은 하위 블록을 보존한다. 삭제한 부모의 하위 내용은 남은 상위 계층으로 올려 유지한다.
2. 여러 블록의 텍스트를 선택한 뒤 Tab·Shift+Tab으로 함께 들여쓰기·내어쓰기를 적용한다.
3. 삼중 백틱 뒤 공백 또는 Enter 입력으로 코드 블록을 만들고 코드 언어를 검색한다. Docker·Go·PowerShell·TOML 등을 추가하고 언어별 하이라이터는 필요할 때 로드한다. 코드 내용은 기존 메모 검색으로 찾는다.
4. `>`와 공백 입력은 인용 대신 접기·펼치기 블록으로 변환한다. 기존 저장된 인용문은 유지한다.
5. 펼친 토글과 일반 중첩 블록에 들여쓰기 가이드를 표시한다. 부모 블록 색상을 우선하고, 기본색인 경우 첫 의미 있는 텍스트의 글씨색을 사용한다. 혼합색 문장은 하나의 색을 사용하며 본문·히스토리를 변경하지 않는 표시용 decoration으로 적용한다.

아래 검증 결과는 실제 테스트를 마친 범위만 완료로 기록한다.

- 폴더 복구는 내용을 새로운 문서로 복사하지 않는다. 기존 ID·본문·첨부·원본을 유지하고 journal로 계층을 복구한다. 같은 이름의 새 폴더에는 자동 합치지 않는다.
- 탐색 catalog는 전체 항목의 ID·제목·상태를 포함한다. 카드 본문은 현재 폴더에서 120개씩 받는다. Ctrl+A와 다중 관리의 대상은 표시한 첫 페이지에 제한되지 않는다.
- 증분 이력이 없거나 변경량이 512개를 넘으면 안전하게 catalog 전체를 다시 받는다. 상세 스크립트 조회는 별도로 유지한다.
- 원격 PDF의 이미 실행 중인 raster worker는 다른 기기의 작업을 보호하기 위해 강제 종료하지 않는다. 취소된 결과를 사용하지 않고 미시작 작업은 대기열에서 제거한다. 취소는 무거운 작업의 즉시 종료를 보장하지 않는다.
- 캐시 바이트는 retained-data 추정치이며 실제 JavaScript heap 측정값이 아니다. 활성·저장 실패·dirty 문서 보호 때문에 일시적으로 budget을 넘을 수 있다.
- 대량 DOM shell은 페이지 조회로 줄인다. 모든 폴더/문서를 전면 가상화한 구현으로 소개하지 않는다.

## 검증 결과

검증일: 2026-10-10(KST). 테스트는 `test-results/implementation-2.7.0/` 등 별도 프로필을 사용하며 기존 사용자 보관함은 사용하지 않는다.

| 검증 | 결과 | 증거 |
|---|---|---|
| 전체 회귀 | 143/143 통과 | `test-results/implementation-2.7.0/regression.log` |
| 워커 풀 | 4/4 통과, 모델 재사용·실패 복구·취소·Live GPU 예약 논리 | `scripts/work-worker.test.cjs` |
| 실제 소스 앱 통합 UI | Esc 후 마우스 해제의 자동 열기 없음, 다음 첫 클릭 정상; 목차·h4·서식 경계 검색·메뉴 방향키·120/130 목록·화면 밖 Ctrl+A·Live 패널 24줄 확장; 페이지 오류 0 | `test-results/implementation-2.7.0/ui-results.json` |
| 메모 기존 회귀 | 코드·수식·첨부·검색·목차·내보내기·저장 실패/재시도·연결 메모·재실행·닫기 저장 정상 | `test-results/memos-2.7.0/result.json` |
| 메모 추가 회귀 | 부모 삭제 시 하위 ID 보존·Undo/Redo, 실제 마우스 선택 후 Tab/Shift+Tab, `>`·백틱 공백/Enter·Esc, Docker 검색/강조/저장, 실제 글씨색 버튼과 가이드 RGB 일치 | `test-results/memo-editing-2.7.0/result.json` |
| 기존 문서 UI | Work/Live 다중 이동·휴지통, 원본만 삭제/복구, 그리기 페이지, 승인된 웹에서 수정 후 PC 반영, 320/390/768px 다크·라이트 넘침 없음, 가상 마이크로 중복 녹음 시작 방지 | `test-results/documents-2.7.0/results.json` |
| 최종 패키지 메모 UI | 2.7.0 패키지 실행, 삭제·실제 드래그 들여쓰기·코드·토글·저장/재개방 통과; 다크/라이트 코드 언어 버튼 한 줄, 흰색 글씨와 코드 영역 분리; 페이지 오류 0 | `test-results/implementation-2.7.0/packaged-memo-editing.log` |
| 패키지 통합·문서 UI | 탐색/목차/검색/키보드 메뉴 및 Work·Live 문서 관리·웹 수정 반영 통과 | `test-results/implementation-2.7.0/packaged-ui.log`, `packaged-documents-ui.log` |
| 사이트 릴리스 | 현재 패키지 앱의 예시 화면 55개 재촬영, README 홈 이미지 갱신, 사이트 빌드·데스크톱/모바일 레이아웃·FAQ·버전/다운로드 링크 검사 통과, ZIP 생성 | `test-results/implementation-2.7.0/site-release.log`, `test-results/site-release-2.7.0.json` |
| 승인된 웹 터치 UI | 390px Chromium 터치 환경의 코드 언어 버튼 44px, 코드 첫 줄과 겹침 없음 | `test-results/implementation-2.7.0/site-release.log` |

통합 과정에서 폴더 journal의 인덱스 저장 이벤트가 최종 메모리 상태 교체보다 먼저 도착하는 경쟁 상태를 재현했다. catalog/page 조회는 현재 메타데이터 트랜잭션을 기다리고, 미완료 상태를 이벤트에서 미리 catalog로 기록하지 않는다. 이동·삭제 실제 UI와 신규 회귀 테스트로 확인했다.

처음 실패한 일부 화면 검증은 접근성 이름 변경과 비동기 목록 로딩에 맞지 않는 테스트 대기 때문이었다. 카드 스크립트의 자동 더 보기는 버튼으로 스크롤하는 순간 내용을 확장하므로 실제 미리보기 스크롤로 확인했다. 실패한 검증을 통과한 것으로 처리하지 않고 수정 후 다시 실행했다.

패키징 도중 실행했던 첫 패키지 테스트와 마지막 소스 앱 실행 시도에는 `firstWindow` 30초 시간 초과가 있었다. 이를 기능 성공으로 기록하지 않았으며 로그를 보존했다. 패키징 완료 후 최종 패키지 앱에서 재실행한 메모 테스트는 통과했다. 실제 설치·업그레이드 실행은 이번 패키지 앱 검사와 별도로 검증해야 한다.

### 같은 예시 보관함의 측정

Node 22.17.0, Windows 10.0.26200, Ryzen 7 4800H, RAM 약 15.36GiB, 프로젝트 OneDrive의 합성 메모 파일. 같은 파일을 3회 재개방한 중앙값이며 OS cache·디스크 상태는 통제하지 않았다. 앱 전체 실행 시간·실제 LAN·Safari 지연 수치는 아니다.

| 기록 수 | 기존 재개방 | 변경 후 재개방 | 기존 전체 요약 JSON | 새 탐색 catalog | 첫 카드 페이지 |
|---|---:|---:|---:|---:|---:|
| 100 | 241.95ms | 55.95ms | 0.37MB | 0.025MB | 100개 / 0.37MB |
| 1,000 | 2,221.42ms | 560.60ms | 3.75MB | 0.246MB | 120개 / 0.45MB |
| 3,000 | 6,107.94ms | 1,499.59ms | 11.24MB | 0.740MB | 120개 / 0.45MB |

MB는 JSON UTF-8 바이트의 십진 단위다. 이후 페이지를 더 열면 전송·렌더 비용도 늘어난다. 증거: `test-results/implementation-2.7.0/library-measurements.json`.

메모 10,000블록의 2,000자 미리보기 중앙값은 13.85→0.09ms, 1,000블록의 실제 부분 저장 중앙값은 12.69→7.79ms였다. 저장 최대 관측치는 20.93→23.49ms로 증가했다. 모든 저장이나 전체 기기 동기화가 빨라졌다는 보장은 하지 않는다. 검증된 블록 재사용과 캐시 측정의 조건은 [성능 검증 기록](./implementation-2.7.0-performance.md)에 구분했다.

물리 iPad/iPhone Safari·Apple Pencil, 실제 90MB PDF, 실제 LAN 장시간 동시 편집, 마이크·시스템 loopback·GPU 추론은 이번 변경의 자동 검증 결과와 구분한다. 합성 기록·가상 마이크·스크립트 예시를 실제 추론 성공이나 정확도 증거로 사용하지 않는다.

## 릴리스

로컬 설치 파일: `release/stage5/LOXT-Setup-2.7.0-x64.exe`  
사이트 ZIP: `landing/loxt-site-v2.7.0.zip`  
공개 URL: `https://github.com/threetrue03/loxt/releases/download/v2.7.0/LOXT-Setup-2.7.0-x64.exe`

최종 설치 파일 크기: 193,806,391바이트. SHA-256: `4fb07fac534e40a3174e76fb52da41cada22921d394023701c4182c804129407`. 설치 파일의 production archive 검사와 버전 manifest 생성을 통과했다. 코드 서명은 적용하지 않았다.

2026-10-09 17:11:51 UTC에 공개 다운로드 주소는 HTTP 404였다. URL을 준비한 상태이며 GitHub 릴리스 자산 업로드는 아직 실행하지 않았다.

로컬 준비는 공개 게시와 다르다. commit/push, GitHub 릴리스 업로드, Cloudflare Production 게시를 자동 실행하지 않는다.
