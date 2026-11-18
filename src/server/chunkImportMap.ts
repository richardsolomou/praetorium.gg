import importMap from 'virtual:chunk-import-map'

/**
 * Writes the client build's import map straight after `<head>`. React hoists `modulepreload` links above anything the
 * app renders in the head, and a browser that parses a preloaded chunk before the map resolves its imports without it.
 */
export function withChunkImportMap(response: Response, map = importMap): Response {
  if (!map || !response.body || !response.headers.get('content-type')?.startsWith('text/html')) return response
  const tag = `<script type="importmap">${map}</script>`
  let start = ''
  let written = false
  const inject = new TransformStream<string, string>({
    transform(chunk, controller) {
      if (written) return controller.enqueue(chunk)
      start += chunk
      const head = start.indexOf('<head>') + '<head>'.length
      if (head < '<head>'.length) return
      written = true
      controller.enqueue(start.slice(0, head) + tag + start.slice(head))
    },
    flush(controller) {
      if (!written) controller.enqueue(start)
    },
  })
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(response.body.pipeThrough(new TextDecoderStream()).pipeThrough(inject).pipeThrough(new TextEncoderStream()), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
