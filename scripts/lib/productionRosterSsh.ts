import { execFile } from 'node:child_process'
import { z } from 'zod'
import { productionRosterSnapshotSchema, MAX_ROSTER_SNAPSHOT_BYTES, type NormalisedRoster } from './productionRosters'

function checkTarget(host: string, webService: string) {
  if (!/^[a-zA-Z0-9_.@-]+$/.test(host) || host.startsWith('-')) throw new Error('Invalid production SSH host')
  if (!/^[a-z][a-z0-9-]+$/.test(webService)) throw new Error('Invalid production web service')
}

/** The remote script's output, with any failure, so writes made before it are still reported. */
function runOverSsh(host: string, webService: string, script: string) {
  return new Promise<{ stdout: string; failure: string | null }>((resolve) => {
    const child = execFile(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, `python3 - ${webService}`],
      {
        timeout: 120_000,
        maxBuffer: MAX_ROSTER_SNAPSHOT_BYTES,
      },
      (error, stdout, stderr) => resolve({ stdout, failure: error ? stderr.trim().slice(0, 500) || String(error.code) : null }),
    )
    child.stdin!.end(script)
  })
}

export async function fetchProductionRostersOverSsh(host: string, webService: string) {
  checkTarget(host, webService)
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
const fields = ['id', 'catalogueId', 'disposition', 'limit', 'pointsBudget', 'borrowedDetachmentId', 'baseRosterId', 'source', 'createdAt', 'updatedAt'];
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
  const { stdout, failure } = await runOverSsh(host, webService, script)
  if (failure) throw new Error(`Production SSH export failed: ${failure}`)
  return productionRosterSnapshotSchema.parse(JSON.parse(stdout))
}

/**
 * Runs inside the production web container with its operator credentials. Each roster
 * is re-read and written through `sync_roster` against the version just read, so an
 * edit made since the snapshot, or racing this write, wins and the roster is skipped.
 * A roster already holding the rewrite reports itself current, so a rerun is harmless.
 */
export const normalisedRosterWriter = String.raw`
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const env = process.env;
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const host = env.SPACETIME_INTERNAL_HOST;
const database = env.SPACETIME_DATABASE;
if (!/^[a-z][a-z0-9-]+$/.test(host) || !/^[a-z0-9-]+$/.test(database)) throw new Error('Invalid product connection');
const base = process.argv[1] || 'http://' + host + ':3000';
const canonical = value => JSON.stringify(value, (key, held) =>
  held && typeof held === 'object' && !Array.isArray(held) ? Object.fromEntries(Object.entries(held).sort(([one], [other]) => one < other ? -1 : 1)) : held);
const same = (one, other) => canonical(one) === canonical(other);
const detachments = id => !id ? [] : id.startsWith('[') ? JSON.parse(id) : [id];
const call = async (name, args) => {
  const response = await fetch(base + '/v1/database/' + database + '/call/' + name, {
    method: 'POST', redirect: 'error', headers: { authorization: 'Bearer ' + env.SPACETIME_OPERATOR_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Operator ' + name + ' failed with HTTP ' + response.status);
  return JSON.parse(await response.json());
};
const report = (id, outcome, reason) => process.stdout.write(JSON.stringify({ id, outcome, reason }) + '\n');
(async () => {
  const catalogue = env.CATALOGUE_DIR || path.join(env.DATA_DIR || '/data', 'catalogue');
  if (!same(JSON.parse(fs.readFileSync(path.join(catalogue, 'revision.json'), 'utf8')), input.revision))
    throw new Error('Production catalogue revision differs from the one these rewrites were checked against');
  for (const roster of input.rosters) {
    const row = await call('roster_by_id', [roster.id]);
    if (!row) { report(roster.id, 'skipped', 'deleted'); continue; }
    const saved = { catalogueId: row.catalogueId, detachmentIds: detachments(row.detachmentId), borrowedDetachmentId: row.borrowedDetachmentId ?? null, picks: JSON.parse(row.picks) };
    if (same(saved, roster.write)) { report(roster.id, 'current', null); continue; }
    if (row.locked) { report(roster.id, 'skipped', 'locked'); continue; }
    if (row.updatedAt !== roster.updatedAt || !same(saved, roster.expected)) { report(roster.id, 'skipped', 'changed since the snapshot'); continue; }
    const next = JSON.stringify({
      id: row.id, userId: row.userId, name: row.name, automaticName: row.automaticName === true,
      catalogueId: roster.write.catalogueId,
      detachmentId: same(saved.detachmentIds, roster.write.detachmentIds) ? row.detachmentId ?? null : JSON.stringify(roster.write.detachmentIds),
      disposition: row.disposition ?? null, limit: row.limit, pointsBudget: row.pointsBudget ?? null,
      picks: JSON.stringify(roster.write.picks), prep: row.prep ?? null, tags: row.tags,
      waivedRules: row.waivedRules, optionalRules: row.optionalRules, borrowedDetachmentId: roster.write.borrowedDetachmentId,
      baseRosterId: row.baseRosterId ?? null, copiedFromRosterId: row.copiedFromRosterId ?? null,
      // The save stores one millisecond later, so data updates since the player last saved still reach the list.
      visibility: row.visibility, source: row.source, now: row.updatedAt,
    });
    const outcome = await call('sync_roster', [JSON.stringify({
      row: next, operationId: crypto.randomUUID(), fingerprint: crypto.createHash('sha256').update(next).digest('hex'),
      expectedVersion: row.updatedAt, deleted: false,
    })]);
    if (outcome.outcome === 'applied') report(roster.id, 'written', null);
    else report(roster.id, 'skipped', outcome.message);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
`

const writeOutcomeSchema = z.strictObject({
  id: z.string(),
  outcome: z.enum(['written', 'current', 'skipped']),
  reason: z.string().nullable(),
})
export type RosterWriteOutcome = z.infer<typeof writeOutcomeSchema>

type RosterWrite = NonNullable<NormalisedRoster['write']>
export type NormalisedRosterWrite = { id: string; updatedAt: number; expected: RosterWrite; write: RosterWrite }

export async function writeNormalisedRostersOverSsh(
  host: string,
  webService: string,
  revision: Readonly<Record<string, string>>,
  rosters: readonly NormalisedRosterWrite[],
  log: (outcome: RosterWriteOutcome) => void,
) {
  checkTarget(host, webService)
  const payload = Buffer.from(JSON.stringify({ revision, rosters })).toString('base64')
  if (payload.length > MAX_ROSTER_SNAPSHOT_BYTES) throw new Error('Roster rewrites exceed 64 MiB')
  const program = Buffer.from(normalisedRosterWriter).toString('base64')
  const script = `
import base64, json, subprocess, sys
service = sys.argv[1]
spec = json.loads(subprocess.check_output(["docker", "service", "inspect", service]))[0]["Spec"]["TaskTemplate"]["ContainerSpec"]
env = dict(item.split("=", 1) for item in spec["Env"])
if env.get("APP_URL") != "https://praetorium.gg":
    raise SystemExit("Selected service is not the production Praetorium application")
containers = subprocess.check_output(["docker", "ps", "--filter", "label=com.docker.swarm.service.name=" + service, "--format", "{{.ID}}"], text=True).splitlines()
if not containers:
    raise SystemExit("Production web service has no running container")
result = subprocess.run(["docker", "exec", "-i", containers[0], "node", "-e", base64.b64decode("${program}").decode()], input=base64.b64decode("${payload}").decode(), text=True, stdout=sys.stdout, stderr=subprocess.PIPE, timeout=110)
if result.returncode:
    raise SystemExit("Production roster rewrite stopped: " + result.stderr[:300])
`
  const { stdout, failure } = await runOverSsh(host, webService, script)
  const outcomes = stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => writeOutcomeSchema.parse(JSON.parse(line)))
  outcomes.forEach(log)
  if (failure) throw new Error(`Production roster rewrite failed after ${outcomes.length} rosters: ${failure}`)
  return outcomes
}
