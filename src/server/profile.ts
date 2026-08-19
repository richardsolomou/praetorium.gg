import { PROFILE_IMAGE_MAX_LENGTH, PROFILE_NAME_MAX_LENGTH } from '../authConfig'

type ProfileUpdate = Record<string, unknown>

type ProfileUpdateResult = { ok: true; data: ProfileUpdate } | { ok: false; error: string }

const PROFILE_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export function profileUpdate(input: ProfileUpdate): ProfileUpdateResult {
  const data = { ...input }

  if ('name' in data) {
    if (typeof data.name !== 'string') return { ok: false, error: 'Enter a display name.' }
    const name = data.name.trim()
    data.name = name
    if (!name) return { ok: false, error: 'Enter a display name.' }
    if (name.length > PROFILE_NAME_MAX_LENGTH) {
      return { ok: false, error: `Keep your display name under ${PROFILE_NAME_MAX_LENGTH} characters.` }
    }
  }

  if ('image' in data && data.image !== null) {
    if (typeof data.image !== 'string' || data.image.length > PROFILE_IMAGE_MAX_LENGTH || !PROFILE_IMAGE.test(data.image)) {
      return { ok: false, error: 'Choose a JPEG, PNG or WebP profile picture.' }
    }
  }

  return { ok: true, data }
}
