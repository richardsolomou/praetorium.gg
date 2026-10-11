import { execFile } from 'node:child_process'
import { productionRosterSnapshotSchema, MAX_ROSTER_SNAPSHOT_BYTES } from './productionRosters'

export async function fetchProductionRostersOverSsh(host: string, webService: string) {
  if (!/^[a-zA-Z0-9_.@-]+$/.test(host) || host.startsWith('-')) throw new Error('Invalid production SSH host')
  if (!/^[a-z][a-z0-9-]+$/.test(webService)) throw new Error('Invalid production web service')
  const script = `
import json, pathlib, sqlite3, subprocess, sys
service = sys.argv[1]
spec = json.loads(subprocess.check_output(["docker", "service", "inspect", service]))[0]["Spec"]["TaskTemplate"]["ContainerSpec"]
env = dict(item.split("=", 1) for item in spec["Env"])
if env.get("APP_URL") != "https://praetorium.gg":
    raise SystemExit("Selected service is not the production Praetorium application")
auth = pathlib.PurePosixPath(env["AUTH_SQLITE_PATH"])
mount = next(m for m in spec["Mounts"] if m["Type"] == "volume" and auth.is_relative_to(m["Target"]))
volume = json.loads(subprocess.check_output(["docker", "volume", "inspect", mount["Source"]]))[0]["Mountpoint"]
db = pathlib.Path(volume) / auth.relative_to(mount["Target"])
with sqlite3.connect(db.as_uri() + "?mode=ro", uri=True, timeout=5) as connection:
    user_ids = [row[0] for row in connection.execute('SELECT id FROM user LIMIT 10001')]
if len(user_ids) > 10000:
    raise SystemExit("Production account count exceeds export limit")
containers = subprocess.check_output(["docker", "ps", "--filter", "label=com.docker.swarm.service.name=" + service, "--format", "{{.ID}}"], text=True).splitlines()
if not containers:
    raise SystemExit("Production web service has no running container")
js = r'''
const userIds = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const env = process.env;
const host = env.SPACETIME_INTERNAL_HOST;
const database = env.SPACETIME_DATABASE;
if (!/^[a-z][a-z0-9-]+$/.test(host) || !/^[a-z0-9-]+$/.test(database)) throw new Error('Invalid product connection');
const fields = ['id', 'catalogueId', 'disposition', 'limit', 'borrowedDetachmentId', 'baseRosterId', 'source', 'createdAt', 'updatedAt'];
(async () => {
  const rosters = [];
  let bytes = 0;
  for (const userId of userIds) {
    const response = await fetch('http://' + host + ':3000/v1/database/' + database + '/call/rosters_by_user', {
      method: 'POST', redirect: 'error', headers: { authorization: 'Bearer ' + env.SPACETIME_OPERATOR_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify([userId, false, 1000]), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('Operator roster read failed with HTTP ' + response.status);
    const rows = JSON.parse(await response.json());
    for (const row of rows) {
      const roster = Object.fromEntries(fields.map(key => [key, row[key]]));
      roster.detachmentIds = !row.detachmentId ? [] : row.detachmentId.startsWith('[') ? JSON.parse(row.detachmentId) : [row.detachmentId];
      for (const key of ['picks', 'waivedRules', 'optionalRules']) roster[key] = JSON.parse(row[key]);
      bytes += Buffer.byteLength(JSON.stringify(roster));
      if (bytes > 64 * 1024 * 1024) throw new Error('Roster snapshot exceeds 64 MiB');
      rosters.push(roster);
    }
    if (rosters.length > 10000) throw new Error('Production roster count exceeds export limit');
  }
  const output = JSON.stringify({ version: 1, fetchedAt: Date.now(), source: { url: env.SPACETIME_URL, database }, rosters });
  if (Buffer.byteLength(output) > 64 * 1024 * 1024) throw new Error('Roster snapshot exceeds 64 MiB');
  process.stdout.write(output);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
'''
result = subprocess.run(["docker", "exec", "-i", containers[0], "node", "-e", js], input=json.dumps(user_ids), text=True, capture_output=True, timeout=110)
if result.returncode:
    raise SystemExit("Production operator roster export failed: " + result.stderr[:300])
sys.stdout.write(result.stdout)
`
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, `python3 - ${webService}`],
      {
        timeout: 120_000,
        maxBuffer: MAX_ROSTER_SNAPSHOT_BYTES,
      },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`Production SSH export failed: ${stderr.trim().slice(0, 500) || error.code}`))
        else resolve(stdout)
      },
    )
    child.stdin!.end(script)
  })
  return productionRosterSnapshotSchema.parse(JSON.parse(output))
}
