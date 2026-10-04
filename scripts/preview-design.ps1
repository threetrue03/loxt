$ErrorActionPreference = 'Stop'
$previewWorkspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $previewWorkspace
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Design preview build failed.' }
$previewNode = (Get-Command node.exe).Source
$previewLogs = Join-Path $previewWorkspace 'test-results'
New-Item -ItemType Directory -Path $previewLogs -Force | Out-Null
Start-Process -FilePath $previewNode -ArgumentList @('scripts/preview-design.mjs') -WorkingDirectory $previewWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewLogs 'design-preview.log') -RedirectStandardError (Join-Path $previewLogs 'design-preview-error.log')
