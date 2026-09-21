import pytest
from conftest import fixture_bytes
from extractors.pdf import extract_pdf, lines_from_words, render_pdf

LABEL_VALUE_LINES = ["B/L NUMBER", "TOTAL", "x 40'HC"]


@pytest.mark.parametrize("name", ["email_059_SI.pdf", "email_059_BL.pdf"])
def test_label_and_value_share_a_line_in_a_generated_pdf(name):
    out = extract_pdf(fixture_bytes(name), render_dpi=110)
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
    out = extract_pdf(fixture_bytes("email_511_BL.pdf"), render_dpi=110)
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


def test_an_image_only_pdf_becomes_pixels_rather_than_guessed_characters():
    """The page is legible, so it is not unreadable; it is a page nothing has read yet."""
    out = extract_pdf(fixture_bytes("email_512_SI.pdf"), render_dpi=110)
    assert out.opened and len(out.pages) == 1
    page = out.pages[0]
    assert page.source == "image" and page.text == ""
    assert len(out.images) == 1
    image = out.images[0]
    assert image.index == 1 and image.origin == "page" and image.png.startswith(b"\x89PNG")
    assert any("no text layer" in w for w in out.warnings)


def test_a_pdf_with_a_text_layer_needs_no_picture_taken_of_it():
    out = extract_pdf(fixture_bytes("email_059_SI.pdf"), render_dpi=110)
    assert out.pages[0].source == "text_layer"
    assert out.images == []


def _word(text: str, baseline: float, x0: float = 20.0):
    """A PyMuPDF word box: (x0, y0, x1, y1, word, block, line, word_no)."""
    return (x0, baseline - 10.0, x0 + 30.0, baseline, text, 0, 0, 0)


def test_a_label_and_its_value_on_one_baseline_stay_on_one_line():
    out = lines_from_words([_word("Shipper:", 100.0), _word("ACME", 100.0, x0=60.0)])
    assert out.splitlines() == ["Shipper: ACME"]


def test_baselines_that_step_by_less_than_the_tolerance_do_not_chain_into_one_line():
    # Each word sits 1.9 pt below the last, inside the 2 pt tolerance, but 7.6 pt
    # separates the first from the last: measured against the word that opened the
    # line, these are four lines and not one.
    steps = [_word(f"L{i}", 100.0 + i * 1.9) for i in range(5)]
    assert len(lines_from_words(steps).splitlines()) > 1
