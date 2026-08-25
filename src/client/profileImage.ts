import { PROFILE_IMAGE_MAX_LENGTH } from '../authConfig'

const INPUT_MAX_BYTES = 10_000_000

// Each pass either lowers the encoder quality or shrinks the square edge. A dense photo
// that stays over the length cap at full size still lands under it once the edge drops.
const PASSES = [
  { edge: 256, quality: 0.86 },
  { edge: 256, quality: 0.7 },
  { edge: 224, quality: 0.62 },
  { edge: 192, quality: 0.55 },
]

export async function prepareProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > INPUT_MAX_BYTES) throw new Error('Choose an image smaller than 10 MB.')

  let source: ImageBitmap
  try {
    source = await createImageBitmap(file)
  } catch {
    throw new Error('That image could not be read. Choose a JPEG, PNG or WebP file.')
  }

  const crop = Math.min(source.width, source.height)
  // A browser that cannot encode the requested type returns another type and ignores the
  // quality argument. Safari hands back PNG, so every pass produces the same oversized image.
  // Fall back to JPEG, which every browser encodes and which honours the quality argument.
  let type = 'image/webp'
  try {
    for (const pass of PASSES) {
      let blob = await canvasBlob(render(source, crop, pass.edge), type, pass.quality)
      if (blob.type !== type) {
        type = 'image/jpeg'
        blob = await canvasBlob(render(source, crop, pass.edge), type, pass.quality)
      }
      const image = await dataUrl(blob)
      if (image.length <= PROFILE_IMAGE_MAX_LENGTH) return image
    }
  } finally {
    source.close()
  }
  throw new Error('That image could not be made small enough. Choose a simpler picture.')
}

function render(source: ImageBitmap, crop: number, edge: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = edge
  canvas.height = edge
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the profile picture.')
  context.drawImage(source, (source.width - crop) / 2, (source.height - crop) / 2, crop, crop, 0, 0, edge, edge)
  return canvas
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The profile picture could not be prepared.'))),
      type,
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
