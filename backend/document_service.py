"""Offline PDF/OCR document operations used by the sandboxed RPC worker."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from io import BytesIO
import importlib.metadata
import math
from pathlib import Path
import secrets
import shutil
import tempfile
import threading
import time
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from .pdf_service import export_pdf, extract_native_regions, inspect_pdf, render_page
from .ocr_service import engine_status, recognize_image
from .paths import get_demo_file

@dataclass
class BinaryResult:
    body: bytes
    media_type: str

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_PAGES = 50
MAX_DOCUMENTS = 20
DOCUMENT_TTL_SECONDS = 2 * 60 * 60
DEMO_FILE = get_demo_file()


@dataclass
class Document:
    id: str
    filename: str
    path: Path
    info: dict[str, Any]
    touched: float
    users: int = 0


class DocumentStore:
    def __init__(self) -> None:
        self._temporary = tempfile.TemporaryDirectory(prefix="labeledit-")
        self.root = Path(self._temporary.name)
        self.documents: dict[str, Document] = {}
        self.lock = threading.RLock()

    def cleanup(self) -> None:
        now = time.monotonic()
        with self.lock:
            expired = [key for key, value in self.documents.items()
                       if not value.users and now - value.touched > DOCUMENT_TTL_SECONDS]
            for key in expired:
                shutil.rmtree(self.documents.pop(key).path.parent, ignore_errors=True)

    def add(self, contents: bytes, filename: str) -> dict[str, Any]:
        self.cleanup()
        if not contents or not contents.lstrip()[:1024].startswith(b"%PDF-"):
            raise ValueError("请选择有效的 PDF 文件。")
        if len(contents) > MAX_UPLOAD_BYTES:
            raise ValueError("PDF 文件不能超过 25 MB。")
        with self.lock:
            if len(self.documents) >= MAX_DOCUMENTS:
                raise ValueError("已打开的文件过多，请删除不用的文件或重启软件。")
            identifier = secrets.token_hex(16)
            directory = self.root / identifier
            directory.mkdir(mode=0o700)
            source = directory / "source.pdf"
            source.write_bytes(contents)
            try:
                info = inspect_pdf(source)
                if info["page_count"] > MAX_PAGES:
                    raise ValueError("一次最多打开 50 页 PDF，请先拆分文件。")
                for page in info["pages"]:
                    if any(not math.isfinite(page[key]) or not 0 < page[key] <= 20_000
                           for key in ("width_pt", "height_pt")):
                        raise ValueError("PDF 页面尺寸过大或无效。")
                safe_name = Path(filename.replace("\\", "/")).name[:180] or "document.pdf"
                document = Document(identifier, safe_name, source, info, time.monotonic())
                self.documents[identifier] = document
                return self.describe(document)
            except Exception as error:
                shutil.rmtree(directory, ignore_errors=True)
                if isinstance(error, ValueError):
                    raise
                raise ValueError("无法读取这个 PDF，请检查文件是否损坏。") from error

    def describe(self, document: Document) -> dict[str, Any]:
        return {"id": document.id, "filename": document.filename, **document.info}

    @contextmanager
    def lease(self, identifier: str):
        # IDs are looked up, never resolved as user-controlled filesystem paths.
        with self.lock:
            document = self.documents.get(identifier)
            if document is None:
                raise ValueError("文件已关闭或已过期，请重新导入。")
            document.users += 1
            document.touched = time.monotonic()
        try:
            yield document
        finally:
            with self.lock:
                document.users -= 1
                document.touched = time.monotonic()

    def delete(self, identifier: str) -> None:
        with self.lock:
            document = self.documents.get(identifier)
            if document is None:
                return
            if document.users:
                raise ValueError("文件正在处理中，请稍后再关闭。")
            del self.documents[identifier]
            shutil.rmtree(document.path.parent, ignore_errors=True)


store = DocumentStore()


class RecognizeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: Literal["latin", "chinese"] = "latin"


class ExportBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    edits: list[dict[str, Any]] = Field(default_factory=list, max_length=500)


class PreviewBody(ExportBody):
    page: int = Field(default=0, ge=0, strict=True)


def _png(image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _page(document: Document, page: int) -> dict[str, Any]:
    if not 0 <= page < document.info["page_count"]:
        raise ValueError("页码超出 PDF 的页面范围。")
    return document.info["pages"][page]


def health():
    tools = {}
    for package in ("rapidocr", "onnxruntime", "pypdfium2", "pypdf", "reportlab"):
        try:
            tools[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            tools[package] = "missing"
    ocr = engine_status()
    return {"ready": ocr["ready"], "tools": tools, "ocr": ocr,
            "demo_available": DEMO_FILE.is_file(), "limits": {"upload_mb": 25, "pages": MAX_PAGES}}


def load_demo():
    if not DEMO_FILE.is_file():
        raise ValueError("示例 PDF 不存在，请导入自己的文件。")
    return store.add(DEMO_FILE.read_bytes(), DEMO_FILE.name)


def page_image(identifier: str, page: int):
    with store.lease(identifier) as document:
        _page(document, page)
        return BinaryResult(_png(render_page(document.path, page, dpi=450)), media_type="image/png")


def recognize(identifier: str, page: int, body: RecognizeBody):
    with store.lease(identifier) as document:
        dimensions = _page(document, page)
        started = time.perf_counter()
        native = extract_native_regions(document.path, page)
        if native:
            return {"regions": native, "engine": "PDFium text layer", "elapsed_ms": round((time.perf_counter() - started) * 1000),
                    "warnings": ["使用 PDF 原生文字层；替换字体仍需人工确认。"]}
        image = render_page(document.path, page, dpi=600)
        try:
            result = recognize_image(image, dimensions, page, body.language)
        except RuntimeError as error:
            raise ValueError(str(error)) from error
        result["elapsed_ms"] = round((time.perf_counter() - started) * 1000)
        return result


def preview(identifier: str, body: PreviewBody):
    with store.lease(identifier) as document:
        _page(document, body.page)
        contents = export_pdf(document.path, body.edits)
        # Windows cannot reopen NamedTemporaryFile while its handle is open.
        # Close the write before PDFium reads it, and remove it on every exit.
        with tempfile.TemporaryDirectory(prefix="preview-", dir=document.path.parent) as directory:
            edited = Path(directory) / "edited.pdf"
            edited.write_bytes(contents)
            image = render_page(edited, body.page, dpi=450)
        return BinaryResult(_png(image), media_type="image/png")


def export(identifier: str, body: ExportBody):
    with store.lease(identifier) as document:
        contents = export_pdf(document.path, body.edits)
        return BinaryResult(contents, media_type="application/pdf")
