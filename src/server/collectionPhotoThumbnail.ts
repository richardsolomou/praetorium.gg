import sharp from 'sharp'

export const collectionPhotoThumbnailKey = (photoId: string) => `collection-photos/${photoId}.thumbnail.webp`

export async function collectionPhotoThumbnail(original: Uint8Array) {
  return sharp(original, { limitInputPixels: 16_777_216 })
    .autoOrient()
    .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer()
}
