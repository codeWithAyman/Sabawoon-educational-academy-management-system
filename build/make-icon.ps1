# One-off: generates build/icon.png (256x256) from the existing app logo.
Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\frontend\src\assets\sabawoon-logo.png"
$outPath = Join-Path $PSScriptRoot "icon.png"

$src = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath))
$size = 256

$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$ratio = [Math]::Min($size / $src.Width, $size / $src.Height)
$w = [int]($src.Width * $ratio)
$h = [int]($src.Height * $ratio)
$x = [int](($size - $w) / 2)
$y = [int](($size - $h) / 2)

$g.DrawImage($src, $x, $y, $w, $h)
$g.Dispose()

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$src.Dispose()

Write-Host "Wrote $outPath"
