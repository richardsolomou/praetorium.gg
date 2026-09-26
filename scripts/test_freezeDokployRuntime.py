import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("freezeDokployRuntime.sh")


class FreezeDokployRuntimeTest(unittest.TestCase):
    def run_freeze(self, service_id: str) -> tuple[subprocess.CompletedProcess[str], bool]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "stopped"
            binary = root / "curl"
            binary.write_text("""#!/usr/bin/env python3
import json, os, pathlib, sys
url = sys.argv[-1]
marker = pathlib.Path(os.environ['MOCK_STOPPED'])
if url.endswith('/api/application.one'):
    print(json.dumps({'applicationId': os.environ['MOCK_SERVICE_ID'], 'name': 'app',
                      'applicationStatus': 'idle' if marker.exists() else 'done'}))
elif url.endswith('/api/application.stop'):
    marker.touch()
else:
    sys.exit(1)
""")
            binary.chmod(0o755)
            env = {
                **os.environ,
                "PATH": f"{root}:{os.environ['PATH']}",
                "DOKPLOY_URL": "https://dokploy.example",
                "DOKPLOY_API_KEY": "private-key",
                "DOKPLOY_APPLICATION_ID": "app-id",
                "MOCK_SERVICE_ID": service_id,
                "MOCK_STOPPED": str(marker),
            }
            result = subprocess.run(["bash", str(SCRIPT)], env=env, text=True, capture_output=True)
            return result, marker.exists()

    def test_stops_running_application_and_confirms_idle(self) -> None:
        result, stopped = self.run_freeze("app-id")
        self.assertEqual((result.returncode, stopped), (0, True), result.stderr)

    def test_rejects_wrong_application_before_stopping(self) -> None:
        result, stopped = self.run_freeze("another-app")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(stopped)


if __name__ == "__main__":
    unittest.main()
