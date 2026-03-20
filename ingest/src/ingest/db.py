from collections.abc import Iterator
from contextlib import contextmanager

import psycopg

from .config import Settings


@contextmanager
def connect(settings: Settings) -> Iterator[psycopg.Connection]:
    with psycopg.connect(settings.database_url) as conn:
        yield conn
