import pytest
from conftest import fixture_bytes, needs_tesseract
from extractors.pdf import extract_pdf, lines_from_words, render_pdf

LABEL_VALUE_LINES = ["B/L NUMBER", "TOTAL", "x 40'HC"]


@pytest.mark.parametrize("name", ["email_059_SI.pdf", "email_059_BL.pdf"])
def test_label_and_value_share_a_line_in_a_generated_pdf(name):
    out = extract_pdf(fixture_bytes(name), ocr_dpi=220, ocr_langs="eng")
    assert out.opened and len(out.pages) == 1
    text = out.pages[0].text
    assert out.pages[0].source == "text_layer"
    # Every field block draws its label at one x and its value at another on the same baseline.
    lines = text.splitlines()
    assert any(line.startswith("B/L NUMBER:") and "BOOKING NO." in line for line in lines)
    assert any(line.startswith("TOTAL ") and line.endswith(" KG") for line in lines)
    assert any(" x 40'HC" in line or " x 20'GP" in line for line in lines)
    labelled = [line for line in lines if ":" in line or line.isupper()]
    assert len(labelled) >= 8


def test_lines_are_rebuilt_from_baselines_not_drawing_order():
    # (x0, y0, x1, y1, word, block, line, wordno): the value was drawn after every label.
    words = [
        (20, 10, 40, 20, "Shipper", 0, 0, 0),
        (20, 30, 40, 40, "Port", 0, 1, 0),
        (60, 10, 90, 20, "ACME", 1, 0, 0),
        (60, 30.5, 90, 40.5, "SINGAPORE", 1, 1, 0),
    ]
    assert lines_from_words(words) == "Shipper ACME\nPort SINGAPORE"


def test_a_garbled_file_does_not_open():
    out = extract_pdf(fixture_bytes("email_511_BL.pdf"), ocr_dpi=220, ocr_langs="eng")
    assert out.opened is False
    assert out.pages == []
    assert out.warnings and out.warnings[0].startswith("could not open")


def test_render_gives_nothing_for_a_file_that_will_not_open():
    assert render_pdf(fixture_bytes("email_511_BL.pdf"), dpi=72) == []


def test_render_makes_one_png_per_page():
    pages = render_pdf(fixture_bytes("email_059_SI.pdf"), dpi=50)
    assert len(pages) == 1
    index, png, width, height = pages[0]
    assert index == 1 and png.startswith(b"\x89PNG") and width > 0 and height > 0


@needs_tesseract
def test_an_image_only_pdf_is_read_by_ocr():
    out = extract_pdf(fixture_bytes("email_512_SI.pdf"), ocr_dpi=220, ocr_langs="eng")
    assert out.opened and len(out.pages) == 1
    page = out.pages[0]
    assert page.source == "ocr"
    assert page.ocr_confidence is not None and page.ocr_confidence > 40
    assert "Shipper" in page.text
