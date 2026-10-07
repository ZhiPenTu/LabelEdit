@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo   LabelEdit Windows 桌面端一键打包脚本
echo ==========================================

cd /d "%~dp0\.."

echo -> 1. 检查 Python 环境与依赖...
if not exist ".venv\Scripts\python.exe" (
    echo 创建 Python 虚拟环境...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
    python -m backend.ocr_service
) else (
    call .venv\Scripts\activate.bat
)

echo -> 2. 打包 Windows 后端...
if not exist "src-tauri\resources" mkdir "src-tauri\resources"
if exist "src-tauri\resources\backend" rmdir /s /q "src-tauri\resources\backend"
pyinstaller --noconfirm --distpath src-tauri\resources\backend scripts\pyinstaller\label-edit-backend.spec

echo -> 3. 构建前端资源与 Tauri 安装包...
call npm run build
if exist "src-tauri\updater.key" (
    set /p TAURI_SIGNING_PRIVATE_KEY=<src-tauri\updater.key
)
call npx tauri build

echo ==========================================
echo 打包成功！产物位于:
echo   src-tauri\target\release\bundle\nsis\
echo ==========================================
