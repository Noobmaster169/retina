from conftest import fixture_bytes
from extractors.txt import extract_txt


def test_reads_a_generated_shipping_instruction_as_is():
    page = extract_txt(fixture_bytes("email_004_SI.txt")).pages[0]
    assert page.source == "text_layer"
    assert page.text.startswith("SHIPPING INSTRUCTION\n")
    assert "Gross Wt (kgs): 131,058 KG" in page.text


def test_normalises_line_endings():
    assert extract_txt(b"a\r\nb\rc\n").pages[0].text == "a\nb\nc\n"


def test_falls_back_to_cp1252_for_bytes_that_are_not_utf8():
    text = extract_txt(b"caf\xe9 \x93quoted\x94").pages[0].text
    assert text == "café “quoted”"
