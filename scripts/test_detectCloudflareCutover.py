import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("detectCloudflareCutover.sh")
ROUTES = ("praetorium.gg/*", "s3.praetorium.gg/*", "catalogue.praetorium.gg/*")


class DetectCloudflareCutoverTest(unittest.TestCase):
    def run_detection(self, routes: list[dict[str, str]], runtime: bool) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / "curl"
            binary.write_text("""#!/usr/bin/env python3
import os, pathlib, sys
args = sys.argv[1:]
url = args[-1]
if url.endswith('/zones?name=praetorium.gg'):
    print(os.environ['MOCK_ZONES'])
elif '/workers/routes?' in url:
    print(os.environ['MOCK_ROUTES'])
elif url.endswith('/api/health'):
    path = pathlib.Path(args[args.index('--dump-header') + 1])
    path.write_text(os.environ['MOCK_HEALTH'])
else:
    sys.exit(1)
""")
            binary.chmod(0o755)
            env = {
                **os.environ,
                "PATH": f"{root}:{os.environ['PATH']}",
                "CLOUDFLARE_API_TOKEN": "test-token",
                "MOCK_ZONES": json.dumps({"result": [{"id": "a" * 32}]}),
                "MOCK_ROUTES": json.dumps({"success": True, "result_info": {"total_pages": 1}, "result": routes}),
                "MOCK_HEALTH": "HTTP/2 200\r\nx-praetorium-runtime: cloudflare\r\n" if runtime else "HTTP/2 200\r\n",
            }
            return subprocess.run(["bash", str(SCRIPT)], env=env, text=True, capture_output=True)

    def test_first_cutover_has_no_routes(self) -> None:
        result = self.run_detection([], False)
        self.assertEqual((result.returncode, result.stdout.strip()), (0, "needed=true"), result.stderr)

    def test_subsequent_release_preserves_live_data(self) -> None:
        result = self.run_detection([{"pattern": pattern, "script": "praetorium-production"} for pattern in ROUTES], True)
        self.assertEqual((result.returncode, result.stdout.strip()), (0, "needed=false"), result.stderr)

    def test_partial_route_never_reimports_old_data(self) -> None:
        result = self.run_detection([{"pattern": ROUTES[0], "script": "praetorium-production"}], False)
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
