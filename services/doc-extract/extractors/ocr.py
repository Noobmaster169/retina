from dataclasses import dataclass
from functools import lru_cache

import pytesseract
from PIL import Image


@dataclass
class OcrResult:
    text: str
    # Mean of the word confidences tesseract reported above zero, or None when it saw no words.
    confidence: float | None
    warnings: list[str]


class OcrUnavailable(Exception):
    """No tesseract binary. The page stays without text rather than failing the request."""


@lru_cache(maxsize=1)
def tesseract_version() -> str | None:
    try:
        return str(pytesseract.get_tesseract_version())
    except pytesseract.TesseractNotFoundError:
        return None


@lru_cache(maxsize=1)
def installed_langs() -> tuple[str, ...]:
    try:
        return tuple(pytesseract.get_languages(config=""))
    except pytesseract.TesseractNotFoundError:
        return ()


def usable_langs(wanted: str) -> tuple[str, list[str]]:
    """The language packs asked for that are installed, falling back to eng, with a warning per missing pack."""
    have = set(installed_langs())
    asked = [lang for lang in wanted.split("+") if lang]
    kept = [lang for lang in asked if lang in have]
    warnings = [f"tesseract language {lang} is not installed" for lang in asked if lang not in have]
    if not kept:
        kept = ["eng"]
    return "+".join(kept), warnings


def ocr_image(image: Image.Image, langs: str) -> OcrResult:
    if tesseract_version() is None:
        raise OcrUnavailable("tesseract is not installed")
    lang, warnings = usable_langs(langs)
    data = pytesseract.image_to_data(image, lang=lang, config="--psm 6", output_type=pytesseract.Output.DICT)

    lines: dict[tuple[int, int, int], list[str]] = {}
    confidences: list[float] = []
    for i, word in enumerate(data["text"]):
        word = word.strip()
        if not word:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)
        conf = float(data["conf"][i])
        if conf > 0:
            confidences.append(conf)

    text = "\n".join(" ".join(words) for _, words in sorted(lines.items()))
    confidence = sum(confidences) / len(confidences) if confidences else None
    return OcrResult(text=text, confidence=confidence, warnings=warnings)
