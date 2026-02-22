param(
    [string]$TaskName = "Spark Up"
)

schtasks /Delete /TN "$TaskName" /F | Out-Null
Write-Host "Removed scheduled task: $TaskName"
