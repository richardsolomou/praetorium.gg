import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("verifySpacetimeBackup.sh")


class VerifySpacetimeBackupTest(unittest.TestCase):
    def run_with_destinations(self, destinations: list[dict[str, str]]) -> tuple[subprocess.CompletedProcess[str], list[str]]:
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
            aws.write_text("#!/bin/sh\nprintf 'aws %s\\n' \"$*\" >> \"$CALLS\"\nexit 17\n")
            docker = bin_dir / "docker"
            docker.write_text("#!/bin/sh\nexit 0\n")
            for executable in (curl, aws, docker):
                executable.chmod(0o755)
            result = subprocess.run(
                ["bash", str(SCRIPT)],
                env={
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "CALLS": str(calls),
                    "DESTINATIONS": json.dumps(destinations),
                    "DOKPLOY_URL": "https://dokploy.example",
                    "DOKPLOY_API_KEY": "test-key",
                    "SPACETIME_OWNER_TOKEN": "test-owner",
                },
                capture_output=True,
                text=True,
            )
            return result, calls.read_text().splitlines()

    def test_reads_unified_backup_destination(self) -> None:
        result, calls = self.run_with_destinations(
            [
                {"name": "other", "bucket": "other"},
                {
                    "name": "praetorium R2",
                    "bucket": "praetorium",
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
                    "aws s3api list-objects-v2 --bucket praetorium --prefix spacetimedb-production/backups/data/ --endpoint-url https://"
                    + "a" * 32
                    + ".r2.cloudflarestorage.com --output json",
                ],
            ),
        )

    def test_rejects_ambiguous_backup_destination(self) -> None:
        destination = {"name": "praetorium", "bucket": "praetorium"}
        result, calls = self.run_with_destinations([destination, destination])
        self.assertEqual((result.returncode != 0, calls), (True, ["https://dokploy.example/api/destination.all"]))


if __name__ == "__main__":
    unittest.main()
