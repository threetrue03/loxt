# LOXT 음성 인식 모델 선정 조사

조사일: 2026-10-09. 대상: LOXT 2.5.0, Windows x64, 한국어 중심 Work·Live. 실제 GPU 조회: NVIDIA GeForce RTX 2060, 6144 MiB.

이번 작업은 코드·설정·설치 모델을 읽고 공식 모델 카드·논문·런타임 문서를 비교한 조사다. 후보 모델 다운로드, 추론, 사용자 음성 평가, 앱 수정은 하지 않았다. 아래 추천은 검증 순서이며 실측 순위가 아니다.

## 결론

현재 Whisper 구성은 Work의 안정적인 기준선으로 합리적이다. 그러나 한국어 정확도와 Live 반응속도까지 고려해 최선이라고 확정할 근거는 없다. 특히 Live에는 모델 선정뿐 아니라 입력 누적, 반복 추론, 화자 분석을 기다리는 구조가 영향을 준다.

- Work: 표준 turbo를 유지하고, 한국어 특화 BuzzASR/korean을 먼저 비교한다. Qwen3-ASR-0.6B·1.7B는 별도 엔진 후보로 평가한다.
- Live: 한국어 streaming Zipformer를 우선 시험한다. 빠른 임시 스크립트와 종료 후 정확도 보정을 분리하는 방안을 검토한다.
- 기존 설치 모델과 기록은 그대로 유지한다. 동일 음성·동일 평가 조건에서 개선을 확인하기 전 기본값을 교체하지 않는다.

## 1. 현재 구현에서 확인한 사실

| 구분 | 현재 상태 | 근거 |
| --- | --- | --- |
| 설치 모델 | small, medium, large-v3-turbo, large-v3 디렉터리 존재 | 실제 production transcription/models 읽기. 이번에는 무결성·추론 검사하지 않음 |
| 기본 제공 프리셋 | 저성능=small, 표준=large-v3-turbo, 고성능=large-v3 | electron/transcription-config.cjs:4, :6, :7 |
| 추가 카탈로그 | tiny, base, medium도 등록 | electron/transcription-config.cjs:2, :3, :5 |
| 모델 원본 | small·medium·large-v3는 Systran CT2 변환본, turbo는 mobiuslabsgmbh CT2 변환본 | electron/transcription-config.cjs:4 및 python/downloads.py:22 |
| 실행 엔진 | faster-whisper 1.2.1 / CTranslate2 4.8.2 | python/requirements.txt:1 |
| 정밀도 | GPU는 지원 시 int8_float16 우선, CPU는 int8 우선 | electron/transcription-config.cjs:17 |
| Work 추론 | 한국어 고정, beam 5, VAD, 단어 시간 정렬, 이전 텍스트 조건 사용 안 함 | python/worker.py:105 |
| Live 추론 | 같은 Whisper 계열, 한국어 고정, beam 3, 단어 시간 정렬 | python/live_worker.py:55 |
| 외부 모델 가져오기 | faster-whisper 형식만 지원 | electron/transcriber.cjs:115, :124 |

LOXT가 모델을 자체 학습한 것은 아니다. 공개 Whisper 모델을 내려받아 실행하며, faster-whisper는 모델 이름이 아니라 추론 구현이다. Qwen·Zipformer·SenseVoice를 현재 외부 모델 버튼으로 바로 가져올 수는 없다.

## 2. 현재 모델을 계속 제공할 가치

| 모델 | 평가 | 권장 역할 |
| --- | --- | --- |
| small | 자원 부담이 낮은 기존 선택지. 한국어 전문 용어·소음·대화 정확도는 직접 비교 필요 | CPU/낮은 사양 기준선 |
| medium | 추가 선택지로 유지 가능. turbo보다 파라미터가 조금 작다는 이유로 더 빠르다고 볼 수 없음 | CPU·메모리 조건별 비교용 |
| large-v3-turbo | large-v3의 디코더를 32층에서 4층으로 줄인 모델. 속도·품질 균형을 위한 Work 기본값으로 타당 | Work 표준 기준선 |
| large-v3 | 정확도 비교 기준으로 유지 가치. 모든 한국어 문장에서 turbo보다 낫다는 보장은 없음 | Work 정확도 우선·재변환 |

turbo 구조 설명은 [공식 모델 카드](https://huggingface.co/openai/whisper-large-v3-turbo)에 근거한다. [OpenAI Whisper 저장소](https://github.com/openai/whisper)는 파라미터·속도·VRAM 비교를 제공하지만, 그 VRAM 표를 LOXT의 CT2 양자화 사용량으로 그대로 옮길 수는 없다.

[faster-whisper 공식 벤치마크](https://github.com/SYSTRAN/faster-whisper#benchmark)는 정밀도와 배치 크기에 따라 속도·메모리가 크게 달라짐을 보여준다. 해당 GPU는 RTX 3070 Ti이며 large-v2 등 특정 모델의 결과다. RTX 2060의 한국어 Live 지연으로 환산하지 않는다.

## 3. 새 후보 비교

| 후보 | 한국어 | Work·Live 적합성 판단 | LOXT에 넣을 때 제약 | 조사 판단 |
| --- | --- | --- | --- | --- |
| BuzzASR/korean | 한국어 특화 | Work 정확도 비교에 유력. Whisper large-v3 기반이라 Live 지연 개선 전용 모델은 아님 | CT2 변환·토크나이저·언어 프롬프트·시간 토큰 호환성을 확인해야 함 | Work 우선 시험 |
| Qwen3-ASR-0.6B | 공식 지원 | Work 경량 대안 및 Live 후보 | 별도 엔진. 공식 스트리밍은 vLLM이고 시간 정보 반환을 지원하지 않음 | 자원·품질 비교 후보 |
| Qwen3-ASR-1.7B | 공식 지원 | Work 한국어 정확도 우선 후보 | 별도 엔진·정렬 모델·6GB 메모리 여유 확인 필요 | Work 품질 비교 후보 |
| sherpa-onnx Korean streaming Zipformer | 한국어 전용 | Live 구조에 잘 맞는 후보. 모델 내부 스트리밍 상태를 사용하는 방향 | ASR 엔진 추가, 문장부호·숫자·영어 혼용·화자 결합 평가 필요 | Windows Live 우선 시험 |
| SenseVoiceSmall | 공식 지원 | 빠른 구간 인식 후보. 원본을 native streaming으로 간주하면 안 됨 | 별도 런타임, 모델 라이선스, 시간 정렬·한국어 품질 확인 | Live 보조 비교 |
| Fun-ASR-MLT-Nano-2512 | 공식 지원 | Work 추가 비교 후보 | 모델 카드에서 timestamps·diarization 지원이 TODO. 일반 Nano와 구별 필요 | 후순위 |
| Voxtral Mini 4B Realtime 2602 | 공식 지원 | native streaming 후보 | BF16 공개본과 4B 규모는 6GB 기본 배포에 부담. 양자화·Windows 런타임 별도 검증 | 더 큰 하드웨어용 후순위 |
| Moonshine 한국어 Tiny | 지원 | 작은 한국어 모델이지만 이번 기본 교체 후보에서 제외 | 한국어 streaming 체크포인트가 아직 없고 현재 한국어 모델은 비상업 Community 조건 | 상업용 LOXT 기본 후보 제외 |

표의 적합성·우선순위는 아래 공식 자료와 현재 코드에 근거한 판단이며, 실제 LOXT 성능 측정값이 아니다.

### BuzzASR/korean

2026-09 논문의 한국어 Whisper 미세 조정 모델이다. 모델 카드의 동일 평가에서 Combined CER은 Whisper large-v3 5.72% → BuzzASR 4.61%, Common Voice 25는 6.01% → 4.24%, FLEURS는 5.31% → 5.16%다. 개선 폭은 데이터셋에 따라 다르며, 회의·강의·잡음·한국어와 영어 혼용까지 검증됐다는 뜻은 아니다. 모델 카드에 MIT가 표시되어 있다. [공식 모델 카드](https://huggingface.co/BuzzASR/korean), [논문](https://arxiv.org/html/2609.09554v1).

현재 엔진과 같은 Whisper 구조라 별도 계열보다 통합 범위가 작을 가능성이 있다. 이는 추론이며 아직 CT2 변환·LOXT 실행을 검증하지 않았다. 한국어 전용 특성이 영어 혼용에 불리한지도 시험해야 한다.

### Qwen3-ASR

공식 0.6B·1.7B 모델 모두 한국어와 offline/streaming을 지원한다. 라이선스는 Apache-2.0이다. 공식 패키지의 스트리밍은 vLLM 전용이고 timestamps를 반환하지 않는다. Work 시간 정보에는 별도 ForcedAligner가 필요하다. [공식 0.6B 카드](https://huggingface.co/Qwen/Qwen3-ASR-0.6B), [공식 1.7B 카드](https://huggingface.co/Qwen/Qwen3-ASR-1.7B).

개발팀 논문의 한국어 CER은 다음과 같다. [Qwen3-ASR 논문 Appendix B·평가 지표](https://arxiv.org/html/2601.21337v1).

| 평가셋 | 0.6B CER | 1.7B CER |
| --- | --- | --- |
| FLEURS 한국어 | 3.72% | 2.57% |
| Common Voice 한국어 | 8.48% | 5.88% |
| MLC-SLM 한국어 | 10.31% | 8.61% |

이 표에는 같은 조건의 한국어 Whisper·BuzzASR 결과가 없으므로 위 BuzzASR 수치와 직접 순위를 매기지 않는다. 특히 2.57%를 근거로 LOXT의 모든 한국어 녹음에서 최선이라고 단정하지 않는다. 논문 스트리밍 비교의 영어·중국어 수치도 한국어 스트리밍 정확도의 증거는 아니다.

Windows 배포의 실질적 난점이 있다. [vLLM 공식 설치 문서](https://docs.vllm.ai/en/latest/getting_started/installation/gpu/)는 Windows native 미지원과 WSL 대안을 명시한다. [FlashAttention 공식 문서](https://github.com/Dao-AILab/flash-attention#nvidia-cuda-support)의 기본 FlashAttention-2 경로도 RTX 2060에 그대로 적용할 수 없다. Work는 FP16·다른 attention 경로를 평가하고, 공식 BF16 예시를 그대로 복사하지 않아야 한다.

[llama.cpp 공식 지원 목록](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)에 Qwen3-ASR GGUF가 있다. 따라서 Windows 대안을 조사할 수 있다. 다만 오디오 입력 지원이나 출력 토큰 스트리밍을 Qwen 공식의 입력 오디오 스트리밍·정렬 지원과 동일하다고 간주하면 안 된다.

가중치만 단순 계산하면 0.6B FP16은 약 1.2GB, 1.7B는 약 3.4GB다. 이는 메모리 측정이 아니다. 오디오 인코더 활성값·캐시·런타임·정렬 모델·다른 GPU 프로그램이 추가되어 실제 최고 VRAM은 별도로 측정해야 한다. 6GB에서 1.7B와 정렬 모델의 동시 상주를 보장하지 않는다.

### Korean streaming Zipformer

공식 sherpa 문서는 한국어 전용 모델, Windows 실행 예시, 실시간 마이크 인식을 제공한다. INT8 encoder는 약 121MB이며 decoder·joiner를 합쳐 핵심 ONNX 가중치는 약 126MB다. 원본 checkpoint 카드에는 Apache-2.0과 약 79M 파라미터가 표시된다. [공식 실행 문서](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html#sherpa-onnx-streaming-zipformer-korean-2024-06-16-korean), [제작자 모델 카드](https://huggingface.co/johnBamma/icefall-asr-ksponspeech-pruned-transducer-stateless7-streaming-2024-06-12).

320ms·640ms 청크 평가가 존재하지만 그것은 청크 크기이며 LOXT 화면의 총 지연 보장이 아니다. 문서의 단일 샘플 RTF도 이 PC의 실측 결과가 아니다. 한국어 대화로 학습한 점과 Windows·CPU 경로 때문에 Live 우선 시험 대상으로 판단한다. 영어 혼용·문장부호·전문 용어의 품질은 따로 검증한다.

### 나머지 후보와 제외 근거

- SenseVoiceSmall: 한국어를 지원하는 비자기회귀 모델. 공식 카드의 빠른 추론 수치를 현재 PC의 사용자 체감 지연으로 옮길 수 없다. [공식 카드](https://huggingface.co/FunAudioLLM/SenseVoiceSmall). 공식 저장소는 소스 MIT와 가중치 조건을 구분하고, 공식 가중치의 상업 사용 허용 및 귀속·모델 이름 조건을 안내한다. [공식 라이선스 설명](https://github.com/QwenAudio/SenseVoice#license). 변환본도 자체 조건 확인 필요.
- Fun-ASR: 한국어는 **MLT** Nano의 지원 범위이며 일반 Nano는 중국어·영어·일본어다. MLT는 800M·Apache-2.0이며 timestamp·화자 기능은 카드에서 TODO다. [공식 카드](https://huggingface.co/FunAudioLLM/Fun-ASR-MLT-Nano-2512).
- Voxtral: 한국어를 포함한 native streaming·Apache-2.0 후보다. 공개 BF16 약 4B 모델의 가중치만 산술상 약 8GB 이상이라 RTX 2060 6GB 기본 경로로 우선 추천하지 않는다. 이는 실측이 아니며 양자화 구현의 가능성까지 부정하는 판단은 아니다. [공식 카드](https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602).
- Moonshine: 최신 공식 목록은 한국어 streaming 모델이 없다고 명시한다. 영어 streaming의 MIT·저지연 홍보를 한국어에 적용할 수 없다. 한국어 기존 모델은 비상업 Community 조건이다. [모델 목록](https://moonshine-voice.readthedocs.io/en/latest/models/available-models/), [라이선스 원문](https://github.com/moonshine-ai/moonshine/blob/main/LICENSE).
- Parakeet TDT 0.6B v3: 공식 25개 지원 언어에 한국어가 없다. 한국어 기본 후보 제외. [공식 카드](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3).
- Distil-large-v3: 공식적으로 영어용 Whisper 대체 모델이다. 한국어 기본 후보 제외. [공식 카드](https://huggingface.co/distil-whisper/distil-large-v3).

## 4. 현재 Live 지연의 코드상 요인

### 모델 결과를 요청하기 전 입력을 기다린다

electron/live-windows.cjs:16에서 미리보기는 음성이 있고 마지막 요청 이후 약 2초가 지났을 때 요청한다. 확정은 :14에서 0.5초 무음 또는 최대 6초 구간을 조건으로 하고, :20에서 이전 경계의 0.6초를 포함한다. 시작 직후 계속 발화하는 조건에서는 첫 미리보기 요청 전 약 2초의 누적 시간이 있다. 짧은 발화 종료는 다른 조건으로 더 빨리 요청될 수 있다.

같은 구간이 커지는 동안 Whisper로 다시 추론하는 구조라 계산을 반복한다. 이는 코드를 읽은 분석이며 현재 지연을 몇 초 줄일 수 있는지 측정한 결과는 아니다.

### 텍스트 인식 뒤 화자 분석이 끝나야 결과를 내보낸다

python/live_worker.py:55에서 ASR을 실행하고 :58에서 speakers.turns(audio, online=True)를 실행한 뒤 :61에서 result를 보낸다. python/speakers.py:41–44의 화자 모델은 CPU이며 :52는 구간에 대해 offline diarizer를 호출한다. online=True는 화자 정체성 연결을 위한 옵션이지 해당 diarizer를 native streaming으로 바꾸는 설정이 아니다.

따라서 새 ASR이 빨라져도 화자 분석이 결과 반환 경로에 남으면 지연이 계속될 수 있다. ASR·정렬·화자 각각의 소요 시간을 나누어 측정해야 한다.

### 짧은 문맥과 시간 정렬의 비용

Live는 beam 3, word_timestamps=True, condition_on_previous_text=False다. 이전 텍스트를 넘기지 않아 문맥의 연속성이 제한될 수 있고, 경계에서 잘린 단어·고유명사를 잘못 인식할 수 있다. 단어 정렬도 비용이 있다. 다만 이전 텍스트 조건을 단순히 켜면 반복·환각이 늘 수 있으므로 설정 하나로 해결한다고 보지 않는다.

### 제안하는 구조

빠른 임시 텍스트를 먼저 표시하고, 화자 배지는 비동기 보강하며, 종료 시 필요하면 더 정확한 Work 모델과 정렬로 최종 스크립트를 보정한다. 종료 시 보정은 추가 계산과 완료 대기가 생기므로 선택 가능하게 설계할 필요가 있다. 아직 구현을 승인받거나 작성하지 않았다.

## 5. 검증 계획과 선정 기준

개인 녹음은 자동으로 사용하지 않는다. 사용 승인을 받은 테스트 음성 또는 공개·합법적으로 평가 가능한 음성으로 구성한다. 공개 테스트셋 하나에서 좋은 모델을 전체 사용처의 최선으로 보지 않는다.

| 항목 | 권장 조건·지표 |
| --- | --- |
| 음성 구성 | 한국어 강의·회의·자연 대화·빠른 발화·소음·영어 혼용·숫자/날짜/이름·무음 포함. 30–60분 정도부터 시작 |
| 기준선 | 기존 small, turbo, large-v3. medium은 CPU 비교에 포함 |
| Work 후보 | BuzzASR/korean, Qwen3-ASR 0.6B/1.7B |
| Live 후보 | turbo 현재 경로, Zipformer, SenseVoice. Qwen은 Windows 스트리밍 경로를 확보한 뒤 |
| 정확도 | 동일 정규화 규칙의 CER·WER, 숫자/고유명사 오류, 삭제·중복·환각을 별도 집계 |
| 속도 | cold/warm 모델 준비 시간, Work RTF, Live 첫 글자·후속 업데이트·문장 확정 지연의 중앙값/P95 |
| 자원 | 최고 RAM/VRAM·CPU, 30분 연속 사용 시 대기열 누적·실시간 처리 지속성 |
| 호환성 | 페이지 이동·일시정지·장치 전환·취소·종료/재시작·화자 보강·스크립트 시간 재생 |
| 공정성 | 동일 파일·샘플레이트·batch=1 조건. 모델만 바꾼 시험과 모델+처리구조를 바꾼 시험을 분리 |

제품 목표안은 준비 완료 후 Live 첫 표시 P95 1초 이내, 확정은 발화 종료 후 P95 1.5초 이내로 두고 검증할 수 있다. 이는 목표 제안이지 현재 어느 후보가 달성했다는 주장도, 보장도 아니다. 정확도 향상은 동일 평가에서 CER 감소와 중요한 숫자·고유명사 오류 감소를 함께 확인한다.

선정 순서는 **기준선 측정 → 한국어 특화 Work 후보 비교 → Windows streaming Live 후보 비교 → 통합 비용·라이선스·설치 용량까지 평가 → 기본값 결정**을 권장한다.

## 6. 이번에 검증하지 않은 범위

- 새 모델의 다운로드·변환·실제 추론·최고 메모리와 한국어 인식 품질.
- 공개 벤치마크의 독립 재현, 한국어 Live의 실제 지연과 화자 비용.
- BuzzASR CT2 변환·시간 정보 호환성, Qwen GGUF/Windows streaming, 양자화 Voxtral.
- 상업 배포 시 각 변환 artifact의 라이선스·고지 파일 최종 확인.

현재 자료만으로 모델을 전부 바꾸는 결론은 내리지 않는다. Work는 기존 표준을 유지하면서 한국어 특화 후보를 시험하고, Live는 전용 스트리밍 경로를 먼저 검증하는 것이 가장 타당하다.
