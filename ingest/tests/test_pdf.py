from __future__ import annotations

from pathlib import Path

from ingest import pdf


def test_extract_pdf_text_uses_pypdf_when_text_is_available(monkeypatch) -> None:
    monkeypatch.setattr(pdf, "extract_pdf_text_with_pypdf", lambda _path: "from-pypdf")
    monkeypatch.setattr(pdf, "extract_pdf_text_with_ocr", lambda _path: "from-ocr")

    extracted = pdf.extract_pdf_text(Path("/tmp/example.pdf"), ocr_fallback=True)

    assert extracted == "from-pypdf"


def test_extract_pdf_text_uses_ocr_fallback_when_enabled(monkeypatch) -> None:
    monkeypatch.setattr(pdf, "extract_pdf_text_with_pypdf", lambda _path: "")
    monkeypatch.setattr(pdf, "extract_pdf_text_with_ocr", lambda _path: "from-ocr")

    extracted = pdf.extract_pdf_text(Path("/tmp/example.pdf"), ocr_fallback=True)

    assert extracted == "from-ocr"


def test_extract_pdf_text_does_not_use_ocr_without_opt_in(monkeypatch) -> None:
    monkeypatch.setattr(pdf, "extract_pdf_text_with_pypdf", lambda _path: "")
    monkeypatch.setattr(pdf, "extract_pdf_text_with_ocr", lambda _path: "from-ocr")

    extracted = pdf.extract_pdf_text(Path("/tmp/example.pdf"), ocr_fallback=False)

    assert extracted == ""
