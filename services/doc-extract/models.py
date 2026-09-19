from typing import Literal

from pydantic import BaseModel, Field

Format = Literal["txt", "pdf", "docx", "xlsx", "unknown"]
Source = Literal["text_layer", "ocr", "none"]


class ExtractRequest(BaseModel):
    key: str = Field(min_length=1)
    filename: str = Field(min_length=1)
    content_type: str | None = None


class Page(BaseModel):
    index: int
    text: str
    source: Source
    ocr_confidence: float | None = None


class ExtractResponse(BaseModel):
    format: Format
    # Pages joined with a form feed.
    text: str
    pages: list[Page]
    unreadable: bool
    # Any page came from OCR.
    scanned: bool
    warnings: list[str]
    bytes: int


class RenderRequest(BaseModel):
    key: str = Field(min_length=1)
    filename: str = Field(min_length=1)
    out_prefix: str = Field(min_length=1)
    dpi: int | None = Field(default=None, ge=36, le=400)


class RenderedPage(BaseModel):
    index: int
    key: str
    width: int
    height: int


class RenderResponse(BaseModel):
    pages: list[RenderedPage]


class Health(BaseModel):
    ok: bool
    tesseract: str | None
    langs: list[str]
