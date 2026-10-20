param([Parameter(Mandatory=$true)][string]$InstallDir)
$ErrorActionPreference = 'Stop'
$appName = 'Sabawoon Educational Academy'
$dataRoot = Join-Path $env:ProgramData $appName
$userRoot = Join-Path $env:APPDATA $appName
$logDir = Join-Path $dataRoot 'Logs'
$backupDir = Join-Path $dataRoot 'Backups'
$pgData = Join-Path $dataRoot 'PostgreSQL\data'
$pgPort = 55432
$pgService = 'SabawoonPostgreSQL'
$credentialDir = Join-Path $dataRoot 'Credentials'
$superPasswordFile = Join-Path $credentialDir 'postgres-superuser.txt'
New-Item -ItemType Directory -Force -Path $dataRoot,$logDir,$backupDir,$userRoot,$credentialDir | Out-Null
$log = Join-Path $logDir 'install.log'
Start-Transcript -Path $log -Append | Out-Null
try {
  Write-Output "[stage] Checking Windows compatibility and persistent PostgreSQL state."
  if (-not [Environment]::Is64BitOperatingSystem) { throw '64-bit Windows is required.' }
  if (Test-Path -LiteralPath $superPasswordFile) {
    $superPassword = (Get-Content -LiteralPath $superPasswordFile -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($superPassword)) { throw 'Stored PostgreSQL credential is empty.' }
  } else {
    $superPassword = [Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Maximum 256 }))
    Set-Content -LiteralPath $superPasswordFile -Value $superPassword -NoNewline -Encoding ascii
  }
  $pgBin = 'C:\Program Files\PostgreSQL\17\bin'
  $psql = Join-Path $pgBin 'psql.exe'
  Write-Output "[stage] Locating PostgreSQL tools at $pgBin."
  if (-not (Test-Path $psql)) {
    $tmp = Join-Path $env:TEMP 'sabawoon-postgresql-17.7-1-windows-x64.exe'
    $url = 'https://get.enterprisedb.com/postgresql/postgresql-17.7-1-windows-x64.exe'
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    $sig = Get-AuthenticodeSignature $tmp
    if ($sig.Status -ne 'Valid') { throw "PostgreSQL installer signature validation failed: $($sig.Status)" }
    Write-Output '[stage] Downloaded and validated PostgreSQL installer; starting unattended installation.'
    $pgInstall = Start-Process -FilePath $tmp -ArgumentList "--mode unattended --unattendedmodeui none --superpassword $superPassword --serverport 5432" -Wait -PassThru -NoNewWindow
    if ($pgInstall.ExitCode -ne 0) { throw "PostgreSQL installer failed with exit code $($pgInstall.ExitCode)." }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path $psql)) { throw 'PostgreSQL 17 installation did not provide psql.exe.' }
  $initdb = Join-Path $pgBin 'initdb.exe'
  $pgCtl = Join-Path $pgBin 'pg_ctl.exe'
  if (-not (Test-Path $initdb) -or -not (Test-Path $pgCtl)) { throw 'PostgreSQL server tools were not found.' }
  if (-not (Test-Path (Join-Path $pgData 'PG_VERSION'))) {
    New-Item -ItemType Directory -Force -Path $pgData | Out-Null
    $pwFile = Join-Path $env:TEMP "sabawoon-pg-$([guid]::NewGuid()).pwd"
    Set-Content -LiteralPath $pwFile -Value $superPassword -NoNewline -Encoding ascii
    Write-Output "[stage] Initializing dedicated PostgreSQL cluster at $pgData."
    & $initdb -D $pgData -U postgres -A scram-sha-256 --pwfile=$pwFile --encoding=UTF8 --locale=C | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Dedicated PostgreSQL cluster initialization failed.' }
    Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
    & $pgCtl register -N $pgService -D $pgData -S auto -o "-p $pgPort -h 127.0.0.1"
    if ($LASTEXITCODE -ne 0) { throw 'Dedicated PostgreSQL Windows service registration failed.' }
  }
  $service = Get-Service -Name $pgService -ErrorAction SilentlyContinue
  if (-not $service) { throw 'Dedicated Sabawoon PostgreSQL service was not found.' }
  if ($service.Status -ne 'Running') { Write-Output '[stage] Starting dedicated PostgreSQL service.'; Start-Service $service.Name }
  $pgIsReady = Join-Path $pgBin 'pg_isready.exe'
  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    & $pgIsReady -h 127.0.0.1 -p $pgPort -U postgres -d postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { throw "Dedicated PostgreSQL service did not become ready on port $pgPort." }
  Write-Output "[stage] PostgreSQL is ready on 127.0.0.1:$pgPort."
  $dbUser = 'sabawoon_app'
  $dbName = 'sabawoon_academy'
  $dbPassword = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
  $env:PGPASSWORD = $superPassword
  Write-Output '[stage] Creating or updating the dedicated application role.'
  & $psql -h 127.0.0.1 -p $pgPort -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$dbUser') THEN CREATE ROLE $dbUser LOGIN PASSWORD '$dbPassword'; ELSE ALTER ROLE $dbUser WITH LOGIN PASSWORD '$dbPassword'; END IF; END `$`$;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Sabawoon database role creation failed.' }
  $exists = & $psql -h 127.0.0.1 -p $pgPort -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'"
  $existsText = (($exists -join "") | ForEach-Object { $_.Trim() })
  if ($existsText -ne '1') { Write-Output '[stage] Creating the fresh Sabawoon database.'; & $psql -h 127.0.0.1 -p $pgPort -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbName OWNER $dbUser" | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Sabawoon database creation failed.' } }
  $env:PGPASSWORD = $dbPassword
  $config = @"
PORT=5478
NODE_ENV=production
DATABASE_URL=postgresql://${dbUser}:${dbPassword}@127.0.0.1:${pgPort}/$dbName
JWT_SECRET=$(([BitConverter]::ToString([byte[]](1..48 | ForEach-Object { Get-Random -Maximum 256 }))).Replace('-', ''))
JWT_EXPIRES_IN=7d
APP_VERSION=1.1.1
BACKUP_DIR=$backupDir
PG_BIN_DIR=$pgBin
BACKUP_DAILY_AT=04:00
BACKUP_AUTOMATIC=1
"@
Set-Content -LiteralPath (Join-Path $userRoot 'config.env') -Value $config -Encoding utf8
 Write-Output '[stage] Applying database migrations.'
 $env:ELECTRON_RUN_AS_NODE = '1'
 $env:DATABASE_URL = "postgresql://${dbUser}:${dbPassword}@127.0.0.1:${pgPort}/$dbName"
 $electron = Join-Path $InstallDir 'Sabawoon Educational Academy.exe'
 & $electron (Join-Path $InstallDir 'resources\backend\src\db\migrate.js')
 if ($LASTEXITCODE -ne 0) { throw 'Database migrations failed.' }
 Write-Output '[stage] Registering the local daily backup task.'
 $action = New-ScheduledTaskAction -Execute $electron -Argument '--run-daily-backup'
 $trigger = New-ScheduledTaskTrigger -Daily -At 04:00
 $settings = New-ScheduledTaskSettingsSet -MultipleInstances Ignore -StartWhenAvailable
 Register-ScheduledTask -TaskName 'Sabawoon Academy Daily Backup' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Output '[stage] Verifying application database connectivity.'
& $psql -h 127.0.0.1 -p $pgPort -U $dbUser -d $dbName -v ON_ERROR_STOP=1 -c 'SELECT 1' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Final application database connectivity check failed.' }
Write-Output 'Sabawoon database provisioning completed.'
} catch {
  Write-Output "[failure] $($_.Exception.Message)"
  throw
} finally { Stop-Transcript | Out-Null }
