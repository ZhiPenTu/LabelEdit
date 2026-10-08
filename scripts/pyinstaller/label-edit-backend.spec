# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

project_root = Path.cwd().resolve()

datas = [
    (str(project_root / ".models"), ".models"),
    (str(project_root / "backend" / "fonts"), "backend/fonts"),
    (str(project_root / "文具新大 70X40.pdf"), "."),
]

binaries = []

for pkg in ["pypdfium2", "pypdfium2_raw", "onnxruntime", "cv2", "rapidocr", "reportlab"]:
    try:
        # Explicit PP-OCRv5 models are bundled above. RapidOCR's defaults are
        # different models and are never used by our configured engines.
        excluded = ["models/**"] if pkg == "rapidocr" else ["datasets/**"] if pkg == "onnxruntime" else []
        datas.extend(collect_data_files(pkg, excludes=excluded + ["**/tests/**", "**/test/**", "**/__pycache__/**"]))
    except Exception:
        pass
    try:
        binaries.extend(collect_dynamic_libs(pkg))
    except Exception:
        pass

hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.off",
    "uvicorn.lifespan.on",
    "fastapi",
    "starlette",
    "pypdf",
    "pypdfium2",
    "pypdfium2_raw",
    "reportlab",
    "reportlab.pdfgen.canvas",
    "reportlab.pdfbase.ttfonts",
    "rapidocr",
    "shapely",
    "pyclipper",
    "onnxruntime",
    "cv2",
    "PIL",
]

for pkg in ["uvicorn", "fastapi", "starlette", "rapidocr", "reportlab"]:
    try:
        hiddenimports.extend(collect_submodules(pkg))
    except Exception:
        pass

a = Analysis(
    [str(project_root / "backend" / "desktop_entry.py")],
    pathex=[str(project_root)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "scipy", "pytest", "_pytest"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="label-edit-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="label-edit-backend",
)
