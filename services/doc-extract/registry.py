from collections.abc import Callable
from pathlib import PurePosixPath

from extractors.base import Extracted
from extractors.docx import extract_docx
from extractors.image import extract_image
from extractors.pdf import extract_pdf
from extractors.txt import extract_txt
from extractors.xlsx import extract_xlsx
from models import Format
from settings import Settings

# What the bytes themselves say. Checked before the name, because a name is a claim
# and the bytes are the fact: real mail carries a TIFF called `.pdf` and a `.doc`
# that is really a `.docx`, and trusting the extension reads them as corrupt.
MAGIC: tuple[tuple[bytes, Format], ...] = (
    (b"%PDF-", "pdf"),
    (b"\x89PNG\r\n\x1a\n", "image"),
    (b"\xff\xd8\xff", "image"),
    (b"GIF87a", "image"),
    (b"GIF89a", "image"),
    (b"II*\x00", "image"),
    (b"MM\x00*", "image"),
)

BY_EXTENSION: dict[str, Format] = {
    ".txt": "txt",
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".gif": "image",
    ".webp": "image",
    ".bmp": "image",
    ".tif": "image",
    ".tiff": "image",
}
BY_CONTENT_TYPE: dict[str, Format] = {
    "text/plain": "txt",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "image/png": "image",
    "image/jpeg": "image",
    "image/gif": "image",
    "image/webp": "image",
    "image/bmp": "image",
    "image/tiff": "image",
}

# A zip is an office document or an archive, and only the parts say which, so the
# extension decides there rather than the magic bytes.
ZIP_MAGIC = b"PK\x03\x04"


def format_of(filename: str, content_type: str | None, data: bytes = b"") -> Format:
    for magic, fmt in MAGIC:
        if data.startswith(magic):
            return fmt
    extension = PurePosixPath(filename).suffix.lower()
    if extension in BY_EXTENSION:
        return BY_EXTENSION[extension]
    if content_type:
        guess = BY_CONTENT_TYPE.get(content_type.split(";")[0].strip().lower())
        if guess:
            return guess
    # No extension and nothing recognised: plain text is the one thing that can be
    # told from bytes alone without a signature to look for.
    if data and not data.startswith(ZIP_MAGIC):
        try:
            data.decode("utf-8")
            return "txt"
        except UnicodeDecodeError:
            return "unknown"
    return "unknown"


def extractor_for(fmt: Format, settings: Settings) -> Callable[[bytes], Extracted] | None:
    if fmt == "txt":
        return extract_txt
    if fmt == "pdf":
        return lambda data: extract_pdf(data, settings.render_dpi)
    if fmt == "docx":
        return extract_docx
    if fmt == "xlsx":
        return extract_xlsx
    if fmt == "image":
        return extract_image
    return None
