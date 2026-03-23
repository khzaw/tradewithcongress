from __future__ import annotations

from ingest.official_photos import (
    LegislatorPhotoRecord,
    parse_legislators_yaml,
    score_legislator_match,
    sync_official_photos,
)


def test_parse_legislators_yaml_extracts_photo_records() -> None:
    payload = """
- id:
    bioguide: P000197
  name:
    first: Nancy
    last: Pelosi
    official_full: Nancy Pelosi
  terms:
  - type: rep
    start: '2025-01-03'
    end: '2027-01-03'
    state: CA
    district: 11
    party: Democrat
"""

    records = parse_legislators_yaml(payload)

    assert records == [
        LegislatorPhotoRecord(
            bioguide_id="P000197",
            chamber="house",
            state_code="CA",
            district_code="11",
            party="Democrat",
            first_name="Nancy",
            middle_name=None,
            nickname=None,
            last_name="Pelosi",
            official_full="Nancy Pelosi",
        )
    ]
    assert records[0].photo_url.endswith("/P000197.jpg")


def test_sync_official_photos_matches_current_house_members(db_conn) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO officials (
                chamber,
                official_type,
                first_name,
                middle_name,
                last_name,
                display_name,
                sort_name,
                state_code,
                district_code,
                party,
                is_current,
                source_ref
            )
            VALUES
                (
                    'house',
                    'member',
                    'Nancy',
                    NULL,
                    'Pelosi',
                    'Nancy Pelosi',
                    'Pelosi, Nancy',
                    'CA',
                    '11',
                    'D',
                    TRUE,
                    'house:ca:11:pelosi:nancy'
                ),
                (
                    'house',
                    'member',
                    'Richard',
                    'W.',
                    'Allen',
                    'Richard W. Allen',
                    'Allen, Richard W.',
                    'GA',
                    '12',
                    'R',
                    TRUE,
                    'house:ga:12:allen:richard:w'
                )
            """
        )

    summary = sync_official_photos(
        db_conn,
        [
            LegislatorPhotoRecord(
                bioguide_id="P000197",
                chamber="house",
                state_code="CA",
                district_code="11",
                party="Democrat",
                first_name="Nancy",
                middle_name=None,
                nickname=None,
                last_name="Pelosi",
                official_full="Nancy Pelosi",
            ),
            LegislatorPhotoRecord(
                bioguide_id="A000376",
                chamber="house",
                state_code="GA",
                district_code="12",
                party="Republican",
                first_name="Rick",
                middle_name="W.",
                nickname=None,
                last_name="Allen",
                official_full="Rick W. Allen",
            ),
        ],
    )

    assert summary.officials_scanned == 2
    assert summary.officials_matched == 2
    assert summary.officials_updated == 2

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT display_name, bioguide_id, photo_url
            FROM officials
            ORDER BY official_id
            """
        )
        rows = cur.fetchall()

    assert rows == [
        (
            "Nancy Pelosi",
            "P000197",
            "https://unitedstates.github.io/images/congress/225x275/P000197.jpg",
        ),
        (
            "Richard W. Allen",
            "A000376",
            "https://unitedstates.github.io/images/congress/225x275/A000376.jpg",
        ),
    ]


def test_score_legislator_match_rejects_same_office_without_name_match(db_conn) -> None:
    legislator = LegislatorPhotoRecord(
        bioguide_id="C001080",
        chamber="house",
        state_code="CA",
        district_code="11",
        party="Democrat",
        first_name="Nancy",
        middle_name=None,
        nickname=None,
        last_name="Pelosi",
        official_full="Nancy Pelosi",
    )

    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO officials (
                chamber,
                official_type,
                first_name,
                last_name,
                display_name,
                sort_name,
                state_code,
                district_code,
                party,
                is_current,
                source_ref
            )
            VALUES (
                'house',
                'member',
                'Alex',
                'Padilla',
                'Alex Padilla',
                'Padilla, Alex',
                'CA',
                '11',
                'D',
                TRUE,
                'house:ca:11:padilla:alex'
            )
            """
        )
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
            WHERE display_name = 'Alex Padilla'
            """
        )
        row = cur.fetchone()

    from ingest.official_photos import OfficialRow

    official = OfficialRow(
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

    assert score_legislator_match(official, legislator) == 0
