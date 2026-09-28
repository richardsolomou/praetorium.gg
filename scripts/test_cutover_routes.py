import json
import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
REVISION = "a" * 40


class CutoverRoutesTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = pathlib.Path(self.directory.name)
        self.state = self.path / "state.json"
        self.state.write_text(json.dumps({"route": "praetorium-production", "dns": [{"id": "apex", "name": "praetorium.gg", "type": "A", "content": "192.0.2.1", "proxied": True}], "domain": True, "checks": 0, "nodeHealthy": True}))
        curl = self.path / "curl"
        curl.write_text(
            """#!/usr/bin/env python3
import json, os, pathlib, sys, urllib.parse
args = sys.argv[1:]
url = args[-1]
method = args[args.index('--request') + 1] if '--request' in args else 'GET'
body = json.loads(args[args.index('--data') + 1]) if '--data' in args else None
state_path = pathlib.Path(os.environ['CUTOVER_TEST_STATE'])
state = json.loads(state_path.read_text())
status = 200
result = {'success': True}
if url.endswith('/api/health'):
    state['checks'] += 1
    if url.startswith('https://staging.praetorium.gg/') and not state['domain']:
        headers = f'x-praetorium-revision: {os.environ["EXPECTED_REVISION"]}\\r\\n'
    elif state['route'] == 'praetorium-auth-cutover-maintenance':
        status = 503
        headers = 'x-praetorium-maintenance: auth-cutover\\r\\n'
    elif state['route'] == 'praetorium-production':
        headers = 'x-praetorium-runtime: cloudflare\\r\\n'
    elif not state['nodeHealthy']:
        status = 502
        headers = ''
    else:
        headers = f'x-praetorium-revision: {os.environ["EXPECTED_REVISION"]}\\r\\n'
    if '--dump-header' in args:
        pathlib.Path(args[args.index('--dump-header') + 1]).write_text(f'HTTP/2 {status}\\r\\n{headers}')
    print(status if '--write-out' in args else '')
elif '/workers/routes' in url:
    if method == 'GET':
        result['result'] = [] if state['route'] is None else [{'id': 'route', 'pattern': 'praetorium.gg/*', 'script': state['route']}]
    elif method in ('PUT', 'POST'):
        state['route'] = body['script']
    elif method == 'DELETE':
        state['route'] = None
        result = None
elif '/workers/domains' in url:
    if method == 'GET':
        result['result'] = [{'id': 'domain', 'hostname': 'staging.praetorium.gg', 'service': 'praetorium-staging'}] if state['domain'] else []
    elif method == 'DELETE':
        state['domain'] = False
        result = None
elif '/dns_records' in url:
    if method == 'GET':
        name = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)['name'][0]
        result['result'] = [record for record in state['dns'] if record['name'] == name]
    elif method == 'PATCH':
        record_id = url.rsplit('/', 1)[1]
        state['dns'] = [{**record, **body} if record['id'] == record_id else record for record in state['dns']]
    elif method == 'POST':
        state['dns'].append({'id': 'staging', **body})
else:
    sys.exit(f'unexpected URL: {url}')
state_path.write_text(json.dumps(state))
if not url.endswith('/api/health') and result is not None:
    print(json.dumps(result))
"""
        )
        curl.chmod(0o755)
        for command in ("pnpm", "sleep"):
            executable = self.path / command
            executable.write_text("#!/bin/sh\nexit 0\n")
            executable.chmod(0o755)

    def run_cutover(self, operation):
        return subprocess.run(
            ["bash", "scripts/cutoverRoutes.sh", operation],
            cwd=ROOT,
            env={
                **os.environ,
                "PATH": f"{self.path}:{os.environ['PATH']}",
                "CUTOVER_TEST_STATE": str(self.state),
                "CLOUDFLARE_ZONE_ID": "zone",
                "CLOUDFLARE_ACCOUNT_ID": "account",
                "CLOUDFLARE_API_TOKEN": "test-workers",
                "CLOUDFLARE_DNS_API_TOKEN": "test-dns",
                "EXPECTED_REVISION": REVISION,
            },
            capture_output=True,
            text=True,
            timeout=10,
        )

    def read_state(self):
        return json.loads(self.state.read_text())

    def test_freeze_then_activate_preserves_the_dns_target_until_writes_stop(self):
        freeze = self.run_cutover("freeze-production")
        self.assertEqual(freeze.returncode, 0, freeze.stderr)
        frozen = self.read_state()
        self.assertEqual(frozen["route"], "praetorium-auth-cutover-maintenance")
        self.assertEqual(frozen["dns"][0]["content"], "192.0.2.1")
        self.assertGreaterEqual(frozen["checks"], 2)
        activate = self.run_cutover("activate-production")
        self.assertEqual(activate.returncode, 0, activate.stderr)
        active = self.read_state()
        self.assertIsNone(active["route"])
        self.assertEqual(active["dns"][0]["content"], "5.75.151.151")

    def test_activation_rejects_ambiguous_apex_dns_without_unfreezing(self):
        state = self.read_state()
        state["route"] = "praetorium-auth-cutover-maintenance"
        state["dns"].append({**state["dns"][0], "id": "second"})
        self.state.write_text(json.dumps(state))
        result = self.run_cutover("activate-production")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.read_state()["route"], "praetorium-auth-cutover-maintenance")

    def test_unhealthy_vm_restores_maintenance_without_reopening_d1(self):
        state = self.read_state()
        state["route"] = "praetorium-auth-cutover-maintenance"
        state["nodeHealthy"] = False
        self.state.write_text(json.dumps(state))
        result = self.run_cutover("activate-production")
        self.assertNotEqual(result.returncode, 0)
        active = self.read_state()
        self.assertEqual(active["route"], "praetorium-auth-cutover-maintenance")
        self.assertEqual(active["dns"][0]["content"], "5.75.151.151")

    def test_staging_replaces_its_worker_domain_with_vm_dns(self):
        result = self.run_cutover("activate-staging")
        self.assertEqual(result.returncode, 0, result.stderr)
        state = self.read_state()
        self.assertFalse(state["domain"])
        self.assertEqual([record["content"] for record in state["dns"] if record["name"] == "staging.praetorium.gg"], ["5.75.151.151"])


if __name__ == "__main__":
    unittest.main()
