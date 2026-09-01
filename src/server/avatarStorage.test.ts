import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'
import { isStoredProfileImageUrl, storeProfileImage, storeProfileImageFromUrl } from './avatarStorage'

const PUBLIC_BASE_URL = 'https://s3.praetorium.gg/praetorium'

const { configuredObjectStore, putIfAbsent, s3PublicBaseUrl } = vi.hoisted(() => ({
  configuredObjectStore: vi.fn(),
  putIfAbsent: vi.fn(),
  s3PublicBaseUrl: vi.fn(() => 'https://s3.praetorium.gg/praetorium'),
}))

vi.mock('./objectStorage', () => ({ configuredObjectStore, putIfAbsent, s3PublicBaseUrl }))

const STORE = { bucket: 'praetorium', publicBaseUrl: PUBLIC_BASE_URL, client: {} as never }

afterEach(() => vi.clearAllMocks())

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
    await expect(storeProfileImage('data:image/webp;base64,YXZhdGFy')).rejects.toThrow('Profile picture uploads are not available.')
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

describe('storeProfileImageFromUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns null when the instance has no object storage configured, without fetching', async () => {
    configuredObjectStore.mockReturnValue(null)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await storeProfileImageFromUrl('https://provider.example/avatar.png')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('downloads and uploads under a content-addressed key', async () => {
    configuredObjectStore.mockReturnValue(STORE)
    const bytes = Buffer.from('provider-avatar-bytes')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })),
    )
    const url = await storeProfileImageFromUrl('https://provider.example/avatar.png')
    expect(url).toMatch(/^https:\/\/s3\.praetorium\.gg\/praetorium\/avatars\/[0-9a-f]{64}\.png$/)
    expect(putIfAbsent).toHaveBeenCalledWith(STORE, expect.stringContaining('avatars/'), bytes, 'image/png')
  })

  it('returns null for a fetch that fails outright', async () => {
    configuredObjectStore.mockReturnValue(STORE)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error')
      }),
    )
    expect(await storeProfileImageFromUrl('https://provider.example/avatar.png')).toBeNull()
    expect(putIfAbsent).not.toHaveBeenCalled()
  })

  it('returns null for a non-OK response', async () => {
    configuredObjectStore.mockReturnValue(STORE)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    )
    expect(await storeProfileImageFromUrl('https://provider.example/avatar.png')).toBeNull()
  })

  it('returns null for a content type outside the allowed raster types', async () => {
    configuredObjectStore.mockReturnValue(STORE)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.from('<svg/>'), { status: 200, headers: { 'content-type': 'image/svg+xml' } })),
    )
    expect(await storeProfileImageFromUrl('https://provider.example/avatar.svg')).toBeNull()
    expect(putIfAbsent).not.toHaveBeenCalled()
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
