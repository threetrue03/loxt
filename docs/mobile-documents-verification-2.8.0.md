# 모바일 문서 개선 M01–M05 검증

목표 릴리스: 2.8.0. 이번 구현은 기존 SUIT, 테마 토큰, 문서 좌표·저장·내보내기 동작을 유지한다.

| 항목 | 변경 | 근거 |
| --- | --- | --- |
| M01 | 텍스트 편집창을 문서 좌표와 분리한 포털 UI로 표시하고 visual viewport 안에 제한. 네 모서리에서도 완료·취소는 가로 표시 | 네 모서리×양 테마 8회, 취소 시 주석0개, 완료 시 PC 저장 좌표 일치 |
| M02 | 옵션 패널이 창/visual viewport resize·scroll·앵커·패널 크기 변화에 재배치. RAF로 묶고 observer/listener/frame 정리 | 1180→820 및932→430 양 테마, 높이844→400, Tab trap, Esc 포커스 복귀, fullscreen 포털 |
| M03 | 재생 속도와 원본 관리 버튼을 공통 행으로 묶고 narrow grid를 명시. 버튼 문구는 줄바꿈하지 않음 | 390px 양 테마 ‘녹음 지우기’93.8125×44px |
| M04 | coarse 입력의 녹음 장치 화살표, 뒤로, PDF 내보내기/색상/페이지관리, 보기/검색/정렬/원본 관리의 목표 영역44px | 녹음 장치44×44px, 대표 보관함 버튼 모두44px 이상 |
| M05 | 높이500px 이하 coarse 화면에서 메타를 ‘문서 정보’로 묶고 여백·도구 문구 축약. 큰 화면은 기존 메타 표시 | 568×320 PDF본문32→105px, 메모본문121→207px, 폴더 메타 팝업 실제 접근 |

`PdfTextEditor.jsx`는 편집 UI만 이동한다. 저장할 PDF 좌표를 화면 안으로 옮기지 않는다. `DocumentMetadata.jsx`는 숨긴 경로·날짜·현재 쪽수에 접근할 수 있게 한다. 준비된 제목 저장 상태는 공통 hook과 합치며 제목 저장 실패 때 뒤로 이동을 막는다.

## 검증 조건

- `scripts/viewport-placement.test.mjs`: 3/3. 네 모서리, 이동된 visual viewport와 키보드 높이, 회전 후 clamp. 입력 anchor는 변경하지 않음.
- 관련 `pdf-cancel-2.7.test.cjs`, `documents-2.5.test.cjs`, `drawing.test.cjs`와 함께16/16 통과.
- `scripts/mobile-documents-ui.mjs`: private profile, 실제 PC 승인된 localhost HTTPS 웹, Chromium touch 모사. 최종 버전 표기2.8.0의 수정 소스로21개 검증을 완료했고 `test-results/mobile-documents-2.8.0/results.json`에 completed=true, errors=[]를 저장했다. 양 테마 네 모서리의 완료 버튼 대비4.5 이상도 확인했다. 첫 개발 실패는 낮은 PDF본문85px를100px 이상으로 확보하는 검증 조건이었으며 여백 수정 후105px로 통과했다.
- 2026-10-10 최신 소스 재검증에서 28개 검사, `completed=true`, `errors=[]`, 실제 앱 버전 `2.8.0`을 확인했다. 실행 시간·`runtime="source"`·Electron 실행 경로를 `results-source.json`에도 보존했다. 재생 슬라이더·재생/속도/원본 관리 버튼과 연결 표시가 겹치지 않음을 390×844 양 테마와 320×568 / 568×320 양 테마에서 확인했고, 녹음 준비의 타이머·녹음 시작·장치 선택도 별도 검사했다.
- 같은 날 최종 패키지 `release/stage5/win-unpacked/LOXT.exe`를 `LOXT_ELECTRON`으로 전달해 28개 회귀를 모두 통과했다. `results-packaged.json`과 최신 `results.json`에 `runtime="packaged"`, 해당 절대 실행 경로, 실제 앱 버전 `2.8.0`, `completed=true`, `errors=[]`가 기록돼 있다. PDF105px·메모207px 조건과 재생 슬라이더·버튼·녹음 준비 제어 영역의 `overlaps=[]`를 패키지에서도 확인했다. 이는 최종 패키지 실행 파일의 UI 검증이며 Windows 설치 마법사 실행을 뜻하지 않는다.
- 실제 iPhone/iPad Safari, 홈 화면 PWA, 물리 회전, 한글 IME·가상 키보드, Apple Pencil, GPU 추론은 미검증이다. 높이 감소와 visualViewport 단위 검증을 실제 iOS 키보드 성공이라고 표시하지 않는다.

스크린샷에는 예시 문서·스크립트만 포함한다. 사용자 보관함·녹음·모델·설정은 변경하지 않았다.

## 연결 표시와 녹음·재생 제어 영역

처음 검사는 PDF·메모 버튼만 대상으로 삼아 재생 슬라이더 오른쪽과 녹음 준비 타이머 위의 연결 표시 겹침을 놓쳤다. 실제 `player-light.png` 확인 후 모바일 녹음·재생 화면에 연결 표시용 하단 62px 공간을 확보하고, 해당 화면의 app·host 높이를 부모 높이에 맞췄다. PDF·메모에는 이 높이 변경을 적용하지 않으며 568×320 PDF 본문105px, 메모207px 조건을 유지한다.

원래 겹친 화면은 `player-light-before-status-fix.png`, `device-hit-area-before-status-fix.png`에 보존한다. 하단 공간을 처음 추가한 뒤 기존100vh 높이가 녹음 준비 버튼을 벗어나게 했던 중간 실패는 `results-status-reserve-first-failure.json`, `results-status-reserve-host-failure.json`으로 보존한다. 현재 결과의 `overlaps=[]`와 실제 새 화면을 함께 확인한다.
