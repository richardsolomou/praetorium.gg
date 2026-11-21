import { createHash } from 'node:crypto'

/** A ustar archive of `entries`, each a name, its contents, and its type flag. */
export function ustar(entries: [string, string, string?][]) {
  const blocks = entries.flatMap(([name, text, type = '0']) => {
    const body = new TextEncoder().encode(text)
    const header = new Uint8Array(512)
    const put = (at: number, value: string) => header.set(new TextEncoder().encode(value), at)
    put(0, name)
    put(124, `${body.length.toString(8).padStart(11, '0')}\0`)
    put(156, type)
    put(257, 'ustar\0')
    const padded = new Uint8Array(Math.ceil(body.length / 512) * 512)
    padded.set(body)
    return [header, padded]
  })
  const archive = new Uint8Array([...blocks.flatMap((block) => [...block]), ...new Uint8Array(1024)])
  return { archive, revision: createHash('sha256').update(archive).digest('hex') }
}
