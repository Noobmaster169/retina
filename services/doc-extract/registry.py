from collections.abc import Callable
from pathlib import PurePosixPath

from extractors.base import Extracted
from extractors.docx import extract_docx
from extractors.pdf import extract_pdf
from extractors.txt import extract_txt
from extractors.xlsx import extract_xlsx
from models import Format
from settings import Settings

# The extension decides; the content type is the source's guess and only breaks a tie for a file with no extension.
BY_EXTENSION: dict[str, Format] = {".txt": "txt", ".pdf": "pdf", ".docx": "docx", ".xlsx": "xlsx"}
BY_CONTENT_TYPE: dict[str, Format] = {
    "text/plain": "txt",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}


def format_of(filename: str, content_type: str | None) -> Format:
    extension = PurePosixPath(filename).suffix.lower()
    if extension in BY_EXTENSION:
        return BY_EXTENSION[extension]
    if content_type:
        return BY_CONTENT_TYPE.get(content_type.split(";")[0].strip().lower(), "unknown")
    return "unknown"


def extractor_for(fmt: Format, settings: Settings) -> Callable[[bytes], Extracted] | None:
    if fmt == "txt":
        return extract_txt
    if fmt == "pdf":
        return lambda data: extract_pdf(data, settings.ocr_dpi, settings.ocr_langs)
    if fmt == "docx":
        return extract_docx
    if fmt == "xlsx":
        return extract_xlsx
    return None
