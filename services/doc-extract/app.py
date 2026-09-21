import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from extractors.base import Extracted
from extractors.pdf import render_pdf
from models import (
    ErrorBody,
    ExtractRequest,
    ExtractResponse,
    Health,
    Page,
    RenderedPage,
    RenderRequest,
    RenderResponse,
    UnreadImage,
)
from registry import extractor_for, format_of
from settings import settings
from storage import MinioStorage, NoSuchObject, Storage, StorageError

log = logging.getLogger("doc-extract")

# Under this much text a page has said nothing a reader could work from, so what it
# holds is pixels rather than prose.
MIN_TOTAL_CHARS = 40


def create_app(storage: Storage | None = None) -> FastAPI:
    app = FastAPI(title="retina doc-extract")
    app.state.storage = storage or MinioStorage(settings)

    @app.exception_handler(StorageError)
    async def storage_failed(_request: Request, error: StorageError) -> JSONResponse:
        # The one 5xx this service answers: the store did not answer, so the caller should try again.
        body = ErrorBody(error=f"object store: {error}", retryable=True)
        return JSONResponse(status_code=503, content=body.model_dump())

    @app.exception_handler(NoSuchObject)
    async def no_such_object(_request: Request, error: NoSuchObject) -> JSONResponse:
        body = ErrorBody(error=f"no such object: {error}", retryable=False)
        return JSONResponse(status_code=404, content=body.model_dump())

    @app.get("/healthz", response_model=Health)
    def healthz() -> Health:
        return Health(ok=True)

    @app.post("/extract", response_model=ExtractResponse)
    def extract(request: ExtractRequest) -> ExtractResponse:
        data = app.state.storage.get(request.key)
        result = extract_bytes(data, request.filename, request.content_type)
        return store_images(app.state.storage, result, request.out_prefix)

    @app.post("/render", response_model=RenderResponse)
    def render(request: RenderRequest) -> RenderResponse:
        # On the name first, so asking to render a text file does not cost a read of
        # it. `unknown` still gets fetched: only the bytes can say what it really is.
        if format_of(request.filename, None) not in ("pdf", "unknown"):
            return RenderResponse(pages=[])
        data = app.state.storage.get(request.key)
        if format_of(request.filename, None, data) != "pdf":
            return RenderResponse(pages=[])
        pages = []
        for index, png, width, height in render_pdf(data, request.dpi or settings.render_dpi):
            key = f"{request.out_prefix.rstrip('/')}/{index}.png"
            app.state.storage.put(key, png, "image/png")
            pages.append(RenderedPage(index=index, key=key, width=width, height=height))
        return RenderResponse(pages=pages)

    return app


class Extraction:
    """What `extract_bytes` found, before the pixels have anywhere to live."""

    def __init__(self, response: ExtractResponse, extracted: Extracted) -> None:
        self.response = response
        self.extracted = extracted


def is_unreadable(size: int, extracted: Extracted) -> bool:
    """Nobody could read this, a person included: empty, would not open, or nothing
    in it to read or to look at.

    A document whose pixels can be looked at is not unreadable. It is a document
    that has not been read yet, and saying otherwise was how a legible scan and a
    corrupt file came to mean the same thing.
    """
    if size == 0 or not extracted.opened:
        return True
    if extracted.images:
        return False
    if not extracted.pages:
        return True
    return sum(len(page.text.strip()) for page in extracted.pages) < MIN_TOTAL_CHARS


def extract_bytes(data: bytes, filename: str, content_type: str | None) -> Extraction:
    """Never raises for a bad file: whatever goes wrong inside an extractor is a warning on an unreadable answer."""
    fmt = format_of(filename, content_type, data)
    extractor = extractor_for(fmt, settings)
    if extractor is None:
        extracted = Extracted(opened=False, warnings=[f"unknown format for {filename}"])
    elif len(data) == 0:
        extracted = Extracted(opened=False, warnings=["the file is empty (0 bytes)"])
    else:
        try:
            extracted = extractor(data)
        except Exception as error:  # noqa: BLE001 - the contract: a bad file is reported, never a 500
            log.warning("extractor failed for %s: %s", filename, error)
            extracted = Extracted(opened=False, warnings=[f"could not read: {error}"])

    pages = [Page(index=p.index, text=p.text, source=p.source) for p in extracted.pages]
    return Extraction(
        ExtractResponse(
            format=fmt,
            text="\f".join(page.text for page in pages),
            pages=pages,
            unreadable=is_unreadable(len(data), extracted),
            has_images=bool(extracted.images),
            images=[],
            warnings=extracted.warnings,
            bytes=len(data),
        ),
        extracted,
    )


def store_images(storage: Storage, found: Extraction, out_prefix: str | None) -> ExtractResponse:
    """The pixels written where the caller asked for them.

    Without a prefix they are reported and not kept: the caller still learns that
    this document is partly or wholly something to look at, which is what stops a
    covering sentence passing as a whole bill of lading.
    """
    response = found.response
    if not found.extracted.images:
        return response
    if out_prefix is None:
        response.warnings.append(
            f"{len(found.extracted.images)} image(s) here were not read: "
            "no out_prefix was given to write them to"
        )
        return response
    prefix = out_prefix.rstrip("/")
    for image in found.extracted.images:
        key = f"{prefix}/{image.index}.png"
        storage.put(key, image.png, "image/png")
        response.images.append(UnreadImage(index=image.index, key=key, origin=image.origin))
    return response


app = create_app()
