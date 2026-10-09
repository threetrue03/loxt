$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../build'))
$publicRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public'))
[xml]$logo = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../design/loxt-white/LOXT-symbol-white.svg'))
$namespaces = [Xml.XmlNamespaceManager]::new($logo.NameTable)
$namespaces.AddNamespace('svg', 'http://www.w3.org/2000/svg')
$paths = $logo.SelectNodes('//svg:path', $namespaces)
[IO.Directory]::CreateDirectory($assetRoot) | Out-Null
[IO.Directory]::CreateDirectory($publicRoot) | Out-Null
$images = @()
foreach ($size in @(16,24,32,48,64,128,180,192,256,512)) {
  $bitmap = [Drawing.Bitmap]::new($size,$size)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#232323'))
  $scale = $size * 0.88 / 100
  $graphics.TranslateTransform($size * 0.06, $size * 0.06)
  $graphics.ScaleTransform($scale,$scale)
  foreach ($shape in $paths) {
    if ($shape.stroke -ne '#FFFFFF' -or $shape.d -notmatch '^M([0-9.]+) ([0-9.]+)L([0-9.]+) ([0-9.]+)$') { throw 'Unexpected original logo geometry' }
    $coords = @($Matches[1],$Matches[2],$Matches[3],$Matches[4]) | ForEach-Object { [single]::Parse($_,[Globalization.CultureInfo]::InvariantCulture) }
    $pen = [Drawing.Pen]::new([Drawing.Color]::White,[single]$shape.'stroke-width')
    $pen.StartCap = [Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($pen,$coords[0],$coords[1],$coords[2],$coords[3]); $pen.Dispose()
  }
  $memory = [IO.MemoryStream]::new()
  $bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png)
  $png = $memory.ToArray(); $images += ,@($size,$png)
  if ($size -eq 256) { [IO.File]::WriteAllBytes((Join-Path $publicRoot 'icon.png'),$png) }
  if ($size -in @(180,192,512)) { [IO.File]::WriteAllBytes((Join-Path $publicRoot ('loxt-' + $size + '.png')),$png) }
  $memory.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$images = @($images | Where-Object { $_[0] -le 256 -and $_[0] -notin @(180,192) })
$writer = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $assetRoot 'icon.ico')))
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]$images.Count)
$offset = 6 + 16 * $images.Count
foreach ($entry in $images) {
  $sizeByte = if ($entry[0] -eq 256) { 0 } else { $entry[0] }
  $writer.Write([byte]$sizeByte); $writer.Write([byte]$sizeByte); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$entry[1].Length); $writer.Write([UInt32]$offset)
  $offset += $entry[1].Length
}
foreach ($entry in $images) { $writer.Write([byte[]]$entry[1]) }
$writer.Dispose()
Write-Output 'Original LOXT symbol exported in seven Windows icon sizes.'
