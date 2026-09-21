import pytest
from conftest import fixture_bytes
from fastapi.testclient import TestClient

from app import create_app, is_unreadable, page_is_readable
from extractors.base import Extracted, ExtractedPage
from storage import MemoryStorage, StorageError


@pytest.fixture
def stack():
    storage = MemoryStorage()
    return storage, TestClient(create_app(storage))


def extract(client: TestClient, key: str, filename: str, content_type: str | None = None):
    response = client.post("/extract", json={"key": key, "filename": filename, "content_type": content_type})
    assert response.status_code == 200, response.text
    return response.json()


def test_healthz_reports_the_ocr_engine(stack):
    _, client = stack
    body = client.get("/healthz").json()
    assert body["ok"] is True
    assert "tesseract" in body and isinstance(body["langs"], list)


def test_a_text_attachment_is_readable(stack):
    storage, client = stack
    storage.put("a/email_004_SI.txt", fixture_bytes("email_004_SI.txt"), "text/plain")
    body = extract(client, "a/email_004_SI.txt", "email_004_SI.txt", "text/plain")
    assert body["format"] == "txt"
    assert body["unreadable"] is False and body["scanned"] is False
    assert body["text"].startswith("SHIPPING INSTRUCTION")
    assert body["pages"][0]["source"] == "text_layer"
    # The size of what it was handed, not a number copied from one machine's
    # checkout: this fixture was 663 bytes on a Windows working tree and 644 in
    # CI, which is the same file with different line endings.
    assert body["bytes"] == len(fixture_bytes("email_004_SI.txt"))


def test_an_empty_file_is_unreadable_with_http_200(stack):
    storage, client = stack
    storage.put("a/empty.pdf", b"", "application/pdf")
    body = extract(client, "a/empty.pdf", "empty.pdf")
    assert body == {
        "format": "pdf",
        "text": "",
        "pages": [],
        "unreadable": True,
        "scanned": False,
        "warnings": ["the file is empty (0 bytes)"],
        "bytes": 0,
    }


def test_a_garbled_pdf_is_unreadable_with_http_200(stack):
    storage, client = stack
    storage.put("a/email_511_BL.pdf", fixture_bytes("email_511_BL.pdf"), "application/pdf")
    body = extract(client, "a/email_511_BL.pdf", "email_511_BL.pdf")
    assert body["format"] == "pdf" and body["unreadable"] is True
    assert body["warnings"][0].startswith("could not open")


def test_an_unknown_extension_is_unreadable_and_of_unknown_format(stack):
    storage, client = stack
    storage.put("a/notes.zip", b"PK\x03\x04junk", None)
    body = extract(client, "a/notes.zip", "notes.zip")
    assert body["format"] == "unknown" and body["unreadable"] is True


def test_the_content_type_decides_when_the_name_has_no_extension(stack):
    storage, client = stack
    storage.put("a/attachment", fixture_bytes("email_004_SI.txt"), "text/plain")
    body = extract(client, "a/attachment", "attachment", "text/plain; charset=utf-8")
    assert body["format"] == "txt" and body["unreadable"] is False


def test_a_missing_object_is_404_and_not_retryable(stack):
    _, client = stack
    response = client.post("/extract", json={"key": "nowhere", "filename": "x.txt"})
    assert response.status_code == 404
    assert response.json()["retryable"] is False


def test_a_store_outage_is_503_and_retryable():
    class Down:
        def get(self, key):
            raise StorageError("connection refused")

        def put(self, key, data, content_type):
            raise StorageError("connection refused")

    client = TestClient(create_app(Down()))
    response = client.post("/extract", json={"key": "a", "filename": "x.txt"})
    assert response.status_code == 503
    assert response.json()["retryable"] is True


def test_render_writes_a_png_per_page_and_nothing_for_a_non_pdf(stack):
    storage, client = stack
    storage.put("a/email_059_SI.pdf", fixture_bytes("email_059_SI.pdf"), "application/pdf")
    key = "a/email_059_SI.pdf"
    body = {"key": key, "filename": "email_059_SI.pdf", "out_prefix": "a/pages/email_059_SI.pdf", "dpi": 50}
    response = client.post("/render", json=body)
    assert response.status_code == 200
    pages = response.json()["pages"]
    assert [page["key"] for page in pages] == ["a/pages/email_059_SI.pdf/1.png"]
    assert storage.objects["a/pages/email_059_SI.pdf/1.png"][1] == "image/png"

    response = client.post("/render", json={"key": "a/x.txt", "filename": "x.txt", "out_prefix": "a/pages/x.txt"})
    assert response.json() == {"pages": []}


def test_a_page_ocr_could_not_read_is_not_something_to_work_from():
    assert page_is_readable(ExtractedPage(1, "clean text", "text_layer", None)) is True
    assert page_is_readable(ExtractedPage(1, "recognised well", "ocr", 88.0)) is True
    assert page_is_readable(ExtractedPage(1, "rn1 vvorn noise", "ocr", 8.0)) is False
    assert page_is_readable(ExtractedPage(1, "", "ocr", None)) is False
    assert page_is_readable(ExtractedPage(1, "", "none", None)) is False


def test_a_document_no_page_could_be_read_from_is_unreadable():
    long_enough = "Shipper: ACME PAPER MILLS LIMITED, SHANGHAI CHINA. " * 3

    # Every page OCR, none of it trusted.
    both_bad = Extracted(pages=[ExtractedPage(1, long_enough, "ocr", 12.0), ExtractedPage(2, long_enough, "ocr", 9.0)])
    assert is_unreadable(5000, both_bad) is True

    # A blank page beside one OCR could not read: neither yielded anything usable.
    blank_and_bad = Extracted(pages=[ExtractedPage(1, "", "none", None), ExtractedPage(2, long_enough, "ocr", 8.0)])
    assert is_unreadable(5000, blank_and_bad) is True

    # One page the recogniser stands behind is enough to work from.
    one_good = Extracted(pages=[ExtractedPage(1, long_enough, "ocr", 88.0), ExtractedPage(2, "noise", "ocr", 5.0)])
    assert is_unreadable(5000, one_good) is False
