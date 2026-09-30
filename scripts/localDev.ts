import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { readLocalDevPreview, reuseLocalDevPreview } from './localDevPreview.ts'

const testMode = process.env.LOCAL_TEST_MODE === 'true'
const previewFile = path.resolve('data-dev/active-preview.json')
const savedPreview = testMode ? undefined : readLocalDevPreview(previewFile)
const root = path.resolve(process.env.LOCAL_DATA_DIR ?? savedPreview?.dataDir ?? 'data-dev/hosted')
const catalogueDirectory = path.resolve(process.env.CATALOGUE_DIR ?? savedPreview?.catalogueDir ?? 'catalogue-data')
const appPort = Number(process.env.LOCAL_APP_PORT ?? savedPreview?.appPort ?? 3000)
const spacetimePort = Number(
  process.env.LOCAL_SPACETIME_PORT ?? (process.env.LOCAL_APP_PORT ? appPort + 10_000 : (savedPreview?.spacetimePort ?? appPort + 10_000)),
)
const appUrl = `http://127.0.0.1:${appPort}`
const publicUrl = process.env.LOCAL_PUBLIC_URL ?? (process.env.LOCAL_APP_PORT ? appUrl : (savedPreview?.publicUrl ?? appUrl))
const spacetimeUrl = `http://127.0.0.1:${spacetimePort}`
const database = `praetorium-local-${appPort}`
const credentialsPath = path.join(root, 'credentials.json')
const installedCli = path.join(os.homedir(), '.local/share/spacetime/bin/2.7.0/spacetimedb-cli')
const cli = process.env.SPACETIME_BIN ?? (existsSync(installedCli) ? installedCli : 'spacetime')
const children: ChildProcess[] = []
const execute = promisify(execFile)
let readyServer: Server | undefined

type Identity = { identity: string; token: string }
type Credentials = { owner: Identity; operator: Identity; authSecret: string }

function validPort(port: number) {
  return Number.isInteger(port) && port > 0 && port < 65_536
}

function start(command: string, args: string[], environment: NodeJS.ProcessEnv = process.env) {
  const child = spawn(command, args, { env: environment, stdio: 'inherit' })
  children.push(child)
  return child
}

function stopChildren(signal: NodeJS.Signals) {
  for (const child of children) child.kill(signal)
  setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
  }, 5_000).unref()
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

async function main() {
  if (!testMode && savedPreview && (await reuseLocalDevPreview(savedPreview))) {
    console.log(`Reusing local Praetorium at http://127.0.0.1:${savedPreview.appPort} (PID ${savedPreview.pid})`)
    return
  }
  if (
    !validPort(appPort) ||
    !validPort(appPort + 1) ||
    !validPort(spacetimePort) ||
    appPort === spacetimePort ||
    appPort + 1 === spacetimePort ||
    (testMode && !validPort(appPort + 20_000))
  ) {
    throw new Error('Invalid local app or SpacetimeDB port')
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
  if (!testMode) {
    await mkdir(path.dirname(previewFile), { recursive: true })
    const temporary = `${previewFile}.${process.pid}.tmp`
    try {
      await writeFile(
        temporary,
        JSON.stringify({ pid: process.pid, appPort, spacetimePort, dataDir: root, catalogueDir: catalogueDirectory, publicUrl }),
      )
      await rename(temporary, previewFile)
    } finally {
      await rm(temporary, { force: true })
    }
  }
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
  await run('pnpm', ['build'], { ...process.env, NITRO_PRESET: 'node-server' })
  if (!testMode && existsSync(path.join(catalogueDirectory, 'revision.json'))) {
    await run('pnpm', ['catalogue:compile'], {
      ...process.env,
      CATALOGUE_DIR: catalogueDirectory,
      CATALOGUE_CANONICAL_FILE: path.resolve('.output/canonical-catalogue.json'),
    })
  }
  const environment = {
    ...process.env,
    APP_URL: publicUrl,
    AUTH_SECRET: value.authSecret,
    AUTH_SQLITE_PATH: path.join(root, 'auth.sqlite'),
    AUTH_INITIALIZE_EMPTY: 'true',
    PRAETORIUM_SEED_PREVIEW: 'true',
    PRAETORIUM_LOCAL_DEV: 'true',
    LOCAL_OBJECT_DIR: path.join(root, 'objects'),
    PUBLIC_ASSETS_BASE_URL: publicUrl,
    CATALOGUE_BASE_URL: `${publicUrl}/catalogue`,
    SPACETIME_URL: spacetimeUrl,
    SPACETIME_DATABASE: database,
    SPACETIME_AUDIENCE: database,
    SPACETIME_OPERATOR_TOKEN: value.operator.token,
    CATALOGUE_DIR: catalogueDirectory,
    RULES_DIR: path.join(catalogueDirectory, 'rules'),
    PORT: String(appPort),
    NODE_INTERNAL_PORT: String(appPort + 1),
    ...(testMode ? { AUTH_RATE_LIMIT: 'off' } : {}),
  }
  const viteOrigin = `http://127.0.0.1:${appPort + 1}`
  const hotEnvironment = { ...environment, LOCAL_VITE_ORIGIN: viteOrigin }
  const viteEnvironment: NodeJS.ProcessEnv = { ...hotEnvironment }
  delete viteEnvironment.PORT
  delete viteEnvironment.NODE_INTERNAL_PORT
  const vite = start(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(appPort + 1), '--strictPort'],
    viteEnvironment,
  )
  await waitFor(`${viteOrigin}/api/health`, vite, (response) => response.ok)
  const app = start(process.execPath, ['scripts/nodeServer.ts'], hotEnvironment)
  vite.on('exit', () => stopChildren('SIGTERM'))
  await waitFor(`${appUrl}/api/health`, app, (response) => response.ok)
  if (testMode) {
    readyServer = createServer((_request, response) => {
      response.writeHead(200).end('ready')
    })
    await new Promise<void>((resolve, reject) => readyServer!.listen(appPort + 20_000, '127.0.0.1', resolve).on('error', reject))
  }
  console.log(`Local Praetorium is ready at ${appUrl}`)
  await new Promise<void>((resolve, reject) => {
    app.on('error', reject)
    app.on('exit', (status, signal) =>
      status === 0 || signal ? resolve() : reject(new Error(`Local web app exited with status ${status}`)),
    )
  })
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => stopChildren(signal))
try {
  await main()
} finally {
  readyServer?.close()
  stopChildren('SIGTERM')
}
