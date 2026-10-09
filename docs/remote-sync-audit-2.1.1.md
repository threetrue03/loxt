# LOXT 2.1.1 외부 기기 반영 지연 조사

조사일: 2026-10-09 KST. 조사와 보고만 진행했습니다. 앱·서버·설정·설치 프로그램·소개 사이트 코드, 버전 및 실제 사용자 데이터는 수정하지 않았습니다.

## 결론과 중요한 문제 5개

외부 작업의 지연을 키우는 공통 저장·조회 구조와, 지연처럼 보이지만 실제로는 화면이 갱신되지 않는 버그를 확인했습니다. 작은 예시 보관함의 정상 경로에서는 웹 메모 → PC 본문이 약 0.29–0.31초, 폴더 생성 → PC 사이드바가 28ms였습니다. 모든 요청이 원래 수 초 걸리도록 설계된 것은 아닙니다. 실제 사용 중의 긴 지연은 작업 종류·보관함 크기·대기 중인 저장·네트워크 상태를 함께 구분해야 합니다.

1. **D01: 열린 제목 갱신 누락과 이전 이름 덮어쓰기.** 외부에서 변경한 메모·PDF 이름은 서버에 저장되지만 PC의 열린 제목 입력칸은 그대로입니다. PDF에서는 입력 내용을 수정하지 않고 포커스만 이동해도 새 이름을 예전 이름으로 되돌리는 문제까지 재현했습니다.
2. **D02: PDF 연속 필기는 멈출 때까지 저장이 밀립니다.** 매 획마다 250ms 타이머를 다시 시작하며 최대 대기 시간이 없습니다. 12획을 약 1.56초 동안 그리는 동안 PC에는 새 획이 하나도 반영되지 않았고, 멈춘 뒤 한 번에 반영됐습니다.
3. **D03·D05: 한 문서를 저장해도 전체 보관함을 다시 쓰고 여러 번 다시 읽습니다.** 예시 녹음 1,000개·녹음당 100구간에서 메모 저장 중앙값은 432ms, 목록 한 번 복제는 71ms, 응답 크기는 약 13.35MB였습니다. 보관함이 클수록 저장·CPU·전송량이 함께 늘어납니다.
4. **D04: 한 변경으로 여러 화면과 메모 캐시를 모두 갱신합니다.** 웹 메모 한 번 수정할 때 PC는 전체 목록 2번, 이미 열어본 메모 6개를 다시 읽었습니다. 같은 웹에서도 전체 목록을 2번 요청했습니다.
5. **D06·D07: 다른 저장 작업을 기다리거나 갱신 알림을 놓칠 수 있습니다.** 같은 워크스페이스의 목록 조회도 쓰기 큐를 기다립니다. 조회 중 도착한 추가 알림은 후속 재조회로 이어지지 않아, 다음 이벤트가 올 때까지 오래된 목록이 남을 수 있습니다.

위 문제들은 iPad 전용 코드에만 존재하는 것이 아닙니다. 웹으로 접속하는 iPhone·다른 PC·태블릿과 PC 앱이 공유하는 경로입니다. 다만 기기별 Wi-Fi 품질과 브라우저 정책의 추가 영향은 이번에 실기기로 측정하지 않았습니다.

## 조사·측정 조건

- 현재 `package.json`: **2.1.1**. 최종 `release/stage5/win-unpacked/LOXT.exe`와 같은 버전의 소스를 조사했습니다. 사용자 PC에서 실제 실행 중인 설치 버전은 별도로 확인하지 않았습니다.
- CPU: AMD Ryzen 7 4800H. Windows에서 설치본 Electron과 Microsoft Edge를 함께 실행했습니다.
- UI 통신: **127.0.0.1 HTTPS**. 실제 공유기·무선망 왕복 시간을 제외하고 앱 내부 경로를 측정했습니다.
- 모든 UI 기록·메모·PDF는 `test-results/sync-audit-2.1.1/ui-profile-*`의 별도 예시 보관함입니다. 실제 마이크·컴퓨터 소리·GPU 추론은 사용하지 않았습니다.
- 저장 규모 비교: 예시 녹음마다 100개 스크립트 구간, 총 기록 10·250·1,000개. 원본 음성 분석을 수행한 결과가 아니라 인덱스 비용을 측정하기 위한 합성 메타데이터입니다.
- 저장 측정은 각 조건 5회, 메모·PDF 저장과 목록 조회를 순차 실행했습니다. UI 실행 계측과 GC 등의 영향을 포함하며 정밀 하드웨어 벤치마크로 해석하지 않습니다.
- 프로젝트의 OneDrive 경로와 Windows 일반 임시 폴더의 별도 프로필을 비교했습니다. 이번 결과만으로 OneDrive·백신을 원인으로 단정하지 않습니다.
- 실제 파일 기록·PC 승인·HTTP 요청·DOM 변경 시간을 측정했습니다. GPU 추론 성공을 화면 상태로 가정하지 않았습니다.

## 정상 경로와 지연이 붙는 위치

```text
외부 편집
  → 브라우저 자동 저장 대기
  → 전체 메모/필기 내용을 RPC로 전송
  → PC의 해당 Work/Live 보관함 큐 대기
  → 문서 백업 + 본문 기록 + note.json + 전체 library.json 기록
  → library 변경 알림 (외부 기기 SSE / PC IPC)
  → 각 구독자가 목록·메모·PDF를 다시 조회
  → React 상태 갱신 및 화면 표시
```

알림은 [main.cjs](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/main.cjs:507)에서 저장 이후 즉시 전송합니다. [device-server.cjs](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-server.cjs:49)의 **15초 heartbeat는 연결 유지용**입니다. 변경 사항을 15초마다 묶어서 보내는 타이머가 아닙니다. 10초 네트워크 검사도 IP 변경 감지이며 일반 작업 동기화 주기가 아닙니다.

## 측정 결과

### 실제 설치본 ↔ 웹 화면

| 조건 | 결과 | 해석 |
| --- | --- | --- |
| 작은 보관함, 웹에서 메모 입력 → 열린 PC 본문, 4회 | 313·310·301·290ms | 정상 상태에서도 자동 저장 대기가 대부분을 차지함 |
| 웹에서 폴더 생성 → PC 사이드바 | 28ms, 1회 | 모든 외부 요청의 기본 지연이 수 초인 것은 아님 |
| 메모 한 번 저장, PC에서 6개 메모를 열어본 상태 | PC 목록 2회 + 메모 본문 6회 조회; 웹 목록 2회 조회 | 변경 문서만 갱신하지 않음 |
| 12획을 약 100ms 간격으로 연속 입력 | 1,564ms 동안 PC 획 수 변화 없음; 마지막 획을 올린 뒤 약 297ms에 반영 | `durationMs`에는 마지막 획 이후 100ms 시험 간격이 포함됨. 전체 루프 종료 기준 지연은 194ms |
| 외부에서 열린 메모 제목 변경 | 서버는 새 이름, PC 입력칸은 2초 후에도 이전 이름 | 기다려 해결되는 정상 지연이 아니라 제목 상태 갱신 누락 |
| 외부에서 열린 PDF 제목 변경 | 서버는 새 이름, PC 입력칸은 이전 이름 | 같은 문제 |
| 위 PDF 제목칸에 포커스 후 다른 버튼 클릭, 편집 없음 | `외부 PDF 제목` → `예시 PDF`로 서버 이름 되돌아감 | 실제 이전 값 덮어쓰기 재현 |
| 실제 Work 큐에 1,500ms 시험 작업 삽입 | 후속 웹 폴더 생성 1,518ms | 인위적으로 주입한 큐 경합 증거. 실제 파일 가져오기 지연 수치는 아님 |
| 가상 음성 바이트를 1MB씩 16회 업로드 | 첫 조각 95ms, 16번째 조각 156ms | 원본 전체를 가진 IndexedDB 레코드 재저장 구조 확인. 실제 압축 녹음 1초 조각의 수치로 일반화하지 않음 |

### 보관함 규모별 PC 서비스 비용

Windows 일반 임시 폴더의 별도 프로필, 각 5회 중앙값입니다. 네트워크와 React 표시 시간은 포함하지 않습니다.

| 기록 수 | 목록 응답 JSON | 디스크 인덱스 JSON | 메모 저장 | PDF 필기 저장 | 목록 복제 | 관측된 이벤트 루프 최대 지연 |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 약 0.108MB | 약 0.152MB | 38.39ms | 36.23ms | 0.52ms | 15.79ms |
| 250 | 약 3.32MB | 약 4.68MB | 138.58ms | 129.39ms | 16.75ms | 106.69ms |
| 1,000 | 약 13.35MB | 약 18.85MB | 431.82ms | 394.17ms | 71.00ms | 449.05ms |

메모 본문을 몇 글자만 바꿔도 다른 기록의 스크립트가 포함된 전체 인덱스 비용이 발생합니다. 프로젝트 경로에서도 1,000개 메모 저장 중앙값은 421.49ms로 비슷했습니다. **이번 지연을 OneDrive 때문이라고 판단할 근거는 없습니다.** 실제 사용자의 보관함 수·크기는 조사하지 않았습니다.

13.35MB 목록을 한 웹 화면이 2회 다시 받으면 약 26.7MB를 전송합니다. 압축을 하지 않는 현 코드에서 전송 속도가 가령 20Mbps라면 단순 데이터 전송량 계산만 약 10.7초입니다. 이는 **가정에 따른 계산**이며 실제 Wi-Fi 속도·사용자 데이터·관측 지연값이 아닙니다.

## 전체 발견 사항

규모: 소=국소 상태/알림 수정, 중=여러 클라이언트·서버 경로 조정, 대=저장·전송 형식 변경과 마이그레이션 검증. P0으로 단정할 데이터 본문 손실은 이번 조사에서 재현하지 않았습니다.

| ID | 우선순위 | 문제와 사용자 영향 | 근거 / 검증 상태 | 권장 방향 | 규모 |
| --- | --- | --- | --- | --- | --- |
| D01 | P1 | 열린 메모·PDF·녹음 제목 상태가 원격 이름 변경을 따라가지 않음. PDF는 편집 없이 포커스만 이동해도 새 이름을 이전 값으로 덮어씀 | 메모·PDF 제목 미갱신 및 PDF 덮어쓰기 실제 재현. 녹음도 동일한 의존성 구조를 코드상 확인 | 로컬 편집 초안과 원격 최신 값을 구분, 편집 중이 아닐 때 제목 동기화, 실제 변경 때만 저장, PC 메타데이터 저장에도 expected/CAS 적용 | 중 |
| D02 | P1 | 연속 PDF 필기 중 자동 저장이 계속 뒤로 밀림 | `modify()`의 250ms 타이머 재설정, 최대 대기 없음. 12획 실제 재현 | 짧은 debounce와 최대 대기 시간을 함께 사용. 저장 중 새 획은 다음 저장에 포함. 안전한 내구 저장과 미확정 미리보기를 구분 | 소–중 |
| D03 | P1 | 한 메모·필기 변경마다 전체 보관함 인덱스 기록·백업·복제. 보관함 크기가 다른 작업의 지연을 결정 | 10→1,000개 저장 비용 실제 측정, `saveNote → saveIndex → snapshot` | 본문 저장/문서 이벤트를 목록 미리보기 갱신과 분리. 전체 인덱스 갱신을 안전하게 묶고, 스크립트 본문은 상세 조회로 분리. 원자성·복구 보존 | 대 |
| D04 | P1 | 변경마다 PC·웹의 중복 목록 조회와 모든 열린/캐시 메모 재조회 | 한 변경에 PC 목록 2 + 메모 6, 웹 목록 2 실제 계측 | 변경 이벤트에 문서 ID·종류·revision 포함, 중앙 저장소/요청 공유, 해당 문서·워크스페이스만 갱신 | 중 |
| D05 | P1 | 전체 스크립트를 포함한 목록을 매번 PC IPC와 외부 RPC로 복제·전송 | 예시 1,000개 13.35MB/응답 측정. HTTP 응답 압축 없음 코드상 확인 | 목록은 요약 메타데이터·필요 페이지만, 선택 문서 본문 별도 조회, revision 이후 변경분 전달. 압축은 전송 개선 보조 수단 | 대 |
| D06 | P1 | 쓰기·목록 조회가 Work/Live별 단일 큐에서 앞선 무거운 작업을 기다림 | 1,500ms 주입 시 직접 메모 저장/목록 1,547ms 및 설치본 웹 요청 1,518ms. 실제 원본 가져오기 시간은 미측정 | 읽기는 완료된 일관된 스냅샷 사용, 원본 복사·PDF 파싱 등은 긴 큐 점유 축소, 문서별 저장 직렬화와 인덱스 커밋 보호 유지 | 중–대 |
| D07 | P1 | 조회 진행 중 새 변경 알림을 받으면 기존 Promise만 재사용하고 이후 다시 조회하지 않음 | 실제 `refreshLibrary()` 함수를 그대로 실행한 지연 응답 재현: 알림 2번, 조회 1번, revision 1 유지; 추가 알림 후 2로 갱신 | 요청 중 invalidated/최신 목표 revision 기록, 완료 뒤 목표에 미달하면 재조회. 응답 역전 방지도 유지 | 소 |
| D08 | P1 | 본문 저장은 성공했는데 목록 미리보기 저장 실패를 무시하면 변경 알림 자체가 나가지 않을 수 있음 | `Memos.save()`의 index 실패 catch; library 알림은 `saveIndex()`에서만 발생. 코드상 확인, 디스크 실패 실험은 미실행 | 내구 본문 저장 이후 문서 전용 이벤트 발행. 목록 실패는 별도 재시도·오류 상태로 표현하고 본문 성공과 구분 | 중 |
| D09 | P2 | RPC 재실행 방지 캐시에 읽기 결과와 큰 목록을 최대 1,000건 보관, TTL·바이트 상한 없음 | 소규모 UI 실행 중 캐시 32건·그 중 목록 20개 보관 확인. 큰 보관함 장시간 RAM/GC 영향은 추가 검증 | 읽기 RPC 캐시 제외, 변경 요청은 작은 결과와 완료 후 유효 기간·총 바이트 상한 적용. 진행 중 요청과 재시도 안전성 유지 | 중 |
| D10 | P2 | 모바일 녹음 조각 추가와 체크포인트마다 누적 원본 전체가 든 IndexedDB 레코드를 다시 저장 | 실제 가상 바이트 업로드 95→156ms 및 코드상 전체 `chunks` 레코드 get/put 확인. 브라우저 디스크의 실제 쓰기 증폭량은 미측정 | 조각을 `(host,id,sequence)`별 레코드로 저장, 세션 메타데이터 별도 관리. 서버 업로드 순서·복구·중복 조각 방지 유지 | 중 |
| D11 | P1 | RPC fetch/XHR에 명시적 타임아웃·진행 중단 정책이 없고, 갱신 조회 실패는 여러 곳에서 조용히 무시됨 | 코드상 확인. Wi-Fi 먹통으로 실제 장시간 요청 미완료 상태는 미재현 | 연결/응답 제한 시간, 재시도와 상태 표시, 재연결·foreground 복귀 시 revision 대조. 원본/초안 보존하며 수정 요청 중복 방지 유지 | 중 |
| D12 | P2 | PDF를 열 때 전체 원본을 받아 메모리에 올리고 매번 모든 페이지 텍스트를 재추출·PC에 재색인 | `pdf.bytes()` 전체 arrayBuffer, `PdfPage` 전체 페이지 loop, `pdf.index()` 항상 저장. 코드상 확인 | 원본 버전별 색인 캐시·PC 1회 처리, 이미 색인된 문서 재작성 생략, 승인된 URL의 Range 스트리밍 검토 | 중 |
| D13 | P2 | 제목 검색에도 본문을 먼저 준비하고 PDF·메모 파일을 직렬로 읽음. 모든 인덱스 갱신이 열린 검색을 다시 실행 | 웹 search 루프와 `LibraryView` revision 의존성 코드상 확인 | 제목 전용 경로에서 본문 I/O 생략, 본문 검색 색인 이용, 관련 폴더·필드 변경에만 재검색 | 중 |
| D14 | P2 | 화면/탭의 모델 환경 조회가 GPU·Python probe를 다시 실행할 수 있음. 웹 convert도 먼저 환경 탐지 | `environment → detect → nvidia-smi/probe/modelList`, 여러 컴포넌트 호출 코드상 확인. 이번에 실제 변환 시작 시간은 미측정 | 준비 상태 스냅샷·진행 중 요청 공유·짧은 캐시, 모델/장치 변경 시 무효화. 실제 실행 직전 안전 검증 유지 | 중 |
| D15 | P2 | SSE에 변경 재생 ID·수신 느린 클라이언트의 버퍼 관리가 없고 HTTP/1 연결을 오래 점유. Live preview도 전체 스크립트를 전송 | 코드상 확인. 다중 탭·약한 Wi-Fi·장시간 Live 부하 미재현. 기존 재연결 시 전체 목록 재조회는 있음 | revision 재조정, 버퍼 상한/최신 상태 병합, 연결 공유 또는 적절한 전송 방식 검토, Live append/preview 차등 이벤트 | 중 |
| D16 | P2 | 큰 문서의 클라이언트 처리도 비쌈: 전체 blocks 비교·localStorage 직렬화, 전체 필기 전송·검증·SVG 재구성 | 메모/PDF 편집 경로 코드상 확인. 실제 iPad 긴 문서 프레임 시간 미측정 | revision 기반 원격 변경 적용, 초안 체크포인트 비용 제한, 필기 포인트 정리·변경 객체 전송·페이지별 조회 검토 | 중–대 |

## 중요한 항목의 재현과 정확한 코드 위치

### D01 — 제목 상태 미갱신 및 이전 이름 복원

- [MemoPage.jsx:4](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/MemoPage.jsx:4): `title`을 로컬 state로 초기화하고 `note.id`가 바뀔 때만 갱신.
- [NoteDetail.jsx:30](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/NoteDetail.jsx:30), [NoteDetail.jsx:40](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/NoteDetail.jsx:40): 녹음 제목도 같은 구조. `savedTitle`만 prop 변경을 따라가며 표시 state는 그대로.
- [PdfPage.jsx:19](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:19): PDF 제목 초기 state. [PdfPage.jsx:38](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:38): blur 시 변경 여부 비교 없이 `onUpdate()`.
- [library.cjs:469](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:469): expected가 전달될 때만 메타데이터 충돌 확인. 웹은 expected를 전달하지만 PC의 일반 update 호출은 전달하지 않음.

재현: PC에서 예시 메모/PDF를 연다 → 승인된 웹에서 제목을 변경한다 → PC를 기다려 본다 → 서버 값은 변경됐지만 제목 입력칸은 그대로다. PDF 제목칸에 포커스 후 다른 버튼을 누르면, 입력 없이 서버 제목까지 이전 이름으로 되돌아간다.

기대: 편집 중이 아니라면 새 이름 표시, 편집 중이면 충돌을 명시하고 새 원격 값을 조용히 덮어쓰지 않음. 본문 소실을 이번에 확인한 것은 아니지만 메타데이터 손실은 실제 재현했으므로 우선 대응할 필요가 있습니다.

### D02 — 필기 저장이 멈출 때까지 밀림

- [PdfPage.jsx:16](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:16): 각 `modify()`에서 `clearTimeout` 뒤 250ms 재설정.
- [PdfPage.jsx:15](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:15): 진행 중 저장 이후 dirty가 남으면 200ms 뒤 후속 저장. 최초 저장의 최대 대기 보장은 없음.
- [memoStore.js:57](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:57): 메모에는 2초 최대 대기 체크포인트가 있어 PDF와 동작이 다름.

재현: PC와 웹에서 같은 PDF를 연다 → 웹에서 250ms보다 짧은 간격으로 12획을 그린다 → PC에는 기존 획만 남는다 → 입력 중단 후 새 획 전부 표시된다. 네트워크가 빠른 loopback에서도 발생했습니다.

권장: PDF에도 최대 대기 시간을 둡니다. 너무 잦은 내구 저장은 D03 비용을 키우므로 문서 이벤트/색인 분리와 함께 조정해야 합니다. 실시간 획 미리보기까지 요구한다면 확정 저장과 별도 프로토콜로 검토해야 하며, 이 조사에서 구현하지 않았습니다.

### D03–D06 — 저장·알림·조회 비용의 확대

- [memos.cjs:75](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/memos.cjs:75): 백업 본문 → 새 본문 → saveNote.
- [pdfs.cjs:50](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/pdfs.cjs:50): 필기 백업 → 새 필기 → saveNote.
- [library.cjs:44](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:44): JSON 직렬화 → 파일 기록 → `FileHandle.sync()` → rename.
- [library.cjs:176](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:176): 이전 전체 index 읽기·검증·백업, 새 전체 index 기록.
- [library.cjs:252](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:252): note 기록 뒤 전체 index와 snapshot.
- [library.cjs:189](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:189): 전체 목록을 `JSON.stringify/parse`로 복제, [library.cjs:192](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:192): 조회도 enqueue.
- [App.jsx:132](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/App.jsx:132), [LiveWorkspace.jsx:34](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LiveWorkspace.jsx:34), [LibraryView.jsx:32](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LibraryView.jsx:32): 서로 다른 전체 목록 구독.
- [memoStore.js:25](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:25): 어느 library 알림이든 clean 상태의 모든 메모 캐시 조회. 문서 ID 및 workspace 필터 없음.

파일 API는 Promise 기반이므로 `FileHandle.sync()`를 곧바로 JavaScript 동기 파일 API라고 부르면 안 됩니다. 내구 저장이 끝날 때까지 해당 작업 큐는 기다리고, 그 주변의 큰 JSON 직렬화·검증·복제는 메인 이벤트 루프를 점유합니다. [Node 파일 API](https://nodejs.org/api/fs.html#filehandlesync)

권장: 안전장치인 sync·백업·CAS를 일괄 제거하는 방식은 피합니다. 문서별 내구 저장, 요약 색인 커밋, 읽기 스냅샷, 변경 문서 이벤트의 책임을 나누는 것이 핵심입니다. SQLite 등의 저장 구조 전환은 장기 선택지이며 지금 당장 전면 전환만이 해법인 것은 아닙니다.

### D07–D08 — 다음 알림을 기다리게 되는 갱신 누락

- [LibraryView.jsx:23](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LibraryView.jsx:23): pending이면 기존 조회 Promise 반환; invalidated 상태/후속 재조회 없음.
- [memos.cjs:85](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/memos.cjs:85): optional preview/index 저장 실패 무시.
- [library.cjs:187](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/library.cjs:187): 변경 알림은 index 기록 성공 후 발생.
- [memoStore.js:26](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:26), [PdfPage.jsx:25](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:25): 로컬 dirty/saving이면 원격 본문 적용 보류. 충돌 보호 자체는 필요하나 갱신 대기와 충돌 상태를 구별해 안내할 필요가 있음.

D07은 실제 함수 소스를 수정 없이 추출해 느린 revision 1 응답 중 revision 2 알림을 주입했습니다. 호출 2회에 실제 읽기 1회, 최종 cache revision 1이었고 추가 이벤트 후에야 2가 됐습니다. 이것은 **제어된 응답 지연 재현**이며 실제 iPad에서 발생한 패킷 손실을 측정했다는 의미는 아닙니다.

### D09–D11 — 오래 쓸수록 또는 연결이 불안정할 때

- [device-server.cjs:51](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-server.cjs:51): 모든 RPC 결과 Promise를 `results`에 최대 1,000개 보관. 완료 시간/총 크기 상한 없음. 중복 write 방지 목적은 유지하되 읽기 응답 캐시와 분리해야 함.
- [webRecordingJournal.js:27](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webRecordingJournal.js:27), [webRecordingJournal.js:40](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webRecordingJournal.js:40): 원본 조각 배열을 포함한 단일 레코드 get/put.
- [webAdapter.js:47](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webAdapter.js:47): 로컬 IndexedDB 완료 뒤 PC upload 시작.
- [webAdapter.js:13](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webAdapter.js:13): 네트워크 예외가 실제 발생해야 0.5초/1초 재시도 대기로 이동; 요청이 오래 pending이면 다음 재시도도 시작하지 않음.
- [webAdapter.js:16](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webAdapter.js:16), [webAdapter.js:21](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webAdapter.js:21): XHR timeout·fetch AbortController 기반 RPC 응답 제한 없음. 2.1.1의 승인 화면 AbortController는 일반 편집 RPC에 적용되지 않음.

가상 조각 측정은 PC와 웹 전체 경로 시간이므로 증가량 전부를 IndexedDB 디스크 비용이라고 분리해 단정하지 않습니다. 바이너리 RPC의 시작 시각은 진단 스크립트에서 헤더를 분석하지 않아 null로 남았으며, 그 값을 이용한 단계별 분석은 하지 않았습니다.

### D12–D16 — 큰 파일·검색·여러 탭·Live

- [webAdapter.js:44](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webAdapter.js:44), [PdfPage.jsx:22](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:22): 원본 전체 로딩과 전체 페이지 재색인. 파일 서버는 Range를 지원하나 현재 PDF bytes 경로는 이를 활용하지 않음.
- [device-server.cjs:45](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-server.cjs:45): 정적 JS·CSS·폰트·PDF도 no-store. 해시가 붙은 정적 리소스는 문서 권한·사용자 파일과 캐시 정책을 구분할 여지가 있음.
- [web-services.cjs:17](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/web-services.cjs:17): 제목 검색에도 본문을 구성하고 PDF/memo를 루프에서 순차 읽음.
- [LibraryView.jsx:65](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/LibraryView.jsx:65): 전체 library revision마다 검색 재실행.
- [conversion-queue.cjs:68](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/conversion-queue.cjs:68), [transcriber.cjs:222](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/transcriber.cjs:222), [web-services.cjs:15](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/web-services.cjs:15): 환경 조회가 하드웨어·Python probe와 모델 목록 조회로 연결됨.
- [device-server.cjs:44](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-server.cjs:44): `res.write()` 반환값/버퍼 크기를 처리하지 않음. Node는 false를 반환할 때 drain 등으로 쓰기 속도를 조절하도록 설명합니다. [Node 스트림 API](https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback)
- [main.cjs:518](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/main.cjs:518): PC는 Live patch를 쓰지만 웹에는 `live.snapshot()` 전체를 전송. [webAdapter.js:35](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webAdapter.js:35): 웹 onPatch/onMeter 미사용. 숫자만 변경하는 Live 상태는 notifyMeter 경로라 웹 타이머 표시도 별도 확인 필요.
- [MemoEditor.jsx:62](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/MemoEditor.jsx:62): 전체 문서 JSON 비교와 원격 블록 치환. [memoStore.js:7](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:7): 매 편집 초안 전체 localStorage 기록.
- [PdfPage.jsx:31](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:31): 포인터 이동마다 기존 points 배열 복사. [PdfPage.jsx:34](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/PdfPage.jsx:34): 필기 좌표 재변환과 SVG 재구성.

서버는 HTTP/1 HTTPS이고 웹 탭마다 SSE 1개를 엽니다. 같은 브라우저·같은 origin에서 여러 탭을 열면 HTTP/1 연결 수 제한이 다른 요청을 방해할 수 있습니다. 이는 **조건부 위험**이며 단일 iPad 화면의 모든 지연 원인으로 단정하지 않습니다. [MDN SSE 설명](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#listening_for_custom_events)

## 해결 순서와 완료 판정 제안

1. **즉시: D01·D02·D07·D08·D11.** 이전 이름 덮어쓰기 차단, 원격 최신값 적용, PDF 최대 저장 대기, 누락 invalidation 재조회, 본문 저장 이벤트와 연결 오류 재시도 보강. 사용자 데이터·충돌 보호를 우선 유지.
2. **같은 업데이트에서 묶기: D03–D06·D09.** 문서 ID별 이벤트/조회 공유, 읽기와 쓰기 비용 분리, 작은 목록 응답, 불필요한 전체 snapshot·결과 캐시 축소. 자동 저장만 더 자주 돌리면 현재 병목을 키우므로 함께 해결할 필요가 있음.
3. **문서 규모 최적화: D10·D12–D16.** 조각별 IndexedDB, PDF 색인 재사용·대용량 로딩, 제목 전용 검색, 준비 상태 조회 캐시, Live 변경분 전송, 긴 메모/필기 렌더링.
4. **마지막에 실기기 Wi-Fi 검증.** 같은 Wi-Fi에서 정상·약한 신호·브라우저 복귀·PC 변환 동시 사용·다중 탭을 각각 측정. 클라이언트 편집 시각, RPC 시작, PC 큐 진입/종료, 내구 저장, 변경 알림, PC DOM 표시를 분리 기록. 기기 시계 차이 때문에 서로 다른 기기의 Date.now 값을 그대로 빼지 않고 공통 서버 시각/보정 또는 왕복 시각을 사용.

제안하는 완료 기준은 측정값이 아니라 앞으로 정할 목표입니다: 작은 정상 작업의 체감 반영 수백 ms, 연속 입력 중 일정 간격으로 PC에도 진행 표시, 늦게 도착한 응답 때문에 최신 revision이 뒤로 가지 않기, 일시 단절 후 별도 편집 없이 재조정, 제목 변경이 되돌아가지 않기. 실제 성능 목표는 10·250·1,000개 보관함과 긴 PDF·실기기 조건을 명시해 확정하는 것이 적절합니다.

## 유지해도 되는 부분

- PC가 보관함의 기준 저장소이고 외부 기기는 승인 후 같은 문서 ID를 사용하는 구조.
- Work/Live 보관함 분리, 즉시 변경 알림, 재연결 시 목록 재조회.
- revision 기반 메모/PDF 충돌 거부와 로컬 초안 보존. 동시 편집 데이터를 조용히 덮어쓰는 최적화는 피해야 함.
- 순서 있는 녹음 조각 업로드와 requestId 기반 변경 요청 중복 방지.
- 원자 파일 교체, 백업, 원본 보존. 느리다는 이유만으로 안전장치를 없애지 않음.
- 카드/스크립트 미리보기·PDF 페이지 썸네일의 보이는 영역 중심 렌더링.
- 다크·라이트 테마·SUIT·LOXT 디자인을 바꿀 필요는 없음. 이번 원인은 주로 데이터 저장·갱신 경로임.

## 검증과 증거 파일

- [설치본/웹 계측 JSON](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/ui-results.json), [계측 스크립트](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/ui-probe.mjs).
- [프로젝트 경로 규모별 측정](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/backend-results.json), [일반 Windows 임시 폴더 측정](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/backend-local-results.json), [서비스 계측 스크립트](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/backend-probe.mjs).
- [조회 중 invalidation 재현](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/refresh-results.json), [실제 함수 실행 스크립트](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/refresh-probe.mjs).
- [PC에 이전 제목이 남은 화면](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/stale-memo-title.png).
- 관련 기존 테스트 `node --test scripts/v2-services.test.cjs scripts/connection.test.cjs`: **8/8 통과**. [로그](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/test-results/sync-audit-2.1.1/regression.log). 저장·인증·PDF 회귀 검사는 성능 또는 동기화 누락을 모두 보장하는 테스트가 아님.
- 초기 자동 계측의 offscreen 카드 버튼 대기는 카드의 지연 렌더링을 고려하지 않은 테스트 문제였습니다. 해당 카드로 스크롤하고 별도 프로필로 재실행해 완료했습니다.
- 샌드박스의 HTTPS EACCES와 임시 폴더 rename EPERM은 환경 제한이었습니다. 동일 검증을 허용된 일반 실행 환경에서 다시 완료했으며 앱의 연결/저장 실패로 보고하지 않습니다.
- 조사 스크립트는 실행 중인 예시 프로세스에 계측 래퍼만 설치했고 앱 파일을 수정하지 않았습니다. 테스트 종료 시 해당 프로세스·브라우저·예시 서버를 종료했습니다. 인증 토큰/세션 쿠키를 보고서에 기록하지 않았습니다.

## 확인하지 못한 범위

- 실제 iPad/iPhone Safari의 왕복 시간·Wi-Fi 패킷 손실·절전/화면 전환, Apple Pencil의 긴 필기 지연.
- 실제 사용자의 설치 버전·보관함 위치/크기·PC CPU/RAM 사용량·백신·클라우드 동기화 간섭.
- 실제 GPU 변환·Live와 대규모 외부 편집을 함께 실행했을 때의 지연 및 장시간 RAM 추이.
- 20기기/40연결 한계, 여러 탭의 실제 HTTP 연결 포화, 장시간 SSE 버퍼 누적.
- 실제 네트워크 먹통·디스크 부족·권한 오류 시 각각의 대기 시간과 모든 복구 조합.

따라서 **이번에 재현된 내부 문제들은 수정할 근거가 충분하지만, 사용자가 경험한 총 지연의 전부가 어느 한 원인이라고 단정할 수는 없습니다.** 구현·버전 증가·설치본 재생성·사이트 배포는 시작하지 않았습니다.
