import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareFeedbackScreenshot } from './screenshot'

function installBrowser({ width, height, encodable }: { width: number; height: number; encodable: string[] }) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob(callback: (blob: Blob) => void, type: string) {
      const actual = encodable.includes(type) ? type : 'image/png'
      callback(new Blob([new Uint8Array(10)], { type: actual }))
    },
  }
  vi.stubGlobal('document', { createElement: () => canvas })
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: vi.fn() }))
  vi.stubGlobal(
    'FileReader',
    class {
      result: string | null = null
      onload: (() => void) | null = null
      readAsDataURL(blob: Blob) {
        this.result = `data:${blob.type};base64,AAAA`
        this.onload?.()
      }
    },
  )
  return canvas
}

const image = () => new File(['x'], 'shot.png', { type: 'image/png' })

afterEach(() => vi.unstubAllGlobals())

describe('prepareFeedbackScreenshot', () => {
  it('scales the longest edge down to 1920 pixels', async () => {
    const canvas = installBrowser({ width: 3840, height: 2160, encodable: ['image/webp'] })
    await prepareFeedbackScreenshot(image())
    expect([canvas.width, canvas.height]).toEqual([1920, 1080])
  })

  it('keeps a small screenshot at its own size', async () => {
    const canvas = installBrowser({ width: 800, height: 600, encodable: ['image/webp'] })
    await prepareFeedbackScreenshot(image())
    expect([canvas.width, canvas.height]).toEqual([800, 600])
  })

  it('falls back to JPEG where the browser cannot encode WebP', async () => {
    installBrowser({ width: 800, height: 600, encodable: ['image/jpeg'] })
    expect(await prepareFeedbackScreenshot(image())).toMatch(/^data:image\/jpeg;/)
  })

  it('refuses a file that is not an image', async () => {
    installBrowser({ width: 800, height: 600, encodable: ['image/webp'] })
    await expect(prepareFeedbackScreenshot(new File(['x'], 'notes.txt', { type: 'text/plain' }))).rejects.toThrow('Attach an image')
  })
})
