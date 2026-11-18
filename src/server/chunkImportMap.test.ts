import { expect, it } from 'vitest'
import { withChunkImportMap } from './chunkImportMap'

const MAP = '{"imports":{"/assets/a-stable.js":"/assets/a-real.js"}}'

function page(chunks: string[], type = 'text/html; charset=utf-8') {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'content-type': type } })
}

it('writes the import map first in a head split across chunks', async () => {
  const response = withChunkImportMap(page(['<!DOCTYPE html><html><he', 'ad><link rel="modulepreload" href="/assets/a-real.js"/>']), MAP)
  expect(await response.text()).toBe(
    `<!DOCTYPE html><html><head><script type="importmap">${MAP}</script><link rel="modulepreload" href="/assets/a-real.js"/>`,
  )
})

it('leaves responses other than pages unchanged', async () => {
  expect(await withChunkImportMap(page(['{"head":"<head>"}'], 'application/json'), MAP).text()).toBe('{"head":"<head>"}')
})
