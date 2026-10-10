# LOXT 2.8.0 설치 helper·NSIS 검증

검증일: 2026-10-10. 승인된 I01–I10 개선에 대한 구현과 실제 검증 범위를 구분한다. 사용자 앱을 설치·업데이트·복구·제거하거나 사용자 모델·녹음·메모·설정을 변경하지 않았다.

## 적용 결과

| 항목 | 구현 | 확인과 남은 범위 |
| --- | --- | --- |
| I01 | 기존 `store-models.json`의 제공처·40자리 revision을 유지하고, 전체 모델을 별도 staging에서 해시 검사한 후 디렉터리 단위 교체. 교체 journal과 backup으로 중단 시 이전 모델 복구 | 다른 제공처 turbo·고정 revision·registry 불변·다운로드 실패·rename 실패·교체 중단 fixture 통과. 실제 대용량 모델 다운로드·추론 성공의 증거는 아님 |
| I02 | `verified-model.json`의 pinned 계획과 실제 파일 크기·해시가 모두 일치하면 metadata 요청 없이 재사용. 기존 파일은 최초 metadata와 해시 검사 후 manifest를 생성 | 오프라인 재사용, 손상 파일·잘못된 manifest 재사용 거절, 기존 설치 migration 확인. manifest가 없는 기존 모델의 최초 확인과 변환 환경/화자 환경 준비는 네트워크가 필요할 수 있음 |
| I03 | 모델 합계 예상치·AppData 여유 공간·앱과 모델/환경의 별도 위치 안내. 실제 staging 대상의 계획 크기와 여유 공간, runtime 복사 전 크기, CPU/GPU 환경의 최소 여유 기준 검사 | 부족 공간 대역에서 기존 모델 보존 확인. CPU 1 GiB/GPU 3 GiB는 최소 여유 기준이며 전체 설치 용량 확정치가 아님. 별도 드라이브의 사용자 지정 pip/TEMP 캐시를 모두 예약하거나 실제 드라이브를 채우는 실험은 하지 않음 |
| I04 | 준비 중단 버튼, 오류 후 다시 시도/나중에 준비, 앱 설치 완료·준비 미완료 상태 분리. 준비 중 창 닫기에는 앱·기존 모델·녹음·메모 보존을 설명하는 확인 표시 | 한·영 실제 custom page에서 Stop, 나중에 준비, 창 닫기 확인의 아니요/예 및 helper/소유 테스트 자식 종료 확인. 실제 전체 installer의 앱 파일 복사 중 취소는 미검증 |
| I05 | 다운로드는 측정한 진행률, 검사·lock 대기·환경 준비는 marquee. 실제 재시도 횟수·다음 대기 시간을 표시하며 마지막 실패 뒤 불필요한 sleep 제거 | 이벤트·lock·5회 요청/4회 대기 대역과 실제 page 연결 확인. 서버 timeout·실제 lock 경쟁·대용량 다운로드 시간 측정은 하지 않음 |
| I06 | 디렉터리·로그 초기화부터 오류 처리. 모델 드라이브 접근 실패 시 installer temp에 결과·원인·짧은 요약·fallback log 작성. 오류 상세와 로그 열기/경로 복사 제공 | 초기 권한 실패·결과 쓰기 실패·공간·네트워크 원인 fixture. 한·영 permission 요약과 선택 버튼 표시 확인. 로그/클립보드 API는 NSIS 컴파일 확인이며 사용자 클립보드 내용을 실제로 바꾸지 않음 |
| I07 | 앱만 업데이트할 때 모델을 모두 해제하는 범위를 안내. 환경 requirements/runtime/worker/장치/드라이버 fingerprint와 import 확인, 검증한 모델 파일 fingerprint를 재사용. 복구는 `--deep-check`로 실행 검사 | 정상 재사용 시 pip/probe/prepare 호출 생략, deep repair의 재실행과 파일/환경 변경 invalidation 대역 확인. 화자·출력 장치 환경은 별도 확인 경로를 유지하며 실제 속도 개선은 측정하지 않음 |
| I08 | 기존 nsDialogs 표준 컨트롤/레이아웃 유지. 오류 요약은 여러 줄 영역, 긴 모델 위치는 별도 안내. 실제 측정에서 잘린 용량 문구를 짧게 조정 | **96 DPI(100%) custom page**의 모델/용량/오류 요약 텍스트 높이·page 경계 확인. 150/200%, 작은 작업 영역, 전체 키보드·스크린리더·전체 설치/복구/제거 Windows VM은 미검증 |
| I09 | 완료 화면의 배포자·공식 GitHub 경로·릴리스 SHA-256 비교 안내 | 정식 인증서가 없어 Authenticode 서명은 적용하지 않음. 최종 EXE 서명·SHA-256은 릴리스 검증에서 별도 확인. 체크섬은 인증서 서명이나 SmartScreen 평판의 대체가 아님 |
| I10 | 모든 custom LangString에 한국어/영어 대응. 저성능·표준·고성능 역할과 변환 용어 정리, helper UI 언어 전달 | 모든 참조와 언어 쌍 회귀 및 한·영 custom page 실행 확인. 내부 파일명·기존 저장 경로·오류의 원래 기술 상세는 보존 |

## 실행 기록

1. `.runtime/python/python.exe scripts/installer-regression.test.py`: **20/20 통과**. 작은 임시 fixture만 사용하고 네트워크·디스크 공간·환경 실행은 대역 처리했다. [helper log](../test-results/implementation-2.8.0/installer/helper-regression.log).
2. `.runtime/python/python.exe scripts/installer-2.8-smoke.py`: 실제 production `installer.nsh`, `preparation-page.nsh`, `maintenance.nsh`, `remove-environment.nsh`를 포함한 NSIS harness 컴파일 성공. 한국어·영어 각각 성공, permission 실패→나중에 준비, 준비 중 Stop, 창 닫기 확인→소유 자식 종료의 **8/8 통과**. [결과와 측정](../test-results/implementation-2.8.0/installer/nsis-results.json), [컴파일 log](../test-results/implementation-2.8.0/installer/nsis-compile.log).

하네스는 `test-results/implementation-2.8.0/installer/nsis-*` 안에 runtime과 Python helper 사본을 만들고 model 함수만 예시 이벤트/실패/대기로 대체했다. 앱 파일을 복사하는 실제 설치 section, 사용자 모델 다운로드, 레지스트리 쓰기, 실사용 바로가기 생성·앱 실행은 하지 않았다. 설치 탐지의 read는 private 미존재 키로 제한했고 완료 화면 실행/바로가기 선택을 해제했다. 소유 자식은 60초 sleep만 하는 테스트 프로세스였다. 사용자 프로세스에는 입력하거나 종료 요청을 보내지 않았다.

실측 `GetDpiForWindow`는 모든 사례에서 **96**이었다. 수정한 용량 문구는 한국어 32/36px, 영어 32/39px(필요/가용 높이), permission 요약은 32/45–49px였다. 초기에 한국어 용량 문구가 48/36px로 잘리는 것을 확인해 두 언어의 두 번째 줄을 짧게 바꾼 뒤 재검증했다. 버튼은 NSIS의 정상 click/command로 조작했으며 이것을 실제 키보드 전용 탐색·스크린리더 청취로 주장하지 않는다.

컴파일에는 하네스에서 쓰지 않는 maintenance 함수/변수 경고 4개가 있었다. LangString 누락·unknown variable/constant 오류는 없었다. 최초 제한 sandbox의 compiler 시작은 `WinError 623`으로 실패했고, 승인된 동일 private harness를 정상 실행 권한으로 재실행해 성공했다. bundled Python의 `Failed to find real location …` stderr 경고가 나온 helper 회귀는 정상 종료했으며 위 통과 결과와 구분한다.

## 배포 검증과 후속 확인

최종 2.8.0 EXE 생성·버전·서명·해시·포함된 helper 동일성은 루트 릴리스 작업에서 확인한다. 이 문서는 public GitHub release 또는 Production 배포 완료를 뜻하지 않는다. 공식 [LOXT 릴리스](https://github.com/threetrue03/loxt/releases)에서 설치 파일과 제공된 SHA-256을 비교할 수 있도록 릴리스 산출물을 함께 준비해야 한다.

Windows VM에서 실제 새 설치·업데이트·복구·제거, 프로그램 파일 복사 중 취소, 물리 CPU/GPU 모델 실행, 150/200% DPI·작은 작업 영역·키보드/스크린리더, 실제 인터넷 단절/드라이브 부족/다른 준비 작업과의 경쟁, 웹 다운로드 후 Windows 보안 표시를 추가 확인해야 한다. 기존 녹음·메모·보관함 hash 보존 및 실제 제거 hook의 환경만 삭제하는 범위도 전체 설치 파일로 별도 검증한다. 과거 버전의 lifecycle 하네스 성공을 이번 전체 설치 성공으로 바꾸지 않았다.
