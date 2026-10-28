import { readdir, readFile, lstat } from 'node:fs/promises'
import { hash, randomUUID } from 'node:crypto'
import path from 'node:path'
import pRetry from 'p-retry'
import { boundedBytes } from '../src/server/boundedBody.ts'
import { forEachConcurrently } from '../src/shared/forEachConcurrently.ts'
import { publicAssetsR2Client } from '../src/server/r2Client.ts'
import { isEntryPoint } from './lib/entryPoint.ts'

const CACHE = 'public, max-age=31536000, immutable'
const CONCURRENT_REQUESTS = 32
const TYPES: Record<string, string> = {
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
const MAX_BYTES = 10_000_000

const bytes = (response: Response) => boundedBytes(response, MAX_BYTES, 'Web asset is too large')

/**
 * PostHog's build plugin stamps each chunk with a random id after its name is hashed,
 * so two builds of unchanged code share a name and differ only in that id.
 */
const CHUNK_ID = /(_posthogChunkIds\[n\]="|\/\/# chunkId=)[0-9a-f-]{36}/g
const withoutChunkId = (code: Buffer) => code.toString('utf8').replace(CHUNK_ID, '$1')

class TransientResponse extends Error {}

const transient = (response: Response) => response.status === 429 || response.status >= 500

/** Repeats one whole request, body included, when the network or the server failed rather than the bytes. */
function retryTransient<T>(attempt: () => Promise<T>, stopped: AbortSignal, retryMs: number) {
  return pRetry(attempt, {
    retries: 3,
    minTimeout: retryMs,
    shouldRetry: ({ error }) =>
      !stopped.aborted && (error instanceof TransientResponse || error instanceof TypeError || error.name === 'TimeoutError'),
  })
}

/** A timeout names no request, so the asset it was for is added. */
const timedOut = (error: unknown, name: string) =>
  error instanceof Error && error.name === 'TimeoutError' ? new Error(`Web asset request timed out: ${name}`, { cause: error }) : error

export async function publishWebAssets(
  directories: string[],
  storage: { base: string; request: typeof fetch },
  publicRequest = fetch,
  publicBase = 'https://s3.praetorium.gg',
  retryMs = 1_000,
) {
  const cancelled = new AbortController()
  const stopped = AbortSignal.any([cancelled.signal, AbortSignal.timeout(300_000)])
  const signal = () => AbortSignal.any([stopped, AbortSignal.timeout(30_000)])
  const assets = new Map<string, string>()
  let total = 0
  for (const directory of directories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.endsWith('.map')) continue
      if (!entry.isFile() || !/^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(entry.name) || !TYPES[path.extname(entry.name)])
        throw new Error(`Unsupported web asset: ${entry.name}`)
      const file = path.join(directory, entry.name)
      const stat = await lstat(file)
      total += stat.size
      if (stat.size > MAX_BYTES || total > 100_000_000 || assets.size >= 5_000) throw new Error('Web asset publication exceeds its limit')
      if (assets.has(entry.name) && !(await readFile(assets.get(entry.name)!)).equals(await readFile(file)))
        throw new Error(`Web asset name collision: ${entry.name}`)
      assets.set(entry.name, file)
    }
  }
  if (!assets.size) throw new Error('No web assets found')
  const entries = [...assets]
  let uploaded = 0
  await forEachConcurrently(entries, CONCURRENT_REQUESTS, async ([name, file]) => {
    try {
      stopped.throwIfAborted()
      const body = await readFile(file)
      const key = `web-assets/${name}`
      const url = new URL(key, storage.base)
      // R2 answers a single-part object's MD5 as its ETag, so a stored asset is compared without downloading it.
      const etag = await retryTransient(
        async () => {
          const existing = await storage.request(url, { method: 'HEAD', signal: signal() })
          if (transient(existing)) throw new TransientResponse(`Web asset storage answered ${existing.status}`)
          if (existing.status === 404) return null
          if (!existing.ok) throw new Error(`Web asset storage read failed: ${name} (${existing.status})`)
          return existing.headers.get('etag') ?? ''
        },
        stopped,
        retryMs,
      )
      if (etag !== null) {
        if (etag === `"${hash('md5', body)}"`) return
        const stored = await retryTransient(
          async () => {
            const existing = await storage.request(url, { signal: signal() })
            if (transient(existing)) throw new TransientResponse(`Web asset storage answered ${existing.status}`)
            if (!existing.ok) throw new Error(`Web asset storage read failed: ${name} (${existing.status})`)
            return bytes(existing)
          },
          stopped,
          retryMs,
        )
        // Clients may already hold the stored copy, so it stays; the same code under another chunk id is that copy.
        if (withoutChunkId(stored) !== withoutChunkId(body)) throw new Error(`Stored web asset differs: ${name}`)
        return
      }
      await retryTransient(
        async () => {
          const response = await storage.request(url, {
            method: 'PUT',
            body,
            headers: { 'content-type': TYPES[path.extname(name)]!, 'cache-control': CACHE, 'if-none-match': '*' },
            signal: signal(),
          })
          await response.body?.cancel()
          if (transient(response)) throw new TransientResponse(`Web asset upload answered ${response.status}`)
          if (!response.ok && response.status !== 412) throw new Error(`Web asset upload failed: ${name} (${response.status})`)
        },
        stopped,
        retryMs,
      )
      for (const request of [storage.request, publicRequest]) {
        await retryTransient(
          async () => {
            const result = await request(request === storage.request ? url : `${publicBase}/${key}`, {
              cache: 'no-store',
              signal: signal(),
            })
            if (transient(result)) {
              await result.body?.cancel()
              throw new TransientResponse(`Web asset read answered ${result.status}`)
            }
            if (
              !result.ok ||
              result.headers.get('cache-control') !== CACHE ||
              result.headers.get('content-type')?.split(';')[0] !== TYPES[path.extname(name)] ||
              !(await bytes(result)).equals(body)
            )
              throw new Error(`Web asset verification failed: ${name}`)
          },
          stopped,
          retryMs,
        )
      }
      uploaded++
    } catch (error) {
      cancelled.abort()
      throw timedOut(error, name)
    }
  })
  console.log(`Verified ${assets.size} shared web assets (${uploaded} uploaded)`)
}

export async function verifyWebAssetRoute(directories: string[], origin: string, request = fetch, retryMs = 1_000) {
  const cancelled = new AbortController()
  const stopped = AbortSignal.any([cancelled.signal, AbortSignal.timeout(180_000)])
  const signal = () => AbortSignal.any([stopped, AbortSignal.timeout(30_000)])
  const assets = new Map<string, string>()
  for (const directory of directories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.endsWith('.map')) continue
      assets.set(entry.name, path.join(directory, entry.name))
    }
  }
  const entries = [...assets]
  await forEachConcurrently(entries, CONCURRENT_REQUESTS, async ([name, file]) => {
    try {
      stopped.throwIfAborted()
      const expected = await readFile(file)
      await retryTransient(
        async () => {
          const response = await request(new URL(`/assets/${name}`, origin), { cache: 'no-store', signal: signal() })
          if (transient(response)) {
            await response.body?.cancel()
            throw new TransientResponse(`Asset route answered ${response.status}: ${name}`)
          }
          if (!response.ok || response.headers.get('cache-control') !== CACHE || !(await bytes(response)).equals(expected))
            throw new Error(`Asset route verification failed: ${name}`)
        },
        stopped,
        retryMs,
      )
    } catch (error) {
      cancelled.abort()
      throw timedOut(error, name)
    }
  })
  const missing = await retryTransient(
    () => request(new URL(`/assets/deployment-probe-missing-${randomUUID()}.js`, origin), { cache: 'no-store', signal: signal() }),
    stopped,
    retryMs,
  )
  await missing.body?.cancel()
  if (missing.status !== 404 || missing.headers.get('cache-control') !== 'no-store') throw new Error('Asset misses must remain uncached')
}

if (isEntryPoint(import.meta.url)) {
  const storage = publicAssetsR2Client()
  if (!storage) throw new Error('Public asset storage is required')
  const directories = process.argv.slice(2)
  if (!directories.length) throw new Error('Usage: publishWebAssets.ts <assets-directory> …')
  await publishWebAssets(directories, { base: storage.base, request: storage.client.fetch.bind(storage.client) })
}
