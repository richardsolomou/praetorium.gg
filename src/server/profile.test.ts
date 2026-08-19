import { describe, expect, it } from 'vitest'
import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'
import { profileUpdate } from './profile'

describe('profileUpdate', () => {
  it('trims the display name', () => {
    expect(profileUpdate({ name: '  Alice  ' })).toEqual({ ok: true, data: { name: 'Alice' } })
  })

  it('rejects an empty display name', () => {
    expect(profileUpdate({ name: '   ' })).toEqual({ ok: false, error: 'Enter a display name.' })
  })

  it('accepts a bounded raster image', () => {
    expect(profileUpdate({ image: 'data:image/webp;base64,YXZhdGFy' })).toEqual({
      ok: true,
      data: { image: 'data:image/webp;base64,YXZhdGFy' },
    })
  })

  it('rejects an active image format', () => {
    expect(profileUpdate({ image: 'data:image/svg+xml;base64,PHN2Zy8+' })).toEqual({
      ok: false,
      error: 'Choose a JPEG, PNG or WebP profile picture.',
    })
  })

  it('rejects an oversized profile picture', () => {
    expect(profileUpdate({ image: `data:image/png;base64,${'a'.repeat(PROFILE_IMAGE_MAX_LENGTH)}` })).toEqual({
      ok: false,
      error: 'Choose a JPEG, PNG or WebP profile picture.',
    })
  })
})
