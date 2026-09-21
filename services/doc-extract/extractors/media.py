from io import BytesIO
from zipfile import BadZipFile, ZipFile

from PIL import Image

from extractors.base import ExtractedImage

"""
Pictures inside an office document.

A word or excel file is a zip, and every picture in it is a part under `media/`.
Reading them from the package rather than through python-docx or openpyxl is
deliberate: those libraries expose the pictures a body paragraph or a worksheet
anchors, and miss the ones in headers, footers, text boxes and shapes. The zip
misses nothing.

A document whose real content is a picture is the case this exists for: a bill of
lading pasted into Word reads as a friendly covering sentence and nothing else, and
before this it passed as a readable document with no fields in it.
"""

# Under this a picture is furniture: a logo, a signature strip, a bullet. Reading
# them would cost a model call each and tell nobody anything. A page of A4 at any
# usable resolution is far larger.
MIN_PIXELS = 160 * 160
# What Pillow opens and the model can be sent.
READABLE = {"PNG", "JPEG", "GIF", "WEBP", "BMP", "TIFF"}


def _usable(data: bytes) -> bytes | None:
    """The picture as a PNG, or None when it is furniture or not an image at all."""
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in READABLE:
                return None
            width, height = image.size
            if width * height < MIN_PIXELS:
                return None
            out = BytesIO()
            image.convert("RGB").save(out, "PNG")
            return out.getvalue()
    except Exception:  # noqa: BLE001 - a part that will not open as an image is simply not one
        return None


def images_in_package(data: bytes, prefix: str, start: int = 1) -> tuple[list[ExtractedImage], list[str]]:
    """Every picture worth reading in an OOXML package, and what was skipped."""
    images: list[ExtractedImage] = []
    warnings: list[str] = []
    try:
        with ZipFile(BytesIO(data)) as package:
            names = sorted(n for n in package.namelist() if f"{prefix}/media/" in n)
            for name in names:
                png = _usable(package.read(name))
                if png is None:
                    continue
                images.append(
                    ExtractedImage(index=start + len(images), png=png, origin="embedded")
                )
    except BadZipFile:
        # The caller's own extractor reports a file that will not open; this is only
        # the picture pass, so it stays quiet rather than saying it twice.
        return [], []
    if images:
        warnings.append(
            f"{len(images)} picture{'s' if len(images) > 1 else ''} in this document "
            "were sent to be read as images"
        )
    return images, warnings
