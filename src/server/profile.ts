import { PROFILE_NAME_MAX_LENGTH } from '../authConfig'
import { isStoredProfileImageUrl, storeProfileImage } from './avatarStorage'

type ProfileUpdate = Record<string, unknown>

type ProfileUpdateResult = { ok: true; data: ProfileUpdate } | { ok: false; error: string }

export async function profileUpdate(input: ProfileUpdate): Promise<ProfileUpdateResult> {
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
    if (typeof data.image !== 'string') return { ok: false, error: 'Choose a JPEG, PNG or WebP profile picture.' }
    // An unmodified save resends the same URL this module handed back last time; only a fresh
    // choice from the file picker arrives as a data URL and needs storing.
    if (!isStoredProfileImageUrl(data.image)) {
      try {
        data.image = await storeProfileImage(data.image)
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Choose a JPEG, PNG or WebP profile picture.' }
      }
    }
  }

  return { ok: true, data }
}
