import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("restartDokployBeforeCloudflare.sh")


class RestartDokployBeforeCloudflareTest(unittest.TestCase):
    def run_restart(self, cloudflare: bool) -> tuple[subprocess.CompletedProcess[str], str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / "curl"
            calls = root / "calls"
            binary.write_text("""#!/usr/bin/env python3
import os, pathlib, sys
args = sys.argv[1:]
url = args[-1]
if url.endswith('/api/health'):
    pathlib.Path(args[args.index('--dump-header') + 1]).write_text(os.environ['MOCK_HEALTH'])
elif url.endswith('/api/application.one'):
    pathlib.Path(os.environ['MOCK_CALLS']).write_text('one')
    print('{"applicationId":"test-app","name":"app","applicationStatus":"idle"}')
elif url.endswith('/api/application.start'):
    pathlib.Path(os.environ['MOCK_CALLS']).write_text('start')
else:
    sys.exit(1)
""")
            binary.chmod(0o755)
            env = {
                **os.environ,
                "PATH": f"{root}:{os.environ['PATH']}",
                "DOKPLOY_URL": "https://dokploy.example.test",
                "DOKPLOY_API_KEY": "test-key",
                "DOKPLOY_APPLICATION_ID": "test-app",
                "MOCK_CALLS": str(calls),
                "MOCK_HEALTH": "HTTP/2 200\r\nx-praetorium-runtime: cloudflare\r\n" if cloudflare else "HTTP/2 200\r\n",
            }
            result = subprocess.run(["bash", str(SCRIPT)], env=env, text=True, capture_output=True)
            return result, calls.read_text() if calls.exists() else ""

    def test_live_worker_does_not_restart_old_app(self) -> None:
        result, calls = self.run_restart(True)
        self.assertEqual((result.returncode, calls), (0, ""), result.stderr)

    def test_pre_route_failure_restarts_old_app(self) -> None:
        result, calls = self.run_restart(False)
        self.assertEqual((result.returncode, calls), (0, "start"), result.stderr)


if __name__ == "__main__":
    unittest.main()
