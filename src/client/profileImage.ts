import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'

const INPUT_MAX_BYTES = 10_000_000
const PROFILE_IMAGE_SIZE = 256

export async function prepareProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > INPUT_MAX_BYTES) throw new Error('Choose an image smaller than 10 MB.')

  let source: ImageBitmap
  try {
    source = await createImageBitmap(file)
  } catch {
    throw new Error('That image could not be read. Choose a JPEG, PNG or WebP file.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = PROFILE_IMAGE_SIZE
  canvas.height = PROFILE_IMAGE_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the profile picture.')

  const edge = Math.min(source.width, source.height)
  context.drawImage(source, (source.width - edge) / 2, (source.height - edge) / 2, edge, edge, 0, 0, PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE)
  source.close()

  for (const quality of [0.86, 0.7, 0.55]) {
    const blob = await canvasBlob(canvas, quality)
    const image = await dataUrl(blob)
    if (image.length <= PROFILE_IMAGE_MAX_LENGTH) return image
  }
  throw new Error('That image could not be made small enough. Choose a simpler picture.')
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The profile picture could not be prepared.'))),
      'image/webp',
      quality,
    ),
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
