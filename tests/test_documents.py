"""Offline document integration after retiring the loopback HTTP server."""
from io import BytesIO
from pathlib import Path

import pytest
from pypdf import PdfReader
from pydantic import ValidationError
from backend import document_service as documents
from backend.ocr_service import engine_status

SOURCE = Path(__file__).resolve().parents[1] / "文具新大 70X40.pdf"

def test_rejects_invalid_pdf_unknown_document_and_invalid_options():
    with pytest.raises(ValueError, match="有效的 PDF"):
        documents.store.add(b"bad", "bad.pdf")
    with pytest.raises(ValueError, match="已关闭或已过期"):
        documents.page_image("unknown", 0)
    with pytest.raises(ValidationError):
        documents.PreviewBody.model_validate({"page": -1})
    with pytest.raises(ValidationError):
        documents.RecognizeBody.model_validate({"language": "unknown"})

@pytest.mark.skipif(not SOURCE.exists() or not engine_status()["ready"], reason="Sample PDF and installed local OCR models required")
def test_real_ocr_edit_preview_export_preserve_size_and_source():
    original = SOURCE.read_bytes()
    document = documents.store.add(original, SOURCE.name)
    identifier = document["id"]
    try:
        dimensions = document["pages"][0]
        assert document["page_count"] == 1
        assert dimensions["width_mm"] == pytest.approx(70, abs=0.01)
        assert dimensions["height_mm"] == pytest.approx(40, abs=0.01)
        with pytest.raises(ValueError, match="页码"):
            documents.page_image(identifier, 1)
        assert documents.export(identifier, documents.ExportBody()).body == original
        recognition = documents.recognize(identifier, 0, documents.RecognizeBody())
        batch = next(region for region in recognition["regions"] if "SG250128" in region["text"])
        assert "RapidOCR" in recognition["engine"]
        edit = {"id": batch["id"], "page": 0, "rect": batch["rect"],
                "text": batch["text"].replace("SG250128", "SG261007"),
                "font_family": "Arial", "font_size": batch["font_size"],
                "bold": True, "text_color": "#000000", "background_color": "#ffffff", "fit": True}
        preview = documents.preview(identifier, documents.PreviewBody(page=0, edits=[edit]))
        assert preview.body.startswith(b"\x89PNG\r\n\x1a\n")
        exported = documents.export(identifier, documents.ExportBody(edits=[edit]))
        reader = PdfReader(BytesIO(exported.body))
        assert "SG261007" in reader.pages[0].extract_text()
        assert float(reader.pages[0].mediabox.width) == pytest.approx(dimensions["width_pt"])
        assert float(reader.pages[0].mediabox.height) == pytest.approx(dimensions["height_pt"])
        assert SOURCE.read_bytes() == original
        assert documents.store.documents[identifier].path.read_bytes() == original
    finally:
        documents.store.delete(identifier)
    with pytest.raises(ValueError, match="已关闭或已过期"):
        documents.page_image(identifier, 0)
