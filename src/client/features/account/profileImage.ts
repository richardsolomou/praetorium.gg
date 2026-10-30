import { PROFILE_IMAGE_MAX_LENGTH } from '../../../authConfig'
import { shrinkImage } from '../../imageFile'

const INPUT_MAX_BYTES = 10_000_000
/** The stored limit is on the data URL, and base64 spends four characters on every three bytes. */
const PROFILE_IMAGE_MAX_BYTES = Math.floor((PROFILE_IMAGE_MAX_LENGTH - 'data:image/jpeg;base64,'.length) / 4) * 3

export async function prepareProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > INPUT_MAX_BYTES) throw new Error('Choose an image smaller than 10 MB.')
  // JPEG at 280 pixels or more, because the screening model reads only JPEG and PNG of at least that size.
  return shrinkImage(file, {
    edges: [320, 288],
    qualities: [0.86, 0.7, 0.55],
    maxBytes: PROFILE_IMAGE_MAX_BYTES,
    noun: 'profile picture',
    jpeg: true,
    square: true,
  })
}
