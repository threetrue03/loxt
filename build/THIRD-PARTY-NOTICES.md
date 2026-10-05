# LOXT — Third-party notices

확인일: 2026-10-05 · 소스 버전: 1.13.0

LOXT 자체 코드의 저작권은 Copyright (c) 2026 threetrue03이며 MIT로 공개합니다. 아래 모델, 라이브러리, 글꼴, 실행 도구의 권리는 각 원 저작권자에게 있습니다. 이 고지는 외부 구성요소의 라이선스를 변경하지 않습니다. LOXT 로고는 별도 브랜드 사용 안내를 따릅니다.

저장소: https://github.com/threetrue03/loxt
모델 출처: https://github.com/threetrue03/loxt/blob/main/docs/MODEL-LICENSES.md
원문 사본 및 출처 기록: https://github.com/threetrue03/loxt/tree/main/docs/licenses

## 음성 인식·화자 모델

| 구성요소 | 저작권·제공자 | 라이선스·공식 출처 |
| --- | --- | --- |
| Whisper small / large-v3-turbo / large-v3 | Copyright (c) 2022 OpenAI | MIT — https://github.com/openai/whisper/blob/main/LICENSE |
| faster-whisper-small 변환본 | SYSTRAN 제공; 원본 OpenAI | MIT — https://huggingface.co/Systran/faster-whisper-small |
| faster-whisper-large-v3-turbo 변환본 | Mobius Labs / Dropbox Dash 제공; 원본 OpenAI | MIT — https://huggingface.co/dropbox-dash/faster-whisper-large-v3-turbo |
| faster-whisper-large-v3 변환본 | SYSTRAN 제공; 원본 OpenAI | MIT — https://huggingface.co/Systran/faster-whisper-large-v3 |
| pyannote segmentation 3.0 | Copyright (c) 2022 CNRS | MIT — https://huggingface.co/pyannote/segmentation-3.0 |
| NeMo TitaNet-S | NVIDIA / NeMo | Apache-2.0 — https://catalog.ngc.nvidia.com/orgs/nvidia/nemo/models/titanet_small/1.19.0 |
| Silero VAD | Copyright (c) 2020-present Silero Team | MIT — https://github.com/snakers4/silero-vad/blob/master/LICENSE |

음성·화자 모델의 원 저작권은 원 개발자에게 있습니다. LOXT는 모델이나 변환 가중치의 소유권을 주장하지 않습니다.

pyannote와 TitaNet의 ONNX 변환본은 sherpa-onnx 공식 GitHub release에서 다운로드합니다. pyannote 아카이브의 segmentation-LICENSE와 segmentation-README.md를 유지합니다. TitaNet 공식 모델 카드는 NeMo Toolkit 라이선스 적용을 명시하며 해당 1.19.0 버전은 Apache-2.0입니다: https://github.com/NVIDIA/NeMo/blob/v1.19.0/LICENSE

변환본 안내: https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html
NeMo 변환 모델 안내: https://k2-fsa.github.io/sherpa/onnx/nemo/index.html

모델은 사용자 PC로 내려받으며 저장소에 가중치를 포함하지 않습니다. 사용자가 불러온 외부 모델은 해당 제공자의 별도 조건을 따릅니다.

## 앱과 실행 환경

| 구성요소 | 저작권자·기여자 | 라이선스·원문 |
| --- | --- | --- |
| Python 3.13.16 | Python Software Foundation 및 기존 권리자 | PSF 및 포함된 별도 고지 — https://docs.python.org/3.13/license.html |
| Electron 44.5.1 | Electron contributors; Copyright (c) 2013-2020 GitHub Inc. | MIT — https://github.com/electron/electron/blob/v44.5.1/LICENSE |
| React 19.3.0 | Meta Platforms, Inc. and affiliates | MIT — https://github.com/facebook/react/blob/v19.3.0/LICENSE |
| faster-whisper 1.2.1 | Copyright (c) 2023 SYSTRAN | MIT — https://github.com/SYSTRAN/faster-whisper/blob/v1.2.1/LICENSE |
| CTranslate2 4.8.2 | SYSTRAN; OpenNMT Authors | MIT — https://github.com/OpenNMT/CTranslate2/blob/v4.8.2/LICENSE |
| sherpa-onnx 1.13.8 | sherpa-onnx / k2-fsa contributors | Apache-2.0 — https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/LICENSE |
| SoundCard 0.4.6 | Copyright (c) 2016 Bastian Bechtold | BSD-3-Clause — https://github.com/bastibe/SoundCard/blob/0.4.6/LICENSE |
| NumPy 2.4.3 | Copyright (c) 2005-2025 NumPy Developers | BSD-3-Clause — https://github.com/numpy/numpy/blob/v2.4.3/LICENSE.txt |
| PyAV 16.1.0 | Copyright retained by original committers | BSD-3-Clause — https://github.com/PyAV-Org/PyAV/blob/v16.1.0/LICENSE.txt |

Python 원문은 함께 제공하는 런타임의 LICENSE.txt에 있습니다. Electron의 LICENSE 및 LICENSES.chromium.html에는 Electron과 Chromium 등의 고지가 포함됩니다. 설치한 Python 배포본과 전이 의존성의 라이선스·메타데이터도 보존해야 합니다.

PyAV wheel은 FFmpeg 라이브러리를 포함할 수 있습니다. FFmpeg의 LGPL-2.1-or-later 및 선택한 빌드 구성에 따른 GPL 조건은 PyAV의 BSD 라이선스와 구분해야 합니다. 실제 wheel의 빌드 구성과 포함 라이브러리 고지를 확인하고, 재배포 시 정확히 대응하는 소스 제공 등 조건을 이행해야 합니다: https://ffmpeg.org/legal.html

NVIDIA CUDA/cuBLAS/cuDNN은 LOXT의 MIT 라이선스로 제공하지 않습니다. 설치한 wheel의 NVIDIA 라이선스와 재배포 조건이 적용됩니다. cuDNN 조건: https://docs.nvidia.com/deeplearning/cudnn/backend/latest/reference/eula.html
GPU 드라이버는 PC 소유자가 별도로 설치합니다.

## 글꼴

현재 앱은 SUIT를 사용합니다. 아래 글꼴은 저장소에 포함된 자산이며 각각 SIL Open Font License 1.1을 따릅니다.

| 글꼴 | 원문 저작권 고지 | 저장소의 라이선스 |
| --- | --- | --- |
| SUIT | Copyright (c) 2022, SUNN; Reserved Font Name SUIT | public/font-licenses/SUIT-LICENSE.txt |
| Pretendard | Copyright (c) 2021, Kil Hyung-jin; Reserved Font Name Pretendard | public/font-licenses/Pretendard-LICENSE.txt |
| NotoSansKR 자산 | Copyright 2014-2021 Adobe; Reserved Font Name Source | public/font-licenses/NotoSansKR-LICENSE.txt |

원문은 앱 정적 자산의 font-licenses에도 제공됩니다. 수정한 글꼴을 배포할 때는 OFL의 Reserved Font Name 조건 등을 확인해야 합니다.
SUIT 출처: https://github.com/sun-typeface/SUIT

## YouTube 가져오기 — yt-dlp

앱은 공식 yt-dlp Windows x64 실행 파일 **2026.08.19**를 함께 제공하고 release SHA-256으로 확인합니다.

- yt-dlp 소스 프로젝트 자체는 **Unlicense**입니다.
- 함께 제공하는 **PyInstaller Windows 실행 파일은 GPLv3+**입니다. 포함된 외부 코드에도 각 라이선스가 적용됩니다.
- yt-dlp-ejs에는 Unlicense, MIT, ISC 구성요소가 포함됩니다. JavaScript 실행에는 Electron의 Node 런타임을 사용합니다.

위 구분은 해당 버전의 공식 README Licensing 항목에 명시되어 있습니다:
https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/README.md#licensing

원본 release와 소스:
https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19
https://github.com/yt-dlp/yt-dlp/tree/2026.08.19
GPLv3 원문: https://www.gnu.org/licenses/gpl-3.0.txt
저장소의 원문 사본: docs/licenses/GPL-3.0.txt

이 실행 파일을 다시 배포할 때는 GPL 고지, 라이선스 원문, 정확히 대응하는 소스와 포함된 구성요소의 조건을 이행해야 합니다. upstream URL만 고지했다고 모든 바이너리 재배포 의무가 완료된다고 주장하지 않습니다. LOXT 코드의 MIT 라이선스로 이 실행 파일의 조건을 대체해서는 안 됩니다.

## 개발 자료와 고지 범위

저장소의 .agents/skills 등 외부 개발 도구·문서는 해당 upstream과 포함된 라이선스를 따릅니다. 예를 들어 frontend-design에 포함된 LICENSE.txt는 Apache-2.0입니다. LOXT의 MIT 고지가 외부 파일의 기존 권리와 고지를 대체하지 않습니다.

이 문서는 주요 구성요소의 출처·저작권 안내입니다. 모든 전이 의존성에 대한 SBOM이나 완성된 재배포 감사 결과는 아닙니다. 설치 파일을 변경·재배포할 때 각 배포본의 원문과 대응 소스를 확인해야 합니다.

로컬 녹음과 스크립트는 사용자 PC에 저장됩니다. 환경 준비에는 PyPI, Hugging Face, 공식 GitHub release 등에 접속하며, YouTube 가져오기는 YouTube와 미디어 서버에 접속합니다. 녹음을 클라우드 전사 서비스로 업로드하지 않습니다.


## 메모 편집기 (1.13.0)

BlockNote core / react / mantine / code-block / math-block 0.55.0은 TypeCellOS 및 BlockNote 기여자가 제공하며 MPL-2.0입니다. 원본 패키지 소스는 수정하지 않았습니다. LOXT의 자체 코드에는 MIT가 유지됩니다. BlockNote 소스와 라이선스는 https://github.com/TypeCellOS/BlockNote 및 https://www.npmjs.com/package/@blocknote/core/v/0.55.0 에서 확인할 수 있습니다. 설치본의 `resources/editor-licenses/`에 각 패키지의 저작권·라이선스 원문을 함께 배포합니다. GPL 상용 확장 패키지(`@blocknote/xl-*`)는 사용하지 않습니다.

Mantine 8.3.11, Tiptap/ProseMirror, Shiki, KaTeX, Floating UI, sanitize-html 2.18.0 등 편집기 의존성은 각 제공자의 라이선스를 따릅니다. 정확한 버전·라이선스·소스 주소 목록은 `editor-licenses/index.json` 및 저장소의 `docs/licenses/editor-packages.json`에 기록합니다. BlockNote MPL-2.0 원문은 `docs/licenses/BlockNote-MPL-2.0.txt`에도 보관합니다.
