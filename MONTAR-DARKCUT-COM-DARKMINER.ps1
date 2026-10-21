# DARKCUT Studio 0.3.0 + DarkMiner 3.6.2 — compilacao local Windows.
# Baixe a branch de integracao. Requer Node.js, Bun, Python 3.12 e Rust instalados.
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$ProgressPreference = "SilentlyContinue"
function Step([string]$name) { Write-Host ("`n=== "+$name+" ===") -ForegroundColor Cyan }
function Run([string]$exe,[string[]]$args) {
  & $exe @args
  if ($LASTEXITCODE -ne 0) { throw "Falhou: $exe (codigo $LASTEXITCODE)." }
}
function GetTool([string]$cmd,[string]$site) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Instale $cmd em $site, reinicie o terminal e tente novamente."
  }
}
function Download([string]$url,[string]$to) {
  if ((Test-Path $to) -and (Get-Item $to).Length -gt 1000000) { return }
  Invoke-WebRequest -Uri $url -OutFile $to -UseBasicParsing
  if ((Get-Item $to).Length -lt 1000000) { throw "Download incompleto: $url" }
}
if ($env:OS -ne "Windows_NT") { throw "Este compilador so funciona no Windows." }
$root = (Resolve-Path $PSScriptRoot).Path
$desktop = Join-Path $root "apps/darkcut-desktop"
if (!(Test-Path (Join-Path $desktop "darkminer/darkminer-source.tar.xz"))) {
  throw "Projeto errado. Baixe a branch feat/darkminer-bundled-intelligence-20261019."
}
Step "1/8 - Verificar ferramentas"
GetTool "node" "https://nodejs.org"
GetTool "bun" "https://bun.sh"
GetTool "py" "https://python.org"
GetTool "rustc" "https://rustup.rs"
GetTool "rustup" "https://rustup.rs"
Run "py" @("-3.12","--version")
$venv = Join-Path $root ".darkcut-python-build-env"
$python = Join-Path $venv "Scripts/python.exe"
if (!(Test-Path $python)) { Run "py" @("-3.12","-m","venv",$venv) }
Run "rustup" @("target","add","wasm32-unknown-unknown")
Push-Location $root
try {
  Step "2/8 - Bibliotecas"
  Run "bun" @("install")
  Step "3/8 - Audio e efeitos"
  Run "node" @("rust/darkcut-audio/build.mjs")
  Run "node" @("rust/darkcut-fx/build.mjs")
  Step "4/8 - DarkMiner sem segunda janela"
  & (Join-Path $desktop "scripts/build-darkminer-service.ps1") -Python $python
  if (!(Test-Path (Join-Path $desktop "darkminer-bin/DarkMiner-Service.exe"))) {
    throw "Nao foi possivel gerar DarkMiner-Service.exe."
  }
  Step "5/8 - Interface e runtime DARKCUT"
  Run "bun" @("run","build:web")
  Push-Location $desktop
  try { Run "bun" @("run","stage") } finally { Pop-Location }
  Step "6/8 - Ferramentas de video"
  $toolsDir = Join-Path $desktop "tools"
  $cache = Join-Path $env:TEMP "darkcut-video-build"
  New-Item -ItemType Directory -Force -Path @($toolsDir,$cache) | Out-Null
  Download "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" (Join-Path $toolsDir "yt-dlp.exe")
  $deno = Join-Path $toolsDir "deno.exe"
  if (!(Test-Path $deno)) {
    $denoZip = Join-Path $cache "deno.zip"
    Download "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip" $denoZip
    Expand-Archive -Path $denoZip -DestinationPath $toolsDir -Force
  }
  $ffmpeg = Join-Path $toolsDir "ffmpeg.exe"
  $ffprobe = Join-Path $toolsDir "ffprobe.exe"
  if (!(Test-Path $ffmpeg) -or !(Test-Path $ffprobe)) {
    $zip = Join-Path $cache "ffmpeg-essentials.zip"
    $unzipped = Join-Path $cache "ffmpeg-extracted"
    Download "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" $zip
    if (Test-Path $unzipped) { Remove-Item $unzipped -Force -Recurse }
    Expand-Archive -Path $zip -DestinationPath $unzipped
    $f = Get-ChildItem $unzipped -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    $p = Get-ChildItem $unzipped -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
    if (!$f -or !$p) { throw "FFmpeg/FFprobe ausente no download." }
    Copy-Item $f.FullName $ffmpeg -Force
    Copy-Item $p.FullName $ffprobe -Force
  }
  $encoders = (& $ffmpeg -hide_banner -encoders) -join "\n"
  if (-not $encoders.Contains("libx264")) { throw "FFmpeg nao oferece H.264 libx264." }
  if (-not $encoders.Contains("h264_qsv")) { Write-Warning "Sem Quick Sync; usando fallback H.264." }
  Step "7/8 - Testar exportacao e montar instalador"
  $oldPath = $env:PATH
  $env:PATH = "$toolsDir;$env:PATH"
  $env:DARKCUT_VIDEO_TOOLS = $toolsDir
  $env:DARKCUT_FFMPEG_EXPORT = "1"
  try {
    Run "bun" @("test","apps/web/src/export/ffmpeg/__tests__/ffmpeg-export.test.ts")
    Push-Location $desktop
    try { Run "bun" @("run","dist:win") } finally { Pop-Location }
  } finally {
    $env:PATH = $oldPath
    Remove-Item Env:DARKCUT_VIDEO_TOOLS,Env:DARKCUT_FFMPEG_EXPORT -ErrorAction SilentlyContinue
  }
  $dist = Join-Path $desktop "dist"
  $setup = Join-Path $dist "DarkCut-Studio-Setup-0.3.0-x64.exe"
  $portable = Join-Path $dist "DarkCut-Studio-Portable-0.3.0-x64.exe"
  $bundled = Join-Path $dist "win-unpacked/resources/darkminer/DarkMiner-Service.exe"
  foreach ($f in @($setup,$portable,$bundled)) {
    if (!(Test-Path $f)) { throw "Arquivo obrigatorio faltando: $f" }
  }
  Step "8/8 - Abrir e testar app empacotado"
  $smokeExe = Join-Path $dist "win-unpacked/DarkCut Studio.exe"
  $env:DARKCUT_SMOKE_PROFILE = Join-Path $env:TEMP ("darkcut-smoke-" + [guid]::NewGuid().ToString("N"))
  $env:DARKCUT_SMOKE_REPORT = Join-Path $env:TEMP "darkcut-integration-smoke.json"
  if (Test-Path $env:DARKCUT_SMOKE_REPORT) { Remove-Item $env:DARKCUT_SMOKE_REPORT -Force }
  try {
    $p = Start-Process -FilePath $smokeExe -ArgumentList "--smoke-test" -PassThru
    if (!$p.WaitForExit(180000)) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      throw "O teste do app excedeu tres minutos."
    }
    if (!(Test-Path $env:DARKCUT_SMOKE_REPORT)) { throw "O aplicativo nao gerou relatorio de teste." }
    $report = Get-Content $env:DARKCUT_SMOKE_REPORT -Raw | ConvertFrom-Json
    if ($report.ok -ne $true) { throw "Falha no teste: $($report.error)" }
  } finally {
    Remove-Item Env:DARKCUT_SMOKE_PROFILE,Env:DARKCUT_SMOKE_REPORT -ErrorAction SilentlyContinue
  }
  Write-Host "OK - Instalador: $setup" -ForegroundColor Green
  Write-Host "OK - Portatil: $portable" -ForegroundColor Green
  Start-Process explorer.exe -ArgumentList ('"' + $dist + '"')
} finally { Pop-Location }
