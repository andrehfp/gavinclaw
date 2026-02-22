param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Args)

python "$PSScriptRoot\set_obsidian_watchtower.py" @Args
