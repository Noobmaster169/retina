import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from extractors.base import Extracted
from extractors.ocr import installed_langs, tesseract_version
from extractors.pdf import render_pdf
from models import ExtractRequest, ExtractResponse, Health, Page, RenderedPage, RenderRequest, RenderResponse
from registry import extractor_for, format_of
from settings import settings
from storage import MinioStorage, NoSuchObject, Storage, StorageError

log = logging.getLogger("doc-extract")

# Under this much text, after OCR, the document is not something a reader could work from.
MIN_TOTAL_CHARS = 40
# An OCR page whose mean word confidence is under this is treated as unread.
MIN_OCR_CONFIDENCE = 40.0


def create_app(storage: Storage | None = None) -> FastAPI:
    app = FastAPI(title="retina doc-extract")
    app.state.storage = storage or MinioStorage(settings)

    @app.exception_handler(StorageError)
    async def storage_failed(_request: Request, error: StorageError) -> JSONResponse:
        # The one 5xx this service answers: the store did not answer, so the caller should try again.
        return JSONResponse(status_code=503, content={"error": f"object store: {error}", "retryable": True})

    @app.exception_handler(NoSuchObject)
    async def no_such_object(_request: Request, error: NoSuchObject) -> JSONResponse:
        return JSONResponse(status_code=404, content={"error": f"no such object: {error}", "retryable": False})

    @app.get("/healthz", response_model=Health)
    def healthz() -> Health:
        version = tesseract_version()
        return Health(ok=True, tesseract=version, langs=list(installed_langs()))

    @app.post("/extract", response_model=ExtractResponse)
    def extract(request: ExtractRequest) -> ExtractResponse:
        data = app.state.storage.get(request.key)
        return extract_bytes(data, request.filename, request.content_type)

    @app.post("/render", response_model=RenderResponse)
    def render(request: RenderRequest) -> RenderResponse:
        if format_of(request.filename, None) != "pdf":
            return RenderResponse(pages=[])
        data = app.state.storage.get(request.key)
        pages = []
        for index, png, width, height in render_pdf(data, request.dpi or settings.render_dpi):
            key = f"{request.out_prefix.rstrip('/')}/{index}.png"
            app.state.storage.put(key, png, "image/png")
            pages.append(RenderedPage(index=index, key=key, width=width, height=height))
        return RenderResponse(pages=pages)

    return app


def is_unreadable(size: int, extracted: Extracted) -> bool:
    if size == 0 or not extracted.opened or not extracted.pages:
        return True
    if all(page.source == "none" for page in extracted.pages):
        return True
    total = sum(len(page.text.strip()) for page in extracted.pages)
    if total < MIN_TOTAL_CHARS:
        return True
    ocr_pages = [page for page in extracted.pages if page.source == "ocr"]
    if ocr_pages and len(ocr_pages) == len(extracted.pages):
        return all((page.ocr_confidence or 0.0) < MIN_OCR_CONFIDENCE for page in ocr_pages)
    return False


def extract_bytes(data: bytes, filename: str, content_type: str | None) -> ExtractResponse:
    """Never raises for a bad file: whatever goes wrong inside an extractor is a warning on an unreadable answer."""
    fmt = format_of(filename, content_type)
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

    pages = [
        Page(index=p.index, text=p.text, source=p.source, ocr_confidence=p.ocr_confidence) for p in extracted.pages
    ]
    return ExtractResponse(
        format=fmt,
        text="\f".join(page.text for page in pages),
        pages=pages,
        unreadable=is_unreadable(len(data), extracted),
        scanned=any(page.source == "ocr" for page in pages),
        warnings=extracted.warnings,
        bytes=len(data),
    )


app = create_app()
