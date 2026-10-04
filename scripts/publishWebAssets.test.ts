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
it('uploads and verifies retained old and new assets without publishing source maps', async () => {
  const directory = await assets()
  const previous = await assets()
  await writeFile(path.join(previous, 'old-abcdefgh.js'), 'old lazy chunk')
  const stored = new Map<string, string>([['https://storage.test/web-assets/retained-abcdefgh.js', 'retained chunk']])
  const request = vi.fn<typeof fetch>(async (url, options) => {
    const key = url instanceof Request ? url.url : url.toString()
    if (options?.method === 'PUT') {
      stored.set(key, Buffer.from(options.body as Uint8Array).toString())
      return new Response(null)
    }
    return stored.has(key) ? new Response(stored.get(key), { headers }) : new Response(null, { status: 404 })
  })
  const publicRequest = vi.fn<typeof fetch>(
    async (url) =>
      new Response(stored.get(`https://storage.test${new URL(url instanceof Request ? url.url : url.toString()).pathname}`), { headers }),
  )
  await publishWebAssets([previous, directory], { base: 'https://storage.test/', request }, publicRequest)
  expect(Object.fromEntries(stored)).toEqual({
    'https://storage.test/web-assets/retained-abcdefgh.js': 'retained chunk',
    'https://storage.test/web-assets/old-abcdefgh.js': 'old lazy chunk',
    'https://storage.test/web-assets/index-abcdefgh.js': 'export const ready = true',
  })
})
it('stops before overwriting an immutable name with different bytes', async () => {
  const request = vi.fn<typeof fetch>(async () => new Response('different', { headers }))
  await expect(publishWebAssets([await assets()], { base: 'https://storage.test/', request })).rejects.toThrow('Stored web asset differs')
  expect(request).toHaveBeenCalledTimes(1)
})
it('fails publication if the public CDN serves stale bytes', async () => {
  const request = vi.fn<typeof fetch>(async () => new Response('export const ready = true', { headers }))
  await expect(
    publishWebAssets([await assets()], { base: 'https://storage.test/', request }, async () => new Response('stale', { headers })),
  ).rejects.toThrow('Web asset verification failed')
})
it('fails publication on storage errors without treating them as missing files', async () => {
  const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }))
  await expect(publishWebAssets([await assets()], { base: 'https://storage.test/', request })).rejects.toThrow('Stored web asset differs')
  expect(request).toHaveBeenCalledTimes(1)
})
it('rejects files without immutable build names', async () => {
  const directory = await assets()
  await writeFile(path.join(directory, 'index.js'), 'unhashed')
  await expect(publishWebAssets([directory], { base: 'https://storage.test/', request: fetch })).rejects.toThrow('Unsupported web asset')
})

it('rejects a failed upload before declaring assets ready', async () => {
  const request = vi.fn<typeof fetch>(async (_url, options) => new Response(null, { status: options?.method === 'PUT' ? 503 : 404 }))
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

it('checks each hosted asset once with four concurrent workers', async () => {
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
  expect({ peak, requests: checked.length, unique: new Set(checked).size }).toEqual({ peak: 4, requests: 8, unique: 8 })
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
