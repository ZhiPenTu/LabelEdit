"""PDF rendering and non-destructive, print-size-preserving text overlays.

Public rectangles are fractions of the visible, rotated CropBox, measured from
its top-left. PDFium calls are serialized because the library is not thread safe.
An overlay is visual editing, not secure redaction: source content is retained.
"""

from __future__ import annotations

from contextlib import closing
from io import BytesIO
import math
from pathlib import Path
import re
import threading
from typing import Any

from PIL import Image
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from .paths import get_fonts_dir

PDFIUM_LOCK = threading.RLock()
FONT_LOCK = threading.RLock()
FONT_DIR = get_fonts_dir()
FONT_NAMES = {
    ("Arial", False): ("LabelArimo", "Arimo-Regular.ttf"),
    ("Arial", True): ("LabelArimoBold", "Arimo-Bold.ttf"),
    ("Noto Sans SC", False): ("LabelNoto", "NotoSansSC-Regular.ttf"),
    ("Noto Sans SC", True): ("LabelNotoBold", "NotoSansSC-Bold.ttf"),
}


def _reader(path: str | Path) -> PdfReader:
    reader = PdfReader(path, strict=False)
    if reader.is_encrypted:
        raise ValueError("暂不支持加密 PDF，请先解密后再导入。")
    if not len(reader.pages):
        raise ValueError("PDF 没有可编辑的页面。")
    return reader


def _geometry(page: Any) -> dict[str, Any]:
    crop, media = page.cropbox, page.mediabox
    # The PDF specification clips the CropBox to the MediaBox.
    left = max(float(crop.left), float(media.left))
    bottom = max(float(crop.bottom), float(media.bottom))
    right = min(float(crop.right), float(media.right))
    top = min(float(crop.top), float(media.top))
    rotation = int(page.rotation or 0) % 360
    unit = float(page.get("/UserUnit", 1))
    if rotation not in (0, 90, 180, 270):
        raise ValueError("PDF 的页面旋转必须是 90 度的整数倍。")
    if not math.isfinite(unit) or unit <= 0:
        raise ValueError("PDF 页面比例无效。")
    width, height = right - left, top - bottom
    if width <= 0 or height <= 0:
        raise ValueError("PDF 的可见页面尺寸无效。")
    display_width, display_height = (height, width) if rotation in (90, 270) else (width, height)
    return {
        "left": left, "bottom": bottom, "right": right, "top": top,
        "width": display_width, "height": display_height,
        "rotation": rotation, "unit": unit,
    }


def inspect_pdf(path: str | Path) -> dict[str, Any]:
    """Describe visible page dimensions in physical PDF points and millimetres."""
    reader = _reader(path)
    pages = []
    for index, page in enumerate(reader.pages):
        g = _geometry(page)
        width, height = g["width"] * g["unit"], g["height"] * g["unit"]
        pages.append({
            "index": index, "width_pt": width, "height_pt": height,
            "width_mm": round(width * 25.4 / 72, 3),
            "height_mm": round(height * 25.4 / 72, 3),
            "rotation": g["rotation"],
        })
    return {"page_count": len(pages), "pages": pages}


def render_page(path: str | Path, page: int = 0, dpi: int = 450) -> Image.Image:
    """Render a detached RGB image, respecting CropBox and intrinsic rotation."""
    info = inspect_pdf(path)
    if isinstance(page, bool) or not isinstance(page, int) or not 0 <= page < info["page_count"]:
        raise ValueError("页码超出 PDF 的页面范围。")
    if isinstance(dpi, bool) or not isinstance(dpi, (int, float)) or not 36 <= dpi <= 1200:
        raise ValueError("渲染 DPI 必须在 36 到 1200 之间。")
    size = info["pages"][page]
    pixels = size["width_pt"] * size["height_pt"] * (dpi / 72) ** 2
    scale = min(dpi / 72, math.sqrt(32_000_000 / max(pixels, 1)) * dpi / 72)
    # PDFium currently interprets page coordinates without /UserUnit scaling.
    # Apply it to render resolution; the public geometry remains physical points.
    source = _reader(path).pages[page]
    scale *= _geometry(source)["unit"]
    with PDFIUM_LOCK:
        with pdfium.PdfDocument(str(path)) as document:
            with closing(document[page]) as pdf_page:
                bitmap = pdf_page.render(scale=scale, fill_color=(255, 255, 255, 255))
                try:
                    return bitmap.to_pil().convert("RGB").copy()
                finally:
                    bitmap.close()


def _point_to_display(x: float, y: float, g: dict[str, Any]) -> tuple[float, float]:
    """Original PDF coordinate -> top-left display coordinate (unscaled units)."""
    rotation = g["rotation"]
    if rotation == 0:
        return x - g["left"], g["top"] - y
    if rotation == 90:
        return y - g["bottom"], x - g["left"]
    if rotation == 180:
        return g["right"] - x, y - g["bottom"]
    return g["top"] - y, g["right"] - x


def _native_line(chars: list[dict[str, Any]], page: int, g: dict[str, Any], index: int) -> dict[str, Any] | None:
    if not chars:
        return None
    text = "".join(char["text"] for char in chars).strip()
    if not text:
        return None
    points = [_point_to_display(x, y, g) for char in chars
              for x, y in ((char["box"][0], char["box"][1]), (char["box"][2], char["box"][3]),
                           (char["box"][0], char["box"][3]), (char["box"][2], char["box"][1]))]
    left, top = max(0.0, min(p[0] for p in points)), max(0.0, min(p[1] for p in points))
    right, bottom = min(g["width"], max(p[0] for p in points)), min(g["height"], max(p[1] for p in points))
    if right <= left or bottom <= top:
        return None
    return {
        "id": f"native-{page}-{index}", "page": page, "text": text,
        "rect": {"x": left / g["width"], "y": top / g["height"],
                 "width": (right - left) / g["width"], "height": (bottom - top) / g["height"]},
        "confidence": 1.0, "source": "native", "font_family": "Noto Sans SC" if any(ord(c) > 255 for c in text) else "Arial",
        "font_size": round(sum(c["size"] for c in chars) / len(chars) * g["unit"], 2),
        "bold": sum(c["weight"] >= 600 for c in chars) > len(chars) / 2,
        "text_color": "#000000", "background_color": "#ffffff", "fit": True,
    }


def extract_native_regions(path: str | Path, page: int = 0) -> list[dict[str, Any]]:
    """Return positioned text lines when the original PDF has a real text layer."""
    reader = _reader(path)
    if isinstance(page, bool) or not isinstance(page, int) or not 0 <= page < len(reader.pages):
        raise ValueError("页码超出 PDF 的页面范围。")
    g = _geometry(reader.pages[page])
    result: list[dict[str, Any]] = []
    with PDFIUM_LOCK:
        with pdfium.PdfDocument(str(path)) as document:
            with closing(document[page]) as pdf_page:
                with closing(pdf_page.get_textpage()) as text_page:
                    if text_page.count_chars() > 100_000:
                        raise ValueError("单页文字过多，无法安全读取。")
                    line: list[dict[str, Any]] = []
                    for char_index in range(text_page.count_chars()):
                        text = text_page.get_text_range(char_index, 1)
                        if text in ("\r", "\n"):
                            region = _native_line(line, page, g, len(result))
                            if region:
                                result.append(region)
                            line = []
                            continue
                        box = text_page.get_charbox(char_index)
                        size = pdfium_raw.FPDFText_GetFontSize(text_page, char_index)
                        weight = pdfium_raw.FPDFText_GetFontWeight(text_page, char_index)
                        line.append({"text": text, "box": box, "size": size or 12, "weight": weight})
                    region = _native_line(line, page, g, len(result))
                    if region:
                        result.append(region)
    return result


def _number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label}必须是有限数字。")
    return float(value)


def _validate_edit(edit: Any, page_count: int) -> dict[str, Any]:
    if not isinstance(edit, dict):
        raise ValueError("文字修改的格式无效。")
    page = edit.get("page", 0)
    if isinstance(page, bool) or not isinstance(page, int) or not 0 <= page < page_count:
        raise ValueError("修改的页码超出 PDF 的页面范围。")
    raw_rect = edit.get("rect")
    if not isinstance(raw_rect, dict):
        raise ValueError("文字修改缺少区域坐标。")
    rect = {key: _number(raw_rect.get(key), "区域坐标") for key in ("x", "y", "width", "height")}
    if rect["x"] < 0 or rect["y"] < 0 or rect["width"] <= 0 or rect["height"] <= 0 or rect["x"] + rect["width"] > 1.000001 or rect["y"] + rect["height"] > 1.000001:
        raise ValueError("文字区域必须完整位于页面内，且宽高大于零。")
    text = edit.get("text", "")
    if not isinstance(text, str) or len(text) > 10_000 or any(ord(c) < 32 and c not in "\n\r\t" for c in text):
        raise ValueError("修改文字格式无效，或超过 10000 个字符。")
    family = edit.get("font_family", "Noto Sans SC")
    if family not in ("Arial", "Noto Sans SC"):
        raise ValueError("请选择软件提供的 Arial 或 Noto Sans SC 字体。")
    size = _number(edit.get("font_size", 12), "字号")
    if not 0.5 <= size <= 300:
        raise ValueError("字号必须在 0.5 到 300 pt 之间。")
    result = {"page": page, "rect": rect, "text": text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", "    "), "font_family": family, "font_size": size}
    for flag, default in (("bold", False), ("fit", True)):
        result[flag] = edit.get(flag, default)
        if not isinstance(result[flag], bool):
            raise ValueError("加粗和自动适应选项必须是布尔值。")
    for key, default in (("text_color", "#000000"), ("background_color", "#ffffff")):
        value = edit.get(key, default)
        if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("颜色必须是 #RRGGBB 格式。")
        result[key] = value
    return result


def _font_for(edit: dict[str, Any]) -> str:
    family, bold = edit["font_family"], edit["bold"]
    with FONT_LOCK:
        for font_name, filename in FONT_NAMES.values():
            if font_name not in pdfmetrics.getRegisteredFontNames():
                font_path = FONT_DIR / filename
                if not font_path.is_file():
                    raise ValueError("嵌入字体文件缺失，请重新安装软件。")
                pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
        font_name = FONT_NAMES[(family, bold)][0]
        text = edit["text"]
        face = pdfmetrics.getFont(font_name).face
        if any(ord(c) not in face.charToGlyph for c in text if c not in "\n"):
            font_name = FONT_NAMES[("Noto Sans SC", bold)][0]
            face = pdfmetrics.getFont(font_name).face
        if any(ord(c) not in face.charToGlyph for c in text if c not in "\n"):
            raise ValueError("所选字体不包含部分文字（例如表情符号），请更换文字。")
        return font_name


def _wrap(text: str, font_name: str, size: float, width: float) -> list[str]:
    lines = []
    for paragraph in text.split("\n"):
        line = ""
        tokens = re.findall(r"[\u2e80-\u9fff\uf900-\ufaff]|[^\s\u2e80-\u9fff\uf900-\ufaff]+|[^\S\n]+", paragraph)
        for token in tokens:
            if pdfmetrics.stringWidth(line + token, font_name, size) <= width + 1e-7:
                line += token
                continue
            if line:
                lines.append(line.rstrip())
                line = ""
                token = token.lstrip()
            for char in token:
                if line and pdfmetrics.stringWidth(line + char, font_name, size) > width + 1e-7:
                    lines.append(line)
                    line = ""
                line += char
        lines.append(line.rstrip())
    return lines


def _layout(text: str, font_name: str, size: float, width: float, height: float, fit: bool) -> tuple[float, list[str], float, float, float]:
    def calculate(candidate: float) -> tuple[bool, list[str], float, float]:
        lines = _wrap(text, font_name, candidate, width)
        ascent, descent = pdfmetrics.getAscentDescent(font_name, candidate)
        leading = max(candidate * 1.16, ascent - descent)
        total = ascent - descent + (len(lines) - 1) * leading
        valid = total <= height + 1e-6 and all(pdfmetrics.stringWidth(line, font_name, candidate) <= width + 1e-6 for line in lines)
        return valid, lines, ascent, leading, total

    valid, lines, ascent, leading, total = calculate(size)
    if valid:
        return size, lines, ascent, leading, total
    if not fit:
        raise ValueError("文字超出选定区域，请扩大区域、缩小字号或开启自动适应。")
    low, high = 0.5, size
    if not calculate(low)[0]:
        raise ValueError("文字区域太小，自动适应后仍放不下文字，请扩大区域或减少文字。")
    for _ in range(22):
        candidate = (low + high) / 2
        if calculate(candidate)[0]:
            low = candidate
        else:
            high = candidate
    _, lines, ascent, leading, total = calculate(low)
    return low, lines, ascent, leading, total


def _display_to_original(g: dict[str, Any]) -> Transformation:
    rotations = {
        0: (1, 0, 0, 1, g["left"], g["bottom"]),
        90: (0, 1, -1, 0, g["right"], g["bottom"]),
        180: (-1, 0, 0, -1, g["right"], g["top"]),
        270: (0, -1, 1, 0, g["left"], g["top"]),
    }
    return Transformation(rotations[g["rotation"]])


def export_pdf(path: str | Path, edits: list[dict[str, Any]]) -> bytes:
    """Keep original pages/resources and merge only edited areas as vector text.

    The PDF's original document metadata, page boxes and intrinsic rotations are
    copied. No edits returns the original byte sequence exactly.
    """
    if not isinstance(edits, list) or len(edits) > 500:
        raise ValueError("一次最多导出 500 个文字修改。")
    source_path = Path(path)
    reader = _reader(source_path)
    validated = [_validate_edit(edit, len(reader.pages)) for edit in edits]
    if not validated:
        return source_path.read_bytes()
    writer = PdfWriter(clone_from=reader)
    by_page: dict[int, list[dict[str, Any]]] = {}
    for edit in validated:
        by_page.setdefault(edit["page"], []).append(edit)
    for page_index, page_edits in by_page.items():
        page = writer.pages[page_index]
        g = _geometry(page)
        buffer = BytesIO()
        overlay = canvas.Canvas(buffer, pagesize=(g["width"], g["height"]), pageCompression=1)
        for edit in page_edits:
            rect = edit["rect"]
            x, top = rect["x"] * g["width"], rect["y"] * g["height"]
            width, height = rect["width"] * g["width"], rect["height"] * g["height"]
            bottom = g["height"] - top - height
            # Text sizes are physical points. Account for the source UserUnit.
            font = _font_for(edit)
            size, lines, ascent, leading, total = _layout(edit["text"], font, edit["font_size"] / g["unit"], width, height, edit["fit"])
            v_offset = max(0.0, (height - total) / 2) if lines else 0.0
            overlay.saveState()
            overlay.setFillColor(edit["background_color"])
            overlay.rect(x, bottom, width, height, stroke=0, fill=1)
            clipping = overlay.beginPath()
            clipping.rect(x, bottom, width, height)
            overlay.clipPath(clipping, stroke=0, fill=0)
            overlay.setFillColor(edit["text_color"])
            overlay.setFont(font, size)
            baseline = g["height"] - top - ascent - v_offset
            for index, line in enumerate(lines):
                overlay.drawString(x, baseline - index * leading, line)
            overlay.restoreState()
        overlay.showPage()
        overlay.save()
        overlay_page = PdfReader(BytesIO(buffer.getvalue())).pages[0]
        page.merge_transformed_page(overlay_page, _display_to_original(g), over=True, expand=False)
    result = BytesIO()
    writer.write(result)
    return result.getvalue()
