import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'

const INPUT_MAX_BYTES = 10_000_000
const PROFILE_IMAGE_SIZES = [256, 192, 128]
const PROFILE_IMAGE_QUALITIES = [0.86, 0.7, 0.55]

export async function prepareProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > INPUT_MAX_BYTES) throw new Error('Choose an image smaller than 10 MB.')

  let source: ImageBitmap
  try {
    source = await createImageBitmap(file)
  } catch {
    throw new Error('That image could not be read. Choose a JPEG, PNG or WebP file.')
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot prepare the profile picture.')

    const edge = Math.min(source.width, source.height)
    let type = 'image/webp'
    for (const size of PROFILE_IMAGE_SIZES) {
      canvas.width = size
      canvas.height = size
      context.drawImage(source, (source.width - edge) / 2, (source.height - edge) / 2, edge, edge, 0, 0, size, size)
      for (const quality of PROFILE_IMAGE_QUALITIES) {
        let blob = await canvasBlob(canvas, type, quality)
        if (type === 'image/webp' && blob.type !== type) {
          type = 'image/jpeg'
          blob = await canvasBlob(canvas, type, quality)
        }
        const image = await dataUrl(blob)
        if (image.length <= PROFILE_IMAGE_MAX_LENGTH) return image
      }
    }
    throw new Error('That image could not be made small enough. Choose a simpler picture.')
  } finally {
    source.close()
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The profile picture could not be prepared.'))), type, quality),
  )
}

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The profile picture could not be read.'))
    reader.onerror = () => reject(new Error('The profile picture could not be read.'))
    reader.readAsDataURL(blob)
  })
}
