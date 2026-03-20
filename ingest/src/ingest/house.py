from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
import hashlib
from io import BytesIO
from pathlib import Path
import re
from typing import Final
from zipfile import ZipFile
import xml.etree.ElementTree as etree

import httpx
import psycopg
from psycopg.rows import tuple_row
from psycopg.types.json import Jsonb


HOUSE_SOURCE_SYSTEM: Final[str] = "house_clerk"
HOUSE_CHAMBER: Final[str] = "house"
HOUSE_ARCHIVE_URL_TEMPLATE: Final[str] = (
    "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip"
)

REPORT_TYPE_BY_CODE: Final[dict[str, str]] = {
    "C": "candidate_report",
    "P": "periodic_transaction_report",
    "W": "withdrawal_notice",
    "X": "extension_request",
}

PDF_DIRECTORY_BY_CODE: Final[dict[str, str]] = {
    "P": "ptr-pdfs",
}

STATE_DISTRICT_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^(?P<state>[A-Z]{2})(?P<district>\d{2})$"
)
NON_ALNUM_PATTERN: Final[re.Pattern[str]] = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True, slots=True)
class HouseFilingRecord:
    prefix: str | None
    first_name: str
    middle_name: str | None
    last_name: str
    suffix: str | None
    filing_type: str
    state_code: str
    district_code: str
    report_year: int
    filing_date: date
    document_id: str

    @property
    def display_name(self) -> str:
        parts = [self.first_name, self.middle_name, self.last_name, self.suffix]
        return " ".join(part for part in parts if part)

    @property
    def sort_name(self) -> str:
        given_names = " ".join(
            part for part in [self.first_name, self.middle_name] if part
        )
        suffix = f" {self.suffix}" if self.suffix else ""
        return f"{self.last_name}, {given_names}{suffix}"

    @property
    def full_name_with_prefix(self) -> str:
        parts = [self.prefix, self.first_name, self.middle_name, self.last_name, self.suffix]
        return " ".join(part for part in parts if part)

    @property
    def official_type(self) -> str:
        if self.prefix == "Hon.":
            return "member"
        if self.filing_type in {"C", "W"}:
            return "candidate"
        return "other"

    @property
    def is_current(self) -> bool:
        if self.filing_type in {"C", "W"}:
            return False
        return self.prefix == "Hon."

    @property
    def report_type(self) -> str:
        return REPORT_TYPE_BY_CODE.get(self.filing_type, "financial_disclosure_report")

    @property
    def source_ref(self) -> str:
        parts = [
            "house",
            self.state_code.lower(),
            self.district_code.lower(),
            slugify(self.last_name),
            slugify(self.first_name),
        ]
        if self.middle_name:
            parts.append(slugify(self.middle_name))
        if self.suffix:
            parts.append(slugify(self.suffix))
        return ":".join(parts)

    @property
    def pdf_url(self) -> str:
        directory = PDF_DIRECTORY_BY_CODE.get(self.filing_type, "financial-pdfs")
        return (
            "https://disclosures-clerk.house.gov/public_disc/"
            f"{directory}/{self.report_year}/{self.document_id}.pdf"
        )

    @property
    def raw_metadata(self) -> dict[str, object]:
        return {
            "prefix": self.prefix,
            "first_name": self.first_name,
            "middle_name": self.middle_name,
            "last_name": self.last_name,
            "suffix": self.suffix,
            "filing_type_code": self.filing_type,
            "state_code": self.state_code,
            "district_code": self.district_code,
            "report_year": self.report_year,
            "filing_date": self.filing_date.isoformat(),
            "document_id": self.document_id,
            "report_type": self.report_type,
            "pdf_url": self.pdf_url,
        }


@dataclass(frozen=True, slots=True)
class HouseSyncSummary:
    year: int
    records_processed: int
    unique_officials: int
    filings_synced: int
    documents_synced: int
    documents_downloaded: int


@dataclass(frozen=True, slots=True)
class StoredDocument:
    relative_path: str
    sha256: str
    downloaded: bool


def slugify(value: str) -> str:
    return NON_ALNUM_PATTERN.sub("-", value.lower()).strip("-")


def build_house_archive_url(year: int) -> str:
    return HOUSE_ARCHIVE_URL_TEMPLATE.format(year=year)


def fetch_house_archive(
    year: int,
    *,
    timeout: float = 30.0,
    client: httpx.Client | None = None,
) -> bytes:
    if client is not None:
        response = client.get(build_house_archive_url(year))
        response.raise_for_status()
        return response.content

    with httpx.Client(timeout=timeout, follow_redirects=True) as new_client:
        response = new_client.get(build_house_archive_url(year))
        response.raise_for_status()
        return response.content


def fetch_house_document(
    client: httpx.Client, record: HouseFilingRecord
) -> bytes:
    response = client.get(record.pdf_url)
    response.raise_for_status()
    return response.content


def parse_house_archive_zip(data: bytes) -> list[HouseFilingRecord]:
    with ZipFile(BytesIO(data)) as archive:
        try:
            xml_name = next(
                name for name in archive.namelist() if name.lower().endswith("fd.xml")
            )
        except StopIteration as exc:
            raise ValueError("House archive did not contain an XML metadata file") from exc
        return parse_house_archive_xml(archive.read(xml_name))


def parse_house_archive_xml(data: bytes) -> list[HouseFilingRecord]:
    root = etree.fromstring(data.lstrip(b"\xef\xbb\xbf"))
    records: list[HouseFilingRecord] = []
    for member in root.findall("./Member"):
        first_name, middle_name = split_given_names(read_text(member, "First"))
        state_code, district_code = split_state_district(read_text(member, "StateDst"))
        records.append(
            HouseFilingRecord(
                prefix=optional_text(member, "Prefix"),
                first_name=first_name,
                middle_name=middle_name,
                last_name=read_text(member, "Last"),
                suffix=optional_text(member, "Suffix"),
                filing_type=read_text(member, "FilingType"),
                state_code=state_code,
                district_code=district_code,
                report_year=int(read_text(member, "Year")),
                filing_date=datetime.strptime(
                    read_text(member, "FilingDate"), "%m/%d/%Y"
                ).date(),
                document_id=read_text(member, "DocID"),
            )
        )
    return records


def split_given_names(value: str) -> tuple[str, str | None]:
    parts = value.split(maxsplit=1)
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1]


def split_state_district(value: str) -> tuple[str, str]:
    match = STATE_DISTRICT_PATTERN.match(value)
    if match is None:
        raise ValueError(f"Unexpected state/district value: {value!r}")
    return match.group("state"), match.group("district")


def optional_text(parent: etree.Element, tag: str) -> str | None:
    value = read_text(parent, tag, required=False)
    return value or None


def read_text(parent: etree.Element, tag: str, *, required: bool = True) -> str:
    child = parent.find(tag)
    if child is None or child.text is None:
        if required:
            raise ValueError(f"Missing required {tag!r} element")
        return ""
    return child.text.strip()


def sync_house_metadata(
    conn: psycopg.Connection,
    *,
    year: int,
    records: list[HouseFilingRecord],
    synced_at: datetime | None = None,
    document_storage_dir: Path | None = None,
    client: httpx.Client | None = None,
) -> HouseSyncSummary:
    sync_timestamp = synced_at or datetime.now(tz=UTC)
    official_ids: set[int] = set()
    documents_downloaded = 0

    with conn.transaction():
        for record in records:
            official_id = upsert_official(conn, record)
            upsert_official_aliases(conn, official_id, record)
            filing_id = upsert_filing(conn, official_id, record, sync_timestamp)
            document = None
            if document_storage_dir is not None and client is not None:
                document = persist_house_document(record, document_storage_dir, client)
                if document.downloaded:
                    documents_downloaded += 1
            upsert_filing_document(
                conn,
                filing_id,
                record,
                sync_timestamp,
                stored_document=document,
            )
            official_ids.add(official_id)

    return HouseSyncSummary(
        year=year,
        records_processed=len(records),
        unique_officials=len(official_ids),
        filings_synced=len(records),
        documents_synced=len(records),
        documents_downloaded=documents_downloaded,
    )


def persist_house_document(
    record: HouseFilingRecord,
    storage_root: Path,
    client: httpx.Client,
) -> StoredDocument:
    relative_path = Path("house") / str(record.report_year) / f"{record.document_id}.pdf"
    absolute_path = storage_root / relative_path

    if absolute_path.exists():
        payload = absolute_path.read_bytes()
        return StoredDocument(
            relative_path=relative_path.as_posix(),
            sha256=sha256_digest(payload),
            downloaded=False,
        )

    payload = fetch_house_document(client, record)
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = absolute_path.with_suffix(".tmp")
    temporary_path.write_bytes(payload)
    temporary_path.replace(absolute_path)

    return StoredDocument(
        relative_path=relative_path.as_posix(),
        sha256=sha256_digest(payload),
        downloaded=True,
    )


def sha256_digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def upsert_official(conn: psycopg.Connection, record: HouseFilingRecord) -> int:
    with conn.cursor(row_factory=tuple_row) as cur:
        cur.execute(
            """
            INSERT INTO officials (
                chamber,
                official_type,
                first_name,
                middle_name,
                last_name,
                suffix,
                display_name,
                sort_name,
                state_code,
                district_code,
                is_current,
                source_ref
            )
            VALUES (
                %(chamber)s,
                %(official_type)s,
                %(first_name)s,
                %(middle_name)s,
                %(last_name)s,
                %(suffix)s,
                %(display_name)s,
                %(sort_name)s,
                %(state_code)s,
                %(district_code)s,
                %(is_current)s,
                %(source_ref)s
            )
            ON CONFLICT (source_ref) DO UPDATE
            SET
                official_type = EXCLUDED.official_type,
                first_name = EXCLUDED.first_name,
                middle_name = EXCLUDED.middle_name,
                last_name = EXCLUDED.last_name,
                suffix = EXCLUDED.suffix,
                display_name = EXCLUDED.display_name,
                sort_name = EXCLUDED.sort_name,
                state_code = EXCLUDED.state_code,
                district_code = EXCLUDED.district_code,
                is_current = EXCLUDED.is_current,
                updated_at = now()
            RETURNING official_id
            """,
            {
                "chamber": HOUSE_CHAMBER,
                "official_type": record.official_type,
                "first_name": record.first_name,
                "middle_name": record.middle_name,
                "last_name": record.last_name,
                "suffix": record.suffix,
                "display_name": record.display_name,
                "sort_name": record.sort_name,
                "state_code": record.state_code,
                "district_code": record.district_code,
                "is_current": record.is_current,
                "source_ref": record.source_ref,
            },
        )
        official_id, = cur.fetchone()
    return official_id


def upsert_official_aliases(
    conn: psycopg.Connection, official_id: int, record: HouseFilingRecord
) -> None:
    aliases = [
        (record.display_name, "display"),
        (record.sort_name, "search"),
    ]
    if record.full_name_with_prefix != record.display_name:
        aliases.append((record.full_name_with_prefix, "source"))

    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO official_aliases (official_id, alias, alias_kind)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            [(official_id, alias, alias_kind) for alias, alias_kind in aliases],
        )


def upsert_filing(
    conn: psycopg.Connection,
    official_id: int,
    record: HouseFilingRecord,
    sync_timestamp: datetime,
) -> int:
    raw_metadata = build_sync_metadata(record, sync_timestamp)

    with conn.cursor(row_factory=tuple_row) as cur:
        cur.execute(
            """
            INSERT INTO filings (
                official_id,
                source_system,
                external_filing_id,
                chamber,
                report_type,
                filer_display_name,
                filing_date,
                filing_timestamp,
                report_year,
                transaction_count,
                is_amendment,
                source_url,
                raw_metadata
            )
            VALUES (
                %(official_id)s,
                %(source_system)s,
                %(external_filing_id)s,
                %(chamber)s,
                %(report_type)s,
                %(filer_display_name)s,
                %(filing_date)s,
                %(filing_timestamp)s,
                %(report_year)s,
                0,
                FALSE,
                %(source_url)s,
                %(raw_metadata)s
            )
            ON CONFLICT (source_system, external_filing_id) DO UPDATE
            SET
                official_id = EXCLUDED.official_id,
                report_type = EXCLUDED.report_type,
                filer_display_name = EXCLUDED.filer_display_name,
                filing_date = EXCLUDED.filing_date,
                filing_timestamp = EXCLUDED.filing_timestamp,
                report_year = EXCLUDED.report_year,
                source_url = EXCLUDED.source_url,
                raw_metadata = EXCLUDED.raw_metadata,
                updated_at = now()
            RETURNING filing_id
            """,
            {
                "official_id": official_id,
                "source_system": HOUSE_SOURCE_SYSTEM,
                "external_filing_id": record.document_id,
                "chamber": HOUSE_CHAMBER,
                "report_type": record.report_type,
                "filer_display_name": record.display_name,
                "filing_date": record.filing_date,
                "filing_timestamp": sync_timestamp,
                "report_year": record.report_year,
                "source_url": record.pdf_url,
                "raw_metadata": Jsonb(raw_metadata),
            },
        )
        filing_id, = cur.fetchone()
    return filing_id


def upsert_filing_document(
    conn: psycopg.Connection,
    filing_id: int,
    record: HouseFilingRecord,
    sync_timestamp: datetime,
    *,
    stored_document: StoredDocument | None,
) -> None:
    raw_metadata = build_sync_metadata(record, sync_timestamp)
    storage_path = None
    sha256 = None
    if stored_document is not None:
        storage_path = stored_document.relative_path
        sha256 = stored_document.sha256

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO filing_documents (
                filing_id,
                document_type,
                source_url,
                mime_type,
                storage_path,
                sha256,
                fetched_at,
                parse_status,
                raw_metadata
            )
            VALUES (
                %(filing_id)s,
                'pdf',
                %(source_url)s,
                'application/pdf',
                %(storage_path)s,
                %(sha256)s,
                %(fetched_at)s,
                'pending',
                %(raw_metadata)s
            )
            ON CONFLICT (filing_id, document_type, source_url) DO UPDATE
            SET
                storage_path = EXCLUDED.storage_path,
                sha256 = EXCLUDED.sha256,
                fetched_at = EXCLUDED.fetched_at,
                raw_metadata = EXCLUDED.raw_metadata
            """,
            {
                "filing_id": filing_id,
                "source_url": record.pdf_url,
                "storage_path": storage_path,
                "sha256": sha256,
                "fetched_at": sync_timestamp,
                "raw_metadata": Jsonb(raw_metadata),
            },
        )


def build_sync_metadata(
    record: HouseFilingRecord, sync_timestamp: datetime
) -> dict[str, object]:
    return {
        **record.raw_metadata,
        "archive_url": build_house_archive_url(record.report_year),
        "synced_at": sync_timestamp.isoformat(),
    }
