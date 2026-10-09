# LOXT 2.6.0 모델 스토어 구현·검증

## 구현 범위

홈의 세 모델 역할 선택, Work·Live 모델 스토어, 설정 → 모델 보관함의 공통 관리 UI를 구현했다. 별명·태그는 공통 모델 정보이며 역할·기본 선택은 모드별이다. 기존 사용자 선택을 강제로 바꾸지 않는다. 직접 불러온 모델의 원본은 유지한다.

검색은 Hugging Face 공식 모델 API의 음성 인식 분류를 사용한다. 공개 모델을 20개씩 표시하며 요청 한 번의 상한은 200개다. 모델·제공자 이름을 검색한다. 전체/Work/Live/한국어/설치됨 필터를 제공한다. 한국어는 모델 카드의 언어 정보에 기반하며 정확도 검증 표시가 아니다. 검색 입력은 400ms 지연하며 이전 검색 응답은 최신 결과를 덮어쓰지 못한다.

기본 목록은 24시간, 검색어별 결과는 15분 캐시한다. 오류 시 기존 캐시와 오류 안내를 제공한다. 상세·설치에서는 최신 메타데이터를 요청한다. 저장소 이름, 고정 commit, 허용 파일 이름, 크기와 SHA256 또는 Git blob SHA1을 검사한다. 모델 바이너리는 SHA256이 필요하다. 저장소의 Python 코드·pickle을 가져오거나 실행하지 않는다. 미지원 엔진·승인이 필요한 모델은 설치하지 않는다.

설치 파일은 staging 폴더에서 검증하고 CT2 Whisper 실제 로딩·예시 추론을 통과한 뒤 안정적인 모델 ID로 등록한다. 업데이트 실패·취소 시 기존 설치를 보존한다. 설치 교체에는 내구성 있는 저널을 남겨 재시작 시 이전 모델 복원 또는 완료된 등록 정리를 수행한다. 준비 과정에서도 스토어 설치 버전을 자동 갱신하지 않는다. 설치·삭제·모델 역할 변경·성능 확인은 녹음/변환/Live/YouTube 작업과 충돌하지 않도록 차단한다.

추천은 GPU 메모리와 기존 기본 모델 기준의 **예상** 또는 해당 모델/버전/하드웨어의 **실측**이다. 임의의 종합 벤치마크 점수나 정확도 점수를 표시하지 않는다. 파일 RTF가 1 이하면 예시 음성을 음성 길이보다 빠르게 처리했다는 뜻이며 모든 음성에서 실시간을 보장하지 않는다. 별도 스트리밍 엔진은 구현하지 않았다. Work와 Live는 기존 faster-whisper 엔진을 유지한다.

웹 모델 스토어는 연결한 PC의 목록·검색·상세를 읽는다. 모델 설치·삭제·역할 변경·성능 측정은 PC 앱에서 수행한다. 웹 브라우저의 녹음과 PC 변환은 유지된다.

## 실제 추론 검증

`scripts/model-store-integration.cjs`로 개인 녹음 없이 별도 프로필에서 Hugging Face 실제 검색 → tiny 다운로드 → 파일 해시 → CUDA 로딩 검사 → 예시 음성 시간 측정을 수행했다. 기존 사용자 모델·보관함·설정은 변경하지 않았다. 기존 실행 엔진을 읽어 사용하고 모델 파일과 결과는 테스트 프로필에 저장했다.

| 조건/결과 | 측정 |
| --- | --- |
| 모델 | SYSTRAN faster-whisper-tiny · commit은 실제 결과 JSON 참조 |
| 다운로드 | 78,205,610 bytes · 파일 해시 검사 통과 |
| 하드웨어 | NVIDIA GeForce RTX 2060 · VRAM 6144 MiB |
| 연산 | CUDA int8_float16 |
| 예시 | Windows 로컬 합성 한국어 음성 14.86초 |
| 모델 로딩 | 0.551초 |
| 파일 변환 | 2회 평균 0.451초 · RTF 0.0303 |
| 2초 청크 처리 | 90.6ms |
| 6초 청크 RTF | 0.0276 |
| 최대 프로세스 RAM | 약 550.5 MiB · GPU 사용량 측정값 아님 |

이는 짧은 합성 음성의 처리 시간이다. 한국어 실제 음성 정확도, 마이크 입력·청크 대기·화자 분석·UI 갱신을 포함한 전체 Live 지연, 모든 외부 모델, 다른 GPU/CPU 성능을 검증한 결과가 아니다. 반복 실행과 캐시 상태에 따라 수치는 달라진다. 원본 측정은 `test-results/model-store-2.6.0/real-integration.json`이다. 소개 사이트의 샘플 스크립트·Live 장면은 이 추론 증거와 별개다.

## 검증 방법

- `node --test scripts/model-store.test.cjs`: 호환성·고정 다운로드 계획·코드 파일 제외·역할 분리·별명 저장·기본 선택 실패 복원·캐시·오래된 응답·실측 검증·손상 설정 보존·업데이트 실패/취소·설치 중단 복구.
- `.runtime/python/python.exe -m unittest discover -s python -p test_store_download.py`: 경로·미고정 버전·불완전 해시 거부와 Git blob SHA1 검증.
- `npm run test:release`: 기존 앱 기능 회귀 검증. 샌드박스의 로컬 연결 차단 실패와 앱 실패를 구분하고 연결 허용 환경에서 실행한다.
- `node scripts/model-store-ui-smoke.mjs [packaged-exe]`: 독립 예시 프로필에서 실제 Electron 화면, Work/Live 역할·별명·기본 선택, 검색 응답 역전 보호, 미지원 설치 차단, 다크/라이트와 1360/1000/760/480px 배치, 재시작 유지. UI용 카탈로그와 검색 응답은 예시이며 다운로드·추론 검증이 아니다.
- `node landing/scripts/release.mjs`: 현재 패키징 앱의 별도 예시 프로필 캡처·README 홈 이미지·소개 사이트 빌드·390/768/1440px 검증·Production ZIP 준비.

## 주요 파일

- `electron/model-store.cjs`: 제공처 정보·캐시·역할·태그·추천·성능 측정.
- `electron/transcriber.cjs`, `electron/model-installation.cjs`: 설치·검증·교체·취소·중단 복구.
- `python/store_download.py`, `python/model_benchmark.py`, `python/benchmark-speech.ps1`: 고정 파일 다운로드·검사와 실제 예시 음성 측정.
- `src/HomeModels.jsx`, `src/ModelStore.jsx`, `src/useModelStore.js`, `src/modelOptions.js`: 홈·스토어·관리·역할 기반 드롭다운.

## 공식 자료

- [Hugging Face Hub API](https://huggingface.co/docs/hub/api)
- [모델 검색](https://huggingface.co/docs/huggingface_hub/guides/search)
- [고정 버전 다운로드](https://huggingface.co/docs/huggingface_hub/guides/download)
- [faster-whisper 실행 엔진](https://github.com/SYSTRAN/faster-whisper)

로컬 설치 파일·README·사이트 파일 준비와 GitHub/Cloudflare의 실제 게시 상태는 구분한다. 사용자의 게시 지시 없이 commit/push/릴리스 업로드/Production 게시를 실행하지 않는다.

## 최종 검증 결과

- 전체 회귀 테스트 112/112 통과. 두 파일 시스템/비동기 시점 실패는 개별 재검증 3/3 및 전체 재실행 112/112에서 통과했다. 최초 실패 로그도 보존했다.
- 모델 다운로드 Python 검증 2/2 통과. 실제 공개 모델 파일 다운로드·해시·CUDA 모델 실행 및 합성 음성 측정은 별도 통합 로그로 확인했다.
- 최종 패키지의 실제 Electron 화면에서 Work/Live 역할 분리, 별명·태그, 기본 선택, 오래된 검색 응답 차단, 미지원 엔진 설치 차단, 다크/라이트·1360/1000/760/480px 배치, 재시작 유지 확인.
- 2026-10-09 공개 다운로드 주소 HEAD 확인: HTTP 404. 로컬 준비 후 GitHub Releases 업로드가 필요하다.

- Work 모델 상주·Live GPU 예약 작업자 테스트 4/4 통과.
- 설치 파일과 렌더러·Electron·Python/PowerShell 소스 일치, 테스트 작업 파일 제외 확인. 설치 파일 193,725,043바이트, SHA-256 `c4d0a9f387444bd538317f1ccac47c72f64d009926975a7b86a847ee0c18c435`.
- `node landing/scripts/release.mjs` 완료: 예시 앱 화면 50개, README 이미지 갱신, 사이트 빌드와 390/768/1440px 검사 통과. ZIP 4,664,043바이트, 루트 index.html/assets 확인.
- 설치 파일: `release/stage5/LOXT-Setup-2.6.0-x64.exe`. 사이트 ZIP: `landing/loxt-site-v2.6.0.zip`. 외부 commit/push/릴리스 업로드/사이트 게시 미실행.
