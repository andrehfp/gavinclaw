# Claude Bridge - reads prompt from input file, writes response to output file
# Usage: claude_bridge.ps1 -InputFile prompt.txt -OutputFile response.txt
param(
    [string]$InputFile,
    [string]$OutputFile
)

$prompt = Get-Content $InputFile -Raw -Encoding UTF8
$response = echo $prompt | claude -p --output-format text 2>$null
Set-Content $OutputFile -Value $response -Encoding UTF8
