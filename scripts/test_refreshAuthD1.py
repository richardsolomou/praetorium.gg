import sqlite3
import unittest

from refreshAuthD1 import refresh_sql


SCHEMA = """
CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE "account" (id TEXT PRIMARY KEY, userId TEXT REFERENCES "user"(id));
CREATE TABLE "session" (id TEXT PRIMARY KEY, userId TEXT REFERENCES "user"(id));
CREATE TABLE "verification" (id TEXT PRIMARY KEY, value TEXT);
CREATE TABLE "twoFactor" (id TEXT PRIMARY KEY, userId TEXT REFERENCES "user"(id));
CREATE TABLE "rateLimit" (id TEXT PRIMARY KEY, key TEXT);
CREATE TABLE "jwks" (id TEXT PRIMARY KEY, privateKey TEXT);
"""


class RefreshAuthD1Test(unittest.TestCase):
    def database(self, seed: str) -> sqlite3.Connection:
        connection = sqlite3.connect(":memory:")
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(SCHEMA + seed)
        return connection

    def test_replaces_changed_rows_and_preserves_signing_key(self) -> None:
        source = self.database("""
            INSERT INTO "user" VALUES ('u1', 'new name');
            INSERT INTO "session" VALUES ('s1', 'u1');
            INSERT INTO "jwks" VALUES ('source', 'source secret');
        """)
        destination = self.database("""
            INSERT INTO "user" VALUES ('u1', 'old name');
            INSERT INTO "user" VALUES ('obsolete', 'old');
            INSERT INTO "session" VALUES ('stale', 'obsolete');
            INSERT INTO "jwks" VALUES ('destination', 'destination secret');
        """)
        destination.executescript(refresh_sql(source, destination))
        self.assertEqual(destination.execute('SELECT * FROM "user"').fetchall(), [('u1', 'new name')])
        self.assertEqual(destination.execute('SELECT * FROM "session"').fetchall(), [('s1', 'u1')])
        self.assertEqual(destination.execute('SELECT * FROM "jwks"').fetchall(), [('destination', 'destination secret')])
        self.assertEqual(destination.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_rejects_schema_drift_before_writing(self) -> None:
        source = self.database("")
        destination = self.database("")
        destination.execute('ALTER TABLE "user" ADD COLUMN extra TEXT')
        with self.assertRaisesRegex(ValueError, "Auth schema mismatch in user"):
            refresh_sql(source, destination)


if __name__ == "__main__":
    unittest.main()
