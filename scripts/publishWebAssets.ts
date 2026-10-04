import { readdir, readFile, lstat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { publicAssetsR2Client } from '../src/server/r2Client.ts'

const CACHE = 'public, max-age=31536000, immutable'
const TYPES: Record<string, string> = {
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

async function bytes(response: Response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Web asset is too large')
  const reader = response.body?.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  if (reader)
    try {
      for (;;) {
        const result = await reader.read()
        if (result.done) break
        size += result.value.length
        if (size > MAX_BYTES) throw new Error('Web asset is too large')
        parts.push(result.value)
      }
    } finally {
      await reader.cancel()
    }
  return Buffer.concat(parts)
}

export async function publishWebAssets(
  directories: string[],
  storage: { base: string; request: typeof fetch },
  publicRequest = fetch,
  publicBase = 'https://s3.praetorium.gg',
) {
  const cancelled = new AbortController()
  const deadline = AbortSignal.timeout(300_000)
  const signal = () => AbortSignal.any([cancelled.signal, deadline, AbortSignal.timeout(30_000)])
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
  let next = 0
  let failed = false
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      try {
        while (next < entries.length) {
          if (failed) return
          const [name, file] = entries[next++]!
          const body = await readFile(file)
          const key = `web-assets/${name}`
          const url = new URL(key, storage.base)
          const existing = await storage.request(url, { signal: signal() })
          if (existing.status === 404) {
            await existing.body?.cancel()
            const uploaded = await storage.request(url, {
              method: 'PUT',
              body,
              headers: { 'content-type': TYPES[path.extname(name)]!, 'cache-control': CACHE, 'if-none-match': '*' },
              signal: signal(),
            })
            await uploaded.body?.cancel()
            if (!uploaded.ok && uploaded.status !== 412) throw new Error(`Web asset upload failed: ${name} (${uploaded.status})`)
          } else {
            if (!existing.ok || !(await bytes(existing)).equals(body)) throw new Error(`Stored web asset differs: ${name}`)
          }
          for (const request of [storage.request, publicRequest]) {
            const result = await request(request === storage.request ? url : `${publicBase}/${key}`, {
              cache: 'no-store',
              signal: signal(),
            })
            if (
              !result.ok ||
              result.headers.get('cache-control') !== CACHE ||
              result.headers.get('content-type')?.split(';')[0] !== TYPES[path.extname(name)] ||
              !(await bytes(result)).equals(body)
            )
              throw new Error(`Web asset verification failed: ${name}`)
          }
        }
      } catch (error) {
        failed = true
        cancelled.abort()
        throw error
      }
    }),
  )
  console.log(`Verified ${assets.size} shared web assets`)
}

export async function verifyWebAssetRoute(directories: string[], origin: string, request = fetch) {
  const cancelled = new AbortController()
  const deadline = AbortSignal.timeout(180_000)
  const signal = () => AbortSignal.any([cancelled.signal, deadline, AbortSignal.timeout(30_000)])
  const assets = new Map<string, string>()
  for (const directory of directories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.endsWith('.map')) continue
      assets.set(entry.name, path.join(directory, entry.name))
    }
  }
  const entries = [...assets]
  let next = 0
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      try {
        while (next < entries.length) {
          cancelled.signal.throwIfAborted()
          const [name, file] = entries[next++]!
          const expected = await readFile(file)
          const response = await request(new URL(`/assets/${name}`, origin), { cache: 'no-store', signal: signal() })
          if (!response.ok || response.headers.get('cache-control') !== CACHE || !(await bytes(response)).equals(expected))
            throw new Error(`Asset route verification failed: ${name}`)
        }
      } catch (error) {
        cancelled.abort()
        throw error
      }
    }),
  )
  const missing = await request(new URL(`/assets/deployment-probe-missing-${randomUUID()}.js`, origin), {
    cache: 'no-store',
    signal: signal(),
  })
  await missing.body?.cancel()
  if (missing.status !== 404 || missing.headers.get('cache-control') !== 'no-store') throw new Error('Asset misses must remain uncached')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const storage = publicAssetsR2Client()
  if (!storage) throw new Error('Public asset storage is required')
  const directories = process.argv.slice(2)
  if (!directories.length) throw new Error('Usage: publishWebAssets.ts <assets-directory> …')
  await publishWebAssets(directories, { base: storage.base, request: storage.client.fetch.bind(storage.client) })
}
