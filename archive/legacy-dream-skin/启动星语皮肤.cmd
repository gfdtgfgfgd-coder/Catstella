@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
node tools/launch.cjs skin
if errorlevel 1 pause
