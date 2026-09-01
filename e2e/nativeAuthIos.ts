import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { openDatabase } from '../src/db/connection'
import { account, user } from '../src/db/schema'

const root = path.join(import.meta.dirname, '..')
const backendPort = Number(process.env.NATIVE_AUTH_BACKEND_PORT ?? 4274)
const publicPort = Number(process.env.NATIVE_AUTH_PUBLIC_PORT ?? 4273)
const postgresPort = backendPort + 20_000
const backendUrl = `http://127.0.0.1:${backendPort}`
const publicUrl = `https://localhost:${publicPort}`
const fixtureName = 'Native Auth Simulator'
const fixtureEmail = `native-auth-${randomUUID()}@example.test`
const events: string[] = []
const tlsDirectory = path.join(root, 'mobile', '.simulator-derived', 'native-auth-e2e', 'tls')
const tlsCertificate = path.join(tlsDirectory, 'localhost.crt')
const tlsKey = path.join(tlsDirectory, 'localhost.key')
let fixtureCookie = ''
let initialNativeRouteHandled = false
let expectedAuthenticatedDestination: URL | undefined
let stopStack: (() => void) | undefined
let proxy: ReturnType<typeof createHttpsServer> | undefined

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
        headers: { ...request.headers, host: new URL(publicUrl).host },
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
      if (request.method === 'GET' && requestUrl.pathname === '/' && request.headers['user-agent']?.includes('PraetoriumNative')) {
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

async function waitForHealth() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if ((await fetch(`${backendUrl}/api/health`).catch(() => null))?.ok) return
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

  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const [player] = await connection.database.select({ id: user.id }).from(user).where(eq(user.email, fixtureEmail)).limit(1)
    if (!player) throw new Error('The native authentication fixture account is missing.')
    await connection.database.insert(account).values({
      id: randomUUID(),
      accountId: createHash('sha256').update(fixtureEmail).digest('hex'),
      issuer: 'https://accounts.google.com',
      providerId: 'google',
      userId: player.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  } finally {
    await connection.close()
  }
}

async function bootedSimulator() {
  const devices = JSON.parse(await output('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'])) as {
    devices: Record<string, { udid: string }[]>
  }
  const udid = Object.values(devices.devices).flat()[0]?.udid
  if (!udid) throw new Error('Boot an iOS Simulator before running the native authentication test.')
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

async function main() {
  await run('sh', ['e2e/stack-down.sh', String(backendPort)])
  await ensureTlsCertificate()
  await startProxy()
  const stack = spawn('sh', ['e2e/stack.sh', String(backendPort)], {
    cwd: root,
    env: {
      ...process.env,
      CATALOGUE_HOST_DIR: process.env.CATALOGUE_DIR ?? path.join(root, 'catalogue-data'),
      GOOGLE_CLIENT_ID: 'native-auth-simulator',
      GOOGLE_CLIENT_SECRET: 'native-auth-simulator-secret',
      PLAYWRIGHT_APP_URL: publicUrl,
      PLAYWRIGHT_DATA_ROOT: `/tmp/praetorium-native-auth-ios-${backendPort}`,
      PLAYWRIGHT_IMAGE: process.env.PLAYWRIGHT_IMAGE ?? 'praetorium-e2e',
    },
    stdio: 'inherit',
  })
  stopStack = () => stack.kill('SIGTERM')
  await waitForHealth()
  await createFixture()
  const udid = await bootedSimulator()
  await run('xcrun', ['simctl', 'keychain', udid, 'add-root-cert', tlsCertificate])
  const mobile = path.join(root, 'mobile')
  const derived = path.join(mobile, '.simulator-derived', 'native-auth-e2e')
  const app = path.join(derived, 'Build', 'Products', 'Release-iphonesimulator', 'Praetorium.app')
  const buildEnvironment = { ...process.env, EXPO_PUBLIC_NATIVE_AUTH_TEST_APP_URL: publicUrl, SKIP_BUNDLING: '1' }
  if (process.env.NATIVE_AUTH_REUSE_BUILD !== '1') {
    await run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'ios', '--clean'], { cwd: mobile, env: buildEnvironment })
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
    await run(
      'pnpm',
      [
        'exec',
        'expo',
        'export:embed',
        '--entry-file',
        'index.ts',
        '--platform',
        'ios',
        '--dev',
        'false',
        '--minify',
        'true',
        '--bytecode',
        '--reset-cache',
        '--bundle-output',
        path.join(app, 'main.jsbundle'),
        '--assets-dest',
        app,
      ],
      { cwd: mobile, env: buildEnvironment },
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
  console.log(`Native authentication refreshed without an app restart: ${events.join(' -> ')}`)
}

try {
  await main()
} catch (error) {
  console.error(`Observed native authentication events: ${events.join(' -> ') || 'none'}`)
  throw error
} finally {
  if (proxy) await new Promise<void>((resolve) => proxy!.close(() => resolve()))
  stopStack?.()
  await run('sh', ['e2e/stack-down.sh', String(backendPort)]).catch(() => undefined)
}
