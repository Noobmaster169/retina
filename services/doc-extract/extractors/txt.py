from extractors.base import Extracted, ExtractedPage


def extract_txt(data: bytes) -> Extracted:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("cp1252", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return Extracted(pages=[ExtractedPage(index=1, text=text, source="text_layer")])
