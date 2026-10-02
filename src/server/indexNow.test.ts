import { afterEach, expect, it, vi } from 'vitest'
import { indexNowKey, indexNowKeyResponse, sitemapChanges } from './indexNow'

const sitemap = (...urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`

afterEach(() => vi.unstubAllEnvs())

it('submits a page the sitemap gained', () => {
  expect(
    sitemapChanges(
      sitemap('<url><loc>https://praetorium.gg/a</loc></url>'),
      sitemap('<url><loc>https://praetorium.gg/a</loc></url>', '<url><loc>https://praetorium.gg/b</loc></url>'),
    ),
  ).toEqual(['https://praetorium.gg/b'])
})

it('submits a page dated afresh', () => {
  expect(
    sitemapChanges(
      sitemap('<url><loc>https://praetorium.gg/a</loc><lastmod>2026-09-01T00:00:00.000Z</lastmod></url>'),
      sitemap('<url><loc>https://praetorium.gg/a</loc><lastmod>2026-09-05T00:00:00.000Z</lastmod></url>'),
    ),
  ).toEqual(['https://praetorium.gg/a'])
})

it('submits nothing for an unchanged sitemap', () => {
  const same = sitemap('<url><loc>https://praetorium.gg/a</loc><lastmod>2026-09-01T00:00:00.000Z</lastmod></url>')
  expect(sitemapChanges(same, same)).toEqual([])
})

it('submits the address a sitemap escapes, unescaped', () => {
  expect(sitemapChanges(sitemap(), sitemap('<url><loc>https://praetorium.gg/a?b=1&amp;c=2</loc></url>'))).toEqual([
    'https://praetorium.gg/a?b=1&c=2',
  ])
})

it('refuses a key the protocol does not accept', () => {
  expect(indexNowKey('short')).toBeNull()
})

it('accepts a key of letters, digits and dashes', () => {
  expect(indexNowKey(' 0123abcd-EF ')).toBe('0123abcd-EF')
})

it('serves the configured key', async () => {
  vi.stubEnv('INDEXNOW_KEY', '0123456789abcdef')
  expect(await indexNowKeyResponse().text()).toBe('0123456789abcdef')
})

it('serves no key file while IndexNow is off', () => {
  vi.stubEnv('INDEXNOW_KEY', '')
  expect(indexNowKeyResponse().status).toBe(404)
})
