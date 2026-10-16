import { COLLECTION_PHOTO_MAX_BYTES } from '../../../contracts/collection'
import { shrinkImage } from '../../imageFile'

const INPUT_MAX_BYTES = 25_000_000

/** JPEG, because the screening model reads only JPEG and PNG. */
export async function prepareCollectionPhoto(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > INPUT_MAX_BYTES) throw new Error('Choose a photo smaller than 25 MB.')
  return shrinkImage(file, {
    edges: [1280, 1024, 768],
    qualities: [0.82, 0.68],
    maxBytes: COLLECTION_PHOTO_MAX_BYTES,
    noun: 'photo',
    jpeg: true,
  })
}
