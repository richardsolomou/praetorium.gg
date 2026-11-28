import fs from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { bucketAssets } from './bucketAssets'

const IMMUTABLE = 'public, max-age=31536000, immutable'
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bucket-assets-'))
fs.writeFileSync(path.join(directory, 'current-CCCCCCCC.js'), 'current')
const servers: ReturnType<typeof createServer>[] = []
afterEach(() => {
  for (const server of servers.splice(0)) server.close()
})

/** A replica front holding `current-CCCCCCCC.js`, whose application answers every request it is passed as `application`. */
async function replica(object: (url: string) => Response) {
  const bucket = vi.fn(async (url: string) => object(url))
  const serve = bucketAssets(directory, { base: 'https://account.r2.test/praetorium/', fetch: bucket })
  const server = createServer((request, response) => {
    const application = () => {
      response.writeHead(404, { 'cache-control': 'no-store' })
      response.end('application')
    }
    if (!serve(request, response, application)) application()
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { bucket, get: (pathname: string) => fetch(origin + pathname) }
}

it("streams another release's chunk from the bucket with the bucket's headers", async () => {
  const { bucket, get } = await replica(
    () => new Response('previous', { headers: { 'cache-control': IMMUTABLE, 'content-type': 'text/javascript' } }),
  )
  const response = await get('/assets/previous-PPPPPPPP.js')
  expect({
    status: response.status,
    cacheControl: response.headers.get('cache-control'),
    contentType: response.headers.get('content-type'),
    body: await response.text(),
    url: bucket.mock.calls[0]?.[0],
  }).toEqual({
    status: 200,
    cacheControl: IMMUTABLE,
    contentType: 'text/javascript',
    body: 'previous',
    url: 'https://account.r2.test/praetorium/web-assets/previous-PPPPPPPP.js',
  })
})

it("asks the bucket for no key but another release's hashed file", async () => {
  const { bucket, get } = await replica(() => new Response('bucket'))
  for (const pathname of [
    '/assets/current-CCCCCCCC.js',
    '/assets/plain.js',
    '/assets/..%2Fsecret-PPPPPPPP.js',
    '/assets/notes-PPPPPPPP.txt',
  ])
    await (await get(pathname)).body?.cancel()
  expect(bucket).not.toHaveBeenCalled()
})

it('leaves a file the bucket lacks to the application, uncached', async () => {
  const { get } = await replica(() => new Response('', { status: 404 }))
  const response = await get('/assets/missing-MMMMMMMM.js')
  expect({ status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.text() }).toEqual({
    status: 404,
    cacheControl: 'no-store',
    body: 'application',
  })
})
