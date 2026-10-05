# LOXT 1.11.0 — A01–A16 개선 및 검증

검증일: 2026-10-05. 시작 버전 1.10.0 → 최종 버전 **1.11.0**.

이번 요청에서 승인한 A01–A16 범위의 기존 코드를 수정했다. SUIT, 차콜 다크·라이트 테마, 로고와 기존 UI 구성, Work·Live 보관함 분리를 유지했다. 모든 녹음·폴더·손상·취소 검증은 독립 프로필과 합성 음성으로 수행했다. 기존 사용자 녹음은 사용하지 않았고 사용자 설치 상태·기본 출력 장치·볼륨을 변경하지 않았다. 설치된 모델 및 Python 환경은 테스트용 독립 설정에서 읽기만 재사용했다.

**중요한 수정 결과**

1. Live 폴더 삭제 후 정상 보관함으로 돌아가며 기록은 휴지통에 남는다. 예기치 않은 UI 오류에도 다시 열 수 있는 화면을 제공한다.
2. 기본 음성 변환 결과를 먼저 저장한다. 화자 분석 실패·취소·앱 종료는 부분 성공으로 구분하고, Whisper를 반복하지 않는 화자 분석 재시도를 제공한다. 기본 변환 자체가 실패하면 이전 스크립트와 원본을 보존한다.
3. 손상된 목록은 원본을 별도 보존한 뒤 정상 백업과 녹음별 메타데이터로 복구한다. 정상 항목은 계속 접근할 수 있다.
4. 목록의 숨겨진 스크립트와 화면 밖 카드 본문을 생성하지 않는다. 진행률 이벤트는 전체 목록 조회를 유발하지 않는다.
5. Live 시간·입력 레벨은 작은 메시지로 전달하고, 확정 스크립트는 변경분을 전달한다. Work는 같은 모델을 재사용하고 30초 유휴 후 해제한다.

**항목별 결과**

| ID | 수정 내용 | 검증 결과 | 남은 제한 |
|---|---|---|---|
| A01 | 삭제 응답의 library만 적용; 경로·편집·선택 정리; 워크스페이스 오류 경계 | 실제 Electron에서 Live 폴더 삭제·휴지통 보존 확인. 잘못된 UI 응답을 주입해 복구 화면→다시 열기→35개 기록 보존 확인 | 오류 경계는 렌더링 오류에 대한 방어이며 디스크·OS 장애 자체를 복구하지 않음 |
| A02 | 기본 결과 선저장; 기본 준비와 보조 엔진 준비 분리; 화자만 재시도; pending 분석의 중단 복구 | 준비/분석 실패·재변환 실패·앱 종료를 주입한 회귀 테스트 통과. 화자 재시도 시 Whisper 실행 횟수 증가 없음 | 실제 모델 서버 장애와 전원 차단은 강제로 발생시키지 않음 |
| A03 | 손상 목록 아카이브; 검증한 백업 우선; 메타데이터/원본 재구축; Windows 일시 파일 잠금 재시도 | 손상 목록·손상 메타데이터·빈 폴더·휴지통·복구 저장 실패·재실행 테스트 통과 | 백업도 없으면 빈 폴더 등 메타데이터에 없는 정보는 복구 불가. 백업 이후 변경은 확인 필요 |
| A04 | 카드 본문을 표시 범위에서 생성; 미리보기 점진 로딩; 목록에는 미리보기 미생성; 변경 이벤트/진행률 분리; revision으로 오래된 응답 제외 | 20/300/1,000개 측정. 카드 스크롤 위치 복원·텍스트 선택·키보드·우클릭·그룹 드래그·영역 선택 통과 | 전체 목록 데이터는 계속 전송함. 1,000개에서 약 10.3MB; 더 큰 보관함은 별도 페이지 조회 검토 |
| A05 | 같은 화면에 준비 취소; 실제 Work 대기 이유; 알려진 다운로드 수치만 표시; 늦은 응답 무시·자원 정리 | 준비/대기 상태 주입에서 타이머 0·오디오 저장 0; 취소 뒤 재시작 확인. 실제 GPU Live 준비→자동 녹음 확인 | 물리 마이크 연결 해제·실제 네트워크 다운로드 중단은 이번에 미검증 |
| A06 | 기존 기록 재변환은 하위 폴더 그대로; 새 녹음만 최상위 선택 | Work·Live의 수업/하위 유지, 공통 변환 창과 저장 위치 확인 | 없음 |
| A07 | 공통 스크립트 직렬화로 복사·TXT·내보내기 화자 보존 | Work·Live 실제 복사/파일 출력의 A/B 배지, 화자 없는 구간 테스트 통과 | 외부 형식 추가는 범위 밖 |
| A08 | 모달 내부 메뉴 포털; 배경 inert; Tab/Shift+Tab/ESC 복귀; 트리 메뉴 ESC 포커스 보완 | 실제 Electron에서 모달 포커스 유지·실행 버튼 복귀·하위 폴더 메뉴 ESC 복귀 확인 | 스크린리더 사용성 전체 검증은 미실시 |
| A09 | 제목 저장 직렬화·버전 보호; 실패 시 이전 제목 복원과 안내 | EACCES 오류 주입 시 복원·안내; 느린 첫 저장+빠른 두 번째 편집에서 최신 제목 유지 | 실제 디스크 장애를 일으키지 않음 |
| A10 | 파일별 결과; 성공 즉시 표시/변환 연결; 실패한 파일만 재시도; 중복 클릭 차단 | 정상 WAV+0바이트 WAV: 성공 1개 유지→실패 파일만 수정·재시도→총 2개. 더블클릭 중복 없음 | 파일 목록 재시도 정보는 앱 실행 중에만 유지 |
| A11 | 좁은 폭에 사이드바 70px; 재생/녹음 컨트롤 재배치; 긴 문자열 줄바꿈; 낮은 창 사이드바 스크롤 | 860×640 창+Electron 150% 확대에서 재생바·긴 제목·사이드바 버튼 접근 확인, 열린/접힌 상태 캡처 | Windows 실제 DPI 100/150/200% VM 조합과 긴 물리 장치명 전체 검증은 미실시 |
| A12 | 사용자 표시 LOXT·저성능/표준/고성능 통일; 준비 실패의 실제 모델 관리 경로 안내 | 독립 NSIS 하네스에서 모델 체크박스·40% 진행·긴 문구 높이, 업데이트/복구/삭제/취소·보관함 보존 확인 | 실제 최종 설치 파일의 깨끗한 Windows VM 설치/제거 전체 검증은 미실시 |
| A13 | 시간/레벨 전용 IPC; 스크립트 델타; 녹음별 체크포인트; 입력 대기 버퍼 상한 | 1만 줄 비용 비교 + 60분 PCM을 가속 공급해 36,000조각 저장·복구. 작업 누적 최대 0, WAV/스크립트 복구 통과 | 60분 부하 검사 추론 응답은 모의. 60분 실제 GPU 연속 추론과 UI 전체 비용은 미측정 |
| A14 | 16kHz float32 연속 블록을 임시 파일에 기록하고 전체 음성을 memmap으로 분석 | 1시간 원본 디코딩 RAM 피크 비교; PCM SHA-256 동일. 실제 Sherpa CPU 단일 합성 화자 분석 성공·시간 범위 유지 | 장시간 다화자 정확도/전체 분석 RAM은 미측정. 임시 디스크 공간 추가 사용 |
| A15 | 동일 Work 모델의 직렬 worker 재사용; 30초 유휴 해제; Live/모델 변경/취소/오류/종료 시 해제 | 실제 RTX 2060·CPU 반복 추론, 같은 PID 유지, 실제 CPU 30초 해제. 모델 변경/오류/취소·Live 전환 정책 4개 테스트 통과 | 실제 GPU OOM과 다른 고부하 GPU 앱 경합은 미실시; OOM 오류 응답 주입으로 재시작 검증 |
| A16 | 날짜·상태·시간·폴더 12px, 미리보기 13px; SUIT와 정보 위계 유지 | 실제 카드·작은 카드·목록·다크/라이트에서 글꼴과 크기 확인, 잘림/스크롤 캡처 | 글꼴 변경이나 전면 색상 변경 없음 |

**회귀 검사와 실제 동작 검사**

- `npm run test:release`: **52/52 통과**. 기존 폴더/휴지통 journal·Work/Live 분리·타임스탬프·원본 보존 검사 포함.
- `node --test scripts/work-worker.test.cjs`: **4/4 통과**. 유휴/모델 변경/오류/취소/Live 예약 전에 실제 테스트 worker 종료.
- Python 엔진 준비 **4/4**, 기존 보조 엔진 **2/2** 통과. 기본 엔진 준비에서는 보조 엔진을 건너뛰며, 설치 프로그램의 기본 준비는 계속 포함한다.
- `node scripts/improvements-ui-smoke.mjs`와 `node scripts/improvements-ui-smoke.mjs release/stage5/win-unpacked/LOXT.exe` 모두 통과: 자체 생성 합성 WAV, 독립 프로필, 실제 Electron UI. 미리보기·포커스·드래그·Live 복사/출력·연속 제목 저장·작은 창·Work 녹음·자원 정리·오류 경계 통과.
- 최종 패키지 실행본의 공통 직렬화 모듈, 실제 복사/내보내기, 카드 스크롤/포커스/드래그, 제목 저장, Work 녹음/버리기, 오류 화면 복구까지 확인했다. 로그: [packed-ui.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/packed-ui.log).
- `node scripts/library-interactions-smoke.mjs --theme`: 합성 입력의 실제 MediaRecorder, 영역 선택·그룹 이동·중단 창 닫기·페이지 이동·일시정지·재개·원본 디코딩·저장·버리기 통과.
- `node scripts/live-smoke.mjs --theme`: Windows 음성 합성으로 만든 가짜 마이크 입력을 **실제 RTX 2060 CUDA / large-v3-turbo**로 처리했다. 모델 준비 중 타이머와 기록 없음, 준비 후 자동 시작, 테마/페이지/Work 전환, GPU 대기열 조정, 일시정지 동안 시간 정지, 원본 길이/스크립트 범위, 화자 포함 복사·내보내기, 재실행 보존 통과. 이번 실행 원본 9.6319375초, 확정 구간 4개, UI pageerror 0개.
- 오류 주입 검사: 디스크 권한 실패·보조 엔진 실패·오래된 준비 응답·부분 가져오기·손상 JSON·UI 응답 오류. 실제 장애나 실제 추론 성공으로 포장하지 않았다.
- 마이크는 Chromium 가짜 장치이며 실제 물리 마이크를 검사하지 않았다. 단일 합성 화자로 다화자 정확도를 검증했다고 주장하지 않는다.
- 독립 NSIS 테스트는 실제 프로젝트 매크로와 Python 진행 도우미를 사용하지만 앱 설치 경로·레지스트리·프로세스·모델 캐시는 테스트 소유이다. 현재 Windows 표시 설정 AppliedDPI=120(125%)를 읽었으며, 하네스의 DPI 가상화 가능성을 포함해 다른 실제 DPI 검증을 대신하지 않는다.
- 하네스 수정: NSIS 컨트롤 생성 완료를 기다리고 페이지 전환은 비동기 메시지로 처리했다. 이 두 테스트 타이밍 문제는 제품 설치 실패로 계산하지 않았다. 카드 포커스·텍스트 선택·트리 ESC 문제는 실제 UI에서 확인하고 제품에 수정했다.

**보관함 성능 — 같은 조건의 전후 비교**

Windows / RTX 2060 PC, 1280×880 Electron 창, 독립 프로필, 기록마다 스크립트 100줄. 전후 모두 동일한 WAV와 데이터 구조, 새 프로필의 카드 보기에서 모든 기록 열기→목록 전환을 측정했다. 개선 후는 최종 패키지 실행본 `app:info=1.11.0`이다. 수치는 한 번씩 관측한 값이며 평균·최악 보장을 의미하지 않는다. GPU 실제 추론을 동시에 돌리지 않았다.

| 기록 수 | 보관함 열기 전 → 후 | 목록 전환 전 → 후 | Renderer 작업 집합 전 → 후 |
|---|---|---|---|
| 20 | 273.1 → 103.4 ms | 80.4 → 72.7 ms | 144 → 106 MiB |
| 300 | 1325.5 → 79.2 ms | 413.0 → 72.1 ms | 541 → 167 MiB |
| 1,000 | 4783.7 → 117.8 ms | 1417.8 → 126.7 ms | 1481 → 259 MiB |

1,000개에서 DOM 노드 324,108 → 1,396, 카드 미리보기 100,000줄 → 표시 범위 48줄, 목록의 숨은 미리보기 100,000줄 → 0줄. 같은 진행률 이벤트 5회로 전체 보관함을 읽는 횟수는 4–5회 → 0회. 카드 내부 스크롤에 따라 추가 내용을 읽을 수 있으며 스크롤 위치·텍스트 선택·키보드 포커스를 유지한다.

**긴 Live 전달·저장 비용**

- 기존 코드와 개선 코드를 별도 Node 프로세스로 비교했다. 1만 구간(60분 상태)의 시간 갱신 300회: 직렬화 데이터 294,908,240 → 16,340바이트; 처리 5,671.4 → 1.5ms; 관측 RSS 93.0 → 52.3MiB. 이것은 상태 복제·JSON 직렬화 벤치마크이며 운영체제 IPC 지연을 직접 잰 수치가 아니다. 이벤트 횟수 300회 자체는 유지하고 데이터 크기를 줄였다.
- 같은 1만 구간과 다른 기록 300개에서 체크포인트 3회: 489.8 → 104.6ms, JSON 쓰기 24,018,882 → 4,209,858바이트. 전역 목록 갱신은 없어졌으며 개별 `note.json` 전체는 여전히 저장한다.
- 60분 PCM 가속 공급: 실제 저장·윈도잉·델타 처리, 추론 응답만 모의. 36,000조각, WAV 115,200,044바이트, 확정 667구간. 전체 스냅샷 0회 / meter 36,000회 / patch 2,000회, 직렬화 합계 4,312,992바이트. 20.85초 처리, 작업 대기 최대 0, 관측 RSS 최대 102.9MiB. 체크포인트 1,388회, 최대 51.6ms. 중단 후 3,600초와 모든 확정 구간 복구. 이 가속 검사만으로 느린 GPU나 실제 한 시간 녹음의 안정성을 보장하지 않는다.
- 캡처 전송 대기는 10초 PCM을 상한으로 두고, 인식 대기·worker timeout도 제한한다. 한계에 도달하면 오류를 알리고 원본을 마무리하며 무한 누적하지 않는다.

**긴 음성 메모리와 모델 재사용**

- 1시간 16kHz 음성 디코딩: RAM 피크 **728.8 → 268.7MiB**, 디코딩/해시 시간 **2,603 → 3,261ms**. 출력은 float32 연속 배열, PCM SHA-256 동일. 조용한 합성 WAV의 디코딩 검사이므로 화자 정확도 검사가 아니다.
- 디스크 매핑은 약 230.4MB의 임시 공간(1시간 float32)을 사용한다. 디코딩은 더 느려졌지만 여러 대형 배열의 RAM 복사를 줄인다. 전체 녹음을 같은 화자 알고리즘으로 처리하며 화자 분석을 짧은 청크로 대체하지 않았다. 실제 Sherpa CPU 분석은 약 15.85초 단일 합성 음성으로 확인했다. 장시간 다화자 품질·전체 분석 메모리는 별도 검증 필요.
- 실제 Work CUDA / large-v3-turbo / int8_float16 / 같은 15.85175초 음성: 별도 worker 16.36s·8.34s, 재사용 worker 8.28s·**2.09s**. 파일 캐시와 초기 import 비용 때문에 첫 실행 비교는 통제된 평균이 아니다. 같은 재사용 PID에서 두 번째 처리의 로딩 단계를 없앤 효과를 관측했다.
- CPU int8: 같은 PID에서 18.79s → 10.90s, 이후 **실제 30초 유휴 정책**으로 종료 확인. CUDA 해제 검사는 시간을 줄인 1.5초 테스트 정책으로 확인했고 VRAM은 약 22MiB(다른 기본 사용량)로 돌아왔다. 모델이 유지되는 동안에는 VRAM을 점유한다. CPU 실검사와 동일 공통 코드/회귀 테스트로 30초 정책을 확인했으며 CUDA 30초를 별도 타이밍 측정한 것은 아니다.
- Live 모델 준비 전에 Work 캐시를 해제하고, 모델 변경·오류(OOM 응답 포함)·취소·앱 종료에 종료/재시작 경로를 둔다. 장시간 화자 분석 품질을 낮추거나 새 복잡한 사용자 설정을 추가하지 않았다.

외부 동작 근거: CTranslate2의 모델 메모리 수명은 [공식 메모리 문서](https://opennmt.net/CTranslate2/memory.html), NumPy 디스크 매핑과 해제 제약은 [공식 memmap 문서](https://numpy.org/doc/stable/reference/generated/numpy.memmap.html), 모달의 포커스/배경 차단은 [WAI-ARIA 대화상자 패턴](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)을 확인했다.

**저장 데이터 호환과 복구**

- 내부 appId와 `sorinote-desktop` 경로, Work/Live 각각의 저장소, `library.json` version 1, 기존 원본·스크립트 파일명을 유지했다. `revision`, 복구 안내, `diarization`은 추가 선택 필드이다. 이전 메타데이터를 읽는 검사를 유지했다.
- 검증한 정상 목록의 이전 상태를 `.backup`에 남긴다. 손상 목록은 `library.json.damaged-시각-UUID`로 보존한다. 백업/복구 결과 검증 전에 손상 목록을 삭제하지 않는다.
- 메타데이터 하나가 손상돼도 정상 형제 항목을 읽는다. 읽지 못한 메타데이터도 보존한다. 빈 폴더나 백업 이후 변경을 추정해서 완벽히 복구했다고 표시하지 않는다.
- 복구 저장에 실패하면 손상 목록과 아카이브/원본을 유지하고, 다음 실행에서 다시 복구한다. 폴더·휴지통 journal, `.part`, WAV 체크포인트, 타임스탬프 범위 검증을 유지했다.
- 기존 사용자 데이터는 이 테스트에 사용하지 않았고 삭제·이동·이름 변경하지 않았다.

**소스 위치**

- A01: [src/LiveWorkspace.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LiveWorkspace.jsx):71; [src/WorkspaceBoundary.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/WorkspaceBoundary.jsx):1.
- A02/A15: [electron/transcriber.cjs](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/transcriber.cjs):328,365; [electron/work-worker.cjs](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/work-worker.cjs):4; [python/worker.py](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/worker.py):90; [python/engine_prepare.py](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/engine_prepare.py):87.
- A03/A13: [electron/library.cjs](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs):14,77,176,419,489.
- A04/A16: [src/NoteCard.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/NoteCard.jsx):6,44; [src/App.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/App.jsx):121; [src/LiveWorkspace.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LiveWorkspace.jsx):25; [src/styles.css](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/styles.css):174.
- A05/A13: [electron/live-engine.cjs](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/live-engine.cjs):14,21,102,173; [src/LiveRecorder.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LiveRecorder.jsx):42; [src/liveCapture.js](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/liveCapture.js):1.
- A06/A07/A09: [src/ConversionDialog.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/ConversionDialog.jsx):1; [src/NoteDetail.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/NoteDetail.jsx):32; [shared/transcript.js](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/shared/transcript.js):1.
- A08/A11: [src/Modal.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/Modal.jsx):9; [src/Menu.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/Menu.jsx):21; [src/ActionMenu.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/ActionMenu.jsx):34; [src/styles.css](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/styles.css):181.
- A10: [electron/main.cjs](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/main.cjs):176; [src/LiveWorkspace.jsx](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LiveWorkspace.jsx):89.
- A12/A14: [build/preparation-page.nsh](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/build/preparation-page.nsh):45; [python/installer_progress.py](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/installer_progress.py):1; [python/speakers.py](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/speakers.py):1; [python/diarize_file.py](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/python/diarize_file.py):1.

**화면과 로그**

실제 Electron 화면 캡처이며 일부 상태/오류는 테스트에서 주입했다. 예시 스크립트와 오류 화면은 실제 추론 성공 증거가 아니다. `live-running.png` 및 `live-saved.png`는 합성 마이크 입력의 실제 CUDA 추론 화면이다.

- [test-results/improvements-1.11.0/work-script-dark.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/work-script-dark.png) / [test-results/improvements-1.11.0/work-script-light.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/work-script-light.png)
- [test-results/improvements-1.11.0/cards-dark.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/cards-dark.png) / [test-results/improvements-1.11.0/cards-light.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/cards-light.png) / [test-results/improvements-1.11.0/compact-cards.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/compact-cards.png) / [test-results/improvements-1.11.0/list-view.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/list-view.png)
- [test-results/improvements-1.11.0/small-window-150percent.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/small-window-150percent.png) / [test-results/improvements-1.11.0/small-recording-long-title.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/small-recording-long-title.png)
- [test-results/improvements-1.11.0/live-running.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/live-running.png) / [test-results/improvements-1.11.0/live-saved.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/live-saved.png) / [test-results/improvements-1.11.0/recoverable-ui-error.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/recoverable-ui-error.png)
- [test-results/improvements-1.11.0/installer-progress.png](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/installer-progress.png): 독립 NSIS 하네스의 실제 진행 UI, 모델 다운로드 응답은 예시 이벤트.
- [test-results/improvements-1.11.0/release-tests.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/release-tests.log) / [test-results/improvements-1.11.0/pool-policy.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/pool-policy.log) / [test-results/improvements-1.11.0/engine-tests.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/engine-tests.log)
- [test-results/improvements-1.11.0/ui.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/ui.json) / [test-results/improvements-1.11.0/flows.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/flows.json) / [test-results/improvements-1.11.0/extended-ui.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/extended-ui.json)
- [test-results/improvements-1.11.0/real-live.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/real-live.log) / [test-results/improvements-1.11.0/real-live-result.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/real-live-result.json) / [test-results/improvements-1.11.0/interactions-ui.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/interactions-ui.log)
- [test-results/improvements-1.11.0/performance-after-final.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/performance-after-final.json) / [test-results/improvements-1.11.0/live-cost.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/live-cost.json) / [test-results/improvements-1.11.0/live-hour.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/live-hour.json)
- [test-results/improvements-1.11.0/decode-before.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/decode-before.json) / [test-results/improvements-1.11.0/decode-after.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/decode-after.json) / [test-results/improvements-1.11.0/speakers-after.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/speakers-after.json)
- [test-results/improvements-1.11.0/worker-before.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/worker-before.json) / [test-results/improvements-1.11.0/worker-after.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/worker-after.json) / [test-results/improvements-1.11.0/worker-cpu.json](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/worker-cpu.json)
- [test-results/improvements-1.11.0/installer-lifecycle.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/installer-lifecycle.log) / [test-results/improvements-1.11.0/installer-models.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/installer-models.log) / [test-results/improvements-1.11.0/package.log](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/improvements-1.11.0/package.log)

**배포 결과와 남은 검증**

- 최종 버전 **1.11.0**: package.json, 잠금 파일의 루트/패키지 버전, 패키지 앱 표시, Windows 설치 파일 ProductVersion, 배포 메타데이터 일치.
- Windows 설치 파일: [release/stage5/LOXT-Setup-1.11.0-x64.exe](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/release/stage5/LOXT-Setup-1.11.0-x64.exe) (155,817,573바이트).
- SHA-256: `52d8ac4471fa7ecb5e501de862992dd4f0fefbe452bdf4069c953737643e29e5`.
- [scripts/release-manifest.mjs](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/scripts/release-manifest.mjs)로 패키지 안 Electron/공통 직렬화/Python 소스가 현재 파일과 일치하는지 확인했다. YouTube 도구 무결성, 테스트 파일 미포함, 실행본의 1.11.0 표시도 확인했다.
- 설치 파일은 코드 서명되지 않았다. 빌드 로그의 signing 단계 이름이 인증서 서명을 의미하지 않으며 release.json의 signed=false를 유지했다.
- 소개 사이트의 폴더 보존·화자 실패 시 기본 스크립트 보존 설명을 갱신하고 빌드했다. 기존 작업 중이던 사이트 디자인·캡처는 보존했다. 다운로드는 실제 공개된 **1.10.0** URL 그대로이며 새 1.11.0 GitHub 주소를 만들지 않았다. 1.11.0 공개 뒤 주소·사이트 버전·스크린샷을 함께 갱신해야 한다.
- GitHub 업로드, 커밋/푸시, 사이트 외부 배포를 실행하지 않았다.
- A01–A16의 코드 수정은 반영했다. 미완료는 검증 범위: 물리 장치/출력 장치 변경, 장시간 다화자 정확도와 전체 화자 분석 RAM, 장시간 실제 GPU+UI 세션, 실제 OOM/다른 GPU 앱 경합, 깨끗한 Windows VM 설치/제거 및 100/150/200% 실제 DPI 매트릭스. 해당 검증 없이 모든 PC에서 동일 결과가 보장된다고 표현하지 않는다.

**추가 검증 방법과 이번에 남긴 이유**

- 실제 설치·제거와 DPI 매트릭스: 이번 작업에 독립 Windows VM이 준비되어 있지 않아, 사용자 PC의 설치 상태나 표시 배율을 바꾸는 대신 격리 NSIS 하네스를 사용했다. 깨끗한 Windows VM 스냅샷에서 신규 설치→모델 준비→실행→업데이트/복구→제거를 수행하고, 100/125/150/200% 배율에서 다시 확인해야 한다.
- 물리 마이크/헤드셋/출력 변경: 사용자 컴퓨터의 기본 출력 장치·볼륨 변경 금지 조건을 유지했다. 별도 테스트 PC에서 스피커/유선/USB/블루투스 장치 연결·해제·전환을 검사해야 한다.
- 장시간 다화자 품질: 단일 합성 음성과 1시간 무음은 정답 화자 구간이 있는 다화자 데이터셋을 대신하지 못한다. 동의를 받은 별도 다화자 자료로 화자 재등장·중첩 발화·시간 정렬과 이전 코드 결과를 비교해야 한다. 현재 구현은 전체 음성과 기존 모델/설정을 그대로 사용한다.
- 장시간 실시간 GPU와 OOM: 사용 중인 GPU를 강제로 채우거나 다른 앱에 부하를 주지 않았다. 60분 이상의 실제 입력을 유지한 테스트 PC에서 지연·대기열·VRAM/RAM을 연속 관측하고, 제한된 전용 프로세스로 OOM 복구를 검사해야 한다. 이번의 60분 가속 PCM 검사에는 모의 추론 응답을 사용했다.
