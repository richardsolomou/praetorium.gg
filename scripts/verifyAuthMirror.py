import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path


def load(sql: str, schema: str = "") -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.executescript(schema)
    database.executescript(sql)
    if database.execute("PRAGMA foreign_key_check").fetchone():
        raise ValueError("Auth export violates a foreign key")
    return database


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: verifyAuthMirror.py schema.sql auth.sql d1-export.sql")
    schema, source, remote = (Path(name).read_text() for name in sys.argv[1:])
    expected = load(source, schema)
    actual = load(remote)
    counts = {}
    for table in ("user", "account", "session", "verification", "twoFactor", "rateLimit", "jwks"):
        query = f'SELECT * FROM "{table}"'
        left = Counter(expected.execute(query).fetchall())
        right = Counter(actual.execute(query).fetchall())
        if left != right:
            raise ValueError(f"D1 auth import mismatch in {table}")
        counts[table] = sum(left.values())
    print(json.dumps(counts, sort_keys=True))


if __name__ == "__main__":
    main()
