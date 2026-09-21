import pytest
from conftest import fixture_bytes
from fastapi.testclient import TestClient

from app import create_app, is_unreadable
from extractors.base import Extracted, ExtractedImage, ExtractedPage
from storage import MemoryStorage, StorageError


@pytest.fixture
def stack():
    storage = MemoryStorage()
    return storage, TestClient(create_app(storage))


def extract(
    client: TestClient,
    key: str,
    filename: str,
    content_type: str | None = None,
    out_prefix: str | None = None,
):
    response = client.post(
        "/extract",
        json={"key": key, "filename": filename, "content_type": content_type, "out_prefix": out_prefix},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_healthz_says_it_is_up(stack):
    _, client = stack
    assert client.get("/healthz").json() == {"ok": True}


def test_a_text_attachment_is_readable(stack):
    storage, client = stack
    storage.put("a/email_004_SI.txt", fixture_bytes("email_004_SI.txt"), "text/plain")
    body = extract(client, "a/email_004_SI.txt", "email_004_SI.txt", "text/plain")
    assert body["format"] == "txt"
    assert body["unreadable"] is False and body["has_images"] is False
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
        "has_images": False,
        "images": [],
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


def test_unreadable_means_nobody_could_read_it_not_that_we_have_not_yet():
    """The distinction the whole change turns on: a legible scan is not unreadable.

    It is a document nothing has read yet, and calling it unreadable is what made a
    clean scan and a truncated file mean the same thing to everyone downstream.
    """
    long_enough = "Shipper: ACME PAPER MILLS LIMITED, SHANGHAI CHINA. " * 3
    picture = ExtractedImage(1, b"png-bytes", "page")

    assert is_unreadable(0, Extracted()) is True, "empty"
    assert is_unreadable(500, Extracted(opened=False)) is True, "would not open"
    assert is_unreadable(500, Extracted(pages=[])) is True, "nothing in it at all"
    thin = Extracted(pages=[ExtractedPage(1, "Dear Sir,", "text_layer")])
    assert is_unreadable(500, thin) is True, "says too little to work from"

    # Pixels somebody can look at: not read yet, which is not the same as unreadable.
    scan = Extracted(pages=[ExtractedPage(1, "", "image")], images=[picture])
    assert is_unreadable(5000, scan) is False
    # A covering sentence plus the document as a picture. Thin text, but not unreadable.
    pasted = Extracted(pages=[ExtractedPage(1, "Dear Sir,", "text_layer")], images=[picture])
    assert is_unreadable(5000, pasted) is False

    assert is_unreadable(5000, Extracted(pages=[ExtractedPage(1, long_enough, "text_layer")])) is False
