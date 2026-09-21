from dataclasses import dataclass, field

from models import Source


@dataclass
class ExtractedPage:
    index: int
    text: str
    source: Source


@dataclass
class ExtractedImage:
    """Pixels this extractor could not turn into text, for a reader that can see.

    `origin` is what it came from: a page of a PDF that carries no text layer, or a
    picture embedded in a word or excel document. `index` numbers it within the
    document so a caller can say which part of which file it is.
    """

    index: int
    png: bytes
    origin: str


@dataclass
class Extracted:
    """What one extractor found. `opened` is False when the file could not be read at all."""

    pages: list[ExtractedPage] = field(default_factory=list)
    images: list[ExtractedImage] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    opened: bool = True


def cell_text(value: object) -> str:
    """A spreadsheet or table value as text: no thousands separators, integral floats as ints."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()
