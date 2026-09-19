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


class ErrorBody(BaseModel):
    """The failure envelope, mirrored by hand in backend/src/doc-extract/http.client.ts.

    `retryable` is this service's own verdict, as the proxy's envelope states its
    own: the caller must not read it off the status, because the store being
    unreachable and a key that is not there are both its failures to report.
    """

    error: str
    retryable: bool
