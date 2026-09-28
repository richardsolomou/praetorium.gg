type PublicObjectBucket = {
  head: (key: string) => Promise<{ httpEtag: string } | null>
  get: (key: string) => Promise<{ httpEtag: string } | null>
}

const HASH = '[0-9a-f]{64}'
const IMMUTABLE = new RegExp(`^(?:avatars/${HASH}\\.(?:jpg|png|webp)|catalogue/snapshots/${HASH}\\.zip)$`)
const MUTABLE = new Set(['catalogue/current.json', 'catalogue/revocations.json', 'catalogue/changes/seed.json'])

export async function localPublicObject(request: Request, bucket: PublicObjectBucket): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const pathname = new URL(request.url).pathname
  const key = pathname.startsWith('/praetorium/avatars/')
    ? pathname.slice('/praetorium/'.length)
    : pathname.startsWith('/praetorium/')
      ? `catalogue/${pathname.slice('/praetorium/'.length)}`
      : pathname.slice(1)
  const immutable = IMMUTABLE.test(key)
  if (!immutable && !MUTABLE.has(key)) return new Response(null, { status: 404 })
  const object = request.method === 'HEAD' ? await bucket.head(key) : await bucket.get(key)
  if (!object) return new Response(null, { status: 404 })
  const contentType = key.startsWith('avatars/')
    ? `image/${key.endsWith('.jpg') ? 'jpeg' : key.endsWith('.png') ? 'png' : 'webp'}`
    : key.endsWith('.zip')
      ? 'application/zip'
      : 'application/json'
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Praetorium-Object-Source': 'local',
    ETag: object.httpEtag,
  })
  if (request.headers.get('if-none-match') === object.httpEtag) return new Response(null, { status: 304, headers })
  return new Response(request.method === 'GET' && 'body' in object ? (object.body as ReadableStream) : null, { headers })
}
