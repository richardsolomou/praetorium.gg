import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer, request as httpsRequest, type Server as HttpsServer } from 'node:https'
import path from 'node:path'
import { localControlPort } from '../scripts/localDevPreview'
import { localTestEnvironment, reserveLocalPort } from '../scripts/lib/localStack'
import { withAuthSql } from './storage'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { parseAppSnapshot } from '../src/contracts/appSnapshot'

const root = path.join(import.meta.dirname, '..')
const stackEnvironment = await localTestEnvironment('native-auth-ios', { PLAYWRIGHT_PORT: process.env.NATIVE_AUTH_BACKEND_PORT })
const backendPort = Number(stackEnvironment.PLAYWRIGHT_PORT)
const publicReservation = await reserveLocalPort(Number(process.env.NATIVE_AUTH_PUBLIC_PORT ?? 0))
const publicPort = publicReservation.port
const dataDirectory = stackEnvironment.PLAYWRIGHT_DATA_ROOT
const backendUrl = `http://127.0.0.1:${backendPort}`
const readyUrl = `http://127.0.0.1:${stackEnvironment.PLAYWRIGHT_READY_PORT}/ready`
const publicUrl = `https://localhost:${publicPort}`
const fixtureName = 'Native Auth Simulator'
const fixtureEmail = `native-auth-${randomUUID()}@example.test`
const events: string[] = []
const nativeAppVersion = (JSON.parse(readFileSync(path.join(root, 'mobile', 'app.json'), 'utf8')) as { expo: { version: string } }).expo
  .version
const expectedNativeUserAgent = `PraetoriumNative/${nativeAppVersion}`
const tlsDirectory = path.join(root, 'mobile', '.simulator-derived', 'native-auth-e2e', 'tls')
const tlsCertificate = path.join(tlsDirectory, 'localhost.crt')
const tlsKey = path.join(tlsDirectory, 'localhost.key')
let fixtureCookie = ''
let fixtureUserId = ''
let initialNativeRouteHandled = false
let expectedAuthenticatedDestination: URL | undefined
let stopStack: (() => Promise<void>) | undefined
let deviceReservation: Awaited<ReturnType<typeof reserveLocalPort>> | undefined
let proxy: HttpsServer | undefined

function isExpectedAuthenticatedDestination(target: URL, withMarker: boolean) {
  if (!expectedAuthenticatedDestination || target.pathname !== expectedAuthenticatedDestination.pathname) return false
  const actual = new URLSearchParams(target.search)
  if (withMarker) actual.delete('__native_auth')
  const expected = new URLSearchParams(expectedAuthenticatedDestination.search)
  actual.sort()
  expected.sort()
  return actual.toString() === expected.toString()
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd ?? root, env: options.env ?? process.env, stdio: 'inherit' })
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}.`))
    })
    child.once('error', reject)
  })
}

function output(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    let stdout = ''
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'inherit'] })
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${command} exited with ${code ?? signal}.`))
    })
    child.once('error', reject)
  })
}

async function ensureTlsCertificate() {
  if (existsSync(tlsCertificate) && existsSync(tlsKey)) return
  mkdirSync(tlsDirectory, { recursive: true })
  await run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-sha256',
    '-days',
    '3650',
    '-nodes',
    '-keyout',
    tlsKey,
    '-out',
    tlsCertificate,
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign',
  ])
}

function requestPublic(pathname: string, method: string, headers: Record<string, string>, body?: string) {
  return new Promise<{ body: string; headers: IncomingMessage['headers']; status: number }>((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: '127.0.0.1',
        port: publicPort,
        path: pathname,
        method,
        headers: { ...headers, host: new URL(publicUrl).host },
        ca: readFileSync(tlsCertificate),
        servername: 'localhost',
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.once('end', () =>
          resolve({ body: Buffer.concat(chunks).toString(), headers: response.headers, status: response.statusCode ?? 502 }),
        )
      },
    )
    request.once('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

function forward(request: IncomingMessage, response: ServerResponse) {
  const target = new URL(request.url ?? '/', backendUrl)
  return new Promise<void>((resolve, reject) => {
    const forwarded = httpRequest(
      {
        hostname: '127.0.0.1',
        port: backendPort,
        path: `${target.pathname}${target.search}`,
        method: request.method,
        headers: {
          ...request.headers,
          host: new URL(publicUrl).host,
          'x-forwarded-host': new URL(publicUrl).host,
          'x-forwarded-proto': 'https',
        },
      },
      (upstream) => {
        const status = upstream.statusCode ?? 502
        const pathname = target.pathname
        if (pathname.endsWith('/native-auth-token/exchange')) events.push(`exchange:${status}`)
        if (pathname.endsWith('/native-auth-token/consume')) events.push(`consume:${status}`)
        if (target.searchParams.has('__native_auth') && isExpectedAuthenticatedDestination(target, true)) {
          events.push(`authenticated-redirect:${status}`)
        }
        if (isExpectedAuthenticatedDestination(target, false) && request.headers.cookie?.includes('session_token')) {
          events.push(`authenticated-reload:${status}`)
        }
        response.writeHead(status, upstream.headers)
        upstream.pipe(response)
        upstream.once('end', resolve)
      },
    )
    forwarded.once('error', reject)
    request.pipe(forwarded)
  })
}

async function nativeAuth(requestUrl: URL, response: ServerResponse) {
  const action = requestUrl.searchParams.get('action')
  const challenge = requestUrl.searchParams.get('challenge')
  const next = requestUrl.searchParams.get('next')
  const provider = requestUrl.searchParams.get('provider')
  const destination = next ? new URL(next, publicUrl) : null
  if (action !== 'sign-in' || !challenge || !destination || destination.origin !== publicUrl || provider !== 'google' || !fixtureCookie) {
    response.writeHead(400).end('Invalid native authentication fixture request.')
    return
  }
  expectedAuthenticatedDestination = destination
  events.push('native-auth-start')
  const generated = await requestPublic(
    '/api/auth/native-auth-token/generate',
    'POST',
    { 'content-type': 'application/json', cookie: fixtureCookie, origin: publicUrl },
    JSON.stringify({ action, challenge, next, provider }),
  )
  if (generated.status !== 200) {
    response.writeHead(502).end(`Proof generation returned ${generated.status}.`)
    return
  }
  const exchange = JSON.parse(generated.body) as { id: string; token: string }
  const callback = new URL('praetorium://auth')
  for (const [name, value] of Object.entries({ action, challenge, next, provider, version: '3', ...exchange })) {
    callback.searchParams.set(name, value)
  }
  response.writeHead(302, { location: callback.toString(), 'cache-control': 'no-store' }).end()
}

function startProxy() {
  proxy = createHttpsServer({ cert: readFileSync(tlsCertificate), key: readFileSync(tlsKey) }, (request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? '/', publicUrl)
      if (request.method === 'GET' && requestUrl.pathname === '/native-auth') {
        await nativeAuth(requestUrl, response)
        return
      }
      const userAgentProducts = request.headers['user-agent']?.split(/\s+/) ?? []
      if (request.method === 'GET' && requestUrl.pathname === '/' && userAgentProducts.includes(expectedNativeUserAgent)) {
        if (initialNativeRouteHandled) {
          await forward(request, response)
          return
        }
        initialNativeRouteHandled = true
        response.writeHead(302, { location: '/sign-in' }).end()
        return
      }
      await forward(request, response)
    })().catch((error: unknown) => {
      console.error(error)
      if (!response.headersSent) response.writeHead(502)
      response.end('Native authentication test proxy failed.')
    })
  })
  return new Promise<void>((resolve, reject) => {
    proxy!.once('error', reject)
    proxy!.listen(publicPort, '127.0.0.1', resolve)
  })
}

async function waitForHealth(stack: ChildProcess) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (stack.exitCode !== null || stack.signalCode !== null) throw new Error('The native test stack stopped before becoming healthy')
    if ((await fetch(readyUrl).catch(() => null))?.ok) return
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error('The native authentication test stack did not become healthy.')
}

async function createFixture() {
  const response = await requestPublic(
    '/api/auth/sign-up/email',
    'POST',
    { 'content-type': 'application/json', origin: publicUrl },
    JSON.stringify({ email: fixtureEmail, name: fixtureName, password: 'a-long-enough-password' }),
  )
  if (response.status !== 200) throw new Error(`Fixture account creation returned ${response.status}.`)
  fixtureCookie = (response.headers['set-cookie'] ?? []).map((cookie) => cookie.split(';', 1)[0]).join('; ')
  if (!fixtureCookie) throw new Error('Fixture account creation did not return a session cookie.')

  const player = await withAuthSql(
    (database) => database.prepare('SELECT id FROM user WHERE email = ? LIMIT 1').get(fixtureEmail) as { id: string } | undefined,
    dataDirectory,
  )
  if (!player) throw new Error('The native authentication fixture account is missing.')
  fixtureUserId = player.id
  await withAuthSql(
    (database) =>
      database
        .prepare('INSERT INTO account (id, accountId, issuer, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          randomUUID(),
          createHash('sha256').update(fixtureEmail).digest('hex'),
          'https://accounts.google.com',
          'google',
          player.id,
          Date.now(),
          Date.now(),
        ),
    dataDirectory,
  )
  if (process.env.NATIVE_OFFLINE_VERIFY === '1') await seedSavedApp()
}

function fixtureOperator() {
  const credentials = JSON.parse(readFileSync(path.join(dataDirectory, 'credentials.json'), 'utf8')) as { operator: { token: string } }
  return new SpacetimeOperator(
    `http://127.0.0.1:${stackEnvironment.PLAYWRIGHT_SPACETIME_PORT}/`,
    `praetorium-local-${backendPort}`,
    credentials.operator.token,
  )
}

async function seedSavedApp(updated = false) {
  const operator = fixtureOperator()
  const source = await operator.roster('preview-necrons-cursed-skyshroud')
  if (!source) throw new Error('The native offline roster fixture is missing')
  await operator.saveRoster({
    ...source,
    id: 'native-saved-army',
    userId: fixtureUserId,
    name: updated ? 'Updated native army' : 'Native saved army',
    automaticName: false,
    now: Date.now(),
  })
  const opponentIds = await operator.practiceOpponentIds()
  await operator.createBattle({
    id: updated ? 'native-cache-game-new' : 'native-cache-game',
    token: updated ? 'native-cache-game-new' : 'native-cache-game',
    userId: fixtureUserId,
    opponentIds: opponentIds.slice(0, 1),
    now: Date.now(),
    initialCommand: {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      clockLimitMinutes: null,
    },
  })
}

async function waitForSavedApp(udid: string) {
  const container = (await output('xcrun', ['simctl', 'get_app_container', udid, 'gg.praetorium', 'data'])).trim()
  const origin = Array.from(publicUrl, (character) => character.charCodeAt(0).toString(16)).join('')
  const referenceDirectory = path.join(container, 'Documents', 'offline-app', origin)
  const snapshotDirectory = path.join(container, 'Documents', 'app-state', origin)
  for (let attempt = 0; attempt < 180; attempt++) {
    try {
      const latest = readdirSync(snapshotDirectory)
        .filter((name) => /^\d+-[\w-]+\.json$/.test(name))
        .sort()
        .at(-1)
      const snapshot = latest ? parseAppSnapshot(JSON.parse(readFileSync(path.join(snapshotDirectory, latest), 'utf8'))) : null
      if (
        existsSync(referenceDirectory) &&
        snapshot?.owner === fixtureUserId &&
        JSON.stringify(snapshot).includes('Native saved army') &&
        snapshot.queries.some((query) => query.key[0] === 'saved-roster-page')
      )
        return
    } catch {
      /* The first background save is still in progress. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('The application bundle and account data were not saved automatically')
}

async function terminateSavedRenderer(udid: string) {
  const processes = (await output('ps', ['-ax', '-o', 'pid=,ppid=,comm=']))
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
    .filter((row) => row !== null)
  const app = processes.find((row) => row[3].includes(`/Devices/${udid}/`) && row[3].endsWith('/Praetorium.app/Praetorium'))
  if (!app) throw new Error('The owned simulator application is not running')
  const renderers = processes.filter((row) => row[2] === app[2] && row[3].endsWith('/com.apple.WebKit.WebContent'))
  if (!renderers.length) throw new Error('The owned simulator has no WebView renderer to terminate')
  for (const row of renderers) process.kill(Number(row[1]), 'SIGKILL')
}

async function bootedSimulator() {
  const devices = JSON.parse(await output('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'])) as {
    devices: Record<string, { udid: string }[]>
  }
  const booted = Object.values(devices.devices).flat()
  const requested = process.env.NATIVE_AUTH_SIMULATOR_UDID
  const udid = requested ? booted.find((device) => device.udid === requested)?.udid : booted.length === 1 ? booted[0].udid : undefined
  if (!udid) throw new Error('Select one booted iOS Simulator with NATIVE_AUTH_SIMULATOR_UDID when more than one is booted.')
  return udid
}

function assertFlow() {
  const expected = ['native-auth-start', 'exchange:302', 'authenticated-redirect:200', 'consume:200', 'authenticated-reload:200']
  let position = -1
  for (const event of expected) {
    position = events.indexOf(event, position + 1)
    if (position < 0) throw new Error(`Native authentication stopped before ${event}. Observed: ${events.join(', ')}`)
  }
}

async function assertPushRegistered() {
  const credentials = JSON.parse(readFileSync(path.join(dataDirectory, 'credentials.json'), 'utf8')) as {
    operator: { token: string }
  }
  const operator = new SpacetimeOperator(
    `http://127.0.0.1:${stackEnvironment.PLAYWRIGHT_SPACETIME_PORT}/`,
    `praetorium-local-${backendPort}`,
    credentials.operator.token,
  )
  const targets = await operator.pushTargets([fixtureUserId])
  if (targets.length !== 1) throw new Error(`Expected one registered simulator push device, found ${targets.length}.`)
}

function skipLocalPostHogUpload(projectFile: string) {
  const project = readFileSync(projectFile, 'utf8')
  const wrapper =
    /`\\"\$NODE_BINARY\\" --print \\"require\('path'\)\.join\(require\('path'\)\.dirname\(require\.resolve\('posthog-react-native'\)\), '\.\.', 'tooling', 'posthog-xcode\.sh'\)\\"` /
  if (!wrapper.test(project)) throw new Error('The PostHog Xcode wrapper was not found in the generated project.')
  writeFileSync(projectFile, project.replace(wrapper, ''))
}

async function main() {
  const udid = await bootedSimulator()
  deviceReservation = await reserveLocalPort(localControlPort(`native-auth-device:${udid}`))
  await ensureTlsCertificate()
  await publicReservation.release()
  await startProxy()
  const stack = spawn(process.execPath, ['--import', 'tsx', 'scripts/localDev.ts'], {
    cwd: root,
    env: {
      ...process.env,
      CATALOGUE_DIR: process.env.CATALOGUE_DIR ?? path.join(root, 'catalogue-data'),
      GOOGLE_CLIENT_ID: 'native-auth-simulator',
      GOOGLE_CLIENT_SECRET: 'native-auth-simulator-secret',
      LOCAL_PUBLIC_URL: publicUrl,
      LOCAL_APP_PORT: String(backendPort),
      LOCAL_INTERNAL_PORT: stackEnvironment.PLAYWRIGHT_INTERNAL_PORT,
      LOCAL_SPACETIME_PORT: stackEnvironment.PLAYWRIGHT_SPACETIME_PORT,
      LOCAL_READY_PORT: stackEnvironment.PLAYWRIGHT_READY_PORT,
      LOCAL_DATA_DIR: dataDirectory,
      LOCAL_TEST_MODE: 'true',
      EXPO_PUSH_ACCESS_TOKEN: 'unused-native-e2e-token',
      NODE_EXTRA_CA_CERTS: tlsCertificate,
    },
    stdio: 'inherit',
  })
  stopStack = async () => {
    if (stack.exitCode !== null || stack.signalCode !== null) return
    const exited = new Promise<void>((resolve) => stack.once('exit', () => resolve()))
    stack.kill('SIGTERM')
    await exited
  }
  await waitForHealth(stack)
  await createFixture()
  await run('xcrun', ['simctl', 'keychain', udid, 'add-root-cert', tlsCertificate])
  const mobile = path.join(root, 'mobile')
  const derived = path.join(mobile, '.simulator-derived', 'native-auth-e2e')
  const app = path.join(derived, 'Build', 'Products', 'Release-iphonesimulator', 'Praetorium.app')
  const buildEnvironment = { ...process.env, EXPO_PUBLIC_NATIVE_AUTH_TEST_APP_URL: publicUrl }
  if (process.env.NATIVE_AUTH_REUSE_BUILD !== '1') {
    await run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'ios', '--clean'], { cwd: mobile, env: buildEnvironment })
    skipLocalPostHogUpload(path.join(mobile, 'ios', 'Praetorium.xcodeproj', 'project.pbxproj'))
    await run(
      'xcodebuild',
      [
        '-workspace',
        path.join(mobile, 'ios', 'Praetorium.xcworkspace'),
        '-scheme',
        'Praetorium',
        '-configuration',
        'Release',
        '-sdk',
        'iphonesimulator',
        '-destination',
        `platform=iOS Simulator,id=${udid}`,
        '-derivedDataPath',
        derived,
        'ARCHS=arm64',
        'ONLY_ACTIVE_ARCH=YES',
        'build',
      ],
      { env: buildEnvironment },
    )
  }
  await run('codesign', ['--force', '--sign', '-', app])
  await run('xcrun', ['simctl', 'uninstall', udid, 'gg.praetorium']).catch(() => undefined)
  await run('xcrun', ['simctl', 'install', udid, app])
  await run('xcrun', ['simctl', 'launch', udid, 'gg.praetorium'])
  const javaHome = process.env.JAVA_HOME ?? (existsSync('/opt/homebrew/opt/openjdk@21') ? '/opt/homebrew/opt/openjdk@21' : undefined)
  await run(
    'maestro',
    [
      'test',
      '--udid',
      udid,
      '--test-output-dir',
      path.join(root, 'test-results', 'native-auth-ios'),
      path.join(root, 'e2e', 'native-auth-ios.yaml'),
    ],
    {
      env: {
        ...process.env,
        ...(javaHome ? { JAVA_HOME: javaHome, PATH: `${javaHome}/bin:${process.env.PATH ?? ''}` } : {}),
        MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
        MAESTRO_CLI_NO_ANALYTICS: 'true',
      },
    },
  )
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  assertFlow()
  await assertPushRegistered()
  console.log(`Native authentication refreshed without an app restart: ${events.join(' -> ')}`)
  console.log('Simulator notification permission and device registration succeeded.')
  if (process.env.NATIVE_OFFLINE_VERIFY === '1') {
    const maestroEnvironment = {
      ...process.env,
      ...(javaHome ? { JAVA_HOME: javaHome, PATH: `${javaHome}/bin:${process.env.PATH ?? ''}` } : {}),
      MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
      MAESTRO_CLI_NO_ANALYTICS: 'true',
    }
    await run(
      'maestro',
      [
        'test',
        '--udid',
        udid,
        '--test-output-dir',
        path.join(root, 'test-results', 'native-offline-ios'),
        path.join(root, 'e2e', 'native-offline-save-ios.yaml'),
      ],
      { env: maestroEnvironment },
    )
    await waitForSavedApp(udid)
    const offlineProxy = proxy
    proxy?.closeAllConnections()
    if (proxy) await new Promise<void>((resolve) => proxy!.close(() => resolve()))
    proxy = undefined
    await run('xcrun', ['simctl', 'terminate', udid, 'gg.praetorium'])
    await run('xcrun', ['simctl', 'launch', udid, 'gg.praetorium'])
    await run(
      'maestro',
      [
        'test',
        '--udid',
        udid,
        '--test-output-dir',
        path.join(root, 'test-results', 'native-offline-ios'),
        path.join(root, 'e2e', 'native-offline-read-ios.yaml'),
      ],
      { env: maestroEnvironment },
    )
    console.log('Saved reference reopened after a cold launch with the service unreachable.')
    await terminateSavedRenderer(udid)
    await run(
      'maestro',
      [
        'test',
        '--udid',
        udid,
        '--test-output-dir',
        path.join(root, 'test-results', 'native-offline-ios'),
        path.join(root, 'e2e', 'native-offline-recovery-ios.yaml'),
      ],
      { env: maestroEnvironment },
    )
    console.log('Saved WebView recovered its current rule after renderer termination while disconnected.')
    proxy = offlineProxy
    await new Promise<void>((resolve) => proxy!.listen(publicPort, '127.0.0.1', resolve))
    await seedSavedApp(true)
    await run(
      'maestro',
      [
        'test',
        '--udid',
        udid,
        '--test-output-dir',
        path.join(root, 'test-results', 'native-offline-ios'),
        path.join(root, 'e2e', 'native-offline-resume-ios.yaml'),
      ],
      { env: maestroEnvironment },
    )
    console.log('Saved reference revalidated on foreground without navigating away from the current rule.')
  }
}

try {
  await main()
  if (process.env.NATIVE_AUTH_KEEP_STACK === '1') {
    writeFileSync(
      path.join(tlsDirectory, '..', 'preview-owner.json'),
      JSON.stringify({ pid: process.pid, origin: publicUrl, dataDirectory }),
    )
    console.log(`Native preview remains available at ${publicUrl}; stop the owning process ${process.pid} to clean up.`)
    await new Promise<void>((resolve) => {
      process.once('SIGTERM', resolve)
      process.once('SIGINT', resolve)
    })
  }
} catch (error) {
  console.error(`Observed native authentication events: ${events.join(' -> ') || 'none'}`)
  throw error
} finally {
  await stopStack?.()
  proxy?.closeAllConnections()
  if (proxy) await new Promise<void>((resolve) => proxy!.close(() => resolve()))
  await publicReservation.release()
  await deviceReservation?.release()
}
