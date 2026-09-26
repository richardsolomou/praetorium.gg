import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types'

const HASH = '[0-9a-f]{64}'
const IMMUTABLE = new RegExp(`^(?:avatars/${HASH}\\.(?:jpg|png|webp)|snapshots/${HASH}\\.zip)$`)
const MUTABLE = new Set(['current.json', 'revocations.json', 'changes/seed.json'])

export async function publicObject(request: Request, bucket: R2Bucket): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const pathname = new URL(request.url).pathname
  if (!pathname.startsWith('/praetorium/')) return new Response(null, { status: 404 })
  const name = pathname.slice('/praetorium/'.length)
  const immutable = IMMUTABLE.test(name)
  if (!immutable && !MUTABLE.has(name)) return new Response(null, { status: 404 })
  const key = `praetorium/${name}`
  const object = request.method === 'HEAD' ? await bucket.head(key) : await bucket.get(key)
  if (!object) return new Response(null, { status: 404 })
  const contentType = name.startsWith('avatars/')
    ? `image/${name.endsWith('.jpg') ? 'jpeg' : name.endsWith('.png') ? 'png' : 'webp'}`
    : name.endsWith('.zip')
      ? 'application/zip'
      : 'application/json'
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Praetorium-Object-Source': 'r2',
    ETag: object.httpEtag,
  })
  if (request.headers.get('if-none-match') === object.httpEtag) return new Response(null, { status: 304, headers })
  return new Response(request.method === 'GET' ? ((object as R2ObjectBody).body as unknown as ReadableStream) : null, { headers })
}
