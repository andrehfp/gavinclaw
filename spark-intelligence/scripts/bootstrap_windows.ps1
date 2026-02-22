param(
  [string]$RepoUrl = "https://github.com/vibeforge1111/vibeship-spark-intelligence.git",
  [string]$TargetDir = (Join-Path (Get-Location) "vibeship-spark-intelligence"),
  [switch]$SkipUp
)

$ErrorActionPreference = "Stop"

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter()][string[]]$Arguments = @()
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    $joined = ($Arguments -join " ")
    throw ("Command failed ({0}): {1} {2}" -f $LASTEXITCODE, $FilePath, $joined)
  }
}

function Resolve-BasePython {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    return "py"
  }
  if (Get-Command python -ErrorAction SilentlyContinue) {
    return "python"
  }
  throw "Python 3.10+ is required but was not found in PATH."
}

function Invoke-BasePython {
  param([string[]]$Arguments)
  if ($script:BasePython -eq "py") {
    Invoke-External -FilePath "py" -Arguments (@("-3") + $Arguments)
    return
  }
  Invoke-External -FilePath "python" -Arguments $Arguments
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is required but was not found in PATH."
}

$script:BasePython = Resolve-BasePython

Write-Host "============================================="
Write-Host "  SPARK - Windows bootstrap"
Write-Host "============================================="
Write-Host ""

if (-not (Test-Path $TargetDir)) {
  Write-Host ("Cloning repo into: {0}" -f $TargetDir)
  Invoke-External -FilePath "git" -Arguments @("clone", $RepoUrl, $TargetDir)
} elseif (-not (Test-Path (Join-Path $TargetDir "pyproject.toml"))) {
  throw ("TargetDir exists but does not look like this repo: {0}" -f $TargetDir)
} else {
  Write-Host ("Using existing repo: {0}" -f $TargetDir)
}

Set-Location $TargetDir

Write-Host "Checking Python version..."
Invoke-BasePython -Arguments @("-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)")

$venvPython = Join-Path $TargetDir ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  Write-Host "Creating virtual environment..."
  Invoke-BasePython -Arguments @("-m", "venv", ".venv")
}

Write-Host "Installing Spark (services extras)..."
Invoke-External -FilePath $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "pip")
Invoke-External -FilePath $venvPython -Arguments @("-m", "pip", "install", "-e", ".[services]")

if ($SkipUp) {
  Write-Host ""
  Write-Host "Install complete."
  Write-Host ("Start later with: {0} -m spark.cli up" -f $venvPython)
  exit 0
}

Write-Host ""
Write-Host "Starting Spark services..."
Invoke-External -FilePath $venvPython -Arguments @("-m", "spark.cli", "up")
