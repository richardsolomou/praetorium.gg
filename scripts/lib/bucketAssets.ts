import { existsSync, readdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** A hashed build file's name, the only kind `publishWebAssets.ts` stores, so no other key reaches the bucket. */
export const WEB_ASSET_NAME = /^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/
export const WEB_ASSET_TYPES: Readonly<Record<string, string>> = {
  '.bin': 'application/octet-stream',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
}
const PASSED = ['cache-control', 'content-length', 'content-type', 'etag', 'last-modified'] as const

type Bucket = { base: string; fetch: (url: string, init: RequestInit) => Promise<Response> }

/**
 * Serves, from the shared asset bucket's API, a build file another release named: a tab keeps the chunks of the release
 * it opened with, and either replica of a rolling deploy may answer it. The release's own files, and every other path,
 * are left to the application (`false`), as is a file the bucket lacks too, whose miss the application answers uncached.
 */
export function bucketAssets(directory: string, bucket: Bucket) {
  const own = new Set(existsSync(directory) ? readdirSync(directory) : [])
  return (request: IncomingMessage, response: ServerResponse, application: () => void) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false
    const name = /^\/assets\/([^/?]+)(?:\?.*)?$/.exec(request.url ?? '')?.[1]
    if (!name || own.has(name) || !WEB_ASSET_NAME.test(name) || !WEB_ASSET_TYPES[path.extname(name)]) return false
    void serve(request, response, `${bucket.base}web-assets/${name}`, bucket, application)
    return true
  }
}

async function serve(request: IncomingMessage, response: ServerResponse, url: string, bucket: Bucket, application: () => void) {
  const headers = new Headers()
  for (const header of ['if-none-match', 'if-modified-since'] as const) {
    const value = request.headers[header]
    if (typeof value === 'string') headers.set(header, value)
  }
  try {
    const object = await bucket.fetch(url, { method: request.method, headers, signal: AbortSignal.timeout(10_000) })
    if (object.status === 404) {
      await object.body?.cancel()
      return application()
    }
    if (object.status !== 200 && object.status !== 304) {
      await object.body?.cancel()
      throw new Error(`Asset bucket answered ${object.status}`)
    }
    response.writeHead(
      object.status,
      Object.fromEntries(PASSED.flatMap((header) => (object.headers.get(header) ? [[header, object.headers.get(header)!]] : []))),
    )
    if (!object.body || object.status === 304 || request.method === 'HEAD') {
      await object.body?.cancel()
      response.end()
      return
    }
    await pipeline(Readable.fromWeb(object.body as import('node:stream/web').ReadableStream), response)
  } catch {
    if (!response.headersSent) {
      response.writeHead(502, { 'cache-control': 'no-store' })
      response.end()
    } else response.destroy()
  }
}
