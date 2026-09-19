from conftest import fixture_bytes
from extractors.docx import extract_docx


def test_flattens_the_bilingual_bl_table_to_label_value_lines():
    text = extract_docx(fixture_bytes("email_055_BL.docx")).pages[0].text
    lines = text.splitlines()
    assert lines[0] == "BILL OF LADING (DRAFT)"
    assert lines[1].startswith("B/L NO.(提单号): ")
    # Every table row is one line, the CJK gloss kept on the label, the cell's inner newlines joined.
    glossed = [line for line in lines if "(发货人)" in line or "(收货人)" in line or "(通知人)" in line]
    assert len(glossed) == 3
    assert all(": " in line and " | " in line for line in glossed)
    weight = next(line for line in lines if "(毛重 KGS)" in line)
    assert weight.split(": ")[1].replace(",", "").isdigit()
    assert any(line.startswith("ORDER NO.:") and "FREIGHT PREPAID" in line for line in lines)
