from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import re
from typing import Any

import httpx
import psycopg
import yaml


LEGISLATORS_CURRENT_URL = (
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/"
    "legislators-current.yaml"
)
LEGISLATORS_HISTORICAL_URL = (
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/"
    "legislators-historical.yaml"
)
PHOTO_URL_TEMPLATE = "https://unitedstates.github.io/images/congress/225x275/{bioguide_id}.jpg"
NON_ALNUM_PATTERN = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True, slots=True)
class LegislatorPhotoRecord:
    bioguide_id: str
    chamber: str
    state_code: str | None
    district_code: str | None
    party: str | None
    first_name: str
    middle_name: str | None
    nickname: str | None
    last_name: str
    official_full: str | None

    @property
    def photo_url(self) -> str:
        return PHOTO_URL_TEMPLATE.format(bioguide_id=self.bioguide_id)


@dataclass(frozen=True, slots=True)
class OfficialPhotoSyncSummary:
    officials_scanned: int
    officials_matched: int
    officials_updated: int


@dataclass(frozen=True, slots=True)
class OfficialRow:
    official_id: int
    chamber: str
    first_name: str
    middle_name: str | None
    last_name: str
    state_code: str | None
    district_code: str | None
    party: str | None
    bioguide_id: str | None
    photo_url: str | None


def fetch_legislator_photo_records(
    client: httpx.Client,
    *,
    include_historical: bool = True,
) -> list[LegislatorPhotoRecord]:
    urls = [LEGISLATORS_CURRENT_URL]
    if include_historical:
        urls.append(LEGISLATORS_HISTORICAL_URL)

    records: dict[str, LegislatorPhotoRecord] = {}
    for url in urls:
        response = client.get(url)
        response.raise_for_status()
        for legislator in parse_legislators_yaml(response.text):
            records.setdefault(legislator.bioguide_id, legislator)

    return list(records.values())


def parse_legislators_yaml(payload: str) -> list[LegislatorPhotoRecord]:
    loaded = yaml.safe_load(payload)
    if not isinstance(loaded, list):
        raise ValueError("Expected legislators YAML to contain a list")

    records: list[LegislatorPhotoRecord] = []
    for item in loaded:
        if not isinstance(item, dict):
            continue

        legislator = parse_legislator_record(item)
        if legislator is not None:
            records.append(legislator)

    return records


def parse_legislator_record(payload: dict[str, Any]) -> LegislatorPhotoRecord | None:
    identifiers = payload.get("id")
    name = payload.get("name")
    terms = payload.get("terms")
    if not isinstance(identifiers, dict) or not isinstance(name, dict) or not isinstance(terms, list):
        return None

    bioguide_id = identifiers.get("bioguide")
    if not isinstance(bioguide_id, str) or bioguide_id == "":
        return None

    latest_term = select_latest_term(terms)
    if latest_term is None:
        return None

    chamber = map_term_type_to_chamber(latest_term.get("type"))
    if chamber is None:
        return None

    state_code = read_optional_string(latest_term.get("state"))
    district_value = latest_term.get("district")
    district_code = None if district_value is None else str(district_value).zfill(2)
    party = read_optional_string(latest_term.get("party"))

    first_name = read_optional_string(name.get("first"))
    last_name = read_optional_string(name.get("last"))
    if first_name is None or last_name is None:
        return None

    return LegislatorPhotoRecord(
        bioguide_id=bioguide_id,
        chamber=chamber,
        state_code=state_code,
        district_code=district_code,
        party=party,
        first_name=first_name,
        middle_name=read_optional_string(name.get("middle")),
        nickname=read_optional_string(name.get("nickname")),
        last_name=last_name,
        official_full=read_optional_string(name.get("official_full")),
    )


def select_latest_term(terms: list[Any]) -> dict[str, Any] | None:
    parsed_terms = [term for term in terms if isinstance(term, dict)]
    if not parsed_terms:
        return None

    return max(
        parsed_terms,
        key=lambda term: parse_term_date(read_optional_string(term.get("end"))),
    )


def parse_term_date(value: str | None) -> date:
    if value is None:
        return date.min
    return date.fromisoformat(value)


def map_term_type_to_chamber(value: Any) -> str | None:
    if value == "rep":
        return "house"
    if value == "sen":
        return "senate"
    return None


def read_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def sync_official_photos(
    conn: psycopg.Connection,
    legislators: list[LegislatorPhotoRecord],
) -> OfficialPhotoSyncSummary:
    officials = load_official_rows(conn)
    matched = 0
    updated = 0

    with conn.transaction():
        for official in officials:
            legislator = find_matching_legislator(official, legislators)
            if legislator is None:
                continue

            matched += 1
            if (
                official.bioguide_id == legislator.bioguide_id
                and official.photo_url == legislator.photo_url
            ):
                continue

            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE officials
                    SET bioguide_id = %s,
                        photo_url = %s,
                        updated_at = now()
                    WHERE official_id = %s
                    """,
                    (legislator.bioguide_id, legislator.photo_url, official.official_id),
                )
            updated += 1

    return OfficialPhotoSyncSummary(
        officials_scanned=len(officials),
        officials_matched=matched,
        officials_updated=updated,
    )


def load_official_rows(conn: psycopg.Connection) -> list[OfficialRow]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                official_id,
                chamber,
                first_name,
                middle_name,
                last_name,
                state_code,
                district_code,
                party,
                bioguide_id,
                photo_url
            FROM officials
            ORDER BY official_id
            """
        )

        return [
            OfficialRow(
                official_id=row[0],
                chamber=row[1],
                first_name=row[2],
                middle_name=row[3],
                last_name=row[4],
                state_code=row[5],
                district_code=row[6],
                party=row[7],
                bioguide_id=row[8],
                photo_url=row[9],
            )
            for row in cur.fetchall()
        ]


def find_matching_legislator(
    official: OfficialRow,
    legislators: list[LegislatorPhotoRecord],
) -> LegislatorPhotoRecord | None:
    scored_matches: list[tuple[int, LegislatorPhotoRecord]] = []
    for legislator in legislators:
        score = score_legislator_match(official, legislator)
        if score > 0:
            scored_matches.append((score, legislator))

    if not scored_matches:
        return None

    scored_matches.sort(
        key=lambda item: (item[0], item[1].bioguide_id),
        reverse=True,
    )
    if len(scored_matches) > 1 and scored_matches[0][0] == scored_matches[1][0]:
        return None

    return scored_matches[0][1]


def score_legislator_match(
    official: OfficialRow,
    legislator: LegislatorPhotoRecord,
) -> int:
    if official.chamber != legislator.chamber:
        return 0

    if official.state_code is None or official.state_code != legislator.state_code:
        return 0

    if official.chamber == "house" and official.district_code != legislator.district_code:
        return 0

    if normalize_token(official.last_name) != normalize_token(legislator.last_name):
        return 0

    if not given_name_matches(official, legislator):
        return 0

    score = 100
    if normalize_compound_name(official.first_name, official.middle_name) == normalize_compound_name(
        legislator.first_name,
        legislator.middle_name,
    ):
        score += 10

    if normalize_party(official.party) != "" and normalize_party(official.party) == normalize_party(
        legislator.party
    ):
        score += 2

    return score


def given_name_matches(official: OfficialRow, legislator: LegislatorPhotoRecord) -> bool:
    official_tokens = build_name_tokens(official.first_name, official.middle_name)
    legislator_tokens = build_name_tokens(
        legislator.first_name,
        legislator.middle_name,
        legislator.nickname,
    )

    if official_tokens["words"] & legislator_tokens["words"]:
        return True

    if official_tokens["words"] & legislator_tokens["initial_words"]:
        return True

    if official_tokens["initial_words"] & legislator_tokens["words"]:
        return True

    return bool(official_tokens["initials"] & legislator_tokens["initials"])


def build_name_tokens(*values: str | None) -> dict[str, set[str]]:
    words: set[str] = set()
    initial_words: set[str] = set()
    initials: set[str] = set()

    for value in values:
        if value is None:
            continue

        for raw_part in value.split():
            normalized = normalize_token(raw_part)
            if normalized == "":
                continue
            initials.add(normalized[0])
            if len(normalized) == 1:
                initial_words.add(normalized)
            else:
                words.add(normalized)

    return {
        "words": words,
        "initial_words": initial_words,
        "initials": initials,
    }


def normalize_compound_name(*values: str | None) -> str:
    return " ".join(part for part in (normalize_token(value) for value in values) if part)


def normalize_token(value: str | None) -> str:
    if value is None:
        return ""
    return NON_ALNUM_PATTERN.sub("", value.lower())


def normalize_party(value: str | None) -> str:
    normalized = normalize_token(value)
    if normalized.startswith("democrat"):
        return "d"
    if normalized.startswith("republican"):
        return "r"
    if normalized.startswith("independent"):
        return "i"
    return normalized[:1]
