"""API integration: real sample OCR -> vector replacement -> original-size PDF."""
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from backend.ocr_service import engine_status
from backend.server import app, store

SOURCE = Path(__file__).resolve().parents[1] / "文具新大 70X40.pdf"
client = TestClient(app)


def test_rejects_invalid_pdf_untrusted_origin_and_unknown_document():
    assert client.post("/api/documents", files={"file": ("bad.pdf", b"bad", "application/pdf")}).status_code == 400
    assert client.post("/api/demo", headers={"Origin": "https://outside.example"}).status_code == 403
    assert client.get("/api/documents/unknown/pages/0/image").status_code == 404


@pytest.mark.skipif(not SOURCE.exists() or not engine_status()["ready"], reason="Sample PDF and installed local OCR models required")
def test_real_ocr_edit_preview_export_preserve_size_and_source():
    original = SOURCE.read_bytes()
    response = client.post("/api/documents", files={"file": (SOURCE.name, original, "application/pdf")},
                           headers={"Origin": "http://127.0.0.1:5188"})
    assert response.status_code == 200, response.text
    document = response.json()
    identifier = document["id"]
    try:
        assert document["page_count"] == 1
        dimensions = document["pages"][0]
        assert dimensions["width_mm"] == pytest.approx(70, abs=0.01)
        assert dimensions["height_mm"] == pytest.approx(40, abs=0.01)
        base = f"/api/documents/{identifier}"
        assert client.get(f"{base}/download").status_code == 404
        assert client.get(f"{base}/pages/1/image").status_code == 400
        unchanged = client.post(f"{base}/export", json={"edits": []})
        assert unchanged.content == original
        recognition = client.post(f"{base}/pages/0/recognize", json={"language": "latin"})
        assert recognition.status_code == 200, recognition.text
        regions = recognition.json()["regions"]
        batch = next(region for region in regions if "SG250128" in region["text"])
        assert "RapidOCR" in recognition.json()["engine"]
        edit = {"id": batch["id"], "page": 0, "rect": batch["rect"],
                "text": batch["text"].replace("SG250128", "SG261007"),
                "font_family": "Arial", "font_size": batch["font_size"],
                "bold": True, "text_color": "#000000", "background_color": "#ffffff", "fit": True}
        preview = client.post(f"{base}/preview", json={"page": 0, "edits": [edit]})
        assert preview.status_code == 200, preview.text[:200]
        assert preview.content.startswith(b"\x89PNG\r\n\x1a\n")
        exported = client.post(f"{base}/export", json={"edits": [edit]})
        assert exported.status_code == 200, exported.text[:200]
        downloaded = client.get(f"{base}/download")
        assert downloaded.status_code == 200
        assert downloaded.content == exported.content
        assert "attachment;" in downloaded.headers["Content-Disposition"]
        reader = PdfReader(BytesIO(exported.content))
        assert "SG261007" in reader.pages[0].extract_text()
        assert float(reader.pages[0].mediabox.width) == pytest.approx(dimensions["width_pt"])
        assert float(reader.pages[0].mediabox.height) == pytest.approx(dimensions["height_pt"])
        assert SOURCE.read_bytes() == original
        assert store.documents[identifier].path.read_bytes() == original
    finally:
        assert client.delete(f"/api/documents/{identifier}").status_code == 204
