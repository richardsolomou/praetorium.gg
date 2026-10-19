import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { submitIndexNow } from './submitIndexNow'

it('retains the released sitemap even when the engine rejects its submission', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'praetorium-indexnow-'))
  const afterFile = path.join(directory, 'sitemap-after.xml')
  const after = '<urlset><url><loc>https://praetorium.gg/new</loc></url></urlset>'
  try {
    const error = await submitIndexNow({
      key: '0123456789abcdef',
      revision: 'released',
      origin: 'https://praetorium.gg',
      before: '<urlset></urlset>',
      afterFile,
      sleep: async () => {},
      request: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : input)
        if (url.pathname === '/api/health') return new Response(null, { headers: { 'x-praetorium-revision': 'released' } })
        if (url.pathname === '/indexnow.txt') return new Response('0123456789abcdef')
        if (url.pathname === '/sitemap.xml') return new Response(after)
        return new Response(null, { status: 403 })
      },
    }).then(
      () => null,
      (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)),
    )
    expect({ error, after: await readFile(afterFile, 'utf8') }).toEqual({ error: 'IndexNow answered 403: ', after })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
