import { describe, expect, it } from 'vitest'
import type { PreviewCard } from '../contracts/linkPreview'
import { previewResponse, previewSvg, renderPreview } from './previewImage'

const battle = (player: string): PreviewCard => ({
  kind: 'battle',
  stage: 'Live',
  status: 'Round 2 · Shooting phase',
  footer: '2000 points',
  sides: [
    { score: 34, armies: [{ player, faction: 'Necrons' }] },
    { score: 21, armies: [{ player: 'Bob', faction: 'Orks' }] },
  ],
})

/** Width and height from a PNG's header chunk, which always follows the eight-byte signature. */
const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

describe('preview images', () => {
  it('render at the size unfurling clients ask for', async () => {
    expect(pngSize(await renderPreview(battle('Alice')))).toEqual({ width: 1200, height: 630 })
  })

  it('draw a typed name as outlines rather than markup', async () => {
    expect(await previewSvg(battle('<script>alert("owned")</script>'))).not.toMatch(/script|alert|owned/)
  })

  it('serve a found card as a cacheable PNG', async () => {
    const response = await previewResponse(async () => ({ card: battle('Alice'), maxAge: 60 }))
    expect([response.status, response.headers.get('content-type'), response.headers.get('cache-control')]).toEqual([
      200,
      'image/png',
      'public, max-age=60',
    ])
  })

  it('answer a card nobody may see as not found, and never cache that', async () => {
    const response = await previewResponse(async () => null)
    expect([response.status, response.headers.get('cache-control')]).toEqual([404, 'no-store'])
  })

  it('turn a request away once the renders waiting are bounded', async () => {
    const gate = deferred()
    const held = Array.from({ length: 18 }, () =>
      previewResponse(async () => {
        await gate.promise
        return null
      }),
    )
    const refused = await previewResponse(async () => null)
    gate.resolve()
    await Promise.all(held)
    expect([refused.status, refused.headers.get('retry-after')]).toEqual([503, '5'])
  })

  it('serve again once the queue drains', async () => {
    const gate = deferred()
    const held = Array.from({ length: 18 }, () =>
      previewResponse(async () => {
        await gate.promise
        return null
      }),
    )
    gate.resolve()
    await Promise.all(held)
    expect((await previewResponse(async () => null)).status).toBe(404)
  })
})
