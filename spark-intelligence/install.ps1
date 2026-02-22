param(
  [string]$RepoUrl = "https://github.com/vibeforge1111/vibeship-spark-intelligence.git",
  [string]$TargetDir = (Join-Path (Get-Location) "vibeship-spark-intelligence"),
  [switch]$SkipUp
)

$ErrorActionPreference = "Stop"

$localBootstrap = $null
if ($PSScriptRoot) {
  $candidate = Join-Path $PSScriptRoot "scripts/bootstrap_windows.ps1"
  if (Test-Path $candidate) {
    $localBootstrap = $candidate
  }
}

if ($localBootstrap) {
  & $localBootstrap -RepoUrl $RepoUrl -TargetDir $TargetDir -SkipUp:$SkipUp
  exit $LASTEXITCODE
}

$bootstrapUrl = "https://raw.githubusercontent.com/vibeforge1111/vibeship-spark-intelligence/main/scripts/bootstrap_windows.ps1"
$bootstrapText = Invoke-RestMethod -Uri $bootstrapUrl
$bootstrap = [ScriptBlock]::Create($bootstrapText)
& $bootstrap -RepoUrl $RepoUrl -TargetDir $TargetDir -SkipUp:$SkipUp
