@echo off
set "CMD=%SPARK_CODEX_CMD%"
if "%CMD%"=="" set "CMD=%CODEX_CMD%"
if "%CMD%"=="" set "CMD=codex"
if "%SPARK_SYNC_TARGETS%"=="" set "SPARK_SYNC_TARGETS=codex"
python -m spark.cli sync-context
%CMD% %*
