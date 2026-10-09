"""Shared macOS/Windows backend build with isolated, pinned dependencies."""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys
import shutil
from tempfile import TemporaryDirectory
import venv

ROOT = Path(__file__).resolve().parents[1]


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def materialize_internal_links(destination: Path) -> None:
    """Normalize trusted PyInstaller output to the plugin ZIP's no-link format."""
    root = destination.resolve(strict=True)
    for file in root.rglob("*"):
        if not file.is_symlink():
            continue
        target = file.resolve(strict=True)
        if not target.is_relative_to(root) or not target.is_file():
            raise RuntimeError(f"Unsupported link in backend artifact: {file}")
        file.unlink()
        shutil.copy2(target, file)


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
        materialize_internal_links(options.distpath)


if __name__ == "__main__":
    main()
