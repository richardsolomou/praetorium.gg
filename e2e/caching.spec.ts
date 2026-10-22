import { expect, test } from './test'

for (const file of ['logo.svg', 'favicon.svg']) {
  test(`revalidates the cached ${file}`, async ({ request }) => {
    const response = await request.get(`/${file}`)
    expect([response.status(), response.headers()['cache-control']]).toEqual([200, 'public, max-age=86400'])
    const revalidated = await request.get(`/${file}`, { headers: { 'If-None-Match': response.headers()['etag'] } })
    expect([revalidated.status(), revalidated.headers()['cache-control'], await revalidated.body()]).toEqual([
      304,
      'public, max-age=86400',
      Buffer.alloc(0),
    ])
  })
}

test('keeps the reference API representations separate', async ({ request }) => {
  const json = await request.get('/api/reference/v1/factions')
  const markdown = await request.get('/api/reference/v1/factions', { headers: { Accept: 'text/markdown' } })
  const jsonAgain = await request.get('/api/reference/v1/factions')
  expect([json.headers()['content-type'], markdown.headers()['content-type'], jsonAgain.headers()['content-type']]).toEqual([
    'application/json',
    'text/markdown; charset=utf-8',
    'application/json',
  ])
  expect([json.headers()['vary'], markdown.headers()['vary'], jsonAgain.headers()['vary']]).toEqual(['Accept', 'Accept', 'Accept'])
})
