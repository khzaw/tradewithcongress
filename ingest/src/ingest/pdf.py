from __future__ import annotations

from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from pypdf import PdfReader


CONTROL_CHARACTERS = {character for character in map(chr, range(32)) if character != "\n"}
CONTROL_TRANSLATION = str.maketrans("", "", "".join(CONTROL_CHARACTERS))
WHITESPACE_PATTERN = re.compile(r"\s+")


def extract_pdf_text(path: Path, *, ocr_fallback: bool = False) -> str:
    text = extract_pdf_text_with_pypdf(path)
    if text or not ocr_fallback:
        return text

    return extract_pdf_text_with_ocr(path)


def extract_pdf_text_with_pypdf(path: Path) -> str:
    reader = PdfReader(path)
    extracted_pages = [page.extract_text() or "" for page in reader.pages]
    return normalize_pdf_text("\n".join(extracted_pages))


def extract_pdf_text_with_ocr(path: Path) -> str:
    if not ocr_is_available():
        return ""

    with tempfile.TemporaryDirectory(prefix="tradewithcongress-ocr-") as temp_dir:
        temp_path = Path(temp_dir)
        image_prefix = temp_path / "page"
        subprocess.run(
            [
                "pdftoppm",
                "-r",
                "200",
                "-png",
                str(path),
                str(image_prefix),
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        extracted_pages: list[str] = []
        for image_path in sorted(temp_path.glob("page-*.png")):
            result = subprocess.run(
                [
                    "tesseract",
                    str(image_path),
                    "stdout",
                    "--psm",
                    "6",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            extracted_pages.append(result.stdout)

    return normalize_pdf_text("\n".join(extracted_pages))


def ocr_is_available() -> bool:
    return shutil.which("pdftoppm") is not None and shutil.which("tesseract") is not None


def normalize_pdf_text(text: str) -> str:
    cleaned = text.translate(CONTROL_TRANSLATION).replace("\xa0", " ")
    normalized_lines = [
        WHITESPACE_PATTERN.sub(" ", line).strip()
        for line in cleaned.splitlines()
    ]
    return "\n".join(line for line in normalized_lines if line)
