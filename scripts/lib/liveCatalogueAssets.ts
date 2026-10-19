import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { liveCatalogueRevision } from '../../src/server/liveCatalogue.ts'

export function serveLiveCatalogueAsset(request: IncomingMessage, response: ServerResponse, root: string) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  const manifest = pathname === '/offline-reference-version.json'
  const asset = /^\/catalogue-assets\/([a-f0-9]{64})\/((?:reference|construction)-[a-f0-9]{64}\.bin)$/.exec(pathname)
  if (!manifest && !pathname.startsWith('/catalogue-assets/')) return false
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' }).end()
    return true
  }
  const active = manifest ? liveCatalogueRevision(root) : null
  const file = active
    ? path.join(active.directory, 'public/offline-reference-version.json')
    : asset
      ? path.join(path.dirname(root), asset[1]!, 'assets', asset[2]!)
      : null
  const size = file && fs.statSync(file, { throwIfNoEntry: false })?.size
  if (!file || !size) {
    response.writeHead(404, { 'cache-control': 'no-store' }).end()
    return true
  }
  response.writeHead(200, {
    'content-type': manifest ? 'application/json' : 'application/octet-stream',
    'content-length': size,
    'cache-control': manifest ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  if (request.method === 'HEAD') response.end()
  else
    fs.createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response)
  return true
}
