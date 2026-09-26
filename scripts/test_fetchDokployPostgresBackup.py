import gzip
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("fetchDokployPostgresBackup.sh")
OLD = "2026-09-25T01-02-03-000Z.sql.gz"
NEW = "2026-09-26T01-02-03-000Z.sql.gz"
PREFIX = "postgres-app/production/postgres/"


class FetchDokployPostgresBackupTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        (self.bin / "curl").write_text("""#!/usr/bin/env python3
import json, os, pathlib, sys
url = sys.argv[-1]
if url.endswith('/api/postgres.one'):
    print(json.dumps({'postgresId': 'pg', 'name': 'postgres', 'appName': 'postgres-app', 'backups': [
        {'enabled': True, 'databaseType': 'postgres', 'database': 'postgres',
         'prefix': 'production/postgres', 'backupId': 'backup', 'destinationId': 'destination'}]}))
elif url.endswith('/api/destination.one'):
    print(json.dumps({'bucket': 'praetorium-backups', 'endpoint': 'https://' + 'a' * 32 + '.r2.cloudflarestorage.com',
                      'accessKey': 'private-access', 'secretAccessKey': 'private-secret', 'region': 'auto'}))
elif url.endswith('/api/backup.manualBackupPostgres'):
    pathlib.Path(os.environ['MOCK_BACKUP_MARKER']).touch()
else:
    sys.exit(1)
""")
        (self.bin / "aws").write_text(f"""#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
if args[:2] == ['s3api', 'list-objects-v2']:
    keys = ['{PREFIX}{OLD}']
    if pathlib.Path(os.environ['MOCK_BACKUP_MARKER']).exists() and os.environ.get('MOCK_NEW_BACKUP') == 'true':
        keys.append('{PREFIX}{NEW}')
    print(json.dumps({{'Contents': [{{'Key': key}} for key in keys]}}))
elif args[:2] == ['s3', 'cp']:
    pathlib.Path(args[3]).write_bytes(pathlib.Path(os.environ['MOCK_BACKUP_GZIP']).read_bytes())
else:
    sys.exit(1)
""")
        (self.bin / "docker").write_text("#!/usr/bin/env bash\ncat > /dev/null\n")
        for binary in self.bin.iterdir():
            binary.chmod(0o755)
        archive = self.root / "archive.gz"
        archive.write_bytes(gzip.compress(b"PGDMP"))
        self.env = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "DOKPLOY_URL": "https://dokploy.example",
            "DOKPLOY_API_KEY": "private-key",
            "DOKPLOY_POSTGRES_ID": "pg",
            "BACKUP_OUTPUT": str(self.root / "result.gz"),
            "MOCK_BACKUP_MARKER": str(self.root / "manual"),
            "MOCK_BACKUP_GZIP": str(archive),
            "MOCK_NEW_BACKUP": "true",
            "RUN_MANUAL_BACKUP": "true",
        }

    def test_selects_new_backup_after_manual_run(self) -> None:
        result = subprocess.run(["bash", str(SCRIPT)], env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(NEW, result.stdout)
        self.assertNotIn("private-", result.stdout + result.stderr)

    def test_rejects_old_backup_when_manual_run_produces_no_object(self) -> None:
        result = subprocess.run(
            ["bash", str(SCRIPT)], env={**self.env, "MOCK_NEW_BACKUP": "false"}, text=True, capture_output=True
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "result.gz").exists())

    def test_after_gate_rejects_stale_read_only_backup(self) -> None:
        result = subprocess.run(
            ["bash", str(SCRIPT)],
            env={**self.env, "RUN_MANUAL_BACKUP": "false", "BACKUP_AFTER": OLD},
            text=True,
            capture_output=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "result.gz").exists())


if __name__ == "__main__":
    unittest.main()
