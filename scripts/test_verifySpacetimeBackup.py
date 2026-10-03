import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("verifySpacetimeBackup.sh")


class VerifySpacetimeBackupTest(unittest.TestCase):
    def run_with_destinations(
        self, destinations: list[dict[str, str]], manifest=None, corrupt=False
    ) -> tuple[subprocess.CompletedProcess[str], list[str]]:
        with tempfile.TemporaryDirectory() as directory:
            bin_dir = Path(directory)
            calls = bin_dir / "calls"
            curl = bin_dir / "curl"
            curl.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "from pathlib import Path\n"
                "url = sys.argv[-1]\n"
                "with Path(os.environ['CALLS']).open('a') as log: log.write(url + '\\n')\n"
                "if url.endswith('/api/destination.all'):\n"
                " print(os.environ['DESTINATIONS'])\n"
                "elif url.endswith('/api/application.one'):\n"
                " print(json.dumps({'applicationId': '-Su13uDBf96psvGEiBula', 'name': 'spacetimedb-production', 'appName': 'spacetimedb-production'}))\n"
                "else: sys.exit(18)\n"
            )
            aws = bin_dir / "aws"
            aws.write_text(
                "#!/usr/bin/env python3\n"
                "import os, sys\n"
                "from pathlib import Path\n"
                "args = ['<manifest>' if not a.startswith('s3://') and a.endswith('/latest.json') else a for a in sys.argv[1:]]\n"
                "with Path(os.environ['CALLS']).open('a') as log: log.write('aws ' + ' '.join(args) + '\\n')\n"
                "if not os.environ['MANIFEST']: sys.exit(17)\n"
                "target = Path(sys.argv[4])\n"
                "target.write_text(os.environ['MANIFEST']) if target.name == 'latest.json' else target.write_bytes(b'corrupt' if os.environ['CORRUPT'] == '1' else b'archive')\n"
            )
            docker = bin_dir / "docker"
            docker.write_text(
                '#!/bin/sh\nif [ "$1" = run ]; then echo restore-started >&2; exit 19; fi\nexit 0\n'
            )
            tar = bin_dir / "tar"
            tar.write_text(
                '#!/bin/sh\nwhile [ "$1" != -C ]; do shift; done\nshift\ntouch "$1/metadata.toml"\necho key > "$1/id_ecdsa"\necho key > "$1/id_ecdsa.pub"\necho data > "$1/metadata.toml"\n'
            )
            for executable in (curl, aws, docker, tar):
                executable.chmod(0o755)
            result = subprocess.run(
                ["bash", str(SCRIPT)],
                env={
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "CALLS": str(calls),
                    "DESTINATIONS": json.dumps(destinations),
                    "MANIFEST": json.dumps(manifest) if manifest is not None else "",
                    "CORRUPT": "1" if corrupt else "0",
                    "DOKPLOY_URL": "https://dokploy.example",
                    "DOKPLOY_API_KEY": "test-key",
                    "SPACETIME_OWNER_TOKEN": "test-owner",
                },
                capture_output=True,
                text=True,
            )
            return result, calls.read_text().splitlines()

    def test_reads_private_backup_destination(self) -> None:
        result, calls = self.run_with_destinations(
            [
                {"name": "other", "bucket": "other"},
                {
                    "name": "praetorium private R2",
                    "bucket": "praetorium-private",
                    "endpoint": "https://" + "a" * 32 + ".r2.cloudflarestorage.com",
                    "accessKey": "test-access",
                    "secretAccessKey": "test-secret",
                    "region": "us-east-1",
                },
            ]
        )
        self.assertEqual(
            (result.returncode != 0, calls),
            (
                True,
                [
                    "https://dokploy.example/api/destination.all",
                    "https://dokploy.example/api/application.one",
                    "aws s3 cp s3://praetorium-private/spacetimedb-production/backups/latest.json <manifest> --endpoint-url https://"
                    + "a" * 32
                    + ".r2.cloudflarestorage.com --only-show-errors",
                ],
            ),
        )

    def test_rejects_ambiguous_backup_destination(self) -> None:
        destination = {"name": "praetorium private", "bucket": "praetorium-private"}
        result, calls = self.run_with_destinations([destination, destination])
        self.assertEqual(
            (result.returncode != 0, calls),
            (True, ["https://dokploy.example/api/destination.all"]),
        )

    def manifest(self):
        stamp = (
            datetime.datetime.now(datetime.timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
        return {
            "format": "praetorium.spacetime-backup.v1",
            "createdAt": stamp,
            **{
                kind: {
                    "key": f"spacetimedb-production/backups/{kind}/praetorium-spacetime-production-{kind}-{stamp.replace(':', '-').replace('.', '-')}.tar",
                    "sha256": hashlib.sha256(b"archive").hexdigest(),
                }
                for kind in ("data", "identity")
            },
        }

    def verify_manifest(self, manifest, corrupt=False):
        return self.run_with_destinations(
            [
                {
                    "bucket": "praetorium-private",
                    "endpoint": "https://" + "a" * 32 + ".r2.cloudflarestorage.com",
                    "accessKey": "test-access",
                    "secretAccessKey": "test-secret",
                    "region": "us-east-1",
                }
            ],
            manifest,
            corrupt,
        )[0]

    def test_fresh_verified_pair_reaches_restore(self):
        self.assertIn("restore-started", self.verify_manifest(self.manifest()).stderr)

    def test_stale_manifest_does_not_download_archives(self):
        manifest = self.manifest()
        manifest["createdAt"] = "2020-01-01T00:00:00Z"
        self.assertIn("older than 12 hours", self.verify_manifest(manifest).stderr)

    def test_foreign_archive_key_is_rejected_before_restore(self):
        manifest = self.manifest()
        manifest["data"]["key"] = "other-service/backups/data/archive.tar"
        self.assertNotIn("restore-started", self.verify_manifest(manifest).stderr)

    def test_corrupt_archive_is_rejected_before_restore(self):
        self.assertNotIn(
            "restore-started",
            self.verify_manifest(self.manifest(), corrupt=True).stderr,
        )


if __name__ == "__main__":
    unittest.main()
