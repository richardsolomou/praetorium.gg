import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareProfileImage } from './profileImage'

afterEach(() => vi.unstubAllGlobals())

describe('prepareProfileImage', () => {
  it('reduces a complex picture until it fits the profile image limit', async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob(callback: (blob: Blob) => void) {
        callback(new Blob([new Uint8Array(this.width === 256 ? 120_000 : 10)], { type: 'image/webp' }))
      },
    }
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1024, height: 768, close: vi.fn() })),
    )
    vi.stubGlobal('document', { createElement: () => canvas })
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

    await expect(prepareProfileImage(new File(['picture'], 'picture.png', { type: 'image/png' }))).resolves.toMatch(
      /^data:image\/webp;base64,/,
    )
  })
})
