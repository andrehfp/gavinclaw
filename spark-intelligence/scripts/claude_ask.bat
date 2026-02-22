@echo off
REM Wrapper for Claude CLI that provides a proper console context
claude -p --output-format text %*
