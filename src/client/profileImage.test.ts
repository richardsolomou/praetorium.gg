import { afterEach, describe, expect, it, vi } from 'vitest'

import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'
import { prepareProfileImage } from './profileImage'

function installBrowser(encodable: string[], bytesFor: (edge: number, type: string, quality: number) => number) {
  const toBlob = vi.fn((callback: (blob: Blob) => void, type: string, quality: number, edge: number) => {
    const actualType = encodable.includes(type) ? type : 'image/png'
    callback(new Blob([new Uint8Array(bytesFor(edge, actualType, quality))], { type: actualType }))
  })
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob(callback: (blob: Blob) => void, type: string, quality: number) {
      toBlob(callback, type, quality, this.width)
    },
  }

  vi.stubGlobal('document', { createElement: () => canvas })
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 768, close: vi.fn() }))
  vi.stubGlobal(
    'FileReader',
    class {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      readAsDataURL(blob: Blob) {
        this.result = `data:${blob.type};base64,${'a'.repeat(4 * Math.ceil(blob.size / 3))}`
        this.onload?.()
      }
    },
  )

  return toBlob
}

function file() {
  return new File(['picture'], 'picture.png', { type: 'image/png' })
}

afterEach(() => vi.unstubAllGlobals())

describe('prepareProfileImage', () => {
  it('keeps WebP when the browser can encode it', async () => {
    installBrowser(['image/webp', 'image/jpeg', 'image/png'], () => 1000)

    await expect(prepareProfileImage(file())).resolves.toMatch(/^data:image\/webp;base64,/)
  })

  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    const toBlob = installBrowser(['image/jpeg', 'image/png'], () => 1000)

    await expect(prepareProfileImage(file())).resolves.toMatch(/^data:image\/jpeg;base64,/)
    expect(toBlob.mock.calls.some((call) => call[1] === 'image/jpeg')).toBe(true)
  })

  it('shrinks the edge when quality alone leaves the image over the cap', async () => {
    const toBlob = installBrowser(['image/webp'], (edge) => (edge === 256 ? PROFILE_IMAGE_MAX_LENGTH : 10))

    await prepareProfileImage(file())

    expect(toBlob.mock.calls.some((call) => call[3] === 192)).toBe(true)
  })

  it('reports failure when no pass fits under the cap', async () => {
    installBrowser(['image/webp'], () => PROFILE_IMAGE_MAX_LENGTH)

    await expect(prepareProfileImage(file())).rejects.toThrow('could not be made small enough')
  })
})
