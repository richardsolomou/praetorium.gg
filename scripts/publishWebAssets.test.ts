import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { publishWebAssets, verifyWebAssetRoute } from './publishWebAssets'
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
async function assets() {
  const directory = await mkdtemp(path.join(tmpdir(), 'web-assets-'))
  directories.push(directory)
  await writeFile(path.join(directory, 'index-abcdefgh.js'), 'export const ready = true')
  await writeFile(path.join(directory, 'index-abcdefgh.js.map'), 'private source')
  return directory
}
const headers = { 'cache-control': 'public, max-age=31536000, immutable', 'content-type': 'text/javascript' }
const etag = (body: string) => `"${createHash('md5').update(body).digest('hex')}"`
const urlOf = (url: Parameters<typeof fetch>[0]) => (url instanceof Request ? url.url : url.toString())

/** Answers like R2: HEAD carries the MD5 ETag, PUT stores, GET returns the stored bytes. */
function storage(stored = new Map<string, string>()) {
  const request = vi.fn<typeof fetch>(async (url, options) => {
    const key = urlOf(url)
    if (options?.method === 'PUT') {
      stored.set(key, Buffer.from(options.body as Uint8Array).toString())
      return new Response(null)
    }
    if (!stored.has(key)) return new Response(null, { status: 404 })
    if (options?.method === 'HEAD') return new Response(null, { headers: { ...headers, etag: etag(stored.get(key)!) } })
    return new Response(stored.get(key), { headers })
  })
  const publicRequest = vi.fn<typeof fetch>(
    async (url) => new Response(stored.get(`https://storage.test${new URL(urlOf(url)).pathname}`), { headers }),
  )
  return { stored, request, publicRequest }
}

it('uploads and verifies retained old and new assets without publishing source maps', async () => {
  const directory = await assets()
  const previous = await assets()
  await writeFile(path.join(previous, 'old-abcdefgh.js'), 'old lazy chunk')
  const { stored, request, publicRequest } = storage(new Map([['https://storage.test/web-assets/retained-abcdefgh.js', 'retained chunk']]))
  await publishWebAssets([previous, directory], { base: 'https://storage.test/', request }, publicRequest)
  expect(Object.fromEntries(stored)).toEqual({
    'https://storage.test/web-assets/retained-abcdefgh.js': 'retained chunk',
    'https://storage.test/web-assets/old-abcdefgh.js': 'old lazy chunk',
    'https://storage.test/web-assets/index-abcdefgh.js': 'export const ready = true',
  })
})
it('leaves an asset already stored with the same bytes untouched', async () => {
  const { request, publicRequest } = storage(new Map([['https://storage.test/web-assets/index-abcdefgh.js', 'export const ready = true']]))
  await publishWebAssets([await assets()], { base: 'https://storage.test/', request }, publicRequest)
  expect(request.mock.calls.map(([, options]) => options?.method)).toEqual(['HEAD'])
})
it('stops before overwriting an immutable name with different bytes', async () => {
  const { request } = storage(new Map([['https://storage.test/web-assets/index-abcdefgh.js', 'different']]))
  await expect(publishWebAssets([await assets()], { base: 'https://storage.test/', request })).rejects.toThrow('Stored web asset differs')
  expect(request.mock.calls.map(([, options]) => options?.method ?? 'GET')).toEqual(['HEAD', 'GET'])
})
it('keeps a stored asset whose code differs only in its PostHog chunk id', async () => {
  const chunk = (id: string) => `!function(){e._posthogChunkIds[n]="${id}"}();\nexport const ready = true\n//# chunkId=${id}`
  const directory = await mkdtemp(path.join(tmpdir(), 'web-assets-'))
  directories.push(directory)
  await writeFile(path.join(directory, 'index-abcdefgh.js'), chunk('11111111-1111-4111-8111-111111111111'))
  const storedChunk = chunk('22222222-2222-4222-8222-222222222222')
  const { stored, request, publicRequest } = storage(new Map([['https://storage.test/web-assets/index-abcdefgh.js', storedChunk]]))
  await publishWebAssets([directory], { base: 'https://storage.test/', request }, publicRequest)
  expect(stored.get('https://storage.test/web-assets/index-abcdefgh.js')).toBe(storedChunk)
})
it('fails publication if the public CDN serves stale bytes', async () => {
  const { request } = storage()
  await expect(
    publishWebAssets([await assets()], { base: 'https://storage.test/', request }, async () => new Response('stale', { headers })),
  ).rejects.toThrow('Web asset verification failed')
})
it('retries a storage request that times out', async () => {
  const { request, publicRequest } = storage()
  const flaky = vi.fn<typeof fetch>(async (url, options) => {
    if (flaky.mock.calls.length === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    return request(url, options)
  })
  await publishWebAssets([await assets()], { base: 'https://storage.test/', request: flaky }, publicRequest, undefined, 1)
  expect(publicRequest).toHaveBeenCalledTimes(1)
})
it('fails publication on persistent storage errors without treating them as missing files', async () => {
  const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }))
  await expect(publishWebAssets([await assets()], { base: 'https://storage.test/', request }, fetch, undefined, 1)).rejects.toThrow(
    'Web asset storage answered 503',
  )
  expect(request.mock.calls.map(([, options]) => options?.method)).toEqual(['HEAD', 'HEAD', 'HEAD', 'HEAD'])
})
it('rejects files without immutable build names', async () => {
  const directory = await assets()
  await writeFile(path.join(directory, 'index.js'), 'unhashed')
  await expect(publishWebAssets([directory], { base: 'https://storage.test/', request: fetch })).rejects.toThrow('Unsupported web asset')
})

it('rejects a failed upload before declaring assets ready', async () => {
  const request = vi.fn<typeof fetch>(async (_url, options) => new Response(null, { status: options?.method === 'PUT' ? 403 : 404 }))
  await expect(publishWebAssets([await assets()], { base: 'https://storage.test/', request })).rejects.toThrow('Web asset upload failed')
})
it('rejects cacheable misses on the hosted asset route', async () => {
  const request: typeof fetch = async (url) =>
    new Response('export const ready = true', {
      status: (url instanceof Request ? url.url : url.toString()).includes('deployment-probe-missing') ? 404 : 200,
      headers,
    })
  await expect(verifyWebAssetRoute([await assets()], 'https://app.test', request)).rejects.toThrow('Asset misses must remain uncached')
})

it('checks each hosted asset once with eight concurrent workers', async () => {
  const directory = await assets()
  for (let index = 0; index < 7; index++) await writeFile(path.join(directory, `chunk${index}-abcdefgh.js`), 'export const ready = true')
  let active = 0
  let peak = 0
  const checked: string[] = []
  const request: typeof fetch = async (url) => {
    const pathname = new URL(url instanceof Request ? url.url : url.toString()).pathname
    if (pathname.includes('deployment-probe-missing')) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
    checked.push(pathname)
    peak = Math.max(peak, ++active)
    await new Promise((resolve) => setTimeout(resolve, 10))
    active--
    return new Response('export const ready = true', { headers })
  }
  await verifyWebAssetRoute([directory, directory], 'https://app.test', request)
  expect({ peak, requests: checked.length, unique: new Set(checked).size }).toEqual({ peak: 8, requests: 8, unique: 8 })
})

it('publishes compressed reference bytes unchanged as an immutable binary asset', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'web-reference-'))
  directories.push(directory)
  const body = new Uint8Array([31, 139, 8, 0, 255, 128])
  await writeFile(path.join(directory, 'reference-abcdefgh.bin'), body)
  let uploaded: Uint8Array<ArrayBuffer> | undefined
  let uploadedHeaders: Headers | undefined
  const binaryHeaders = { ...headers, 'content-type': 'application/octet-stream' }
  const request: typeof fetch = async (_url, options) => {
    if (options?.method === 'PUT') {
      uploaded = new Uint8Array(options.body as Uint8Array)
      uploadedHeaders = new Headers(options.headers)
      return new Response(null)
    }
    return uploaded ? new Response(uploaded, { headers: binaryHeaders }) : new Response(null, { status: 404 })
  }
  await publishWebAssets(
    [directory],
    { base: 'https://storage.test/', request },
    async () => new Response(uploaded, { headers: binaryHeaders }),
  )
  expect({
    bytes: Array.from(uploaded!),
    type: uploadedHeaders?.get('content-type'),
    encoding: uploadedHeaders?.get('content-encoding'),
  }).toEqual({ bytes: Array.from(body), type: 'application/octet-stream', encoding: null })
})

it('retries a hosted asset read whose connection drops', async () => {
  let resets = 0
  const request: typeof fetch = async (url) => {
    if ((url instanceof Request ? url.url : url.toString()).includes('deployment-probe-missing'))
      return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
    if (resets++ < 2) throw new TypeError('fetch failed', { cause: new Error('read ECONNRESET') })
    return new Response('export const ready = true', { headers })
  }
  await expect(verifyWebAssetRoute([await assets()], 'https://app.test', request, 1)).resolves.toBeUndefined()
})

it('fails a hosted asset read that keeps dropping', async () => {
  const request: typeof fetch = async () => {
    throw new TypeError('fetch failed', { cause: new Error('read ECONNRESET') })
  }
  await expect(verifyWebAssetRoute([await assets()], 'https://app.test', request, 1)).rejects.toThrow('fetch failed')
})

it('retries a hosted asset read that times out or meets a gateway error', async () => {
  const failures: (() => Response)[] = [
    () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    },
    () => new Response(null, { status: 502 }),
  ]
  const request: typeof fetch = async (url) => {
    if (urlOf(url).includes('deployment-probe-missing'))
      return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
    return failures.shift()?.() ?? new Response('export const ready = true', { headers })
  }
  await expect(verifyWebAssetRoute([await assets()], 'https://app.test', request, 1)).resolves.toBeUndefined()
})
