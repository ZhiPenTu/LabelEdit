"""Unified resource path resolution for development and bundled desktop environments."""
from __future__ import annotations

import os
from pathlib import Path
import sys


def get_base_dir() -> Path:
    """Return base directory for project/bundled resources."""
    if "PDF_REDIT_RESOURCE_DIR" in os.environ:
        return Path(os.environ["PDF_REDIT_RESOURCE_DIR"]).resolve()

    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            return Path(sys._MEIPASS).resolve()
        exe_dir = Path(sys.executable).parent.resolve()
        macos_resources = exe_dir.parent / "Resources"
        if macos_resources.exists() and (macos_resources / ".models").exists():
            return macos_resources
        return exe_dir

    return Path(__file__).resolve().parents[1]


def get_models_dir() -> Path:
    """Locate the PP-OCR model directory."""
    if "PDF_REDIT_MODELS_DIR" in os.environ:
        return Path(os.environ["PDF_REDIT_MODELS_DIR"]).resolve()
    base = get_base_dir()
    for candidate in [
        base / ".models",
        base / "models",
        base / "resources" / ".models",
        base / "resources" / "models",
        Path(__file__).resolve().parents[1] / ".models",
    ]:
        if candidate.is_dir():
            return candidate
    return base / ".models"


def get_fonts_dir() -> Path:
    """Locate bundled TrueType fonts."""
    base = get_base_dir()
    for candidate in [
        base / "backend" / "fonts",
        base / "fonts",
        base / "resources" / "backend" / "fonts",
        base / "resources" / "fonts",
        Path(__file__).resolve().parent / "fonts",
    ]:
        if candidate.is_dir():
            return candidate
    return Path(__file__).resolve().parent / "fonts"


def get_demo_file() -> Path:
    """Locate the sample PDF label."""
    base = get_base_dir()
    for candidate in [
        base / "文具新大 70X40.pdf",
        base / "resources" / "文具新大 70X40.pdf",
        Path(__file__).resolve().parents[1] / "文具新大 70X40.pdf",
    ]:
        if candidate.is_file():
            return candidate
    return base / "文具新大 70X40.pdf"
