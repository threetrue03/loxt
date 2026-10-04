# LOXT — 포함 및 다운로드 구성요소

Python 3.13.16: Python Software Foundation License. LICENSE.txt is included with the bundled runtime.
https://docs.python.org/3/license.html

Electron: MIT. LICENSE and LICENSES.chromium.html are included with the application.
https://github.com/electron/electron/blob/main/LICENSE

React: MIT. https://github.com/facebook/react/blob/main/LICENSE

Bundled font (SIL Open Font License 1.1):

- SUIT: https://github.com/sun-typeface/SUIT — font-licenses/SUIT-LICENSE.txt

The font license is included in the renderer bundle. All application screens use SUIT offline.

Downloaded into the private local runtime during environment preparation:

- faster-whisper — MIT: https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE
- CTranslate2 — MIT: https://github.com/OpenNMT/CTranslate2/blob/master/LICENSE
- PyAV — BSD: https://github.com/PyAV-Org/PyAV/blob/main/LICENSE.txt
- Whisper models — MIT: https://github.com/openai/whisper/blob/main/LICENSE
- sherpa-onnx — Apache-2.0: https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE
- Pyannote segmentation 3.0 ONNX — MIT (CNRS). The downloaded model includes segmentation-LICENSE and segmentation-README.md. https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html
- NeMo TitaNet small speaker embedding — Apache-2.0: https://github.com/NVIDIA/NeMo/blob/main/LICENSE
- SoundCard (Windows WASAPI loopback) — BSD-3-Clause: https://github.com/bastibe/SoundCard/blob/master/LICENSE
- NVIDIA CUDA/cuDNN libraries — NVIDIA licenses supplied in their installed wheels; installing these libraries is subject to their terms. https://docs.nvidia.com/deeplearning/cudnn/backend/latest/reference/eula.html

Installed Python distributions include their own license and metadata files. Their transitive dependencies retain those notices. GPU drivers are provided and installed separately by the PC owner.

Audio and transcripts stay on the PC. Environment preparation downloads software and models from PyPI, Hugging Face and official sherpa-onnx GitHub release assets.

YouTube importing bundles the official yt-dlp Windows x64 executable (2026.08.19), verified against the release SHA-256. The combined PyInstaller executable is GPLv3+ and includes third-party code under its respective licenses. Corresponding source and release license notices are available at https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19 and https://github.com/yt-dlp/yt-dlp/tree/2026.08.19. GPLv3 text: https://www.gnu.org/licenses/gpl-3.0.txt. The executable includes yt-dlp-ejs (Unlicense, MIT and ISC components). Its JavaScript solver uses the already bundled Electron Node runtime. No additional global software is installed.

YouTube importing connects to YouTube and its media servers. Downloaded audio and locally generated scripts are stored in the Work library; no recording is uploaded to a transcription service.
