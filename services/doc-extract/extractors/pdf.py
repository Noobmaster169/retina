from io import BytesIO
from typing import NamedTuple

import fitz
from PIL import Image

from extractors.base import Extracted, ExtractedPage
from extractors.ocr import OcrUnavailable, ocr_image

# A page whose text layer says less than this is taken to be an image and read by OCR.
MIN_TEXT_LAYER_CHARS = 20
# Words whose baselines sit within this many points are one line.
BASELINE_TOLERANCE_PT = 2.0


class Word(NamedTuple):
    """One word box as PyMuPDF's `get_text("words")` yields it, named rather than indexed."""

    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    block: int
    line: int
    number: int


def lines_from_words(words: list[tuple]) -> str:
    """Rebuilds lines from word boxes so a label and the value drawn beside it stay on one line.

    PyMuPDF's default reading order follows the drawing order, which for a form
    put down label by label and value by value can separate the two. Grouping by
    baseline puts them back together.

    Each line is measured against the baseline of the word that opened it, never
    against the word last added: a page whose baselines step by less than the
    tolerance would otherwise chain every one of them into a single line.
    """
    ordered = sorted((Word._make(word[:8]) for word in words), key=lambda w: (round(w.y1, 1), w.x0))
    lines: list[list[Word]] = []
    baselines: list[float] = []
    for word in ordered:
        if lines and abs(word.y1 - baselines[-1]) <= BASELINE_TOLERANCE_PT:
            lines[-1].append(word)
            continue
        lines.append([word])
        baselines.append(word.y1)
    return "\n".join(" ".join(w.text for w in sorted(line, key=lambda w: w.x0)) for line in lines)


def _ocr_page(page: fitz.Page, index: int, dpi: int, langs: str, out: Extracted) -> ExtractedPage:
    pixmap = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    image = Image.open(BytesIO(pixmap.tobytes("png")))
    try:
        result = ocr_image(image, langs)
    except OcrUnavailable as error:
        out.warnings.append(f"page {index}: no text layer and {error}")
        return ExtractedPage(index=index, text="", source="none")
    out.warnings.extend(f"page {index}: {w}" for w in result.warnings)
    out.warnings.append(f"page {index}: no text layer, read by OCR")
    return ExtractedPage(index=index, text=result.text, source="ocr", ocr_confidence=result.confidence)


def extract_pdf(data: bytes, ocr_dpi: int, ocr_langs: str) -> Extracted:
    out = Extracted()
    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception as error:  # noqa: BLE001 - a file that will not open is a fact to report, not a failure
        out.opened = False
        out.warnings.append(f"could not open: {error}")
        return out
    with document:
        if document.is_encrypted and not document.authenticate(""):
            out.opened = False
            out.warnings.append("the file is encrypted")
            return out
        for number, page in enumerate(document, start=1):
            try:
                text = lines_from_words(page.get_text("words"))
            except Exception as error:  # noqa: BLE001 - a broken page is reported and the rest still read
                out.warnings.append(f"page {number}: could not read the text layer: {error}")
                text = ""
            if len(text.strip()) >= MIN_TEXT_LAYER_CHARS:
                out.pages.append(ExtractedPage(index=number, text=text, source="text_layer"))
                continue
            out.pages.append(_ocr_page(page, number, ocr_dpi, ocr_langs, out))
    return out


def render_pdf(data: bytes, dpi: int) -> list[tuple[int, bytes, int, int]]:
    """Every page as a PNG: (index, bytes, width, height). Empty when the file will not open."""
    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception:  # noqa: BLE001
        return []
    with document:
        pages = []
        for number, page in enumerate(document, start=1):
            pixmap = page.get_pixmap(dpi=dpi)
            pages.append((number, pixmap.tobytes("png"), pixmap.width, pixmap.height))
        return pages
