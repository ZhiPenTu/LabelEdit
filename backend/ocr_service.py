"""Verified local PP-OCRv5 models; network is only used by explicit setup."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.metadata
import json
from pathlib import Path
import threading
import time
from typing import Any, Literal

import numpy as np
from PIL import Image
import requests
from .paths import get_fonts_dir, get_models_dir

MODEL_DIR = get_models_dir()
MODEL_BASE = "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/"
MODELS = {
    "det": ("PP-OCRv5/det/ch_PP-OCRv5_det_mobile.onnx", "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae"),
    "cls": ("PP-OCRv4/cls/ch_ppocr_mobile_v2.0_cls_mobile.onnx", "e47acedf663230f8863ff1ab0e64dd2d82b838fceb5957146dab185a89d6215c"),
    "latin": ("PP-OCRv5/rec/latin_PP-OCRv5_rec_mobile.onnx", "b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a"),
    "chinese": ("PP-OCRv5/rec/ch_PP-OCRv5_rec_mobile.onnx", "5825fc7ebf84ae7a412be049820b4d86d77620f204a041697b0494669b1742c5"),
}
OCR_LOCK = threading.RLock()
_ENGINES: dict[str, Any] = {}
_VERIFIED: dict[str, tuple[int, int]] = {}


def _model_path(key: str) -> Path:
    return MODEL_DIR / Path(MODELS[key][0]).name


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify(key: str) -> None:
    path = _model_path(key)
    try:
        stat = path.stat()
    except OSError as error:
        raise RuntimeError("OCR 模型尚未安装，请运行 bash scripts/setup-backend.sh。") from error
    identity = (stat.st_size, stat.st_mtime_ns)
    if _VERIFIED.get(key) == identity:
        return
    if _hash(path) != MODELS[key][1]:
        raise RuntimeError("OCR 模型校验失败，请重新运行 bash scripts/setup-backend.sh。")
    _VERIFIED[key] = identity


def engine_status() -> dict[str, Any]:
    installed = {}
    with OCR_LOCK:
        for key in MODELS:
            try:
                _verify(key)
                installed[key] = True
            except RuntimeError:
                installed[key] = False
    return {"ready": all(installed.values()), "name": "RapidOCR + ONNX Runtime CPU / PP-OCRv5 mobile",
            "languages": ["latin", "chinese"], "models": installed,
            "model_directory": ".models", "local_only": True}


def _download_model(key: str) -> None:
    relative, digest = MODELS[key]
    target = _model_path(key)
    if target.is_file() and _hash(target) == digest:
        return
    temporary = target.with_suffix(".download")
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with requests.get(MODEL_BASE + relative, stream=True, timeout=(20, 120)) as response:
                response.raise_for_status()
                downloaded = 0
                with temporary.open("wb") as output:
                    for chunk in response.iter_content(1024 * 1024):
                        output.write(chunk)
                        downloaded += len(chunk)
                        if downloaded > 120 * 1024 * 1024:
                            raise RuntimeError("下载模型超出大小上限。")
            if _hash(temporary) != digest:
                raise RuntimeError("下载模型的 SHA-256 不匹配。")
            temporary.replace(target)
            print(f"模型已安装: {target.name}", flush=True)
            return
        except Exception as error:
            last_error = error
            temporary.unlink(missing_ok=True)
            if attempt < 2:
                time.sleep(attempt + 1)
    raise RuntimeError(f"模型下载失败: {key}。请检查网络后重新运行安装脚本。") from last_error


def prepare_models() -> None:
    """Explicit setup downloads fixed upstream artifacts and verifies SHA-256."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(_download_model, MODELS))
    manifest = {"rapidocr": importlib.metadata.version("rapidocr"), "ocr_version": "PP-OCRv5",
                "files": [{"role": key, "file": _model_path(key).name,
                           "url": MODEL_BASE + value[0], "sha256": value[1],
                           "size": _model_path(key).stat().st_size} for key, value in MODELS.items()]}
    (MODEL_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    # Local model paths and embedded dictionaries keep runtime offline.
    for language in ("latin", "chinese"):
        _engine(language)
    print("两种语言 OCR 引擎本地加载验证通过。", flush=True)


def _engine(language: Literal["latin", "chinese"]):
    if language not in ("latin", "chinese"):
        raise ValueError("请选择拉丁语种或中文 OCR。")
    with OCR_LOCK:
        if language in _ENGINES:
            return _ENGINES[language]
        for key in ("det", "cls", language):
            _verify(key)
        import onnxruntime
        onnxruntime.disable_telemetry_events()
        from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion, RapidOCR
        parameters = {
            "Global.log_level": "warning", "Global.text_score": 0.40,
            "Global.max_side_len": 3000,
            "Global.font_path": str(get_fonts_dir() / "NotoSansSC-Regular.ttf"),
            "Global.model_root_dir": str(get_models_dir()),
            "EngineConfig.onnxruntime.intra_op_num_threads": 4,
            "EngineConfig.onnxruntime.inter_op_num_threads": 1,
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.lang_type": LangDet.CH, "Det.model_type": ModelType.MOBILE,
            "Det.ocr_version": OCRVersion.PPOCRV5, "Det.model_path": str(_model_path("det")),
            "Det.limit_side_len": 1600, "Det.limit_type": "max",
            "Cls.engine_type": EngineType.ONNXRUNTIME, "Cls.model_path": str(_model_path("cls")),
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.lang_type": LangRec.LATIN if language == "latin" else LangRec.CH,
            "Rec.model_type": ModelType.MOBILE, "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_path": str(_model_path(language)),
        }
        try:
            engine = RapidOCR(params=parameters)
            # PP-OCRv5 ONNX models contain the dictionary. Prevent a silent future
            # fallback to a dictionary download if the upstream package changes.
            if not engine.text_rec.session.have_key():
                raise RuntimeError("识别模型缺少内置字典。")
        except Exception as error:
            raise RuntimeError("OCR 模型加载失败，请重新运行安装脚本或检查 Python 环境。") from error
        _ENGINES[language] = engine
        return engine


def _background(image: Image.Image, left: int, top: int, right: int, bottom: int) -> str:
    crop = np.asarray(image.crop((left, top, right, bottom)).convert("RGB"))
    if crop.size == 0:
        return "#ffffff"
    # Sample the outer border, which is usually label paper around the glyphs.
    samples = np.concatenate((crop[0], crop[-1], crop[:, 0], crop[:, -1]))
    median = np.median(samples, axis=0).astype(int)
    return "#" + "".join(f"{value:02x}" for value in median)


def recognize_image(image: Image.Image, dimensions: dict[str, Any], page: int,
                    language: Literal["latin", "chinese"] = "latin") -> dict[str, Any]:
    if image.width * image.height > 32_000_000:
        raise ValueError("页面像素过多，无法识别。")
    image = image.convert("RGB")
    started = time.perf_counter()
    with OCR_LOCK:
        engine = _engine(language)
        try:
            # RapidOCR's numpy loader expects OpenCV BGR channel order.
            output = engine(np.asarray(image)[:, :, ::-1].copy())
        except Exception as error:
            raise RuntimeError("本地 OCR 识别失败，请降低文件复杂度后重试。") from error
    regions: list[dict[str, Any]] = []
    angled = False
    if output.boxes is not None and output.txts is not None and output.scores is not None:
        for index, (box, text, confidence) in enumerate(zip(output.boxes, output.txts, output.scores)):
            coordinates = np.asarray(box, dtype=float)
            if coordinates.shape != (4, 2) or not np.isfinite(coordinates).all() or not text.strip():
                continue
            left = max(0, math_floor(coordinates[:, 0].min()) - 2)
            top = max(0, math_floor(coordinates[:, 1].min()) - 2)
            right = min(image.width, math_ceil(coordinates[:, 0].max()) + 2)
            bottom = min(image.height, math_ceil(coordinates[:, 1].max()) + 2)
            if right <= left or bottom <= top:
                continue
            angled |= abs(coordinates[0, 1] - coordinates[1, 1]) > 0.1 * (bottom - top)
            rect = {"x": left / image.width, "y": top / image.height,
                    "width": (right - left) / image.width, "height": (bottom - top) / image.height}
            has_cjk = any("\u2e80" <= character <= "\u9fff" for character in text)
            regions.append({"id": f"ocr-{page}-{index}", "page": page, "text": str(text).strip(),
                            "rect": rect, "confidence": round(float(confidence), 4), "source": "ocr",
                            "font_family": "Noto Sans SC" if has_cjk else "Arial",
                            "font_size": round(max(0.5, min(300, rect["height"] * dimensions["height_pt"] * 0.85)), 2),
                            "_aspect": image.height / image.width,
                            "bold": False, "text_color": "#000000",
                            "background_color": _background(image, left, top, right, bottom), "fit": True})
    regions = _merge_neighbors(regions)
    warnings = ["OCR 字词、字号和字体均需人工确认；置信度不是准确率。"]
    if any(region["confidence"] < 0.8 for region in regions):
        warnings.append("部分文字置信度较低，请对照原图校正。")
    if angled:
        warnings.append("检测到倾斜文字，目前替换文字使用水平排版，请手动确认区域。")
    if not regions:
        warnings.append("未识别到文字，可切换识别语言或手动框选区域。")
    return {"regions": regions, "engine": f"RapidOCR / ONNX Runtime CPU / PP-OCRv5 {language} mobile",
            "elapsed_ms": round((time.perf_counter() - started) * 1000), "warnings": warnings}


def _merge_neighbors(regions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Join touching words on one baseline, preserving separate columns/fields.

    Pixel coordinates are not needed: ratios are corrected for the actual page
    aspect ratio by callers' detected physical font height. Rect heights use page
    fractions; compare horizontal gaps using each region's aspect scale below.
    """
    pending = sorted(regions, key=lambda item: (item["rect"]["x"], item["rect"]["y"]))
    merged: list[dict[str, Any]] = []
    # Coordinates are fractions of different page axes. Store the ratio in each
    # region transiently, rather than infer it from text length.
    for item in pending:
        r = item["rect"]
        match = None
        for existing in reversed(merged):
            e = existing["rect"]
            h = min(e["height"], r["height"])
            centers = abs((e["y"] + e["height"] / 2) - (r["y"] + r["height"] / 2))
            gap = r["x"] - (e["x"] + e["width"])
            # No backward/reordered joins, no combining low-confidence single
            # glyphs from pictograms, and no fields separated by wide whitespace.
            if (r["x"] > e["x"] and centers <= h * 0.25 and
                -e["width"] * 0.15 <= gap <= h * item.get("_aspect", 1) * 0.6 and
                len(item["text"]) > 1 and len(existing["text"]) > 1):
                match = existing
                break
        if match is None:
            merged.append(item.copy())
            continue
        e = match["rect"]
        right = max(e["x"] + e["width"], r["x"] + r["width"])
        bottom = max(e["y"] + e["height"], r["y"] + r["height"])
        top = min(e["y"], r["y"])
        match["rect"] = {"x": e["x"], "y": top, "width": right - e["x"], "height": bottom - top}
        match["text"] += " " + item["text"]
        match["confidence"] = min(match["confidence"], item["confidence"])
        match["font_size"] = max(match["font_size"], item["font_size"])
    for item in merged:
        item.pop("_aspect", None)
    return sorted(merged, key=lambda item: (round(item["rect"]["y"], 2), item["rect"]["x"]))


def math_floor(value: float) -> int:
    return int(np.floor(value))


def math_ceil(value: float) -> int:
    return int(np.ceil(value))


if __name__ == "__main__":
    prepare_models()
