import type { R2Bucket } from '@cloudflare/workers-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publicObject } from '../../cloudflare/publicObjects'

const hash = 'a'.repeat(64)
const object = () => ({
  httpEtag: '"etag"',
  body: new ReadableStream({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode('image'))
      controller.close()
    },
  }),
})
const head = vi.fn(async () => object())
const get = vi.fn(async () => object())
const bucket = { head, get } as unknown as R2Bucket

describe('publicObject', () => {
  beforeEach(() => vi.clearAllMocks())
  it('streams a public avatar from its existing URL', async () => {
    const response = await publicObject(new Request(`https://s3.praetorium.gg/praetorium/avatars/${hash}.webp`), bucket)
    expect([response.status, response.headers.get('content-type'), await response.text()]).toEqual([200, 'image/webp', 'image'])
    expect(response.headers.get('x-praetorium-object-source')).toBe('r2')
    expect(get).toHaveBeenCalledWith(`praetorium/avatars/${hash}.webp`)
  })

  it('does not expose backup or audit objects', async () => {
    const response = await publicObject(new Request('https://s3.praetorium.gg/praetorium/combat-rule-judgments/v1/private.json'), bucket)
    expect(response.status).toBe(404)
    expect(get).not.toHaveBeenCalledWith('praetorium/combat-rule-judgments/v1/private.json')
  })

  it('does not serve a mutable pointer from an unapproved key', async () => {
    const response = await publicObject(new Request('https://s3.praetorium.gg/praetorium/snapshots/latest.zip'), bucket)
    expect(response.status).toBe(404)
  })

  it('uses a no-store policy for the current pointer', async () => {
    const response = await publicObject(new Request('https://s3.praetorium.gg/praetorium/current.json'), bucket)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects writes to the public route', async () => {
    const response = await publicObject(new Request('https://s3.praetorium.gg/praetorium/current.json', { method: 'PUT' }), bucket)
    expect(response.status).toBe(405)
  })

  it('serves HEAD without reading the object body', async () => {
    const response = await publicObject(
      new Request(`https://s3.praetorium.gg/praetorium/snapshots/${hash}.zip`, { method: 'HEAD' }),
      bucket,
    )
    expect([response.status, response.body]).toEqual([200, null])
    expect(head).toHaveBeenCalledWith(`praetorium/snapshots/${hash}.zip`)
  })
})
