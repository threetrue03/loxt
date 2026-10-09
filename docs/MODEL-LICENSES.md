# 음성·화자 모델 출처와 라이선스

확인일: **2026-10-09**. 확인한 모델 카드, 원 개발자의 라이선스, 실제 다운로드 출처를 구분해 기록합니다. 모델 가중치는 이 저장소의 소스코드에 포함되지 않으며 앱에서 사용자 PC로 다운로드합니다. LOXT의 배포 조건과 외부 모델의 라이선스는 별개입니다.

## Whisper 음성 인식 모델

| 앱 표시 | 원본 모델 | 앱이 사용하는 CTranslate2 변환본 | 라이선스 |
| --- | --- | --- | --- |
| 저성능 | [OpenAI whisper-small](https://huggingface.co/openai/whisper-small) | [SYSTRAN faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small) | MIT |
| 표준 · 최초 역할 | [OpenAI whisper-large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo) | [Dropbox Dash faster-whisper-large-v3-turbo](https://huggingface.co/dropbox-dash/faster-whisper-large-v3-turbo) | MIT |
| 고성능 | [OpenAI whisper-large-v3](https://huggingface.co/openai/whisper-large-v3) | [SYSTRAN faster-whisper-large-v3](https://huggingface.co/Systran/faster-whisper-large-v3) | MIT |

- 원본 Whisper 코드·모델: **Copyright (c) 2022 OpenAI**, [공식 MIT 라이선스](https://github.com/openai/whisper/blob/main/LICENSE). [원문 사본](./licenses/whisper-MIT.txt).
- SYSTRAN과 Mobius Labs / Dropbox Dash는 앱에서 사용하는 변환본 제공자입니다. 변환본 모델 카드에도 MIT가 표시되어 있습니다.
- 앱 설정의 표준 모델 ID는 기존 `mobiuslabsgmbh/faster-whisper-large-v3-turbo`를 유지합니다. [해당 주소](https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo)는 확인일 기준 Dropbox Dash 저장소로 연결됩니다. 이 문서 작성 과정에서 앱 설정을 변경하지 않았습니다.
- 2.6.0에서 SYSTRAN의 tiny·base·medium도 설치할 수 있습니다. 확인한 공식 모델 카드에는 MIT가 표시되어 있습니다. 모델 역할은 사용자가 Work·Live별로 바꿀 수 있으므로 앱 표시가 원본 모델을 고정해서 뜻하지 않습니다.
- 검색하거나 사용자가 추가한 외부 모델은 해당 저장소의 모델 카드와 라이선스를 별도로 확인해야 합니다. 기본 모델이 MIT라고 해서 모든 외부 모델이 MIT인 것은 아닙니다.

2.6.0 모델 스토어는 모델 카드의 라이선스를 표시하고 고정 버전에서 README 및 제공되는 LICENSE 파일을 함께 받습니다. LICENSE가 없는 저장소도 있으므로 상세의 원 제공처를 확인하세요. 모든 검색 모델의 상업적 사용 허용을 보증하지 않습니다. 기존 설치 프로그램의 Whisper 다운로드는 실행에 필요한 파일 위주입니다. 재배포할 때는 라이선스와 저작권 고지를 함께 제공해야 합니다.

## 화자 구분과 음성 구간 감지

| 구성요소 | 원 개발자·출처 | 용도 | 라이선스 |
| --- | --- | --- | --- |
| pyannote segmentation 3.0 | CNRS / pyannote | 발화 구간·화자 변화 감지 | MIT |
| NeMo TitaNet-S | NVIDIA / NeMo | 목소리 임베딩 비교 | Apache-2.0 |
| Silero VAD | Silero Team | 음성 구간 감지 | MIT |

### pyannote segmentation 3.0

[원본 모델 카드](https://huggingface.co/pyannote/segmentation-3.0)는 MIT를 명시합니다. 원본 Hugging Face 접근에는 모델 카드에 기재된 동의 절차가 있습니다.

앱은 [sherpa-onnx 공식 문서](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html)에서 안내하는 [ONNX 변환 아카이브](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2)를 사용합니다. 이 아카이브의 `segmentation-LICENSE`는 **Copyright (c) 2022 CNRS**의 MIT 원문이며, 추출한 [사본](./licenses/pyannote-segmentation-MIT.txt)을 보관했습니다. 아카이브의 고지와 README를 유지해야 합니다.

### NVIDIA NeMo TitaNet-S

[NVIDIA 공식 TitaNet Small 1.19.0 모델 카드](https://catalog.ngc.nvidia.com/orgs/nvidia/nemo/models/titanet_small/1.19.0)는 모델에 NeMo Toolkit 라이선스가 적용된다고 명시합니다. 해당 버전의 [NeMo Toolkit LICENSE](https://github.com/NVIDIA/NeMo/blob/v1.19.0/LICENSE)는 **Apache-2.0**입니다. [원문 사본](./licenses/NeMo-Apache-2.0.txt).

앱은 sherpa-onnx가 제공하는 [nemo_en_titanet_small.onnx](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx)를 사용합니다. 원본과 변환본의 관계는 [sherpa-onnx NeMo 문서](https://k2-fsa.github.io/sherpa/onnx/nemo/index.html)를 참고하세요. 원본 모델의 라이선스 조건과 고지를 유지해야 하며, 모델을 수정해 배포할 경우 변경 사실을 표시하고 적용 가능한 NOTICE도 보존해야 합니다.

### Silero VAD

faster-whisper에 포함된 음성 구간 감지 모델입니다. **Copyright (c) 2020-present Silero Team**, [공식 MIT 라이선스](https://github.com/snakers4/silero-vad/blob/master/LICENSE). [원문 사본](./licenses/Silero-VAD-MIT.txt).

## 실행 엔진과 재배포

faster-whisper와 CTranslate2는 MIT, sherpa-onnx는 Apache-2.0입니다. 모델 가중치의 라이선스와 실행 엔진의 라이선스는 각각 확인해야 합니다. NVIDIA GPU 실행 라이브러리에는 별도 NVIDIA 조건이 적용됩니다.

외부 구성요소 전체 안내: [THIRD-PARTY-NOTICES](../build/THIRD-PARTY-NOTICES.md). 원문 출처와 사본의 SHA-256: [licenses/sources.json](./licenses/sources.json).
