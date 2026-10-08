"""Verify resources from the final macOS app or a silently installed Windows NSIS bundle."""
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
BUNDLES = ROOT / "src-tauri/target/release/bundle"


def verify(backend: Path) -> None:
    subprocess.run([sys.executable, str(ROOT / "scripts/smoke_backend.py"), "--backend", str(backend),
                    "--offline", "--report", str(ROOT / "output/installed-offline-smoke.json")], check=True)


if __name__ == "__main__":
    if sys.platform == "darwin":
        verify(BUNDLES / "macos/LabelEdit.app/Contents/Resources/resources/backend/label-edit-backend/label-edit-backend")
    elif sys.platform == "win32":
        installers = list((BUNDLES / "nsis").glob("*-setup.exe"))
        if len(installers) != 1:
            raise RuntimeError(f"Expected one NSIS installer, found {installers}")
        # NSIS /D must be the final argument. The CI checkout path has no spaces.
        output = ROOT / "output"
        output.mkdir(exist_ok=True)
        with TemporaryDirectory(prefix="installed-", dir=output) as directory:
            subprocess.run([str(installers[0]), "/S", f"/D={directory}"], check=True)
            backends = list(Path(directory).rglob("label-edit-backend.exe"))
            if len(backends) != 1:
                raise RuntimeError(f"Expected one installed backend, found {backends}")
            verify(backends[0])
    else:
        raise RuntimeError("Desktop smoke supports macOS and Windows")
