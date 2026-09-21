from typing import Literal

from pydantic import BaseModel, Field

Format = Literal["txt", "pdf", "docx", "xlsx", "image", "unknown"]
# What a page yielded: the file's own text layer, or pixels handed on to be looked at.
Source = Literal["text_layer", "image", "none"]


class ExtractRequest(BaseModel):
    key: str = Field(min_length=1)
    filename: str = Field(min_length=1)
    content_type: str | None = None
    # Where to put the pixels this file could not turn into text. Without it a document
    # that needs looking at is still reported, with `images: []` and a warning saying so.
    out_prefix: str | None = None


class Page(BaseModel):
    index: int
    text: str
    source: Source


class UnreadImage(BaseModel):
    """Pixels the caller should show a model that can see.

    `origin` is `page` for a PDF page or a photographed document, `embedded` for a
    picture inside a word or excel file.
    """

    index: int
    key: str
    origin: Literal["page", "embedded"]


class ExtractResponse(BaseModel):
    format: Format
    # Pages joined with a form feed.
    text: str
    pages: list[Page]
    # Nothing could be read and nothing can be looked at: empty, encrypted, or corrupt.
    unreadable: bool
    # Some of this document is pixels. Its text alone is not the whole document.
    has_images: bool
    images: list[UnreadImage]
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


class ErrorBody(BaseModel):
    """The failure envelope, mirrored by hand in backend/src/doc-extract/http.client.ts.

    `retryable` is this service's own verdict, as the proxy's envelope states its
    own: the caller must not read it off the status, because the store being
    unreachable and a key that is not there are both its failures to report.
    """

    error: str
    retryable: bool
