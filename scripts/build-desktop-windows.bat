@echo off
setlocal
cd /d "%~dp0\.."
python scripts\build_backend.py
if errorlevel 1 exit /b 1
if exist "src-tauri\updater.key" (
    if not defined TAURI_SIGNING_PRIVATE_KEY set /p TAURI_SIGNING_PRIVATE_KEY=<src-tauri\updater.key
)
call npx tauri build
if errorlevel 1 exit /b 1
