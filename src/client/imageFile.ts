export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be prepared.'))), type, quality),
  )
}

export function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be read.')))
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Downscales and re-encodes an image until it fits `maxBytes`, trying each longest edge at each quality, as WebP unless
 * the browser cannot encode it or JPEG is asked for. `square` centre-crops instead, to exactly each edge, scaling up a
 * smaller image. Re-encoding also drops any metadata the original carried, such as where a photo was taken.
 */
export async function shrinkImage(
  file: Blob,
  {
    edges,
    qualities,
    maxBytes,
    noun,
    jpeg = false,
    square = false,
  }: { edges: readonly number[]; qualities: readonly number[]; maxBytes: number; noun: string; jpeg?: boolean; square?: boolean },
): Promise<string> {
  let source: ImageBitmap
  try {
    source = await createImageBitmap(file)
  } catch {
    throw new Error(`That image could not be read. Attach a PNG, JPEG or WebP ${noun}.`)
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error(`This browser cannot prepare the ${noun}.`)

    let type = jpeg ? 'image/jpeg' : 'image/webp'
    const crop = Math.min(source.width, source.height)
    for (const edge of edges) {
      if (square) {
        canvas.width = edge
        canvas.height = edge
        context.drawImage(source, (source.width - crop) / 2, (source.height - crop) / 2, crop, crop, 0, 0, edge, edge)
      } else {
        const scale = Math.min(1, edge / Math.max(source.width, source.height))
        canvas.width = Math.max(1, Math.round(source.width * scale))
        canvas.height = Math.max(1, Math.round(source.height * scale))
        context.drawImage(source, 0, 0, canvas.width, canvas.height)
      }
      for (const quality of qualities) {
        let blob = await canvasBlob(canvas, type, quality)
        if (type === 'image/webp' && blob.type !== type) {
          type = 'image/jpeg'
          blob = await canvasBlob(canvas, type, quality)
        }
        if (blob.size <= maxBytes) return await dataUrl(blob)
      }
    }
    throw new Error(`That ${noun} could not be made small enough.`)
  } finally {
    source.close()
  }
}
