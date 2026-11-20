import { Transform } from 'node:stream'

/** Counts bytes as they arrive because clients may omit the content length. */
export async function boundedBody(source: Request | Response, limit: number): Promise<Buffer<ArrayBuffer> | null> {
  if (Number(source.headers.get('content-length')) > limit) return null
  const parts: Uint8Array[] = []
  let size = 0
  if (source.body)
    for await (const chunk of source.body) {
      size += chunk.byteLength
      if (size > limit) return null
      parts.push(chunk)
    }
  return Buffer.concat(parts)
}

export async function boundedText(request: Request, limit: number) {
  const bytes = await boundedBody(request, limit)
  return bytes && new TextDecoder().decode(bytes)
}

export async function boundedBytes(response: Response, limit: number, message: string) {
  const bytes = await boundedBody(response, limit)
  if (!bytes) throw new Error(message)
  return bytes
}

export function byteLimit(limit: number, message: string, onChunk?: (chunk: Buffer) => void) {
  let bytes = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length
      if (bytes > limit) return done(new Error(message))
      onChunk?.(chunk)
      done(null, chunk)
    },
  })
}
