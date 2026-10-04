# LOXT 1.7.0 검증

검증일: 2026-10-04. Windows x64 · NVIDIA GeForce RTX 2060 6GB.

## 설치 파일

- 경로: `release/stage5/LOXT-Setup-1.7.0-x64.exe`
- 크기: 138,338,537 bytes
- SHA-256: `dd7b788b6b6314b192c655c77194d8e9ed83bf0f12136e07760f30327b0673e8`
- 앱, 잠금 파일, 설치 프로그램의 버전: 1.7.0
- 최종 패키지의 Electron·Python 소스 일치와 테스트 자료 제외를 release-manifest 검사로 확인했다.

## UI 및 기존 기능

- `npm run test:release`: 37개 통과. Work·Live 보관함 분리, 폴더·휴지통, 변환 대기열, 타임스탬프, Live 오류 처리를 포함한다.
- Python 환경 준비 3개, 모델 설치·진행 표시 3개, 타임스탬프 2개, 화자·출력 장치 추적 2개 테스트 통과.
- 최종 패키지 UI 검사: 카드 배경을 눌러 열기, 스크립트 미리보기에서 열기 방지, 복사 완료 버튼·토스트 없음, 화자 배지, 모델 메뉴 폭 320px 이내, 기본·외부 모델 그룹 각각 한 번 표시를 확인했다.
- Live 카드·작은 카드·목록, 정렬, 중첩 폴더, 파일 불러오기·다시 변환하기, Work 드래그·영역 선택, 제목 편집과 타이머를 확인했다.
- Live 입력 권한 요청이 모델 준비보다 먼저 실행되는지, 준비 중 오디오 파일·타이머가 시작되지 않는지, 준비 완료 후 자동 녹음하는지 확인했다. 실제 다운로드 수치·로딩 문구·준비 실패 후 재시도와 860×640 레이아웃도 검사했다.
- UI 검사 프로필: `test-results/ui-1.7-tTjjBd/`, `test-results/recording-ui-IejZ3m/`, `test-results/library-interactions-ui-45sklY/`.

## 실제 오디오·GPU 실행

- 최종 패키지 Live: CUDA `large-v3-turbo`, 9.408초 녹음, 스크립트 4구간, JavaScript 오류 0개. 페이지 이동·일시정지·재개, Work 대기열 보류·재개, 원본 재생·구간 이동, 복사·내보내기, 재시작 후 저장을 확인했다.
- 결과: `test-results/live-smoke-WibkTR/result.json`.
- 실제 CUDA `small`로 56.28초 한국어 파일을 Work와 Live 각각 변환했다. 별도 보관함에 저장되고 구간 길이가 원본 안에 유지되며 화자 표시가 TXT에도 남는다.
- 결과: `test-results/work-speakers-pNyf8P/result.json`.
- 최종 패키지에서 실제 Windows 기본 출력의 WASAPI 루프백 오디오를 녹음했다. 2.34초, RMS 0.0129352, 파일 36,601 bytes. 테스트를 위해 잠시 해제한 시스템 음소거는 종료 시 원래 상태로 복원했다.
- 결과: `test-results/system-audio-J6H2Du/result.json`.

## 출력 장치 자동 추적

기본 출력 ID를 0.5초 간격으로 확인하고 변경 시 같은 세션의 루프백 스트림을 재연결한다. Work와 Live가 동일한 입력 경로를 사용한다. 재연결 중 수집하지 못한 오디오는 복원할 수 없으며 화면에서 장치 상태를 안내한다.

실제 Realtek 기본 출력 녹음과 모의 장치 변경·재연결 테스트를 통과했다. 연결된 기기가 하나라 유선 이어폰·USB 헤드셋·블루투스 장치를 실제로 교체하는 검증은 완료하지 못했다. 여러 앱이 서로 다른 출력에 소리를 보내는 경우 모든 출력을 합치는 기능은 포함하지 않는다.

## 화자 분석

화자 분석은 CPU에서 sherpa-onnx, Pyannote segmentation 3.0, NeMo TitaNet small로 실행해 Whisper의 GPU 메모리와 경쟁하지 않는다. Work는 전체 파일을 분석한다. Live는 세션 중 임시 화자를 표시하고 종료 시 GPU 작업을 정리한 뒤 전체 오디오로 보정한다. 화자 분석이 실패하면 원본과 현재 스크립트를 저장하고 오류를 안내하며 Work 대기열을 재개한다.

공식 4인 샘플 56.8606875초를 CPU에서 약 4.017초에 분석했다. A·B·C·D를 구분하고 후반의 재발화에서 기존 A·C·D를 유지했다. 결과는 `test-results/diarization-four-speakers.json`에 있다. 단어 시간 겹침을 이용한 구간 분리와 A→B→A 회귀도 별도 테스트했다. 이 샘플 결과는 모든 한국어 음성·잡음·동시 발화의 정확도를 보장하지 않는다.

보조 엔진은 앱 전용 환경에 설치한다. 실제 CPU 모델 실행 검사에 성공한 뒤 준비 완료로 기록하고 손상된 환경은 재준비한다. 기존 설치에서는 첫 사용 시 추가 구성요소 다운로드가 필요할 수 있다.

모델 배포 출처와 라이선스는 `build/THIRD-PARTY-NOTICES.md`에 기록했다. TitaNet small의 모델 사용 조건은 [NVIDIA 공식 모델 카드](https://catalog.ngc.nvidia.com/orgs/nvidia/nemo/models/titanet_small)의 NeMo Toolkit 라이선스 안내로 확인했다. Pyannote 모델의 MIT LICENSE와 README는 다운로드한 모델과 함께 보관한다.
