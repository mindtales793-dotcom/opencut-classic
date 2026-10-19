# DARKCUT Studio / DarkMiner: manual build of the bundled Python service.
# This is not connected to GitHub Actions. Only run it on a trusted Windows machine.
# It prepares darkminer-bin/ so the existing Electron extraResources can include it.
[CmdletBinding()]
param([string]$Python = "py")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$desktop = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$archive = Join-Path $desktop "darkminer/darkminer-source.tar.xz"
$target = Join-Path $desktop "darkminer-bin"
$expected = "a6ede40f75313e05698583cc32d4289d457949427e36bc4f6cc09f197791c9d5"
if (!(Test-Path $archive)) { throw "DarkMiner source archive missing." }
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
  throw "Source archive integrity check failed."
}
$work = Join-Path ([IO.Path]::GetTempPath()) ("darkcut-miner-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $work | Out-Null
$oldLocal = $env:LOCALAPPDATA
$oldEmbedded = $env:DARKMINER_EMBEDDED
$process = $null
try {
  & tar -xf $archive -C $work
  if ($LASTEXITCODE -ne 0) { throw "Cannot unpack source." }
  $src = Join-Path $work "DarkMiner-Integrado-DarkCut"
  foreach ($f in @("desktop_launcher.py", "static/index.html", "requirements.txt", "extension/manifest.json")) {
    if (!(Test-Path (Join-Path $src $f))) { throw "Missing source: $f" }
  }
  $private = Get-ChildItem $src -Recurse -Force -File | Where-Object {
    $_.Name -in @(".env","dark_miner.sqlite3","dark_miner.sqlite3-wal","dark_miner.sqlite3-shm") -or
    $_.Extension -in @(".db",".sqlite",".sqlite3",".pem",".key",".exe")
  }
  if ($private) { throw "Personal secrets, databases or EXEs found in source. Aborting." }
  & $Python -m pip install --disable-pip-version-check -r (Join-Path $src "requirements.txt") "pyinstaller==6.16.0"
  if ($LASTEXITCODE -ne 0) { throw "Missing Python dependencies." }
  $env:DATABASE_PATH = Join-Path $work "test.sqlite3"
  $env:DARK_MINER_ENV_PATH = Join-Path $work "empty.env"
  Push-Location $src
  try {
    & $Python -c "import main; from fastapi.testclient import TestClient; c=TestClient(main.app); r=c.get('/api/status'); assert r.status_code==200 and r.json().get('version')=='3.6.2'; assert c.get('/').status_code==200; assert c.get('/api/v3/channels').status_code==200; print('DarkMiner API smoke OK')"
    if ($LASTEXITCODE -ne 0) { throw "API smoke test failed." }
  } finally { Pop-Location }
  Remove-Item Env:DATABASE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:DARK_MINER_ENV_PATH -ErrorAction SilentlyContinue
  Push-Location $src
  try {
    & $Python -m PyInstaller --noconfirm --clean --onefile --windowed --name "DarkMiner-Service" --add-data "$src/static;static" --collect-submodules uvicorn --hidden-import "anyio._backends._asyncio" --distpath (Join-Path $work "dist") --workpath (Join-Path $work "pyi") --specpath (Join-Path $work "spec") desktop_launcher.py
    if ($LASTEXITCODE -ne 0) { throw "Bundled service compilation failed." }
  } finally { Pop-Location }
  $exe = Join-Path $work "dist/DarkMiner-Service.exe"
  if (!(Test-Path $exe)) { throw "Bundled service binary missing." }
  $env:LOCALAPPDATA = Join-Path $work "isolated-user"
  $env:DARKMINER_EMBEDDED = "1"
  New-Item -ItemType Directory -Force $env:LOCALAPPDATA | Out-Null
  $process = Start-Process -FilePath $exe -PassThru -WorkingDirectory (Split-Path $exe)
  $ready = $false
  for ($attempt=0; $attempt -lt 90; $attempt++) {
    if ($process.HasExited) { throw "DarkMiner closed during smoke test." }
    foreach ($port in 8000..8010) {
      try {
        $r = Invoke-RestMethod "http://127.0.0.1:$port/api/status" -TimeoutSec 1
        if ($r.ok -eq $true -and $r.version -eq "3.6.2") { $ready=$true; break }
      } catch {}
    }
    if ($ready) { break }
    Start-Sleep -Milliseconds 400
  }
  if (!$ready) { throw "DarkMiner backend did not respond." }
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  $process = $null
  New-Item -ItemType Directory -Force $target | Out-Null
  Copy-Item $exe (Join-Path $target "DarkMiner-Service.exe") -Force
  # Legacy extension is NOT installed automatically: use the separate modern Chrome extension.
  Copy-Item (Join-Path $src "extension") (Join-Path $target "extension-legacy") -Recurse -Force
  Write-Host "Verified bundled service prepared at $target"
} finally {
  if ($process -and !$process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  $env:LOCALAPPDATA = $oldLocal
  if ($null -eq $oldEmbedded) { Remove-Item Env:DARKMINER_EMBEDDED -ErrorAction SilentlyContinue } else { $env:DARKMINER_EMBEDDED = $oldEmbedded }
  Remove-Item Env:DATABASE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:DARK_MINER_ENV_PATH -ErrorAction SilentlyContinue
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
