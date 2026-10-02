import { execFile as execFileCallback } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import type { Socket } from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import httpProxy from 'http-proxy'
import { backupAuthSqlite, importAuthSqlite, migrateAuthSqlite } from './nodeAuthSqlite.ts'
import { localPublicObject } from '../src/server/localPublicObject.ts'
import { localObjectStore } from '../src/server/localObjectStore.ts'
import { publicAssetsR2Client } from '../src/server/r2Client.ts'

const execFile = promisify(execFileCallback)

type SpacetimeRoute = 'identity' | 'exchange' | 'subscribe' | null

export function spacetimeRoute(request: Pick<IncomingMessage, 'url' | 'method' | 'headers'>, database: string): SpacetimeRoute {
  if (!request.url?.startsWith('/') || request.url.startsWith('//') || request.url.length > 4_096) return null
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname === '/spacetime/v1/identity' && request.method === 'POST') return 'identity'
  if (pathname === '/spacetime/v1/identity/websocket-token' && request.method === 'POST') return 'exchange'
  if (
    pathname === `/spacetime/v1/database/${database}/subscribe` &&
    request.method === 'GET' &&
    request.headers.upgrade?.toLowerCase() === 'websocket'
  )
    return 'subscribe'
  return null
}

export function spacetimeOrigin(environment: NodeJS.ProcessEnv) {
  const upstream = new URL(environment.SPACETIME_URL ?? '')
  const internal =
    /^[a-z][a-z0-9-]{1,63}$/.test(environment.SPACETIME_INTERNAL_HOST ?? '') && upstream.hostname === environment.SPACETIME_INTERNAL_HOST
  const loopback = ['localhost', '127.0.0.1'].includes(upstream.hostname)
  if (
    (upstream.protocol !== 'https:' && !(upstream.protocol === 'http:' && (internal || loopback))) ||
    upstream.pathname !== '/' ||
    upstream.username ||
    upstream.password ||
    upstream.search ||
    upstream.hash
  )
    throw new Error('Invalid SpacetimeDB proxy origin')
  return upstream
}

/**
 * During a rolling deploy one replica's pages name hashed assets the other replica lacks. Cloudflare caches an
 * uncached 404 for a static path and tells browsers to keep it for hours, which breaks the new build long after
 * both replicas match.
 */
export function uncacheAssetMiss(request: Pick<IncomingMessage, 'url'>, response: Pick<IncomingMessage, 'statusCode' | 'headers'>) {
  if (request.url?.startsWith('/assets/') && (response.statusCode ?? 0) >= 400) response.headers['cache-control'] = 'no-store'
}

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > 4_096) return null
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

function send(response: ServerResponse, status: number, body?: Uint8Array) {
  response.writeHead(status, { 'cache-control': 'no-store', ...(body ? { 'content-type': 'application/json' } : {}) })
  response.end(body)
}

async function serveLocalObject(request: IncomingMessage, response: ServerResponse, root: string) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const headers = new Headers()
  if (request.headers['if-none-match']) headers.set('if-none-match', request.headers['if-none-match'])
  const result = await localPublicObject(new Request(url, { method: request.method, headers }), localObjectStore(root))
  response.writeHead(result.status, Object.fromEntries(result.headers))
  response.end(result.body ? Buffer.from(await result.arrayBuffer()) : undefined)
}

async function proxySpacetimeHttp(request: IncomingMessage, response: ServerResponse, route: 'identity' | 'exchange', upstream: URL) {
  if (route === 'exchange' && !request.headers.authorization?.startsWith('Bearer ')) return send(response, 401)
  if (Number(request.headers['content-length'] ?? 0) > 4_096) return send(response, 413)
  const body = await requestBody(request)
  if (!body) return send(response, 413)
  const target = new URL(request.url!.slice('/spacetime'.length), upstream)
  const headers = new Headers()
  if (route === 'exchange') headers.set('authorization', request.headers.authorization!)
  headers.set('content-type', request.headers['content-type'] ?? 'application/json')
  if (process.env.SPACETIME_ACCESS_CLIENT_ID && process.env.SPACETIME_ACCESS_CLIENT_SECRET) {
    headers.set('CF-Access-Client-Id', process.env.SPACETIME_ACCESS_CLIENT_ID)
    headers.set('CF-Access-Client-Secret', process.env.SPACETIME_ACCESS_CLIENT_SECRET)
  }
  try {
    const result = await fetch(target, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000), redirect: 'manual' })
    send(response, result.status, new Uint8Array(await result.arrayBuffer()))
  } catch {
    send(response, 502)
  }
}

export async function startNodeServer() {
  if (process.env.APPLE_PRIVATE_KEY_BASE64) {
    if (process.env.APPLE_PRIVATE_KEY) throw new Error('Configure one Apple private key source')
    process.env.APPLE_PRIVATE_KEY = Buffer.from(process.env.APPLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
  }
  const authPath = process.env.AUTH_SQLITE_PATH
  if (!authPath || !path.isAbsolute(authPath)) throw new Error('AUTH_SQLITE_PATH must be absolute')
  if (!existsSync(authPath) && process.env.AUTH_INITIALIZE_EMPTY === 'true') {
    const migration = fileURLToPath(new URL('../drizzle-auth/0000_curly_gambit.sql', import.meta.url))
    if (process.env.PRAETORIUM_SEED_PREVIEW === 'true') {
      const temporary = `${authPath}.${randomUUID()}.seed`
      try {
        await importAuthSqlite(migration, temporary)
        await execFile(process.execPath, [fileURLToPath(new URL('../.output/server/seed-preview.mjs', import.meta.url))], {
          env: { ...process.env, AUTH_SQLITE_PATH: temporary },
          maxBuffer: 4_000_000,
          timeout: 180_000,
        })
        await backupAuthSqlite(temporary, authPath)
      } finally {
        await Promise.all([temporary, `${temporary}-wal`, `${temporary}-shm`].map((file) => rm(file, { force: true })))
      }
    } else {
      await importAuthSqlite(migration, authPath)
    }
  }
  if (!existsSync(authPath)) throw new Error('Auth SQLite file is missing')
  migrateAuthSqlite(authPath)
  if (!publicAssetsR2Client() && process.env.PRAETORIUM_LOCAL_DEV !== 'true' && process.env.PRAETORIUM_SEED_PREVIEW !== 'true') {
    throw new Error('Object storage is required')
  }
  const publicPort = Number(process.env.PORT ?? 3000)
  const internalPort = Number(process.env.NODE_INTERNAL_PORT ?? 3001)
  if (
    !Number.isInteger(publicPort) ||
    publicPort < 1 ||
    publicPort > 65_535 ||
    !Number.isInteger(internalPort) ||
    internalPort < 1 ||
    internalPort > 65_535 ||
    publicPort === internalPort
  )
    throw new Error('Invalid Node server ports')
  const database = process.env.SPACETIME_DATABASE ?? ''
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) throw new Error('Invalid SpacetimeDB database')
  const upstream = spacetimeOrigin(process.env)
  const viteOrigin = process.env.PRAETORIUM_LOCAL_DEV === 'true' ? process.env.LOCAL_VITE_ORIGIN : undefined
  if (!viteOrigin) {
    process.env.NITRO_PORT = String(internalPort)
    process.env.NITRO_HOST = '127.0.0.1'
    await import(new URL('../.output/server/index.mjs', import.meta.url).href)
  }
  const appOrigin = viteOrigin ?? `http://127.0.0.1:${internalPort}`
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${appOrigin}/api/health`, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) {
        ready = true
        break
      }
    } catch {
      // The application is still warming its catalogue.
    }
    await delay(1_000)
  }
  if (!ready) throw new Error('Node server did not become healthy')
  const proxy = httpProxy.createProxyServer({ changeOrigin: false, xfwd: true })
  proxy.on('proxyRes', (proxyResponse, request) => uncacheAssetMiss(request, proxyResponse))
  proxy.on('proxyReqWs', (upstreamRequest, request) => {
    if (!request.url?.startsWith(`/v1/database/${database}/subscribe`)) return
    if (process.env.SPACETIME_ACCESS_CLIENT_ID && process.env.SPACETIME_ACCESS_CLIENT_SECRET) {
      upstreamRequest.setHeader('CF-Access-Client-Id', process.env.SPACETIME_ACCESS_CLIENT_ID)
      upstreamRequest.setHeader('CF-Access-Client-Secret', process.env.SPACETIME_ACCESS_CLIENT_SECRET)
    }
  })
  const appError = (_error: Error, _request: IncomingMessage, response: ServerResponse | Socket) => {
    if ('writeHead' in response && !response.headersSent) send(response, 502)
    else response.destroy()
  }
  const server = createServer((request, response) => {
    if (
      process.env.PRAETORIUM_LOCAL_DEV === 'true' &&
      ['/praetorium/', '/catalogue/', '/avatars/'].some((prefix) => request.url?.startsWith(prefix))
    ) {
      void serveLocalObject(request, response, process.env.LOCAL_OBJECT_DIR!).catch((error: unknown) =>
        appError(error as Error, request, response),
      )
      return
    }
    if (request.url?.startsWith('/spacetime/')) {
      const route = spacetimeRoute(request, database)
      if (route === 'identity' || route === 'exchange') {
        void proxySpacetimeHttp(request, response, route, upstream)
        return
      }
      send(response, 404)
      return
    }
    proxy.web(request, response, { target: appOrigin }, appError)
  })
  server.on('upgrade', (request, socket, head) => {
    if (spacetimeRoute(request, database) === 'subscribe') {
      delete request.headers.cookie
      delete request.headers['cf-access-client-id']
      delete request.headers['cf-access-client-secret']
      request.url = request.url!.slice('/spacetime'.length)
      proxy.ws(request, socket, head, { target: upstream.origin.replace(/^http/, 'ws'), changeOrigin: true }, appError)
    } else if (
      viteOrigin &&
      ['vite-hmr', 'vite-ping'].some((protocol) => request.headers['sec-websocket-protocol']?.split(',').includes(protocol))
    ) {
      proxy.ws(request, socket, head, { target: viteOrigin, changeOrigin: true }, appError)
    } else {
      socket.destroy()
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(publicPort, '0.0.0.0', resolve)
  })
  console.log(`Node server ready on port ${publicPort}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await startNodeServer()
}
