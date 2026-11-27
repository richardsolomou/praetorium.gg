import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'
import { localAuthDatabase } from '../src/server/localAuthDatabase'
import { callSpacetime } from '../src/server/spacetime'
import { isEntryPoint } from './lib/entryPoint.ts'
import { migrateProductData } from './lib/productDataMigrations'
import { runningLocalDevPreview } from './localDevPreview'
import { PREVIEW_PASSWORD } from './seedPreview'

/**
 * Runs as root on the production host. It restores the latest off-host backup into a throwaway SpacetimeDB container
 * with no network, so nothing in the copy can reach a player and nothing writes to it while it is paged out, then
 * streams every product table and the auth database's profiles and sign-in links, gzipped, to stdout. Sessions,
 * tokens, password hashes, two-factor secrets, signing keys and OAuth client secrets never leave the host.
 */
const hostScript = String.raw`
import datetime, gzip, json, pathlib, shutil, sqlite3, subprocess, sys, tempfile, time, uuid
sys.path.insert(0, "/usr/local/libexec/praetorium")
import backupSpacetime as backup

service = sys.argv[1]
def spec(name):
    return json.loads(subprocess.check_output(["docker", "service", "inspect", name]))[0]["Spec"]["TaskTemplate"]["ContainerSpec"]
web = spec(service)
env = dict(item.split("=", 1) for item in web["Env"])
if env.get("APP_URL") != "https://praetorium.gg":
    raise SystemExit("Selected service is not the production Praetorium application")
config = backup.BackupConfig(**json.loads(pathlib.Path("/etc/praetorium-spacetime-backup/production.json").read_text()))
database = env["SPACETIME_DATABASE"]
out = gzip.GzipFile(fileobj=sys.stdout.buffer, mode="wb", compresslevel=6)
def emit(record):
    out.write((json.dumps(record, separators=(",", ":")) + "\n").encode())

auth = pathlib.PurePosixPath(env["AUTH_SQLITE_PATH"])
mount = next(m for m in web["Mounts"] if m["Type"] == "volume" and auth.is_relative_to(m["Target"]))
volume = json.loads(subprocess.check_output(["docker", "volume", "inspect", mount["Source"]]))[0]["Mountpoint"]
with sqlite3.connect((pathlib.Path(volume) / auth.relative_to(mount["Target"])).as_uri() + "?mode=ro", uri=True, timeout=5) as connection:
    connection.row_factory = sqlite3.Row
    users = [dict(row, twoFactorEnabled=0) for row in connection.execute("SELECT * FROM user")]
    links = [dict(row) for row in connection.execute("SELECT id, accountId, issuer, providerId, userId, scope, createdAt, updatedAt FROM account WHERE providerId != 'credential'")]
emit({"auth": "user", "rows": users})
emit({"auth": "account", "rows": links})

base = pathlib.Path("/var/lib/praetorium-spacetime-backup")
base.mkdir(mode=0o700, exist_ok=True)
work = pathlib.Path(tempfile.mkdtemp(prefix="copy-", dir=base))
name = "praetorium-copy-" + uuid.uuid4().hex[:12]
try:
    bucket = f"{config.endpoint}/{config.bucket}"
    backup.request(config, f"{bucket}/{config.prefix}/backups/latest.json", download=work / "latest.json")
    manifest = json.loads((work / "latest.json").read_text())
    age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(manifest["createdAt"].replace("Z", "+00:00"))
    if manifest["format"] != "praetorium.spacetime-backup.v1" or not datetime.timedelta(0) <= age <= datetime.timedelta(hours=13):
        raise SystemExit("The latest SpacetimeDB backup is missing or more than 13 hours old")
    for kind in ("data", "identity"):
        key = manifest[kind]["key"]
        if not key.startswith(f"{config.prefix}/backups/{kind}/") or ".." in key:
            raise SystemExit("Backup manifest names an unexpected key")
        archive = work / f"{kind}.tar"
        backup.request(config, f"{bucket}/{key}", download=archive)
        if backup.digest(archive) != manifest[kind]["sha256"]:
            raise SystemExit(f"Backup {kind} archive does not match its manifest")
        (work / kind).mkdir()
        subprocess.run(["tar", "-xf", str(archive), "-C", str(work / kind), *(["--strip-components=2"] if kind == "data" else [])], check=True)
        archive.unlink()
    (work / "data" / "spacetime.pid").unlink(missing_ok=True)
    request = work / "curl.conf"
    request.touch(mode=0o600)
    request.write_text('header = "Authorization: Bearer ' + env["SPACETIME_OPERATOR_TOKEN"] + '"\n')
    subprocess.run(["docker", "run", "--detach", "--name", name, "--network", "none", "--user", "0:0", "--env", "HOME=/tmp",
        "--volume", f"{work / 'data'}:/data", "--volume", f"{work / 'identity'}:/identity:ro", "--volume", f"{request}:/curl.conf:ro",
        spec(config.service)["Image"], "start", "--data-dir", "/data", "--listen-addr", "127.0.0.1:3000", "--non-interactive",
        "--jwt-priv-key-path", "/identity/id_ecdsa", "--jwt-pub-key-path", "/identity/id_ecdsa.pub"], check=True, capture_output=True)
    def call(procedure, args):
        result = subprocess.run(["docker", "exec", "-i", name, "curl", "--fail-with-body", "--silent", "--show-error", "--max-time", "300",
            "--config", "/curl.conf", "--header", "content-type: application/json", "--data-binary", "@-",
            f"http://127.0.0.1:3000/v1/database/{database}/call/{procedure}"], input=json.dumps(args).encode(), capture_output=True, timeout=330)
        if result.returncode:
            raise RuntimeError(f"{procedure} failed: {(result.stderr + result.stdout)[:300].decode(errors='replace')}")
        return json.loads(json.loads(result.stdout))
    for attempt in range(120):
        try:
            tables = call("export_product_rows", ["", 0])["tables"]
            break
        except RuntimeError as error:
            if "No such procedure" in str(error):
                raise SystemExit("Production's module predates whole-database copies; deploy it first")
            if attempt == 119:
                raise SystemExit(f"The restored backup never answered: {error}")
            time.sleep(1)
    for table in tables:
        offset = 0
        while offset is not None:
            page = call("export_product_rows", [table, offset])
            emit({"product": table, "rows": page["rows"]})
            offset = page["next"]
    emit({"end": manifest["createdAt"], **({"capturedAt": manifest["capturedAt"]} if "capturedAt" in manifest else {})})
finally:
    subprocess.run(["docker", "rm", "--force", name], capture_output=True)
    shutil.rmtree(work, ignore_errors=True)
    out.close()
`

const IMPORT_BATCH_CHARACTERS = 1_000_000

const record = z.union([
  z.strictObject({ auth: z.enum(['user', 'account']), rows: z.array(z.record(z.string(), z.unknown())) }),
  z.strictObject({ product: z.string(), rows: z.array(z.unknown()) }),
  // `capturedAt` is the backup's time before its freeze, absent from backups made before it was recorded.
  z.strictObject({ end: z.string(), capturedAt: z.iso.datetime().optional() }),
])

export async function downloadProductionCopy(host: string, webService: string, file: string) {
  if (!/^[a-zA-Z0-9_.@-]+$/.test(host) || host.startsWith('-')) throw new Error('Invalid production SSH host')
  if (!/^[a-z][a-z0-9-]+$/.test(webService)) throw new Error('Invalid production web service')
  const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, `python3 - ${webService}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let failure = ''
  child.stderr.on('data', (chunk: Buffer) => (failure = (failure + chunk.toString()).slice(-2_000)))
  child.stdin.end(hostScript)
  const exited = new Promise<number | null>((resolve) => child.once('close', resolve))
  await pipeline(child.stdout, createWriteStream(file, { mode: 0o600 }))
  if ((await exited) !== 0) throw new Error(`Production copy failed: ${failure.trim() || 'ssh exited early'}`)
}

async function* records(file: string) {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const line of lines) if (line) yield record.parse(JSON.parse(line))
}

/**
 * Replaces this worktree's running development data with the copy: every product table, then every account, each
 * given the preview password so any player can be signed in as by their email. Nothing is replaced until the whole
 * copy has arrived.
 */
export async function loadProductionCopy(file: string) {
  let backupAt: string | undefined
  for await (const entry of records(file)) if ('end' in entry) backupAt = entry.end
  if (!backupAt) throw new Error('The production copy ended early; nothing was replaced')

  const preview = await runningLocalDevPreview(await realpath(process.cwd()))
  if (!preview?.ready) throw new Error('Start this worktree with just dev before copying production into it')
  const credentials = z
    .object({ owner: z.object({ token: z.string() }), operator: z.object({ token: z.string() }) })
    .parse(JSON.parse(await readFile(path.join(preview.dataDir, 'credentials.json'), 'utf8')))
  const url = `http://127.0.0.1:${preview.spacetimePort}`
  const operator = { url, database: preview.database, token: credentials.operator.token }
  const tables = JSON.parse(await (await callSpacetime(operator, 'export_product_rows', ['', 0])).json()) as unknown
  const { tables: local } = z.object({ tables: z.array(z.string()) }).parse(tables)
  const replaced = new Set<string>()
  const store = async (table: string, rows: readonly string[]) => {
    await callSpacetime(operator, 'import_product_rows', [table, `[${rows.join(',')}]`, !replaced.has(table)], 300_000)
    replaced.add(table)
  }
  let copied = 0
  for await (const entry of records(file)) {
    if (!('product' in entry) || !local.includes(entry.product)) continue
    // SpacetimeDB refuses call bodies over about 2 MB, so a page is stored in smaller batches.
    let batch: string[] = []
    let characters = 0
    for (const row of entry.rows.map((value) => JSON.stringify(value))) {
      if (batch.length && characters + row.length > IMPORT_BATCH_CHARACTERS) {
        await store(entry.product, batch)
        batch = []
        characters = 0
      }
      batch.push(row)
      characters += row.length
    }
    if (batch.length || !replaced.has(entry.product)) await store(entry.product, batch)
    copied += entry.rows.length
  }
  // A table this branch added has nothing in production, so it is emptied rather than left holding seeded rows.
  for (const table of local.filter((name) => !replaced.has(name))) await store(table, [])
  await migrateProductData({
    url,
    database: preview.database,
    ownerToken: credentials.owner.token,
    operatorToken: credentials.operator.token,
  })

  const auth: Record<'user' | 'account', Record<string, unknown>[]> = { user: [], account: [] }
  for await (const entry of records(file)) if ('auth' in entry) auth[entry.auth] = entry.rows
  const { client } = localAuthDatabase(path.join(preview.dataDir, 'auth.sqlite'))
  const columns = async (table: string) => (await client.execute(`PRAGMA table_info("${table}")`)).rows.map((row) => row.name as string)
  const existing = new Set(
    (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((row) => row.name as string),
  )
  const insert = async (table: 'user' | 'account', rows: Record<string, unknown>[]) => {
    const kept = await columns(table)
    return rows.map((row) => {
      const names = Object.keys(row).filter((name) => kept.includes(name))
      return {
        sql: `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        args: names.map((name) => row[name] as string | number | null),
      }
    })
  }
  const password = await hashPassword(PREVIEW_PASSWORD)
  const now = Date.now()
  const signIns = auth.user.map((user) => ({
    id: randomUUID(),
    accountId: user.id,
    providerId: 'credential',
    userId: user.id,
    password,
    createdAt: now,
    updatedAt: now,
  }))
  // Everything that points at a local account goes with it, so no session or token outlives the account it was for.
  const cleared = [
    'session',
    'verification',
    'twoFactor',
    'oauthAccessToken',
    'oauthRefreshToken',
    'oauthConsent',
    'oauthClientResource',
    'oauthClient',
    'account',
    'user',
  ]
  await client.batch(
    [
      ...cleared.filter((table) => existing.has(table)).map((table) => `DELETE FROM "${table}"`),
      ...(await insert('user', auth.user)),
      ...(await insert('account', [...auth.account, ...signIns])),
    ],
    'write',
  )
  client.close()
  console.log(
    `Copied ${copied} rows across ${replaced.size} tables and ${auth.user.length} accounts from the ${backupAt} backup.\n` +
      `Sign in at ${preview.publicUrl} as any player by their email with the preview password from scripts/seedPreview.ts.`,
  )
}

async function productionCopyMain() {
  const host = process.env.PRODUCTION_SSH_HOST ?? 'hera'
  const webService = process.env.PRODUCTION_WEB_SERVICE ?? 'praetoriumgg-web-ecmusg'
  const file = path.resolve('data-dev', `production-copy-${randomUUID()}.ndjson.gz`)
  await mkdir(path.dirname(file), { recursive: true })
  try {
    await downloadProductionCopy(host, webService, file)
    await loadProductionCopy(file)
  } finally {
    await rm(file, { force: true })
  }
}

if (isEntryPoint(import.meta.url)) await productionCopyMain()
