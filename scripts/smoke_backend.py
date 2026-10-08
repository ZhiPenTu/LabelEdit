"""Exercise the packaged backend outside the checkout, with outbound networking blocked."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, urlopen
import uuid

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def offline_command(executable: Path, offline: bool):
    if not offline:
        yield [str(executable)]
    elif sys.platform == "darwin":
        sandbox = shutil.which("sandbox-exec")
        if not sandbox:
            raise RuntimeError("sandbox-exec is required to verify offline macOS operation")
        yield [sandbox, "-p", '(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:*"))', str(executable)]
    elif sys.platform == "win32":
        name = "LabelEdit offline smoke " + uuid.uuid4().hex
        quoted_path = str(executable).replace("'", "''")
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
            f"$ErrorActionPreference='Stop'; New-NetFirewallRule -DisplayName '{name}' -Direction Outbound -Action Block -Program '{quoted_path}' | Out-Null"], check=True)
        try:
            yield [str(executable)]
        finally:
            subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", f"Remove-NetFirewallRule -DisplayName '{name}'"], check=True)
    else:
        raise RuntimeError("Offline desktop smoke tests support macOS and Windows")


def sample() -> bytes:
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(70 * 72 / 25.4, 40 * 72 / 25.4))
    for text, font_name in [("BATCH AB12345", "Arimo-Regular.ttf"), ("日期 2026-10-08", "NotoSansSC-Regular.ttf")]:
        image = Image.new("RGB", (1400, 800), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(str(ROOT / "backend/fonts" / font_name), 90)
        draw.text((110, 240), text, font=font, fill="black")
        pdf.drawImage(ImageReader(image), 0, 0, width=70 * 72 / 25.4, height=40 * 72 / 25.4)
        pdf.showPage()
    pdf.save()
    return output.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--report", type=Path)
    options = parser.parse_args()
    executable = options.backend.resolve()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    environment = {k: v for k, v in os.environ.items() if not k.startswith(("PDF_REDIT_", "PYTHONPATH", "PYTHONHOME"))}
    environment.update({"HTTP_PROXY": "http://127.0.0.1:9", "HTTPS_PROXY": "http://127.0.0.1:9", "NO_PROXY": "127.0.0.1,localhost", "PYTHONUTF8": "1"})

    def request(path: str, payload=None, raw=None, content_type="application/json"):
        body = json.dumps(payload).encode() if payload is not None else raw
        with urlopen(Request(base + path, data=body, headers={"Content-Type": content_type}), timeout=60) as response:
            return response.read()

    with tempfile.TemporaryDirectory(prefix="labeledit-offline-") as directory, offline_command(executable, options.offline) as command:
        log_path = Path(directory) / "backend.log"
        with log_path.open("w+b") as log:
            process = subprocess.Popen(command + ["--host", "127.0.0.1", "--port", str(port)], cwd=directory, env=environment, stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 45
                while True:
                    try:
                        health = json.loads(request("/api/health"))
                        assert health["ready"], health
                        break
                    except Exception:
                        if process.poll() is not None or time.monotonic() >= deadline:
                            log.seek(0)
                            raise RuntimeError(log.read().decode(errors="replace"))
                        time.sleep(0.2)
                original = sample()
                boundary = "LabelEditSmoke" + uuid.uuid4().hex
                raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="smoke.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode()
                       + original + f'\r\n--{boundary}--\r\n'.encode())
                document = json.loads(request("/api/documents", raw=raw, content_type=f"multipart/form-data; boundary={boundary}"))
                assert document["page_count"] == 2
                path = "/api/documents/" + document["id"]
                recognized = {}
                for page, language in [(0, "latin"), (1, "chinese")]:
                    result = json.loads(request(f"{path}/pages/{page}/recognize", {"language": language}))
                    text = " ".join(item["text"] for item in result["regions"])
                    assert result["regions"], result
                    assert ("AB12345" in text if language == "latin" else "2026" in text and "日期" in text), text
                    recognized[language] = text
                edits = []
                for index, (font, bold, text) in enumerate([("Arial", False, "TEST AB123"), ("Arial", True, "BOLD AB123"), ("Noto Sans SC", False, "测试标签"), ("Noto Sans SC", True, "中文粗体")]):
                    edits.append({"id": str(index), "page": index // 2, "rect": {"x": 0.05, "y": 0.1 + index % 2 * 0.35, "width": 0.9, "height": 0.25}, "text": text,
                        "font_family": font, "font_size": 9, "bold": bold, "text_color": "#000000", "background_color": "#ffffff", "fit": True})
                assert request(path + "/preview", {"page": 0, "edits": edits}).startswith(b"\x89PNG")
                exported = request(path + "/export", {"edits": edits})
                reader = PdfReader(BytesIO(exported))
                assert len(reader.pages) == 2
                for page in reader.pages:
                    assert abs(float(page.mediabox.width) * 25.4 / 72 - 70) < 0.01
                    assert abs(float(page.mediabox.height) * 25.4 / 72 - 40) < 0.01
                assert "TEST AB123" in reader.pages[0].extract_text()
                assert "中文粗体" in reader.pages[1].extract_text()
                assert request(path + "/download") == exported
                assert sample() != b"" and original.startswith(b"%PDF")
                result = {"platform": sys.platform, "offline": options.offline, "recognition": recognized, "pages": 2, "size_mm": [70, 40], "fonts": "latin/chinese regular/bold", "preview_export_download": "passed"}
                print(json.dumps(result, ensure_ascii=False, indent=2))
                if options.report:
                    options.report.parent.mkdir(parents=True, exist_ok=True)
                    options.report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read().decode(errors="replace"), file=sys.stderr)
                raise
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    main()
