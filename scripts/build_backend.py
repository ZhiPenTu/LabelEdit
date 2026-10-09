"""Shared macOS/Windows backend build with isolated, pinned dependencies."""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import venv

ROOT = Path(__file__).resolve().parents[1]


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--distpath", type=Path, default=ROOT / "resources/generated/plugins/official.labeledit/backend")
    parser.add_argument("--workpath", type=Path, default=ROOT / "build/backend")
    options = parser.parse_args()
    if sys.version_info[:2] != (3, 12):
        raise SystemExit("Backend packaging requires Python 3.12.")
    staging = ROOT / ".venv-packaging"
    staging.mkdir(exist_ok=True)
    # A new environment per build also prevents concurrent builds from sharing
    # mutable packages. It is removed after PyInstaller has copied its resources.
    with TemporaryDirectory(prefix="build-", dir=staging) as directory:
        environment = Path(directory)
        venv.EnvBuilder(with_pip=True, symlinks=False).create(environment)
        python = str(environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python"))
        run(python, "-m", "pip", "install", "--disable-pip-version-check", "--timeout", "30", "--retries", "2", "-r", str(ROOT / "requirements-build.txt"))
        run(python, "-m", "pip", "check")
        run(python, "-m", "backend.ocr_service")
        def package(spec: Path, destination: Path, work: Path) -> None:
            run(python, "-m", "PyInstaller", "--noconfirm", "--distpath", str(destination.resolve()), "--workpath", str(work.resolve()), str(spec.resolve()))
        package(ROOT / "scripts/pyinstaller/label-edit-backend.spec", options.distpath, options.workpath)


if __name__ == "__main__":
    main()
