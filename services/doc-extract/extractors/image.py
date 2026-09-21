from io import BytesIO

from PIL import Image

from extractors.base import Extracted, ExtractedImage

"""An image attachment: a photograph or a fax of a document, which is a whole
document rather than a picture inside one. Nothing here reads it; it is handed on
to a reader that can see."""


def extract_image(data: bytes) -> Extracted:
    try:
        with Image.open(BytesIO(data)) as image:
            frames = getattr(image, "n_frames", 1)
            out = Extracted()
            # A fax is a multi-page TIFF, and every page is part of the document.
            for index in range(frames):
                image.seek(index)
                buffer = BytesIO()
                image.convert("RGB").save(buffer, "PNG")
                out.images.append(
                    ExtractedImage(index=index + 1, png=buffer.getvalue(), origin="page")
                )
            return out
    except Exception as error:  # noqa: BLE001 - a file that will not open is a fact to report
        return Extracted(opened=False, warnings=[f"could not open: {error}"])
