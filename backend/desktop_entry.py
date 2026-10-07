"""Desktop entrypoint for running the LabelEdit backend with CLI arguments."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

# Ensure UTF-8 output on Windows consoles
for _stream in (sys.stdout, sys.stderr):
    if _stream and hasattr(_stream, 'reconfigure'):
        try:
            _stream.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

# Ensure repository root is on sys.path
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import uvicorn
from backend.server import app


def main() -> None:
    parser = argparse.ArgumentParser(description="LabelEdit Desktop Backend Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--log-level", default="info", help="Logging level")
    args = parser.parse_args()

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        access_log=False,
    )


if __name__ == "__main__":
    main()
