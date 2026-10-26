import { execFile, type ChildProcess } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { replaceFile } from '../src/server/replaceFile.ts'
import { createServer } from 'node:http'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { assertSavedDevData, localControlPort, localDevPreviewFile, readLocalDevPreview, type LocalDevPreview } from './localDevPreview.ts'
import { closeServer, reserveLocalPort, startLocalChild, stopLocalChildren } from './lib/localStack.ts'
import { migrateProductData } from './lib/productDataMigrations.ts'
import { moduleEnvironment } from './lib/spacetimeEnvironment.ts'
import { TEST_STACK_NAME } from './lib/testStacks.ts'
import { installedSpacetimeCli, SPACETIME_VERSION } from './lib/spacetimeCli.ts'
import { callSpacetime, publishSpacetimeModule } from 'ras-stack/spacetime'
import { browserTestBuildEnvironment, ensureBrowserTestBuild } from './lib/browserTestBuild.ts'
import { prepareModuleCoverage } from './lib/moduleCoverage.ts'

const testMode = process.env.LOCAL_TEST_MODE === 'true'
const worktree = await realpath(process.cwd())
const previewFile = localDevPreviewFile(worktree)
const savedPreview = testMode ? undefined : readLocalDevPreview(previewFile)
if (savedPreview && savedPreview.worktree !== worktree) throw new Error('Preview record belongs to another worktree')
const root = path.resolve(process.env.LOCAL_DATA_DIR ?? savedPreview?.dataDir ?? 'data-dev/hosted')
const catalogueDirectory = path.resolve(process.env.CATALOGUE_DIR ?? savedPreview?.catalogueDir ?? 'catalogue-data')
const controlPort = Number(
  process.env.LOCAL_READY_PORT ?? process.env.LOCAL_CONTROL_PORT ?? savedPreview?.controlPort ?? localControlPort(worktree),
)
const token = randomUUID()
const children: ChildProcess[] = []
const reservations: Awaited<ReturnType<typeof reserveLocalPort>>[] = []
const execute = promisify(execFile)
const abort = new AbortController()
let requestedStop = false
let ownsTestData = false
let preview: (Omit<LocalDevPreview, 'mode'> & { mode: 'dev' | 'test' }) | undefined
let appUrl = ''
let publicUrl = ''
let spacetimeUrl = ''
let database = ''
const credentialsPath = path.join(root, 'credentials.json')
// A browser-test coverage run records what the SpacetimeDB module runs here (see `e2e/stackEnv.ts`).
const moduleCoverage = testMode && process.env.LOCAL_COVERAGE_DIR ? path.join(process.env.LOCAL_COVERAGE_DIR, 'spacetime') : null
let ownerToken = ''
const cli = process.env.SPACETIME_BIN ?? (existsSync(installedSpacetimeCli) ? installedSpacetimeCli : 'spacetime')
const buildDir = path.join(root, 'build')
const environment: NodeJS.ProcessEnv = { ...process.env, LOCAL_BUILD_DIR: buildDir, LOCAL_TEST_MODE: String(testMode) }
delete environment.LOCAL_VITE_ORIGIN
if (environment.FORCE_COLOR) delete environment.NO_COLOR
for (const name of ['SPACETIME_ACCESS_CLIENT_ID', 'SPACETIME_ACCESS_CLIENT_SECRET', 'SPACETIME_ISSUER', 'SPACETIME_INTERNAL_HOST'])
  delete environment[name]

type Identity = { identity: string; token: string }
type Credentials = { owner: Identity; operator: Identity; authSecret: string }

function stop() {
  requestedStop = true
  abort.abort()
}

const controller = createServer((request, response) => {
  if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.origin) return void response.writeHead(403).end()
  if (request.method === 'GET' && request.url === '/status') {
    response
      .writeHead(preview ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify(preview ?? {}))
  } else if (request.method === 'GET' && request.url === '/ready') {
    response.writeHead(preview?.ready ? 200 : 503).end(preview?.ready ? 'ready' : 'starting')
  } else if (request.method === 'POST' && request.url === '/stop' && request.headers.authorization === `Bearer ${token}`) {
    response.writeHead(200).end('stopping')
    stop()
  } else response.writeHead(404).end()
})

function start(command: string, args: string[], persistent = false, childEnvironment = environment) {
  abort.signal.throwIfAborted()
  const child = startLocalChild(command, args, childEnvironment)
  children.push(child)
  child.on('error', (error) => abort.abort(error))
  if (persistent)
    child.on('exit', (status, signal) => {
      if (!abort.signal.aborted) abort.abort(new Error(`${command} exited unexpectedly (${status ?? signal})`))
    })
  return child
}

async function run(command: string, args: string[]) {
  const started = performance.now()
  const child = start(command, args)
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (status) => resolve(status ?? 1))
  })
  children.splice(children.indexOf(child), 1)
  abort.signal.throwIfAborted()
  if (code !== 0) throw new Error(`${command} exited with status ${code}`)
  console.error(`Local startup: ${command} ${args.join(' ')} completed in ${Math.round(performance.now() - started)}ms`)
}

// A persistent child's exit aborts the wait sooner; a loaded CI runner can spend minutes warming the catalogue.
async function waitFor(url: string, ready: (response: Response) => boolean, timeout = 600_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    abort.signal.throwIfAborted()
    try {
      const response = await fetch(url, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(1_000)]) })
      if (ready(response)) return
    } catch {
      abort.signal.throwIfAborted()
    }
    await delay(500, undefined, { signal: abort.signal })
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function writePreview() {
  if (testMode) return
  await replaceFile(previewFile, (temporary) => writeFile(temporary, JSON.stringify(preview), { mode: 0o600 }))
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

/** Writes the module's logs, where its coverage build recorded each call, before SpacetimeDB stops. */
async function saveModuleLogs() {
  if (!moduleCoverage || !ownerToken) return
  const response = await fetch(`${spacetimeUrl}/v1/database/${database}/logs?num_lines=100000000`, {
    headers: { authorization: `Bearer ${ownerToken}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Local SpacetimeDB logs failed with HTTP ${response.status}`)
  await writeFile(path.join(moduleCoverage, 'logs.jsonl'), await response.text())
}

async function configure(value: Credentials) {
  ownerToken = value.owner.token
  const bundle = await readFile(path.join(root, 'module/spacetimedb/dist/bundle.js'))
  await publishSpacetimeModule({ url: spacetimeUrl, database, token: value.owner.token }, bundle, {
    environment: moduleEnvironment({ issuer: `${publicUrl}/api/auth`, audience: database, operator: value.operator.identity }),
    breakClients: true,
    timeoutMs: 60_000,
  })
  await callSpacetime({ url: spacetimeUrl, database, token: value.operator.token }, 'operator_health', [])
  const migrated = await migrateProductData({
    url: spacetimeUrl,
    database,
    ownerToken: value.owner.token,
    operatorToken: value.operator.token,
  })
  console.log(`Product data migration: ${migrated.rosters} rosters, ${migrated.collection} favourites`)
}

async function main() {
  const startedAt = performance.now()
  const timings: Record<string, number | boolean> = {}
  if (testMode) {
    if (path.dirname(root) !== '/tmp' || !TEST_STACK_NAME.test(path.basename(root))) {
      throw new Error('Tests require a fresh Praetorium directory directly under /tmp')
    }
    if (existsSync(root)) throw new Error(`Refusing to reset existing test data: ${root}`)
  } else if (root === worktree || !root.startsWith(`${worktree}${path.sep}`)) {
    throw new Error('Development data must stay inside this worktree')
  }
  await new Promise<void>((resolve, reject) => controller.once('error', reject).listen(controlPort, '0.0.0.0', resolve))
  const app = await reserveLocalPort(
    Number(process.env.LOCAL_APP_PORT ?? savedPreview?.appPort ?? (testMode ? 0 : 3000)),
    !testMode && !process.env.LOCAL_APP_PORT && !savedPreview?.ready,
  )
  reservations.push(app)
  const internal = await reserveLocalPort(Number(process.env.LOCAL_INTERNAL_PORT ?? savedPreview?.internalPort ?? 0))
  reservations.push(internal)
  const product = await reserveLocalPort(Number(process.env.LOCAL_SPACETIME_PORT ?? savedPreview?.spacetimePort ?? 0))
  reservations.push(product)
  appUrl = `http://127.0.0.1:${app.port}`
  publicUrl =
    process.env.LOCAL_PUBLIC_URL ??
    (process.env.LOCAL_APP_PORT ? appUrl : savedPreview?.appPort === app.port ? savedPreview.publicUrl : appUrl)
  spacetimeUrl = `http://127.0.0.1:${product.port}`
  database = !testMode && savedPreview?.dataDir === root ? savedPreview.database : `praetorium-local-${app.port}`
  if (!testMode && (existsSync(credentialsPath) || existsSync(path.join(root, 'auth.sqlite')))) {
    if (!savedPreview || savedPreview.dataDir !== root)
      throw new Error('Existing development data requires its original preview record; use a fresh LOCAL_DATA_DIR for another stack')
    assertSavedDevData(savedPreview, { dataDir: root, appPort: app.port, publicUrl })
  }
  await mkdir(root, { recursive: !testMode })
  ownsTestData = testMode
  if (testMode) await symlink(path.join(worktree, 'node_modules'), path.join(root, 'node_modules'), 'dir')
  const actualRoot = await realpath(root)
  if (!testMode && !actualRoot.startsWith(`${worktree}${path.sep}`)) throw new Error('Development data points outside this worktree')
  preview = {
    pid: process.pid,
    token,
    worktree,
    mode: testMode ? 'test' : 'dev',
    ready: false,
    appPort: app.port,
    internalPort: internal.port,
    spacetimePort: product.port,
    controlPort,
    database,
    dataDir: root,
    catalogueDir: catalogueDirectory,
    publicUrl,
  }
  if (!testMode) await mkdir(path.dirname(previewFile), { recursive: true })
  await writePreview()
  const { stdout } = await execute(cli, ['--version'], { signal: abort.signal })
  if (!stdout.includes(`spacetimedb tool version ${SPACETIME_VERSION};`))
    throw new Error(`Local development requires SpacetimeDB CLI ${SPACETIME_VERSION}`)
  await product.release()
  start(
    cli,
    ['start', '--listen-addr', `127.0.0.1:${product.port}`, '--data-dir', path.join(root, 'spacetimedb'), '--non-interactive'],
    true,
  )
  await waitFor(`${spacetimeUrl}/v1/database/${database}`, (response) => response.ok || response.status === 404)
  const value = await credentials()
  const moduleRoot = path.join(root, 'module')
  await rm(moduleRoot, { recursive: true, force: true })
  await cp('spacetimedb', path.join(moduleRoot, 'spacetimedb'), {
    recursive: true,
    filter: (source) => !['node_modules', 'dist'].includes(path.basename(source)),
  })
  await cp('src/core', path.join(moduleRoot, 'src/core'), { recursive: true })
  await cp('catalogue', path.join(moduleRoot, 'catalogue'), { recursive: true })
  await symlink(path.join(worktree, 'node_modules'), path.join(moduleRoot, 'node_modules'), 'dir')
  await symlink(path.join(worktree, 'spacetimedb/node_modules'), path.join(moduleRoot, 'spacetimedb/node_modules'), 'dir')
  await run(cli, ['build', '-p', path.join(moduleRoot, 'spacetimedb')])
  if (moduleCoverage) prepareModuleCoverage(path.join(moduleRoot, 'spacetimedb/dist/bundle.js'), moduleCoverage, worktree)
  await configure(value)
  timings.productSetupSeconds = (performance.now() - startedAt) / 1_000
  Object.assign(environment, {
    DATA_DIR: root,
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
    PORT: String(app.port),
    LOCAL_APP_PORT: String(app.port),
    NODE_INTERNAL_PORT: String(internal.port),
    ...(testMode
      ? {
          AUTH_RATE_LIMIT: 'off',
          CATALOGUE_UPDATE_MODE: 'off',
        }
      : { NODE_ENV: 'development' }),
  })
  const buildStartedAt = performance.now()
  if (testMode) {
    Object.assign(environment, browserTestBuildEnvironment(environment))
    const { cached } = await ensureBrowserTestBuild(
      worktree,
      catalogueDirectory,
      environment,
      buildDir,
      path.join(worktree, 'data-dev/e2e-build'),
      () => run('pnpm', ['build']),
    )
    timings.webBuildCached = cached
  } else {
    console.log('Preparing the local seed bundle; application pages will use Vite live reload')
    await run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.seed.config.ts'])
    if (existsSync(path.join(catalogueDirectory, 'revision.json'))) {
      environment.CATALOGUE_CANONICAL_FILE = path.join(buildDir, 'canonical-catalogue.json')
      environment.LOCAL_CANONICAL_FILE = environment.CATALOGUE_CANONICAL_FILE
      await run('pnpm', ['catalogue:compile'])
    }
    environment.LOCAL_VITE_ORIGIN = `http://127.0.0.1:${internal.port}`
  }
  timings.webBuildSeconds = (performance.now() - buildStartedAt) / 1_000
  const runtimeStartedAt = performance.now()
  await app.release()
  if (testMode) await internal.release()
  const web = start(process.execPath, ['scripts/nodeServer.ts'], true)
  if (!testMode) {
    const seedDeadline = Date.now() + 240_000
    while (!existsSync(environment.AUTH_SQLITE_PATH!)) {
      if (Date.now() > seedDeadline) throw new Error('Local authentication seed timed out')
      abort.signal.throwIfAborted()
      await delay(500, undefined, { signal: abort.signal })
    }
    await internal.release()
    start(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(internal.port), '--strictPort'],
      true,
      { ...environment, PORT: undefined, NODE_INTERNAL_PORT: undefined },
    )
  }
  await waitFor(`${appUrl}/api/health`, (response) => response.ok)
  timings.runtimeSeconds = (performance.now() - runtimeStartedAt) / 1_000
  timings.totalSeconds = (performance.now() - startedAt) / 1_000
  if (testMode) {
    console.error(`Browser-test startup: ${JSON.stringify(timings)}`)
    if (environment.LOCAL_STARTUP_REPORT) await writeFile(environment.LOCAL_STARTUP_REPORT, JSON.stringify(timings))
  }
  preview.ready = true
  await writePreview()
  console.log(`Local Praetorium (${testMode ? 'production browser test' : 'Vite development'}) is ready at ${appUrl}`)
  console.error(`Local startup: total ${Math.round(performance.now() - startedAt)}ms`)
  if (web.exitCode !== null) throw new Error('Web server exited during startup')
  await new Promise<void>((resolve) => {
    if (abort.signal.aborted) resolve()
    else abort.signal.addEventListener('abort', () => resolve(), { once: true })
  })
  if (!requestedStop) throw abort.signal.reason
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop)
const stopping = new Promise<void>((resolve, reject) =>
  abort.signal.addEventListener(
    'abort',
    () => {
      if (preview) preview.ready = false
      // A failure leaves the coverage run without the module's calls, which `scripts/e2eMap.ts` refuses.
      void saveModuleLogs()
        .catch((error: unknown) => console.error('Saving the SpacetimeDB module logs failed', error))
        .then(() => stopLocalChildren([...children]))
        .then(resolve, reject)
    },
    { once: true },
  ),
)
try {
  await main()
} catch (error) {
  if (!requestedStop) throw error
} finally {
  if (!abort.signal.aborted) abort.abort()
  await stopping
  await Promise.all(reservations.map((reservation) => reservation.release()))
  await closeServer(controller)
  if (ownsTestData) await rm(root, { recursive: true, force: true })
}
