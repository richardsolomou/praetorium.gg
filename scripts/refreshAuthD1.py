import os
import sqlite3
import sys
from pathlib import Path


TABLES = ("user", "account", "session", "verification", "twoFactor", "rateLimit")
DELETE_ORDER = ("account", "session", "twoFactor", "user", "verification", "rateLimit")


def load(path: Path) -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.executescript(path.read_text())
    if database.execute("PRAGMA foreign_key_check").fetchone():
        raise ValueError(f"Broken auth export: {path}")
    return database


def refresh_sql(source: sqlite3.Connection, destination: sqlite3.Connection) -> str:
    statements = []
    for table in TABLES:
        source_columns = source.execute(f'PRAGMA table_info("{table}")').fetchall()
        destination_columns = destination.execute(f'PRAGMA table_info("{table}")').fetchall()
        if not source_columns or source_columns != destination_columns:
            raise ValueError(f"Auth schema mismatch in {table}")
    for table in DELETE_ORDER:
        statements.append(f'DELETE FROM "{table}";')
    for table in TABLES:
        columns = [row[1] for row in source.execute(f'PRAGMA table_info("{table}")')]
        names = ", ".join(f'"{column}"' for column in columns)
        for row in source.execute(f'SELECT * FROM "{table}" ORDER BY "id"'):
            values = ", ".join(source.execute("SELECT quote(?)", (value,)).fetchone()[0] for value in row)
            statements.append(f'INSERT INTO "{table}" ({names}) VALUES ({values});')
    return "\n".join(statements) + "\n"


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: refreshAuthD1.py source-export.sql destination-export.sql output.sql")
    source = load(Path(sys.argv[1]))
    destination = load(Path(sys.argv[2]))
    try:
        sql = refresh_sql(source, destination)
        output = Path(sys.argv[3])
        descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as file:
            file.write(sql)
    finally:
        source.close()
        destination.close()


if __name__ == "__main__":
    main()
