import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { drizzle } from 'drizzle-orm/d1'
import { getPlatformProxy } from 'wrangler'
import { seedPreview } from './seedPreview'

const root = path.resolve(process.env.LOCAL_DATA_DIR ?? 'data-dev/hosted')
const appPort = Number(process.env.LOCAL_APP_PORT ?? 3000)
const spacetimePort = Number(process.env.LOCAL_SPACETIME_PORT ?? appPort + 10_000)
const workerProtocol = process.env.LOCAL_WORKER_PROTOCOL ?? 'http'
const appUrl = `${workerProtocol}://127.0.0.1:${appPort}`
const publicUrl = process.env.LOCAL_PUBLIC_URL ?? appUrl
const spacetimeUrl = `http://127.0.0.1:${spacetimePort}`
const database = `praetorium-local-${appPort}`
const configPath = path.join(root, 'wrangler.json')
const statePath = path.join(root, 'wrangler-state')
const credentialsPath = path.join(root, 'credentials.json')
const seedMarker = path.join(root, 'seeded-v2')
const installedCli = path.join(os.homedir(), '.local/share/spacetime/bin/2.7.0/spacetimedb-cli')
const cli = process.env.SPACETIME_BIN ?? (existsSync(installedCli) ? installedCli : 'spacetime')
const children: ChildProcess[] = []
const execute = promisify(execFile)
const testMode = process.env.LOCAL_TEST_MODE === 'true'
let readyServer: Server | undefined

const optionalAuthEnvironment = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
  'APPLE_CLIENT_SECRET',
] as const

type Identity = { identity: string; token: string }
type Credentials = { owner: Identity; operator: Identity; authSecret: string; databaseId: string }

function validPort(port: number) {
  return Number.isInteger(port) && port > 0 && port < 65_536
}

function start(command: string, args: string[], environment: NodeJS.ProcessEnv = process.env) {
  const child = spawn(command, args, { env: environment, stdio: 'inherit' })
  children.push(child)
  return child
}

async function run(command: string, args: string[], environment: NodeJS.ProcessEnv = process.env) {
  const child = start(command, args, environment)
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (status) => resolve(status ?? 1))
  })
  children.splice(children.indexOf(child), 1)
  if (code !== 0) throw new Error(`${command} exited with status ${code}`)
}

async function waitFor(url: string, child: ChildProcess, ready: (response: Response) => boolean) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Service exited before ${url} was ready`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (ready(response)) return
    } catch {
      // The local service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function identity(): Promise<Identity> {
  const response = await fetch(`${spacetimeUrl}/v1/identity`, { method: 'POST' })
  if (!response.ok) throw new Error(`Local SpacetimeDB identity failed with HTTP ${response.status}`)
  const value = (await response.json()) as Partial<Identity>
  if (typeof value.identity !== 'string' || typeof value.token !== 'string') throw new Error('Invalid local SpacetimeDB identity')
  return { identity: value.identity, token: value.token }
}

async function credentials(): Promise<Credentials> {
  try {
    return JSON.parse(await readFile(credentialsPath, 'utf8')) as Credentials
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const value = {
    owner: await identity(),
    operator: await identity(),
    authSecret: randomBytes(32).toString('base64url'),
    databaseId: randomUUID(),
  }
  await writeFile(credentialsPath, JSON.stringify(value), { mode: 0o600, flag: 'wx' })
  return value
}

async function spacetime(method: string, pathname: string, token: string, body: BodyInit) {
  const response = await fetch(`${spacetimeUrl}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}) },
    body,
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok)
    throw new Error(`Local SpacetimeDB ${pathname} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
}

async function configure(value: Credentials) {
  const bundle = await readFile('spacetimedb/dist/bundle.js')
  await spacetime('PUT', `/v1/database/${database}?host_type=Js`, value.owner.token, bundle)
  await spacetime(
    'POST',
    `/v1/database/${database}/call/configure`,
    value.owner.token,
    JSON.stringify([`${publicUrl}/api/auth`, database, value.operator.identity]),
  )
  await spacetime('POST', `/v1/database/${database}/call/operator_health`, value.operator.token, '[]')
}

async function configureWorker(value: Credentials) {
  const manifest = await readFile('.output/worker-catalogue/manifest.json')
  const source = JSON.parse(await readFile('wrangler.staging.json', 'utf8')) as Record<string, unknown>
  const config = {
    ...source,
    name: database,
    main: path.resolve('cloudflare/nativeWorker.ts'),
    vars: {
      APP_URL: publicUrl,
      S3_PUBLIC_BASE_URL: `${publicUrl}/praetorium`,
      SPACETIME_AUDIENCE: database,
      SPACETIME_DATABASE: database,
      CATALOGUE_SNAPSHOT_ID: (JSON.parse(manifest.toString()) as { snapshotId: string }).snapshotId,
      CATALOGUE_MANIFEST_SHA256: createHash('sha256').update(manifest).digest('hex'),
    },
    d1_databases: [{ binding: 'AUTH_DB', database_name: `${database}-auth`, database_id: value.databaseId }],
    r2_buckets: [{ binding: 'PUBLIC_OBJECTS', bucket_name: `${database}-objects` }],
    assets: { directory: path.resolve('.output/public'), binding: 'ASSETS', run_worker_first: ['/_catalogue/*'] },
  }
  await writeFile(configPath, JSON.stringify(config))
  const optionalAuth = optionalAuthEnvironment
    .flatMap((name) => (process.env[name] ? [`${name}=${JSON.stringify(process.env[name])}\n`] : []))
    .join('')
  await writeFile(
    path.join(root, '.dev.vars'),
    `AUTH_SECRET=${value.authSecret}\nSPACETIME_URL=${spacetimeUrl}\nSPACETIME_OPERATOR_TOKEN=${value.operator.token}\nSPACETIME_ACCESS_CLIENT_ID=local\nSPACETIME_ACCESS_CLIENT_SECRET=local\n${testMode ? 'AUTH_RATE_LIMIT=off\n' : ''}${optionalAuth}`,
    { mode: 0o600 },
  )
  await chmod(path.join(root, '.dev.vars'), 0o600)
}

async function withLocalD1<T>(work: (binding: Parameters<typeof drizzle>[0]) => Promise<T>) {
  const proxy = await getPlatformProxy<{ AUTH_DB: Parameters<typeof drizzle>[0] }>({
    configPath,
    persist: { path: path.join(statePath, 'v3') },
    remoteBindings: false,
    envFiles: [],
  })
  try {
    return await work(proxy.env.AUTH_DB)
  } finally {
    await proxy.dispose()
  }
}

async function migrateD1() {
  await withLocalD1(async (binding) => {
    const existing = await binding.prepare("select name from sqlite_master where type = 'table' and name = 'user'").first()
    if (!existing) {
      const migration = await readFile('drizzle-auth/0000_curly_gambit.sql', 'utf8')
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) await binding.prepare(statement).run()
      }
    }
  })
}

async function seedD1AndSpacetime(value: Credentials) {
  try {
    await access(seedMarker)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await withLocalD1(async (binding) => {
    const localEnvironment = {
      APP_URL: publicUrl,
      AUTH_RATE_LIMIT: 'off',
      AUTH_SECRET: value.authSecret,
      CATALOGUE_DIR: path.resolve('catalogue-data'),
      PRAETORIUM_SEED_PREVIEW: 'true',
      SPACETIME_AUDIENCE: database,
      SPACETIME_DATABASE: database,
      SPACETIME_OPERATOR_TOKEN: value.operator.token,
      SPACETIME_URL: spacetimeUrl,
    }
    const previous = Object.fromEntries(Object.keys(localEnvironment).map((key) => [key, process.env[key]]))
    Object.assign(process.env, localEnvironment)
    try {
      await seedPreview(undefined, binding)
      await writeFile(seedMarker, '')
    } finally {
      for (const [key, old] of Object.entries(previous)) {
        if (old === undefined) delete process.env[key]
        else process.env[key] = old
      }
    }
  })
}

async function main() {
  if (!validPort(appPort) || !validPort(spacetimePort) || appPort === spacetimePort || (testMode && !validPort(appPort + 20_000))) {
    throw new Error('Invalid local app or SpacetimeDB port')
  }
  if (!['http', 'https'].includes(workerProtocol)) throw new Error('Invalid local Worker protocol')
  if (workerProtocol === 'https' && (!process.env.LOCAL_WORKER_CERT || !process.env.LOCAL_WORKER_KEY)) {
    throw new Error('Local HTTPS requires a certificate and key')
  }
  if (testMode) {
    if (
      path.dirname(root) !== '/tmp' ||
      ![`praetorium-e2e-${appPort}`, `praetorium-native-auth-ios-${appPort}`].includes(path.basename(root))
    ) {
      throw new Error('Test data reset requires a disposable, port-specific /tmp directory')
    }
    await rm(root, { recursive: true, force: true })
  }
  await mkdir(root, { recursive: true })
  const { stdout } = await execute(cli, ['--version'])
  if (!stdout.includes('spacetimedb tool version 2.7.0;')) throw new Error('Local development requires SpacetimeDB CLI 2.7.0')
  const server = start(cli, [
    'start',
    '--listen-addr',
    `127.0.0.1:${spacetimePort}`,
    '--data-dir',
    path.join(root, 'spacetimedb'),
    '--non-interactive',
  ])
  await waitFor(`${spacetimeUrl}/v1/database/${database}`, server, (response) => response.ok || response.status === 404)
  const value = await credentials()
  await run(cli, ['build', '-p', 'spacetimedb'])
  await configure(value)
  await run('pnpm', ['build'], { ...process.env, NITRO_PRESET: 'cloudflare_module' })
  await run('pnpm', ['catalogue:worker'])
  await run('pnpm', ['catalogue:worker:assets'])
  await configureWorker(value)
  await migrateD1()
  const worker = start('pnpm', [
    'exec',
    'wrangler',
    'dev',
    '--config',
    configPath,
    '--local',
    '--persist-to',
    statePath,
    '--ip',
    '127.0.0.1',
    '--port',
    String(appPort),
    ...(workerProtocol === 'https'
      ? [
          '--local-protocol',
          'https',
          '--https-cert-path',
          process.env.LOCAL_WORKER_CERT!,
          '--https-key-path',
          process.env.LOCAL_WORKER_KEY!,
        ]
      : []),
  ])
  await waitFor(`${appUrl}/api/health`, worker, (response) => response.ok)
  await seedD1AndSpacetime(value)
  if (testMode) {
    readyServer = createServer((_request, response) => {
      response.writeHead(200).end('ready')
    })
    await new Promise<void>((resolve, reject) => readyServer!.listen(appPort + 20_000, '127.0.0.1', resolve).on('error', reject))
  }
  console.log(`Local Praetorium is ready at ${appUrl}`)
  await new Promise<void>((resolve, reject) => {
    worker.on('error', reject)
    worker.on('exit', (status, signal) =>
      status === 0 || signal ? resolve() : reject(new Error(`Local Worker exited with status ${status}`)),
    )
  })
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => children.forEach((child) => child.kill(signal)))
try {
  await main()
} finally {
  readyServer?.close()
  for (const child of children) child.kill('SIGTERM')
}
