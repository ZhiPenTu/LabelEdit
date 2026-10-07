#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 1. 准备 Python 虚拟环境与 PyInstaller ==="
if [[ ! -x .venv/bin/python ]]; then
  bash scripts/setup-backend.sh
fi
.venv/bin/pip install -q pyinstaller

echo "=== 2. 检查并确保 OCR 离线模型文件就绪 ==="
.venv/bin/python -m backend.ocr_service

echo "=== 3. 运行 PyInstaller 打包独立后端 ==="
mkdir -p src-tauri/resources
rm -rf build/ dist-backend/ src-tauri/resources/backend
.venv/bin/pyinstaller --noconfirm --distpath src-tauri/resources/backend scripts/pyinstaller/label-edit-backend.spec

echo "=== 后端打包完成：产物位于 src-tauri/resources/backend ==="
