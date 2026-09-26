import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("retireDokployRuntime.sh")
SERVICES = {
    "J9LoQVOwq-d_zhYPA-n2H": "app",
    "Ky4kdKp2mpqXuixHNUZUF": "minio",
    "Ww_-3KD0nTcVW4JZMYZ2V": "postgres",
    "O-TY_z-lveUSifVRauDd9": "valkey",
    "6wR9V0cvpq_V_gdnja3CL": "praetorium-pr-606",
    "nLeRLmike4GlmS24JP4o-": "praetorium-pr-599",
    "nbIPYP8N1nWNUeJq8d48M": "praetorium-pr-577",
    "h7SBBRLkCexkFTW4GvrzU": "postgres",
}


class RetireDokployRuntimeTest(unittest.TestCase):
    def run_retirement(self, services: dict[str, str], dry_run: bool = True) -> tuple[subprocess.CompletedProcess[str], list[dict[str, str]]]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / "curl"
            calls = root / "calls.json"
            calls.write_text("[]")
            binary.write_text("""#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
url = args[-1]
calls = pathlib.Path(os.environ['MOCK_CALLS'])
if url.endswith('.one'):
    field, service_id = args[args.index('--data-urlencode') + 1].split('=', 1)
    name = json.loads(os.environ['MOCK_SERVICES'])[service_id]
    stopped = any(service_id in call.values() for call in json.loads(calls.read_text()))
    status = 'idle' if stopped else 'running'
    print(json.dumps({'name': name, 'applicationStatus': status, 'composeStatus': status}))
elif url.endswith('.stop'):
    previous = json.loads(calls.read_text())
    previous.append(json.loads(args[args.index('--data-binary') + 1]))
    calls.write_text(json.dumps(previous))
else:
    sys.exit(1)
""")
            binary.chmod(0o755)
            env = {
                **os.environ,
                "PATH": f"{root}:{os.environ['PATH']}",
                "DOKPLOY_URL": "https://dokploy.example",
                "DOKPLOY_API_KEY": "test-key",
                "DOKPLOY_APPLICATION_ID": "J9LoQVOwq-d_zhYPA-n2H",
                "DRY_RUN": "true" if dry_run else "false",
                "MOCK_SERVICES": json.dumps(services),
                "MOCK_CALLS": str(calls),
            }
            result = subprocess.run(["bash", str(SCRIPT)], env=env, text=True, capture_output=True)
            return result, json.loads(calls.read_text())

    def test_dry_run_includes_all_replaced_services(self) -> None:
        result, calls = self.run_retirement(SERVICES)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(result.stdout.splitlines()), 8)
        self.assertEqual(calls, [])

    def test_service_identity_mismatch_stops_retirement(self) -> None:
        services = SERVICES | {"6wR9V0cvpq_V_gdnja3CL": "spacetimedb"}
        result, calls = self.run_retirement(services)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_retirement_stops_all_replaced_services(self) -> None:
        result, calls = self.run_retirement(SERVICES, dry_run=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 8)


if __name__ == "__main__":
    unittest.main()
