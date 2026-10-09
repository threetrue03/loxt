param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'ko' } | Select-Object -First 1
    $language = 'en'
    $text = 'This sample measures local speech recognition processing time. We are reviewing our meeting notes and preparing the next steps. Please keep the original recording and organize the transcript in the library.'
    if ($voice) {
        $synth.SelectVoice($voice.VoiceInfo.Name)
        $language = 'ko'
        $text = '이 음성은 로컬 음성 인식 처리 시간을 확인하는 예시입니다. 오늘 회의 내용을 정리하고 다음 작업을 준비합니다. 녹음 원본은 보관하고 변환한 스크립트와 메모를 함께 관리하세요.'
    }
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $synth.SetOutputToWaveFile($Output, $format)
    $synth.Speak($text)
    $synth.SetOutputToNull()
    Write-Output ('{"language":"' + $language + '"}')
} finally { $synth.Dispose() }
