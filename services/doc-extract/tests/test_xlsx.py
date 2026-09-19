from conftest import fixture_bytes
from extractors.base import cell_text
from extractors.xlsx import extract_xlsx


def test_rows_become_label_value_lines_and_numbers_keep_no_separators():
    out = extract_xlsx(fixture_bytes("email_005_SI.xlsx"))
    assert len(out.pages) == 1
    lines = out.pages[0].text.splitlines()
    # A1 is the shipper's name alone; the blank row after it is skipped.
    assert lines[0] == "ASIA PACIFIC PAPERBOARD TRADING PTE LTD"
    assert lines[1] == "BL INSTRUCTION: 3154303911"
    assert "GROSS WEIGHT: 341715" in lines
    assert "FREIGHT: PREPAID" in lines


def test_cell_text_renders_integral_floats_as_ints():
    assert cell_text(131058.0) == "131058"
    assert cell_text(12.5) == "12.5"
    assert cell_text(None) == ""
    assert cell_text(" x ") == "x"
