import { afterEach, describe, expect, it, vi } from 'vitest'

import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'
import { prepareProfileImage } from './profileImage'

type FakeBlob = { type: string; bytes: number }

// Model a canvas encoder: `encodable` is the set of types the browser can write, and
// `bytesFor` decides the encoded size. A browser returns PNG when the requested type is
// not encodable, matching the canvas specification and Safari's WebP behaviour.
function installBrowser(encodable: string[], bytesFor: (edge: number, type: string, quality: number) => number) {
  const toBlob = vi.fn((callback: (blob: FakeBlob | null) => void, type: string, quality: number, edge: number) => {
    const actual = encodable.includes(type) ? type : 'image/png'
    callback({ type: actual, bytes: bytesFor(edge, actual, quality) })
  })

  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) }
      return { ...canvas, toBlob: (cb: never, type: string, quality: number) => toBlob(cb, type, quality, canvas.width) }
    },
  })
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 768, close: () => {} }))
  vi.stubGlobal(
    'FileReader',
    class {
      result = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL(blob: FakeBlob) {
        this.result = `data:${blob.type};base64,${'A'.repeat(blob.bytes)}`
        this.onload?.()
      }
    },
  )

  return toBlob
}

function file() {
  return { type: 'image/png', size: 5000 } as unknown as File
}

afterEach(() => vi.unstubAllGlobals())

describe('prepareProfileImage', () => {
  it('keeps WebP when the browser can encode it', async () => {
    installBrowser(['image/webp', 'image/jpeg', 'image/png'], () => 1000)

    const image = await prepareProfileImage(file())

    expect(image.startsWith('data:image/webp')).toBe(true)
  })

  it('falls back to JPEG when the browser returns PNG for a WebP request', async () => {
    // Safari on iOS: WebP is not encodable, so every WebP request yields an oversized PNG.
    const toBlob = installBrowser(['image/jpeg', 'image/png'], (edge, type) =>
      type === 'image/png' ? PROFILE_IMAGE_MAX_LENGTH + 1 : 1000,
    )

    const image = await prepareProfileImage(file())

    expect(image.startsWith('data:image/jpeg')).toBe(true)
    expect(toBlob.mock.calls.some((call) => call[1] === 'image/jpeg')).toBe(true)
  })

  it('shrinks the edge when quality alone leaves the image over the cap', async () => {
    // JPEG at the full edge stays over the cap; a smaller edge brings it under.
    installBrowser(['image/jpeg', 'image/png'], (edge) => (edge >= 256 ? PROFILE_IMAGE_MAX_LENGTH + 1 : 1000))

    const image = await prepareProfileImage(file())

    expect(image.startsWith('data:image/jpeg')).toBe(true)
    expect(image.length).toBeLessThanOrEqual(PROFILE_IMAGE_MAX_LENGTH)
  })

  it('reports failure when no pass fits under the cap', async () => {
    installBrowser(['image/jpeg', 'image/png'], () => PROFILE_IMAGE_MAX_LENGTH + 1)

    await expect(prepareProfileImage(file())).rejects.toThrow('could not be made small enough')
  })
})
