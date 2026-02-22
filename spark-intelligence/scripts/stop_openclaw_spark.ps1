# stop_openclaw_spark.ps1 - Stop OpenClaw bridge-layer services safely.
param(
    [switch]$ForceCore
)

$ErrorActionPreference = "SilentlyContinue"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $PSScriptRoot }
if (-not (Test-Path "$RepoRoot\sparkd.py")) { $RepoRoot = (Get-Location).Path }

$pidFile = "$RepoRoot\scripts\.spark_openclaw_pids.json"

Write-Host "=== Spark x OpenClaw - Stopping ===" -ForegroundColor Cyan
if ($ForceCore) {
    Write-Host "Mode: force-core (core stop only when explicitly owned)" -ForegroundColor Yellow
} else {
    Write-Host "Mode: safe (tailer/overlay only; core untouched)" -ForegroundColor DarkGray
}

function Stop-IfRunning {
    param(
        [int]$Pid,
        [string]$Name
    )
    if (-not $Pid) { return }
    $proc = Get-Process -Id $Pid -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue
        Write-Host "  Stopped $Name (PID $Pid)" -ForegroundColor Yellow
    } else {
        Write-Host "  $Name (PID $Pid) already stopped" -ForegroundColor DarkGray
    }
}

if (Test-Path $pidFile) {
    $pids = Get-Content $pidFile -Raw | ConvertFrom-Json

    # Always stop OpenClaw integration tailer.
    Stop-IfRunning -Pid ([int]$pids.tailer) -Name "openclaw_tailer"

    # Core services are only stopped when requested AND owned by this layer.
    if ($ForceCore) {
        if ([bool]$pids.owns_bridge) {
            Stop-IfRunning -Pid ([int]$pids.bridge) -Name "bridge_worker"
        } elseif ($pids.bridge) {
            Write-Host "  bridge_worker PID present but not owned by OpenClaw layer; skipped" -ForegroundColor DarkGray
        }

        if ([bool]$pids.owns_sparkd) {
            Stop-IfRunning -Pid ([int]$pids.sparkd) -Name "sparkd"
        } elseif ($pids.sparkd) {
            Write-Host "  sparkd PID present but not owned by OpenClaw layer; skipped" -ForegroundColor DarkGray
        }
    }

    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "No OpenClaw PID file found. Stopping tailer/overlay by pattern only..." -ForegroundColor Yellow
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "python.exe" -and (
            $_.CommandLine -match "openclaw_tailer\.py" -or
            $_.CommandLine -match "openclaw.*bridge"
        )
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "  Killed integration PID $($_.ProcessId)" -ForegroundColor Yellow
    }
    if ($ForceCore) {
        Write-Host "  ForceCore requested but no ownership metadata available; core services intentionally not pattern-killed." -ForegroundColor DarkGray
    }
}

Write-Host "`n=== Stopped ===" -ForegroundColor Green
