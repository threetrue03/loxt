# LOXT 2.7.0 기기 승인·연결·초안 복구 조사

조사일: 2026-10-10. 조사만 수행했다. 앱·사이트·설치 코드와 실제 사용자 자료는 변경하지 않았다. 이 문서는 최종 `ux-audit-next.md`의 연결 분야 근거다.

## 조사 환경과 결과

현재 패키지 `release/stage5/win-unpacked/LOXT.exe` 2.7.0을 별도 예시 프로필로 실행했다. 예시 폴더 하나와 메모 하나를 만들고 PC에서 승인한 HTTPS 웹 클라이언트로 검증했다. Edge Chromium, 390×844 touch viewport, localhost를 사용했다. 실제 iPad/iPhone Safari·홈 화면 웹앱·Wi-Fi·인증서 설치를 검증했다는 뜻은 아니다. 브라우저 자동화는 인증서 경고를 무시하도록 설정했으므로 인증서 신뢰 UX의 성공 근거로 사용할 수 없다.

서버의 승인 만료·CSRF 갱신·포트 변경은 private 프로세스의 상태만 주입했다. 소스 파일을 바꾸지 않았고 실제 기기를 해제하지 않았다. 네트워크 단절은 Chromium offline 설정에 예시 WebSocket 종료를 함께 사용했다. offline 설정만으로 기존 TCP 연결이 닫히지 않는 첫 하네스 실패를 앱 문제로 분류하지 않았다.

| 상황 | 서버/클라이언트 근거 | 실제 화면 | 복구 결과 |
| --- | --- | --- | --- |
| 정상 승인 | session 유효, WebSocket ready | PC 연결됨 / 저장됨 | 정상 |
| 네트워크 단절 | 예시 TCP 종료 + offline, RPC 실패 25,523ms | 계속 다시 연결 중 / 메모 저장 실패 | 같은 주소로 온라인 복귀 후 연결됨, 저장 실패는 남음. 수동 다시 시도하면 PC에도 저장 |
| 승인 취소 | PC revoke, session 401, RPC TRANSPORT 약 25.5초 | 열린 앱에 주소 입력·재승인 버튼 없이 다시 연결 중 | 새 `#pair`만 적용해도 pending 0. 전체 새로고침 후 PC 승인하면 초안 복구, 수동 저장 성공 |
| 승인 만료 | private device expires를 과거로 설정, session 401 | 실행 중 앱은 다시 연결 중 | 새로고침하면 연결 주소 입력 화면은 제공됨 |
| 연결 QR 만료 | private pairing token expires 변경 | 만료 안내와 새 주소 입력 | 초기 접속 화면은 복구 UI 존재 |
| PC 승인 거절 | pending을 PC에서 deny | 실제 거절인데 ‘연결 요청이 만료되었습니다’ | 새 QR 안내는 있으나 원인 잘못 표시 |
| 인증 정보 불일치 | valid cookie, server CSRF만 갱신, session 200 | 다시 연결 중 | 새로고침 후 재승인 없이 정상. 열린 클라이언트의 session 갱신 부재 |
| PC 연결 서버 종료 | configure(false), session fetch 실패 | 동일한 다시 연결 중 | 같은 주소로 서버 재시작하면 자동 회복 |
| 서버 주소/포트 변경 | private port 변경 | 예전 주소로 재시도, 새 주소 입력 없음 | 새 포트는 정상 연결되지만 이전 origin의 ADDRESS-DRAFT는 없음 |
| 예전 주소 cold launch | 예전 포트 종료 후 navigation | ERR_CONNECTION_REFUSED, LOXT 복구 UI 미실행 | 웹앱 자체가 서버에서 전달돼야 하며 명시적 offline shell 없음 |

근거: [주 검증 결과](../test-results/ux-audit-next/connection/results.json), [추가 검증 결과](../test-results/ux-audit-next/connection-extra/results.json), [주 로그](../test-results/ux-audit-next/connection/run.log), [추가 로그](../test-results/ux-audit-next/connection-extra.log). 주 하네스는 11개 사례 뒤 승인 거절 선택자/타이밍에서 중단됐다. 추가 하네스는 해당 시나리오를 분리하고 같은 URL의 hash 이동과 전체 reload를 구분해 남은 10개 사례를 완료했다. 두 결과를 합쳐 읽어야 한다. 모든 시나리오를 한 번에 성공했다거나 실제 네트워크 25.5초 지연을 측정했다는 주장이 아니다. 두 실행에서 예상하지 않은 `pageerror`는 없었다.

기존 관련 테스트 `connection.test.cjs`, `v2-services.test.cjs`, `remote-sync.test.cjs`: 허용된 로컬 환경에서 **15/15 통과**. 최초 제한 환경에서는 13/15, 실패 두 개는 localhost TCP `EACCES`였고 앱 회귀로 분류하지 않았다. [최종 로그](../test-results/ux-audit-next/connection-unit-allowed.log), [제한 환경 로그](../test-results/ux-audit-next/connection-unit.log). 이 테스트 통과가 열린 웹앱의 승인 복구 UX까지 검증한 것은 아니다.

## 발견 사항

| ID | 분야 | 우선순위 | 문제 | 근거 | 사용자 영향 | 개선 방향 | 규모 | 검증 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | 승인·인증 복구 | P1 | 실행 중 앱은 승인 취소/만료와 오래된 CSRF를 모두 반복 연결로 처리하며 재승인 UI가 없음 | webTransport.js:18, web.jsx:24·76, 실제 401/200 사례 | 기다려도 회복하지 않는 승인 상태, 웹앱 초기화로 해결하려다 초안 위험 | session 재확인·원인별 상태·같은 앱 안 재승인 sheet, PC 명시적 승인 유지 | 중~대 | 실제 재현 |
| C02 | 연결·저장 상태 | P1 | 단절한 RPC는 약25.5초 후 실패하고 연결 복귀 후 실패한 메모 저장은 자동 재개되지 않음 | webTransport.js:20, webAdapter.js:14, memoStore.js:89, 25,523ms | 멈춘 것으로 보이고 ‘PC 연결됨’ 상태에서 저장 실패/초안 남음 | 연결 상태와 저장 상태 구분, 안전한 대기·명시적 재시도·revision 확인 후 재전송 | 중 | 실제 재현 |
| C03 | 주소 변경·초안 | P1 | 주소/포트 변경 때 origin별 저장소가 분리되어 이전 메모 초안을 새 주소에서 읽을 수 없음 | memoStore.js:11, pdfStore.js:7·10, webRecordingJournal.js:17, 실제 포트 변경 | 저장 대기 작업이 새 연결에서 사라진 것처럼 보임 | 안정된 접속 origin 우선, 기존 창의 초안 내보내기와 별도 가져오기·충돌 검토 | 대 | 메모 실제 재현; PDF/녹음은 코드상 동일 제한 |
| C04 | 웹앱 재시작 | P1 | PC 서버 중지/이전 주소 종료 상태에서 cold launch하면 앱 복구 화면 자체를 받을 수 없음 | web.html:1, web.jsx:21·24, SW 등록 부재, ERR_CONNECTION_REFUSED | 설치한 웹앱이 먹통으로 느껴지고 주소 입력·로컬 초안 접근 불가 | 최소 offline shell·연결 입력·로컬 초안 접근을 조사, 문서/개인 데이터 자동 cache는 금지 | 대 | Chromium cold navigation 실제 재현; iOS standalone 미검증 |
| C05 | 상태 안내·접근성 | P2 | 단절 banner가 CSS pseudo-element로 상단 로고를 가리고 행동/알림 semantics가 없음 | web.css:2, WebSyncStatus.jsx:6, 실제 390px 캡처 | 원인·다음 행동 불명확, 상단 조작 가림, 스크린리더 안내 부재 | 흐름 안 DOM status, 상세 복구 버튼, 상단 레이아웃 공간 확보 | 소~중 | 시각 실제 재현; semantics 코드상 확인 |
| C06 | 최초 승인 UX | P2 | PC에서 거절해도 요청 만료라고 표시 | device-server.cjs:43·48, 실제 deny 결과 | 거절과 만료 혼동, QR 반복 생성 | 최소 시간의 거절 상태 유지·안내, 새 요청은 명시적 사용자 동작 | 소~중 | 실제 재현 |
| C07 | 만료 기기 관리 | P2 | 만료 기기도 20개 제한에 계산되고 목록에 만료 상태/기한을 표시하지 않음 | device-server.cjs:24·40·43 | 사용하지 못하는 기기로 승인 슬롯이 찰 가능성 | 만료 표시·사용자 해제, 유효 기기 제한과 보존 정책 분리 | 소~중 | 코드상 확인; 20기기 실제 UI 미검증 |

## 중요한 항목 상세

### C01 — 실행 중 웹앱의 재승인 경로

- 위치: [webTransport.js:18](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webTransport.js:18), [web.jsx:24](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/web.jsx:24), [web.jsx:76](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/web.jsx:76), [device-socket.cjs:26](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-socket.cjs:26).
- 재현: private profile 승인 → 웹에서 메모 편집 → PC에서 기기 해제 → session 401 확인 → 열린 앱의 연결 상태 확인 → 새 pairing URL의 hash 적용.
- 기대: 승인이 더 필요하다는 설명과 새 연결 주소 입력, PC 승인 요청, 기존 문서/초안 유지. 실제: 계속 reconnecting, 새 hash의 pending 0, 주소 폼 0. **처음 접속/전체 reload 화면에는 주소 폼이 이미 있다. 모든 화면에 폼이 없다는 뜻이 아니다.**
- [승인 취소 화면](../test-results/ux-audit-next/connection/04-approval-revoked.png), [만료 후 reload 폼](../test-results/ux-audit-next/connection/07-expired-reload-form.png), [CSRF 불일치](../test-results/ux-audit-next/connection-extra/10-stale-csrf.png).
- 권장: 실패 시 session을 재확인해 401과 유효 session/새 CSRF, reachability 실패를 나눈다. 1008은 일반 정책 위반 코드이므로 승인 취소라고 단정하지 않는다. [MDN CloseEvent](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code). fetch 실패만으로 네트워크/서버 종료/인증서 문제를 확정할 수 없으므로 사용자 문구는 가능한 확인 행동을 제시한다. navigator.onLine 역시 LAN 서버 도달성을 보장하지 않는다. [MDN onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).
- 부작용: 인증 오류에 새 approve를 무조건 요구하면 유효한 cookie도 불필요하게 재승인시킨다. 재연결 세대/CSRF 갱신 시 오래된 RPC 응답을 배제하고 중복 저장을 방지해야 한다. 기기 승인·Host·Origin·CSRF 검사를 유지한다.
- 완료 조건: revoke/expire 시 `재승인 필요`와 주소 입력을 같은 열린 앱에서 제공; valid session/CSRF 갱신은 승인 없이 회복; 이전 문서·메모 초안 유지; PC deny는 승인으로 처리하지 않음; 재연결 후 revision이 달라지면 덮어쓰지 않고 충돌 사본을 제공.

### C02 — 연결됨과 저장 완료는 별개

- 위치: [webTransport.js:20](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webTransport.js:20), [webAdapter.js:14](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webAdapter.js:14), [memoStore.js:89](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:89), [documentRefresh.js:8](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/documentRefresh.js:8).
- 재현: 네트워크 단절 중 NETWORK-DRAFT 입력, RPC의 8초 availability wait×3 + 0.5/1초 retry를 기다림. 연결 복귀 후 status는 online, 메모 저장 실패와 local draft는 남음. 다시 시도하면 실제 PC memo에 NETWORK-DRAFT 저장.
- [복귀했지만 저장 실패](../test-results/ux-audit-next/connection/03-network-return-save-failed.png). 25,523ms는 단절 상태 실패 판정 시간 1회 측정이며 정상 Wi-Fi 동기화 지연이나 평균 처리속도가 아니다.
- 권장: `PC 연결됨 · 저장 대기 1개`처럼 분리하고 서버 응답을 기다리는 상태를 즉시 보여준다. 연결 회복 이벤트에서 변경되지 않은 revision은 저장 재시도, 수정된 revision은 충돌 검토. 인증 무효에는 일반 retry를 무한 적용하지 않는다.
- 부작용: 안전하게 실패시키기 위해 원래 기다리는 요청을 전부 취소하면 실제 서버에서 commit된 작업을 중복 전송할 수 있다. 기존 requestId 중복 방지와 완료 조회가 필요하다.
- 완료 조건: 단절/승인 필요/저장 충돌/저장 완료가 화면에서 구분되고 재연결 후 safe save 성공 또는 명시적 충돌 선택이 나타남. ‘연결됨’만으로 ‘모두 저장됨’을 표시하지 않음.

### C03·C04 — 주소 변경과 cold start의 한계

메모/PDF는 localStorage, 미업로드 녹음은 IndexedDB에 저장한다. 키에 hostId를 넣어도 저장소 자체는 scheme/host/port의 origin별로 분리된다. [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage). 실제 포트 변경에서는 `https://127.0.0.1:49588`에 ADDRESS-DRAFT가 남았지만 `:59595`에는 같은 hostId의 초안이 없었다. cookie는 같은 hostname·다른 port에서 유효하여 새 포트의 앱은 승인 없이 열렸다. 따라서 **인증이 회복된 것과 초안이 옮겨진 것은 다르다.** IP hostname이 바뀌면 cookie도 별도여서 또 다른 결과가 가능하며 이번에 실제 LAN IP를 바꾸지는 않았다.

- 위치: [memoStore.js:11](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:11), [memoStore.js:51](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/memoStore.js:51), [pdfStore.js:15](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/pdfStore.js:15), [webRecordingJournal.js:17](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/webRecordingJournal.js:17), [WebRecordingRecovery.jsx:12](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/src/WebRecordingRecovery.jsx:12), [web.html:1](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/web.html:1).
- 재현: private port 이동 후 기존 탭에 입력/backup → 새 주소에서 같은 메모 열기 → 이전 draft 부재 확인 → 종료된 예전 주소로 전체 navigation → browser ERR_CONNECTION_REFUSED.
- [새 주소에서는 저장된 기준 문장만 표시](../test-results/ux-audit-next/connection-extra/14-new-origin-no-draft.png), [예전 주소 실패](../test-results/ux-audit-next/connection-extra/13-old-address-browser-error.png).
- 기대: 기존 앱 삭제/데이터 초기화 없이 주소를 변경하고 초안의 위치·내보내기·복구를 안내. 실제: 저장소는 보존되지만 새 origin에서 접근 불가, 예전 서버가 없으면 앱 UI를 실행하지 못함.
- 권장: 단기에는 열린 기존 origin에서 이동 전 모든 미저장 작업 사본을 내보내고 새 주소에서 사용자 확인 후 가져오는 절차를 제공한다. 장기에는 안정된 접속 이름/포트와 인증서·LAN 접근성 설계를 검토한다. offline shell은 최소 연결/복구 코드와 필요 local assets만 캐시하도록 별도 보안/업데이트 검토가 필요하다. 개인 문서·모델·인증 토큰을 Service Worker에 자동 캐시하지 않는다.
- 부작용: 새 origin의 JS가 기존 origin 저장소를 직접 읽는 것은 불가능하다. 새 QR, hostId key 변경, localStorage key 이름만 바꾸는 것으로 해결했다고 주장하면 안 된다. offline cache는 revoke 이후 로컬 사본 정책, shared device의 잠금/삭제, 앱 버전 호환·캐시 갱신이 필요하다. PC 재승인이 로컬 사본 접근 범위를 무조건 확대해서도 안 된다.
- 완료 조건: 같은 주소 재승인 후 초안 복구, 다른 주소 이동 전 export/import, 멈춘 서버에 홈 화면 cold launch 시 최소 복구 shell 제공 여부를 실제 Safari/PWA에서 검증. revision 충돌 시 서버판과 로컬판 둘 다 남기고 선택 가능. server asset이 없는데 온라인 앱 전체가 열릴 것이라고 안내하지 않음.

### C05·C06·C07 — 안내와 상태 구분

C05: 390px 단절 화면의 fixed pseudo banner가 LOXT 로고 영역을 가리고 Work 표시만 남는다. DOM `role=status`/`aria-live`와 위치 공간을 확보하고 상세에서 ‘다시 확인’, ‘새 연결 주소’, ‘초안 받기’를 제시하는 방향이다. 진단의 ‘새로 확인’은 현재 snapshot을 다시 읽는 동작이며 재승인이나 새로운 연결 시도를 직접 하는 버튼은 아니다. 완료 조건은 긴 한국어 문구·safe area·키보드 상태에서도 제목/탐색을 가리지 않고 screen reader가 새 상태를 한 번 안내하는 것이다.

C06: [device-server.cjs:43](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-server.cjs:43)에서 deny는 pending을 삭제한다. 다음 polling은 [:48](C:/Users/simky/OneDrive/Dokumen/ChatGPT/buzz_interface/electron/device-server.cjs:48)의 absent/expired 공통 오류를 받아 만료라고 표시한다. [거절 캡처](../test-results/ux-audit-next/connection-extra/09-pair-denied.png). 일정 TTL의 거절 결과를 유지하되 자동 새 요청·자동 승인은 하지 않는다. 완료 조건: 거절/만료/다른 기기 사용을 정확히 구분하고 사용자 동작으로만 새 승인 요청한다.

C07: session은 expires를 검사하지만 snapshot 목록에는 expires가 없고 approve 제한은 전체 devices.length다. 만료 레코드 20개인 private server에 새 approve를 넣는 추가 UI 실험은 하지 않았다. 만료 기기를 삭제해 인증 기록이 사라지는 정책을 임의로 적용하기보다 ‘만료됨’ 표시와 사용자 해제, 제한의 대상 정의를 먼저 결정한다. 완료 조건: 20개 유효/20개 만료/취소 섞인 예시에서 안내·정리·추가 승인 경로를 검증한다.

## 권장 상태와 와이어프레임 — 제안이며 구현하지 않음

연결 상태는 `확인 중 / 연결됨 / 일시 연결 끊김 / 재승인 필요 / PC 확인 필요`로, 문서 상태는 `저장됨 / 이 기기에 임시 저장 / 전송 중 / 충돌 검토`로 구분한다. 네트워크/서버/인증서 장애를 응답 없이 정확히 식별하지 못하면 ‘PC에 도달하지 못했어요’로 표현하고 확인 순서를 제시한다.

```text
[LOXT Work ▾]                            [PC 연결 · 저장 대기 1개]
──────────────────────────────────────────────────────────────
이 기기의 승인이 필요해요. 작성 중인 내용은 이 기기에 보관했어요.
[다시 승인 요청] [새 연결 주소 입력] [초안 받기]
──────────────────────────────────────────────────────────────
기존 문서/메모 유지 · 서버 작업은 승인 완료 전 잠금

새 연결 주소 입력                  ×
[ PC에서 복사한 연결 주소                         ]
PC의 설정 → 내 기기 연결 → 연결 주소 복사
[취소]                            [연결 요청]
→ PC에서 승인 대기 → 승인 후 revision 확인 → 안전 저장/충돌 사본
```

주소를 바꿔 다른 origin으로 이동하기 전:

```text
저장 대기 중인 작업 2개가 있어요.
새 주소에서는 이 주소에 남은 초안을 바로 읽을 수 없어요.
[현재 주소에서 다시 시도] [초안 사본 받기]
사본 저장 확인 후 [새 주소로 이동]
```

상태 icon을 눌러 동기화/오류/다음 행동을 보여주고 인증 오류와 네트워크 재시도를 분리하는 근거는 [Obsidian Sync 상태·메시지 공식 설명](https://obsidian.md/help/sync/messages)이다. 충돌 사본을 남겨 두 버전을 비교할 수 있게 하는 방향은 [Obsidian 충돌 처리](https://obsidian.md/help/sync/troubleshoot)를 참고했다. LOXT 블록 JSON과 PDF 필기는 Markdown 자동 merge와 동일하지 않으므로 그대로 이식하지 않는다. 새 색상/새 글꼴/계정 시스템을 추가하자는 제안이 아니다.

## 추가 실제 기기 검증

이번 Safari 기기 검증 응답은 아직 없으므로 실기기 성공을 주장하지 않는다. 승인한 예시 보관함에서 Safari 탭과 홈 화면 웹앱 각각: 편집→PC revoke→초안 backup→재승인→서버 수정과 충돌 확인; Wi-Fi off/on; PC 서버 off/on; 인증서 갱신; 다른 IP/포트 이동; 앱 강제 종료 후 offline cold launch; Safari/PWA 저장소/세션 차이와 브라우저 storage eviction을 검증해야 한다. 비밀번호/인증 코드 입력 자동화, 실제 승인 bypass, 실제 모델/GPU 녹음 추론은 수행하지 않았다.

모바일 분야 교차 검토를 반영한 완료 조건: 키보드가 열린 visualViewport·safe area·화면 회전에서도 주소 입력·연결 요청·초안 받기와 시트 닫기에 접근할 수 있어야 한다. offline shell은 저장 공간 정리, 서버/클라이언트 버전 불일치, 기기 해제 후 로컬 초안 노출 정책까지 검증한다. PDF·메모에서 모바일 풋바가 숨겨지는 경우 상태칩의 bottom 78px 예약을 일률 적용하지 않고 문서를 가리지 않는 위치를 선택한다.
