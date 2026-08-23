import { describe, expect, it, vi } from 'vitest'
import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'
import { isStoredProfileImageUrl, storeProfileImage } from './avatarStorage'

const PUBLIC_BASE_URL = 'https://s3.praetorium.gg/praetorium'

const { configuredObjectStore, putIfAbsent, s3PublicBaseUrl } = vi.hoisted(() => ({
  configuredObjectStore: vi.fn(),
  putIfAbsent: vi.fn(),
  s3PublicBaseUrl: vi.fn(() => 'https://s3.praetorium.gg/praetorium'),
}))

vi.mock('./objectStorage', () => ({ configuredObjectStore, putIfAbsent, s3PublicBaseUrl }))

const STORE = { bucket: 'praetorium', publicBaseUrl: PUBLIC_BASE_URL, client: {} as never }

describe('storeProfileImage', () => {
  it('rejects a format outside the allowed raster types', async () => {
    configuredObjectStore.mockReturnValue(STORE)
    await expect(storeProfileImage('data:image/svg+xml;base64,PHN2Zy8+')).rejects.toThrow('Choose a JPEG, PNG or WebP profile picture.')
    expect(putIfAbsent).not.toHaveBeenCalled()
  })

  it('rejects a payload over the configured length before touching storage', async () => {
    configuredObjectStore.mockReturnValue(STORE)
    await expect(storeProfileImage(`data:image/png;base64,${'a'.repeat(PROFILE_IMAGE_MAX_LENGTH)}`)).rejects.toThrow(
      'Choose a JPEG, PNG or WebP profile picture.',
    )
    expect(configuredObjectStore).not.toHaveBeenCalled()
  })

  it('fails clearly when the instance has no object storage configured', async () => {
    configuredObjectStore.mockReturnValue(null)
    await expect(storeProfileImage('data:image/webp;base64,YXZhdGFy')).rejects.toThrow(
      'This instance is not set up to store profile pictures.',
    )
  })

  it('uploads under a content-addressed key and returns its public URL', async () => {
    configuredObjectStore.mockReturnValue(STORE)
    const url = await storeProfileImage('data:image/webp;base64,YXZhdGFy')
    expect(url).toMatch(/^https:\/\/s3\.praetorium\.gg\/praetorium\/avatars\/[0-9a-f]{64}\.webp$/)
    expect(putIfAbsent).toHaveBeenCalledWith(STORE, expect.stringContaining('avatars/'), Buffer.from('YXZhdGFy', 'base64'), 'image/webp')
  })

  it('gives identical bytes the same key every time', async () => {
    configuredObjectStore.mockReturnValue(STORE)
    const first = await storeProfileImage('data:image/webp;base64,YXZhdGFy')
    const second = await storeProfileImage('data:image/webp;base64,YXZhdGFy')
    expect(first).toBe(second)
  })
})

describe('isStoredProfileImageUrl', () => {
  it('accepts a URL this module could have produced', () => {
    expect(isStoredProfileImageUrl(`${PUBLIC_BASE_URL}/avatars/${'a'.repeat(64)}.webp`)).toBe(true)
  })

  it('rejects a data URL, which is a fresh upload rather than something already stored', () => {
    expect(isStoredProfileImageUrl('data:image/webp;base64,YXZhdGFy')).toBe(false)
  })

  it('rejects a URL under a different origin, however plausible its path looks', () => {
    expect(isStoredProfileImageUrl(`https://evil.example/avatars/${'a'.repeat(64)}.webp`)).toBe(false)
  })

  it('rejects a same-origin URL whose key is not a content hash', () => {
    expect(isStoredProfileImageUrl(`${PUBLIC_BASE_URL}/avatars/not-a-hash.webp`)).toBe(false)
  })
})
