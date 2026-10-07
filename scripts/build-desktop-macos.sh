#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=========================================="
echo "  LabelEdit macOS 桌面端一键打包脚本"
echo "=========================================="

echo "-> 1. 构建独立 Python 后端..."
bash scripts/build-backend.sh

echo "-> 2. 构建前端静态资源..."
npm run build

echo "-> 3. 构建 Tauri macOS 应用与安装包..."
if [[ -f src-tauri/updater.key && -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat src-tauri/updater.key)"
fi

npx tauri build

echo "=========================================="
echo "打包成功！产物目录位于："
echo "  src-tauri/target/release/bundle/dmg/"
echo "  src-tauri/target/release/bundle/macos/"
echo "=========================================="
