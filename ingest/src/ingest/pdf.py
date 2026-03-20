from __future__ import annotations

from pathlib import Path
import re

from pypdf import PdfReader


CONTROL_CHARACTERS = {character for character in map(chr, range(32)) if character != "\n"}
CONTROL_TRANSLATION = str.maketrans("", "", "".join(CONTROL_CHARACTERS))
WHITESPACE_PATTERN = re.compile(r"\s+")


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(path)
    extracted_pages = [page.extract_text() or "" for page in reader.pages]
    return normalize_pdf_text("\n".join(extracted_pages))


def normalize_pdf_text(text: str) -> str:
    cleaned = text.translate(CONTROL_TRANSLATION).replace("\xa0", " ")
    normalized_lines = [
        WHITESPACE_PATTERN.sub(" ", line).strip()
        for line in cleaned.splitlines()
    ]
    return "\n".join(line for line in normalized_lines if line)
