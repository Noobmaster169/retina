from io import BytesIO

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

from extractors.base import Extracted, ExtractedPage, cell_text


def _row_text(cells: list[str]) -> str:
    """`label: value` for a two-column row; further cells joined after it. Newlines inside a cell become ` | `."""
    flat = [" | ".join(part.strip() for part in cell.split("\n") if part.strip()) for cell in cells]
    flat = [cell for cell in flat if cell]
    if not flat:
        return ""
    if len(flat) == 1:
        return flat[0]
    return f"{flat[0]}: {' | '.join(flat[1:])}"


def extract_docx(data: bytes) -> Extracted:
    document = Document(BytesIO(data))
    lines: list[str] = []
    # The body's children in document order, so a table lands where it was written and not after every paragraph.
    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = Paragraph(child, document).text.strip()
            if text:
                lines.append(text)
        elif tag == "tbl":
            for row in Table(child, document).rows:
                text = _row_text([cell_text(cell.text) for cell in row.cells])
                if text:
                    lines.append(text)
    return Extracted(pages=[ExtractedPage(index=1, text="\n".join(lines), source="text_layer")])
