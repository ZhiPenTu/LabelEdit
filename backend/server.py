"""Loopback-only API for non-destructive PDF label editing."""
from __future__ import annotations

from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from io import BytesIO
import asyncio
import importlib.metadata
import logging
import math
from pathlib import Path
import secrets
import shutil
import tempfile
import threading
import time
from typing import Any, Literal
from urllib.parse import quote, urlparse

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .pdf_service import export_pdf, extract_native_regions, inspect_pdf, render_page
from .ocr_service import engine_status, recognize_image

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_PAGES = 50
MAX_DOCUMENTS = 20
DOCUMENT_TTL_SECONDS = 2 * 60 * 60
from .paths import get_demo_file
DEMO_FILE = get_demo_file()
logger = logging.getLogger(__name__)


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
        self._temporary = tempfile.TemporaryDirectory(prefix="pdf-redit-")
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
            raise HTTPException(413, "PDF 文件不能超过 25 MB。")
        with self.lock:
            if len(self.documents) >= MAX_DOCUMENTS:
                raise HTTPException(429, "已打开的文件过多，请删除不用的文件或重启软件。")
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
                if isinstance(error, (ValueError, HTTPException)):
                    raise
                raise ValueError("无法读取这个 PDF，请检查文件是否损坏。") from error

    def describe(self, document: Document) -> dict[str, Any]:
        return {"id": document.id, "filename": document.filename, **document.info,
                "pages": [{**page, "preview_url": f"/api/documents/{document.id}/pages/{page['index']}/image"}
                          for page in document.info["pages"]]}

    @contextmanager
    def lease(self, identifier: str):
        # IDs are looked up, never resolved as user-controlled filesystem paths.
        with self.lock:
            document = self.documents.get(identifier)
            if document is None:
                raise HTTPException(404, "文件已关闭或已过期，请重新导入。")
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
                raise HTTPException(409, "文件正在处理中，请稍后再关闭。")
            del self.documents[identifier]
            shutil.rmtree(document.path.parent, ignore_errors=True)


store = DocumentStore()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Test clients / embedded servers may start the same app more than once.
    if not store.root.exists():
        store._temporary = tempfile.TemporaryDirectory(prefix="pdf-redit-")
        store.root = Path(store._temporary.name)
        store.documents.clear()
    async def cleanup_loop():
        while True:
            await asyncio.sleep(300)
            await run_in_threadpool(store.cleanup)
    task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        store.documents.clear()
        store._temporary.cleanup()


app = FastAPI(title="PDF 文字编辑器", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"])

class RequestSizeLimitMiddleware:
    """Bound incoming bytes, including chunked requests before multipart parsing."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        limit = MAX_UPLOAD_BYTES + 1024 * 1024 if scope["path"] == "/api/documents" else 2 * 1024 * 1024
        contents = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            contents.extend(message.get("body", b""))
            if len(contents) > limit:
                response = JSONResponse({"error": "请求内容过大。", "detail": "请求内容过大。"}, status_code=413)
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break
        sent = False
        async def limited_receive():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": bytes(contents), "more_body": False}
            return await receive()
        await self.app(scope, limited_receive, send)


app.add_middleware(RequestSizeLimitMiddleware)



from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5188",
        "http://localhost:5188",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "tauri://localhost",
        "https://tauri.localhost",
        "http://tauri.localhost",
    ],
    allow_origin_regex=r"^(https?://(127\.0\.0\.1|localhost|tauri\.localhost)(:\d+)?|tauri://localhost)$",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

@app.middleware("http")
async def local_requests_only(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    origin = request.headers.get("origin")
    if origin:
        trusted = False
        try:
            parsed = urlparse(origin)
            if origin.startswith("tauri://") or origin.startswith("https://tauri.localhost") or origin.startswith("http://tauri.localhost"):
                trusted = True
            elif parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost", "::1", "tauri.localhost"}:
                trusted = True
        except ValueError:
            trusted = False
        if not trusted:
            return JSONResponse({"error": "只允许从本机编辑器访问。", "detail": "只允许从本机编辑器访问。"}, status_code=403)
    client_host = request.client.host if request.client else None
    if client_host and client_host not in {"127.0.0.1", "::1", "localhost", "testclient", "testserver"}:
        return JSONResponse({"error": "服务只允许本机访问。", "detail": "服务只允许本机访问。"}, status_code=403)
    try:
        length = int(request.headers.get("content-length", "0"))
    except ValueError:
        return JSONResponse({"error": "请求长度无效。", "detail": "请求长度无效。"}, status_code=400)
    limit = MAX_UPLOAD_BYTES + 1024 * 1024 if request.url.path == "/api/documents" else 2 * 1024 * 1024
    if length > limit:
        return JSONResponse({"error": "请求内容过大。", "detail": "请求内容过大。"}, status_code=413)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, error: HTTPException):
    return JSONResponse({"error": error.detail, "detail": error.detail}, status_code=error.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    return JSONResponse({"error": "请求参数无效，请检查页码、区域和文字设置。", "detail": "请求参数无效，请检查页码、区域和文字设置。"}, status_code=422)


@app.exception_handler(ValueError)
async def value_error(request: Request, error: ValueError):
    return JSONResponse({"error": str(error), "detail": str(error)}, status_code=400)


@app.exception_handler(Exception)
async def unknown_error(request: Request, error: Exception):
    logger.exception("PDF processing failed")
    return JSONResponse({"error": "文件处理失败，请检查 PDF 后重试。", "detail": "文件处理失败，请检查 PDF 后重试。"}, status_code=500)


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


@app.get("/api/health")
def health():
    tools = {}
    for package in ("rapidocr", "onnxruntime", "pypdfium2", "pypdf", "reportlab", "fastapi"):
        try:
            tools[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            tools[package] = "missing"
    ocr = engine_status()
    return {"ready": ocr["ready"], "tools": tools, "ocr": ocr,
            "demo_available": DEMO_FILE.is_file(), "limits": {"upload_mb": 25, "pages": MAX_PAGES}}


@app.post("/api/documents")
async def upload_document(file: UploadFile = File(...)):
    contents = bytearray()
    try:
        while chunk := await file.read(1024 * 1024):
            contents.extend(chunk)
            if len(contents) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "PDF 文件不能超过 25 MB。")
    finally:
        await file.close()
    return await run_in_threadpool(store.add, bytes(contents), file.filename or "document.pdf")


@app.post("/api/demo")
def load_demo():
    if not DEMO_FILE.is_file():
        raise HTTPException(404, "示例 PDF 不存在，请导入自己的文件。")
    return store.add(DEMO_FILE.read_bytes(), DEMO_FILE.name)


@app.delete("/api/documents/{identifier}", status_code=204)
def close_document(identifier: str):
    store.delete(identifier)
    return Response(status_code=204)


@app.get("/api/documents/{identifier}/pages/{page}/image")
def page_image(identifier: str, page: int):
    with store.lease(identifier) as document:
        _page(document, page)
        return Response(_png(render_page(document.path, page, dpi=450)), media_type="image/png")


@app.post("/api/documents/{identifier}/pages/{page}/recognize")
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
            raise HTTPException(503, str(error)) from error
        result["elapsed_ms"] = round((time.perf_counter() - started) * 1000)
        return result


@app.post("/api/documents/{identifier}/preview")
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
        return Response(_png(image), media_type="image/png")


@app.post("/api/documents/{identifier}/export")
def export(identifier: str, body: ExportBody):
    with store.lease(identifier) as document:
        contents = export_pdf(document.path, body.edits)
        # A real HTTP download also works in browser hosts that cannot download
        # blob: URLs. Publish only a complete export via an atomic replacement.
        with tempfile.NamedTemporaryFile(dir=document.path.parent, delete=False) as output:
            output.write(contents)
            completed = Path(output.name)
        completed.replace(document.path.parent / "export.pdf")
        name = f"{Path(document.filename).stem}-已修改.pdf"
        return Response(contents, media_type="application/pdf",
                        headers={"Content-Disposition": f"attachment; filename=edited.pdf; filename*=UTF-8''{quote(name)}"})


@app.get("/api/documents/{identifier}/download")
def download(identifier: str):
    with store.lease(identifier) as document:
        exported = document.path.parent / "export.pdf"
        if not exported.is_file():
            raise HTTPException(404, "尚未生成 PDF，请先点击导出。")
        name = f"{Path(document.filename).stem}-已修改.pdf"
        return Response(exported.read_bytes(), media_type="application/pdf",
                        headers={"Content-Disposition": f"attachment; filename=edited.pdf; filename*=UTF-8''{quote(name)}"})
