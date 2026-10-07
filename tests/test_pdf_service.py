"""Integration checks for real PDF content, crop/rotation and embedded glyphs."""

from io import BytesIO
from pathlib import Path
import tempfile
import unittest

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject, RectangleObject
from reportlab.pdfgen import canvas

from backend.pdf_service import export_pdf, extract_native_regions, inspect_pdf, render_page


class PdfServiceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def document(self, *, rotation=0, unit=1, crop=False):
        base = BytesIO()
        c = canvas.Canvas(base, pagesize=(200, 120))
        c.setFillColor("#eeeeee")
        c.rect(0, 0, 200, 120, fill=1, stroke=0)
        c.setFillColor("#000000")
        c.setFont("Helvetica", 10)
        c.drawString(40, 60, "Keep original text")
        c.showPage()
        c.setFont("Helvetica", 10)
        c.drawString(20, 70, "Untouched page")
        c.save()
        writer = PdfWriter(clone_from=PdfReader(BytesIO(base.getvalue())))
        writer.pages[0].rotation = rotation
        if crop:
            writer.pages[0].cropbox = RectangleObject((20, 10, 180, 110))
        if unit != 1:
            writer.pages[0][NameObject("/UserUnit")] = NumberObject(unit)
        writer.add_metadata({"/Title": "Source label"})
        path = self.directory / "source.pdf"
        writer.write(path)
        return path

    def edit(self, **kwargs):
        return {
            "id": "one", "page": 0,
            "rect": {"x": 0.1, "y": 0.1, "width": 0.45, "height": 0.3},
            "text": "中文修改\nTürkçe 123", "font_family": "Noto Sans SC",
            "font_size": 10, "bold": False, "text_color": "#000000",
            "background_color": "#ffffff", "fit": True, **kwargs,
        }

    def test_no_change_is_byte_identical_and_overlay_keeps_original_structure(self):
        source = self.document()
        self.assertEqual(export_pdf(source, []), source.read_bytes())
        before = PdfReader(source)
        after = PdfReader(BytesIO(export_pdf(source, [self.edit()])))
        self.assertEqual(len(after.pages), 2)
        self.assertEqual(after.metadata.title, "Source label")
        self.assertEqual(after.pages[0].mediabox, before.pages[0].mediabox)
        self.assertEqual(after.pages[1].get_contents().get_data(), before.pages[1].get_contents().get_data())
        self.assertIn("Keep original text", after.pages[0].extract_text())
        self.assertIn("中文修改", after.pages[0].extract_text())
        self.assertIn("Türkçe 123", after.pages[0].extract_text())
        embedded = [f.get_object() for f in after.pages[0]["/Resources"]["/Font"].values()]
        self.assertTrue(any("/FontFile2" in f.get("/FontDescriptor", {}).get_object() for f in embedded if f.get("/FontDescriptor")))
        self.assertTrue(extract_native_regions(source))

    def test_rotated_crop_boxes_place_background_in_visible_top_left(self):
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation):
                source = self.document(rotation=rotation, crop=True)
                info = inspect_pdf(source)
                expected = (160, 100) if rotation in (0, 180) else (100, 160)
                self.assertEqual((info["pages"][0]["width_pt"], info["pages"][0]["height_pt"]), expected)
                exported = self.directory / f"rotation-{rotation}.pdf"
                exported.write_bytes(export_pdf(source, [self.edit(text="", background_color="#ff0000")]))
                image = render_page(exported, dpi=72)
                self.assertEqual(image.size, expected)
                red_inside = image.getpixel((int(image.width * 0.2), int(image.height * 0.2)))
                outside = image.getpixel((int(image.width * 0.8), int(image.height * 0.8)))
                self.assertEqual(red_inside, (255, 0, 0))
                self.assertNotEqual(outside, (255, 0, 0))
                after = PdfReader(exported).pages[0]
                self.assertEqual(after.rotation, rotation)
                self.assertEqual(after.cropbox, RectangleObject((20, 10, 180, 110)))

    def test_user_unit_and_overflow_validation(self):
        source = self.document(unit=2)
        self.assertEqual(inspect_pdf(source)["pages"][0]["width_pt"], 400)
        self.assertEqual(render_page(source, dpi=72).size, (400, 240))
        with self.assertRaisesRegex(ValueError, "超出选定区域"):
            export_pdf(source, [self.edit(text="Many lines\nMore lines\nAnd more", font_size=60, fit=False)])
        fitted = export_pdf(source, [self.edit(text="Many lines\nMore lines\nAnd more", font_size=60, fit=True)])
        self.assertIn("Many lines", PdfReader(BytesIO(fitted)).pages[0].extract_text())
        with self.assertRaisesRegex(ValueError, "区域"):
            export_pdf(source, [self.edit(rect={"x": -0.1, "y": 0, "width": 0.2, "height": 0.2})])
        with self.assertRaisesRegex(ValueError, "颜色"):
            export_pdf(source, [self.edit(text_color="red")])


if __name__ == "__main__":
    unittest.main()
