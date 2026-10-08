#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -x .venv/bin/python ]]; then
  task_python="${PDF_REDIT_PYTHON:-}"
  if [[ -z "$task_python" ]] && command -v python3.12 >/dev/null 2>&1; then
    task_python="$(command -v python3.12)"
  fi
  bundled_python="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
  if [[ -z "$task_python" && -x "$bundled_python" ]]; then
    task_python="$bundled_python"
  fi
  if [[ -z "$task_python" ]] && command -v uv >/dev/null 2>&1; then
    export UV_PYTHON_INSTALL_DIR="$PWD/.python-runtime"
    export UV_CACHE_DIR="$PWD/.uv-cache"
    uv python install 3.12
    task_python="$(uv python find 3.12)"
  fi
  if [[ -z "$task_python" ]]; then
    echo "需要 Python 3.12。请安装 Python 3.12，或设置 PDF_REDIT_PYTHON=/path/to/python3.12。" >&2
    exit 1
  fi
  "$task_python" -c 'import sys; assert sys.version_info[:2] == (3, 12), "请使用 Python 3.12"'
  "$task_python" -m venv --copies .venv
fi

.venv/bin/python -c 'import sys; assert sys.version_info[:2] == (3, 12), ".venv 必须使用 Python 3.12，请重建虚拟环境"'
.venv/bin/python -m pip install --no-cache-dir -r requirements-dev.txt
.venv/bin/python -m backend.ocr_service
.venv/bin/python -m pip check
echo "后端依赖和 OCR 模型已就绪。后续识别在本机离线运行。"
