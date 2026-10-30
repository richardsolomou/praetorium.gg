import { describe, expect, it, vi } from 'vitest'
import { profileUpdate } from './profile'

const STORED_URL = 'https://s3.praetorium.gg/praetorium/avatars/stored.webp'

const { storeProfileImage } = vi.hoisted(() => ({
  storeProfileImage: vi.fn(async (dataUrl: string) => {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) throw new Error('Choose a JPEG, PNG or WebP profile picture.')
    return STORED_URL
  }),
}))

vi.mock('./avatarStorage', () => ({
  storeProfileImage,
  isStoredProfileImageUrl: (url: string) => url === STORED_URL,
}))

describe('profileUpdate', () => {
  it('trims the display name', async () => {
    expect(await profileUpdate({ name: '  Alice  ' })).toEqual({ ok: true, data: { name: 'Alice' } })
  })

  it('rejects an empty display name', async () => {
    expect(await profileUpdate({ name: '   ' })).toEqual({ ok: false, error: 'Enter a display name.' })
  })

  it('accepts a name change that leaves the picture undefined', async () => {
    expect(await profileUpdate({ name: 'Alice', image: undefined })).toEqual({ ok: true, data: { name: 'Alice', image: undefined } })
  })

  it('stores a raster image and keeps only its URL', async () => {
    expect(await profileUpdate({ image: 'data:image/webp;base64,YXZhdGFy' })).toEqual({
      ok: true,
      data: { image: STORED_URL },
      uploaded: 'data:image/webp;base64,YXZhdGFy',
    })
  })

  it('passes an unchanged, already-stored URL through without storing it again', async () => {
    storeProfileImage.mockClear()
    expect(await profileUpdate({ image: STORED_URL })).toEqual({ ok: true, data: { image: STORED_URL } })
    expect(storeProfileImage).not.toHaveBeenCalled()
  })

  it('rejects an arbitrary URL that never went through an upload', async () => {
    expect(await profileUpdate({ image: 'https://evil.example/tracker.png' })).toEqual({
      ok: false,
      error: 'Choose a JPEG, PNG or WebP profile picture.',
    })
  })

  it('rejects an image that is not a string', async () => {
    expect(await profileUpdate({ image: 42 })).toEqual({
      ok: false,
      error: 'Choose a JPEG, PNG or WebP profile picture.',
    })
  })

  it('leaves a cleared image alone', async () => {
    expect(await profileUpdate({ image: null })).toEqual({ ok: true, data: { image: null } })
  })
})
