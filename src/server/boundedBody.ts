import { Transform } from 'node:stream'

/** Reads a request body as text, or returns null once it exceeds `limit` bytes. */
export async function boundedText(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > limit) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
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
